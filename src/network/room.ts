import {WildlifeSession} from './wildlife-session.ts';
import type {WildlifeSessionOptions,WildlifeSessionView} from './wildlife-session.ts';
import {wildlifeCapability,sameCapability,wireFrame} from './wildlife-protocol.ts';
import {metricRoster,wildlifeEnvironment} from '../domain/showcase-wildlife-input.ts';
import {validClock} from './persistent-protocol.ts';
import type {ClockSample,WorldClock} from './persistent-protocol.ts';
import type {WildlifeWire} from './wildlife-protocol.ts';
import {joinRoom, selfId, getRelaySockets, getSignalingDiagnostics} from './signaling.ts';
import type {Room, MessageAction} from '@trystero-p2p/core';
import {Admission, MAX_PLAYERS, PROTOCOL, cleanName, record, validPosition, validRoster} from './protocol.ts';
import type {Invitation, Player, Position} from './protocol.ts';

import {RELAYS,ICE_SERVERS} from './transport-config.ts';
export {RELAYS,ICE_SERVERS} from './transport-config.ts';
export type Phase = 'starting' | 'waiting' | 'joining' | 'connected' | 'reconnecting' | 'full' | 'ended' | 'error';
export type RoomOptions = {wildlife?:WildlifeSessionOptions; capacity?: number; appId?: string; initial?: Position; spawn?: (slot: number) => Position; onSpawn?: (position: Position) => void};
type RtcAttempt = {id: number; startedAt: number; state: string; ice: string; gathering: string; localDescription: string; remoteDescription: string; localTypes: Record<string,number>; remoteTypes: Record<string,number>; failed: boolean};
type Snapshot = {v: number; tick: number; players: Player[];wildlife?:WildlifeWire;clock?:ClockSample};
export class WalkRoom {
  readonly id = selfId;
  readonly wildlife?:WildlifeSessionView;
  private fauna?:WildlifeSession;private readyPeers=new Set<string>();private localReady=false;
  private sharedClock:WorldClock|null=null;private clockEpoch=0;private halfRtt=0;private clockNonce=0;private clockPingAt=0;
  private lastClockRequest=new Map<string,number>();
  readonly host: boolean;
  readonly players = new Map<string, Player>();
  phase: Phase;
  detail = '';
  sent = 0;
  received = 0;
  readonly started = Date.now();
  private rtcCreated = 0;
  private rtcAttempts: RtcAttempt[] = [];
  private joinFailures: string[] = [];
  private roomTag: Promise<string>;
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
  private moves: MessageAction<Position & {sceneReady?:boolean}>;
  private snapshots: MessageAction<Snapshot>;
  private bye: MessageAction<{v: number}>;

  constructor(readonly invite: Invitation, host: boolean, name: string, private options: RoomOptions = {}) {
    this.roomTag = crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${options.appId ?? 'probe'}:${invite.room}:${invite.host}`)).then(hash => Array.from(new Uint8Array(hash).slice(0,8), b => b.toString(16).padStart(2,'0')).join(''));
    this.capacity = options.capacity ?? MAX_PLAYERS;
    this.admission = new Admission(this.capacity);
    this.host = host;
    if(options.wildlife){
      this.fauna=new WildlifeSession(options.wildlife,host?'authority':'replica',crypto.randomUUID(),performance.now());this.wildlife=this.fauna.view;
      this.fauna.bindReady(ready=>{this.localReady=ready;if(host){if(ready)this.readyPeers.add(selfId);else this.readyPeers.delete(selfId);}});
      if(host)this.clockEpoch=Math.round(Date.now()-((options.wildlife.gameHours??12)-12)*1200000/24);
    }
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
      private trace: RtcAttempt;
      constructor(config?: RTCConfiguration) {
        super(config);
        const trace: RtcAttempt = {id: ++owner.rtcCreated,startedAt:Date.now(),state:this.connectionState,ice:this.iceConnectionState,gathering:this.iceGatheringState,localDescription:'',remoteDescription:'',localTypes:{},remoteTypes:{},failed:false};
        this.trace=trace;owner.rtcAttempts.push(trace);
        if(owner.rtcAttempts.length>100)owner.rtcAttempts.shift();
        const update=()=>{
          trace.state=this.connectionState;trace.ice=this.iceConnectionState;trace.gathering=this.iceGatheringState;
          trace.failed ||= trace.state==='failed'||trace.ice==='failed';
          if(this.localDescription)trace.localDescription=this.localDescription.type;
          if(this.remoteDescription)trace.remoteDescription=this.remoteDescription.type;
        };
        for(const event of ['connectionstatechange','iceconnectionstatechange','icegatheringstatechange','signalingstatechange'])this.addEventListener(event,update);
        this.addEventListener('icecandidate', event => {
          if (event.candidate?.type) {
            const type=event.candidate.type;owner.iceTypes[type]=(owner.iceTypes[type]??0)+1;trace.localTypes[type]=(trace.localTypes[type]??0)+1;
          }
        });
        this.addEventListener('icecandidateerror', event => {
          if (owner.iceErrors.length < 20 && !owner.iceErrors.some(e => e.url === event.url && e.code === event.errorCode)) owner.iceErrors.push({url: event.url, code: event.errorCode});
        });
      }
      override async addIceCandidate(candidate?: RTCIceCandidateInit | null) {
        await super.addIceCandidate(candidate);
        const type=candidate?.candidate?.match(/ typ (host|srflx|prflx|relay)(?: |$)/)?.[1];
        if(type)this.trace.remoteTypes[type]=(this.trace.remoteTypes[type]??0)+1;
      }
    }
    this.room = joinRoom({
      appId: options.appId ?? 'drevlepuscha-walk-probe-v2', password: invite.key, passive: !host,
      relayConfig: {urls: RELAYS}, rtcConfig: {iceServers: ICE_SERVERS}, rtcPolyfill: ObservedRTC,
    }, invite.room, {
      handshakeTimeoutMs: 10000,
      onPeerHandshake: async (peerId, send, receive) => {
        if (this.stopped) throw Error('closed');
        await send({v: PROTOCOL, host, hostId: invite.host, name: this.local.name, session, capacity: this.capacity, ...(options.wildlife?{capability:wildlifeCapability(options.wildlife.data.identity)}:{})});
        const {data} = await receive();
        if (!record(data) || data.v !== PROTOCOL || data.capacity !== this.capacity || data.hostId !== invite.host || data.host !== !host
          || typeof data.session !== 'string' || !/^[a-zA-Z0-9-]{36}$/.test(data.session)
          || (!host && peerId !== invite.host)) throw Error('incompatible-room');
        if(!sameCapability(data.capability,options.wildlife?.data.identity)){
          if(!host)this.setPhase('error','Версии леса различаются; обновите страницу');throw Error('incompatible-wildlife');
        }
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
          await send({ok: true, slot, ...(spawn ? {spawn} : {}),...(this.fauna?{wildlife:wireFrame(this.wildlife!.latest()),clock:this.sampleClock()}: {})});
        } else {
          const {data: answer} = await receive();
          if (!record(answer) || answer.ok !== true) {
            this.setPhase('full', `В комнате уже ${this.capacity} участников. Можно попробовать позже.`);
            // Leave after the current handshake finishes rejecting.
            setTimeout(() => this.stop(), 0);
            throw Error('full');
          }
          if (!Number.isInteger(answer.slot) || Number(answer.slot) < 1 || Number(answer.slot) >= this.capacity) throw Error('invalid-slot');
          if(answer.spawn!==undefined&&!validPosition(answer.spawn))throw Error('invalid-spawn');
          if(this.fauna){if(!validClock(answer.clock)||!this.fauna.accept(answer.wildlife,performance.now(),true))throw Error('incompatible-wildlife-welcome');this.sharedClock={...answer.clock,receivedAt:performance.now()};}
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
        const failure=error.includes('after exchanging SDP')?'ice-connect-failed':error.includes('password')?'password-rejected':error.includes('incompatible')?'room-mismatch':error.includes('full')?'room-full':'handshake-rejected';
        this.joinFailures.push(failure);if(this.joinFailures.length>20)this.joinFailures.shift();
        console.warn('Network room handshake:', error);
        if (!host && !this.stopped && this.phase !== 'full' && this.phase !== 'connected') {
          this.detail = error.includes('incompatible-wildlife')?'Версии леса различаются; обновите страницу':'Не удалось установить связь с ведущим. Оставьте обе вкладки открытыми или повторите подключение.';
        }
      },
    });
    this.moves = this.room.makeAction<Position & {sceneReady?:boolean}>('move');
    if(this.fauna){
      const clock=this.room.makeAction<{nonce:number;serverMs?:number}>('faunaClock');let lastPing=0;
      clock.onMessage=(value,{peerId})=>{if(!record(value)||!Number.isSafeInteger(value.nonce))return;
       const now=performance.now();
       if(host){if(!this.players.has(peerId)||now-(this.lastClockRequest.get(peerId)??-Infinity)<1000)return;this.lastClockRequest.set(peerId,now);void clock.send({nonce:Number(value.nonce),serverMs:Date.now()},{target:peerId}).catch(()=>{});}
       else if(peerId===invite.host&&value.nonce===this.clockNonce&&Number.isSafeInteger(value.serverMs)){this.halfRtt=Math.min(1000,(now-this.clockPingAt)/2);}
      };
      this.timers.push(setInterval(()=>{if(host||this.stopped||!this.room.getPeers()[invite.host])return;const now=performance.now();if(now-lastPing<5000)return;lastPing=now;this.clockPingAt=now;void clock.send({nonce:++this.clockNonce},{target:invite.host}).catch(()=>{});},1000));
    }
    this.snapshots = this.room.makeAction<Snapshot>('state');
    this.bye = this.room.makeAction<{v: number}>('bye');
    this.moves.onMessage = (move, {peerId}) => {
      const p = this.players.get(peerId), now = performance.now();
      if (!host || !p || !validPosition(move) || move.seq <= p.seq || now - (this.lastIncoming.get(peerId) ?? 0) < 30) return;
      if(this.fauna){if(typeof move.sceneReady!=='boolean')return;if(move.sceneReady)this.readyPeers.add(peerId);else this.readyPeers.delete(peerId);}
      this.lastIncoming.set(peerId, now);
      this.players.set(peerId, {...p, x: move.x, y: move.y, seq: move.seq, heading: move.heading, speed: move.speed, running: move.running}); this.received++;
    };
    this.snapshots.onMessage = (value, {peerId}) => {
      if (host || peerId !== invite.host || !record(value) || value.v !== PROTOCOL || !Number.isSafeInteger(value.tick)
        || value.tick <= this.lastSnapshot || !validRoster(value.players, this.capacity) || !value.players.some(p => p.id === selfId)) return;
      if(this.fauna){if(!validClock(value.clock)||!this.fauna.accept(value.wildlife,performance.now()-this.halfRtt))return;this.sharedClock={...value.clock,serverMs:value.clock.serverMs+this.halfRtt,receivedAt:performance.now()};}
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
    this.names.delete(id); this.lastIncoming.delete(id);this.readyPeers.delete(id);this.lastClockRequest.delete(id);
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
      const clock=this.fauna?this.sampleClock():undefined;
      if(this.fauna&&clock){this.fauna.advance(performance.now(),metricRoster(players,this.readyPeers,performance.now()),wildlifeEnvironment(clock));this.sharedClock={...clock,receivedAt:performance.now()};}
      const payload = {v: PROTOCOL, tick: ++this.tick, players,...(this.fauna?{wildlife:wireFrame(this.wildlife!.latest()),clock}: {})};
      for (const id of Object.keys(this.room.getPeers())) {
        if (this.players.has(id)) this.sendOne(id, () => this.snapshots.send(payload, {target: id}));
      }
    } else if (this.room.getPeers()[this.invite.host]) {
      const {x, y, seq, heading, speed, running} = this.local;
      this.sendOne(this.invite.host, () => this.moves.send({x, y, seq, heading, speed, running,...(this.fauna?{sceneReady:this.localReady}:{})}, {target: this.invite.host}));
    }
  }
  private sampleClock():ClockSample{return {epochMs:this.clockEpoch,serverMs:Date.now(),cycleSeconds:1200};}
  clock(){return this.sharedClock;}
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
    return {version: PROTOCOL, reportVersion:3, roomTag:await this.roomTag, signaling:getSignalingDiagnostics(),
      rtcCreated:this.rtcCreated, attempts:this.rtcAttempts.filter(t=>t.remoteDescription||t.failed).slice(-20).map(t=>({...t,localTypes:{...t.localTypes},remoteTypes:{...t.remoteTypes}})),joinFailures:[...this.joinFailures],
      date: new Date().toISOString(), durationSeconds: Math.round((Date.now() - this.started) / 1000),
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
    this.stopped = true;this.fauna?.dispose();this.readyPeers.clear();this.lastClockRequest.clear(); for (const t of this.timers) clearInterval(t);
    for (const t of this.pending.values()) clearTimeout(t);
    this.players.clear(); this.closeTask = this.room.leave().catch(() => {}); return this.closeTask;
  }
}
