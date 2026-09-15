import {createRandom,seedFor} from './seed.ts';

export type WindPreset='forest'|'enchanted';
export type WindProfile={base:number;gust:number;decay:number;scale:number};
export const WIND_VERSION='showcase-wind-v1';
export const TAU=Math.PI*2;
export const WIND_WAVES=[[.115,.073],[.047,-.151],[-.181,.031]] as const;
export const wrapPhase=(x:number)=>((x%TAU)+TAU)%TAU;
export const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function gustEnvelope(age:number,rise:number,decay:number){return age<0?0:age<rise?smooth(age/rise):1-smooth((age-rise)/decay);}
export interface WindSnapshot {
 directionToXZ:[number,number];base:number;gust:number;scale:number;
 fieldPhases:[number,number,number];motionPhases:[number,number];
}
export interface WindSample {directionToXZ:readonly[number,number];strength01:number;gust01:number;turbulence01:number}
/** The GPU implements this same broad field; y is reserved for future exposure/audio. */
export function sampleWind(s:WindSnapshot,x:number,_y:number,z:number):WindSample{
 const p=s.fieldPhases,w=WIND_WAVES;
 const field=.5+.22*Math.sin((x*w[0][0]+z*w[0][1])*s.scale-p[0])+.17*Math.sin((x*w[1][0]+z*w[1][1])*s.scale-p[1])+.11*Math.sin((x*w[2][0]+z*w[2][1])*s.scale-p[2]);
 const gust=s.gust*(.25+.75*field);
 return {directionToXZ:s.directionToXZ,strength01:Math.min(1,s.base*(.78+.22*field)+gust),gust01:Math.min(1,gust),turbulence01:Math.min(1,field*(s.base+gust))};
}

/** Fixed weather steps make schedules/advection independent of render FPS and tile order.
 * Only individual periodic phases wrap, so multi-hour GPU precision stays bounded. */
export class WindWeather {
 readonly seed:string;
 readonly snapshot:WindSnapshot={directionToXZ:[1,0],base:.22,gust:0,scale:1,fieldPhases:[0,0,0],motionPhases:[0,0]};
 time=0;
 private remainder=0;
 private random:()=>number;
 private nextGust=4;private gustStart=-100;private rise=2;private peak=1;
 private nextDirection=0;private directionStart=0;private duration=15;private from=.45;private target=.45;
 private angle=.45;
 private profile:WindProfile;
 private gustStrength=1;private gustFrequency=1;private motionSpeed=1;
 constructor(profile:WindProfile,seed=WIND_VERSION){this.profile=profile;this.seed=seed;this.random=createRandom(seedFor(seed));this.snapshot.scale=profile.scale;this.snapshot.base=profile.base;this.snapshot.directionToXZ=[Math.cos(this.angle),Math.sin(this.angle)];}
 setProfile(profile:WindProfile){this.profile=profile;}
 setTuning(strength:number,frequency:number,speed:number){
  if(frequency!==this.gustFrequency){this.nextGust=Math.max(this.gustStart+this.rise+this.profile.decay+1,this.time+(this.nextGust-this.time)*this.gustFrequency/frequency);}
  this.gustStrength=strength;this.gustFrequency=frequency;this.motionSpeed=speed;
 }
 triggerGust(){this.nextGust=this.time;}
 update(dt:number){
  // Stalls/hidden time do not catch up through a whole weather event.
  if(!Number.isFinite(dt)||dt<=0||dt>.25)return;
  this.remainder+=dt;
  while(this.remainder+1e-10>=1/60){this.remainder-=1/60;this.step(1/60);}
 }
 private step(dt:number){
  this.time+=dt;const s=this.snapshot,p=this.profile;
  if(this.time>=this.nextDirection){this.from=this.angle;this.target=this.from+(this.random()<.5?-1:1)*(.26+this.random()*.52);this.directionStart=this.time;this.duration=10+this.random()*15;this.nextDirection=this.time+40+this.random()*60;}
  this.angle=this.from+angleDelta(this.from,this.target)*smooth((this.time-this.directionStart)/this.duration);
  if(this.time>=this.nextGust){this.gustStart=this.time;this.rise=1+this.random()*2;this.peak=.65+this.random()*.35;this.nextGust=this.time+Math.max(this.rise+p.decay+1,(12+this.random()*18)/this.gustFrequency);}
  const response=1-Math.exp(-dt/3);
  s.base+=(p.base-s.base)*response;s.scale+=(p.scale-s.scale)*response;
  const desired=p.gust*this.gustStrength*this.peak*gustEnvelope(this.time-this.gustStart,this.rise,p.decay);
  s.gust+=(desired-s.gust)*(1-Math.exp(-dt/.6));
  s.directionToXZ[0]=Math.cos(this.angle);s.directionToXZ[1]=Math.sin(this.angle);
  const speed=(1.2+s.base*2+s.gust*3)*this.motionSpeed;
  for(let i=0;i<3;i++)s.fieldPhases[i]=wrapPhase(s.fieldPhases[i]+dt*speed*s.scale*(WIND_WAVES[i][0]*s.directionToXZ[0]+WIND_WAVES[i][1]*s.directionToXZ[1]));
  s.motionPhases[0]=wrapPhase(s.motionPhases[0]+dt*.72*this.motionSpeed);s.motionPhases[1]=wrapPhase(s.motionPhases[1]+dt*2.1*this.motionSpeed);
 }
 sampleAt(x:number,y:number,z:number){return sampleWind(this.snapshot,x,y,z);}
}
