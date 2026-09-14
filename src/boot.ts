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
 if(scene==='world'){document.body.classList.remove('showcase');document.title='Древлепуща — прогулка по карте';document.querySelector('h1')!.textContent='Древлепуща';document.querySelector('#pause-title')!.textContent='За Высокой Изгородью';await import('./world/game.ts');}
 else{
  if(scene!=='m0'&&scene!=='m1'){
   enableShowcase();
   // Opening an invitation after leaving can be a same-document hash navigation.
   // Re-enter through the lightweight connection gate in that case as well.
   window.addEventListener('hashchange',()=>{if(parseInvitation(location.hash))location.reload();});
   const invite=parseInvitation(location.hash);
   if(invite)await (await import('./network/showcase-entrance.ts')).enterShowcase(invite);
  }else document.body.classList.remove('showcase');
  // Queue the renderer's code before bulk image transfers, still after joining.
  const main=import('./main.ts');
  if(scene!=='m0'&&scene!=='m1')preloadShowcase(params);
  await main;
 }
}

}catch(error){
 if(parseInvitation(location.hash))await import('./network/showcase-session.ts').then(m=>m.closePreparedGuest()).catch(()=>{});
 document.body.classList.remove('booting');
 document.querySelector('#pause-title')!.textContent='Не удалось открыть прогулку';
 document.querySelector('#pause-description')!.textContent='Проверьте соединение и повторите загрузку.';
 const button=document.querySelector<HTMLButtonElement>('#resume')!;button.textContent='Перезагрузить';button.disabled=false;button.onclick=()=>location.reload();
 if(params.get('debug')==='1')console.error(error);
}
