import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});

test('rain and downpour follow weather, share the forest mixer and draw stronger heavy rain',async({page})=>{
 test.setTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error|Error while parsing|shader.*error/i.test(m.text()))errors.push(m.text());});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();await page.waitForFunction(()=>m0.state().ambient.loops===9);
 await page.evaluate(()=>{m0.setTime(12);m0.setWeather('clear',0);});
 await page.waitForFunction(()=>m0.state().ambient.weather.precipitation===0);
 expect(await page.evaluate(()=>[m0.state().ambient.gains.R01,m0.state().ambient.gains.R02])).toEqual([0,0]);
 const buffers=await page.evaluate(()=>['R01','R02'].map(id=>{
  const loop=m0.inspect().ambient.loops.get(id),b=loop.source.buffer;
  return {id,loop:loop.source.loop,channels:b.numberOfChannels,duration:b.duration};
 }));
 expect(buffers.every(b=>b.loop&&b.channels===2&&b.duration>=8)).toBe(true);
 await page.locator('#diagnostics > summary').click();await page.locator('#sky-weather').selectOption('rain');
 await page.evaluate(()=>m0.setWeatherTime(m0.state().lighting.daylight.weather.seconds+13));
 await page.waitForFunction(()=>m0.state().ambient.weather.precipitation===.4);
 // Read the actual weather audio, downstream of each loop's gain, not just target numbers.
 const audioPower=()=>page.evaluate(async()=>{
  const a=m0.inspect().ambient,ctx=a.context,node=ctx.createAnalyser(),silent=ctx.createGain();
  node.fftSize=4096;silent.gain.value=0;node.connect(silent);silent.connect(ctx.destination);
  for(const id of ['R01','R02'])a.loops.get(id).gain.connect(node);
  const data=new Float32Array(node.fftSize);let power=0;
  try{
   await new Promise(r=>setTimeout(r,1200));
   for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,50));node.getFloatTimeDomainData(data);power+=data.reduce((sum,v)=>sum+v*v,0)/data.length;}
   return power/6;
  }finally{for(const id of ['R01','R02'])a.loops.get(id).gain.disconnect(node);node.disconnect();silent.disconnect();}
 });
 const rainPower=await audioPower();expect(rainPower).toBeGreaterThan(1e-6);
 // Freeze simulation, subtract the identical frame without rain; retain the chosen camera.
 const rainPixels=()=>page.evaluate(async()=>{
  const {scene,engine}=m0.inspect(),mesh=scene.getMeshByName('showcase-rain');m0.setPaused(true);
  let seconds=0;
  const observer=scene.onBeforeRenderObservable.add(()=>mesh.material.setFloat('rainTime',seconds));
  const sample=async visible=>{mesh.isVisible=visible;await new Promise(resolve=>scene.onAfterRenderObservable.addOnce(()=>scene.onAfterRenderObservable.addOnce(resolve)));return engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight());};
  try{
   const without=await sample(false);let changed=0;
   for(seconds=0;seconds<3;seconds++){
    const withRain=await sample(true);
    for(let i=0;i<without.length;i+=4)if(Math.abs(without[i]-withRain[i])+Math.abs(without[i+1]-withRain[i+1])+Math.abs(without[i+2]-withRain[i+2])>3)changed++;
   }
   return changed;
  }finally{scene.onBeforeRenderObservable.remove(observer);mesh.isVisible=true;m0.setPaused(false);}
 });
 const rainCoverage=await rainPixels();expect(rainCoverage).toBeGreaterThan(0);
 await page.evaluate(()=>{m0.setWeather('downpour',8);m0.setWeatherTime(m0.state().lighting.daylight.weather.seconds+4);});
 await page.waitForFunction(()=>m0.state().ambient.weather.precipitation>.4);
 const blend=await page.evaluate(()=>m0.state());
 expect(blend.ambient.weather.precipitation).toBeCloseTo(blend.rain.precipitation,6);
 expect(blend.ambient.gains.R01).toBeGreaterThan(0);expect(blend.ambient.gains.R02).toBeGreaterThan(0);
 await page.evaluate(()=>m0.setWeatherTime(m0.state().lighting.daylight.weather.seconds+8));
 await page.waitForFunction(()=>m0.state().ambient.weather.precipitation===1);
 const heavyPower=await audioPower();expect(heavyPower).toBeGreaterThan(rainPower*3);
 const heavyCoverage=await rainPixels();expect(heavyCoverage).toBeGreaterThan(Math.max(50,rainCoverage*2));
 expect(await page.evaluate(()=>m0.state().rain.instances)).toBe(2304);
 const rendered=await page.evaluate(()=>new Promise(resolve=>{
  const {scene}=m0.inspect(),mesh=scene.getMeshByName('showcase-rain');let draws=0;
  const observer=mesh.onBeforeDrawObservable.add(()=>draws++);
  scene.onAfterRenderObservable.addOnce(()=>{mesh.onBeforeDrawObservable.remove(observer);resolve({draws,ready:mesh.material.isReady(mesh,true)});});
 }));expect(rendered).toEqual({draws:1,ready:true});
 expect(await page.evaluate(()=>m0.inspect().ambient.wildlife.gain.value)).toBeLessThan(.15);
 await page.locator('#resolution-quality').selectOption('performance');
 await page.waitForFunction(()=>m0.state().rain.instances===1152);
 await page.locator('#forest-audio-volume').fill('0');
 await page.waitForFunction(()=>m0.inspect().ambient.master.gain.value<.001);
 expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(false);
 await page.locator('#forest-audio-volume').fill('65');
 await page.waitForFunction(()=>m0.inspect().ambient.master.gain.value>.6);
 await page.evaluate(()=>m0.setPaused(true));await page.waitForFunction(()=>m0.inspect().ambient.master.gain.value<.001);
 await page.evaluate(()=>{m0.setPaused(false);m0.setWeather('clear',0);});
 await page.waitForFunction(()=>m0.state().ambient.weather.precipitation===0);
 await page.waitForFunction(()=>m0.inspect().ambient.loops.get('R02').gain.gain.value<.0001);
 expect(await audioPower()).toBeLessThan(1e-9);
 expect(await page.evaluate(()=>m0.state().rain.enabled)).toBe(false);
 expect(await page.evaluate(()=>m0.inspect().ambient.wildlife.gain.value)).toBeGreaterThan(.99);
 expect(await page.evaluate(()=>m0.state().ambient.errors)).toEqual([]);expect(errors).toEqual([]);
});

test('rustle rises and settles with one visible gust while strong background wind stays quiet',async({page})=>{
 test.setTimeout(45000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 await page.evaluate(()=>m0.inspect().wind.configure({intensity:3.5,gustStrength:0}));
 await page.locator('#resume').click();await page.waitForFunction(()=>m0.state().ambient.loops===9);
 await page.waitForFunction(()=>m0.state().ambient.gust<.001);
 const read=()=>page.evaluate(()=>{
  const s=m0.state().ambient,a=m0.inspect().ambient;
  return {gust:s.gust,air:s.gains.W01**2+s.gains.W02**2,
   canopy:['W03','W04','W05'].reduce((sum,id)=>sum+a.loops.get(id).gain.gain.value**2,0)};
 });
 const quiet=await read();
 await page.evaluate(()=>{m0.inspect().wind.configure({gustStrength:2});m0.inspect().wind.triggerGust();});
 await page.waitForFunction(()=>m0.state().ambient.gust>.5);
 const peak=await read();expect(peak.canopy).toBeGreaterThan(quiet.canopy*20);expect(peak.air).toBeLessThan(.14**2+1e-8);
 await page.waitForFunction(()=>m0.state().ambient.gust<.015,null,{timeout:18000});
 const settled=await read();expect(settled.canopy).toBeLessThan(peak.canopy/15);
 expect(await page.evaluate(()=>m0.state().ambient.errors)).toEqual([]);expect(errors).toEqual([]);
});

test('forest audio follows scene wind and time, pauses and works for a room guest',async({page,browser})=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
 expect(await page.evaluate(()=>m0.state().ambient.context)).toBe('not-started');
 await page.locator('#resume').click();
 await page.waitForFunction(()=>m0.state().ambient.loops===9&&m0.state().ambient.context==='running');
 // Decode every shipped file using the game context, including lazy event buffers.
 const decoded=await page.evaluate(async()=>{
  const bank=(await import('/config/showcase-audio.json?import')).default;
  const audio=m0.inspect().ambient;
  return Promise.all(bank.assets.map(async a=>{const b=await audio.load(a);return {id:a.id,channels:b.numberOfChannels,duration:b.duration,expected:a.duration};}));
 });
 expect(decoded).toHaveLength(17);
 for(const item of decoded)expect(Math.abs(item.duration-item.expected)).toBeLessThan(.001);
 await page.evaluate(()=>{m0.setTime(12);m0.inspect().wind.configure({intensity:0});});
 await page.waitForFunction(()=>m0.state().ambient.strength===0);
 expect(Object.entries(await page.evaluate(()=>m0.state().ambient.gains)).filter(([id])=>id.startsWith('W')).every(([,gain])=>gain===0)).toBe(true);
 const day=await page.evaluate(()=>m0.state().ambient.gains.I01);
 await page.evaluate(()=>m0.setTime(0));await page.waitForFunction(()=>m0.state().ambient.hour===0);
 expect(await page.evaluate(()=>m0.state().ambient.gains.I01)).toBeGreaterThan(day);
 await page.evaluate(()=>{m0.inspect().wind.configure({intensity:1});m0.inspect().wind.triggerGust();});
 await page.waitForFunction(()=>m0.state().ambient.gust>.05);
 const sync=await page.evaluate(()=>{const s=m0.state(),w=m0.inspect().wind.sampleAt(s.camera.x,s.camera.y,s.camera.z);return {audio:s.ambient.strength,scene:w.strength01};});
 expect(sync.audio).toBeCloseTo(sync.scene,6);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(false);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(true);
 await page.locator('#diagnostics > summary').click();
 await page.locator('#forest-audio-volume').fill('0');
 expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(false);
 await expect(page.locator('#forest-audio-level')).toHaveText('0%');
 await page.locator('#forest-audio-volume').fill('65');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('showcase-audio-v1')).volume)).toBe(.65);
 await page.locator('#diagnostics > summary').click();
 // One actual WebRTC guest, using the very same audio controller as solo.
 await page.locator('#invite-friends').click();
 await page.waitForFunction(()=>m0.state().wind.shared);
 const invite=new URL(await page.locator('#friends-link').inputValue());invite.search='?debug=1';
 const guest=await browser.newPage({viewport:{width:1280,height:720}});guest.on('pageerror',e=>errors.push(e.message));
 try{
  await guest.goto(invite.href);await guest.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
  await guest.locator('#resume').click();
  await guest.waitForFunction(()=>m0.state().ambient.loops===9&&m0.state().multiplayer.players===2,null,{timeout:45000});
  const state=await guest.evaluate(()=>m0.state());
  expect(state.wind.shared).toBe(true);expect(state.ambient.context).toBe('running');expect(state.ambient.errors).toEqual([]);
  expect(state.ambient.strength).toBeGreaterThan(0);
 }finally{await guest.close();}
 await page.bringToFront();await page.locator('#friends-leave').click();
 await page.waitForFunction(()=>!m0.state().wind.shared);
 expect(await page.evaluate(()=>m0.state().ambient.loops)).toBe(9);
 expect(await page.evaluate(()=>m0.state().ambient.errors)).toEqual([]);expect(errors).toEqual([]);
});
