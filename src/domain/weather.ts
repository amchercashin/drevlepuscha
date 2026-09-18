export type WeatherPreset='clear'|'mixed'|'overcast'|'rain'|'downpour';
export type WeatherMode=WeatherPreset|'auto'|'custom';
export interface WeatherState {
 lowCoverage:number;lowOpticalDepth:number;highCoverage:number;highOpticalDepth:number;
 ambientScale:number;fogDensityAdd:number;raysScale:number;precipitation:number;
}
export const WEATHER_PRESETS:Record<WeatherPreset,WeatherState>={
 clear:{lowCoverage:.43,lowOpticalDepth:2.5,highCoverage:.25,highOpticalDepth:.35,ambientScale:1,fogDensityAdd:0,raysScale:1,precipitation:0},
 mixed:{lowCoverage:.62,lowOpticalDepth:3.5,highCoverage:.35,highOpticalDepth:.55,ambientScale:.94,fogDensityAdd:.001,raysScale:.8,precipitation:0},
 overcast:{lowCoverage:1,lowOpticalDepth:8,highCoverage:.6,highOpticalDepth:1,ambientScale:.80,fogDensityAdd:.003,raysScale:.25,precipitation:0},
 rain:{lowCoverage:1,lowOpticalDepth:12,highCoverage:.8,highOpticalDepth:2,ambientScale:.73,fogDensityAdd:.005,raysScale:.08,precipitation:.4},
 downpour:{lowCoverage:1,lowOpticalDepth:16,highCoverage:1,highOpticalDepth:3,ambientScale:.68,fogDensityAdd:.008,raysScale:0,precipitation:1},
};
export const WEATHER_LABELS:Record<WeatherPreset,string>={clear:'Ясно',mixed:'Переменная облачность',overcast:'Пасмурно',rain:'Дождь',downpour:'Ливень'};
export interface WeatherTransition {from:WeatherState;to:WeatherState;startedAtSeconds:number;durationSeconds:number;cloudWindow:readonly [number,number];rainWindow:readonly [number,number]}
const keys=Object.keys(WEATHER_PRESETS.clear) as (keyof WeatherState)[];
function finite(n:number){if(!Number.isFinite(n))throw Error('Weather values must be finite');return n;}
const ease=(u:number)=>{const t=Math.max(0,Math.min(1,u));return t*t*(3-2*t);};
export function weatherState(s:WeatherState):WeatherState {
 const result={...s};for(const key of keys){const max=key.endsWith('OpticalDepth')?16:key==='fogDensityAdd'?.04:1;result[key]=Math.max(0,Math.min(max,finite(s[key])));}return result;
}
export function startWeatherTransition(from:WeatherState,to:WeatherState,now:number,duration=12):WeatherTransition {
 const increasing=to.precipitation>from.precipitation,decreasing=to.precipitation<from.precipitation;
 return {from:weatherState(from),to:weatherState(to),startedAtSeconds:finite(now),durationSeconds:Math.max(0,finite(duration)),cloudWindow:decreasing?[.25,1]:[0,1],rainWindow:increasing?[.35,1]:decreasing?[0,.45]:[0,1]};
}
export function evaluateTransition(t:WeatherTransition,now:number):WeatherState {
 finite(now);finite(t.startedAtSeconds);finite(t.durationSeconds);
 const from=weatherState(t.from),to=weatherState(t.to);
 for(const [a,b] of [t.rainWindow,t.cloudWindow])if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>1||a>=b)throw Error('Invalid weather transition window');
 if(now<t.startedAtSeconds)return from;if(t.durationSeconds<=0)return to;
 const progress=(now-t.startedAtSeconds)/t.durationSeconds,result={...from};
 for(const key of keys){const [a,b]=key==='precipitation'?t.rainWindow:t.cloudWindow;const amount=ease((progress-a)/(b-a));result[key]=from[key]+(to[key]-from[key])*amount;}
 return result;
}
// Fixed, versioned scenario. No frame-by-frame history and no changes to cloud speeds.
export const WEATHER_VERSION=1,WEATHER_SEED=1709;
const order:WeatherPreset[]=['clear','mixed','overcast','rain','downpour','rain','overcast','mixed','clear'];
export const WEATHER_SEGMENTS=order.map((preset,i)=>({preset,seconds:140+((Math.imul(i+WEATHER_SEED,1597334677)>>>0)%121)}));
export const WEATHER_PERIOD_SECONDS=WEATHER_SEGMENTS.reduce((sum,s)=>sum+s.seconds,0);
const timeline=WEATHER_SEGMENTS.map((segment,i)=>startWeatherTransition(WEATHER_PRESETS[WEATHER_SEGMENTS[(i+WEATHER_SEGMENTS.length-1)%WEATHER_SEGMENTS.length].preset],WEATHER_PRESETS[segment.preset],0,24));
export function automaticWeather(seconds:number){
 finite(seconds);let local=((seconds%WEATHER_PERIOD_SECONDS)+WEATHER_PERIOD_SECONDS)%WEATHER_PERIOD_SECONDS;
 for(let i=0;i<WEATHER_SEGMENTS.length;i++){
  const segment=WEATHER_SEGMENTS[i];if(local<segment.seconds){
   return {preset:segment.preset,state:evaluateTransition(timeline[i],local)};
  }local-=segment.seconds;
 }
 return {preset:'clear' as const,state:{...WEATHER_PRESETS.clear}};
}
