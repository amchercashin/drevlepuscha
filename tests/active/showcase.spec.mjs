import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';

test('showcase starts and the traveller can move',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error|Error while parsing|shader.*error/i.test(m.text()))errors.push(m.text());});
 const network=await page.context().newCDPSession(page);
 await network.send('Network.enable');await network.send('Network.setCacheDisabled',{cacheDisabled:true});
 // Vite serves modules separately; retain texture entries after the module graph grows.
 await page.addInitScript(()=>performance.setResourceTimingBufferSize(2000));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 const textures=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.endsWith('.webp')).map(x=>x.name));
 expect(textures.length).toBeGreaterThan(0);expect(new Set(textures).size).toBe(textures.length);
 await page.locator('#resume').click();
 const before=await page.evaluate(()=>m0.state());
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>m0.state());
 expect(after.render.backend).toBe('webgpu');
 expect(Math.hypot(after.player.e-before.player.e,after.player.n-before.player.n)).toBeGreaterThan(0.1);
 expect(after.errors).toEqual([]);expect(errors).toEqual([]);
 // Changing material controls or leaving the window clears input without pausing.
 await page.locator('#diagnostics > summary').click();
 await page.getByRole('button',{name:'Нормали',exact:true}).click();
 expect(await page.evaluate(()=>m0.state().paused)).toBe(false);
 await page.keyboard.down('KeyW');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const stopped=await page.evaluate(()=>m0.state().player);
 await page.waitForTimeout(150);await page.keyboard.up('KeyW');
 const focused=await page.evaluate(()=>m0.state());
 expect(focused.paused).toBe(false);expect(focused.player).toEqual(stopped);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().paused)).toBe(true);
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>m0.state().floor.pending===0&&m0.state().floor.field.farPending===0&&m0.state().floor.field.midPending===0);
 expect((await page.evaluate(()=>m0.state())).floor.field.farTiles).toBe(80);

 // Exercise the real material at a stopped clock, including all quality branches.
 await page.waitForFunction(()=>m0.state().lighting.daylight.sky.assetState==='ready');
 const resourceState=()=>{
  const {scene}=m0.inspect(),sky=scene.getMeshByName('showcase-sky');
  return {skies:scene.meshes.filter(m=>m.name==='showcase-sky').length,subMeshes:sky.subMeshes.length,
   shaderReady:sky.material.isReady(sky),shadows:scene.lights.filter(l=>l.getShadowGenerator?.()).length,
   targets:scene.customRenderTargets.length,position:sky.position.asArray(),camera:scene.activeCamera.position.asArray()};
 };
 const resources=await page.evaluate(resourceState);
 expect(resources).toMatchObject({skies:1,subMeshes:1,shaderReady:true,shadows:1});expect(resources.position).toEqual(resources.camera);
 await page.evaluate(()=>{m0.setTime(0);m0.setSky({motionScale:0,low:{coverage:0},high:{coverage:0}});m0.setSkyAnimationTime(240);});
 const clear=await page.evaluate(()=>m0.state().lighting.daylight);
 expect(clear.hours).toBe(0);expect(clear.automatic).toBe(false);expect(clear.sky.moonSource).toBe('artwork');
 expect(clear.sky.textures.moon).toEqual({width:512,height:512});
 await page.locator('.sky-controls > summary').click();
 await page.locator('#sky-coverage').fill('1');await page.locator('#sky-depth').fill('16');
 await page.evaluate(()=>m0.setSky({high:{coverage:1,opticalDepth:16}}));
 await page.waitForTimeout(100);
 const dense=await page.evaluate(()=>m0.state().lighting.daylight);
 expect(dense.hours).toBe(0);expect(dense.sky.settings.low).toMatchObject({coverage:1,opticalDepth:16});
 expect(dense.sky.offsets).toEqual(clear.sky.offsets);
 for(const [quality,expected] of [['performance',0],['balanced',1],['high',2]]){
  await page.locator('#resolution-quality').selectOption(quality);await page.waitForTimeout(100);
  const s=await page.evaluate(()=>m0.state().lighting.daylight.sky);
  expect(s.quality).toBe(expected);expect(s.seed).toBe(clear.sky.seed);expect(s.offsets).toEqual(clear.sky.offsets);expect(s.settings).toEqual(dense.sky.settings);
 }
 for(const hour of [23.999,0,.001,7.5,12,17.5]){
  await page.evaluate(h=>m0.setTime(h),hour);await page.waitForTimeout(60);
  const daylight=await page.evaluate(()=>m0.state().lighting.daylight);
  expect(Math.abs(daylight.hours-hour)).toBeLessThan(1e-10);
 }
 const finite=await page.evaluate(()=>{
  const check=v=>typeof v==='number'?Number.isFinite(v):v&&typeof v==='object'?Object.values(v).every(check):true;
  const {scene}=m0.inspect(),material=scene.getMeshByName('showcase-sky').material;
  return check(m0.state().lighting.daylight.sky)&&check(material._floats)&&check(material._vectors2)&&check(material._vectors3)&&check(material._vectors4);
 });expect(finite).toBe(true);
 await page.evaluate(()=>{m0.setSky({motionScale:1});m0.setTime(0);});
 const t=await page.evaluate(()=>m0.state().lighting.daylight.sky.animationSeconds);
 await page.waitForTimeout(120);expect(await page.evaluate(()=>m0.state().lighting.daylight.sky.animationSeconds)).toBeGreaterThan(t);
 await page.evaluate(()=>m0.setPaused(true));const paused=await page.evaluate(()=>m0.state().lighting.daylight.sky.animationSeconds);
 await page.waitForTimeout(100);expect(await page.evaluate(()=>m0.state().lighting.daylight.sky.animationSeconds)).toBe(paused);
 await page.evaluate(()=>{m0.setPaused(false);m0.resetSky();});
 // Count actual sky draws over rendered frames, instead of trusting declared stats.
 const draws=await page.evaluate(()=>new Promise(resolve=>{
  const {scene}=m0.inspect(),sky=scene.getMeshByName('showcase-sky');let count=0;const samples=[];
  const draw=sky.onBeforeDrawObservable.add(()=>count++);
  const end=scene.onAfterRenderObservable.add(()=>{samples.push(count);count=0;if(samples.length===4){sky.onBeforeDrawObservable.remove(draw);scene.onAfterRenderObservable.remove(end);resolve(samples);}});
 }));expect(draws).toEqual([1,1,1,1]);
 const finalResources=await page.evaluate(resourceState);expect(finalResources.targets).toBe(resources.targets);expect(finalResources.shadows).toBe(1);

 // Read actual rendered pixels at the moon: dense clouds must hide both disc and halo.
 const occlusion=await page.evaluate(async()=>{
  const {scene,engine}=m0.inspect(),sky=scene.getMeshByName('showcase-sky'),camera=scene.activeCamera;
  const observer=scene.onBeforeRenderObservable.add(()=>camera.setTarget(camera.position.add(sky.material._vectors3.lunar.scale(100))));
  async function sample(coverage,brightness){
   m0.setSky({motionScale:0,low:{coverage,opticalDepth:16},high:{coverage,opticalDepth:16},moon:{brightness,halo:brightness/2},stars:{brightness}});
   await new Promise(resolve=>scene.onAfterRenderObservable.addOnce(()=>scene.onAfterRenderObservable.addOnce(resolve)));
   return Array.from(await engine.readPixels(Math.floor(engine.getRenderWidth()/2)-8,Math.floor(engine.getRenderHeight()/2)-8,16,16));
  }
  try{
   m0.setTime(0);m0.setSkyAnimationTime(240);
   const clearDark=await sample(0,0),clearLight=await sample(0,2),denseDark=await sample(1,0),denseLight=await sample(1,2);
   const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
   return {clear:difference(clearDark,clearLight),dense:difference(denseDark,denseLight)};
  }finally{scene.onBeforeRenderObservable.remove(observer);m0.resetSky();}
 });
 expect(occlusion.clear).toBeGreaterThan(20);expect(occlusion.dense).toBeLessThan(1);

 // B: the terminator actually changes rendered sides, and new moon cannot eclipse the sun.
 const lunarPixels=await page.evaluate(async()=>{
  const {scene,engine}=m0.inspect(),sky=scene.getMeshByName('showcase-sky'),camera=scene.activeCamera;
  const observer=scene.onBeforeRenderObservable.add(()=>camera.setTarget(camera.position.add(sky.material._vectors3.lunar.scale(100))));
  async function sample(phase,hour,brightness=1){
   m0.setMoon({mode:'fixed',fixedPhase:phase});m0.setTime(hour);
   m0.setSky({motionScale:0,low:{coverage:0},high:{coverage:0},moon:{brightness,halo:0},stars:{brightness:0}});
   await new Promise(resolve=>scene.onAfterRenderObservable.addOnce(()=>scene.onAfterRenderObservable.addOnce(resolve)));
   const pixels=Array.from(await engine.readPixels(Math.floor(engine.getRenderWidth()/2)-10,Math.floor(engine.getRenderHeight()/2)-10,20,20));
   let left=0,right=0;for(let i=0;i<pixels.length;i+=4){const lum=(pixels[i]+pixels[i+1]+pixels[i+2])/3;if((i/4)%20<10)left+=lum;else right+=lum;}
   return {pixels,left:left/200,right:right/200};
  }
  try{const first=await sample(.25,18),last=await sample(.75,6),newDark=await sample(0,12,0),newBright=await sample(0,12,2);
   return {first:first.left-first.right,last:last.left-last.right,eclipseDifference:newDark.pixels.reduce((s,v,i)=>s+Math.abs(v-newBright.pixels[i]),0)/newDark.pixels.length};
  }finally{scene.onBeforeRenderObservable.remove(observer);m0.setMoon({mode:'cycle'});m0.resetSky();}
 });
 expect(Math.abs(lunarPixels.first)).toBeGreaterThan(20);expect(lunarPixels.first*lunarPixels.last).toBeLessThan(0);expect(lunarPixels.eclipseDifference).toBeLessThan(1);

 // C: use the real settings select, complete its transitions with a stopped day clock.
 await page.evaluate(()=>{m0.setTime(12);m0.setFog(.007);m0.setWeather('clear',0);m0.setRays(true);});
 for(const preset of ['mixed','overcast','rain','downpour']){
  await page.locator('#sky-weather').selectOption(preset);
  await page.evaluate(()=>m0.setWeatherTime(m0.state().lighting.daylight.weather.seconds+13));
  await page.waitForTimeout(100);
  const state=await page.evaluate(()=>m0.state());
  expect(state.lighting.daylight.hours).toBe(12);expect(state.lighting.daylight.weather.preset).toBe(preset);
  expect(state.lighting.daylight.weather.baseFog).toBe(.007);
  expect(state.rain.enabled).toBe(preset==='rain'||preset==='downpour');
 }
 const wet=await page.evaluate(()=>m0.state());
 expect(wet.lighting.daylight.weather.mainIntensity).toBe(0);expect(wet.lighting.daylight.weather.fillIntensity).toBeGreaterThan(.1);
 expect(wet.lighting.air.raysEnabled).toBe(true);expect(wet.lighting.air.raysScale).toBe(0);
 expect(wet.rain.instances).toBe(1152);
 const rainDraws=await page.evaluate(()=>new Promise(resolve=>{
  const {scene}=m0.inspect(),mesh=scene.getMeshByName('showcase-rain');let draws=0;
  const observer=mesh.onBeforeDrawObservable.add(()=>draws++);
  scene.onAfterRenderObservable.addOnce(()=>{mesh.onBeforeDrawObservable.remove(observer);resolve({draws,ready:mesh.material.isReady(mesh,true),depthWrite:!mesh.material.disableDepthWrite});});
 }));expect(rainDraws).toEqual({draws:1,ready:true,depthWrite:false});
 const rainPixels=await page.evaluate(async()=>{
  const {scene,engine}=m0.inspect(),mesh=scene.getMeshByName('showcase-rain');m0.setPaused(true);
  async function sample(visible){mesh.isVisible=visible;await new Promise(resolve=>scene.onAfterRenderObservable.addOnce(()=>scene.onAfterRenderObservable.addOnce(resolve)));return await engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight());}
  try{const without=await sample(false),withRain=await sample(true);let changed=0;for(let i=0;i<without.length;i+=4)if(Math.abs(without[i]-withRain[i])+Math.abs(without[i+1]-withRain[i+1])+Math.abs(without[i+2]-withRain[i+2])>6)changed++;return changed;}
  finally{mesh.isVisible=true;m0.setPaused(false);}
 });expect(rainPixels).toBeGreaterThan(50);
 const drops=await page.evaluate(()=>Array.from(m0.inspect().scene.getMeshByName('showcase-rain').getVertexBuffer('rainColumn').getData()).slice(0,64*4));
 await page.locator('#resolution-quality').selectOption('performance');await page.waitForTimeout(60);
 expect((await page.evaluate(()=>m0.state())).rain.instances).toBe(576);
 expect(await page.evaluate(()=>Array.from(m0.inspect().scene.getMeshByName('showcase-rain').getVertexBuffer('rainColumn').getData()).slice(0,64*4))).toEqual(drops);
 await page.locator('#resolution-quality').selectOption('high');
 await page.locator('#sky-weather').selectOption('clear');
 await page.evaluate(()=>m0.setWeatherTime(m0.state().lighting.daylight.weather.seconds+13));await page.waitForTimeout(60);
 const dry=await page.evaluate(()=>m0.state());expect(dry.rain.enabled).toBe(false);expect(dry.lighting.daylight.fogDensity).toBe(.007);
 expect(dry.lighting.air.raysEnabled).toBe(true);expect(dry.lighting.air.raysScale).toBe(1);
 await page.locator('#sky-weather').selectOption('auto');
 await page.evaluate(()=>m0.setWeatherTime(1000));
 expect((await page.evaluate(()=>m0.state())).lighting.daylight.weather.mode).toBe('auto');

 // Existing WorldClock, no new wire messages: restores the full local day/phase/weather.
 const clockRestore=await page.evaluate(()=>{
  const {daylight}=m0.inspect();m0.setGameDay(13);m0.setTime(7.25);m0.setMoon({mode:'fixed',fixedPhase:.25});m0.setWeather('mixed',0);
  const before=daylight.stats();
  daylight.setClock({epochMs:1000000,serverMs:1000000+1200000*42,receivedAt:performance.now(),cycleSeconds:1200});daylight.update(0);
  const shared=daylight.stats();daylight.setTime(3);daylight.setMoon({mode:'full'});daylight.setWeather('downpour',0);
  const ignored=daylight.stats();daylight.setClock(null);const after=daylight.stats();
  return {before,shared,ignored,after};
 });
 expect(clockRestore.shared.totalGameHours).toBeGreaterThanOrEqual(42*24+12);expect(clockRestore.shared.weather.scope).toBe('shared-clock');
 expect(clockRestore.ignored.totalGameHours).toBe(clockRestore.shared.totalGameHours);expect(clockRestore.ignored.moon.mode).toBe('cycle');
 expect(clockRestore.after.totalGameHours).toBe(clockRestore.before.totalGameHours);expect(clockRestore.after.moon).toEqual(clockRestore.before.moon);
 expect(clockRestore.after.weather.state).toEqual(clockRestore.before.weather.state);expect(clockRestore.after.automatic).toBe(false);
 const resourcesAfterWeather=await page.evaluate(resourceState);expect(resourcesAfterWeather.shadows).toBe(1);expect(resourcesAfterWeather.targets).toBe(resources.targets);

 // Optional single A/B comparison against a locally recorded pre-change baseline.
 if(process.env.SKY_BASELINE){
  await page.evaluate(()=>{m0.reset();m0.setPaused(false);m0.setTime(0);m0.setCamera(0,-15,6);document.querySelector('#diagnostics').open=false;});
  await page.waitForFunction(()=>{const s=m0.state();return s.floor.pending===0&&s.floor.field.farPending===0&&s.floor.field.midPending===0&&s.forest.transitions===0;});
  await page.waitForTimeout(2500);await page.evaluate(()=>m0.beginMeasurement());await page.waitForTimeout(6000);
  const measured=await page.evaluate(()=>({frames:m0.endMeasurement(),costs:m0.frameCosts(),render:m0.state().render,camera:m0.state().camera,player:m0.state().player}));
  const baseline=JSON.parse(await readFile(process.env.SKY_BASELINE,'utf8'));
  expect(measured.render.width).toBe(baseline.render.width);expect(measured.camera).toEqual(baseline.camera);expect(measured.player).toEqual(baseline.player);
  const median=a=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
  const summarize=r=>({frames:r.frames.length,frameP50:median(r.frames),cpuP50:median(r.costs.map(c=>c.cpuMs)),gpuP50:median(r.costs.map(c=>c.gpuMs))||null});
  console.log('Sky A/B (actual device, GPU null means unavailable)',{before:summarize(baseline),after:summarize(measured)});
  await writeFile('tmp/sky-after.json',JSON.stringify(measured,null,2));
 }
 expect((await page.evaluate(()=>m0.state())).errors).toEqual([]);expect(errors).toEqual([]);
});
