import {isPersistent} from './persistent-protocol.ts';
import type {SessionInvitation as Invitation} from './persistent-protocol.ts';
import {prepareShowcaseGuest,closePreparedGuest} from './showcase-session.ts';

/** Connect like the lightweight probe, before importing the forest or WebGPU.
 * The forest subsequently adopts this exact WalkRoom and its open DataChannel.
 */
export async function enterShowcase(invite:Invitation){
 const title=document.querySelector<HTMLElement>('#pause-title')!;
 const description=document.querySelector<HTMLElement>('#pause-description')!;
 const resume=document.querySelector<HTMLButtonElement>('#resume')!;
 const caption=document.querySelector<HTMLElement>('.pause-card .small')!;
 const saved={title:title.textContent,description:description.textContent,caption:caption.textContent};
 const controls=document.createElement('div');controls.id='connection-controls';
 controls.innerHTML='<button id="connection-retry" type="button" hidden>Попробовать снова</button><button id="connection-solo" type="button">Пока гулять одному</button><button id="connection-report" type="button">Скачать результат связи</button>';
 resume.after(controls);
 title.textContent='Встречаемся в лесу';
 caption.textContent=isPersistent(invite)?'Постоянная комната · сервер должен быть запущен.':'Ведущий должен держать свою вкладку открытой.';
 resume.disabled=true;resume.textContent='Подключаемся…';
 const retry=controls.querySelector<HTMLButtonElement>('#connection-retry')!;
 retry.onclick=()=>location.reload();
 const room=await prepareShowcaseGuest(invite);
 controls.querySelector<HTMLButtonElement>('#connection-report')!.onclick=async()=>{
  const data={...await room.diagnostics(),scene:'showcase-entrance',userAgent:navigator.userAgent};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='drevlepuscha-showcase-connection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 try{
  await new Promise<void>(resolve=>{
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;clearInterval(timer);resolve();};
   const solo=controls.querySelector<HTMLButtonElement>('#connection-solo')!;
   const update=()=>{
    controls.dataset.phase=room.phase;
    if(room.phase==='connected'){performance.mark('room:connected-before-scene');finish();return;}
    const failed=['error','ended','full'].includes(room.phase);
    retry.hidden=!failed;solo.textContent=failed?'Продолжить одному':'Пока гулять одному';
    description.textContent=room.detail||(room.phase==='error'&&!isPersistent(invite)?'Пока не удалось связаться с ведущим. Проверьте, что его вкладка открыта, или сохраните результат связи.':room.phase==='joining'?'Ищем комнату друга…':'Восстанавливаем связь с комнатой…');
    resume.textContent=failed?(room.phase==='full'?'Комната заполнена':'Связь пока не установлена'):'Подключаемся…';
   };
   const timer=setInterval(update,200);update();
   controls.querySelector<HTMLButtonElement>('#connection-solo')!.onclick=async()=>{
    if(finished)return;
    // Detach before awaiting leave, so a simultaneous late connection cannot
    // hand a closing room to the forest.
    finished=true;clearInterval(timer);await closePreparedGuest();
    history.replaceState(null,'',location.pathname+location.search);resolve();
   };
  });
 }finally{
  controls.remove();title.textContent=saved.title;description.textContent=saved.description;caption.textContent=saved.caption;
  resume.textContent='Открываем лес…';
 }
}
