import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Matrix, Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {FreeCamera} from '@babylonjs/core/Cameras/freeCamera.js';
import {WalkRoom} from '../network/room.ts';
import {SHOWCASE_ROOM,showcaseName,claimShowcaseGuest} from '../network/showcase-session.ts';
import {COLORS, invitationHash, parseInvitation} from '../network/protocol.ts';
import type {Player, Position} from '../network/protocol.ts';
import {FOREST_BOUNDS as B} from '../domain/forest.ts';
import {groundHeight} from '../domain/harness.ts';
import {shortestAngleDelta} from '../domain/coordinates.ts';
import {createRanger} from './ranger.ts';
import {roomCloakColors} from '../domain/cloak-colors.ts';
import './showcase-multiplayer.css';

type Walker = {e:number;n:number;heading:number};
type Ranger = Awaited<ReturnType<typeof createRanger>>;
type Remote = {root:TransformNode;rig:Ranger|null;label:HTMLElement;pose:Walker;failed:boolean};
const CAPACITY=SHOWCASE_ROOM.capacity;
export const packPosition=(p:Walker,speed=0,running=false):Position=>({x:(p.e-B.minE)/(B.maxE-B.minE),y:(p.n-B.minN)/(B.maxN-B.minN),heading:p.heading,speed,running,seq:0});
const unpack=(p:Position):Walker=>({e:B.minE+p.x*(B.maxE-B.minE),n:B.minN+p.y*(B.maxN-B.minN),heading:p.heading??0});
export function createShowcaseMultiplayer(scene:Scene,camera:FreeCamera,player:Walker,canStand:(e:number,n:number)=>boolean,localRanger:Ranger){
 const name=showcaseName(),remotes=new Map<string,Remote>();
 const soloCloak=localRanger.state().cloakColor;
 let cloakColors:string[]=[];
 let room:WalkRoom|null=null,invite=parseInvitation(location.hash),lastUi=0,disposed=false;
 const labels=document.createElement('div');labels.className='walker-labels';document.body.append(labels);
 const mine=document.createElement('span');mine.className='walker-name mine';mine.textContent=name;labels.append(mine);
 const panel=document.createElement('section');panel.className='friends-panel';panel.setAttribute('aria-label','Совместная прогулка');
 panel.innerHTML='<button type="button" id="invite-friends">Пригласить друзей</button><details id="friends-details"><summary id="friends-status">Прогулка на шестерых</summary><p id="friends-help">Создай комнату и отправь ссылку друзьям. Они появятся рядом с тобой.</p><input id="friends-link" readonly aria-label="Приглашение в лес" hidden><ol id="friends-list"></ol><button id="friends-retry" type="button" hidden>Подключиться снова</button><button id="friends-leave" type="button" hidden>Выйти из комнаты</button><button id="friends-report" type="button" hidden>Скачать результат связи</button><p id="friends-feedback" role="status"></p></details>';
 document.body.append(panel);
 const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#${id}`)!;
 const button=el<HTMLButtonElement>('invite-friends'),link=el<HTMLInputElement>('friends-link'),details=el<HTMLDetailsElement>('friends-details');
 function spawn(slot:number){
  // Prefer a free point close to the host; never spawn inside a tree or bank prop.
  for(const radius of [1.5,2.5,4,6])for(let i=0;i<12;i++){
   const angle=(slot/6+i/12)*Math.PI*2,e=player.e+Math.cos(angle)*radius,n=player.n+Math.sin(angle)*radius;
   if(e>B.minE+1&&e<B.maxE-1&&n>B.minN+1&&n<B.maxN-1&&canStand(e,n))return packPosition({e,n,heading:player.heading});
  }
  return packPosition(player);
 }
 function start(host:boolean){
  const options={...SHOWCASE_ROOM,initial:packPosition(player),spawn,
   onSpawn:(p:Position)=>{const destination=unpack(p);if(canStand(destination.e,destination.n))Object.assign(player,destination);}};
  const prepared=!host&&invite?claimShowcaseGuest(invite):null;
  room=host?WalkRoom.create(name,options):prepared?.room??new WalkRoom(invite!,false,name,options);
  prepared?.attach(options.onSpawn);
  invite=room.invite;
  cloakColors=roomCloakColors(invite.room);
  // Drop debug/experimental query parameters when sharing the ordinary showcase.
  const url=new URL(location.href);url.search='';url.hash=invitationHash(invite);link.value=url.href;link.hidden=false;
  history.replaceState(null,'',`${location.pathname}${location.search}#${invitationHash(invite)}`);
  details.open=true;renderUi();
 }
 function clearRemotes(){for(const remote of remotes.values()){remote.rig?.dispose();remote.root.dispose();remote.label.remove();}remotes.clear();}
 async function leave(){await room?.leave();room=null;invite=null;clearRemotes();history.replaceState(null,'',location.pathname+location.search);link.hidden=true;renderUi();}
 button.onclick=async()=>{
  button.disabled=true;
  try{
   if(!room||['ended','full','error'].includes(room.phase)){await leave();start(true);}
   try{await navigator.clipboard.writeText(link.value);el('friends-feedback').textContent='Ссылка скопирована — отправь её друзьям.';}
   catch{details.open=true;link.focus();link.select();el('friends-feedback').textContent='Скопируй выделенную ссылку и отправь друзьям.';}
  }catch{el('friends-feedback').textContent='Не удалось создать комнату. Повтори подключение.';details.open=true;}
  finally{button.disabled=false;renderUi();}
 };
 el('friends-leave').onclick=()=>{void leave();};
 el('friends-retry').onclick=()=>location.reload();
 el('friends-report').onclick=async()=>{
  const report=await room?.diagnostics();if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify({...report,scene:'showcase',userAgent:navigator.userAgent},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='drevlepuscha-showcase-connection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function renderUi(){
  const phase=room?.phase;
  const me=room?.players.get(room.id);
  localRanger.setCloak(me?cloakColors[me.slot]:soloCloak);
  button.textContent=!room?'Пригласить друзей':['ended','full','error'].includes(phase!)?'Создать свою комнату':'Скопировать приглашение';
  const texts={starting:'Создаём комнату…',waiting:'Ждём друзей',joining:'Подключаемся…',connected:'Гуляем вместе',reconnecting:'Восстанавливаем связь…',full:'Комната заполнена',ended:'Комната закрыта',error:'Не удалось подключиться'};
  el('friends-status').textContent=room?`${texts[room.phase]} · ${room.players.size}/${CAPACITY}`:'Прогулка на шестерых';
  panel.dataset.phase=phase??'solo';
  el('friends-help').textContent=room?(room.detail||(room.host?'Держи вкладку открытой: ты ведущий этой комнаты.':'Ведущий должен оставаться в комнате.')):'Создай комнату и отправь ссылку друзьям. Они появятся рядом с тобой.';
  el('friends-leave').hidden=!room;el('friends-report').hidden=!room;
  el('friends-retry').hidden=!room||room.host||!['full','error','reconnecting'].includes(room.phase);
  const list=el('friends-list');list.replaceChildren();
  for(const p of room?.players.values()??[]){const li=document.createElement('li');li.textContent=p.name+(p.id===room?.id?' · ты':'');li.style.color=COLORS[p.slot];list.append(li);}
  if(!room)el('friends-feedback').textContent='';
 }
 function addRemote(p:Player){
  const root=new TransformNode(`friend:${p.id}`,scene),pose=unpack(p);
  root.position.set(pose.e,groundHeight(pose.e,pose.n),-pose.n);root.rotation.y=-pose.heading*Math.PI/180;
  const label=document.createElement('span');label.className='walker-name';label.textContent=p.name;label.style.borderColor=COLORS[p.slot];labels.append(label);
  const remote:Remote={root,rig:null,label,pose,failed:false};remotes.set(p.id,remote);
  void createRanger(scene,root,p.id,cloakColors[p.slot]).then(rig=>{if(disposed||remotes.get(p.id)!==remote){rig.dispose();root.dispose();}else remote.rig=rig;}).catch(()=>{remote.failed=true;el('friends-feedback').textContent='Не удалось показать одного из следопытов. Обнови страницу для повторного входа.';});
  return remote;
 }
 function placeLabel(label:HTMLElement,p:Walker){
  const point=new Vector3(p.e,groundHeight(p.e,p.n)+2.05,-p.n),engine=scene.getEngine();
  const view=camera.getViewMatrix(),viewPoint=Vector3.TransformCoordinates(point,view);
  const distance=Vector3.DistanceSquared(camera.position,point);
  if(viewPoint.z>=0||distance>80*80){label.hidden=true;return;}
  const projected=Vector3.Project(point,Matrix.IdentityReadOnly,scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
  const x=projected.x/engine.getRenderWidth()*innerWidth,y=projected.y/engine.getRenderHeight()*innerHeight;
  label.hidden=projected.z<0||projected.z>1||x<0||x>innerWidth||y<0||y>innerHeight;
  label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
 }
 if(invite)start(false);
 else if(location.hash){details.open=true;el('friends-feedback').textContent='Приглашение неполное. Попроси ведущего отправить ссылку целиком.';}
 const timer=setInterval(renderUi,500);
 return {
  stopMotion(){room?.move((player.e-B.minE)/(B.maxE-B.minE),(player.n-B.minN)/(B.maxN-B.minN),{heading:player.heading,speed:0,running:false});},
  update(dt:number,speed:number,running:boolean){
   room?.move((player.e-B.minE)/(B.maxE-B.minE),(player.n-B.minN)/(B.maxN-B.minN),{heading:player.heading,speed,running});
   const active=room&&!['ended','full','error'].includes(room.phase);
   const people=active?[...room!.players.values()].filter(p=>p.id!==room!.id):[];
   for(const [id,remote] of remotes)if(!people.some(p=>p.id===id)){remote.rig?.dispose();remote.root.dispose();remote.label.remove();remotes.delete(id);}
   for(const p of people){
    const remote=remotes.get(p.id)??addRemote(p),target=unpack(p),distance=Math.hypot(remote.pose.e-target.e,remote.pose.n-target.n);
    const blend=distance>8?1:1-Math.exp(-dt/.1);
    remote.pose.e+=(target.e-remote.pose.e)*blend;remote.pose.n+=(target.n-remote.pose.n)*blend;
    remote.pose.heading+=shortestAngleDelta(remote.pose.heading,target.heading)*blend;
    remote.root.position.set(remote.pose.e,groundHeight(remote.pose.e,remote.pose.n),-remote.pose.n);remote.root.rotation.y=-remote.pose.heading*Math.PI/180;
    const near=Math.hypot(player.e-remote.pose.e,player.n-remote.pose.n)<120;remote.root.setEnabled(near);
    remote.rig?.setCloak(cloakColors[p.slot]);
    remote.rig?.update(near?dt:0,room?.phase==='reconnecting'?0:p.speed??0,p.running??false);
   }
   if(performance.now()-lastUi>100){lastUi=performance.now();placeLabel(mine,player);for(const r of remotes.values())placeLabel(r.label,r.pose);}
  },
  shadowMeshes:()=>[...remotes.values()].filter(r=>r.root.isEnabled()).flatMap(r=>r.root.getChildMeshes()),
  state:()=>({phase:room?.phase??'solo',name,capacity:CAPACITY,players:room?.players.size??1,remotes:[...remotes.values()].map(r=>({...r.pose,ready:!!r.rig,failed:r.failed,animation:r.rig?.state()}))}),
  diagnostics:()=>room?.diagnostics(),
  dispose(){disposed=true;clearInterval(timer);void room?.leave();clearRemotes();labels.remove();panel.remove();},
 };
}
