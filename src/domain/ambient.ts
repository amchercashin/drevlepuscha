export type PhaseWeights={dawn:number;day:number;dusk:number;night:number};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
/** Follow actual precipitation, including the delayed start/end of weather transitions. */
export function ambientRain(precipitation:number){
 const p=Number.isFinite(precipitation)?clamp(precipitation):0;
 const heavy=smooth((p-.4)/.6),level=.6*smooth(p/.4)+.25*heavy;
 return {precipitation:p,R01:level*Math.sqrt(1-heavy),R02:level*Math.sqrt(heavy),
  wildlife:1-.9*smooth(p),wind:1-.25*smooth(p)};
}
/** The same four hours as the lighting controls, continuously interpolated overnight. */
export function ambientPhase(hour:number,weights:PhaseWeights){
 const h=((hour%24)+24)%24;
 const hours=[0,7.5,12,17.5,24],values=[weights.night,weights.dawn,weights.day,weights.dusk,weights.night];
 const i=hours.findIndex((end,index)=>index>0&&h<end)-1;
 const t=(h-hours[i])/(hours[i+1]-hours[i]),blend=t*t*(3-2*t);
 return values[i]+(values[i+1]-values[i])*blend;
}
/** Use the scene's separate gust signal: total strength saturates under the default wind. */
export function ambientWind(strength:number,gust:number,canopyBend=1.25,coverBend=1.5):Record<string,number>{
 const w=clamp(strength),g=clamp(gust);
 // Quiet air persists between gusts. Rustle follows gusts, not the static tree lean.
 const air=.14*w*(.45+.55*g),canopy=.45*clamp(w*canopyBend/1.25)*(.02+.98*g**1.3),stage=2*g;
 const cover=.2*clamp(w*coverBend/1.5)*(.035+.965*g**1.15);
 return {W01:air*Math.sqrt(1-g),W02:air*Math.sqrt(g),
  W03:canopy*Math.sqrt(Math.max(0,1-stage)),W04:canopy*Math.sqrt(1-Math.abs(stage-1)),
  W05:canopy*Math.sqrt(Math.max(0,stage-1)),W06:cover};
}
