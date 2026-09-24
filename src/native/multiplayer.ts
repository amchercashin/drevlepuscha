import {createVoice} from '../network/voice.ts';
import {WalkRoom} from '../network/room.ts';
import {PersistentRoom} from '../network/persistent-room.ts';
import {SHOWCASE_ROOM,showcaseName,claimShowcaseGuest} from '../network/showcase-session.ts';
import {COLORS} from '../network/protocol.ts';
import type {Position,Player} from '../network/protocol.ts';
import type {WalkSession} from '../network/session.ts';
import {isPersistent,parseSessionInvitation,sessionInvitationHash} from '../network/persistent-protocol.ts';
import {FOREST_BOUNDS as B} from '../domain/forest.ts';
import {showcaseHeight} from '../domain/showcase.ts';
import {shortestAngleDelta} from '../domain/coordinates.ts';
import {roomCloakColors,CLOAK_COLORS} from '../domain/cloak-colors.ts';
import {cameraBasis} from './math.ts';
import type {NativeRemote} from './renderer.ts';
import '../runtime/showcase-multiplayer.css';

type Walker={e:number;n:number;heading:number};
type Remote={pose:Walker;speed:number;label:HTMLElement;slot:number;name:string};
const pack=(p:Walker,speed=0,running=false):Position=>({x:(p.e-B.minE)/(B.maxE-B.minE),y:(p.n-B.minN)/(B.maxN-B.minN),heading:p.heading,speed,running,seq:0});
const unpack=(p:Position):Walker=>({e:B.minE+p.x*(B.maxE-B.minE),n:B.minN+p.y*(B.maxN-B.minN),heading:p.heading??0});

export function createNativeMultiplayer(player:Walker,canStand:(e:number,n:number)=>boolean){
 const name=showcaseName(),remotes=new Map<string,Remote>();
 let cloakColors:string[]=[],room:WalkSession|null=null,invite=parseSessionInvitation(location.hash),voice:ReturnType<typeof createVoice>|null=null,disposed=false,lastUi=0,uiKey='';
 const labels=document.createElement('div');labels.className='walker-labels';document.body.append(labels);
 const mine=document.createElement('span');mine.className='walker-name mine';mine.textContent=name;labels.append(mine);
 const panel=document.createElement('section');panel.className='friends-panel';panel.setAttribute('aria-label','Совместная прогулка');
 panel.innerHTML='<button type="button" id="invite-friends">Пригласить друзей</button><details id="friends-details"><summary id="friends-status">Прогулка на шестерых</summary><p id="friends-help">Создай комнату и отправь ссылку друзьям. Они появятся рядом с тобой.</p><input id="friends-link" readonly aria-label="Приглашение в лес" hidden><ol id="friends-list"></ol><button id="friends-retry" type="button" hidden>Подключиться снова</button><button id="friends-leave" type="button" hidden>Выйти из комнаты</button><button id="friends-report" type="button" hidden>Скачать результат связи</button><p id="friends-feedback" role="status"></p></details>';
 document.body.append(panel);
 const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
 const button=el<HTMLButtonElement>('invite-friends'),link=el<HTMLInputElement>('friends-link'),details=el<HTMLDetailsElement>('friends-details');
 function spawn(slot:number){
  for(const radius of [1.5,2.5,4,6])for(let i=0;i<12;i++){
   const angle=(slot/6+i/12)*Math.PI*2,e=player.e+Math.cos(angle)*radius,n=player.n+Math.sin(angle)*radius;
   if(e>B.minE+1&&e<B.maxE-1&&n>B.minN+1&&n<B.maxN-1&&canStand(e,n))return pack({e,n,heading:player.heading});
  }
  return pack(player);
 }
 function start(host:boolean){
  const options={...SHOWCASE_ROOM,initial:pack(player),spawn,onSpawn:(p:Position)=>{
   const point=unpack(p);if(canStand(point.e,point.n))Object.assign(player,point);
  }};
  const prepared=!host&&invite?claimShowcaseGuest(invite):null;
  room=host?WalkRoom.create(name,options):prepared?.room??(invite&&isPersistent(invite)?new PersistentRoom(invite,name,options):new WalkRoom(invite!,false,name,options));
  prepared?.attach(options.onSpawn);
  if(room instanceof PersistentRoom)voice=createVoice(room,details);
  invite=room.invite;cloakColors=roomCloakColors(invite.room);
  const url=new URL(location.href);url.search='';url.hash=sessionInvitationHash(invite);
  link.value=url.href;link.hidden=false;
  history.replaceState(null,'',`${location.pathname}${location.search}#${sessionInvitationHash(invite)}`);
  details.open=true;renderUi();
 }
 async function leave(){voice?.dispose();voice=null;await room?.leave();room=null;invite=null;
  for(const remote of remotes.values())remote.label.remove();remotes.clear();
  history.replaceState(null,'',location.pathname+location.search);link.hidden=true;renderUi();
 }
 button.onclick=async()=>{button.disabled=true;try{
  if(!room||['ended','full','error'].includes(room.phase)){await leave();start(true);}
  try{await navigator.clipboard.writeText(link.value);el('friends-feedback').textContent='Ссылка скопирована — отправь её друзьям.';}
  catch{details.open=true;link.focus();link.select();el('friends-feedback').textContent='Скопируй выделенную ссылку и отправь друзьям.';}
 }catch{el('friends-feedback').textContent='Не удалось создать комнату. Повтори подключение.';details.open=true;}
 finally{button.disabled=false;renderUi();}};
 el('friends-leave').onclick=()=>{void leave();};
 el('friends-retry').onclick=()=>location.reload();
 el('friends-report').onclick=async()=>{
  const report=await room?.diagnostics();if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify({...report,scene:'showcase',userAgent:navigator.userAgent},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='drevlepuscha-showcase-connection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function renderUi(){
  const phase=room?.phase;
  const key=JSON.stringify([phase,room?.host,room?.detail,[...room?.players.values()??[]].map(p=>[p.id,p.name,p.slot])]);
  if(key===uiKey)return;uiKey=key;
  button.textContent=!room?'Пригласить друзей':['ended','full','error'].includes(phase!)?'Создать свою комнату':'Скопировать приглашение';
  const texts={starting:'Создаём комнату…',waiting:'Ждём друзей',joining:'Подключаемся…',connected:'Гуляем вместе',reconnecting:'Восстанавливаем связь…',full:'Комната заполнена',ended:'Комната закрыта',error:'Не удалось подключиться'};
  el('friends-status').textContent=room?`${texts[room.phase]} · ${room.players.size}/${SHOWCASE_ROOM.capacity}`:'Прогулка на шестерых';
  panel.dataset.phase=phase??'solo';
  el('friends-help').textContent=room?(room.detail||(room.persistent?'Постоянная комната · время общее для всех.':room.host?'Держи вкладку открытой: ты ведущий этой комнаты.':'Ведущий должен оставаться в комнате.')):'Создай комнату и отправь ссылку друзьям. Они появятся рядом с тобой.';
  el('friends-leave').hidden=!room;el('friends-report').hidden=!room;
  el('friends-retry').hidden=!room||room.host||!['full','error','reconnecting'].includes(room.phase);
  const list=el('friends-list');list.replaceChildren();
  for(const p of room?.players.values()??[]){const li=document.createElement('li');li.textContent=p.name+(p.id===room?.id?' · ты':'');li.style.color=COLORS[p.slot];list.append(li);}
  if(!room)el('friends-feedback').textContent='';
 }
 function labelAt(label:HTMLElement,p:Walker,eye:{x:number;y:number;z:number},target:{x:number;y:number;z:number},width:number,height:number){
  const basis=cameraBasis([eye.x,eye.y,eye.z],[target.x,target.y,target.z]);
  const position=[p.e-eye.x,showcaseHeight(p.e,p.n)+2.05-eye.y,-p.n-eye.z];
  const dot=(a:readonly number[],b:readonly number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const z=dot(position,basis.forward),tan=Math.tan(50*Math.PI/360);
  if(z<=0||z>80){label.hidden=true;return;}
  const x=.5+dot(position,basis.right)/(2*z*tan*width/height),y=.5-dot(position,basis.up)/(2*z*tan);
  label.hidden=x<0||x>1||y<0||y>1;
  label.style.transform=`translate(${x*innerWidth}px,${y*innerHeight}px) translate(-50%,-100%)`;
 }
 if(invite)start(false);
 else if(location.hash){details.open=true;el('friends-feedback').textContent='Приглашение неполное. Попроси ведущего отправить ссылку целиком.';}
 const timer=setInterval(renderUi,500);
 function update(dt:number,speed:number,running:boolean,eye:{x:number;y:number;z:number},target:{x:number;y:number;z:number},width:number,height:number){
  room?.move((player.e-B.minE)/(B.maxE-B.minE),(player.n-B.minN)/(B.maxN-B.minN),{heading:player.heading,speed,running});
  const active=room&&!['ended','full','error'].includes(room.phase);
  const people=active?[...room!.players.values()].filter(p=>p.id!==room!.id):[];
  for(const [id,remote] of remotes)if(!people.some(p=>p.id===id)){remote.label.remove();remotes.delete(id);}
  for(const person of people){
   let remote=remotes.get(person.id);
   if(!remote){const label=document.createElement('span');label.className='walker-name';label.textContent=person.name;label.style.borderColor=COLORS[person.slot];labels.append(label);remote={pose:unpack(person),speed:0,label,slot:person.slot,name:person.name};remotes.set(person.id,remote);}
   const next=unpack(person),distance=Math.hypot(remote.pose.e-next.e,remote.pose.n-next.n),blend=distance>8?1:1-Math.exp(-dt/.1);
   remote.pose.e+=(next.e-remote.pose.e)*blend;remote.pose.n+=(next.n-remote.pose.n)*blend;
   remote.pose.heading+=shortestAngleDelta(remote.pose.heading,next.heading)*blend;
   remote.speed=person.speed??0;remote.slot=person.slot;
  }
  if(performance.now()-lastUi>100){lastUi=performance.now();labelAt(mine,player,eye,target,width,height);for(const remote of remotes.values())labelAt(remote.label,remote.pose,eye,target,width,height);}
 }
 return {
  update,
  stopMotion(){room?.move((player.e-B.minE)/(B.maxE-B.minE),(player.n-B.minN)/(B.maxN-B.minN),{heading:player.heading,speed:0,running:false});},
  remotes:():NativeRemote[]=>[...remotes].map(([id,r])=>({id,...r.pose,speed:r.speed,cloakColor:cloakColors[r.slot]??CLOAK_COLORS[0]})),
  cloakColor:()=>{const me=room?.players.get(room.id);return me&&room!.players.size>1?cloakColors[me.slot]:CLOAK_COLORS[0];},
  clock:()=>room?.clock?.()??null,
  inRoom:()=>!!room&&!['ended','full','error'].includes(room.phase),
  state:()=>({voice:voice?.state()??null,persistent:room?.persistent??false,phase:room?.phase??'solo',name,capacity:SHOWCASE_ROOM.capacity,players:room?.players.size??1,remotes:[...remotes.values()].map(r=>({...r.pose,ready:true,failed:false}))}),
  dispose(){disposed=true;voice?.dispose();clearInterval(timer);void room?.leave();for(const remote of remotes.values())remote.label.remove();remotes.clear();labels.remove();panel.remove();},
 };
}
