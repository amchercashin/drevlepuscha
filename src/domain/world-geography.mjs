import {createGeography,pointInRing} from './geography.mjs';
/** Runtime includes the authored meadow outside the forest; terrain generation stays unchanged. */
export function createWorldGeography(g){
 const base=createGeography(g),meadow=g.zones.find(z=>z.id==='eastern_opening');
 return {...base,zoneAt:(e,n)=>base.zoneAt(e,n)??(meadow&&pointInRing(e,n,meadow.selector.coordinates)?meadow:null)};
}
