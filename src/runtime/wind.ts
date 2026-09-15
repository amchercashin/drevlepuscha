import {WindWeather,sampleWind} from '../domain/wind.ts';
import type {WindSnapshot} from '../domain/wind.ts';
import presets from '../../config/wind-presets.json';
import type {Point3} from '../domain/harness.ts';

import {DEFAULT_WIND,updateWindSettings} from '../domain/wind-settings.ts';
import type {WindSettings} from '../domain/wind-settings.ts';
export {DEFAULT_WIND};
export type {WindSettings};
/** One scene-owned clock/snapshot, updated before every render including shadows. */
export class WindSystem {
 readonly weather=new WindWeather(presets.forest);
 readonly settings:WindSettings={...DEFAULT_WIND};
 readonly snapshot:WindSnapshot={...this.weather.snapshot,directionToXZ:[...this.weather.snapshot.directionToXZ],fieldPhases:[0,0,0],motionPhases:[0,0]};
 readonly eye:Point3={x:0,y:0,z:0};
 shared=false;enabled=true;detail=true;lastCpuMs=0;
 private gain=1;
 canopyBend=1;coverBend=1;
 private listeners=new Set<()=>void>();
 onChange(listener:()=>void){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
 private changed(){for(const listener of this.listeners)listener();}
 configure(settings:Partial<WindSettings>){
  if(this.shared)return;
  Object.assign(this.settings,updateWindSettings(this.settings,settings));
  this.apply();
 }
 setShared(shared:boolean){if(this.shared===shared)return;this.shared=shared;this.apply();}
 setDetail(detail:boolean){if(this.detail!==detail){this.detail=detail;this.changed();}}
 private apply(){const s=this.shared?DEFAULT_WIND:this.settings;this.enabled=s.enabled;this.weather.setProfile(presets[s.preset]);this.weather.setTuning(s.gustStrength,s.gustFrequency,s.motionSpeed);this.changed();}
 update(dt:number,eye:Point3){
  const start=performance.now();this.weather.update(dt);Object.assign(this.eye,eye);
  const settings=this.shared?DEFAULT_WIND:this.settings,target=settings.intensity;
  const blend=1-Math.exp(-Math.max(0,dt)/.25);
  for(const key of ['canopyBend','coverBend'] as const){this[key]+=(settings[key]-this[key])*blend;if(Math.abs(this[key]-settings[key])<.001)this[key]=settings[key];}
  this.gain+=(target-this.gain)*(1-Math.exp(-Math.max(0,dt)/.25));
  if(Math.abs(target-this.gain)<.001)this.gain=target;
  const s=this.weather.snapshot,d=this.snapshot;
  d.directionToXZ[0]=s.directionToXZ[0];d.directionToXZ[1]=s.directionToXZ[1];
  d.base=s.base;d.gust=s.gust;d.scale=s.scale;
  for(let i=0;i<3;i++)d.fieldPhases[i]=s.fieldPhases[i];
  for(let i=0;i<2;i++)d.motionPhases[i]=s.motionPhases[i];
  this.lastCpuMs=performance.now()-start;
 }
 triggerGust(){if(!this.shared&&this.enabled)this.weather.triggerGust();}
 get intensity(){return this.enabled?this.gain:0;}
 /** Future audio reads strength/gust/turbulence here; it must not roll its own gusts. */
 sampleAt(x:number,y:number,z:number){const s=sampleWind(this.snapshot,x,y,z),gain=this.intensity;return {...s,strength01:Math.min(1,s.strength01*gain),gust01:Math.min(1,s.gust01*gain),turbulence01:Math.min(1,s.turbulence01*gain)};}
 stats(){return {settings:{...(this.shared?DEFAULT_WIND:this.settings)},canopyBend:this.canopyBend,coverBend:this.coverBend,version:'showcase-wind-v1',seed:this.weather.seed,time:this.weather.time,enabled:this.enabled,intensity:this.intensity,preset:(this.shared?DEFAULT_WIND:this.settings).preset,shared:this.shared,detail:this.detail,cpuMs:this.lastCpuMs,sample:this.sampleAt(this.eye.x,this.eye.y,this.eye.z),snapshot:this.snapshot};}
 dispose(){this.listeners.clear();}
}
