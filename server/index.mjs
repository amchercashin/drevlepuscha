import {loadWildlifeContent} from './wildlife-content.mjs';
import {WildlifeSession} from '../src/network/wildlife-session.ts';
import {wildlifeCapability,sameCapability} from '../src/network/wildlife-protocol.ts';
import {metricRoster,wildlifeEnvironment} from '../src/domain/showcase-wildlife-input.ts';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {RTCPeerConnection} from 'werift';
import {joinRoom,selfId} from '../src/network/signaling.ts';
import {RELAYS,ICE_SERVERS} from '../src/network/transport-config.ts';
import {ROOM_APP,ROOM_VERSION,encodeBytes,proofBytes,sessionInvitationHash} from '../src/network/persistent-protocol.ts';
import {record} from '../src/network/protocol.ts';
import {PersistentWorld} from '../src/domain/persistent-world.ts';
import {openRoomStorage} from './storage.mjs';

export async function startServer({dataDir='.server-data',clientUrl='https://amchercashin.github.io/drevlepuscha/',wildlife=false}={}){
 const link=new URL(clientUrl);
 if(!['http:','https:'].includes(link.protocol))throw Error('Адрес клиента должен использовать http или https.');
 const content=wildlife?loadWildlifeContent():null,fauna=content?new WildlifeSession({data:content},'authority',crypto.randomUUID(),performance.now()):null,ready=new Set();
 if(wildlife){link.searchParams.set('debug','1');link.searchParams.set('wildlife','1');}
 const storage=await openRoomStorage(dataDir),{state,signingKey}=storage;
 const world=new PersistentWorld({epochMs:state.epochMs});
 const invite={kind:'persistent',room:state.room,key:state.key,serverKey:state.serverKey};
 link.hash=sessionInvitationHash(invite);
 const connections=new Map(),sessions=new Map(),pending=new Map(),lastHeard=new Map(),inFlight=new Set(),lastClock=new Map();
 let timer=null,stopped=false,sent=0,received=0;
 const snapshot=()=>({v:ROOM_VERSION,...world.snapshot(),peers:Object.fromEntries([...sessions]),...(fauna?{wildlife:fauna.view.latest()}:{})});
 function release(peer){
  clearTimeout(pending.get(peer));pending.delete(peer);lastHeard.delete(peer);lastClock.delete(peer);inFlight.delete(peer);
  const id=connections.get(peer);connections.delete(peer);
  if(id&&sessions.get(id)===peer){sessions.delete(id);world.depart(id);ready.delete(id);}
  if(!sessions.size&&timer){clearInterval(timer);timer=null;}
 }
 let room;
 try{room=joinRoom({appId:ROOM_APP,password:invite.key,rtcPolyfill:RTCPeerConnection,relayConfig:{urls:RELAYS},rtcConfig:{iceServers:ICE_SERVERS}},invite.room,{
  handshakeTimeoutMs:10000,
  onPeerHandshake:async(peer,send,receive)=>{
   const {data}=await receive();
   if(stopped||!record(data)||JSON.stringify(data).length>1024||data.v!==ROOM_VERSION||data.room!==invite.room||typeof data.session!=='string'||!/^[\w-]{36}$/.test(data.session)||typeof data.nonce!=='string'||!/^[\w-]{36}$/.test(data.nonce)||typeof data.name!=='string'||data.name.length>100)throw Error('invalid-hello');
   const signature=encodeBytes(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,proofBytes(invite.room,data.nonce,selfId,peer)));
   if(!sameCapability(data.capability,content?.identity)){await send({v:ROOM_VERSION,signature,ok:false,reason:'incompatible-wildlife',...(content?{capability:wildlifeCapability(content.identity)}:{})});throw Error('incompatible-wildlife');}
   const id=createHash('sha256').update(data.session).digest('base64url').slice(0,24);
   const previous=sessions.get(id);
   const player=world.admit(id,data.name);
   if(!player){await send({v:ROOM_VERSION,signature,ok:false,reason:'full',...(content?{capability:wildlifeCapability(content.identity)}:{})});throw Error('full');}
   ready.delete(id); // A replacement page must finish loading before it can threaten wildlife.
   connections.set(peer,id);sessions.set(id,peer);lastHeard.set(peer,performance.now());
   if(previous&&previous!==peer){release(previous);room.getPeers()[previous]?.close();}
   pending.set(peer,setTimeout(()=>{release(peer);room.getPeers()[peer]?.close();},12000));
   await send({v:ROOM_VERSION,signature,ok:true,id,snapshot:snapshot(),...(content?{capability:wildlifeCapability(content.identity)}:{})});
  },
  onJoinError:({peerId})=>{if(pending.has(peerId))release(peerId);},
 });}catch(e){storage.close();throw e;}
 const moves=room.makeAction('move'),states=room.makeAction('state'),clock=room.makeAction('clock'),bye=room.makeAction('bye');
 moves.onMessage=(value,{peerId})=>{
  const id=connections.get(peerId);if(!id||sessions.get(id)!==peerId)return;
  if(record(value)&&JSON.stringify(value).length<=512&&(!fauna||typeof value.sceneReady==='boolean')&&world.move(id,value)){if(fauna){if(value.sceneReady)ready.add(id);else ready.delete(id);}received++;lastHeard.set(peerId,performance.now());}
 };
 clock.onMessage=(value,{peerId})=>{
  if(!connections.has(peerId)||!record(value)||!Number.isSafeInteger(value.nonce))return;
  const now=performance.now();if(now-(lastClock.get(peerId)??-Infinity)<1000)return;
  lastClock.set(peerId,now);
  lastHeard.set(peerId,now);void clock.send({nonce:value.nonce,serverMs:Date.now()},{target:peerId}).catch(()=>{});
 };
 bye.onMessage=(_,{peerId})=>{release(peerId);room.getPeers()[peerId]?.close();};
 function broadcast(){
  const now=performance.now();
  for(const [peer,time] of lastHeard)if(now-time>20000){release(peer);room.getPeers()[peer]?.close();}
  if(!sessions.size)return;
  if(fauna){const clock={epochMs:state.epochMs,serverMs:Date.now(),cycleSeconds:1200};fauna.advance(now,metricRoster(world.players.values(),ready,now),wildlifeEnvironment(clock));}
  const value=snapshot();
  for(const [id,peer] of sessions){
   if(pending.has(peer)||inFlight.has(peer))continue;
   inFlight.add(peer);void states.send(value,{target:peer}).then(()=>{sent++;},()=>{}).finally(()=>inFlight.delete(peer));
  }
 }
 room.onPeerJoin=peer=>{if(!connections.has(peer))return;clearTimeout(pending.get(peer));pending.delete(peer);if(!timer)timer=setInterval(broadcast,1000/15);broadcast();};
 room.onPeerLeave=release;
 const close=async()=>{if(stopped)return;stopped=true;fauna?.dispose();if(timer)clearInterval(timer);for(const t of pending.values())clearTimeout(t);try{await room.leave();}finally{storage.close();}};
 return {link:link.href,world,close,stats:()=>({players:world.players.size,ticking:!!timer,sent,received,rss:process.memoryUsage().rss,wildlife:fauna?.view.latest()??null,wildlifeStats:fauna?{...fauna.stats(),readyPlayers:ready.size}:null})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const k=args[i];if(!['--data-dir','--client-url','--wildlife'].includes(k)||!args[i+1])throw Error('Использование: npm run server -- [--data-dir КАТАЛОГ] [--client-url URL]');if(k==='--wildlife'){if(args[i+1]!=='test')throw Error('--wildlife accepts only test during W2');options.wildlife=true;}else options[k==='--data-dir'?'dataDir':'clientUrl']=args[i+1];}
 try{
  const server=await startServer(options);console.log('Постоянная комната готова. Откройте ссылку:\n'+server.link+'\nОстановка: Ctrl+C.');
  let closing=false;const stop=()=>{if(closing)return;closing=true;void server.close().finally(()=>process.exit(0));};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
