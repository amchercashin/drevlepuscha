import type { WorldPoint } from './coordinates.ts';
export interface SaveV2 {
  schemaVersion: 2;
  worldId: string;
  contentRevision: string;
  generatorVersion: string;
  worldSeed: string;
  position: WorldPoint;
  /** Positive pitch looks down; negative pitch looks up. Distance is camera-to-target metres. */
  camera: { mode: 'atlas' | 'travel-third-person'; yawDeg: number; pitchDeg: number; distanceM: number };
  discoveredIds: string[];
}
export interface ExpectedWorld {
  worldId: string; contentRevision: string; generatorVersion: string; worldSeed: string;
}
export type DecodeResult = { status: 'ok'; save: SaveV2 } |
  { status: 'invalid'; errors: string[] } | { status: 'incompatible'; reasons: string[]; save: SaveV2 };

const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const number = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const id = (x: unknown): x is string => text(x) && /^[a-z0-9][a-z0-9._-]*$/.test(x);
function exactKeys(x: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => Object.hasOwn(x, key)) && Object.keys(x).every(key => keys.includes(key));
}

/** Validate without changing or overwriting the caller's persisted data. */
export function decodeSave(serialized: string, expected?: ExpectedWorld): DecodeResult {
  let raw: unknown;
  try { raw = JSON.parse(serialized); } catch { return { status: 'invalid', errors: ['Invalid JSON'] }; }
  if (!isRecord(raw)) return { status: 'invalid', errors: ['Save must be an object'] };
  if (raw.schemaVersion === 1) return { status: 'invalid', errors: ['Legacy save schemaVersion 1 is unsupported; pre-runtime contract v2 requires explicit yawDeg, pitchDeg and distanceM. No automatic migration.'] };
  const errors: string[] = [];
  if (!exactKeys(raw, ['schemaVersion','worldId','contentRevision','generatorVersion','worldSeed','position','camera','discoveredIds'])) errors.push('Unexpected or missing save fields');
  if (raw.schemaVersion !== 2) errors.push('Unsupported schemaVersion');
  if (!id(raw.worldId)) errors.push('Invalid worldId');
  for (const key of ['contentRevision','generatorVersion','worldSeed']) if (!text(raw[key])) errors.push(`Invalid ${key}`);
  if (!isRecord(raw.position) || !exactKeys(raw.position, ['e','n','h']) ||
      !number(raw.position.e) || !number(raw.position.n) || !number(raw.position.h)) errors.push('Invalid world position');
  const c = raw.camera;
  if (!isRecord(c) || !exactKeys(c, ['mode','yawDeg','pitchDeg','distanceM']) ||
      typeof c.mode !== 'string' || !['atlas','travel-third-person'].includes(c.mode) || !number(c.yawDeg) || c.yawDeg < 0 ||
      c.yawDeg >= 360 || !number(c.pitchDeg) || c.pitchDeg < -90 || c.pitchDeg > 90 || !number(c.distanceM) || c.distanceM <= 0) errors.push('Invalid camera');
  if (!Array.isArray(raw.discoveredIds) || !raw.discoveredIds.every(id) ||
      new Set(raw.discoveredIds).size !== raw.discoveredIds.length) errors.push('Invalid or duplicate discovered IDs');
  if (errors.length) return { status: 'invalid', errors };
  const save = raw as unknown as SaveV2;
  if (expected) {
    const keys = ['worldId','contentRevision','generatorVersion','worldSeed'] as const;
    const reasons = keys.filter(key => save[key] !== expected[key]).map(key => `Mismatch: ${key}`);
    if (reasons.length) return { status: 'incompatible', reasons, save };
  }
  return { status: 'ok', save };
}
