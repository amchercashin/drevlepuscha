import {WildlifeSession} from './wildlife-session.ts';
import type {WildlifeSessionView} from './wildlife-session.ts';
import {wildlifeCapability,sameCapability} from './wildlife-protocol.ts';
import type {Room,MessageAction} from '@trystero-p2p/core';
import {joinRoom,selfId,getSignalingDiagnostics} from './signaling.ts';
import {RELAYS,ICE_SERVERS} from './transport-config.ts';
import {cleanName,record,validPosition} from './protocol.ts';
import type {Player,Position} from './protocol.ts';
import type {RoomOptions,Phase} from './room.ts';
import {ROOM_APP,ROOM_VERSION,ROOM_CAPACITY,validSnapshot,verifyServer} from './persistent-protocol.ts';
import type {PersistentInvitation,WorldClock,RoomSnapshot} from './persistent-protocol.ts';
import type {WalkSession} from './session.ts';

export type VoiceMember={id:string;peerId:string;name:string};
export class PersistentRoom implements WalkSession {
 readonly persistent=true;readonly host=false;
 readonly wildlife?:WildlifeSessionView;private fauna?:WildlifeSession;private sceneReady=false;
 id='';readonly players=new Map<string,Player>();
 phase:Phase='joining';detail='Ищем постоянную комнату…';
 private room:Room;private moves:MessageAction<Position & {sceneReady?:boolean}>;private serverPeer:string|null=null;
 private local:Position={x:.5,y:.4,seq:0,heading:0,speed:0,running:false};
 private sharedClock:WorldClock|null=null;private peers:Record<string,string>={};
 private lastTick=-1;private lastMessage=performance.now();private stopped=false;private sending=false;
 private attemptAt=performance.now();
 private readonly listeners=new Set<()=>void>();private timer:ReturnType<typeof setInterval>;
 private readonly session:string;private pingNonce=0;private pingAt=0;private halfRtt=0;private nextPing=0;
 private sent=0;private received=0;private errors=0;
 constructor(readonly invite:PersistentInvitation,name:string,private options:RoomOptions={}){
  if(options.wildlife){this.fauna=new WildlifeSession(options.wildlife,'replica','pending',performance.now());this.wildlife=this.fauna.view;this.fauna.bindReady(ready=>{this.sceneReady=ready;});}
  let session:string=crypto.randomUUID();
  try{const saved=sessionStorage.getItem('drevlepuscha-persistent-session');if(saved&&/^[\w-]{36}$/.test(saved))session=saved;sessionStorage.setItem('drevlepuscha-persistent-session',session);}catch{}
  this.session=session;
  this.room=joinRoom({appId:ROOM_APP,password:invite.key,passive:true,relayConfig:{urls:RELAYS},rtcConfig:{iceServers:ICE_SERVERS}},invite.room,{
   handshakeTimeoutMs:10000,
   onPeerHandshake:async(peer,send,receive)=>{
    if(this.stopped)throw Error('closed');
    const nonce=crypto.randomUUID();
    await send({v:ROOM_VERSION,room:invite.room,session,name:cleanName(name),nonce,...(options.wildlife?{capability:wildlifeCapability(options.wildlife.data.identity)}:{})});
    const {data}=await receive();
    if(!record(data)||data.v!==ROOM_VERSION||!await verifyServer(invite,nonce,peer,selfId,data.signature))throw Error('invalid-server-proof');
    if(this.stopped)throw Error('closed');
    if(!sameCapability(data.capability,options.wildlife?.data.identity)){this.phase='error';this.detail='Версии леса различаются; обновите страницу';this.emit();throw Error('incompatible-wildlife');}
    if(data.ok===false&&data.reason==='full'){this.phase='full';this.detail=`В комнате уже ${ROOM_CAPACITY} участников. Попробуйте подключиться позже.`;this.emit();throw Error('full');}
    if(data.ok!==true||typeof data.id!=='string'||!validSnapshot(data.snapshot)||!data.snapshot.players.some(p=>p.id===data.id)||data.snapshot.peers[data.id]!==selfId)throw Error('invalid-welcome');
    if(this.fauna&&!this.fauna.accept(data.snapshot.wildlife,performance.now(),true))throw Error('invalid-wildlife-welcome');
    const old=this.serverPeer;this.serverPeer=peer;this.id=data.id;this.lastTick=-1;
    this.local={...data.snapshot.players.find(p=>p.id===this.id)!,seq:0};
    this.options.onSpawn?.(this.local);this.accept(data.snapshot);
    if(old&&old!==peer)this.room.getPeers()[old]?.close();
   },
   onJoinError:()=>{if(this.stopped)return;this.errors++;if(this.phase==='joining'||this.phase==='reconnecting'){this.detail='Сервер пока недоступен. Продолжаем искать комнату.';this.emit();}},
  });
  this.moves=this.room.makeAction<Position & {sceneReady?:boolean}>('move');
  const states=this.room.makeAction('state'),clock=this.room.makeAction('clock');
  states.onMessage=(data,{peerId})=>{if(!this.stopped&&peerId===this.serverPeer&&validSnapshot(data)&&data.tick>this.lastTick&&data.players.some(p=>p.id===this.id)&&data.peers[this.id]===selfId&&(!this.fauna||this.fauna.accept(data.wildlife,performance.now()-this.halfRtt)))this.accept(data);};
  clock.onMessage=(data,{peerId})=>{
   if(peerId!==this.serverPeer||!record(data)||data.nonce!==this.pingNonce||!Number.isSafeInteger(data.serverMs))return;
   const now=performance.now();this.halfRtt=Math.min(1000,(now-this.pingAt)/2);
   if(this.sharedClock)this.sharedClock={...this.sharedClock,serverMs:Number(data.serverMs)+this.halfRtt,receivedAt:now};
  };
  this.room.onPeerLeave=peer=>{if(peer===this.serverPeer)this.disconnected();};
  this.timer=setInterval(()=>{
   if(this.stopped)return;
   const now=performance.now();
   if(this.serverPeer&&now-this.lastMessage>15000){const peer=this.serverPeer;this.disconnected();this.room.getPeers()[peer]?.close();}
   if(!this.serverPeer&&(this.phase==='joining'||this.phase==='reconnecting')){
    const relayReady=getSignalingDiagnostics().some(r=>r.connected),elapsed=now-this.attemptAt;
    // Relay availability does not imply that the room server can be reached.
    if(elapsed>40000||(!relayReady&&elapsed>15000)){
     this.phase='error';this.detail=relayReady?'Не удалось подключиться к серверу комнаты. Попробуйте снова или продолжите прогулку одному.':'Сервисы подключения не отвечают. Попробуйте снова или продолжите прогулку одному.';this.emit();
    }
   }
   if(!this.serverPeer||this.phase!=='connected')return;
   if(!this.sending){this.sending=true;void this.moves.send({...this.local,seq:++this.local.seq,...(this.fauna?{sceneReady:this.sceneReady}:{})},{target:this.serverPeer}).then(()=>{this.sent++;},()=>{}).finally(()=>{this.sending=false;});}
   if(now>=this.nextPing){this.pingAt=now;this.nextPing=now+5000;void clock.send({nonce:++this.pingNonce},{target:this.serverPeer}).catch(()=>{});}
  },1000/15);
 }
 private accept(value:RoomSnapshot){
  this.received++;this.lastTick=value.tick;this.lastMessage=performance.now();this.peers=value.peers;
  this.sharedClock={...value.clock,serverMs:value.clock.serverMs+this.halfRtt,receivedAt:this.lastMessage};
  this.players.clear();for(const p of value.players)this.players.set(p.id,p.id===this.id?{...p,...this.local}:p);
  this.phase='connected';this.detail='Постоянная комната · время общее для всех.';this.emit();
 }
 private disconnected(){this.serverPeer=null;this.players.clear();this.peers={};this.attemptAt=performance.now();this.phase='reconnecting';this.detail='Сервер недоступен. Восстанавливаем соединение…';this.emit();}
 private emit(){for(const listener of this.listeners)listener();}
 onChange(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
 voiceMembers():VoiceMember[]{return [...this.players.values()].map(p=>({id:p.id,name:p.name,peerId:this.peers[p.id]})).filter(p=>!!p.peerId);}
 move(x:number,y:number,extra:Partial<Position>={}){
  const p={x,y,seq:this.local.seq,heading:extra.heading??0,speed:extra.speed??0,running:extra.running??false};
  if(validPosition(p)){this.local=p;const me=this.players.get(this.id);if(me)this.players.set(this.id,{...me,...p});}
 }
 clock(){return this.sharedClock;}
 async diagnostics(){return {transport:'trystero',persistent:true,phase:this.phase,players:this.players.size,sent:this.sent,received:this.received,handshakeErrors:this.errors,relays:getSignalingDiagnostics()};}
 async leave(){
  if(this.stopped)return;this.stopped=true;clearInterval(this.timer);this.fauna?.dispose();
  const peer=this.serverPeer;this.phase='ended';this.players.clear();this.peers={};this.emit();this.listeners.clear();
  if(peer)void this.room.makeAction('bye').send({v:ROOM_VERSION},{target:peer}).catch(()=>{});
  await this.room.leave();
 }
}
