/** Synthetic M0 metres. No connection to the uncalibrated canonical map. */
export interface Point3 { x: number; y: number; z: number }
export interface Box { id: string; min: Point3; max: Point3 }
export interface Walker { e: number; n: number }
// Conservative horizontal hull for player movement.
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

/** Segment intersection with a padded obstacle box. */
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

/** Sample the near surface of the head and torso, without inflating the obstacle.
 * Endpoints face the camera so a touching wall behind the player cannot count as a blocker.
 * Feet and limbs alone are deliberately not sufficient reason to fade an object. */
export function occludesTraveller(camera: Point3, feet: Point3, box: Box, alreadyFaded = false, preciseHit?: (start:Point3,end:Point3)=>boolean): boolean {
  const length=Math.hypot(camera.x-feet.x,camera.z-feet.z)||1;
  const towardX=(camera.x-feet.x)/length,towardZ=(camera.z-feet.z)/length;
  let head=0,body=0;
  for(const height of [0.95,0.7,0.45]) {
    const width=height===0.95?0.09:0.16;
    for(const side of [-width,0,width]) {
      const target={x:feet.x+towardX*0.15+towardZ*side,y:feet.y+height,z:feet.z+towardZ*0.15-towardX*side};
      const hit=segmentBoxFraction(camera,target,box,0);
      if(hit!==null&&hit<1-1e-6&&(!preciseHit||preciseHit(camera,target))){if(height===0.95)head++;else body++;}
    }
  }
  // Small hysteresis prevents flicker at the edge; a clear head always restores opacity.
  return alreadyFaded?head>=1&&body>=2:head>=2&&body>=3;
}

/** Terrain is one synthetic mesh in M0; sample its actual height, not its very broad AABB. */
export function terrainOccludesTraveller(camera: Point3, feet: Point3): boolean {
  const target = {...feet, y:feet.y+0.6};
  const steps = Math.max(1, Math.ceil(Math.hypot(target.x-camera.x,target.y-camera.y,target.z-camera.z)/0.1));
  for(let i=0;i<steps;i++) {
    const t=i/steps,x=camera.x+(target.x-camera.x)*t,z=camera.z+(target.z-camera.z)*t;
    if(camera.y+(target.y-camera.y)*t < groundHeight(x,-z)+0.03)return true;
  }
  return false;
}

export function fadeOpacity(current: number, target: number, dt: number, seconds: number): number {
  const next=target+(current-target)*Math.exp(-Math.max(0,dt)/seconds);
  return Math.abs(next-target)<0.001?target:next;
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
export function moveWalker(p: Walker, de: number, dn: number, boxes: readonly Box[], bounds=BOUNDS): Walker {
  if (![p.e, p.n, de, dn].every(Number.isFinite)) throw new RangeError('Finite movement required');
  const steps = Math.max(1, Math.ceil(Math.hypot(de, dn) / 0.06));
  const next = { ...p };
  for (let i = 0; i < steps; i++) {
    const e = clamp(next.e + de / steps, bounds.minE + 1, bounds.maxE - 1);
    if (walkerIsClear({ e, n: next.n }, boxes)) next.e = e;
    const n = clamp(next.n + dn / steps, bounds.minN + 1, bounds.maxN - 1);
    if (walkerIsClear({ e: next.e, n }, boxes)) next.n = n;
  }
  return next;
}
