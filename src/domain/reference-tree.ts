import { createRandom, seedFor } from './seed.ts';

export type Point = [number, number, number];
export interface TreePart { name: string; positions: number[]; normals: number[]; uvs: number[]; colors: number[]; indices: number[] }
export const TREE_VERSION = 'reference-tree-v1';
export const TREE_HEIGHT_M = 18;
const add = (a: Point, b: Point): Point => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a: Point, s: number): Point => [a[0]*s,a[1]*s,a[2]*s];
const sub = (a: Point,b: Point): Point => add(a,mul(b,-1));
const cross = (a: Point,b: Point): Point => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (a: Point): Point => mul(a,1/(Math.hypot(...a)||1));
const part = (name: string): TreePart => ({name,positions:[],normals:[],uvs:[],colors:[],indices:[]});
const lerp = (a: number,b: number,t: number) => a+(b-a)*t;
const noise = (x:number,y:number,z:number) => Math.sin(x*2.9+y*3.7+z*1.3)*Math.sin(x*5.3-y*2.1+z*4.1);
function vertex(m:TreePart,p:Point,c:Point,uv=[0,0]) { m.positions.push(...p);m.colors.push(...c,1);m.uvs.push(...uv); }
function shade(c:Point,s:number):Point { return c.map(v=>Math.max(0,Math.min(1,v*s))) as Point; }
function smooth(points: Point[], steps: number): Point[] {
  const out:Point[]=[];
  for(let i=0;i<steps;i++) {
    const u=i/(steps-1)*(points.length-1),k=Math.min(points.length-2,Math.floor(u)),t=u-k;
    const p0=points[Math.max(0,k-1)],p1=points[k],p2=points[k+1],p3=points[Math.min(points.length-1,k+2)];
    out.push([0,1,2].map(d=>0.5*((2*p1[d])+(-p0[d]+p2[d])*t+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t*t+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*t*t*t)) as Point);
  }
  return out;
}
/** Authored sweep, not a scan: branch attachment locations stay fixed across detail levels. */
function tube(m:TreePart,control:Point[],radii:number[],sides:number,steps:number,color:Point,flute=0.1) {
  const path=smooth(control,steps),base=m.positions.length/3;
  let previousRight:Point|undefined;
  for(let i=0;i<steps;i++) {
    const t=i/(steps-1),u=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(u));
    const radius=lerp(radii[k],radii[k+1],u-k);
    const tangent=unit(sub(path[Math.min(steps-1,i+1)],path[Math.max(0,i-1)]));
    const axis:Point=Math.abs(tangent[1])>0.92?[1,0,0]:[0,1,0];
    const right=previousRight?unit(sub(previousRight,mul(tangent,previousRight.reduce((sum,v,d)=>sum+v*tangent[d],0)))):unit(cross(tangent,axis));
    previousRight=right;const up=unit(cross(right,tangent));
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2;
      const ridge=1+flute*Math.cos(a*5+t*2)+flute*0.45*Math.sin(a*9-t*3);
      const p=add(path[i],mul(add(mul(right,Math.cos(a)),mul(up,Math.sin(a))),radius*ridge));
      const s=0.92+0.1*Math.sin(a*7+t*1.4)+0.07*noise(...mul(p,1.5));
      vertex(m,p,shade(color,s),[j/sides,t]);
    }
  }
  for(let i=0;i<steps-1;i++)for(let j=0;j<sides;j++) {
    const a=base+i*sides+j,b=base+i*sides+(j+1)%sides,c=a+sides,d=b+sides;
    m.indices.push(a,c,b,b,c,d);
  }
  for(let j=1;j<sides-1;j++){m.indices.push(base,base+j,base+j+1);const end=base+(steps-1)*sides;m.indices.push(end,end+j+1,end+j);}
}
function blob(m:TreePart,center:Point,scale:Point,color:Point,phase:number,segments=12,rings=7,roughness=0.09) {
  const base=m.positions.length/3;
  for(let i=0;i<=rings;i++) {
    const lat=i/rings*Math.PI;
    for(let j=0;j<segments;j++) {
      const a=j/segments*Math.PI*2;
      const w=1+roughness*Math.sin(lat)*(Math.sin(a*5+phase)*Math.sin(lat*3)+0.55*Math.cos(a*3-lat*4+phase));
      const p:Point=[center[0]+Math.sin(lat)*Math.cos(a)*scale[0]*w,center[1]+Math.cos(lat)*scale[1]*w,center[2]+Math.sin(lat)*Math.sin(a)*scale[2]*w];
      const mottled=0.93+0.1*noise(...mul(p,2))+0.045*Math.sin(a*7+phase)+0.055*Math.cos(lat);
      vertex(m,p,shade(color,mottled),[j/segments,i/rings]);
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++) {
    const a=base+i*segments+j,b=base+i*segments+(j+1)%segments,c=a+segments,d=b+segments;
    if(i!==0)m.indices.push(a,b,c);if(i!==rings-1)m.indices.push(b,d,c);
  }
}
function normals(m:TreePart) {
  const out=new Array(m.positions.length).fill(0);
  for(let i=0;i<m.indices.length;i+=3){
    const [a,b,c]=m.indices.slice(i,i+3).map(v=>v*3);
    const v=(k:number):Point=>m.positions.slice(k,k+3) as Point;
    const n=cross(sub(v(b),v(a)),sub(v(c),v(a)));
    for(const k of [a,b,c])for(let d=0;d<3;d++)out[k+d]+=n[d];
  }
  for(let i=0;i<out.length;i+=3){const n=unit(out.slice(i,i+3) as Point);out.splice(i,3,...n);}
  m.normals=out;
}

export function createReferenceTree(): TreePart[] {
  const wood=part('bark'),leaves=part('canopy'),rock=part('stones'),moss=part('moss'),hollow=part('hollow');
  const rng=createRandom(seedFor(TREE_VERSION,'authored-tree'));
  const bark:Point=[0.67,0.67,0.61];
  const trunk:Point[]=[[0,0,0],[-0.18,0.65,0.02],[-0.36,2.3,0.08],[-0.08,4.6,0.12],[0.16,7,0],[0.04,9.1,-0.04],[0.38,11.2,0.1],[0.28,13.6,0.12],[0.6,15.6,0.1],[0.48,17.3,0.2]];
  tube(wood,trunk,[1.12,0.84,0.59,0.49,0.48,0.47,0.33,0.23,0.12,0.018],18,42,bark,0.115);
  // Buttress roots rise from the trunk and split across a low, rocky mound.
  for(let i=0;i<9;i++) {
    const a=i*Math.PI*2/9+0.1,reach=2.4+rng()*1.25,dx=Math.cos(a),dz=Math.sin(a);
    const controls:Point[]=[[-0.18,1.6+rng()*0.9,0],[dx*0.65,0.55,dz*0.65],[dx*1.55,0.26,dz*1.55],[dx*reach,0.05,dz*reach]];
    tube(wood,controls,[0.43,0.36,0.19,0.025],8,11,bark,0.14);
    const split=a+0.27;
    tube(wood,[[dx*1.15,0.28,dz*1.15],[Math.cos(split)*2,0.15,Math.sin(split)*2],[Math.cos(split)*(reach+0.35),0.04,Math.sin(split)*(reach+0.35)]],[0.14,0.075,0.009],6,7,bark,0.12);
  }
  // Staggered, radial scaffold: long bare bole, open lower boughs, overlapping upper crown.
  const boughs = [
    [6.7,-2.6,3.7,9.0],[7.7,-0.2,4.2,10.7],[8.1,2.0,3.5,10.0],[8.7,0.95,4.2,12.0],
    [9.3,3.2,4.5,12.8],[9.5,-1.25,4.9,13.5],[10.2,2.45,4.5,14.1],[10.4,0.2,4.8,14.5],
    [11.0,-2.45,4.1,15.1],[11.8,1.25,3.9,16.1],[12.0,-0.8,3.7,16.5],[12.6,2.8,3.2,16.9],
    [13.7,0.35,2.8,17.5],[14.1,-1.8,2.4,17.8],[14.7,1.8,2.0,17.6],
  ];
  const leafPalette:Point[]=[[0.24,0.38,0.32],[0.29,0.43,0.35],[0.35,0.48,0.38],[0.42,0.53,0.40],[0.31,0.45,0.41]];
  for(let i=0;i<boughs.length;i++) {
    const [startY,angle,reach,endY]=boughs[i],dx=Math.cos(angle),dz=Math.sin(angle);
    const start:Point=[0.1,startY,0];
    const end:Point=[dx*reach,endY,dz*reach];
    tube(wood,[start,[dx*reach*0.25,startY+0.7,dz*reach*0.25],[dx*reach*0.66,endY-0.8,dz*reach*0.6],end],[0.3-(i/15)*0.15,0.23-(i/15)*0.11,0.1,0.025],8,10,bark);
    for(let j=0;j<2;j++) {
      const a=angle+(j-0.5)*0.52;
      const r=reach+(j===1?0.45:-0.2),h=endY+(j===1?0.42:-0.12)+rng()*0.35;
      const tip:Point=[Math.cos(a)*r,h,Math.sin(a)*r];
      tube(wood,[[dx*reach*0.58,endY-1.15,dz*reach*0.58],[Math.cos(a)*r*0.84,h-0.65,Math.sin(a)*r*0.84],tip],[0.1,0.06,0.012],5,6,bark);
      const color=leafPalette[(i+j)%leafPalette.length];
      const size=i<3?0.78:i<8?1.12:1.30;
      blob(leaves,add(tip,[0,0.12,0]),[1.48*size,0.68*size,1.26*size],color,rng()*6,12,7,0.055);
      // Smaller fused lobes break the outline without individual transparent leaf cards.
      for(let k=0;k<2;k++) {
        const a2=k*2.1+i*0.8;
        const p=add(tip,[Math.cos(a2)*0.7*size,0.05+rng()*0.22,Math.sin(a2)*0.63*size]);
        blob(leaves,p,[0.82*size,0.56*size,0.75*size],shade(color,0.94+rng()*0.14),rng()*6,10,5,0.06);
      }
    }
  }
  blob(leaves,[0.45,17.7,0.15],[1.75,0.82,1.7],leafPalette[2],1,14,8,0.06);
  // Small irregular stone bed, not part of the canonical landscape.
  for(let i=0;i<18;i++) {
    const a=rng()*Math.PI*2,r=1.15+rng()*2.15,s=0.24+rng()*0.45;
    const c:Point=[Math.cos(a)*r,0.1,Math.sin(a)*r];
    blob(rock,c,[s,s*0.7,s*0.75],[0.34,0.41,0.43],rng()*6,7,4,0.18);
    blob(moss,add(c,[0,s*0.43,0]),[s*0.75,0.09,s*0.6],[0.35,0.43,0.24],rng()*6,8,4,0.2);
  }
  // An inset dark oval and raised irregular bark rim, on the front of the bole.
  blob(hollow,[0.08,9.1,0.414],[0.155,0.4,0.043],[0.13,0.16,0.15],0,12,8,0.07);
  const rim:Point[]=[];
  for(let i=0;i<=24;i++){const a=i/24*Math.PI*2;rim.push([0.08+Math.cos(a)*0.22,9.1+Math.sin(a)*0.48,0.447+0.02*Math.sin(a*3)]);}
  tube(wood,rim,[0.05,0.055,0.055,0.05],6,32,[0.46,0.49,0.46]);
  const result=[wood,leaves,rock,moss,hollow];result.forEach(normals);return result;
}
