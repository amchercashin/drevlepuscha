/** Versioned engineering PRNG, NOT cryptographic. Changing this changes content. */
export const RANDOM_VERSION = 'fnv1a-utf8-mulberry32-v1';

export function hashString(value: string): number {
  if (typeof value !== 'string') throw new TypeError('Expected a string.');
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}

/** JSON-array encoding avoids delimiter ambiguity; keys must be stable. */
export function seedFor(...keys: (string | number)[]): number {
  if (keys.length === 0 || keys.some(k => typeof k !== 'string' &&
      !(typeof k === 'number' && Number.isFinite(k)))) {
    throw new TypeError('Provide stable string or finite number keys.');
  }
  return hashString(JSON.stringify(keys));
}

export function createRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be a uint32 integer.');
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A candidate belongs to a global scatter cell, not to a request sequence. */
export function scatterCandidate(worldSeed: string, layerId: string, cellE: number,
  cellN: number, cellSizeM: number): { e: number; n: number; id: string } {
  if (!worldSeed || !layerId || !Number.isSafeInteger(cellE) || !Number.isSafeInteger(cellN)
      || !Number.isFinite(cellSizeM) || cellSizeM <= 0) {
    throw new RangeError('Stable IDs, safe integer cells and positive cell size required.');
  }
  const random = createRandom(seedFor(RANDOM_VERSION, worldSeed, layerId, cellE, cellN));
  return { e: (cellE + random()) * cellSizeM, n: (cellN + random()) * cellSizeM,
    id: JSON.stringify([layerId, cellE, cellN, 0]) };
}
