/** Synthetic M0 metres. No connection to the uncalibrated canonical map. */
export interface Point3 { x: number; y: number; z: number }
export interface Box { id: string; min: Point3; max: Point3 }
export interface Walker { e: number; n: number }
// A conservative horizontal hull leaves room for the 0.25 m camera probe at its target.
export const PLAYER_RADIUS = 0.28;
export const PLAYER_HEIGHT = 1.1;
export const BOUNDS = { minE: -24, maxE: 24, minN: -12, maxN: 64 };

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function groundHeight(e: number, n: number): number {
  return 3.2 * smooth(32, 47, n) + 0.18 * Math.sin(e * 0.2) * Math.sin(n * 0.14);
}
export function pathCentre(n: number): number { return Math.sin(n * 0.075) * 1.3; }

/** Expanded AABB is a conservative sphere sweep, including near-plane clearance.
 * A box corner can stop the camera early; it can never admit the sphere into a box. */
export function segmentBoxFraction(start: Point3, end: Point3, box: Box, radius: number): number | null {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = end[axis] - start[axis];
    const lo = box.min[axis] - radius, hi = box.max[axis] + radius;
    if (Math.abs(d) < 1e-12) { if (start[axis] < lo || start[axis] > hi) return null; }
    else {
      const a = (lo - start[axis]) / d, b = (hi - start[axis]) / d;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return null;
    }
  }
  return enter;
}

export function cameraIsClear(p: Point3, boxes: readonly Box[], radius: number): boolean {
  if (p.y < groundHeight(p.x, -p.z) + radius + 0.03) return false;
  return !boxes.some(box => ['x', 'y', 'z'].every(axis => {
    const k = axis as keyof Point3;
    return p[k] > box.min[k] - radius && p[k] < box.max[k] + radius;
  }));
}

export function safeCameraFraction(start: Point3, end: Point3, boxes: readonly Box[], radius: number): number {
  let fraction = 1;
  const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  if (length < 1e-9) return 1;
  for (const box of boxes) {
    const t = segmentBoxFraction(start, end, box, radius);
    if (t !== null) fraction = Math.min(fraction, Math.max(0, t - 0.025 / length));
  }
  // Terrain is smooth with bounded slope. Short steps plus bisection find its first crossing.
  const steps = Math.ceil(length / 0.06);
  const clearance = (t: number) => {
    const x = start.x + (end.x - start.x) * t, z = start.z + (end.z - start.z) * t;
    return start.y + (end.y - start.y) * t - groundHeight(x, -z) - radius - 0.04;
  };
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(i / steps, fraction);
    if (clearance(t) < 0) {
      let lo = (i - 1) / steps, hi = t;
      for (let j = 0; j < 12; j++) { const m = (lo + hi) / 2; if (clearance(m) >= 0) lo = m; else hi = m; }
      fraction = Math.min(fraction, lo); break;
    }
    if (t >= fraction) break;
  }
  return fraction;
}

export function walkerIsClear(p: Walker, boxes: readonly Box[]): boolean {
  const h = groundHeight(p.e, p.n);
  return !boxes.some(box => {
    if (h + PLAYER_HEIGHT <= box.min.y || h >= box.max.y) return false;
    return p.e > box.min.x - PLAYER_RADIUS && p.e < box.max.x + PLAYER_RADIUS &&
      -p.n > box.min.z - PLAYER_RADIUS && -p.n < box.max.z + PLAYER_RADIUS;
  });
}

/** Substeps prevent tunnelling; separated axes permit wall sliding. */
export function moveWalker(p: Walker, de: number, dn: number, boxes: readonly Box[]): Walker {
  if (![p.e, p.n, de, dn].every(Number.isFinite)) throw new RangeError('Finite movement required');
  const steps = Math.max(1, Math.ceil(Math.hypot(de, dn) / 0.06));
  const next = { ...p };
  for (let i = 0; i < steps; i++) {
    const e = clamp(next.e + de / steps, BOUNDS.minE + 1, BOUNDS.maxE - 1);
    if (walkerIsClear({ e, n: next.n }, boxes)) next.e = e;
    const n = clamp(next.n + dn / steps, BOUNDS.minN + 1, BOUNDS.maxN - 1);
    if (walkerIsClear({ e: next.e, n }, boxes)) next.n = n;
  }
  return next;
}
