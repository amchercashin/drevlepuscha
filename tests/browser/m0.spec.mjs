import { test, expect } from '@playwright/test';
const browserErrors=new WeakMap();
test.beforeEach(async({page})=>{
  const errors=[];browserErrors.set(page,errors);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/uncaptured error|validationerror|device lost/i.test(m.text()))errors.push(m.text());});
});
test.afterEach(async({page})=>{expect(browserErrors.get(page)).toEqual([]);});

async function start(page) {
  await page.goto(`/?scene=m0&debug=1&renderer=${test.info().project.name}`);
  await page.waitForFunction(()=>window.m0?.state().ready);
  await page.getByRole('button',{name:'Начать прогулку'}).click();
}
async function move(page,key,ms) {await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}

test('renders hardware scene, responds to WASD, and pauses on focus loss',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  const a=await page.evaluate(()=>window.m0.state());
  expect(a.render.backend).toBe(test.info().project.name);expect(a.render.triangles).toBeGreaterThan(100);
  await move(page,'KeyW',750);
  const b=await page.evaluate(()=>window.m0.state());expect(b.player.n-a.player.n).toBeGreaterThan(0.6);
  await page.keyboard.down('KeyW');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const c=await page.evaluate(()=>window.m0.state());expect(c.paused).toBe(true);
  await page.waitForTimeout(250);
  expect((await page.evaluate(()=>window.m0.state())).player.n).toBe(c.player.n);
  await page.keyboard.up('KeyW');await page.getByRole('button',{name:'Продолжить'}).click();
  await page.waitForTimeout(150);expect((await page.evaluate(()=>window.m0.state())).player.n).toBe(c.player.n);
  expect(errors).toEqual([]);expect(b.errors).toEqual([]);
});

test('mouse orbit, pitch clamp, zoom clamp, recenter and resize work through actual input',async({page})=>{
  await start(page);await page.mouse.move(450,260);await page.mouse.down({button:'right'});
  await page.mouse.move(900,440,{steps:15});await page.mouse.up({button:'right'});await page.waitForTimeout(300);
  let s=await page.evaluate(()=>window.m0.state());expect(s.camera.yaw).toBeGreaterThan(50);expect(s.camera.pitch).toBeLessThanOrEqual(35);
  await page.mouse.wheel(0,8000);s=await page.evaluate(()=>window.m0.state());expect(s.camera.distance).toBe(8);
  await page.keyboard.press('Space');await page.waitForTimeout(500);
  s=await page.evaluate(()=>window.m0.state());expect(Math.min(s.camera.yaw,360-s.camera.yaw)).toBeLessThan(1);expect(s.camera.pitch).toBe(12);
  await page.setViewportSize({width:900,height:620});await page.waitForTimeout(100);
  s=await page.evaluate(()=>window.m0.state());expect(s.render.width).toBe(900);expect(s.render.height).toBe(620);
  expect(s.camera.followError).toBeLessThan(0.000001);expect(s.errors).toEqual([]);
});

test('walks through obstacles and slope without changing the user camera',async({page})=>{
  await start(page);
  for(const [n,duration] of [[12,2200],[23,2200],[40,1300]]){
    await page.evaluate(n=>window.m0.teleport(0,n),n);
    await move(page,'KeyW',duration);
    const s=await page.evaluate(()=>window.m0.state());
    expect(s.player.n).toBeGreaterThan(n+1.5);expect(s.playerClear).toBe(true);
    expect(s.camera.followError).toBeLessThan(0.000001);expect(s.camera.currentDistance).toBeCloseTo(s.camera.distance,6);
  }
  expect((await page.evaluate(()=>window.m0.state())).player.h).toBeGreaterThan(2);
  // Check actual following distance after clearing the arch, not only the boom's requested length.
  await page.evaluate(()=>window.m0.teleport(0,24));await move(page,'KeyW',5000);
  const after=await page.evaluate(()=>window.m0.state());
  const followDistance=Math.hypot(after.camera.x-after.player.e,after.camera.y-after.player.h-0.95,after.camera.z+after.player.n);
  expect(after.player.n).toBeGreaterThan(32);expect(followDistance).toBeLessThanOrEqual(5.6);
  expect(after.camera.followError).toBeLessThan(0.000001);
});

test('blocked player slides and full camera orbit retains the user distance',async({page})=>{
  await start(page);
  await page.evaluate(()=>window.m0.teleport(-1,12));
  await move(page,'KeyW',1400);
  let s=await page.evaluate(()=>window.m0.state());expect(s.player.n).toBeLessThan(13.22);expect(s.playerClear).toBe(true);
  await page.keyboard.down('KeyW');await move(page,'KeyD',600);await page.keyboard.up('KeyW');
  expect((await page.evaluate(()=>window.m0.state())).player.e).toBeGreaterThan(-0.8);
  await page.evaluate(()=>window.m0.teleport(-2.8,3.6));
  for(let yaw=0;yaw<=360;yaw+=30){
    await page.evaluate(y=>window.m0.setCamera(y,12,5.5),yaw);await page.waitForTimeout(120);
    expect((await page.evaluate(()=>window.m0.state())).camera.followError).toBeLessThan(0.000001);
  }
  await page.evaluate(()=>{window.m0.teleport(0,0);window.m0.setCamera(0,12,5.5);});
  await page.waitForTimeout(1200);s=await page.evaluate(()=>window.m0.state());
  expect(s.camera.currentDistance).toBeGreaterThan(5.3);expect(s.camera.currentDistance).toBeCloseTo(s.camera.distance,6);
});

test('all six review views retain the user camera and UI does not move player',async({page})=>{
  await start(page);
  for(const preset of ['trail_forward','trail_left','trail_right','look_up_canopy','close_trunk','wide_path']){
    const frame=await page.evaluate(id=>{window.m0.preset(id);return window.m0.state().frameCount;},preset);
    await page.waitForFunction(frame=>window.m0.state().frameCount>frame+1,frame);
    const s=await page.evaluate(()=>window.m0.state());expect(s.camera.followError).toBeLessThan(0.000001);
    if(preset==='look_up_canopy'){expect(s.camera.pitch).toBe(-20);expect(s.camera.y).toBeGreaterThanOrEqual(s.player.h+0.94);expect(s.faded.some(m=>m.id==='ground')).toBe(false);}
  }
  await page.locator('#diagnostics summary').click();await page.locator('#preset').focus();
  const n=(await page.evaluate(()=>window.m0.state())).player.n;
  await move(page,'KeyW',200);expect((await page.evaluate(()=>window.m0.state())).player.n).toBe(n);
});

test('private references are absent from the build and ordinary page has no QA control API',async({page,request})=>{
  const response=await request.get('/references/private/04_river_reference_large.jpeg');
  expect(response.headers()['content-type']||'').not.toContain('image/');
  await page.goto('/?scene=m0');await expect(page.getByRole('button',{name:'Начать прогулку'})).toBeEnabled();
  expect(await page.evaluate(()=>typeof window.m0)).toBe('undefined');
});

test('auto falls back to WebGL2 when WebGPU is unavailable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  await page.goto('/?scene=m0&debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
  const s=await page.evaluate(()=>window.m0.state());expect(s.render.backend).toBe('webgl2');
  expect(s.render.fallbackReason).toContain('WebGPU');expect(s.errors).toEqual([]);
});

test('explicit unsupported WebGPU offers a working WebGL2 recovery button',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  await page.goto('/?scene=m0&debug=1&renderer=webgpu');
  await page.getByRole('button',{name:'Открыть WebGL2'}).click();
  await page.waitForFunction(()=>window.m0?.state().ready);
  expect((await page.evaluate(()=>window.m0.state())).render.backend).toBe('webgl2');
});


test('arch fades smoothly while every frame keeps the chosen orbit and shared stone stays opaque',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    window.m0.teleport(0,24);
    window.cameraSamples=[];window.sampleCamera=true;
    const sample=()=>{if(!window.sampleCamera)return;window.cameraSamples.push(window.m0.state());requestAnimationFrame(sample);};
    requestAnimationFrame(sample);
  });
  await move(page,'KeyW',5500);await page.waitForTimeout(1200);
  const samples=await page.evaluate(()=>{window.sampleCamera=false;return window.cameraSamples;});
  expect(samples.length).toBeGreaterThan(100);
  for(const s of samples){
    expect(s.camera.followError).toBeLessThan(0.000001);
    expect(s.camera.currentDistance).toBeCloseTo(5.5,6);
    expect(s.camera.yaw).toBe(0);expect(s.camera.pitch).toBe(12);
    expect(s.faded.some(m=>m.id==='wall')).toBe(false);
  }
  const alphas=samples.map(s=>s.faded.find(m=>m.id==='arch-lintel')?.opacity??1);
  expect(Math.min(...alphas)).toBeLessThan(.25);
  expect(alphas.some(a=>a>.3&&a<.9)).toBe(true);
  expect(alphas.at(-1)).toBeGreaterThan(.99);
});

test('only the occluding trunk fades and it returns when the camera is turned away',async({page})=>{
  await start(page);
  await page.evaluate(()=>window.m0.teleport(-2.8,7));await page.waitForTimeout(500);
  let s=await page.evaluate(()=>window.m0.state());
  expect(s.faded.find(m=>m.id==='camera-trunk')?.opacity).toBeLessThan(.25);
  expect(s.faded.some(m=>m.id==='narrow-right')).toBe(false);
  expect(s.camera.currentDistance).toBeCloseTo(5.5,6);
  await page.evaluate(()=>window.m0.setCamera(180,12,5.5));await page.waitForTimeout(2000);
  s=await page.evaluate(()=>window.m0.state());
  expect(s.faded.some(m=>m.id==='camera-trunk')).toBe(false);
  expect(s.camera.currentDistance).toBeCloseTo(5.5,6);
});


test('touching the front of the wall does not fade the wall behind the traveller',async({page})=>{
  await start(page);
  await page.evaluate(()=>{window.m0.teleport(-4.43,19);window.m0.setCamera(270,12,5.5);});
  await page.waitForTimeout(2000);
  const s=await page.evaluate(()=>window.m0.state());
  expect(s.playerClear).toBe(true);expect(s.faded.some(m=>m.id==='wall')).toBe(false);
  expect(s.camera.currentDistance).toBeCloseTo(5.5,6);
});


test('small stone near the wall stays opaque when it covers only the lower body',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const stone=window.m0.obstacles().find(b=>b.id==='edge-stone-3');
    window.m0.teleport((stone.min.x+stone.max.x)/2,-stone.max.z+1);
  });
  await page.waitForTimeout(800);
  const s=await page.evaluate(()=>window.m0.state());
  expect(s.playerClear).toBe(true);
  expect(s.faded.some(m=>m.id==='edge-stone-3')).toBe(false);
  expect(s.faded.some(m=>m.id==='wall')).toBe(false);
  expect(s.camera.currentDistance).toBeCloseTo(5.5,6);
});
