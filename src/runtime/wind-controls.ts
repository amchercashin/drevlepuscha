import type {WindSystem,WindSettings} from './wind.ts';
import {DEFAULT_WIND} from './wind.ts';
import './wind.css';
const STORAGE='showcase-wind-v1';
export function createWindControls(wind:WindSystem){
 try{const saved=JSON.parse(localStorage.getItem(STORAGE)??'null');if(saved&&typeof saved==='object')wind.configure(saved);}catch{}
 const controls=document.createElement('fieldset');controls.className='wind-controls';
 controls.innerHTML=`<legend>Ветер</legend>
 <label><input id="wind-enabled" type="checkbox"> Ветер в лесу</label>
 <label for="wind-intensity">Интенсивность <output id="wind-value"></output></label>
 <input id="wind-intensity" type="range" min="0" max="150" step="5">
 <label for="wind-preset">Характер</label><select id="wind-preset"><option value="forest">Лесной · спокойный</option><option value="enchanted">Сказочный · выразительные порывы</option></select>
 <small id="wind-help">Подберите движение травы и крон по вкусу.</small>`;
 document.querySelector('#resolution-quality')!.after(controls);
 const enabled=controls.querySelector<HTMLInputElement>('#wind-enabled')!,intensity=controls.querySelector<HTMLInputElement>('#wind-intensity')!,preset=controls.querySelector<HTMLSelectElement>('#wind-preset')!,output=controls.querySelector<HTMLOutputElement>('#wind-value')!;
 function sync(){
  const s=wind.shared?DEFAULT_WIND:wind.settings;
  enabled.checked=s.enabled;intensity.value=String(Math.round(s.intensity*100));preset.value=s.preset;
  output.value=`${intensity.value}%`;intensity.setAttribute('aria-valuetext',output.value);
  enabled.disabled=wind.shared;intensity.disabled=preset.disabled=wind.shared||!s.enabled;
  controls.querySelector('#wind-help')!.textContent=wind.shared?'В комнате действует лесной ветер. Личные настройки вернутся после выхода.':'Подберите движение травы и крон по вкусу.';
 }
 function change(settings:Partial<WindSettings>){wind.configure(settings);try{localStorage.setItem(STORAGE,JSON.stringify(wind.settings));}catch{}sync();}
 enabled.onchange=()=>change({enabled:enabled.checked});intensity.oninput=()=>change({intensity:Number(intensity.value)/100});preset.onchange=()=>change({preset:preset.value as WindSettings['preset']});
 const unsubscribe=wind.onChange(sync);sync();return ()=>{unsubscribe();controls.remove();};
}
