import {createVoiceAudio} from './voice-audio.ts';
import type {VoiceSession} from './voice-session.ts';

export function createVoice(session:VoiceSession,parent:HTMLElement){
 const panel=document.createElement('section');panel.className='voice-controls';panel.setAttribute('aria-label','Голосовой чат');
 panel.innerHTML='<strong>Голосовой чат</strong><div><button type="button" data-voice="join">Подключить голос</button><button type="button" data-voice="mic" hidden>Включить микрофон</button></div><p role="status"></p><button type="button" data-voice="play" hidden>Воспроизвести звук</button><ul></ul>';
 parent.append(panel);
 const join=panel.querySelector<HTMLButtonElement>('[data-voice="join"]')!,mic=panel.querySelector<HTMLButtonElement>('[data-voice="mic"]')!,play=panel.querySelector<HTMLButtonElement>('[data-voice="play"]')!,status=panel.querySelector('p')!,list=panel.querySelector('ul')!;
 let pending=false,disposed=false,uiKey='';
 const audio=createVoiceAudio(session,()=>render());
 function render(){
  if(disposed)return;
  const state=audio.state(),members=session.voiceMembers().filter(p=>p.id!==session.id);
  const key=JSON.stringify([state,pending,session.phase,members]);if(key===uiKey)return;uiKey=key;
  join.textContent=state.joined?'Отключить голос':'Подключить голос';join.disabled=!state.joined&&session.phase!=='connected';
  mic.hidden=!state.joined;mic.disabled=pending;mic.textContent=pending?'Запрашиваем микрофон…':state.microphone?'Выключить микрофон':'Включить микрофон';
  status.textContent=state.error||(state.joined?`В разговоре · соединений: ${state.peers}. ${state.microphone?'Микрофон включён.':'Микрофон выключен.'}`:'Голос отключён. Подключитесь, чтобы слушать друзей.');
  play.hidden=!state.joined||!state.error;
  list.replaceChildren();
  if(state.joined)for(const member of members){const li=document.createElement('li'),button=document.createElement('button');button.type='button';const muted=state.muted.includes(member.peerId);button.textContent=(muted?'Слушать ':'Заглушить ')+member.name;button.setAttribute('aria-pressed',String(muted));button.onclick=()=>audio.mute(member.peerId,!muted);li.append(button);list.append(li);}
 }
 join.onclick=()=>{if(audio.state().joined)audio.leave();else audio.join();render();};
 mic.onclick=async()=>{pending=true;render();try{await audio.setMicrophone(!audio.state().microphone);}finally{pending=false;render();}};
 play.onclick=()=>{void audio.resume();};
 const unsubscribe=session.onChange(render),unload=()=>audio.leave();window.addEventListener('pagehide',unload);
 render();
 return {state:audio.state,dispose(){if(disposed)return;disposed=true;unsubscribe();window.removeEventListener('pagehide',unload);audio.dispose();panel.remove();}};
}
