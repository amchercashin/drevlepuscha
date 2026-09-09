import {openHarness} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.HARNESS_URL=process.env.HARNESS_URL||'http://127.0.0.1:4173/?scene=m1';
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)||'after';
const {browser,page,errors}=await openHarness({width:1600,height:900});
try{
 await page.waitForTimeout(2500);
 await page.evaluate(()=>{
  window.m0.setCamera(0,12,5.5);
  const stream=document.querySelector('canvas').captureStream(30),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});
  recorder.ondataavailable=e=>chunks.push(e.data);
  window.finishLightingVideo=()=>new Promise(resolve=>{recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};recorder.stop();});recorder.start();
 });
 await page.waitForTimeout(1000);
 await page.keyboard.down('KeyW');await page.waitForTimeout(Number(process.env.WALK_MS||6500));await page.keyboard.up('KeyW');
 await page.screenshot({path:`qa/evidence/light-${label}-ground.png`});
 await page.evaluate(()=>window.m0.setCamera(30,-25,5.5));await page.waitForTimeout(1800);
 await page.screenshot({path:`qa/evidence/light-${label}-canopy.png`});
 const video=await page.evaluate(()=>window.finishLightingVideo());await writeFile(`qa/evidence/light-${label}.webm`,Buffer.from(video));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({errors,state:await page.evaluate(()=>window.m0.state())}));
}finally{await browser.close();}
