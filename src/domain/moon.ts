import {normalizeHour} from './daylight.ts';
import type {Direction} from './daylight.ts';

export type MoonState={direction:Direction;phase:number;illuminatedFraction:number};
export type MoonSettings={mode:'cycle'|'full'|'fixed';fixedPhase:number;periodDays:number;phaseAtEpoch:number};
export const MOON_DEFAULTS:MoonSettings={mode:'cycle',fixedPhase:.5,periodDays:28,phaseAtEpoch:.5};
const wrap=(v:number)=>((v%1)+1)%1;
export function moonSettings(base=MOON_DEFAULTS,patch:Partial<MoonSettings>={}):MoonSettings {
 const s={...base,...patch};
 if(!['cycle','full','fixed'].includes(s.mode)||![s.fixedPhase,s.periodDays,s.phaseAtEpoch].every(Number.isFinite)||s.periodDays<1)throw Error('Invalid lunar settings');
 return {...s,fixedPhase:wrap(s.fixedPhase),phaseAtEpoch:wrap(s.phaseAtEpoch)};
}
export function moonAt(hour:number,phase:number):MoonState {
 if(!Number.isFinite(phase))throw Error('Phase must be finite');
 const p=wrap(phase),a=(normalizeHour(hour)-6)*Math.PI/12,b=a-2*Math.PI*p;
 const direction:Direction=[Math.cos(b),.82*Math.sin(b),-Math.sqrt(1-.82**2)*Math.sin(b)];
 return {direction,phase:p,illuminatedFraction:Math.max(0,Math.min(1,(1-Math.cos(2*Math.PI*p))/2))};
}
export function moonAtTotalHours(totalHours:number,settings=MOON_DEFAULTS){
 if(!Number.isFinite(totalHours))throw Error('Game time must be finite');
 const phase=settings.mode==='full'?.5:settings.mode==='fixed'?settings.fixedPhase:settings.phaseAtEpoch+(totalHours-12)/(24*settings.periodDays);
 return moonAt(totalHours,phase);
}
/** Change hour inside the selected day, without advancing a month by slider scrubbing. */
export function gameHourOnDay(totalHours:number,hour:number){return Math.floor(totalHours/24)*24+normalizeHour(hour);}
export function gameDayAtHour(day:number,hour:number){
 if(!Number.isSafeInteger(day)||day<0)throw Error('Game day must be a nonnegative integer');
 return day*24+normalizeHour(hour);
}
