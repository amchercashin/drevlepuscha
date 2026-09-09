import {showcaseEnabled} from './showcase.ts';
import {createRandom,seedFor} from './seed.ts';
import type {TreePlacement} from './forest.ts';
/** Keep protected camera probes. Shared 64m groves avoid multiplying distant draws. */
export function treeFamilySlot(p:Pick<TreePlacement,'id'|'e'|'n'>,counts:readonly [number,number]=[3,3]):number{
 if(['narrow-left','narrow-right','camera-trunk','canopy-probe'].includes(p.id))return 0;
 if(showcaseEnabled){const r=createRandom(seedFor('ravine-species',p.id)),f=r();return f<.16?0:f<.38?1+Math.floor(r()*counts[0]):1+counts[0]+Math.floor(r()*counts[1]);}
 const local=p.id.startsWith('m1-tree-');
 const key=local?p.id:`${Math.floor(p.e/64)}:${Math.floor(p.n/64)}`;
 const r=createRandom(seedFor('forest-families-v1',key)),family=r();
 return family<.55?0:family<.82?1+Math.floor(r()*counts[0]):1+counts[0]+Math.floor(r()*counts[1]);
}
