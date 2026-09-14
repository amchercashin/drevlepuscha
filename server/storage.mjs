import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {encodeBytes} from '../src/network/persistent-protocol.ts';

/** Only room identity and time are durable. Player sessions never go to disk. */
export async function openRoomStorage(directory){
 const dir=resolve(directory);mkdirSync(dir,{recursive:true,mode:0o700});
 const lock=join(dir,'room.lock'),token=randomUUID();
 const acquire=()=>writeFileSync(lock,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});
 try{acquire();}catch(error){
  if(error.code!=='EEXIST')throw error;
  let stale=false;
  try{const {pid}=JSON.parse(readFileSync(lock,'utf8'));if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(e){stale=e.code==='ESRCH';}}}catch{}
  if(!stale)throw Error('Комната уже запущена или файл room.lock требует проверки.');
  unlinkSync(lock);acquire();
 }
 let closed=false;
 const close=()=>{if(closed)return;closed=true;try{if(JSON.parse(readFileSync(lock,'utf8')).token===token)unlinkSync(lock);}catch{}};
 try{
  const file=join(dir,'room.json');let state;
  try{state=JSON.parse(readFileSync(file,'utf8'));}catch(e){
   if(e.code!=='ENOENT')throw Error('Не удалось прочитать room.json. Сохраните файл и восстановите корректную копию.');
   const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
   state={version:1,room:randomBytes(18).toString('base64url'),key:randomBytes(32).toString('base64url'),epochMs:Date.now(),serverKey:encodeBytes(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};
   const temp=join(dir,`room-${token}.tmp`);writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temp,file);
  }
  if(state.version!==1||!/^[\w-]{24}$/.test(state.room)||!/^[\w-]{43}$/.test(state.key)||!/^[\w-]{87}$/.test(state.serverKey)||!Number.isSafeInteger(state.epochMs)||state.epochMs<=0)throw Error('Некорректное состояние room.json; автоматический сброс отключён.');
  const signingKey=await crypto.subtle.importKey('jwk',state.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const {d,...publicJwk}=state.privateKey;
  if(!d)throw Error('Нет закрытого ключа сервера.');
  const publicKey=await crypto.subtle.importKey('jwk',{...publicJwk,key_ops:['verify']},{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
  if(encodeBytes(await crypto.subtle.exportKey('raw',publicKey))!==state.serverKey)throw Error('Ключи комнаты не совпадают.');
  return {state,signingKey,close};
 }catch(error){close();throw error;}
}
