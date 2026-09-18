import {Color4} from '@babylonjs/core/Maths/math.color.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import type {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {daylightAt,normalizeHour,CYCLE_SECONDS} from '../domain/daylight.ts';
import {moonSettings as normalizeMoonSettings,moonAtTotalHours,gameHourOnDay,gameDayAtHour} from '../domain/moon.ts';
import type {MoonSettings} from '../domain/moon.ts';
import {WEATHER_PRESETS,WEATHER_LABELS,WEATHER_VERSION,WEATHER_SEED,startWeatherTransition,evaluateTransition,automaticWeather} from '../domain/weather.ts';
import type {WeatherMode,WeatherState,WeatherTransition} from '../domain/weather.ts';
import {createDaySky} from './day-sky.ts';
import {createShowcaseSky} from './showcase-sky.ts';
import {createSkyControls} from './sky-controls.ts';
import type {SkySettings,SkySettingsPatch,SkyQuality} from '../domain/sky.ts';
import {clockElapsedSeconds} from '../network/persistent-protocol.ts';
import type {WorldClock} from '../network/persistent-protocol.ts';
import './daylight.css';

type Air={setRays:(enabled:boolean)=>void;setAtmosphere?:(state:{raysScale:number})=>void}|null;
type LocalState={totalHours:number;automatic:boolean;moon:MoonSettings;weatherMode:WeatherMode;weatherSeconds:number;weather:WeatherState;transition:WeatherTransition|null;skySettings?:SkySettings;skyTime:number};
export function createDaylight(scene:Scene,camera:Camera,sun:DirectionalLight,fill:HemisphericLight,air:Air,showcaseSky=false){
 const animatedSky=showcaseSky?createShowcaseSky(scene,camera):null;
 const sky=animatedSky??createDaySky(scene,camera);
 const foliage=scene.materials.filter((m):m is StandardMaterial=>m instanceof StandardMaterial&&['grass','floor-leaves','cover-mid','cover-far'].includes(m.name)).map(m=>({material:m,emission:m.emissiveColor.clone()}));
 let sharedClock:WorldClock|null=null,previous:LocalState|null=null;
 let totalHours=12,hours=12,automatic=showcaseSky,rays=false,lastTotal=NaN,current=daylightAt(hours);
 let moon=normalizeMoonSettings(),weatherMode:WeatherMode='clear',weatherSeconds=0,weather={...WEATHER_PRESETS.clear},transition:WeatherTransition|null=null;
 let weatherPreset='clear',transmission=1,targetTransmission=1,baseFog=scene.fogDensity;
 const controls=document.createElement('section');controls.className='daylight-controls';controls.setAttribute('aria-label','Время суток');
 controls.innerHTML=`<div class="daylight-heading"><strong>Свет и небо</strong><output id="day-time-value">12:00</output></div>
 <div class="daylight-presets"><button type="button" data-hour="7.5">Утро</button><button type="button" data-hour="12">День</button><button type="button" data-hour="17.5">Закат</button><button type="button" data-hour="0">Ночь</button></div>
 <label for="day-time">Время суток</label><input id="day-time" type="range" min="0" max="24" step="0.05" value="12" aria-valuetext="12:00">
 <label><input id="day-auto" type="checkbox"> Смена суток · 20 минут</label>
 <label><input id="day-rays" type="checkbox"> Художественные лучи</label>
 <label for="fog-density">Туман <output id="fog-density-value">0.011</output></label><input id="fog-density" type="range" min="0" max="0.04" step="0.001" value="0.011">`;
 if(animatedSky)controls.insertAdjacentHTML('beforeend',`<label for="sky-weather">Погода</label><select id="sky-weather"><option value="auto">Автоматически</option>${Object.entries(WEATHER_LABELS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}<option value="custom" disabled>Свои облака</option></select><small id="sky-weather-status"></small>
 <label for="moon-mode">Луна</label><select id="moon-mode"><option value="cycle">Лунный цикл · 28 суток</option><option value="full">Постоянное полнолуние</option><option value="fixed" disabled>Фиксированная фаза</option></select><small id="moon-phase-value"></small>`);
 document.querySelector('#diagnostics')!.insertBefore(controls,document.querySelector('#metrics'));
 const range=controls.querySelector<HTMLInputElement>('#day-time')!,output=controls.querySelector<HTMLOutputElement>('output')!;
 const auto=controls.querySelector<HTMLInputElement>('#day-auto')!,rayToggle=controls.querySelector<HTMLInputElement>('#day-rays')!,fogRange=controls.querySelector<HTMLInputElement>('#fog-density')!,fogOutput=controls.querySelector<HTMLOutputElement>('#fog-density-value')!;
 const weatherSelect=controls.querySelector<HTMLSelectElement>('#sky-weather'),weatherStatus=controls.querySelector<HTMLElement>('#sky-weather-status'),moonSelect=controls.querySelector<HTMLSelectElement>('#moon-mode'),moonOutput=controls.querySelector<HTMLElement>('#moon-phase-value');
 const details=document.querySelector<HTMLDetailsElement>('#diagnostics')!;
 const skyControls=animatedSky?createSkyControls(controls,()=>animatedSky.stats().settings,setSkySettings):null;
 if(!air)rayToggle.closest('label')!.hidden=true;
 let lastSync=-Infinity;
 function sync(force=false){
  const now=performance.now();if(!force&&(!details.open||now-lastSync<250))return;lastSync=now;
  const minutes=Math.round(hours*60)%1440,text=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  output.value=text;range.value=String(hours);range.setAttribute('aria-valuetext',text);
  for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.hour)-hours)<.03));
  if(weatherSelect&&weatherStatus&&moonSelect&&moonOutput){
   weatherSelect.value=weatherMode;weatherSelect.disabled=moonSelect.disabled=!!sharedClock;moonSelect.value=moon.mode;
   weatherStatus.textContent=(sharedClock?'Общая погода комнаты':weatherMode==='auto'?'Автоматическая погода · локально':'Локальная погода')+(transition?' · плавный переход':'');
   moonOutput.textContent=`День ${Math.floor(totalHours/24)+1} · освещено ${Math.round(current.moonIllumination*100)}%`;
   skyControls?.sync();
  }
 }
 function apply(force=false,dt=0){
  hours=normalizeHour(totalHours);
  if(!animatedSky&&!force&&totalHours===lastTotal)return;
  if(force||totalHours!==lastTotal){
   lastTotal=totalHours;
   // The old full-moon contract and all map callers remain unchanged.
   current=daylightAt(hours,animatedSky&&moon.mode!=='full'?moonAtTotalHours(totalHours,moon):undefined);
   sky.update(current);
   fill.groundColor.set(.2,.26,.2);fill.groundColor.scaleInPlace(.35+.65*current.daylight);
   scene.fogColor.set(...current.fogColor);scene.clearColor=new Color4(...current.horizon,1);
   for(const {material,emission} of foliage)emission.scaleToRef(current.emissionScale,material.emissiveColor);
  }
  targetTransmission=animatedSky?.sampleTransmission(current.source==='sun'?current.towardSun:current.towardMoon)??1;
  transmission=force?targetTransmission:transmission+(targetTransmission-transmission)*(1-Math.exp(-(sharedClock&&dt===0?.016:dt)/.7));
  sun.direction.set(...current.direction);sun.intensity=current.mainIntensity*transmission;sun.diffuse.set(...current.mainColor);
  fill.intensity=current.fillIntensity*weather.ambientScale;fill.diffuse.set(...current.fillColor);
  scene.fogDensity=Math.max(0,Math.min(.04,baseFog+weather.fogDensityAdd));
  air?.setAtmosphere?.({raysScale:weather.raysScale});sync();
 }
 function applyWeather(next:WeatherState){
  if(animatedSky&&(next.lowCoverage!==weather.lowCoverage||next.lowOpticalDepth!==weather.lowOpticalDepth||next.highCoverage!==weather.highCoverage||next.highOpticalDepth!==weather.highOpticalDepth)){
   animatedSky.setSettings({low:{coverage:next.lowCoverage,opticalDepth:next.lowOpticalDepth},high:{coverage:next.highCoverage,opticalDepth:next.highOpticalDepth}});
  }weather=next;
 }
 function evaluateWeather(){
  // Seeking the automatic timeline must immediately recover the state at that time.
  if(transition&&weatherMode==='auto'&&weatherSeconds>=transition.startedAtSeconds+transition.durationSeconds)transition=null;
  if(transition){applyWeather(evaluateTransition(transition,weatherSeconds));if(weatherSeconds>=transition.startedAtSeconds+transition.durationSeconds)transition=null;}
  else if(weatherMode==='auto'){const state=automaticWeather(weatherSeconds);weatherPreset=state.preset;applyWeather(state.state);}
 }
 function setTime(hour:number){if(sharedClock)return;totalHours=gameHourOnDay(totalHours,hour);automatic=false;auto.checked=false;apply(true);sync(true);}
 function setGameDay(day:number){if(sharedClock||!animatedSky)return;totalHours=gameDayAtHour(day,hours);apply(true);sync(true);}
 function setAutomatic(value:boolean){if(sharedClock)return;automatic=value;auto.checked=value;}
 function setMoon(patch:Partial<MoonSettings>){if(sharedClock||!animatedSky)return;moon=normalizeMoonSettings(moon,patch);apply(true);sync(true);}
 function setWeather(mode:Exclude<WeatherMode,'custom'>,durationSeconds=12){
  if(sharedClock||!animatedSky)return;
  if(mode!=='auto'&&!Object.hasOwn(WEATHER_PRESETS,mode))throw Error('Unknown weather preset');
  if(!Number.isFinite(durationSeconds))throw Error('Transition duration must be finite');
  evaluateWeather();weatherMode=mode;weatherPreset=mode;
  if(mode==='auto'){transition=startWeatherTransition(weather,automaticWeather(weatherSeconds+Math.max(0,durationSeconds)).state,weatherSeconds,durationSeconds);}
  else transition=startWeatherTransition(weather,WEATHER_PRESETS[mode],weatherSeconds,durationSeconds);
  evaluateWeather();apply(true);sync(true);
 }
 function setWeatherTime(seconds:number){
  if(sharedClock||!animatedSky)return;if(!Number.isFinite(seconds)||seconds<0)throw Error('Weather time must be finite and nonnegative');
  weatherSeconds=seconds;evaluateWeather();apply(true);sync(true);
 }
 function setClock(clock:WorldClock|null){
  if(!!clock!==!!sharedClock){
   if(clock){
    const skyState=animatedSky?.stats();previous={totalHours,automatic,moon,weatherMode,weatherSeconds,weather,transition,skySettings:skyState?.settings,skyTime:skyState?.animationSeconds??0};
    auto.checked=true;if(animatedSky){moon=normalizeMoonSettings();weatherMode='auto';transition=null;}
   }else if(previous){
    ({totalHours,automatic,moon,weatherMode,weatherSeconds,weather,transition}=previous);auto.checked=automatic;
    weatherPreset=weatherMode==='auto'?automaticWeather(weatherSeconds).preset:weatherMode;
    if(previous.skySettings)animatedSky?.setSettings(previous.skySettings);animatedSky?.setAnimationTime(previous.skyTime);previous=null;
   }
   range.disabled=auto.disabled=!!clock;
   for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.disabled=!!clock;
   controls.title=clock?(animatedSky?'Время и погода задаются постоянной комнатой':'Время задаётся постоянной комнатой'):'';
   // Cloud overrides remain local diagnostics; regular controls are disabled in shared rooms.
   for(const el of controls.querySelectorAll<HTMLInputElement|HTMLButtonElement>('.sky-controls input,.sky-controls button'))el.disabled=!!clock;
   sharedClock=clock;lastTotal=NaN;apply(true);sync(true);
  }else sharedClock=clock;
 }
 function setRays(value:boolean){rays=Boolean(value);rayToggle.checked=rays;air?.setRays(rays);}
 function setFog(value:number){if(!Number.isFinite(value))throw Error('Fog must be finite');baseFog=Math.max(0,Math.min(.04,value));fogRange.value=baseFog.toFixed(3);fogOutput.value=baseFog.toFixed(3);apply(true);}
 function setSkySettings(patch:SkySettingsPatch){
  if(!animatedSky||sharedClock)return;
  animatedSky.setSettings(patch);
  if(patch.low?.coverage!==undefined||patch.low?.opticalDepth!==undefined||patch.high?.coverage!==undefined||patch.high?.opticalDepth!==undefined){
   const s=animatedSky.stats().settings;weatherMode='custom';weatherPreset='custom';transition=null;
   weather={...weather,lowCoverage:s.low.coverage,lowOpticalDepth:s.low.opticalDepth,highCoverage:s.high.coverage,highOpticalDepth:s.high.opticalDepth};
  }apply(true);skyControls?.sync();sync(true);
 }
 for(const b of controls.querySelectorAll<HTMLButtonElement>('button[data-hour]'))b.onclick=()=>setTime(Number(b.dataset.hour));
 range.oninput=()=>setTime(Number(range.value));auto.onchange=()=>setAutomatic(auto.checked);rayToggle.onchange=()=>setRays(rayToggle.checked);fogRange.oninput=()=>setFog(Number(fogRange.value));
 if(weatherSelect)weatherSelect.onchange=()=>setWeather(weatherSelect.value as Exclude<WeatherMode,'custom'>);
 if(moonSelect)moonSelect.onchange=()=>setMoon({mode:moonSelect.value as MoonSettings['mode']});
 function update(delta:number){
  const dt=Number.isFinite(delta)&&delta>0?Math.min(delta,.05):0;
  if(sharedClock){const elapsed=clockElapsedSeconds(sharedClock);totalHours=12+24*elapsed/sharedClock.cycleSeconds;if(animatedSky){weatherSeconds=elapsed;animatedSky.setAnimationTime(Math.max(0,elapsed));}}
  else {if(automatic)totalHours+=dt*24/CYCLE_SECONDS;weatherSeconds+=dt;animatedSky?.animate(dt);}
  if(animatedSky)evaluateWeather();apply(false,dt);
 }
 const opened=()=>{if(details.open)sync(true);};details.addEventListener('toggle',opened);
 scene.onDisposeObservable.add(()=>{skyControls?.dispose();controls.remove();details.removeEventListener('toggle',opened);});
 if(animatedSky)animatedSky.setSettings({low:{coverage:weather.lowCoverage,opticalDepth:weather.lowOpticalDepth},high:{coverage:weather.highCoverage,opticalDepth:weather.highOpticalDepth}});
 setFog(baseFog);auto.checked=automatic;apply(true);sync(true);
 return {update,setClock,setTime,setGameDay,setMoon,setWeather,setWeatherTime,setAutomatic,setRays,setFog,hour:()=>hours,setSkySettings,
  precipitation:()=>weather.precipitation,daylightAmount:()=>current.daylight,
  setSkyQuality:(quality:SkyQuality)=>animatedSky?.setQuality(quality),loadSkyAssets:()=>animatedSky?.loadArtAssets(),setSkyAnimationTime:(seconds:number)=>{if(!sharedClock){animatedSky?.setAnimationTime(seconds);apply(true);}},
  stats:()=>({...current,totalGameHours:totalHours,automatic:sharedClock?true:automatic,sharedClock:!!sharedClock,rays,fogDensity:scene.fogDensity,cycleSeconds:CYCLE_SECONDS,shadowMaps:1,skyDraws:1,...(animatedSky?{moon:{...moon},weather:{mode:weatherMode,preset:weatherPreset,scope:sharedClock?'shared-clock':'local',version:WEATHER_VERSION,seed:WEATHER_SEED,seconds:weatherSeconds,state:{...weather},transition:transition?{remainingSeconds:Math.max(0,transition.startedAtSeconds+transition.durationSeconds-weatherSeconds)}:null,sourceTransmission:transmission,targetTransmission,baseFog,effectiveFog:scene.fogDensity,mainIntensity:sun.intensity,fillIntensity:fill.intensity},sky:animatedSky.stats()}: {})})};
}
