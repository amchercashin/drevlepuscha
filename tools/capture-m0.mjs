import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openHarness } from './browser.mjs';
const out=new URL('../qa/evidence/',import.meta.url);await mkdir(out,{recursive:true});
const {browser,page,errors}=await openHarness();
try {
  await page.waitForTimeout(4000);
  const snapshots=[];
  for(const id of ['trail_forward','trail_left','trail_right','look_up_canopy','close_trunk','wide_path']){
    await page.evaluate(id=>{
      window.m0.reset(id==='trail_left'?'trunks':id==='trail_right'?'arch':id==='wide_path'?'slope':'entrance');
      if(id==='close_trunk')window.m0.teleport(-2.8,3.6);
      if(id==='look_up_canopy')window.m0.teleport(1.8,7);
      window.m0.preset(id);
    },id);await page.waitForTimeout(500);
    await page.screenshot({path:fileURLToPath(new URL(`${id}.png`,out))});
    snapshots.push({id,state:await page.evaluate(()=>window.m0.state())});
  }
  // Record the real canvas with the browser encoder: no extra browser/ffmpeg download.
  await page.evaluate(()=>{
    window.m0.reset();window.m0.startTraversal();
    const stream=document.querySelector('canvas').captureStream(30);
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('No WebM encoder available');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1_600_000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.finishRecording=()=>new Promise(resolve=>{
      recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const buf=await new Blob(chunks).arrayBuffer();resolve(Array.from(new Uint8Array(buf)));};
      recorder.stop();
    });
    recorder.start();
  });
  await page.waitForTimeout(28_000);
  await page.evaluate(()=>window.m0.stopTraversal());
  // Continuous stationary look-around and canopy tilt at the end of the walk.
  for(let yaw=0;yaw<=360;yaw+=30){await page.evaluate(y=>window.m0.setCamera(y,-20,5.5),yaw);await page.waitForTimeout(250);}
  const video=await page.evaluate(()=>window.finishRecording());
  await writeFile(new URL('traversal-and-look.webm',out),Buffer.from(video));
  const final=await page.evaluate(()=>window.m0.state());
  await writeFile(new URL('capture.json',out),JSON.stringify({date:new Date().toISOString(),browser:browser.version(),snapshots,final,errors},null,2)+'\n');
  if(errors.length||final.camera.followError>0.000001)throw new Error(JSON.stringify({errors,followError:final.camera.followError}));
  console.log('Captured six real browser views and continuous traversal/look-up video.');
} finally {await browser.close();}
