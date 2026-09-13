import {joinRoom, selfId, getRelaySockets} from './signaling.ts';
import type {Room, MessageAction} from '@trystero-p2p/core';
import {Admission, MAX_PLAYERS, PROTOCOL, cleanName, record, validPosition, validRoster} from './protocol.ts';
import type {Invitation, Player, Position} from './protocol.ts';

export const RELAYS = ['wss://public:public@public.cloud.shiftr.io', 'wss://broker.emqx.io:8084/mqtt'];
export const ICE_SERVERS: RTCIceServer[] = [
  {urls: 'stun:stun.cloudflare.com:3478'},
  {urls: 'stun:global.stun.twilio.com:3478'},
  {urls: 'stun:stun.l.google.com:19302'},
];
export type Phase = 'starting' | 'waiting' | 'joining' | 'connected' | 'reconnecting' | 'full' | 'ended' | 'error';
export type RoomOptions = {capacity?: number; appId?: string; initial?: Position; spawn?: (slot: number) => Position; onSpawn?: (position: Position) => void};
type Snapshot = {v: number; tick: number; players: Player[]};
export class WalkRoom {
  readonly id = selfId;
  readonly host: boolean;
  readonly players = new Map<string, Player>();
  phase: Phase;
  detail = '';
  sent = 0;
  received = 0;
  readonly started = Date.now();
  readonly events: {at: number; event: string}[] = [];
  readonly iceTypes: Record<string, number> = {};
  readonly iceErrors: {url: string; code: number}[] = [];
  private room: Room;
  private admission: Admission;
  readonly capacity: number;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private names = new Map<string, string>();
  private identities = new Map<string, string>();
  private sessions = new Map<string, string>();
  private lastIncoming = new Map<string, number>();
  private inFlight = new Set<string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private stopped = false;
  private closeTask: Promise<void> | null = null;
  private attemptAt = performance.now();
  private lastHostMessage = performance.now();
  private lastSnapshot = -1;
  private tick = 0;
  private local: Player;
  private moves: MessageAction<Position>;
  private snapshots: MessageAction<Snapshot>;
  private bye: MessageAction<{v: number}>;

  constructor(readonly invite: Invitation, host: boolean, name: string, private options: RoomOptions = {}) {
    this.capacity = options.capacity ?? MAX_PLAYERS;
    this.admission = new Admission(this.capacity);
    this.host = host;
    this.phase = host ? 'starting' : 'joining';
    this.local = {id: selfId, name: cleanName(name), slot: 0, x: .5, y: .5, seq: 0, ...options.initial};
    let session = crypto.randomUUID();
    try {
      const saved = sessionStorage.getItem('drevlepuscha-network-session');
      if (saved && /^[a-zA-Z0-9-]{36}$/.test(saved)) session = saved as `${string}-${string}-${string}-${string}-${string}`;
      sessionStorage.setItem('drevlepuscha-network-session', session);
    } catch { /* Without storage, reconnect uses a fresh guest slot. */ }
    if (host) this.players.set(selfId, {...this.local});
    const owner = this;
    class ObservedRTC extends RTCPeerConnection {
      constructor(config?: RTCConfiguration) {
        super(config);
        this.addEventListener('icecandidate', event => {
          if (event.candidate?.type) owner.iceTypes[event.candidate.type] = (owner.iceTypes[event.candidate.type] ?? 0) + 1;
        });
        this.addEventListener('icecandidateerror', event => {
          if (owner.iceErrors.length < 20 && !owner.iceErrors.some(e => e.url === event.url && e.code === event.errorCode)) owner.iceErrors.push({url: event.url, code: event.errorCode});
        });
      }
    }
    this.room = joinRoom({
      appId: options.appId ?? 'drevlepuscha-walk-probe-v2', password: invite.key, passive: !host,
      relayConfig: {urls: RELAYS}, rtcConfig: {iceServers: ICE_SERVERS}, rtcPolyfill: ObservedRTC,
    }, invite.room, {
      handshakeTimeoutMs: 10000,
      onPeerHandshake: async (peerId, send, receive) => {
        if (this.stopped) throw Error('closed');
        await send({v: PROTOCOL, host, hostId: invite.host, name: this.local.name, session, capacity: this.capacity});
        const {data} = await receive();
        if (!record(data) || data.v !== PROTOCOL || data.capacity !== this.capacity || data.hostId !== invite.host || data.host !== !host
          || typeof data.session !== 'string' || !/^[a-zA-Z0-9-]{36}$/.test(data.session)
          || (!host && peerId !== invite.host)) throw Error('incompatible-room');
        if (host) {
          // A page reload changes Trystero's peer ID. Reclaim the same tab's slot
          // without waiting for the old WebRTC connection's disconnect timeout.
          const previousPeer = this.identities.get(data.session);
          if (previousPeer && previousPeer !== peerId) {
            this.room.getPeers()[previousPeer]?.close();
            this.players.delete(previousPeer); this.release(previousPeer);
          }
          const slot = this.admission.reserve(peerId);
          if (slot === null) {await send({ok: false, reason: 'full'}); throw Error('full');}
          this.identities.set(data.session, peerId); this.sessions.set(peerId, data.session);
          this.names.set(peerId, cleanName(data.name));
          this.pending.set(peerId, setTimeout(() => this.release(peerId), 12000));
          const spawn = options.spawn?.(slot);
          await send({ok: true, slot, ...(spawn ? {spawn} : {})});
        } else {
          const {data: answer} = await receive();
          if (!record(answer) || answer.ok !== true) {
            this.setPhase('full', `В комнате уже ${this.capacity} участников. Можно попробовать позже.`);
            // Leave after the current handshake finishes rejecting.
            setTimeout(() => this.stop(), 0);
            throw Error('full');
          }
          if (!Number.isInteger(answer.slot) || Number(answer.slot) < 1 || Number(answer.slot) >= this.capacity) throw Error('invalid-slot');
          this.local.slot = Number(answer.slot);
          this.local.x = .5 + (this.local.slot - 2) * .1; this.local.y = .6;
          if (answer.spawn !== undefined) {
            if (!validPosition(answer.spawn)) throw Error('invalid-spawn');
            this.local = {...this.local, ...answer.spawn, seq: 0}; options.onSpawn?.(answer.spawn);
          }
          this.lastSnapshot = -1;
        }
      },
      onJoinError: ({peerId, error}) => {
        if (host && !this.players.has(peerId)) this.release(peerId);
        this.log('handshake-failed');
        console.warn('Network room handshake:', error);
        if (!host && !this.stopped && this.phase !== 'full' && this.phase !== 'connected') {
          this.detail = 'Не удалось установить связь с ведущим. Оставьте обе вкладки открытыми или повторите подключение.';
        }
      },
    });
    this.moves = this.room.makeAction<Position>('move');
    this.snapshots = this.room.makeAction<Snapshot>('state');
    this.bye = this.room.makeAction<{v: number}>('bye');
    this.moves.onMessage = (move, {peerId}) => {
      const p = this.players.get(peerId), now = performance.now();
      if (!host || !p || !validPosition(move) || move.seq <= p.seq || now - (this.lastIncoming.get(peerId) ?? 0) < 30) return;
      this.lastIncoming.set(peerId, now);
      this.players.set(peerId, {...p, x: move.x, y: move.y, seq: move.seq, heading: move.heading, speed: move.speed, running: move.running}); this.received++;
    };
    this.snapshots.onMessage = (value, {peerId}) => {
      if (host || peerId !== invite.host || !record(value) || value.v !== PROTOCOL || !Number.isSafeInteger(value.tick)
        || value.tick <= this.lastSnapshot || !validRoster(value.players, this.capacity) || !value.players.some(p => p.id === selfId)) return;
      this.lastSnapshot = value.tick; this.lastHostMessage = performance.now(); this.received++;
      this.players.clear();
      for (const p of value.players) this.players.set(p.id, p.id === selfId ? {...this.local} : {...p});
      this.setPhase('connected');
    };
    this.bye.onMessage = (_, {peerId}) => {
      if (!host && peerId === invite.host) {this.setPhase('ended', 'Ведущий завершил прогулку. Создайте новую комнату.'); this.stop();}
    };
    this.room.onPeerJoin = peerId => {
      if (this.stopped) return;
      if (host) {
        const slot = this.admission.get(peerId);
        if (slot === undefined) return;
        clearTimeout(this.pending.get(peerId)); this.pending.delete(peerId);
        this.players.set(peerId, {id: peerId, name: this.names.get(peerId) ?? 'Путник', slot, x: .5 + (slot - 2) * .1, y: .6, seq: -1});
        this.setPhase('connected');
      } else {this.lastHostMessage = performance.now(); this.detail = 'Соединение установлено, получаем комнату…';}
      this.log('peer-connected');
    };
    this.room.onPeerLeave = peerId => {
      this.log('peer-left'); this.inFlight.delete(peerId);
      if (host) {this.players.delete(peerId); this.release(peerId); this.setPhase(this.players.size > 1 ? 'connected' : 'waiting');}
      else if (!this.stopped && peerId === invite.host) {
        this.players.clear(); this.attemptAt = performance.now(); this.lastSnapshot = -1;
        this.setPhase('reconnecting', 'Связь с ведущим потеряна. Пробуем восстановить…');
      }
    };
    this.timers.push(setInterval(() => this.sendState(), 1000 / 15));
    this.timers.push(setInterval(() => this.checkConnection(), 500));
    this.log(host ? 'room-created' : 'room-joining');
  }
  static create(name: string, options: RoomOptions = {}) {
    return new WalkRoom({room: crypto.randomUUID(), host: selfId, key: crypto.randomUUID()}, true, name, options);
  }
  get localPlayer() {return {...this.local};}
  move(x: number, y: number, pose: Pick<Position, 'heading' | 'speed' | 'running'> = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.local = {...this.local, ...pose, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), seq: this.local.seq + 1};
    if (this.players.has(selfId)) this.players.set(selfId, {...this.local});
  }
  private release(id: string) {
    clearTimeout(this.pending.get(id)); this.pending.delete(id); this.admission.release(id);
    this.names.delete(id); this.lastIncoming.delete(id);
    const session = this.sessions.get(id);
    if (session && this.identities.get(session) === id) this.identities.delete(session);
    this.sessions.delete(id);
  }
  private log(event: string) {this.events.push({at: Date.now(), event}); if (this.events.length > 40) this.events.shift();}
  private setPhase(phase: Phase, detail = '') {
    if (this.stopped) return;
    if (phase !== this.phase) this.log(phase);
    this.phase = phase; this.detail = detail;
  }
  private sendState() {
    if (this.stopped) return;
    if (this.host) {
      const players = [...this.players.values()].map(p => ({...p, seq: Math.max(0, p.seq)}));
      const payload = {v: PROTOCOL, tick: ++this.tick, players};
      for (const id of Object.keys(this.room.getPeers())) {
        if (this.players.has(id)) this.sendOne(id, () => this.snapshots.send(payload, {target: id}));
      }
    } else if (this.room.getPeers()[this.invite.host]) {
      const {x, y, seq, heading, speed, running} = this.local;
      this.sendOne(this.invite.host, () => this.moves.send({x, y, seq, heading, speed, running}, {target: this.invite.host}));
    }
  }
  private sendOne(id: string, send: () => Promise<void>) {
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);
    void send().then(() => this.sent++).catch(() => this.log('send-failed')).finally(() => this.inFlight.delete(id));
  }
  relayStatus(): {name: string; connected: boolean}[] {
    return Object.entries(getRelaySockets() as Record<string, WebSocket>).map(([url, socket]) => ({name: new URL(url).hostname, connected: socket.readyState === WebSocket.OPEN}));
  }
  private checkConnection() {
    if (this.stopped) return;
    const now = performance.now(), relayReady = this.relayStatus().some(s => s.connected);
    if (this.host && this.players.size === 1) {
      if (relayReady) this.setPhase('waiting');
      else if (now - this.attemptAt > 15000) this.setPhase('error', 'Сервисы подключения не ответили. Проверьте интернет и повторите.');
    }
    if (!this.host) {
      if (this.phase === 'connected' && now - this.lastHostMessage > 6000) {
        this.attemptAt = now; this.setPhase('reconnecting', 'Нет обновлений от ведущего. Проверьте, что его вкладка открыта.');
      }
      if ((this.phase === 'joining' || this.phase === 'reconnecting') && now - this.attemptAt > 40000) {
        this.setPhase('error', 'Не удалось подключиться. Ведущий должен держать вкладку открытой; этой паре сетей также может требоваться TURN. Сохраните результат проверки.');
      }
    }
  }
  async diagnostics() {
    const connections = await Promise.all(Object.values(this.room.getPeers()).map(async pc => {
      try {
        const stats = await pc.getStats(); let pair: RTCStats | undefined;
        stats.forEach(s => {if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);});
        const data = pair as Record<string, unknown> | undefined;
        const local = data ? stats.get(String(data.localCandidateId)) : undefined;
        const remote = data ? stats.get(String(data.remoteCandidateId)) : undefined;
        return {state: pc.connectionState, ice: pc.iceConnectionState,
          localType: local?.candidateType, remoteType: remote?.candidateType, protocol: local?.protocol,
          route: local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'TURN' : data ? 'direct' : 'unknown',
          rttMs: typeof data?.currentRoundTripTime === 'number' ? Math.round(data.currentRoundTripTime * 1000) : null};
      } catch {return {state: pc.connectionState, route: 'unknown'};}
    }));
    return {version: PROTOCOL, date: new Date().toISOString(), durationSeconds: Math.round((Date.now() - this.started) / 1000),
      role: this.host ? 'host' : 'guest', phase: this.phase, capacity: this.capacity, players: this.players.size, messagesSent: this.sent, messagesReceived: this.received,
      relays: this.relayStatus(), connections, iceTypes: {...this.iceTypes}, iceErrors: [...this.iceErrors], turnConfigured: false,
      events: [...this.events], online: navigator.onLine, visible: !document.hidden};
  }
  async leave() {
    if (this.host && !this.stopped) await Promise.race([this.bye.send({v: PROTOCOL}).catch(() => {}), new Promise(r => setTimeout(r, 200))]);
    this.setPhase('ended', this.host ? 'Комната закрыта.' : 'Вы вышли из комнаты.'); await this.stop();
  }
  private stop() {
    if (this.stopped) return this.closeTask ?? Promise.resolve();
    this.stopped = true; for (const t of this.timers) clearInterval(t);
    for (const t of this.pending.values()) clearTimeout(t);
    this.players.clear(); this.closeTask = this.room.leave().catch(() => {}); return this.closeTask;
  }
}
