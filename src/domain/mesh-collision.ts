import type {Point3} from './harness.ts';

type Bounds = {min:Point3;max:Point3};
type Triangle = [Point3,Point3,Point3];
interface Node extends Bounds {children?:[Node,Node];triangles?:Triangle[];}
export interface CollisionGeometry {root:Node;}
export interface MeshCollider extends Bounds {geometry:CollisionGeometry;matrix:number[];inverse:number[];}
const axes=['x','y','z'] as const;
const bounds=(points:Point3[]):Bounds=>({min:{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),z:Math.min(...points.map(p=>p.z))},max:{x:Math.max(...points.map(p=>p.x)),y:Math.max(...points.map(p=>p.y)),z:Math.max(...points.map(p=>p.z))}});
const overlaps=(a:Bounds,b:Bounds)=>axes.every(k=>a.min[k]<=b.max[k]&&a.max[k]>=b.min[k]);
const corners=(b:Bounds)=>[b.min.x,b.max.x].flatMap(x=>[b.min.y,b.max.y].flatMap(y=>[b.min.z,b.max.z].map(z=>({x,y,z}))));
function transform(p:Point3,m:readonly number[]):Point3 {
 return {x:p.x*m[0]+p.y*m[4]+p.z*m[8]+m[12],y:p.x*m[1]+p.y*m[5]+p.z*m[9]+m[13],z:p.x*m[2]+p.y*m[6]+p.z*m[10]+m[14]};
}

/** Build once per authored/warped asset, shared by all placements and independent of LOD. */
export function collisionGeometry(parts:readonly {positions:ArrayLike<number>;indices:ArrayLike<number>}[]):CollisionGeometry {
 const triangles:Triangle[]=[];
 for(const part of parts)for(let i=0;i<part.indices.length;i+=3){
  triangles.push([0,1,2].map(j=>{const k=part.indices[i+j]*3;return {x:part.positions[k],y:part.positions[k+1],z:part.positions[k+2]};}) as Triangle);
 }
 if(!triangles.length)throw new Error('Collision geometry requires triangles');
 function build(ts:Triangle[]):Node {
  // Reduce bounds without spreading an entire high resolution mesh into function arguments.
  const b:Bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
  for(const t of ts)for(const p of t)for(const k of axes){b.min[k]=Math.min(b.min[k],p[k]);b.max[k]=Math.max(b.max[k],p[k]);}
  if(ts.length<=12)return {...b,triangles:ts};
  const axis=axes.reduce((a,k)=>b.max[k]-b.min[k]>b.max[a]-b.min[a]?k:a);
  ts.sort((a,b)=>a.reduce((s,p)=>s+p[axis],0)-b.reduce((s,p)=>s+p[axis],0));
  const mid=Math.floor(ts.length/2);return {...b,children:[build(ts.slice(0,mid)),build(ts.slice(mid))]};
 }
 return {root:build(triangles)};
}

/** Pass the SAME final world matrix as the rendered model, after scale/rotation/placement.
 * Recreate after a transform changes; rebuild the spatial grid when its bounds change. */
export function meshCollider(geometry:CollisionGeometry,matrix:ArrayLike<number>,inverse:ArrayLike<number>):MeshCollider {
 const m=Array.from(matrix);return {...bounds(corners(geometry.root).map(p=>transform(p,m))),geometry,matrix:m,inverse:Array.from(inverse)};
}
function visit(node:Node,query:Bounds,hit:(t:Triangle)=>boolean):boolean {
 if(!overlaps(node,query))return false;
 return node.children?node.children.some(n=>visit(n,query,hit)):node.triangles!.some(hit);
}
function clipY(points:Point3[],y:number,above:boolean):Point3[] {
 const out:Point3[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],insideA=above?a.y>=y:a.y<=y,insideB=above?b.y>=y:b.y<=y;
  if(insideA)out.push(a);
  if(insideA!==insideB){const t=(y-a.y)/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*t,y,z:a.z+(b.z-a.z)*t});}
 }
 return out;
}
function diskHitsPolygon(p:Point3,radius:number,polygon:Point3[]):boolean {
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  if((p.x-a.x-t*dx)**2+(p.z-a.z-t*dz)**2<radius*radius)return true;
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
// Interior check also rejects teleports wholly inside a closed trunk, away from its surface.
function insideGeometry(p:Point3,geometry:CollisionGeometry):boolean {
 const query={min:p,max:{x:geometry.root.max.x+1,y:p.y,z:p.z}},hits:number[]=[];
 visit(geometry.root,query,t=>{
  const [a,b,c]=t,by=b.y-a.y,bz=b.z-a.z,cy=c.y-a.y,cz=c.z-a.z,det=by*cz-bz*cy;
  if(Math.abs(det)<1e-12)return false;
  const py=p.y-a.y,pz=p.z-a.z,u=(py*cz-pz*cy)/det,v=(by*pz-bz*py)/det;
  if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9){const x=a.x+u*(b.x-a.x)+v*(c.x-a.x);if(x>p.x+1e-9)hits.push(x);}
  return false;
 });
 hits.sort((a,b)=>a-b);return hits.filter((x,i)=>i===0||x-hits[i-1]>1e-7).length%2===1;
}

/** Exact triangle surface against a vertical player cylinder; the BVH only selects candidates.
 * No crown-wide cylinder, yaw AABB corners, or whole-trunk lean padding blocks empty air. */
export function meshBlocksCylinder(c:MeshCollider,feet:Point3,radius:number,height:number):boolean {
 const query={min:{x:feet.x-radius,y:feet.y,z:feet.z-radius},max:{x:feet.x+radius,y:feet.y+height,z:feet.z+radius}};
 if(!overlaps(c,query))return false;
 const local=bounds(corners(query).map(p=>transform(p,c.inverse)));
 if(visit(c.geometry.root,local,t=>diskHitsPolygon(feet,radius,clipY(clipY(t.map(p=>transform(p,c.matrix)),feet.y,true),feet.y+height,false))))return true;
 return insideGeometry(transform({...feet,y:feet.y+height*.5},c.inverse),c.geometry);
}
