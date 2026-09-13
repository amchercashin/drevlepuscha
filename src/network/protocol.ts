export const PROTOCOL = 1;
export const MAX_PLAYERS = 4;
export const COLORS = ['#d0a15b', '#80b9ad', '#c394b6', '#91aedd'];
export type Position = {x: number; y: number; seq: number};
export type Player = Position & {id: string; name: string; slot: number};
export type Invitation = {room: string; host: string; key: string};
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const cleanName = (value: unknown) => typeof value === 'string'
  ? value.replace(/[\p{C}]/gu, '').trim().slice(0, 24) || 'Путник' : 'Путник';
export function validPosition(value: unknown): value is Position {
  return record(value) && typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1
    && Number.isSafeInteger(value.seq) && Number(value.seq) >= 0;
}
export function validPlayer(value: unknown): value is Player {
  return record(value) && typeof value.id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(value.id)
    && typeof value.name === 'string' && value.name === cleanName(value.name)
    && Number.isInteger(value.slot) && Number(value.slot) >= 0 && Number(value.slot) < MAX_PLAYERS && validPosition(value);
}
export function validRoster(value: unknown): value is Player[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_PLAYERS && value.every(validPlayer)
    && new Set(value.map(p => p.id)).size === value.length && new Set(value.map(p => p.slot)).size === value.length;
}
export function parseInvitation(hash: string): Invitation | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const room = params.get('room') ?? '', host = params.get('host') ?? '', key = params.get('key') ?? '';
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(room) || !/^[a-zA-Z0-9_-]{8,64}$/.test(host)
    || !/^[a-zA-Z0-9_-]{24,80}$/.test(key)) return null;
  return {room, host, key};
}
export function invitationHash(invite: Invitation): string {
  return new URLSearchParams(invite).toString();
}
/** Reserve synchronously before awaiting network I/O; pending peers also use a slot. */
export class Admission {
  private slots = new Map<string, number>();
  reserve(id: string): number | null {
    const existing = this.slots.get(id);
    if (existing !== undefined) return existing;
    for (let slot = 1; slot < MAX_PLAYERS; slot++) {
      if (![...this.slots.values()].includes(slot)) {this.slots.set(id, slot); return slot;}
    }
    return null;
  }
  get(id: string) {return this.slots.get(id);}
  release(id: string) {this.slots.delete(id);}
}
