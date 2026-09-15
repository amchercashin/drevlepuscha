import {test,expect} from '@playwright/test';

test.use({screenshot:'off'});
test('persistent search has a deadline, recovers late and ignores a welcome after leave',async({page})=>{
 await page.route('**/connection-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Connection test</title>'}));
 // Exercise the real session and signed handshake with a deterministic transport.
 await page.route('**/src/network/signaling.ts',r=>r.fulfill({contentType:'application/javascript',body:`
  export const selfId='client-peer-0001';
  export const getSignalingDiagnostics=()=>[{connected:true}];
  export const getRelaySockets=()=>({});
  export function joinRoom(config,id,options){
   const room={makeAction:()=>({send:async()=>{}}),getPeers:()=>({}),leave:async()=>{}};
   window.transport={room,options};return room;
  }
 `}));
 await page.clock.install();
 await page.goto('/connection-test');
 await page.evaluate(async()=>{
  const {PersistentRoom}=await import('/src/network/persistent-room.ts');
  const {encodeBytes,proofBytes}=await import('/src/network/persistent-protocol.ts');
  const {SHOWCASE_ROOM}=await import('/src/network/showcase-session.ts');
  const {ROOM_CAPACITY}=await import('/src/domain/room-config.ts');
  if(SHOWCASE_ROOM.capacity!==ROOM_CAPACITY)throw Error('showcase capacity mismatch');
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const invite={kind:'persistent',room:crypto.randomUUID(),key:crypto.randomUUID(),serverKey:encodeBytes(await crypto.subtle.exportKey('raw',keys.publicKey))};
  window.spawnCount=0;
  window.session=new PersistentRoom(invite,'Гость',{onSpawn:()=>window.spawnCount++});
  window.welcome=async(gate)=>{
   let hello;
   await window.transport.options.onPeerHandshake('server-peer-0001',async value=>{hello=value;},async()=>{
    const signature=encodeBytes(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,proofBytes(invite.room,hello.nonce,'server-peer-0001','client-peer-0001')));
    if(gate)await new Promise(resolve=>window.releaseWelcome=resolve);
    return {data:{v:1,ok:true,id:'player01',signature,snapshot:{v:1,tick:1,players:[{id:'player01',name:'Гость',slot:0,x:.5,y:.4,seq:0}],peers:{player01:'client-peer-0001'},clock:{epochMs:1000,serverMs:2000,cycleSeconds:1200}}}};
   });
  };
 });
 await page.clock.fastForward(16000);
 expect(await page.evaluate(()=>session.phase)).toBe('joining');
 await page.clock.fastForward(25000);
 expect(await page.evaluate(()=>session.phase)).toBe('error');
 expect(await page.evaluate(()=>session.detail)).toContain('серверу комнаты');
 await page.evaluate(()=>transport.options.onJoinError());
 expect(await page.evaluate(()=>session.detail)).toContain('серверу комнаты');
 await page.evaluate(()=>welcome());
 expect(await page.evaluate(()=>[session.phase,spawnCount])).toEqual(['connected',1]);
 await page.evaluate(()=>transport.room.onPeerLeave('server-peer-0001'));
 await page.clock.fastForward(16000);
 expect(await page.evaluate(()=>session.phase)).toBe('reconnecting');
 await page.clock.fastForward(25000);
 expect(await page.evaluate(()=>session.phase)).toBe('error');
 await page.evaluate(()=>{window.pendingWelcome=welcome(true).then(()=>null,e=>e.message);});
 await page.waitForFunction(()=>!!window.releaseWelcome);
 await page.evaluate(async()=>{await session.leave();releaseWelcome();});
 expect(await page.evaluate(()=>pendingWelcome)).toBe('closed');
 await page.clock.fastForward(41000);
 expect(await page.evaluate(()=>[session.phase,session.players.size,spawnCount])).toEqual(['ended',0,1]);
});
