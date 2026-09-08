/** Meshy trial runner. No credentials, reference pixels or signed URLs enter the build. */
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const [command,route='a',configPath='config/meshy-tree-trial.json']=process.argv.slice(2);
const config=JSON.parse(await readFile(configPath,'utf8'));
if(!/^[a-z0-9-]+$/.test(config.id))throw new Error('Use a stable lowercase asset-run ID');
const privateDir='references/private/meshy-runs/'+config.id;
const outputPath=route=>config.outputs?.[route]??('assets/trees/meshy-'+route);
const sha=b=>createHash('sha256').update(b).digest('hex');
const localEnv=await readFile('.env.meshy.local','utf8').catch(()=> '');
const key=process.env.MESHY_API_KEY||parseEnv(localEnv).MESHY_API_KEY;
const log=value=>console.log(JSON.stringify(value));
const json=async p=>JSON.parse(await readFile(p,'utf8'));
async function save(path,value,exclusive=false){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:exclusive?'wx':'w'});}
async function api(path,body){
 if(!key)throw new Error('Set MESHY_API_KEY in .env.meshy.local');
 const r=await fetch('https://api.meshy.ai/openapi/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000),redirect:'error'});
 const data=await r.json();
 if(!r.ok)throw new Error('Meshy HTTP '+r.status+': '+String(data.message||data.error||'Request failed').replaceAll(key,'[redacted]'));
 return data;
}
async function imageInput(path){
 const bytes=await readFile(path);if(bytes.length>20*1024*1024)throw new Error('Reference exceeds 20 MB');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216;
 if(!png&&!jpeg)throw new Error('Reference must be PNG or JPEG');
 return {uri:'data:image/'+(png?'png':'jpeg')+';base64,'+bytes.toString('base64'),sha256:sha(bytes)};
}
function jobPath(name){if(!['a','b','concept'].includes(name))throw new Error('Route must be a, b or concept');return privateDir+'/'+name+'.json';}
function summary(job){return {route:job.route,id:job.id,status:job.result?.status||job.status,progress:job.result?.progress,consumedCredits:job.result?.consumed_credits};}
async function submit(name,type,request,inputs,estimate){
 const path=jobPath(name);
 if(await stat(path).catch(()=>false)){const job=await json(path);throw new Error('Existing job: '+JSON.stringify(summary(job))+'. Use status/download; do not resubmit.');}
 const balance=await api('balance');if(balance.balance<estimate)throw new Error('Insufficient credits; balance '+balance.balance);
 const safeRequest={...request};delete safeRequest.image_url;delete safeRequest.reference_image_urls;
 const job={version:1,route:name,type,createdAt:new Date().toISOString(),status:'SUBMITTING',configHash:sha(await readFile(configPath)),request:safeRequest,inputs,estimatedCredits:estimate,balanceBefore:balance.balance};
 // Write intent BEFORE the paid POST. An uncertain response must never auto-retry.
 await save(path,job,true);
 try {const result=await api(type,request);if(!result.result)throw new Error('Task ID missing');job.id=result.result;job.status='PENDING';await save(path,job);log(summary(job));}
 catch(error){job.status='SUBMISSION_UNCONFIRMED';await save(path,job);throw error;}
}
async function retrieve(name){
 const path=jobPath(name),job=await json(path);
 if(!job.id)throw new Error('Submission has no confirmed ID. Reconcile with Meshy task list before any new POST.');
 job.result=await api(job.type+'/'+encodeURIComponent(job.id));await save(path,job);return job;
}
async function downloadFile(url,path){
 const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='assets.meshy.ai'||u.hostname.endsWith('.meshy.ai')))throw new Error('Unexpected Meshy asset host: '+u.hostname);
 const r=await fetch(u,{signal:AbortSignal.timeout(90000),redirect:'error'});if(!r.ok)throw new Error('Download HTTP '+r.status);
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>100*1024*1024)throw new Error('Asset exceeds 100 MB');
 await mkdir(dirname(path),{recursive:true});
 const old=await readFile(path).catch(()=>null);if(old&&!old.equals(bytes))throw new Error('Refusing to overwrite different asset: '+path);
 await writeFile(path+'.partial',bytes);await rename(path+'.partial',path);return {path,bytes:bytes.length,sha256:sha(bytes)};
}
async function download(name){
 const job=await retrieve(name);if(job.result.status!=='SUCCEEDED')throw new Error('Task is not successful: '+JSON.stringify(summary(job)));
 const base=outputPath(name==='concept'?'b':name),files=[];
 if(name==='concept'){
  if(job.result.image_urls?.length!==1)throw new Error('Expected exactly one concept image');
  files.push(await downloadFile(job.result.image_urls[0],base+'/concept.png'));
 }else{
  if(!job.result.model_urls?.glb)throw new Error('GLB export missing');
  files.push(await downloadFile(job.result.model_urls.glb,base+'/source.glb'));
  for(const [i,maps] of (job.result.texture_urls||[]).entries())for(const [kind,url] of Object.entries(maps)){
   if(url)files.push(await downloadFile(url,privateDir+'/'+name+'/texture-'+i+'-'+kind+(/\.jpe?g(?:\?|$)/i.test(url)?'.jpg':'.png')));
  }
 }
 const receipt={version:1,provider:'Meshy',type:job.type,taskId:job.id,createdAt:job.createdAt,downloadedAt:new Date().toISOString(),request:job.request,inputs:job.inputs,consumedCredits:job.result.consumed_credits??null,estimatedCredits:job.estimatedCredits,files:files.filter(f=>!f.path.startsWith('references/private/'))};
 await save(base+'/'+(name==='concept'?'concept-receipt':'generation')+'.json',receipt);log({route:name,files:files.map(f=>({path:f.path,bytes:f.bytes}))});
}

try{
 if(command==='balance')log(await api('balance'));
 else if(command==='concept'){
  if(!(await stat(jobPath('concept')).catch(()=>false))&&await stat(outputPath('b')+'/concept.png').catch(()=>false))throw new Error('Concept output already exists; choose a new output directory before spending credits');
  const input=await imageInput(config.reference);
  await submit('concept','image-to-image',{ai_model:config.conceptModel,prompt:config.conceptPrompt,reference_image_urls:[input.uri],aspect_ratio:config.conceptAspectRatio,generate_multi_view:false,remove_background:false},[{path:config.reference,sha256:input.sha256}],config.estimatedApiCredits.concept);
 }else if(command==='model'){
  if(!['a','b'].includes(route))throw new Error('Model route must be a or b');
  if(!(await stat(jobPath(route)).catch(()=>false))&&await stat(outputPath(route)+'/source.glb').catch(()=>false))throw new Error('Model output already exists; choose a new output directory before spending credits');
  const path=outputPath(route)+'/concept.png',input=await imageInput(path);
  await submit(route,'image-to-3d',{...config.generation,image_url:input.uri},[{path,sha256:input.sha256}],config.estimatedApiCredits.model);
 }else if(command==='status')log(summary(await retrieve(route)));
 else if(command==='download')await download(route);
 else throw new Error('Usage: node tools/meshy.mjs balance | concept | model a|b | status a|b|concept | download a|b|concept');
}catch(error){console.error(error.message?.replaceAll(key||'__unset__','[redacted]'));process.exitCode=1;}
