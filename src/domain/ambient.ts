export type PhaseWeights={dawn:number;day:number;dusk:number;night:number};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
/** The same four hours as the lighting controls, continuously interpolated overnight. */
export function ambientPhase(hour:number,weights:PhaseWeights){
 const h=((hour%24)+24)%24;
 const hours=[0,7.5,12,17.5,24],values=[weights.night,weights.dawn,weights.day,weights.dusk,weights.night];
 const i=hours.findIndex((end,index)=>index>0&&h<end)-1;
 const t=(h-hours[i])/(hours[i+1]-hours[i]),blend=t*t*(3-2*t);
 return values[i]+(values[i+1]-values[i])*blend;
}
/** No weather clock here: strength comes directly from the vegetation's WindSystem. */
export function ambientWind(strength:number):Record<string,number>{
 const w=clamp(strength),air=.65*Math.pow(w,.7),canopy=.9*w,stage=2*w;
 return {W01:air*Math.sqrt(1-w),W02:air*Math.sqrt(w),
  W03:canopy*Math.sqrt(Math.max(0,1-stage)),W04:canopy*Math.sqrt(1-Math.abs(stage-1)),
  W05:canopy*Math.sqrt(Math.max(0,stage-1)),W06:.5*Math.pow(w,1.2)};
}
