import {SKY_DEFAULTS} from '../domain/sky.ts';
import type {SkySettings,SkySettingsPatch} from '../domain/sky.ts';

export function createSkyControls(parent:HTMLElement,read:()=>SkySettings,write:(patch:SkySettingsPatch)=>void){
 const details=document.createElement('details');details.className='sky-controls';
 details.innerHTML='<summary>Облака, луна и звёзды</summary>';
 const fields=[
  {id:'coverage',label:'Покрытие облаков',max:1,step:.01,get:(s:SkySettings)=>s.low.coverage,patch:(v:number)=>({low:{coverage:v}})},
  {id:'depth',label:'Толщина облаков',max:16,step:.1,get:(s:SkySettings)=>s.low.opticalDepth,patch:(v:number)=>({low:{opticalDepth:v}})},
  {id:'motion',label:'Движение облаков',max:4,step:.05,get:(s:SkySettings)=>s.motionScale,patch:(v:number)=>({motionScale:v})},
  {id:'stars',label:'Яркость звёзд',max:2,step:.05,get:(s:SkySettings)=>s.stars.brightness,patch:(v:number)=>({stars:{brightness:v}})},
  {id:'halo',label:'Ореол луны',max:1,step:.05,get:(s:SkySettings)=>s.moon.halo,patch:(v:number)=>({moon:{halo:v}})},
 ];
 const bindings=fields.map(f=>{
  const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');
  label.htmlFor=input.id=`sky-${f.id}`;label.append(f.label+' ',output);
  input.type='range';input.min='0';input.max=String(f.max);input.step=String(f.step);
  input.oninput=()=>write(f.patch(Number(input.value)));
  details.append(label,input);return {f,output,input};
 });
 const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить настройки неба';reset.onclick=()=>write(SKY_DEFAULTS);details.append(reset);parent.append(details);
 function sync(){const s=read();for(const {f,input,output} of bindings){input.value=String(f.get(s));output.value=f.get(s).toFixed(2);}}
 sync();return {sync,dispose(){for(const {input} of bindings)input.oninput=null;reset.onclick=null;details.remove();}};
}
