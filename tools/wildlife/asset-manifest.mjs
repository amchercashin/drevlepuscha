import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectGlb} from './glb.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const report=read('.artwork/wildlife/bird-01/export-report.json'),guide=read('config/wildlife/bird-rig-guide.json'),reference=read('.artwork/wildlife/bird-01/reference-request.json');
const clips=Object.fromEntries(Object.entries(guide.clips).map(([name,duration])=>[name,{duration,loop:name==='perch_idle'||name==='fly_loop',...(name==='fly_loop'?{nominalSpeedMps:4}:{}),...(name==='takeoff'?{supportChangePhase:0}: {})}]));
const lods=guide.lodTriangles.map((target,level)=>{const file=`woodland-bird/lod${level}.glb`,path=`public/wildlife/${file}`;return {level,file,sha256:sha(readFileSync(path)),...inspectGlb(path),animationBoundsBlender:report.lods[level].animationBoundsBlender};});
const manifest={v:1,status:'candidate',species:[{id:'woodland-bird',review:'pending-human-visual-review',front:'glTF +Z',footOffsetM:0,clips,lods,provenance:{provider:'Meshy official MCP',model:'meshy-7',mcpVersion:'0.5.1',date:'2026-09-19',referencePrompt:reference.params.prompt,referenceSha256:sha(readFileSync('.artwork/wildlife/bird-01/reference.png')),sourceSha256:report.sourceSha256,blender:report.blender,recipe:'tools/wildlife/blender/export.py',rigGuideSha256:sha(readFileSync('config/wildlife/bird-rig-guide.json')),licensing:'Meshy-generated; source receipt retained privately; publication not authorized'}}]};
writeFileSync('public/wildlife/assets.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:manifest.status,lods:lods.map(({level,triangles,joints,bytes})=>({level,triangles,joints,bytes}))}));
