import {createRandom,seedFor} from './seed.ts';
export const ASSET_VARIATION_VERSION='forest-asset-warp-v1';
export interface AssetWarp {bendX:number;bendZ:number;twist:number;spread:number;crownHeight:number;stretchX:number;stretchZ:number;}
export function assetWarp(seed:string,index:number):AssetWarp{
 if(!Number.isInteger(index)||index<0)throw new Error('Variant index must be a nonnegative integer');
 if(index===0)return {bendX:0,bendZ:0,twist:0,spread:1,crownHeight:1,stretchX:1,stretchZ:1};
 const r=createRandom(seedFor(ASSET_VARIATION_VERSION,seed,index));
 return {bendX:(r()-.5)*.10,bendZ:(r()-.5)*.08,twist:(r()-.5)*.4,spread:.86+r()*.28,crownHeight:.92+r()*.16,stretchX:.86+r()*.28,stretchZ:.90+r()*.2};
}
/** Continuous whole-surface warp. Shared junctions remain joined; no new branch topology.
 * Lower six metres of a tree remain untouched for root seating and trunk collisions.
 * Applied once during asset preparation, never to thousands of vertices each frame. */
export function warpAssetPoint(x:number,y:number,z:number,height:number,p:AssetWarp,kind:'tree'|'prop'):[number,number,number]{
 if(!(height>0))throw new Error('Positive source height required');
 const base=kind==='tree'?Math.min(6,height*.6):0,t=Math.max(0,Math.min(1,(y-base)/(height-base))),w=t*t*(3-2*t);
 if(kind==='tree'&&y<=base)return [x,y,z];
 const a=p.twist*w,spread=1+(p.spread-1)*w,c=Math.cos(a),s=Math.sin(a);
 const sx=kind==='prop'?p.stretchX:1,sz=kind==='prop'?p.stretchZ:1;
 return [(x*c-z*s)*spread*sx+p.bendX*height*w*w,base+(y-base)*(1+(p.crownHeight-1)*w),(x*s+z*c)*spread*sz+p.bendZ*height*w*w];
}

export function validateAssetWarp(p:AssetWarp):AssetWarp{
 for(const [key,min,max] of [['bendX',-.1,.1],['bendZ',-.1,.1],['twist',-.5,.5],['spread',.75,1.25],['crownHeight',.8,1.2],['stretchX',.75,1.25],['stretchZ',.75,1.25]] as const){if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`Unsafe ${key}: expected ${min}..${max}`);}
 return p;
}
