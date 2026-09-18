import {invitationHash,parseInvitation,record,validRoster} from './protocol.ts';
import type {Invitation,Player} from './protocol.ts';
import {ROOM_CAPACITY} from '../domain/room-config.ts';
export {ROOM_CAPACITY} from '../domain/room-config.ts';
export const ROOM_VERSION=1, ROOM_APP='drevlepuscha-persistent-v1';
export type PersistentInvitation={kind:'persistent';room:string;key:string;serverKey:string};
export type SessionInvitation=Invitation|PersistentInvitation;
export type ClockSample={epochMs:number;serverMs:number;cycleSeconds:number};
export type WorldClock=ClockSample & {receivedAt:number};
export type RoomSnapshot={v:1;tick:number;players:Player[];peers:Record<string,string>;clock:ClockSample};
export const isPersistent=(i:SessionInvitation):i is PersistentInvitation=>'kind' in i&&i.kind==='persistent';
export const validId=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_-]{8,64}$/.test(s);
export const encodeBytes=(b:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const decodeBytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function parseSessionInvitation(hash:string):SessionInvitation|null{
 const p=new URLSearchParams(hash.replace(/^#/,''));
 if(!p.has('persistent'))return parseInvitation(hash);
 const room=p.get('room')??'',key=p.get('key')??'',serverKey=p.get('server')??'';
 if(p.get('persistent')!=='1'||!/^[\w-]{16,64}$/.test(room)||!/^[\w-]{24,80}$/.test(key)||!/^[\w-]{87}$/.test(serverKey))return null;
 return {kind:'persistent',room,key,serverKey};
}
export function sessionInvitationHash(i:SessionInvitation){return isPersistent(i)?new URLSearchParams({persistent:'1',room:i.room,key:i.key,server:i.serverKey}).toString():invitationHash(i);}
export const proofBytes=(room:string,nonce:string,serverPeer:string,clientPeer:string)=>new TextEncoder().encode(JSON.stringify([ROOM_VERSION,room,nonce,serverPeer,clientPeer]));
export async function verifyServer(invite:PersistentInvitation,nonce:string,serverPeer:string,clientPeer:string,signature:unknown){
 try{
  if(typeof signature!=='string'||signature.length>100)return false;
  const key=await crypto.subtle.importKey('raw',decodeBytes(invite.serverKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decodeBytes(signature),proofBytes(invite.room,nonce,serverPeer,clientPeer));
 }catch{return false;}
}
export function validClock(c:unknown):c is ClockSample{return record(c)&&Number.isSafeInteger(c.epochMs)&&Number(c.epochMs)>0&&Number.isSafeInteger(c.serverMs)&&Number(c.serverMs)>0&&c.cycleSeconds===1200;}
export function validSnapshot(s:unknown):s is RoomSnapshot{
 if(!record(s)||s.v!==ROOM_VERSION||!Number.isSafeInteger(s.tick)||Number(s.tick)<0||!validRoster(s.players,ROOM_CAPACITY)||!validClock(s.clock)||!record(s.peers))return false;
 const entries=Object.entries(s.peers);
 return entries.length===s.players.length&&entries.every(([id,peer])=>validId(peer)&&(s.players as Player[]).some(p=>p.id===id))&&new Set(entries.map(([,peer])=>peer)).size===entries.length;
}
export function clockElapsedSeconds(c:WorldClock,now=performance.now()){
 return (c.serverMs+Math.max(0,now-c.receivedAt)-c.epochMs)/1000;
}
export function clockHour(c:WorldClock,now=performance.now()){
 return ((12+24*clockElapsedSeconds(c,now)/c.cycleSeconds)%24+24)%24;
}
