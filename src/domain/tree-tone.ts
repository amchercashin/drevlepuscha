import {createRandom,seedFor} from './seed.ts';
export const TREE_TONE_VERSION='tree-tone-v2';
/** Stable 48 m grove colour bias plus visible individual crown differences. */
export function treeTone(id:string,e:number,n:number):[number,number,number]{
 const x=e/48,z=n/48,ix=Math.floor(x),iz=Math.floor(z),smooth=(t:number)=>t*t*(3-2*t),u=smooth(x-ix),v=smooth(z-iz);
 const grove=(a:number,b:number)=>createRandom(seedFor(TREE_TONE_VERSION,'grove',a,b))()*2-1;
 const g=(grove(ix,iz)*(1-u)+grove(ix+1,iz)*u)*(1-v)+(grove(ix,iz+1)*(1-u)+grove(ix+1,iz+1)*u)*v;
 const r=createRandom(seedFor(TREE_TONE_VERSION,id)),local=()=>r()*2-1;
 return [.16*(.30*g+.70*local()),.22*(.45*g+.55*local()),.13*(.45*g+.55*local())];
}
