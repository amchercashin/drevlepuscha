/** One real 43 km walk at 15 m/s, with collision, streaming and origin rebases enabled. */
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.WORLD_URL??'http://127.0.0.1:4178/';
let route=JSON.parse(readFileSync('content/geography/old-forest/geography.json')).features.find(f=>f.id==='frodo_route').geometry.coordinates.map(p=>[...p]);
// Approaches go around the physical landmark, retaining the authored literary route in the map.
const tail=process.argv.includes('--tail');
route[33]=[17460,19180];route[route.length-1]=[22384,19350];
if(tail)route=[[17692.644838384964,19138.475944598664],[17695,19127],...route.slice(34)];else route.splice(34,0,[17495,19154.8]);
const output=tail?'qa/evidence/world-traversal-tail.json':'qa/evidence/world-traversal-webgpu.json';
const q=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]??null;
const stats=a=>({count:a.length,median:q(a,.5),p95:q(a,.95),p99:q(a,.99),max:Math.max(0,...a),over33:a.filter(x=>x>33.34).length});
const report={url,started:new Date().toISOString(),viewport:[2560,1440],speedMps:15,network:{mbps:20,latencyMs:80},route,windows:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:1}),cdp=await page.context().newCDPSession(page);let wire=0;
await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:20e6/8,uploadThroughput:5e6/8});
cdp.on('Network.loadingFinished',e=>wire+=e.encodedDataLength);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&/invalid|error|index count of 0/i.test(m.text()))report.errors.push(m.text().slice(0,1000));});
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{
 const start=Date.now();await page.goto(url+'?debug=1&renderer=webgpu',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.oldForest?.state().ready,{},{timeout:60000});report.coldReadyMs=Date.now()-start;report.coldWireBytes=wire;
 await page.locator('#resume').click();await page.evaluate(p=>oldForest.teleport(...p),route[0]);await page.waitForTimeout(2000);await page.evaluate(points=>{oldForest.setCamera(40,12,5.5);oldForest.startTraversal(points,15);oldForest.beginMeasurement();},route);report.walkStarted=new Date().toISOString();let previousDistance=-1,stuck=0;
 for(let i=0;i<64;i++){
  await page.waitForTimeout(50000);const sample=await page.evaluate(()=>{const s=oldForest.state(),m=oldForest.endMeasurement();oldForest.beginMeasurement();const {world}=oldForest.inspect();return {s,m,safety:{water:world.data.waterDepth(s.player.e,s.player.n),clear:!world.blocked(s.player.e,s.player.n)}};});
  const window={minute:(i+1)*50/60,frames:stats(sample.m.frames),cpu:stats(sample.m.cpu),gpu:stats(sample.m.gpu),state:sample.s,safety:sample.safety};report.windows.push(window);save();console.log(JSON.stringify({minute:window.minute.toFixed(1),routeIndex:sample.s.traversal.index,km:(sample.s.traversal.distance/1000).toFixed(2),frameP95:window.frames.p95,cpuP95:window.cpu.p95,gpuP95:window.gpu.p95,tiles:sample.s.world.tiles,patches:sample.s.world.terrain.patches,heapMiB:Math.round(sample.s.heap/1048576),rebases:sample.s.world.rebases,errors:report.errors.length}));
  assert.equal(report.errors.length,0,report.errors.join('\n'));assert.ok(sample.s.camera.followError<.002,'Camera invariant');assert.ok(sample.s.world.terrain.patches<=110,'Terrain residency bounded');assert.ok(sample.s.world.tiles<=20,'Decoded tiles bounded');assert.ok(sample.s.world.failures===0,'No failed fetches');
  const distance=sample.s.traversal.distance;if(distance-previousDistance<10)stuck++;else stuck=0;previousDistance=distance;assert.ok(stuck<2,'Walk stalled on geometry');
  if(sample.s.traversal.index>=route.length){report.completed=true;break;}
  // Deliberate manual-style rapid camera turns across different populated terrain.
  if(i%6===5)await page.evaluate(yaw=>oldForest.setCamera(yaw,12,5.5),(i*47)%360);
 }
 assert.equal(report.completed,true,'Full route completed');report.finished=new Date().toISOString();report.totalWireBytes=wire;report.final=await page.evaluate(()=>oldForest.state());await page.screenshot({path:'qa/evidence/world-traversal-finish.png'});console.log('PASS complete route',report.final.traversal);
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;await page.screenshot({path:'tmp/world-traversal-failure.png'});}finally{save();await browser.close();}
