import {setFog} from '@babylonjs/lite';
import type {DirectionalLight,HemisphericLight,SceneContext} from '@babylonjs/lite';
import {daylightAt,normalizeHour,CYCLE_SECONDS} from '../domain/daylight.ts';
import {createDaySky} from './sky.ts';
import '../runtime/daylight.css';

type Air={setRays:(enabled:boolean)=>void}|null;
export function createDaylight(scene:SceneContext,sun:DirectionalLight,fill:HemisphericLight,air:Air,cameraPos:()=>{x:number;y:number;z:number}){
 const sky=createDaySky(scene.surface.engine,scene);
 let hours=12,automatic=false,rays=false,last=-1,current=daylightAt(hours),fogDensity=0.011;
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
 function sync(){
  const minutes=Math.round(hours*60)%1440,text=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  output.value=text;range.value=String(hours);range.setAttribute('aria-valuetext',text);
  for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.hour)-hours)<.03));
 }
 function apply(){
  if(hours===last){sky.update(current,cameraPos());return;}
  last=hours;current=daylightAt(hours);
  sun.direction.set(current.direction[0],current.direction[1],current.direction[2]);
  sun.intensity=current.mainIntensity;sun.diffuse=[...current.mainColor];
  fill.intensity=current.fillIntensity;fill.diffuseColor=[...current.fillColor];
  fill.groundColor=[.2*.35+.2*.65*current.daylight,.26*.35+.26*.65*current.daylight,.2*.35+.2*.65*current.daylight];
  setFog(scene,{mode:2,density:fogDensity,start:0,end:1000,color:current.fogColor});
  scene.clearColor={r:current.horizon[0],g:current.horizon[1],b:current.horizon[2],a:1};
  sky.update(current,cameraPos());sync();
 }
 function setTime(hour:number){hours=normalizeHour(hour);automatic=false;auto.checked=false;apply();}
 function setAutomatic(value:boolean){automatic=value;auto.checked=value;}
 function setRays(value:boolean){rays=Boolean(value);rayToggle.checked=rays;air?.setRays(rays);}
 function setFogDensity(value:number){fogDensity=Math.max(0,Math.min(.04,value));fogRange.value=fogDensity.toFixed(3);fogOutput.value=fogDensity.toFixed(3);last=-1;apply();}
 for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.onclick=()=>setTime(Number(b.dataset.hour));
 range.oninput=()=>setTime(Number(range.value));auto.onchange=()=>setAutomatic(auto.checked);rayToggle.onchange=()=>setRays(rayToggle.checked);fogRange.oninput=()=>setFogDensity(Number(fogRange.value));
 function update(dt:number){if(automatic&&dt>0)hours=normalizeHour(hours+Math.min(dt,.05)*24/CYCLE_SECONDS);apply();}
 setFogDensity(fogDensity);apply();
 return {update,setTime,setAutomatic,setRays,setFog:setFogDensity,stats:()=>({...current,automatic,rays,fogDensity,cycleSeconds:CYCLE_SECONDS,shadowMaps:1,skyDraws:1})};
}
