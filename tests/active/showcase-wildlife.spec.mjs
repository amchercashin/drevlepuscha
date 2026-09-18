import {test,expect} from '@playwright/test';
import {sceneData} from '../../tools/wildlife/scene-data.mjs';
test.use({screenshot:'off'});
test('W2 solo bird, actual tree/prop catalog parity, quality and disposal',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);
 const scene=sceneData(),actual=await page.evaluate(()=>({catalog:[...m0.inspect().forest.treeCatalog().all()],obstacles:m0.inspect().world.boxes.map(b=>({id:b.id,min:{x:b.min.x,y:b.min.y,z:b.min.z},max:{x:b.max.x,y:b.max.y,z:b.max.z}}))}));
 expect(actual.catalog).toEqual([...scene.catalog.all()]);expect(actual.obstacles.map(b=>b.id)).toEqual(scene.boxes.map(b=>b.id));
 for(let i=0;i<scene.propBoxes.length;i++)for(const key of ['min','max'])for(const axis of ['x','y','z'])expect(actual.obstacles[i][key][axis]).toBeCloseTo(scene.propBoxes[i][key][axis],5);
 await page.locator('#resume').click();await page.waitForFunction(()=>m0.wildlife.state().frame.entities.length===1);
 const initial=await page.evaluate(()=>m0.wildlife.state());expect(initial.testOnly).toBe(true);expect(initial.role).toBe('authority');
 await page.evaluate(()=>m0.wildlife.setProbe(true));expect(await page.evaluate(()=>m0.wildlife.state().debugRoutes)).toBe(2);
 const site=await page.evaluate(()=>m0.wildlife.inspectRoutes()[0].sites[0]);
 // Use the existing checked teleport; choose an unobstructed approach, never alter the camera.
 await page.evaluate(home=>{for(const radius of [2,3,4])for(let i=0;i<24;i++){try{m0.teleport(home.e+Math.cos(i*Math.PI/12)*radius,home.n+Math.sin(i*Math.PI/12)*radius);return;}catch{}}throw Error('No walkable approach');},site.home);
 try{await page.waitForFunction(()=>['takeoff','flying'].includes(m0.wildlife.state().frame.entities[0]?.state),null,{timeout:10000});}catch(error){console.log('BIRD_REACTION',await page.evaluate(()=>({player:m0.state().player,wildlife:m0.wildlife.state()})));throw error;}
 const flight=await page.evaluate(()=>m0.wildlife.state());expect(flight.frame.entities[0].id).toBe(initial.frame.entities[0].id);expect(flight.frame.eventWatermark).toBe(1);
 await page.locator('#resolution-quality').selectOption('performance',{force:true});
 await page.waitForFunction(()=>m0.wildlife.state().visibleMeshes===1);
 expect(await page.evaluate(()=>m0.wildlife.state().frame.entities[0].route)).toEqual(flight.frame.entities[0].route);
 await page.evaluate(()=>m0.setPaused(true));const pause=await page.evaluate(()=>m0.wildlife.state().frame.simMs);await page.waitForTimeout(350);expect(await page.evaluate(()=>m0.wildlife.state().frame.simMs)).toBe(pause);
 await page.evaluate(()=>{m0.wildlife.dispose();m0.wildlife.dispose();});expect(await page.evaluate(()=>m0.inspect().scene.meshes.filter(m=>m.name.startsWith('TEST-')).length)).toBe(0);
 expect(errors).toEqual([]);
});
