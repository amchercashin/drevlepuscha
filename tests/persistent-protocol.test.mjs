import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openRoomStorage} from '../server/storage.mjs';
import {parseSessionInvitation,sessionInvitationHash,verifyServer,proofBytes,encodeBytes,clockHour,validSnapshot} from '../src/network/persistent-protocol.ts';

test('stable identity, exclusive process, recovery and signed connection binding',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'drevle-room-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const a=await openRoomStorage(dir);t.after(a.close);
 const invite={kind:'persistent',room:a.state.room,key:a.state.key,serverKey:a.state.serverKey};
 assert.deepEqual(parseSessionInvitation(sessionInvitationHash(invite)),invite);
 await assert.rejects(()=>openRoomStorage(dir),/уже запущена/);
 const nonce=crypto.randomUUID(),server='server-peer-123',client='client-peer-123';
 const signature=encodeBytes(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},a.signingKey,proofBytes(invite.room,nonce,server,client)));
 assert.equal(await verifyServer(invite,nonce,server,client,signature),true);
 assert.equal(await verifyServer(invite,crypto.randomUUID(),server,client,signature),false);
 assert.equal(await verifyServer(invite,nonce,'different-server',client,signature),false);
 assert.equal(await verifyServer(invite,nonce,server,'different-client',signature),false);
 a.close();const b=await openRoomStorage(dir);t.after(b.close);
 assert.deepEqual(b.state,a.state);b.close();
 writeFileSync(join(dir,'room.json'),'{broken');
 await assert.rejects(()=>openRoomStorage(dir),/room.json/);
 assert.equal(readFileSync(join(dir,'room.json'),'utf8'),'{broken');
});
test('clock is independent of frame delta and continues over a restart',()=>{
 const clock={epochMs:1_000_000,serverMs:1_000_000,cycleSeconds:1200,receivedAt:0};
 assert.equal(clockHour(clock,0),12);
 assert.equal(clockHour(clock,300_000),18);
 assert.equal(clockHour({...clock,serverMs:1_900_000,receivedAt:0},0),6);
});
test('invalid invitation never falls back to browser-host semantics',()=>{
 assert.equal(parseSessionInvitation('#persistent=2&room=abcdefghijklmnop&host=abcdefgh&key=abcdefghijklmnopqrstuvwxyz'),null);
 assert.equal(parseSessionInvitation('#persistent=1&server=broken'),null);
});
test('snapshots bind exactly one current transport identity to each participant',()=>{
 const s={v:1,tick:1,players:[{id:'player01',name:'Гость',slot:0,x:.5,y:.4,seq:0}],peers:{player01:'peer-0001'},clock:{epochMs:1000,serverMs:2000,cycleSeconds:1200}};
 assert.equal(validSnapshot(s),true);
 assert.equal(validSnapshot({...s,peers:{player02:'peer-0001'}}),false);
 assert.equal(validSnapshot({...s,peers:{}}),false);
 assert.equal(validSnapshot({...s,clock:{...s.clock,serverMs:NaN}}),false);
});
