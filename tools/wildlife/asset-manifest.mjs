import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectGlb} from './glb.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const species=[];
for(const [id,folder,guideName] of [['woodland-bird','bird-01','bird'],['red-squirrel','squirrel-01','squirrel'],['roe-deer','deer-01','deer']]){
const report=read(`.artwork/wildlife/${folder}/export-report.json`),guide=read(`config/wildlife/${guideName}-rig-guide.json`),reference=read(`.artwork/wildlife/${folder}/reference-request.json`);
const clips=Object.fromEntries(Object.entries(guide.clips).map(([name,duration])=>[name,{duration,loop:!['alert','takeoff','mount_trunk'].includes(name),...(guide.locomotion?.[name]?{nominalSpeedMps:guide.locomotion[name].speedMps}:{}),...(name==='fly_loop'?{nominalSpeedMps:4}:{}),...(name==='takeoff'?{supportChangePhase:0}: {})}]));
const lods=guide.lodTriangles.map((target,level)=>{const file=`${id}/lod${level}.glb`,path=`public/wildlife/${file}`;return {level,file,sha256:sha(readFileSync(path)),...inspectGlb(path),animationBoundsBlender:report.lods[level].animationBoundsBlender};});
species.push({id,review:'pending-human-visual-review',front:'glTF +Z',footOffsetM:id==='woodland-bird'?0:id==='red-squirrel'?.003:.014,clips,lods,provenance:{provider:'Meshy official MCP',model:'meshy-7',mcpVersion:'0.5.1',date:'2026-09-19',referencePrompt:reference.params.prompt,referenceSha256:sha(readFileSync(`.artwork/wildlife/${folder}/reference.png`)),sourceSha256:report.sourceSha256,blender:report.blender,recipe:`tools/wildlife/blender/${id==='woodland-bird'?'':'land_'}export.py`,rigGuideSha256:sha(readFileSync(`config/wildlife/${guideName}-rig-guide.json`)),licensing:'Meshy-generated; source receipt retained privately; publication not authorized'}});
}
const insectFile='woodland-butterfly/model.glb',insectReport=read('.artwork/wildlife/butterfly-01/export-report.json');
const decorative=[{id:'woodland-butterfly',review:'pending-human-visual-review',front:'glTF +Z',footOffsetM:0,clips:{flutter:{duration:.16,loop:true}},lods:[{level:0,file:insectFile,sha256:sha(readFileSync('public/wildlife/'+insectFile)),...inspectGlb('public/wildlife/'+insectFile)}],provenance:{provider:'Meshy official MCP',model:'meshy-7',sourceSha256:insectReport.sourceSha256,blender:insectReport.blender,recipe:'tools/wildlife/blender/butterfly_export.py'}}];
const manifest={v:1,status:'candidate',species,decorative};
writeFileSync('public/wildlife/assets.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:manifest.status,lods:species.flatMap(s=>s.lods).map(({level,triangles,joints,bytes})=>({level,triangles,joints,bytes}))}));
