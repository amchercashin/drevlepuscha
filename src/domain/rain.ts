export const RAIN_TILE_SIZE=16,RAIN_RADIUS=16,RAIN_HEIGHT=24,RAIN_PERIOD=256;
export const RAIN_SEED=613;
function random(tileX:number,tileZ:number,index:number,salt:number){
 let h=(Math.imul(tileX,374761393)+Math.imul(tileZ,668265263)+Math.imul(index+RAIN_SEED,1274126177)+Math.imul(salt,2246822519))>>>0;
 h=Math.imul(h^(h>>>13),1274126177)>>>0;return ((h^(h>>>16))>>>0)/4294967296;
}
/** Stable world-column identity, unaffected by camera translation or quality. */
export function rainDrop(tileX:number,tileZ:number,index:number){
 return {x:(tileX+random(tileX,tileZ,index,0))*RAIN_TILE_SIZE,z:(tileZ+random(tileX,tileZ,index,1))*RAIN_TILE_SIZE,
  phase:random(tileX,tileZ,index,2),harmonic:192+Math.floor(random(tileX,tileZ,index,3)*80),length:.55+random(tileX,tileZ,index,4)*.65,
  threshold:random(tileX,tileZ,index,5)};
}
export function rainTiles(x:number,z:number){
 const cx=Math.floor(x/RAIN_TILE_SIZE),cz=Math.floor(z/RAIN_TILE_SIZE),tiles:[number,number][]=[];
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)tiles.push([cx+dx,cz+dz]);return tiles;
}
export function rainHeight(seconds:number,drop:ReturnType<typeof rainDrop>,floor:number){
 const phase=((seconds*drop.harmonic/RAIN_PERIOD+drop.phase)%1+1)%1;return floor+(1-phase)*RAIN_HEIGHT;
}
