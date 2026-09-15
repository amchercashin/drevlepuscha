import type {WindSystem,WindSettings} from './wind.ts';
import {DEFAULT_WIND} from './wind.ts';
import {WIND_SLIDERS} from '../domain/wind-settings.ts';
import type {WindKnob} from '../domain/wind-settings.ts';
import './wind.css';
const STORAGE='showcase-wind-v1';
export function createWindControls(wind:WindSystem){
 try{const saved=JSON.parse(localStorage.getItem(STORAGE)??'null');if(saved&&typeof saved==='object')wind.configure(saved);}catch{}
 const controls=document.createElement('fieldset');controls.className='wind-controls';
 const keys=Object.keys(WIND_SLIDERS) as WindKnob[];
 controls.innerHTML=`<legend>Ветер</legend>
 <label><input id="wind-enabled" type="checkbox"> Ветер в лесу</label>
 <label for="wind-preset">Характер</label><select id="wind-preset"><option value="forest">Лесной · спокойный</option><option value="enchanted">Сказочный · выразительные порывы</option></select>
 ${keys.map(key=>{const r=WIND_SLIDERS[key];return `<label for="wind-${key}">${r.label} <output id="wind-${key}-value"></output></label><input id="wind-${key}" type="range" min="${r.min*100}" max="${r.max*100}" step="${r.step*100}">`;}).join('')}
 <div class="wind-buttons"><button type="button" id="wind-strong">Сильный ветер</button><button type="button" id="wind-storm">Буря</button><button type="button" id="wind-gust">Порыв сейчас</button><button type="button" id="wind-reset">Сбросить</button></div>
 <small id="wind-help"></small>`;
 document.querySelector('#resolution-quality')!.after(controls);
 const enabled=controls.querySelector<HTMLInputElement>('#wind-enabled')!,preset=controls.querySelector<HTMLSelectElement>('#wind-preset')!;
 const ranges=keys.map(key=>({key,input:controls.querySelector<HTMLInputElement>(`#wind-${key}`)!,output:controls.querySelector<HTMLOutputElement>(`#wind-${key}-value`)!}));
 function sync(){
  const s=wind.shared?DEFAULT_WIND:wind.settings;
  enabled.checked=s.enabled;preset.value=s.preset;
  for(const {key,input,output} of ranges){input.value=String(Math.round(s[key]*100));output.value=`${input.value}%`;input.setAttribute('aria-valuetext',output.value);input.disabled=wind.shared||!s.enabled;}
  enabled.disabled=wind.shared;preset.disabled=wind.shared||!s.enabled;
  for(const b of controls.querySelectorAll<HTMLButtonElement>('button'))b.disabled=wind.shared||(b.id==='wind-gust'&&(!s.enabled||s.intensity===0||s.gustStrength===0));
  controls.querySelector('#wind-help')!.textContent=wind.shared?'В комнате действует лесной ветер. Личные настройки вернутся после выхода.':'100% — исходная настройка. Для заметного изгиба начните с «Сильного ветра». На крайних значениях изгиб ограничен, чтобы сохранить форму растений.';
 }
 function change(settings:Partial<WindSettings>){wind.configure(settings);try{localStorage.setItem(STORAGE,JSON.stringify(wind.settings));}catch{}sync();}
 enabled.onchange=()=>change({enabled:enabled.checked});preset.onchange=()=>change({preset:preset.value as WindSettings['preset']});
 for(const {key,input} of ranges)input.oninput=()=>change({[key]:Number(input.value)/100});
 controls.querySelector<HTMLButtonElement>('#wind-reset')!.onclick=()=>change(DEFAULT_WIND);
 controls.querySelector<HTMLButtonElement>('#wind-strong')!.onclick=()=>change({...DEFAULT_WIND,intensity:3.5,gustStrength:2,canopyBend:2,coverBend:1.5});
 controls.querySelector<HTMLButtonElement>('#wind-storm')!.onclick=()=>change({...DEFAULT_WIND,preset:'enchanted',intensity:6,gustStrength:3,gustFrequency:2,canopyBend:3,coverBend:2,motionSpeed:1.5});
 controls.querySelector<HTMLButtonElement>('#wind-gust')!.onclick=()=>wind.triggerGust();
 const unsubscribe=wind.onChange(sync);sync();return ()=>{unsubscribe();controls.remove();};
}
