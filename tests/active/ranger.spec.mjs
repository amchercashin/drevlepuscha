import {test,expect} from '@playwright/test';

test.use({screenshot:'off'});
test('Meshy ranger loads, walks, runs at full speed and freezes on pause',async({page})=>{
 test.setTimeout(60_000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(/GPUValidationError|WebGPU uncaptured error/.test(message.text()))errors.push(message.text());});
 await page.goto('/?ranger=meshy&debug=1');
 await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();
 const initial=await page.evaluate(()=>m0.state());
 expect(initial.ranger.model).toBe('meshy');
 expect(initial.ranger.clips).toEqual({Idle:'restpose',Walk:'Walking',Run:'Running'});
 expect(initial.render.backend).toBe('webgpu');
 const rig=await page.evaluate(()=>{
  const {scene,world}=m0.inspect();
  const mesh=world.player.getChildMeshes().find(m=>m.skeleton);
  const positions=mesh.getPositionData(true,true);let minY=Infinity,maxY=-Infinity;
  for(let i=1;i<positions.length;i+=3){minY=Math.min(minY,positions[i]);maxY=Math.max(maxY,positions[i]);}
  return {bones:mesh.skeleton.bones.length,vertices:mesh.getTotalVertices(),
   minY,maxY,
   scale:scene.getTransformNodeByName('ranger-facing').scaling.y,
   activeClips:scene.animationGroups.filter(g=>g.isStarted).map(g=>g.name)};
 });
 expect(rig.bones).toBe(28);expect(rig.vertices).toBe(26083);
 expect(rig.scale*1.700000286102295).toBeCloseTo(1.78,4);
 expect(Math.abs(rig.minY*rig.scale)).toBeLessThan(.12);
 expect(rig.maxY*rig.scale).toBeGreaterThan(1.65);expect(rig.maxY*rig.scale).toBeLessThan(1.9);
 expect(rig.activeClips.sort()).toEqual(['Running','Walking','restpose']);
 // Both hands must hang beside the body, rather than remain in the A-pose.
 const armOffsets=()=>page.evaluate(()=>{
  const {scene}=m0.inspect();
  return ['Left','Right'].map(side=>{
   const shoulder=scene.getTransformNodeByName(side+'Arm').getAbsolutePosition();
   const hand=scene.getTransformNodeByName(side+'Hand').getAbsolutePosition();
   return {drop:shoulder.y-hand.y,spread:Math.hypot(hand.x-shoulder.x,hand.z-shoulder.z)};
  });
 });
 const standingArms=await armOffsets();
 for(const arm of standingArms){expect(arm.drop).toBeGreaterThan(.4);expect(arm.spread).toBeLessThan(.25);}
 await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>m0.state().ranger.weights.Walk>.95);
 const walking=await page.evaluate(()=>m0.state());
 expect(walking.ranger.speed).toBeCloseTo(1.85,1);
 expect(walking.player.n).toBeGreaterThan(initial.player.n);
 const pose=await page.evaluate(()=>m0.inspect().scene.getTransformNodeByName('LeftLeg').rotationQuaternion.asArray());
 await page.waitForTimeout(120);
 expect(await page.evaluate(()=>m0.inspect().scene.getTransformNodeByName('LeftLeg').rotationQuaternion.asArray())).not.toEqual(pose);
 await page.keyboard.down('ShiftLeft');
 await page.waitForFunction(()=>m0.state().ranger.weights.Run>.95&&m0.state().ranger.speed>14.96);
 const running=await page.evaluate(()=>m0.state());
 expect(running.ranger.speed).toBeCloseTo(15,1);
 expect(running.ranger.playbackRate).toBeCloseTo(15/4.5,1);
 await page.keyboard.press('Escape');await page.waitForTimeout(100);
 const paused=await page.evaluate(()=>m0.state());
 await page.waitForTimeout(200);
 const held=await page.evaluate(()=>m0.state());
 expect(paused.paused).toBe(true);
 expect(held.ranger.frame).toBeCloseTo(paused.ranger.frame,4);
 expect(held.player).toEqual(paused.player);
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>m0.state().ranger.weights.Idle>.995);
 for(const arm of await armOffsets()){expect(arm.drop).toBeGreaterThan(.4);expect(arm.spread).toBeLessThan(.25);}
 const stopped=await page.evaluate(()=>m0.state());
 expect(stopped.ranger.gait).toBe('Idle');
 expect(stopped.errors).toEqual([]);expect(errors).toEqual([]);
});
