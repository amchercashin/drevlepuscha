import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.QA_URL||'http://127.0.0.1:4177',label=process.env.QA_LABEL||'after',renderer=process.env.RENDERER||'webgpu';
const out='qa/evidence/render-optimization';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.cpuRows=[];window.cpuCollect=false;window.requestAnimationFrame=fn=>raf(t=>{const s=performance.now();fn(t);if(window.cpuCollect)window.cpuRows.push(performance.now()-s);});});
const report={date:new Date().toISOString(),label,renderer,base,errors,views:[],runs:[]};
try{
await page.goto(base+'/?scene=m1&debug=1&renderer='+renderer);await page.waitForFunction(()=>window.m0?.state().ready);await page.getByRole('button',{name:'Начать прогулку'}).click();await page.waitForTimeout(3000);
for(const [name,n,yaw,pitch] of [['entrance',0,0,12],['ferns',15,0,12],['canopy',15,30,-25],['clearing',40,0,12],['outer',160,90,12]]){
 await page.evaluate(({n,yaw,pitch})=>{window.m0.teleport(0,n);window.m0.setCamera(yaw,pitch,5.5);},{n,yaw,pitch});await page.waitForTimeout(1800);const state=await page.evaluate(()=>window.m0.state());if(!state.playerClear||state.camera.followError>1e-5)throw Error('movement/camera failure');report.views.push({name,state});await page.locator('#world').screenshot({path:`${out}/${label}-${renderer}-${name}.png`});
}
await page.evaluate(()=>{window.m0.teleport(0,5);window.m0.setCamera(90,12,5.5);});await page.waitForTimeout(1800);
if(!(await page.evaluate(()=>window.m0.state())).faded.some(m=>m.id.startsWith('camera-trunk-lod0-')))throw Error('Occluder did not fade');
await page.evaluate(()=>window.m0.setCamera(0,12,5.5));await page.waitForTimeout(1800);
if(process.env.PERF!=='0'){
await page.setViewportSize({width:3440,height:1440});await page.evaluate(()=>{window.m0.reset();window.m0.setPaused(false);});await page.locator('#world').focus();await page.waitForTimeout(3000);
if(process.env.WARMUP==='1'){for(const dir of ['KeyW','KeyS']){await page.keyboard.down('ShiftLeft');await page.keyboard.down(dir);await page.waitForTimeout(12000);await page.keyboard.up(dir);await page.keyboard.up('ShiftLeft');}await page.evaluate(()=>window.m0.reset());await page.waitForTimeout(2000);}
for(const direction of ['KeyW','KeyS']){
 await page.evaluate(()=>{window.cpuRows=[];window.cpuCollect=true;window.m0.beginMeasurement();});await page.keyboard.down('ShiftLeft');await page.keyboard.down(direction);await page.waitForTimeout(12000);await page.keyboard.up(direction);await page.keyboard.up('ShiftLeft');const result=await page.evaluate(()=>{window.cpuCollect=false;return {cpu:window.cpuRows,frames:window.m0.endMeasurement(),state:window.m0.state()};});report.runs.push({direction,...result});
}
}
if(errors.length)throw Error(JSON.stringify(errors));
await writeFile(`${out}/${label}-${renderer}.json`,JSON.stringify(report,null,2));
const stats=a=>{a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33.34).length};};console.log(JSON.stringify({label,renderer,views:report.views.map(v=>({name:v.name,render:v.state.render})),runs:report.runs.map(r=>({direction:r.direction,cpu:stats(r.cpu),frame:stats(r.frames),player:r.state.player})),errors}));
}finally{await browser.close();}
