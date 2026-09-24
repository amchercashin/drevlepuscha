import {showcaseHeight,showcasePath} from '../domain/showcase.ts';
import type {NativeRegionVisuals} from './region-visuals.ts';

/** The ravine's authored sun gaps. Other regions provide their own positions and style. */
export const showcaseVisuals:NativeRegionVisuals={
 lightShafts:[8,20,34,50].map((n,i)=>{
  const e=showcasePath(n)+(i%2?2.5:-2.5);
  return {e,n,height:showcaseHeight(e,n)+.4,radius:1.8};
 }),
 shaftGain:.08,
 fogDistanceScale:.9,
};
