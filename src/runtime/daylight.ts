import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import type {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {daylightAt,normalizeHour,CYCLE_SECONDS} from '../domain/daylight.ts';
import {createDaySky} from './day-sky.ts';
import './daylight.css';

type Air={setRays:(enabled:boolean)=>void}|null;
export function createDaylight(scene:Scene,camera:Camera,sun:DirectionalLight,fill:HemisphericLight,air:Air){
 const sky=createDaySky(scene,camera);
 const foliage=scene.materials.filter((m):m is StandardMaterial=>m instanceof StandardMaterial&&['grass','floor-leaves','cover-mid','cover-far'].includes(m.name)).map(m=>({material:m,emission:m.emissiveColor.clone()}));
 let hours=12,automatic=false,rays=false,last=-1,current=daylightAt(hours);
 const controls=document.createElement('section');controls.className='daylight-controls';controls.setAttribute('aria-label','Время суток');
 controls.innerHTML=`<div class="daylight-heading"><strong>Свет и небо</strong><output id="day-time-value">12:00</output></div>
 <div class="daylight-presets"><button type="button" data-hour="7.5">Утро</button><button type="button" data-hour="12">День</button><button type="button" data-hour="17.5">Закат</button><button type="button" data-hour="0">Ночь</button></div>
 <label for="day-time">Время суток</label><input id="day-time" type="range" min="0" max="24" step="0.05" value="12" aria-valuetext="12:00">
 <label><input id="day-auto" type="checkbox"> Смена суток · 20 минут</label>
 <label><input id="day-rays" type="checkbox"> Художественные лучи</label>
 <label for="fog-density">Туман <output id="fog-density-value">0.023</output></label><input id="fog-density" type="range" min="0" max="0.04" step="0.001" value="0.023">`;
 document.querySelector('#diagnostics')!.insertBefore(controls,document.querySelector('#metrics'));
 const range=controls.querySelector<HTMLInputElement>('#day-time')!,output=controls.querySelector<HTMLOutputElement>('output')!;
 const auto=controls.querySelector<HTMLInputElement>('#day-auto')!,rayToggle=controls.querySelector<HTMLInputElement>('#day-rays')!,fogRange=controls.querySelector<HTMLInputElement>('#fog-density')!,fogOutput=controls.querySelector<HTMLOutputElement>('#fog-density-value')!;
 function sync(){
  const minutes=Math.round(hours*60)%1440,text=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  output.value=text;range.value=String(hours);range.setAttribute('aria-valuetext',text);
  for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.hour)-hours)<.03));
 }
 function apply(){
  if(hours===last)return;last=hours;current=daylightAt(hours);
  sun.direction.set(...current.direction);sun.intensity=current.mainIntensity;sun.diffuse.set(...current.mainColor);
  fill.intensity=current.fillIntensity;fill.diffuse.set(...current.fillColor);
  fill.groundColor.set(.2,.26,.2);fill.groundColor.scaleInPlace(.35+.65*current.daylight);
  scene.fogColor.set(...current.fogColor);scene.clearColor=new Color4(...current.horizon,1);
  for(const {material,emission} of foliage)emission.scaleToRef(current.emissionScale,material.emissiveColor);
  sky.update(current);sync();
 }
 function setTime(hour:number){hours=normalizeHour(hour);automatic=false;auto.checked=false;apply();}
 function setAutomatic(value:boolean){automatic=value;auto.checked=value;}
 function setRays(value:boolean){rays=Boolean(value);rayToggle.checked=rays;air?.setRays(rays);}
 function setFog(value:number){const density=Math.max(0,Math.min(.04,value));scene.fogDensity=density;fogRange.value=density.toFixed(3);fogOutput.value=density.toFixed(3);}
 for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.onclick=()=>setTime(Number(b.dataset.hour));
 range.oninput=()=>setTime(Number(range.value));auto.onchange=()=>setAutomatic(auto.checked);rayToggle.onchange=()=>setRays(rayToggle.checked);fogRange.oninput=()=>setFog(Number(fogRange.value));
 function update(dt:number){if(automatic&&dt>0)hours=normalizeHour(hours+Math.min(dt,.05)*24/CYCLE_SECONDS);apply();}
 scene.onDisposeObservable.add(()=>controls.remove());setFog(scene.fogDensity);apply();
 return {update,setTime,setAutomatic,setRays,setFog,stats:()=>({...current,automatic,rays,fogDensity:scene.fogDensity,cycleSeconds:CYCLE_SECONDS,shadowMaps:1,skyDraws:1})};
}
