export type Vec3 = readonly [number, number, number];

export function normalize(a: Vec3): [number, number, number] {
  const d = Math.hypot(...a) || 1;
  return [a[0] / d, a[1] / d, a[2] / d];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function cameraBasis(eye: Vec3, target: Vec3) {
  const back = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const right = normalize(cross([0, 1, 0], back));
  const up = cross(back, right);
  return {back, right, up, forward: back.map(x => -x) as [number, number, number]};
}

export function lookAt(eye: Vec3, target: Vec3): Float32Array {
  const {back: z, right: x, up: y} = cameraBasis(eye, target);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ]);
}

export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1]
      + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
  }
  return out;
}

export function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0]);
}

export function orthographic(size: number, near: number, far: number): Float32Array {
  return new Float32Array([1 / size, 0, 0, 0, 0, 1 / size, 0, 0, 0, 0, 1 / (near - far), 0, 0, 0, near / (near - far), 1]);
}

export function modelMatrix(x: number, y: number, z: number, yaw: number, leanX: number, leanZ: number, sx: number, sy: number, sz: number): Float32Array {
  const cy = Math.cos(yaw), syaw = Math.sin(yaw), cx = Math.cos(leanX), slx = Math.sin(leanX), cz = Math.cos(leanZ), slz = Math.sin(leanZ);
  // R = Ry * Rx * Rz, then scale the three basis columns.
  return new Float32Array([
    (cy * cz + syaw * slx * slz) * sx, cx * slz * sx, (-syaw * cz + cy * slx * slz) * sx, 0,
    (-cy * slz + syaw * slx * cz) * sy, cx * cz * sy, (syaw * slz + cy * slx * cz) * sy, 0,
    syaw * cx * sz, -slx * sz, cy * cx * sz, 0,
    x, y, z, 1,
  ]);
}

export function inverseAffine(m:ArrayLike<number>):Float32Array {
 const a:Vec3=[m[0],m[1],m[2]],b:Vec3=[m[4],m[5],m[6]],c:Vec3=[m[8],m[9],m[10]];
 const bc=cross(b,c),ca=cross(c,a),ab=cross(a,b);
 const det=a[0]*bc[0]+a[1]*bc[1]+a[2]*bc[2];
 if(Math.abs(det)<1e-10)throw new Error('Non-invertible model matrix');
 const r0=bc.map(v=>v/det),r1=ca.map(v=>v/det),r2=ab.map(v=>v/det),t:Vec3=[m[12],m[13],m[14]];
 return new Float32Array([
  r0[0],r1[0],r2[0],0,r0[1],r1[1],r2[1],0,r0[2],r1[2],r2[2],0,
  -r0[0]*t[0]-r0[1]*t[1]-r0[2]*t[2],
  -r1[0]*t[0]-r1[1]*t[1]-r1[2]*t[2],
  -r2[0]*t[0]-r2[1]*t[1]-r2[2]*t[2],1,
 ]);
}

export function trs(translation: readonly number[], rotation: readonly number[], scale: readonly number[]): Float32Array {
 const [x,y,z,w]=rotation,[sx,sy,sz]=scale;
 const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
 return new Float32Array([
  (1-yy-zz)*sx,(xy+wz)*sx,(xz-wy)*sx,0,
  (xy-wz)*sy,(1-xx-zz)*sy,(yz+wx)*sy,0,
  (xz+wy)*sz,(yz-wx)*sz,(1-xx-yy)*sz,0,
  translation[0],translation[1],translation[2],1,
 ]);
}

export function nlerpQuaternion(a:readonly number[],b:readonly number[],t:number):[number,number,number,number]{
 const sign=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]<0?-1:1;
 const q=[0,1,2,3].map(i=>a[i]*(1-t)+b[i]*t*sign);
 const d=Math.hypot(...q)||1;return [q[0]/d,q[1]/d,q[2]/d,q[3]/d];
}
