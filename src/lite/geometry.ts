/** Mesh helpers without Babylon.js. Lite is left-handed; terrain keeps the authored RH winding. */
export function computeNormals(positions:ArrayLike<number>,indices:ArrayLike<number>,rightHanded=false):Float32Array{
 const n=new Float32Array(positions.length);
 const s=rightHanded?-1:1;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const e1x=positions[b]-positions[a],e1y=positions[b+1]-positions[a+1],e1z=positions[b+2]-positions[a+2];
  const e2x=positions[c]-positions[a],e2y=positions[c+1]-positions[a+1],e2z=positions[c+2]-positions[a+2];
  const nx=s*(e1y*e2z-e1z*e2y),ny=s*(e1z*e2x-e1x*e2z),nz=s*(e1x*e2y-e1y*e2x);
  n[a]+=nx;n[a+1]+=ny;n[a+2]+=nz;n[b]+=nx;n[b+1]+=ny;n[b+2]+=nz;n[c]+=nx;n[c+1]+=ny;n[c+2]+=nz;
 }
 for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}
 return n;
}
export function asF32(data:ArrayLike<number>):Float32Array{return data instanceof Float32Array?data:new Float32Array(data);}
export function asU32(data:ArrayLike<number>):Uint32Array{return data instanceof Uint32Array?data:new Uint32Array(data);}
export function hexRgb(hex:string):[number,number,number]{
 const h=hex.startsWith('#')?hex.slice(1):hex;
 return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];
}
