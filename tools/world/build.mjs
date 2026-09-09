import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,statSync,rmSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {openHeightmap} from '../geography/read-heightmap.mjs';
import {sampleRaster} from '../../src/domain/geography.mjs';
import {createWorldGeography} from '../../src/domain/world-geography.mjs';
import {buildTrails} from './trails.mjs';
const source='content/geography/old-forest/',out='public/world/';mkdirSync(out+'tiles',{recursive:true});
const g=JSON.parse(readFileSync(source+'geography.json')),geo=createWorldGeography(g),hm=openHeightmap(source+'generated');
const hash=b=>createHash('sha256').update(b).digest('hex');
const signature=hash(Buffer.concat(['geography.json','generated/manifest.json'].map(f=>readFileSync(source+f)).concat(['tools/world/build.mjs','tools/world/trails.mjs','src/domain/geography.mjs','src/domain/world-geography.mjs'].map(f=>readFileSync(f)))));
if(existsSync(out+'signature')&&readFileSync(out+'signature','utf8')===signature){console.log('World pack unchanged');hm.close();process.exit(0);}
rmSync(out,{recursive:true,force:true});mkdirSync(out+'tiles',{recursive:true});
const write=(file,data)=>{const b=gzipSync(Buffer.from(typeof data==='string'?data:JSON.stringify(data)),{level:9});writeFileSync(out+file,b);return b;};
const trails=buildTrails(g,geo,hm);write('trails.json.pack',trails);
const palette=['#637349','#75925b','#405e50','#507c69','#6d8260','#687250','#aaa577','#7c874e','#81775a'];
const coarse={origin:[g.bounds.minE,g.bounds.minN],stepM:128,columns:321,rows:353,values:[]};
const clearings=g.features.filter(f=>f.geometry.type==='Point'&&(f.placement?.reserveM??0)>=80);
const forestMask=[];const zones=[];for(let y=0;y<coarse.rows;y++)for(let x=0;x<coarse.columns;x++){const e=coarse.origin[0]+x*128,n=coarse.origin[1]+y*128;coarse.values.push(Math.round(sampleRaster(hm.base,e,n)*32)/32);const zone=g.zones.indexOf(geo.zoneAt(e,n));zones.push(zone);forestMask.push(zone>=0&&zone!==6&&!clearings.some(f=>Math.hypot(e-f.geometry.coordinates[0],n-f.geometry.coordinates[1])<f.placement.reserveM+32)?1:0);}
write('coarse.json.pack',{...coarse,zones,forestMask});
const points=g.features.filter(f=>f.geometry.type==='Point');
const map={bounds:g.bounds,pois:points.map(f=>({id:f.id,name:f.name,kind:f.kind,point:f.geometry.coordinates,height:Math.round(hm.sample(...f.geometry.coordinates)),zone:geo.zoneAt(...f.geometry.coordinates)?.name??'Открытая местность'})),lines:g.features.filter(f=>f.geometry.type==='LineString'&&!f.route).map(f=>({id:f.id,kind:f.kind,points:f.geometry.coordinates})),forest:g.features.find(f=>f.id==='forest_boundary').geometry.coordinates[0],trails,zones:g.zones.map((z,i)=>({id:z.id,name:z.name,color:palette[i]})),raster:{origin:coarse.origin,stepM:128,columns:coarse.columns,rows:coarse.rows,heights:coarse.values,zones},route:g.features.find(f=>f.id==='frodo_route').geometry.coordinates};
write('map.json.pack',map);
const slim={schemaVersion:g.schemaVersion,worldSeed:g.worldSeed,features:g.features.map(f=>({id:f.id,name:f.name,kind:f.kind,geometry:f.geometry,water:f.water,route:f.route,placement:f.placement,dressing:f.dressing})),bounds:g.bounds,zones:g.zones,terrain:g.terrain,placementPolicy:g.placementPolicy};write('geography.json.pack',slim);
const manifest={version:'stream-1-'+signature.slice(0,12),bounds:g.bounds,tileSize:512,tiles:{},coarse:'coarse.json.pack',map:'map.json.pack',geography:'geography.json.pack',trails:'trails.json.pack',assetBytes:0,packedBytes:0};
for(let y=g.bounds.minN/512;y<g.bounds.maxN/512;y++)for(let x=g.bounds.minE/512;x<g.bounds.maxE/512;x++){
 const id=x+','+y,detail=hm.tile(id),step=detail?2:16,columns=512/step+1,values=new Float32Array(columns*columns);
 for(let j=0;j<columns;j++)for(let i=0;i<columns;i++)values[j*columns+i]=detail?detail.values[j*columns+i]:sampleRaster(hm.base,x*512+i*step,y*512+j*step);
 // All supported browsers/Node are LE, but serialization states and enforces LE.
 const raw=Buffer.alloc(values.byteLength);for(let i=0;i<values.length;i++)raw.writeFloatLE(values[i],i*4);
 const b=gzipSync(raw,{level:9}),file='tiles/'+x+'_'+y+'.bin.pack';writeFileSync(out+file,b);manifest.tiles[id]={file,bytes:b.length,sha256:hash(b),stepM:step};manifest.packedBytes+=b.length;
}
writeFileSync(out+'manifest.json',JSON.stringify(manifest));write('manifest.json.pack',manifest);writeFileSync(out+'signature',signature);hm.close();console.log(JSON.stringify({tiles:Object.keys(manifest.tiles).length,compressedMiB:manifest.packedBytes/1048576,paths:trails.length,pathKm:trails.reduce((s,t)=>s+t.points.slice(1).reduce((q,p,i)=>q+Math.hypot(p[0]-t.points[i][0],p[1]-t.points[i][1]),0),0)/1000,pois:points.length}));
