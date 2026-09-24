import {CYCLE_SECONDS,daylightAt,normalizeHour} from '../domain/daylight.ts';
import {gameDayAtHour,gameHourOnDay,moonAtTotalHours,moonSettings} from '../domain/moon.ts';
import type {MoonSettings} from '../domain/moon.ts';
import {SKY_DEFAULTS,SKY_SEED,skySettings} from '../domain/sky.ts';
import type {SkyQuality,SkySettings,SkySettingsPatch} from '../domain/sky.ts';
import {automaticWeather,evaluateTransition,startWeatherTransition,WEATHER_LABELS,WEATHER_PRESETS,WEATHER_SEED,WEATHER_VERSION} from '../domain/weather.ts';
import type {WeatherMode,WeatherState,WeatherTransition} from '../domain/weather.ts';
import {clockElapsedSeconds} from '../network/persistent-protocol.ts';
import type {WorldClock} from '../network/persistent-protocol.ts';
import {createSkyControls} from '../runtime/sky-controls.ts';
import '../runtime/daylight.css';

interface Saved {
 totalHours:number;automatic:boolean;moon:MoonSettings;weatherMode:WeatherMode;weatherSeconds:number;
 weather:WeatherState;transition:WeatherTransition|null;sky:SkySettings;skySeconds:number;
}

/** Scene-independent clock, weather and sky controls for the direct WebGPU showcase. */
export function createNativeAtmosphere(){
 let totalHours=12,hours=12,automatic=true,baseFog=.011,rays=false,moon=moonSettings();
 let weatherMode:WeatherMode='clear',weatherSeconds=0,weather={...WEATHER_PRESETS.clear},transition:WeatherTransition|null=null,weatherPreset='clear';
 let sky=skySettings(SKY_DEFAULTS,{low:{coverage:weather.lowCoverage,opticalDepth:weather.lowOpticalDepth},high:{coverage:weather.highCoverage,opticalDepth:weather.highOpticalDepth}});
 let skySeconds=0,quality:SkyQuality=2,sharedClock:WorldClock|null=null,saved:Saved|null=null,current=daylightAt(hours,moonAtTotalHours(totalHours,moon));
 const panel=document.createElement('section');panel.className='daylight-controls';panel.setAttribute('aria-label','Время суток');
 panel.innerHTML=`<div class="daylight-heading"><strong>Свет и небо</strong><output id="day-time-value">12:00</output></div>
 <div class="daylight-presets"><button type="button" data-hour="7.5">Утро</button><button type="button" data-hour="12">День</button><button type="button" data-hour="17.5">Закат</button><button type="button" data-hour="0">Ночь</button></div>
 <label for="day-time">Время суток</label><input id="day-time" type="range" min="0" max="24" step="0.05" value="12">
 <label><input id="day-auto" type="checkbox" checked> Смена суток · 20 минут</label>
 <label><input id="day-rays" type="checkbox"> Художественные лучи</label>
 <label for="fog-density">Туман <output id="fog-density-value">0.011</output></label><input id="fog-density" type="range" min="0" max="0.04" step="0.001" value="0.011">
 <label for="sky-weather">Погода</label><select id="sky-weather"><option value="auto">Автоматически</option>${Object.entries(WEATHER_LABELS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}<option value="custom" disabled>Свои облака</option></select><small id="sky-weather-status"></small>
 <label for="moon-mode">Луна</label><select id="moon-mode"><option value="cycle">Лунный цикл · 28 суток</option><option value="full">Постоянное полнолуние</option><option value="fixed" disabled>Фиксированная фаза</option></select><small id="moon-phase-value"></small>`;
 document.querySelector('#diagnostics')!.insertBefore(panel,document.querySelector('#metrics'));
 const timeRange=panel.querySelector<HTMLInputElement>('#day-time')!,auto=panel.querySelector<HTMLInputElement>('#day-auto')!,fogRange=panel.querySelector<HTMLInputElement>('#fog-density')!;
 const weatherSelect=panel.querySelector<HTMLSelectElement>('#sky-weather')!,moonSelect=panel.querySelector<HTMLSelectElement>('#moon-mode')!,raysToggle=panel.querySelector<HTMLInputElement>('#day-rays')!;
 const skyControls=createSkyControls(panel,()=>sky,setSky);
 function sync(){
  if(!document.querySelector<HTMLDetailsElement>('#diagnostics')!.open)return;
  const minutes=Math.round(hours*60)%1440,label=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  panel.querySelector<HTMLOutputElement>('#day-time-value')!.value=label;timeRange.value=String(hours);timeRange.setAttribute('aria-valuetext',label);
  panel.querySelector<HTMLOutputElement>('#fog-density-value')!.value=baseFog.toFixed(3);
  for(const button of panel.querySelectorAll<HTMLButtonElement>('button[data-hour]'))button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.hour)-hours)<.03));
  weatherSelect.value=weatherMode;moonSelect.value=moon.mode;
  panel.querySelector<HTMLElement>('#sky-weather-status')!.textContent=(sharedClock?'Общая погода комнаты':weatherMode==='auto'?'Автоматическая погода · локально':'Локальная погода')+(transition?' · плавный переход':'');
  panel.querySelector<HTMLElement>('#moon-phase-value')!.textContent=`День ${Math.floor(totalHours/24)+1} · освещено ${Math.round(current.moonIllumination*100)}%`;
  skyControls.sync();
 }
 function applyWeather(next:WeatherState){
  weather=next;sky=skySettings(sky,{low:{coverage:next.lowCoverage,opticalDepth:next.lowOpticalDepth},high:{coverage:next.highCoverage,opticalDepth:next.highOpticalDepth}});
 }
 function evaluateWeather(){
  if(transition&&weatherMode==='auto'&&weatherSeconds>=transition.startedAtSeconds+transition.durationSeconds)transition=null;
  if(transition){applyWeather(evaluateTransition(transition,weatherSeconds));if(weatherSeconds>=transition.startedAtSeconds+transition.durationSeconds)transition=null;}
  else if(weatherMode==='auto'){const next=automaticWeather(weatherSeconds);weatherPreset=next.preset;applyWeather(next.state);}
 }
 function apply(){hours=normalizeHour(totalHours);current=daylightAt(hours,moon.mode==='full'?undefined:moonAtTotalHours(totalHours,moon));sync();}
 function setTime(hour:number){if(sharedClock)return;totalHours=gameHourOnDay(totalHours,hour);automatic=false;auto.checked=false;apply();}
 function setGameDay(day:number){if(sharedClock)return;totalHours=gameDayAtHour(day,hours);apply();}
 function setAutomatic(value:boolean){if(sharedClock)return;automatic=value;auto.checked=value;}
 function setFog(value:number){if(!Number.isFinite(value))throw Error('Fog must be finite');baseFog=Math.max(0,Math.min(.04,value));fogRange.value=String(baseFog);sync();}
 function setRays(value:boolean){rays=Boolean(value);raysToggle.checked=rays;}
 function setMoon(patch:Partial<MoonSettings>){if(sharedClock)return;moon=moonSettings(moon,patch);apply();}
 function setWeather(mode:Exclude<WeatherMode,'custom'>,durationSeconds=12){
  if(sharedClock)return;
  if(mode!=='auto'&&!Object.hasOwn(WEATHER_PRESETS,mode))throw Error('Unknown weather preset');
  evaluateWeather();weatherMode=mode;weatherPreset=mode;
  const target=mode==='auto'?automaticWeather(weatherSeconds+Math.max(0,durationSeconds)).state:WEATHER_PRESETS[mode];
  transition=startWeatherTransition(weather,target,weatherSeconds,durationSeconds);evaluateWeather();sync();
 }
 function setWeatherTime(seconds:number){if(sharedClock)return;if(!Number.isFinite(seconds)||seconds<0)throw Error('Weather time must be finite and nonnegative');weatherSeconds=seconds;evaluateWeather();sync();}
 function setSky(patch:SkySettingsPatch){
  if(sharedClock)return;sky=skySettings(sky,patch);
  if(patch.low?.coverage!==undefined||patch.low?.opticalDepth!==undefined||patch.high?.coverage!==undefined||patch.high?.opticalDepth!==undefined){
   weatherMode='custom';weatherPreset='custom';transition=null;
   weather={...weather,lowCoverage:sky.low.coverage,lowOpticalDepth:sky.low.opticalDepth,highCoverage:sky.high.coverage,highOpticalDepth:sky.high.opticalDepth};
  }sync();
 }
 function setSkyAnimationTime(seconds:number){if(sharedClock)return;if(!Number.isFinite(seconds)||seconds<0)throw Error('Sky time must be finite and nonnegative');skySeconds=seconds;sync();}
 function setClock(clock:WorldClock|null){
  if(!!clock!==!!sharedClock){
   if(clock){saved={totalHours,automatic,moon,weatherMode,weatherSeconds,weather,transition,sky,skySeconds};moon=moonSettings();weatherMode='auto';transition=null;auto.checked=true;}
   else if(saved){({totalHours,automatic,moon,weatherMode,weatherSeconds,weather,transition,sky,skySeconds}=saved);saved=null;auto.checked=automatic;}
   const disabled=!!clock;timeRange.disabled=auto.disabled=weatherSelect.disabled=moonSelect.disabled=disabled;
   for(const button of panel.querySelectorAll<HTMLButtonElement>('button[data-hour]'))button.disabled=disabled;
   for(const input of panel.querySelectorAll<HTMLInputElement|HTMLButtonElement>('.sky-controls input,.sky-controls button'))input.disabled=disabled;
  }
  sharedClock=clock;apply();
 }
 function update(dt:number){
  const step=Number.isFinite(dt)&&dt>0?Math.min(dt,.05):0;
  if(sharedClock){const elapsed=clockElapsedSeconds(sharedClock);totalHours=12+24*elapsed/sharedClock.cycleSeconds;weatherSeconds=elapsed;skySeconds=Math.max(0,elapsed);}
  else {if(automatic)totalHours+=step*24/CYCLE_SECONDS;weatherSeconds+=step;skySeconds+=step*sky.motionScale;}
  evaluateWeather();apply();
 }
 for(const button of panel.querySelectorAll<HTMLButtonElement>('button[data-hour]'))button.onclick=()=>setTime(Number(button.dataset.hour));
 timeRange.oninput=()=>setTime(Number(timeRange.value));auto.onchange=()=>setAutomatic(auto.checked);fogRange.oninput=()=>setFog(Number(fogRange.value));
 weatherSelect.onchange=()=>setWeather(weatherSelect.value as Exclude<WeatherMode,'custom'>);moonSelect.onchange=()=>setMoon({mode:moonSelect.value as MoonSettings['mode']});raysToggle.onchange=()=>setRays(raysToggle.checked);
 apply();return {update,setClock,setTime,setGameDay,setAutomatic,setFog,setRays,setMoon,setWeather,setWeatherTime,setSky,setSkyAnimationTime,setQuality:(value:SkyQuality)=>{quality=value;},
  hour:()=>hours,light:()=>current,fog:()=>Math.max(0,Math.min(.04,baseFog+weather.fogDensityAdd)),precipitation:()=>weather.precipitation,
  sky:()=>({settings:sky,seconds:skySeconds,quality}),weather:()=>weather,rays:()=>rays,
  stats:()=>({...current,totalGameHours:totalHours,automatic:sharedClock?true:automatic,sharedClock:!!sharedClock,rays,fogDensity:Math.max(0,Math.min(.04,baseFog+weather.fogDensityAdd)),cycleSeconds:CYCLE_SECONDS,shadowMaps:1,skyDraws:1,
   moon:{...moon},weather:{mode:weatherMode,preset:weatherPreset,scope:sharedClock?'shared-clock':'local',version:WEATHER_VERSION,seed:WEATHER_SEED,seconds:weatherSeconds,state:{...weather},transition:transition?{remainingSeconds:Math.max(0,transition.startedAtSeconds+transition.durationSeconds-weatherSeconds)}:null,baseFog,effectiveFog:Math.max(0,Math.min(.04,baseFog+weather.fogDensityAdd))},
   sky:{version:1,seed:SKY_SEED,quality,animationSeconds:skySeconds,settings:sky}}),
  dispose:()=>{skyControls.dispose();panel.remove();},
 };
}
