import {createRandom,seedFor} from './seed.ts';
export const TREE_TONE_VERSION='tree-tone-v1';
/** Stable, smoothly blended 48 m groves plus restrained individual differences. */
export function treeTone(id:string,e:number,n:number):[number,number,number]{
 const x=e/48,z=n/48,ix=Math.floor(x),iz=Math.floor(z),smooth=(t:number)=>t*t*(3-2*t),u=smooth(x-ix),v=smooth(z-iz);
 const grove=(a:number,b:number)=>createRandom(seedFor(TREE_TONE_VERSION,'grove',a,b))()*2-1;
 const g=(grove(ix,iz)*(1-u)+grove(ix+1,iz)*u)*(1-v)+(grove(ix,iz+1)*(1-u)+grove(ix+1,iz+1)*u)*v;
 const r=createRandom(seedFor(TREE_TONE_VERSION,id)),local=()=>r()*2-1;
 return [.08*(.45*g+.55*local()),.06*(.85*g+.15*local()),.06*(.65*g+.35*local())];
}
