import {WalkRoom} from './room.ts';
import {cleanName} from './protocol.ts';
import type {Invitation, Position} from './protocol.ts';

// The lightweight entrance and the forest must join exactly the same room.
export const SHOWCASE_ROOM={capacity:6,appId:'drevlepuscha-showcase-v1'};
let nameForPage:string|null=null;
export function showcaseName(){
 if(nameForPage)return nameForPage;
 let name='';try{name=sessionStorage.getItem('showcase-walker-name')??'';}catch{}
 if(!name){
  const first=['Тихий','Лесной','Северный','Сумрачный','Зелёный','Вольный','Зоркий','Солнечный'];
  const last=['Ясень','Клён','Дрозд','Ветер','Кедр','Сокол','Ворон','Лис'];
  name=`${first[Math.floor(Math.random()*first.length)]} ${last[Math.floor(Math.random()*last.length)]} ${Math.floor(Math.random()*90+10)}`;
  try{sessionStorage.setItem('showcase-walker-name',name);}catch{}
 }
 return nameForPage=cleanName(name);
}

let prepared:ReturnType<typeof makeGuest>|null=null;
function makeGuest(invite:Invitation){
 let lastSpawn:Position|null=null,onSpawn:((p:Position)=>void)|null=null,claimed=false;
 const room=new WalkRoom(invite,false,showcaseName(),{...SHOWCASE_ROOM,
  onSpawn:p=>{lastSpawn=p;onSpawn?.(p);},
 });
 const unload=()=>{void room.leave();};
 window.addEventListener('pagehide',unload,{once:true});
 return {
  room,
  claim(invitation:Invitation){
   if(claimed||invitation.room!==invite.room||invitation.host!==invite.host||invitation.key!==invite.key)return null;
   claimed=true;return this;
  },
  attach(applySpawn:(p:Position)=>void){onSpawn=applySpawn;if(lastSpawn)applySpawn(lastSpawn);},
  async close(){window.removeEventListener('pagehide',unload);await room.leave();},
 };
}
export function prepareShowcaseGuest(invite:Invitation){
 if(prepared)throw Error('Showcase guest already prepared');
 prepared=makeGuest(invite);return prepared.room;
}
export const claimShowcaseGuest=(invite:Invitation)=>prepared?.claim(invite)??null;
export async function closePreparedGuest(){const previous=prepared;prepared=null;await previous?.close();}
