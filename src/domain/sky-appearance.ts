/**
 * Sky look: how much cloud stands in the sky and how the sky evolves with time.
 * Domain only — no Babylon or DOM. Weather (stage 2) reuses the same inputs and
 * changes only coverage, thickness and drift; the shader never learns a weather name.
 */
export const ATMOSPHERE_RANGES={
 coverage:{min:0,max:1.25},
 thickness:{min:0,max:3},
 cloudDrift:{min:0,max:2.5},
 shapeDrift:{min:0,max:3},
 cirrusAmount:{min:0,max:1.5},
 moonScale:{min:.5,max:2.5},
 moonGlow:{min:0,max:2},
 starDensity:{min:0,max:2},
} as const;
export type AtmosphereKnob=keyof typeof ATMOSPHERE_RANGES;

export type Atmosphere={enabled:boolean}&Record<AtmosphereKnob,number>;
/** Thin, high veil: few clouds, strong shape change, weak opacity. */
export const DEFAULT_ATMOSPHERE:Atmosphere={enabled:true,coverage:.48,thickness:1,cloudDrift:1,shapeDrift:1,cirrusAmount:.55,moonScale:1,moonGlow:1,starDensity:1};
const PRESET_NAMES=['clear','fair','overcast','rain','storm'] as const;
export type WeatherPresetName=typeof PRESET_NAMES[number];
/** Stage 2 vocabulary, expressed now as target sets of the same inputs. */
export const WEATHER_PRESETS:Record<WeatherPresetName,Omit<Atmosphere,'enabled'>>={
 clear:{coverage:.16,thickness:.85,cloudDrift:1,shapeDrift:1,cirrusAmount:.35,moonScale:1,moonGlow:1,starDensity:1},
 fair:{coverage:.48,thickness:1,cloudDrift:1,shapeDrift:1,cirrusAmount:.55,moonScale:1,moonGlow:1,starDensity:1},
 overcast:{coverage:1.00,thickness:1.35,cloudDrift:1.15,shapeDrift:.85,cirrusAmount:.75,moonScale:1,moonGlow:1,starDensity:1},
 rain:{coverage:1.12,thickness:1.9,cloudDrift:1.3,shapeDrift:.7,cirrusAmount:.5,moonScale:1,moonGlow:1,starDensity:1},
 storm:{coverage:1.24,thickness:2.7,cloudDrift:1.6,shapeDrift:.55,cirrusAmount:.3,moonScale:1,moonGlow:1,starDensity:1},
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function normalizeAtmosphere(input:Partial<Atmosphere>&{enabled?:boolean}){
 const result:Atmosphere={...DEFAULT_ATMOSPHERE};
 if(typeof input?.enabled==='boolean')result.enabled=input.enabled;
 for(const key of Object.keys(ATMOSPHERE_RANGES) as AtmosphereKnob[]){
  const value=input?.[key];if(typeof value!=='number'||!Number.isFinite(value))continue;
  const range=ATMOSPHERE_RANGES[key];result[key]=clamp(value,range.min,range.max);
 }
 return result;
}

/** One wind direction for the whole sky. Weather later supplies its own strength. */
export type CloudWind={azimuth:number;speed:number};
export type CloudOffset={x:number;y:number;shapeX:number;shapeY:number};
/** Drift keeps moving cloud across the dome; morph slowly reshapes it. The two
 * rates differ by design: a boiling sky reads as smoke, a frozen one as paint. */
export const CLOUD_DRIFT_RATE=.00045;
export const CLOUD_MORPH_RATE=.0035;

export type SkyAppearanceType={time:number;hours:number;coverage:number;thickness:number;cirrus:number;moonScale:number;moonGlow:number;starDensity:number;cloudX:number;cloudY:number;morphX:number;morphY:number};

export function advanceClouds(offset:CloudOffset,wind:CloudWind,atmosphere:Atmosphere,dt:number){
 if(!Number.isFinite(dt))throw new Error('Sky time step must be finite');
 const step=Math.max(0,Math.min(dt,.1));
 const distance=CLOUD_DRIFT_RATE*atmosphere.cloudDrift*wind.speed*step;
 const shape=CLOUD_MORPH_RATE*atmosphere.shapeDrift*step;
 return {x:offset.x+Math.cos(wind.azimuth)*distance,y:offset.y+Math.sin(wind.azimuth)*distance,
  shapeX:offset.shapeX+shape,shapeY:offset.shapeY+shape*.61};
}

/** Everything the sky draw needs for one hour and one atmosphere. Pure and clamped. */
export function skyAppearanceAt(hours:number,atmosphere:Atmosphere,clouds:CloudOffset):SkyAppearanceType{
 if(!Number.isFinite(hours))throw new Error('Sky time must be finite');
 const enabled=atmosphere.enabled;
 return {time:hours, hours,
  coverage:enabled?atmosphere.coverage:0,
  thickness:enabled?atmosphere.thickness:1,
  cirrus:enabled?atmosphere.cirrusAmount:0,
  moonScale:atmosphere.moonScale,
  moonGlow:atmosphere.moonGlow,
  starDensity:atmosphere.starDensity,
  cloudX:clouds.x,cloudY:clouds.y,morphX:clouds.shapeX,morphY:clouds.shapeY};
}
export function skyRoll(offset:CloudOffset){return {x:offset.x,y:offset.y,shapeX:offset.shapeX,shapeY:offset.shapeY};}
/** Coarse key so the runtime reapplies uniforms for shape changes, not only for the hour. */
export function skyAppearanceKey(s:SkyAppearanceType,quantise=1000){
 return [s.time,s.coverage,s.thickness,s.cirrus,s.moonScale,s.moonGlow,s.starDensity,
  Math.round(s.cloudX*quantise),Math.round(s.cloudY*quantise),Math.round(s.morphX*quantise),Math.round(s.morphY*quantise)].join(':');
}
export function weatherPreset(name:WeatherPresetName,enabled=true):Atmosphere{
 const preset=WEATHER_PRESETS[name];if(!preset)throw new Error(`Unknown weather preset ${name}`);
 return {...preset,enabled};
}
/** Moon phase geometry. Stage 1 keeps the authored full moon; the cycle is staged for stage 4. */
export const MOON_CYCLE_DAYS=29.53;
export type MoonModel='full'|'cycle';
export function moonPhaseAt(elapsedDays:number,model:MoonModel){
 if(!Number.isFinite(elapsedDays))throw new Error('Moon cycle position must be finite');
 if(model==='full')return {phase:0,illumination:1};
 const phase=((elapsedDays/MOON_CYCLE_DAYS)%1+1)%1;
 return {phase,illumination:(1-Math.cos(phase*2*Math.PI))/2};
}
