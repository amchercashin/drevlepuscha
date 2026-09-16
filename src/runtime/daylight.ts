import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import type {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {daylightAt,normalizeHour,CYCLE_SECONDS} from '../domain/daylight.ts';
import {createDaySky} from './day-sky.ts';
import {createShowcaseSky} from './showcase-sky.ts';
import {skyModeFromParams} from '../domain/sky-scene.ts';
import type {SkyMode} from '../domain/sky-scene.ts';
import type {NewSky,NewSkyOptions} from './new-sky.ts';
import {createNewSky} from './new-sky.ts';
import type {Atmosphere} from '../domain/sky-appearance.ts';
import {clockHour} from '../network/persistent-protocol.ts';
import type {WorldClock} from '../network/persistent-protocol.ts';
import './daylight.css';

type Air={setRays:(enabled:boolean)=>void}|null;
export type DaylightOptions={sky?:SkyMode;newSky?:NewSkyOptions;pausableSky?:boolean};
export function createDaylight(scene:Scene,camera:Camera,sun:DirectionalLight,fill:HemisphericLight,air:Air,options:DaylightOptions={}){
 const mode:SkyMode=options.sky??(options.pausableSky?'showcase':'legacy');
 const animatedSky=mode==='showcase'?createShowcaseSky(scene,camera):mode==='new'?createNewSky(scene,camera,options.newSky??{}):null;
 const newSky=mode==='new'?(animatedSky as NewSky):null;
 const sky=animatedSky??createDaySky(scene,camera);
 const foliage=scene.materials.filter((m):m is StandardMaterial=>m instanceof StandardMaterial&&['grass','floor-leaves','cover-mid','cover-far'].includes(m.name)).map(m=>({material:m,emission:m.emissiveColor.clone()}));
 let sharedClock:WorldClock|null=null,previous:{hours:number;automatic:boolean}|null=null;
 let hours=12,automatic=mode!=='legacy',rays=false,last=NaN,current=daylightAt(hours),lightingDirty=true,appearanceDirty=true;
 const controls=document.createElement('section');controls.className='daylight-controls';controls.setAttribute('aria-label','Время суток');
 controls.innerHTML=`<div class="daylight-heading"><strong>Свет и небо</strong><output id="day-time-value">12:00</output></div>
 <div class="daylight-presets"><button type="button" data-hour="7.5">Утро</button><button type="button" data-hour="12">День</button><button type="button" data-hour="17.5">Закат</button><button type="button" data-hour="0">Ночь</button></div>
 <label for="day-time">Время суток</label><input id="day-time" type="range" min="0" max="24" step="0.05" value="12" aria-valuetext="12:00">
 <label><input id="day-auto" type="checkbox"> Смена суток · 20 минут</label>
 <label><input id="day-rays" type="checkbox"> Художественные лучи</label>
 <label for="fog-density">Туман <output id="fog-density-value">0.011</output></label><input id="fog-density" type="range" min="0" max="0.04" step="0.001" value="0.011">`;
 document.querySelector('#diagnostics')!.insertBefore(controls,document.querySelector('#metrics'));
 const range=controls.querySelector<HTMLInputElement>('#day-time')!,output=controls.querySelector<HTMLOutputElement>('output')!;
 const auto=controls.querySelector<HTMLInputElement>('#day-auto')!,rayToggle=controls.querySelector<HTMLInputElement>('#day-rays')!,fogRange=controls.querySelector<HTMLInputElement>('#fog-density')!,fogOutput=controls.querySelector<HTMLOutputElement>('#fog-density-value')!;
 if(!air)rayToggle.closest('label')!.hidden=true;
 let lastSync=-Infinity;
 function sync(force=false){
  const now=performance.now();
  if(!force&&(!document.querySelector<HTMLDetailsElement>('#diagnostics')!.open||now-lastSync<250))return;
  lastSync=now;
  const minutes=Math.round(hours*60)%1440,text=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  output.value=text;range.value=String(hours);range.setAttribute('aria-valuetext',text);
  for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.hour)-hours)<.03));
 }
 /**
  * The hour alone is not the whole state any more: coverage, thickness, phase and
  * cloud drift change the sky while the clock stands still, so they get their own
  * dirty flag instead of relying on `hours` having moved.
  */
 function apply(){
  if(lightingDirty&&hours!==last){last=hours;current=daylightAt(hours);
   sun.direction.set(...current.direction);sun.intensity=current.mainIntensity;sun.diffuse.set(...current.mainColor);
   fill.intensity=current.fillIntensity;fill.diffuse.set(...current.fillColor);
   fill.groundColor.set(.2,.26,.2);fill.groundColor.scaleInPlace(.35+.65*current.daylight);
   scene.fogColor.set(...current.fogColor);scene.clearColor=new Color4(...current.horizon,1);
   for(const {material,emission} of foliage)emission.scaleToRef(current.emissionScale,material.emissiveColor);
   lightingDirty=false;
  }
  if(!appearanceDirty)return;
  appearanceDirty=false;sky.update(current);sync();
 }
 function setTime(hour:number){if(sharedClock)return;hours=normalizeHour(hour);automatic=false;auto.checked=false;lightingDirty=true;apply();sync(true);}
 function setAutomatic(value:boolean){if(sharedClock)return;automatic=value;auto.checked=value;}
 function setClock(clock:WorldClock|null){
  if(!!clock!==!!sharedClock){
   if(clock){previous={hours,automatic};auto.checked=true;}
   else if(previous){hours=previous.hours;automatic=previous.automatic;auto.checked=automatic;previous=null;}
   range.disabled=auto.disabled=!!clock;
   for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.disabled=!!clock;
   controls.title=clock?'Время задаётся постоянной комнатой':'';
  }
  sharedClock=clock;
 }
 function setRays(value:boolean){rays=Boolean(value);rayToggle.checked=rays;air?.setRays(rays);}
 function setFog(value:number){const density=Math.max(0,Math.min(.04,value));scene.fogDensity=density;fogRange.value=density.toFixed(3);fogOutput.value=density.toFixed(3);}
 for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.onclick=()=>setTime(Number(b.dataset.hour));
 range.oninput=()=>setTime(Number(range.value));auto.onchange=()=>setAutomatic(auto.checked);rayToggle.onchange=()=>setRays(rayToggle.checked);fogRange.oninput=()=>setFog(Number(fogRange.value));
 function update(dt:number){
  const previous=hours;
  if(sharedClock)hours=clockHour(sharedClock);else if(automatic&&dt>0)hours=normalizeHour(hours+Math.min(dt,.05)*24/CYCLE_SECONDS);
  if(hours!==previous)lightingDirty=true;
  // Cloud drift and the star clock keep running while the hour stands still.
  if(newSky?.step(dt))appearanceDirty=true;
  apply();
 }
 const details=document.querySelector<HTMLDetailsElement>('#diagnostics')!;
 const opened=()=>{if(details.open)sync(true);};details.addEventListener('toggle',opened);
 scene.onDisposeObservable.add(()=>{controls.remove();details.removeEventListener('toggle',opened);});setFog(scene.fogDensity);auto.checked=automatic;apply();sync(true);
 /** Sky look lives here, not in the UI: weather will drive the same entry point. */
 function setSkyAppearance(patch:Partial<Atmosphere>){if(!newSky)return;newSky.configure(patch);appearanceDirty=true;sync(true);}
 function setCloudWind(azimuth:number,speed:number){newSky?.setCloudWind(azimuth,speed);}
 return {update,setClock,setTime,setAutomatic,setRays,setFog,hour:()=>hours,setSkyAppearance,setCloudWind,
  settings:()=>newSky?.settings()??null,
  sky:()=>newSky?.stats()??null,
  skyDiagnostics:()=>newSky?.diagnostics()??null,
  stats:()=>({...current,automatic:sharedClock?true:automatic,sharedClock:!!sharedClock,rays,fogDensity:scene.fogDensity,cycleSeconds:CYCLE_SECONDS,shadowMaps:1,skyDraws:1,skyMode:mode})};
}
