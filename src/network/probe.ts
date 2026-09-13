import './probe.css';
import {WalkRoom} from './room.ts';
import {COLORS, MAX_PLAYERS, cleanName, invitationHash, parseInvitation} from './protocol.ts';
import type {Player} from './protocol.ts';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const field = el<HTMLElement>('field'), nameInput = el<HTMLInputElement>('name');
const createButton = el<HTMLButtonElement>('create'), copyButton = el<HTMLButtonElement>('copy');
let room: WalkRoom | null = null, invite = parseInvitation(location.hash);
let target: {x: number; y: number} | null = null, previous = performance.now();
const keys = new Set<string>();
const markers = new Map<string, {node: HTMLElement; x: number; y: number}>();
const storedName = (() => {try {return localStorage.getItem('drevlepuscha-guest-name');} catch {return null;}})();
nameInput.value = storedName || `Путник ${Math.floor(Math.random() * 90 + 10)}`;
function rememberName() {try {localStorage.setItem('drevlepuscha-guest-name', cleanName(nameInput.value));} catch {}}
function fail(message: string) {el('status').textContent = 'Не удалось открыть комнату'; el('detail').textContent = message;}
function start(host: boolean) {
  if (!host && !invite) return;
  rememberName(); target = null; keys.clear();
  try {
    room = host ? WalkRoom.create(nameInput.value) : new WalkRoom(invite!, false, nameInput.value);
    invite = room.invite;
    history.replaceState(null, '', `${location.pathname}${location.search}#${invitationHash(invite)}`);
    el<HTMLInputElement>('invite').value = location.href;
    el('invite-box').hidden = false; nameInput.disabled = true;
  } catch {fail('Браузер не смог запустить WebRTC. Откройте страницу в актуальном Chrome или Safari.');}
  renderUi();
}
createButton.onclick = async () => {await room?.leave(); start(true);};
// A fresh module instance also discards stale SDP/offers cached by the signaling adapter.
el('retry').onclick = () => {location.reload();};
el('leave').onclick = async () => {await room?.leave(); target = null; keys.clear(); renderUi();};
copyButton.onclick = async () => {
  const input = el<HTMLInputElement>('invite');
  try {await navigator.clipboard.writeText(input.value); el('copy-status').textContent = 'Приглашение скопировано. Отправь его в чат друзьям.';}
  catch {input.focus(); input.select(); el('copy-status').textContent = 'Скопируй выделенную ссылку и отправь друзьям.';}
};
const labels = {starting:'Создаём комнату…',waiting:'Комната открыта · ждём друзей',joining:'Ищем ведущего…',connected:'Вы на одной поляне',reconnecting:'Восстанавливаем связь…',full:'Комната заполнена',ended:'Прогулка завершена',error:'Связь пока не установлена'};
function renderUi() {
  const active = room && !['ended', 'full'].includes(room.phase);
  const people = room ? [...room.players.values()].sort((a,b) => a.slot-b.slot) : [];
  createButton.hidden = Boolean(active); el('leave').hidden = !active;
  el('retry').hidden = !room || room.host || !['error','reconnecting','full'].includes(room.phase);
  copyButton.disabled = !room || !active || !room.relayStatus().some(r => r.connected);
  nameInput.disabled = Boolean(active);
  el('count').textContent = `${people.length} из ${MAX_PLAYERS}`;
  el('empty').hidden = Boolean(room && active);
  if (room) {
    el('status').textContent = labels[room.phase]; el('dot').dataset.phase = room.phase;
    el('detail').textContent = room.detail || (room.host ? 'Отправь приглашение друзьям. Держи эту вкладку открытой во время прогулки.' : 'Двигайтесь по поляне и проверьте, что видите друг друга.');
  }
  const list = el('people'); list.replaceChildren();
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    const p = people.find(p => p.slot === slot), li = document.createElement('li'), dot = document.createElement('i');
    if (p) {dot.style.setProperty('--player-color', COLORS[slot]);li.append(dot, document.createTextNode(p.name + (p.id === room?.id ? ' · вы' : '')));}
    else {li.className='vacant'; li.append(dot, document.createTextNode('Свободное место'));}
    list.append(li);
  }
}
function moveTo(event: PointerEvent) {
  if (!room || ['full','ended'].includes(room.phase)) return;
  const box = field.getBoundingClientRect();
  target = {x:Math.max(.025,Math.min(.975,(event.clientX-box.left)/box.width)),y:Math.max(.035,Math.min(.965,(event.clientY-box.top)/box.height))};
  const node = el('target'); node.hidden=false; node.style.left=`${target.x*100}%`;node.style.top=`${target.y*100}%`;
}
field.addEventListener('pointerdown',event=>{field.focus({preventScroll:true});field.setPointerCapture(event.pointerId);moveTo(event);});
field.addEventListener('pointermove',event=>{if(field.hasPointerCapture(event.pointerId))moveTo(event);});
const movementCodes = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
field.addEventListener('keydown',event=>{if(movementCodes.includes(event.code)){event.preventDefault();keys.add(event.code);target=null;el('target').hidden=true;}});
window.addEventListener('keyup',event=>keys.delete(event.code));
function releaseInput(){keys.clear();target=null;el('target').hidden=true;}
window.addEventListener('blur',releaseInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();});
function drawPlayer(p: Player, dt: number) {
  let item = markers.get(p.id);
  if (!item) {
    const node=document.createElement('div');node.className='marker'+(p.id===room?.id?' mine':'');
    node.dataset.playerId=p.id;node.append(document.createElement('i'),document.createElement('span'));
    node.style.setProperty('--player-color',COLORS[p.slot]);el('markers').append(node);
    item={node,x:p.x,y:p.y};markers.set(p.id,item);
  }
  const factor=p.id===room?.id?1:1-Math.exp(-dt/.10);
  item.node.style.setProperty('--player-color',COLORS[p.slot]);
  item.x+=(p.x-item.x)*factor;item.y+=(p.y-item.y)*factor;
  item.node.style.left=`${item.x*100}%`;item.node.style.top=`${item.y*100}%`;
  item.node.querySelector('span')!.textContent=p.name+(p.id===room?.id?' · вы':'');
}
function frame(now: number) {
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(room && !['full','ended'].includes(room.phase)){
    const p=room.localPlayer;
    let dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let dy=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    if(target){dx=target.x-p.x;dy=target.y-p.y;}
    const distance=Math.hypot(dx,dy);
    if(distance>0){const step=target?Math.min(distance,.25*dt):.25*dt;room.move(p.x+dx/distance*step,p.y+dy/distance*step);if(target&&distance<.006){target=null;el('target').hidden=true;}}
    const people=[...room.players.values()];if(!people.some(p=>p.id===room?.id))people.push(room.localPlayer);
    for(const p of people)drawPlayer(p,dt);
    for(const [id,item] of markers)if(!people.some(p=>p.id===id)){item.node.remove();markers.delete(id);}
  }else{for(const item of markers.values())item.node.remove();markers.clear();}
  requestAnimationFrame(frame);
}
async function report() {
  if(!room)return {error:'no-room'};
  return {...await room.diagnostics(),userAgent:navigator.userAgent,scope:'real room; network locations require confirmation by participants'};
}
el('report').onclick=async()=>{
  const data=JSON.stringify(await report(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='drevlepuscha-connection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
el('report-copy').onclick=async()=>{
  const data=JSON.stringify(await report(),null,2);el('network-summary').textContent=data;
  try{await navigator.clipboard.writeText(data);el('copy-status').textContent='Результат проверки скопирован.';}catch{el('network-summary').textContent=data+'\n\nСкопируйте этот текст или скачайте результат.';}
};
setInterval(renderUi,500);
setInterval(()=>{if(el<HTMLDetailsElement>('diagnostics').open)void report().then(data=>{el('network-summary').textContent=JSON.stringify(data,null,2);});},2500);
Object.assign(window,{networkProbeReport:report});
window.addEventListener('pagehide',()=>{void room?.leave();});
if(location.hash&&!invite)fail('Приглашение неполное. Попросите ведущего скопировать ссылку целиком.');
else if(invite)start(false);
renderUi();requestAnimationFrame(frame);
