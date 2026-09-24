import './showcase.css';
import './style.css';
import {enableShowcase} from './domain/showcase.ts';
import {preloadShowcase} from './runtime/showcase-assets.ts';
import {parseSessionInvitation as parseInvitation} from './network/persistent-protocol.ts';
const params=new URLSearchParams(location.search);
try {
if(params.get('engine')==='lite'){
 enableShowcase();document.body.classList.remove('booting');
 await import('./lite/main.ts');
}else{
 const scene=params.get('scene');
 if(scene==='region'){if(params.get('region')!=='brandywine-bridge')throw Error('Неизвестная область');document.body.classList.remove('showcase');await import('./regions/game.ts');}
 else if(scene==='world'){document.body.classList.remove('showcase');document.title='Древлепуща — прогулка по карте';document.querySelector('h1')!.textContent='Древлепуща';document.querySelector('#pause-title')!.textContent='За Высокой Изгородью';await import('./world/game.ts');}
 else{
  if(scene!=='m0'&&scene!=='m1'){
   enableShowcase();
   // Opening an invitation after leaving can be a same-document hash navigation.
   // Re-enter through the lightweight connection gate in that case as well.
   window.addEventListener('hashchange',()=>{if(parseInvitation(location.hash))location.reload();});
   const invite=parseInvitation(location.hash);
   if(invite)await (await import('./network/showcase-entrance.ts')).enterShowcase(invite);
  }else document.body.classList.remove('showcase');
  if(scene==='m0'||scene==='m1'||(params.get('debug')==='1'&&params.get('wildlife')==='1'))await import('./main.ts');
  else{
   // The playable showcase owns its WebGPU device, pipelines and WGSL passes.
   const main=import('./native/main.ts');
   preloadShowcase(params);
   await main;
  }
 }
}

}catch(error){
 if(parseInvitation(location.hash))await import('./network/showcase-session.ts').then(m=>m.closePreparedGuest()).catch(()=>{});
 document.body.classList.remove('booting');
 document.querySelector('#pause-title')!.textContent='Не удалось открыть прогулку';
 document.querySelector('#pause-description')!.textContent=params.get('scene')==='region'&&params.get('region')!=='brandywine-bridge'?'Неизвестная область. Для Брендивинского моста используйте ?scene=region&region=brandywine-bridge.':'Проверьте соединение и повторите загрузку.';
 const button=document.querySelector<HTMLButtonElement>('#resume')!;button.textContent='Перезагрузить';button.disabled=false;button.onclick=()=>location.reload();
 if(params.get('debug')==='1')console.error(error);
}
