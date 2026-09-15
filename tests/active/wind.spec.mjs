import {test,expect} from '@playwright/test';

test('wind: GPU field, all vegetation paths, pause, settings and fixed-quality A/B',async({page})=>{
 test.setTimeout(90000);
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/WebGPU uncaptured|Error while parsing WGSL|Invalid ShaderModule/.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('showcase-quality-v2','balanced'));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();
 await page.evaluate(()=>{m0.setTime(12);m0.setAutomatic(false);});
 await page.waitForFunction(()=>m0.state().floor.pending===0&&m0.state().floor.field.farPending===0&&m0.state().floor.field.midPending===0);
 const geometry=await page.evaluate(()=>{
  const {scene,forest}=m0.inspect();
  const cover=scene.meshes.filter(m=>['grass','floor-leaves','cover-mid','cover-far'].includes(m.material?.name));
  return {layers:[...new Set(cover.map(m=>m.material.name))],valid:cover.every(m=>m.getVerticesData('plantWind')?.length===m.getTotalVertices()*4),
   bytes:cover.reduce((n,m)=>n+m.getTotalVertices()*16,0),
   shadow:forest.shadowCasters({x:0,y:0,z:0}).every(m=>m.material.shadowDepthWrapper&&m.metadata.windTree),
   families:scene.meshes.filter(m=>m.name.startsWith('source-')).every(m=>m.metadata.windTree),
   horizon:scene.meshes.filter(m=>m.name.startsWith('horizon-')).every(m=>m.metadata.windTree),
  };
 });
 expect(geometry.layers.sort()).toEqual(['cover-far','cover-mid','floor-leaves','grass']);expect(geometry.valid&&geometry.shadow&&geometry.families&&geometry.horizon).toBeTruthy();
 // Execute the actual shared WGSL field on this GPU and compare against the CPU audio seam.
 const parity=await page.evaluate(async()=>{
  const {windFieldWGSL}=await import('/src/runtime/wind.wgsl.ts');
  const {sampleWind}=await import('/src/domain/wind.ts');
  const {engine,wind}=m0.inspect(),device=engine._device,s=structuredClone(wind.snapshot);
  const points=[[0,0],[25,-10],[-211,302],[152,148]];
  const shader=device.createShaderModule({code:`${windFieldWGSL}
   @group(0) @binding(0) var<storage,read_write> result:array<vec2f>;
   @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id:vec3u){
    let points=array<vec2f,4>(${points.map(p=>`vec2f(${p[0]}.0,${p[1]}.0)`).join(',')});
    result[id.x]=forestWindField(points[id.x],vec3f(${s.fieldPhases.join(',')}),vec4f(${s.base},${s.gust},1.0,${s.scale}));
   }`});
  const output=device.createBuffer({size:32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size:32,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(4);pass.end();encoder.copyBufferToBuffer(output,0,read,0,32);device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);const values=[...new Float32Array(read.getMappedRange())];read.unmap();read.destroy();output.destroy();
  return points.map(([x,z],i)=>{const c=sampleWind(s,x,0,z);return Math.max(Math.abs(c.strength01-values[i*2]),Math.abs(c.gust01-values[i*2+1]));});
 });
 expect(Math.max(...parity)).toBeLessThan(.00001);
 await page.evaluate(()=>m0.setPaused(true));const frozen=await page.evaluate(()=>m0.state().wind.time);
 await page.waitForTimeout(150);expect(await page.evaluate(()=>m0.state().wind.time)).toBe(frozen);
 await page.evaluate(()=>m0.setPaused(false));
 await page.locator('#diagnostics > summary').click();
 await page.locator('#wind-preset').selectOption('enchanted');
 await page.locator('#wind-intensity').evaluate(el=>{el.value='150';el.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('showcase-wind-v1')).intensity)).toBe(1.5);
 // A real room transition uses the same renderer and locks local weather preferences.
 await page.locator('#invite-friends').click();await expect(page.locator('#wind-intensity')).toBeDisabled();
 expect(await page.evaluate(()=>m0.state().wind.preset)).toBe('forest');
 await page.locator('#friends-leave').click();await expect(page.locator('#wind-intensity')).toBeEnabled();
 expect(await page.locator('#wind-preset').inputValue()).toBe('enchanted');
 await page.locator('#wind-intensity').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>m0.state().wind.intensity===0);
 expect(await page.evaluate(()=>m0.state().wind.sample.strength01)).toBe(0);
 await page.locator('#wind-intensity').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#wind-preset').selectOption('forest');
 // Exercise fade copies and another cell before measuring from the fixed entrance.
 await page.evaluate(()=>{m0.reset('trunks');m0.setCamera(25,-20,4);});await page.waitForTimeout(400);
 await page.evaluate(()=>{m0.reset();});await page.waitForTimeout(500);
 await page.locator('#diagnostics > summary').click();
 const ab=[];
 for(const enabled of [false,true]){
  await page.evaluate(v=>m0.inspect().wind.configure({enabled:v}),enabled);
  await page.waitForTimeout(1500);await page.evaluate(()=>m0.beginMeasurement());await page.waitForTimeout(4000);
  ab.push(await page.evaluate(()=>{
   const frames=m0.endMeasurement(),costs=m0.frameCosts(),state=m0.state();
   const summary=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
   return {enabled:state.wind.enabled,frame:summary(frames),cpu:summary(costs.map(c=>c.cpuMs)),windCpu:summary(costs.map(c=>c.windCpuMs)),gpuMain:summary(costs.map(c=>c.gpuMs).filter(x=>x>0)),render:state.render};
  }));
 }
 expect(ab[0].render.width).toBe(ab[1].render.width);expect(ab[0].render.height).toBe(ab[1].render.height);
 expect(ab[0].render.effectiveQuality).toBe('balanced');expect(ab[1].render.effectiveQuality).toBe('balanced');
 expect(ab[0].render.drawCalls).toBe(ab[1].render.drawCalls);
 expect(await page.evaluate(()=>m0.state().errors)).toEqual([]);expect(errors).toEqual([]);
 console.log(JSON.stringify({windAttributeBytes:geometry.bytes,gpuFieldMaxError:Math.max(...parity),ab}));
});
