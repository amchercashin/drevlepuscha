import type {SpeciesId,WildlifeEnvironment} from './types.ts';
import {choice} from './ids.ts';
const unit=(seed:string,id:string,generation:number)=>choice(seed,id,generation,10000)/9999;
/** Shared daylight and rain gate admission gradually; resident animals finish their episode. */
export function wildlifeAdmission(env:WildlifeEnvironment,species:SpeciesId,seed:string,id:string,generation:number){
 const day=Math.floor(env.totalGameHours/24),light=(species==='roe-deer'?.08:.15)+.16*unit(seed,id+'/dawn',day),rain=.44+.20*unit(seed,id+'/rain',day);
 if(env.daylight01<light||env.precipitation01>rain)return false;
 if(species==='roe-deer'&&generation>0){const hour=((env.totalGameHours%24)+24)%24,peak=Math.max(0,1-Math.abs(hour-6)/4,1-Math.abs(hour-19)/4);if(unit(seed,id+'/activity',day)>.28+.72*peak)return false;}
 return true;
}
export function wildlifeCooldown(baseMs:number,seed:string,id:string,generation:number){return Math.round(baseMs*(.85+.65*unit(seed,id+'/cooldown',generation)));}
