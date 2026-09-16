import './sky.css';
import {normalizeAtmosphere,weatherPreset,WEATHER_PRESETS} from '../domain/sky-appearance.ts';
import type {Atmosphere,AtmosphereKnob} from '../domain/sky-appearance.ts';

const STORAGE='showcase-sky-v1';
export const ATMOSPHERE_SLIDERS={
 coverage:{label:'Покрытие неба',min:0,max:1.25,step:.01},
 thickness:{label:'Толщина облаков',min:.2,max:2.5,step:.05},
 cirrusAmount:{label:'Перистая пелена',min:0,max:1.5,step:.05},
 cloudDrift:{label:'Перенос облаков',min:0,max:2.5,step:.05},
 shapeDrift:{label:'Смена формы',min:0,max:3,step:.05},
 starDensity:{label:'Яркость звёзд',min:.2,max:2,step:.05},
 moonScale:{label:'Размер луны',min:.5,max:2.5,step:.05},
 moonGlow:{label:'Ореол луны',min:0,max:2,step:.05},
} as const;
const PRESETS:[string,keyof typeof WEATHER_PRESETS|'off'][]=[['Выключить','off'],['Ясно','clear'],['Переменная облачность','fair'],['Пасмурно','overcast'],['Дождь','rain'],['Ливень','storm']];

export type SkyControlsTarget={configure:(patch:Partial<Atmosphere>)=>void;settings:()=>Atmosphere};
/** Solo-review panel for the new sky. It changes sky inputs only: the same inputs a
 * weather state will drive on stage 2, so no weather logic lives here. */
export function createSkyControls(target:SkyControlsTarget){
 let atmosphere=normalizeAtmosphere(target.settings());
 try{const saved=JSON.parse(localStorage.getItem(STORAGE)??'null');if(saved&&typeof saved==='object')atmosphere=normalizeAtmosphere({...atmosphere,...saved});}catch{}
 target.configure(atmosphere);
 const controls=document.createElement('fieldset');controls.className='sky-controls';
 const keys=Object.keys(ATMOSPHERE_SLIDERS) as AtmosphereKnob[];
 controls.innerHTML=`<legend>Облака и луна · новая версия</legend>
 <label><input id="sky-enabled" type="checkbox"> Облака в небе</label>
 <label for="sky-preset">Состояние · задел погоды</label><select id="sky-preset">${PRESETS.map(([label,key])=>`<option value="${key}">${label}</option>`).join('')}</select>
 ${keys.map(key=>{const r=ATMOSPHERE_SLIDERS[key];return `<label for="sky-${key}">${r.label} <output id="sky-${key}-value"></output></label><input id="sky-${key}" type="range" min="${r.min*100}" max="${r.max*100}" step="${r.step*100}">`;}).join('')}
 <div class="sky-buttons"><button type="button" id="sky-reset">Сбросить</button></div>
 <small>Ориентир: перенос облаков заметен, если постоять; форма меняется медленнее. Состояния неба подготовлены для будущей погоды и пока меняют только само небо.</small>`;
 document.querySelector('#resolution-quality')!.after(controls);
 const enabled=controls.querySelector<HTMLInputElement>('#sky-enabled')!,preset=controls.querySelector<HTMLSelectElement>('#sky-preset')!;
 const ranges=keys.map(key=>({key,input:controls.querySelector<HTMLInputElement>(`#sky-${key}`)!,output:controls.querySelector<HTMLOutputElement>(`#sky-${key}-value`)!}));
 function sync(){
  enabled.checked=atmosphere.enabled;
  for(const {key,input,output} of ranges){input.value=String(Math.round(atmosphere[key]*100));output.value=`${input.value}%`;input.setAttribute('aria-valuetext',output.value);input.disabled=!atmosphere.enabled;}
  preset.disabled=!atmosphere.enabled;
  const near=(name:keyof typeof WEATHER_PRESETS,tolerance=.03)=>['enabled','coverage','thickness','cirrusAmount','cloudDrift','shapeDrift','moonScale','moonGlow','starDensity'].every(key=>Math.abs(atmosphere[key as AtmosphereKnob]-weatherPreset(name)[key as AtmosphereKnob])<tolerance);
  preset.value=!atmosphere.enabled?'off':(Object.keys(WEATHER_PRESETS) as (keyof typeof WEATHER_PRESETS)[]).find(name=>near(name))??'';
 }
 function change(patch:Partial<Atmosphere>){
  atmosphere=normalizeAtmosphere({...atmosphere,...patch});target.configure(atmosphere);
  try{localStorage.setItem(STORAGE,JSON.stringify(atmosphere));}catch{}sync();
 }
 enabled.onchange=()=>change({enabled:enabled.checked});
 preset.onchange=()=>{if(preset.value==='off')change({enabled:false});else if(preset.value)change({...weatherPreset(preset.value as keyof typeof WEATHER_PRESETS),enabled:true});};
 for(const {key,input} of ranges)input.oninput=()=>change({[key]:Number(input.value)/100});
 controls.querySelector<HTMLButtonElement>('#sky-reset')!.onclick=()=>change(normalizeAtmosphere({enabled:true}));
 sync();
 return ()=>controls.remove();
}
