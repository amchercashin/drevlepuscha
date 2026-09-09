import {PLAYER_RADIUS} from './harness.ts';
import type {Box,Walker} from './harness.ts';

/** Static broad phase only: movement still uses the original exact hull tests. */
export function collisionGrid(boxes:readonly Box[],size=16){
 const cells=new Map<string,Box[]>();
 for(const b of boxes)for(let x=Math.floor(b.min.x/size);x<=Math.floor(b.max.x/size);x++)for(let z=Math.floor(b.min.z/size);z<=Math.floor(b.max.z/size);z++){
  const key=`${x}:${z}`,cell=cells.get(key);if(cell)cell.push(b);else cells.set(key,[b]);
 }
 return (p:Walker,de:number,dn:number)=>{
  const found=new Set<Box>();
  for(let x=Math.floor((Math.min(p.e,p.e+de)-PLAYER_RADIUS)/size);x<=Math.floor((Math.max(p.e,p.e+de)+PLAYER_RADIUS)/size);x++)
   for(let z=Math.floor((Math.min(-p.n,-p.n-dn)-PLAYER_RADIUS)/size);z<=Math.floor((Math.max(-p.n,-p.n-dn)+PLAYER_RADIUS)/size);z++)
    for(const b of cells.get(`${x}:${z}`)??[])found.add(b);
  return [...found];
 };
}
