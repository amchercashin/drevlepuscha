/** Domain coordinates: metres east, north and up. No renderer dependencies. */
export interface WorldPoint { e: number; n: number; h: number }
export interface RenderPoint { x: number; y: number; z: number }
export interface TileIndex { e: number; n: number }

function finite(...values: number[]): void {
  if (values.some(value => !Number.isFinite(value))) {
    throw new RangeError('Coordinates and angles must be finite numbers.');
  }
}

/** Babylon right-handed convention: X east, Y up, Z south. */
export function toRender(point: WorldPoint, origin: WorldPoint): RenderPoint {
  finite(point.e, point.n, point.h, origin.e, origin.n, origin.h);
  return { x: point.e - origin.e, y: point.h - origin.h, z: origin.n - point.n };
}

export function fromRender(point: RenderPoint, origin: WorldPoint): WorldPoint {
  finite(point.x, point.y, point.z, origin.e, origin.n, origin.h);
  return { e: origin.e + point.x, n: origin.n - point.z, h: origin.h + point.y };
}

/** Half-open tile ownership; floor is essential for negative coordinates. */
export function tileFor(e: number, n: number, tileSizeM = 128): TileIndex {
  finite(e, n, tileSizeM);
  if (tileSizeM <= 0) throw new RangeError('Tile size must be positive.');
  return { e: Math.floor(e / tileSizeM), n: Math.floor(n / tileSizeM) };
}

export function normalizeAzimuth(degrees: number): number {
  finite(degrees);
  return ((degrees % 360) + 360) % 360;
}

/** Shortest signed arc in [-180,180). An exact half-turn chooses -180. */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  finite(fromDeg, toDeg);
  return normalizeAzimuth(normalizeAzimuth(toDeg) - normalizeAzimuth(fromDeg) + 180) - 180;
}

/** Orbit offset: 0° yaw places camera north of target, 90° east.
 * Positive pitch puts camera above target (looking down); negative looks up.
 * This is geometry only, not a third-person controller or collision system. */
export function cameraOffset(azimuthDeg: number, elevationDeg: number, radiusM: number): RenderPoint {
  finite(azimuthDeg, elevationDeg, radiusM);
  if (radiusM <= 0 || elevationDeg < -90 || elevationDeg > 90) {
    throw new RangeError('Positive radius and pitch in [-90,90] required.');
  }
  const a = normalizeAzimuth(azimuthDeg) * Math.PI / 180;
  const e = elevationDeg * Math.PI / 180;
  const ground = radiusM * Math.cos(e);
  return { x: ground * Math.sin(a), y: radiusM * Math.sin(e), z: -ground * Math.cos(a) };
}
