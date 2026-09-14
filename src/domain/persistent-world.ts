import { validPosition, cleanName, type Player } from '../network/protocol.ts';

const CAPACITY = 6;
const CYCLE_SECONDS = 1200;
const MIN_MOVE_INTERVAL_MS = 30;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export type PersistentWorldOptions = {epochMs: number; now?: () => number};
export type WorldSnapshot = {
  tick: number;
  players: Player[];
  clock: {epochMs: number; serverMs: number; cycleSeconds: number};
};

/**
 * Pure authoritative player registry. No timers, DOM, filesystem or transport.
 * Callers supply time through `now` so behavior is deterministic in tests.
 */
export class PersistentWorld {
  readonly players = new Map<string, Player>();
  private readonly epochMs: number;
  private readonly now: () => number;
  private tick = 0;
  /** Timestamp of the last accepted move per player id. */
  private readonly lastMoveAt = new Map<string, number>();

  constructor(options: PersistentWorldOptions) {
    if (!options || !Number.isSafeInteger(options.epochMs) || options.epochMs <= 0) {
      throw new TypeError('epochMs must be a positive safe integer');
    }
    if (options.now !== undefined && typeof options.now !== 'function') {
      throw new TypeError('now must be a function');
    }
    this.epochMs = options.epochMs;
    this.now = options.now ?? Date.now;
  }

  admit(id: string, name: unknown): Player | null {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;

    const existing = this.players.get(id);
    if (existing) {
      // Reconnect: keep slot and position, refresh name and let a new
      // connection start moving immediately.
      existing.name = cleanName(name);
      existing.seq = 0;
      this.lastMoveAt.set(id, Number.NEGATIVE_INFINITY);
      return existing;
    }

    const slot = this.firstFreeSlot();
    if (slot === null) return null;

    const player: Player = {
      id,
      name: cleanName(name),
      slot,
      x: 0.5 + (slot % 3 - 1) * 0.003,
      y: 0.4 + Math.floor(slot / 3) * 0.003,
      heading: 0,
      speed: 0,
      running: false,
      seq: 0,
    };
    this.players.set(id, player);
    this.lastMoveAt.set(id, Number.NEGATIVE_INFINITY);
    return player;
  }

  depart(id: string): void {
    this.players.delete(id);
    this.lastMoveAt.delete(id);
  }

  move(id: string, value: unknown): boolean {
    const player = this.players.get(id);
    if (!player || !validPosition(value)) return false;
    if (value.seq <= player.seq) return false;

    const at = this.now();
    const last = this.lastMoveAt.get(id);
    if (last !== undefined && at - last < MIN_MOVE_INTERVAL_MS) return false;

    // Copy only the sanctioned movement fields; never id/name/slot.
    player.x = value.x;
    player.y = value.y;
    player.seq = value.seq;
    if (value.heading !== undefined) player.heading = value.heading;
    if (value.speed !== undefined) player.speed = value.speed;
    if (value.running !== undefined) player.running = value.running;

    this.lastMoveAt.set(id, at);
    return true;
  }

  snapshot(): WorldSnapshot {
    this.tick += 1;
    return {
      tick: this.tick,
      players: [...this.players.values()].map(player => ({...player})),
      clock: {
        epochMs: this.epochMs,
        serverMs: this.now(),
        cycleSeconds: CYCLE_SECONDS,
      },
    };
  }

  private firstFreeSlot(): number | null {
    const used = new Set<number>();
    for (const player of this.players.values()) used.add(player.slot);
    for (let slot = 0; slot < CAPACITY; slot++) {
      if (!used.has(slot)) return slot;
    }
    return null;
  }
}
