import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const url=process.env.WORLD_URL??'http://127.0.0.1:4181/',backend=process.argv.includes('--webgpu')?'webgpu':'webgl2';
const b=await chromium.launch({channel:'chrome',headless:false}),p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),errors=[];
let release;const gate=new Promise(r=>release=r);let held=false;const report={url,backend,errors};
p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*soil*.png',async route=>{held=true;await gate;await route.continue();});
try{
 await p.goto(url+'?debug=1&renderer='+backend,{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>document.querySelector('#resume')?.textContent?.includes('Материалы леса'),null,{timeout:45000});
 assert.ok(held);assert.ok(await p.locator('#resume').isDisabled());report.delayedTextureBlocksEntry=true;release();
 await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:45000});await p.locator('#resume').click();
 await p.waitForFunction(()=>m0.inspect().world.ground.isReady(true));await p.waitForTimeout(1000);
 const s=await p.evaluate(()=>m0.state());assert.equal(s.render.backend,backend);assert.ok(s.playerClear);assert.ok(s.camera.clearance>.23);
 const ground=await p.evaluate(()=>{const g=m0.inspect().world.ground;return {enabled:g.isEnabled(),visible:g.isVisible,opacity:g.visibility,textureReady:g.material.diffuseTexture.isReady(),shaderReady:g.subMeshes[0].effect.isReady()}});assert.ok(ground.textureReady&&ground.shaderReady);report.ground=ground;
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){await p.setViewportSize(viewport);const map=await p.locator('.atlas-button').boundingBox(),stick=await p.locator('.touch-stick').boundingBox();assert.ok(map.y+map.height<=stick.y||map.x>=stick.x+stick.width,'map must not overlap joystick');}
 await p.setViewportSize({width:390,height:844});await p.locator('.atlas-button').tap();await p.getByRole('dialog').waitFor({state:'visible'});await p.getByRole('button',{name:'Закрыть карту'}).tap();await p.waitForTimeout(300);
 assert.equal(errors.length,0,errors.join('\n'));mkdirSync('qa/evidence',{recursive:true});await p.screenshot({path:`qa/evidence/mobile-startup-${backend}.png`});console.log('PASS',JSON.stringify(report));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{release();writeFileSync(`qa/evidence/mobile-startup-${backend}.json`,JSON.stringify(report,null,2));await b.close();}
