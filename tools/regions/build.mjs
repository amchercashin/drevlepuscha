import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {regionGeography,createBrandywineGeography} from '../../src/domain/regions/brandywine.mjs';
import {storageInfo} from './authoring-core.mjs';
import {buildWaterMeshes} from './water-mesh.mjs';
import {regionalHabitat} from '../../src/domain/regions/habitat.mjs';
const out='public/regions/brandywine-bridge/world/';
const inputs=['content/regions/brandywine-bridge/region-source.json','src/domain/regions/authoring-core.mjs','src/domain/regions/brandywine.mjs','tools/regions/build.mjs','tools/regions/water-mesh.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
inputs.push('src/domain/regions/habitat.mjs','src/domain/regions/traversal.mjs','src/domain/regions/objects.mjs');
inputs.push('src/domain/regions/session.ts','src/domain/geography.mjs','src/world/worker.ts','src/world/ecology.ts');
const signature=hash(inputs.map(f=>readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n'));
if(existsSync(out+'signature')&&readFileSync(out+'signature','utf8')===signature){console.log('Brandywine pack unchanged');process.exit(0);}
const source=JSON.parse(readFileSync(inputs[0])),storage=storageInfo(source),g=regionGeography(source),geo=createBrandywineGeography(g);
mkdirSync(out+'tiles',{recursive:true});
const write=(file,value)=>writeFileSync(out+file,gzipSync(Buffer.from(JSON.stringify(value)),{level:6}));
const trails=source.topology.edges.filter(e=>!['boat','ford'].includes(e.kind)).map(e=>({id:e.id,kind:e.kind==='path'?'path':'worn',width:e.widthM,points:e.points}));
const b=storage.bounds,coarse={origin:[b.minE,b.minN],stepM:128,columns:(b.maxE-b.minE)/128+1,rows:(b.maxN-b.minN)/128+1,values:[],zones:[],forestMask:[]};
for(let y=0;y<coarse.rows;y++)for(let x=0;x<coarse.columns;x++){const e=b.minE+x*128,n=b.minN+y*128;coarse.values.push(geo.height(e,n));coarse.zones.push(g.zones.indexOf(geo.zoneAt(e,n)));coarse.forestMask.push(Number(geo.forestAt(e,n)));}
write('geography.json.pack',g);write('coarse.json.pack',coarse);write('trails.json.pack',trails);
write('water.json.pack',buildWaterMeshes(geo,b));
write('habitat.json.pack',regionalHabitat(geo,signature));
const manifest={version:'brandywine-'+signature.slice(0,12),bounds:source.playBounds,tileSize:512,tiles:{},coarse:'coarse.json.pack',geography:'geography.json.pack',trails:'trails.json.pack',map:'',assetBytes:0,packedBytes:0};
for(const id of storage.tiles){const [x,y]=id.split(',').map(Number),raw=Buffer.alloc(257*257*4);for(let j=0;j<257;j++)for(let i=0;i<257;i++)raw.writeFloatLE(geo.height(x*512+i*2,y*512+j*2),(j*257+i)*4);const packed=gzipSync(raw,{level:6}),file=`tiles/${x}_${y}.bin.pack`;writeFileSync(out+file,packed);manifest.tiles[id]={file,bytes:packed.length,sha256:hash(packed),stepM:2};manifest.packedBytes+=packed.length;}
write('manifest.json.pack',manifest);writeFileSync(out+'manifest.json',JSON.stringify(manifest));writeFileSync(out+'signature',signature);
console.log(JSON.stringify({region:source.regionId,tiles:storage.count,bytes:manifest.packedBytes,coarse:[coarse.columns,coarse.rows]}));
