import {showcaseEnabled} from './showcase.ts';
import {groundHeight} from './harness.ts';
import type {Box} from './harness.ts';
import {generateForestPlacements} from './forest-layout.ts';
import type {TreePlacement,TreeVariation} from './forest-layout.ts';
export {FOREST_VERSION,FOREST_BOUNDS} from './forest-layout.ts';
export type {TreePlacement,TreeVariation} from './forest-layout.ts';
export function forestPlacements(rootRadiusM=3.8,variation?:TreeVariation):TreePlacement[]{
 return generateForestPlacements({mode:showcaseEnabled?'showcase':'legacy-m1',rootRadiusM,variation,heightAt:groundHeight});
}
export function treeCollider(t:TreePlacement,radiusM=1.18):Box{
 const radius=radiusM*Math.max(t.width,t.depth)+6*t.height*Math.hypot(t.leanX,t.leanZ);
 return {id:t.id,min:{x:t.e-radius,y:t.y,z:-t.n-radius},max:{x:t.e+radius,y:t.y+6*t.height,z:-t.n+radius}};
}
/** Distance to crown envelope, with a protected near zone and hysteresis. */
export function treeLevel(distance:number,current:number):number{
 if(current===0)return distance>22?1:0;
 if(current===1)return distance<18?0:distance>53?2:1;
 return distance<46?1:2;
}
