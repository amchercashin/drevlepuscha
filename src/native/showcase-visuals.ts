import {showcaseHeight,showcasePath} from '../domain/showcase.ts';
import type {NativeRegionVisuals} from './region-visuals.ts';
import foliageAtlasUrl from '../../assets/optimized/showcase/foliage.webp';

/** The ravine's authored sun gaps. Other regions provide their own positions and style. */
export const showcaseVisuals:NativeRegionVisuals={
 lightShafts:[8,20,34,50].map((n,i)=>{
  const e=showcasePath(n)+(i%2?2.5:-2.5);
  return {e,n,height:showcaseHeight(e,n)+.4,radius:1.8};
 }),
 shaftGain:.08,
 fogDistanceScale:.9,
 finishes:{
  terrain:{roughness:.94,translucency:0},
  trunk:{roughness:.86,translucency:0},
  cloth:{roughness:.91,translucency:0},
  foliage:{roughness:.57,translucency:.30},
  stone:{roughness:.68,translucency:0},
  timber:{roughness:.82,translucency:0},
 },
 treeLod:{
  high:{near:60,far:132,blend:8},
  balanced:{near:35,far:95,blend:6},
  performance:{near:23,far:65,blend:4},
  drawDistance:190,
 },
 foliageAtlasUrl,
 crownLeaves:{count:480,scale:1.4,lift:.18,tint:[.84,.96,.80],atlasQuadrants:[0,1,3]},
};
