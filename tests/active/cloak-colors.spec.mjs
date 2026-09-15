import {test,expect} from '@playwright/test';
import {CLOAK_COLORS,roomCloakColors} from '../../src/domain/cloak-colors.ts';

test.use({screenshot:'off'});
test('showcase assigns cloak dyes only while sharing the room',async({page})=>{
 test.setTimeout(90000);
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});
 // Supply room rosters locally: this checks real scene/material integration
 // and the one -> six -> one lifecycle without depending on public relays.
 await page.route('**/src/network/room.ts',route=>route.fulfill({contentType:'text/javascript',body:`
  export class WalkRoom {
   static create(name,options){return new WalkRoom(name,options);}
   constructor(name,options){
    this.id='HostPlayer01';this.host=true;this.phase='waiting';this.detail='';
    this.invite={room:'CloakRoom12345679',host:this.id,key:'CloakTestKey1234567890123456'};
    this.players=new Map([[this.id,{...options.initial,id:this.id,name,slot:0}]]);
    window.cloakRoom=this;
   }
   move(){} async leave(){this.players.clear();this.phase='ended';}
  }
 `}));
 await page.goto('/?debug=1&cloakPreview=1');
 await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();
 const local=()=>page.evaluate(()=>m0.state().ranger.cloakColor);
 expect(await local()).toBe(CLOAK_COLORS[0]);
 await expect(page.locator('.cloak-preview')).toHaveCount(0);
 expect(await page.evaluate(()=>typeof window.cloakPreview)).toBe('undefined');
 await page.locator('#invite-friends').click();
 expect(await local()).toBe(CLOAK_COLORS[0]);
 const dyes=roomCloakColors('CloakRoom12345679');
 expect(dyes[0]).not.toBe(CLOAK_COLORS[0]);
 await page.evaluate(()=>{
  const room=window.cloakRoom,host=room.players.get(room.id);
  for(let slot=1;slot<6;slot++)room.players.set('GuestPlayer0'+slot,{...host,id:'GuestPlayer0'+slot,name:'Гость '+slot,slot});
  room.phase='connected';
 });
 await page.waitForFunction(()=>m0.state().multiplayer.remotes.length===5&&m0.state().multiplayer.remotes.every(r=>r.ready));
 await expect.poll(local).toBe(dyes[0]);
 const state=await page.evaluate(()=>m0.state());
 expect([state.ranger.cloakColor,...state.multiplayer.remotes.map(r=>r.animation.cloakColor)]).toEqual(dyes);
 const shared=await page.evaluate(()=>{
  const meshes=m0.inspect().scene.meshes.filter(m=>m.skeleton&&m.getTotalVertices()>20000);
  return {rigs:meshes.length,materials:new Set(meshes.map(m=>m.material)).size,
   tones:new Set(meshes.map(m=>JSON.stringify(m.metadata.rangerCloakTone))).size};
 });
 expect(shared).toEqual({rigs:6,materials:1,tones:6});
 await page.evaluate(()=>{const room=window.cloakRoom;for(const id of room.players.keys())if(id!==room.id)room.players.delete(id);});
 await expect.poll(local).toBe(CLOAK_COLORS[0]);
 await page.waitForFunction(()=>m0.state().multiplayer.remotes.length===0);
 await page.locator('#friends-details').evaluate(el=>el.open=true);
 await page.locator('#friends-leave').click();
 expect(await local()).toBe(CLOAK_COLORS[0]);
 expect((await page.evaluate(()=>m0.state())).errors).toEqual([]);
 expect(errors).toEqual([]);
});
