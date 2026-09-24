import type {MeshData} from '../geometry.ts';
import type {Grid} from '../../world/schema.ts';
import type {RegionStructureBox} from '../../domain/regions/structure-layout.ts';

const F=12;
type Patch={positions:Float32Array;normals:Float32Array;uvs:Float32Array;indices:Uint16Array;pixels:Uint8Array};
export function patchMesh(p:Patch):MeshData {
 const vertices=new Float32Array(p.positions.length/3*F);
 for(let i=0;i<p.positions.length/3;i++)vertices.set([
  p.positions[i*3],p.positions[i*3+1],p.positions[i*3+2],
  p.normals[i*3],p.normals[i*3+1],p.normals[i*3+2],
  p.uvs[i*2],p.uvs[i*2+1],1,1,1,1,
 ],i*F);
 return {vertices,indices:new Uint32Array(p.indices)};
}

export function coarseMesh(grid:Grid & {zones:number[]},zones:{tint:number[]}[]):MeshData {
 const vertices=new Float32Array(grid.columns*grid.rows*F),indices=new Uint32Array((grid.columns-1)*(grid.rows-1)*6);
 const h=(x:number,y:number)=>grid.values[Math.max(0,Math.min(grid.rows-1,y))*grid.columns+Math.max(0,Math.min(grid.columns-1,x))];
 for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.columns;x++){
  const i=y*grid.columns+x,dx=(h(x+1,y)-h(x-1,y))/(2*grid.stepM),dn=(h(x,y+1)-h(x,y-1))/(2*grid.stepM),len=Math.hypot(dx,1,dn),tint=zones[grid.zones[i]]?.tint??[.42,.48,.32];
  vertices.set([x*grid.stepM,h(x,y),-y*grid.stepM,-dx/len,1/len,dn/len,x/4,y/4,...tint,1],i*F);
  if(x<grid.columns-1&&y<grid.rows-1){const a=i,k=(y*(grid.columns-1)+x)*6;indices.set([a,a+1,a+grid.columns,a+1,a+grid.columns+1,a+grid.columns],k);}
 }
 return {vertices,indices};
}

export function waterMesh(record:{positions:number[];depths:number[];indices:number[]}):MeshData {
 const vertices=new Float32Array(record.positions.length/3*F);
 for(let i=0;i<record.positions.length/3;i++)vertices.set([record.positions[i*3],record.positions[i*3+1],record.positions[i*3+2],0,1,0,record.positions[i*3]*.04,record.positions[i*3+2]*.04,1,1,1,record.depths[i]],i*F);
 return {vertices,indices:new Uint32Array(record.indices)};
}

export function canopyMesh(source:{positions:Float32Array;colors:Float32Array;indices:Uint32Array}):MeshData {
 const vertices=new Float32Array(source.positions.length/3*F);
 for(let i=0;i<source.positions.length/3;i++)vertices.set([
  source.positions[i*3],source.positions[i*3+1],source.positions[i*3+2],0,1,0,0,0,
  source.colors[i*4],source.colors[i*4+1],source.colors[i*4+2],1,
 ],i*F);
 return {vertices,indices:source.indices};
}

/** Unit box used as a temporary proxy while an authored regional model streams in. */
export function boxMesh():MeshData {
 const vertices=new Float32Array(24*F),indices=new Uint32Array(36);
 const faces=[
  {n:[0,0,1],p:[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]},
  {n:[0,0,-1],p:[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]},
  {n:[1,0,0],p:[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]},
  {n:[-1,0,0],p:[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]},
  {n:[0,1,0],p:[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]},
  {n:[0,-1,0],p:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]},
 ] as const;
 faces.forEach((face,f)=>{face.p.forEach((p,i)=>vertices.set([...p,...face.n,i===1||i===2?1:0,i>=2?1:0,1,1,1,1],(f*4+i)*F));indices.set([f*4,f*4+1,f*4+2,f*4,f*4+2,f*4+3],f*6);});
 return {vertices,indices};
}

export function boxInstance(box:RegionStructureBox,origin:{e:number;n:number}){
 return {x:box.e-origin.e,y:box.y,z:origin.n-box.n,yaw:box.yaw,scale:[box.width,box.height,box.depth] as const};
}

type Point=[number,number,number];
function creature(){
 const vertices:number[]=[],indices:number[]=[];
 const vertex=(p:Point,n:Point,u:number,v:number,tone:number,wing=0)=>{vertices.push(...p,...n,u,v,tone,tone,tone,wing);};
 const ellipsoid=(center:Point,radius:Point,tone=1,wing=0)=>{
  const start=vertices.length/F,rings=7,segments=12;
  for(let y=0;y<=rings;y++){
   const latitude=-Math.PI/2+Math.PI*y/rings,cy=Math.cos(latitude),sy=Math.sin(latitude);
   for(let x=0;x<=segments;x++){
    const longitude=Math.PI*2*x/segments,cx=Math.cos(longitude),sx=Math.sin(longitude);
    const normal:[number,number,number]=[cx*cy/radius[0],sy/radius[1],sx*cy/radius[2]],length=Math.hypot(...normal);
    vertex([center[0]+cx*cy*radius[0],center[1]+sy*radius[1],center[2]+sx*cy*radius[2]],normal.map(v=>v/length) as Point,x/segments,y/rings,tone,wing);
   }
  }
  for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){
   const a=start+y*(segments+1)+x,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
 };
 const taper=(a:Point,b:Point,radiusA:number,radiusB:number,tone=1)=>{
  const axis=b.map((v,i)=>v-a[i]) as Point,length=Math.hypot(...axis)||1;
  const direction=axis.map(v=>v/length) as Point;
  const base:Point=Math.abs(direction[1])<.85?[0,1,0]:[1,0,0];
  const cross=(x:Point,y:Point):Point=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  const u=cross(direction,base),ul=Math.hypot(...u),right=u.map(v=>v/ul) as Point,forward=cross(direction,right);
  const start=vertices.length/F,segments=10;
  for(let ring=0;ring<2;ring++)for(let j=0;j<=segments;j++){
   const angle=j/segments*Math.PI*2,radial=right.map((v,k)=>v*Math.cos(angle)+forward[k]*Math.sin(angle)) as Point;
   const center=ring?b:a,radius=ring?radiusB:radiusA;
   vertex(center.map((v,k)=>v+radial[k]*radius) as Point,radial,j/segments,ring,tone);
  }
  for(let j=0;j<segments;j++){const p=start+j,q=p+segments+1;indices.push(p,q,p+1,p+1,q,q+1);}
 };
 const feather=(root:Point,tip:Point,tone:number)=>{
  const start=vertices.length/F,mid:Point=[(root[0]+tip[0])*.5,Math.max(root[1],tip[1])+.025,(root[2]+tip[2])*.5];
  for(const p of [root,[mid[0],mid[1],mid[2]-.12] as Point,tip,[mid[0],mid[1],mid[2]+.13] as Point])vertex(p,[0,1,0],p[0],p[2],tone,Math.min(1,Math.abs(p[0])*1.5));
  indices.push(start,start+1,start+2,start,start+2,start+3);
 };
 return {ellipsoid,taper,feather,finish:():MeshData=>({vertices:new Float32Array(vertices),indices:new Uint32Array(indices)})};
}

/** Low polygon animals share the region lighting and need no per-frame geometry uploads. */
export function wolfMesh():MeshData {
 const m=creature();
 m.ellipsoid([0,.67,0],[.33,.33,.68],.93);
 m.ellipsoid([0,.77,-.42],[.35,.37,.38],1.05);
 m.ellipsoid([0,1.01,-.75],[.24,.21,.30],1.12);
 m.ellipsoid([0,.94,-1.00],[.17,.11,.23],.86);
 for(const side of [-1,1]){
  m.taper([side*.17,1.13,-.78],[side*.20,1.43,-.83],.11,.015,1.1);
  for(const z of [-.41,.42]){m.taper([side*.23,.61,z],[side*.25,.09,z-.07],.115,.075,.72);m.ellipsoid([side*.25,.08,z-.11],[.105,.07,.17],.65);}
 }
 m.taper([0,.72,.60],[0,1.03,1.12],.14,.035,.82);
 return m.finish();
}

export function ravenMesh():MeshData {
 const m=creature();
 m.ellipsoid([0,0,0],[.16,.14,.31],.95);
 m.ellipsoid([0,.14,-.22],[.115,.12,.14],1.08);
 m.taper([0,.11,-.33],[0,.065,-.55],.055,.005,.72);
 m.taper([0,-.025,.24],[0,-.09,.55],.10,.014,.77);
 for(const side of [-1,1]){
  for(let i=0;i<5;i++)m.feather([side*.10,.055,-.16+i*.065],[side*(.52+i*.075),.03,-.22+i*.13],.82+i*.035);
  m.taper([side*.055,-.11,.07],[side*.075,-.28,.11],.022,.008,.67);
 }
 return m.finish();
}
