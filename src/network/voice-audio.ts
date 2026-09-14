import type {Room} from '@trystero-p2p/core';
import {joinRoom,selfId} from './signaling.ts';
import {RELAYS,ICE_SERVERS} from './transport-config.ts';
import {record} from './protocol.ts';
import type {VoiceSession} from './voice-session.ts';

/** Browser-only mesh. The game server is never a member of this room. */
export function createVoiceAudio(session:VoiceSession,changed:()=>void){
 let room:Room|null=null,local:MediaStream|null=null,error='',generation=0,captureGeneration=0,disposed=false;
 let closing:Promise<void>|null=null;
 const audio=new Map<string,{element:HTMLAudioElement;stream:MediaStream}>(),muted=new Set<string>(),peers=new Set<string>();
 const member=(peer:string,id?:string)=>session.phase==='connected'&&session.voiceMembers().some(p=>p.peerId===peer&&(id===undefined||p.id===id));
 const notify=()=>{if(!disposed)changed();};
 const remove=(peer:string)=>{const remote=audio.get(peer);if(remote){remote.element.pause();remote.element.srcObject=null;remote.element.remove();audio.delete(peer);}};
 const stopMicrophone=()=>{captureGeneration++;if(local){room?.removeStream(local);for(const track of local.getTracks())track.stop();local=null;}};
 const fail=(message:string,g:number)=>{if(g===generation&&room){error=message;notify();}};
 function sendStream(peer?:string){
  if(!local||!room)return;const g=generation;
  for(const promise of room.addStream(local,peer?{target:peer}:undefined))void promise.catch(()=>fail('Не удалось передать звук одному из участников.',g));
 }
 async function play(remote:{element:HTMLAudioElement},g:number){try{await remote.element.play();}catch{fail('Нажмите «Воспроизвести звук», чтобы разрешить прослушивание.',g);}}
 function leave(){
  generation++;stopMicrophone();const previous=room;room=null;error='';peers.clear();muted.clear();for(const peer of audio.keys())remove(peer);
  if(previous){const task=previous.leave().catch(()=>{}).finally(()=>{if(closing===task)closing=null;});closing=task;}notify();
 }
 function join(){
  if(disposed||room||session.phase!=='connected')return;
  // Trystero removes its cached room only after asynchronous leave completes.
  if(closing){const request=++generation;void closing.then(()=>{if(request===generation&&!disposed)join();});return;}
  const g=++generation;error='';
  try{
   room=joinRoom({appId:'drevlepuscha-voice-v1',password:session.invite.key,relayConfig:{urls:RELAYS},rtcConfig:{iceServers:ICE_SERVERS}},session.invite.room,{
    handshakeTimeoutMs:5000,
    onPeerHandshake:async(peer,send,receive)=>{
     await send({v:1,id:session.id});const {data}=await receive();
     if(!record(data)||data.v!==1||typeof data.id!=='string'||peer===selfId)throw Error('invalid-voice-member');
     const deadline=performance.now()+1500;
     while(g===generation&&session.phase==='connected'&&!member(peer,data.id)&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));
     if(g!==generation||!member(peer,data.id))throw Error('voice-membership-ended');
    },
    onJoinError:()=>fail('Голосовая связь с одним из участников пока недоступна.',g),
   });
   room.onPeerJoin=peer=>{if(g!==generation)return;if(!member(peer)){room?.getPeers()[peer]?.close();return;}peers.add(peer);sendStream(peer);notify();};
   room.onPeerLeave=peer=>{if(g!==generation)return;peers.delete(peer);remove(peer);muted.delete(peer);notify();};
   room.onPeerStream=(stream,peer)=>{
    if(g!==generation||!member(peer)||stream.getVideoTracks().length||!stream.getAudioTracks().length)return;
    if(audio.get(peer)?.stream===stream)return;
    remove(peer);const element=new Audio();element.autoplay=true;element.muted=muted.has(peer);element.srcObject=stream;
    const remote={element,stream};audio.set(peer,remote);
    const ended=()=>{if(audio.get(peer)!==remote)return;if(!stream.getAudioTracks().some(t=>t.readyState==='live')){remove(peer);notify();}};
    stream.addEventListener('removetrack',ended);for(const track of stream.getTracks())track.addEventListener('ended',ended,{once:true});
    void play(remote,g);notify();
   };
  }catch{room=null;error='Не удалось подключить голос. Попробуйте снова.';}
  notify();
 }
 async function setMicrophone(enabled:boolean){
  if(disposed||!room)return;
  if(!enabled){stopMicrophone();error='';notify();return;}
  if(local)return;
  const g=generation,c=++captureGeneration;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(disposed||!room||g!==generation||c!==captureGeneration){for(const track of stream.getTracks())track.stop();return;}
   local=stream;error='';
   for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(local===stream){stopMicrophone();notify();}},{once:true});
   sendStream();notify();
  }catch{if(g===generation&&c===captureGeneration)fail('Микрофон недоступен. Разрешите доступ и попробуйте снова; слушать можно без микрофона.',g);}
 }
 function refresh(){
  if(!room)return;if(session.phase!=='connected'){leave();return;}
  for(const peer of peers)if(!member(peer)){peers.delete(peer);remove(peer);muted.delete(peer);room.getPeers()[peer]?.close();}
  notify();
 }
 const unsubscribe=session.onChange(refresh);
 return {
  join,leave,setMicrophone,
  mute(peer:string,value:boolean){if(value)muted.add(peer);else muted.delete(peer);const remote=audio.get(peer);if(remote)remote.element.muted=value;notify();},
  async resume(){if(!room)return;error='';const g=generation;await Promise.all([...audio.values()].map(remote=>play(remote,g)));notify();},
  state:()=>({joined:!!room,microphone:!!local,peers:peers.size,streams:audio.size,muted:[...muted],error}),
  dispose(){if(disposed)return;disposed=true;unsubscribe();leave();},
 };
}
