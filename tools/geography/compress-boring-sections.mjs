/** One-time stage 3 gameplay compression. Bakes a monotone homeomorphic warp. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../../content/geography/old-forest/geography.json',import.meta.url));
const g=JSON.parse(readFileSync(file,'utf8'));
if(g.terrain.gameplayCompressionStage3)throw Error('Stage 3 compression is already baked.');
const x=[512,1485.008,3571.808,4842.888,6073.548,7953.108,8253.108,8753.108];
const X=[512,1220,2350,3050,4300,5600,5900,6400];
const S=[1,.68,.28,.60,.90,.90,.95,1],baseN=25420;
function segment(v){if(v<=x[0])return -1;if(v>=x.at(-1))return x.length-1;for(let i=0;i<x.length-1;i++)if(v<=x[i+1])return i;}
function mapE(v){const i=segment(v);if(i<0)return v;if(i===x.length-1)return v+(X.at(-1)-x.at(-1));const t=(v-x[i])/(x[i+1]-x[i]);return X[i]+(X[i+1]-X[i])*t;}
function scaleN(v){const i=segment(v);if(i<0||i===x.length-1)return 1;const t=(v-x[i])/(x[i+1]-x[i]);return S[i]+(S[i+1]-S[i])*t;}
const map=p=>[Math.round(mapE(p[0])*1e6)/1e6,Math.round((baseN+scaleN(p[0])*(p[1]-baseN))*1e6)/1e6];
const map3=p=>[...map(p),p[2]];
for(const f of g.features){const geo=f.geometry;
 if(f.water){f.water.stations=f.water.stations.map(map3);geo.coordinates=f.water.stations.map(p=>p.slice(0,2));for(const pool of f.water.pools??[])pool.center=map(pool.center);}
 else if(geo.type==='Point')geo.coordinates=map(geo.coordinates);
 else if(geo.type==='Polygon')geo.coordinates=geo.coordinates.map(r=>r.map(map));
 else geo.coordinates=geo.coordinates.map(map);
 if(f.route?.surface)f.route.surface.stations=f.route.surface.stations.map(map3);
}
for(const c of g.constraints){if(c.points)c.points=c.points.map(map);if(c.point)c.point=map(c.point);}
for(const z of g.zones)if(z.selector.type==='polygon')z.selector.coordinates=z.selector.coordinates.map(map);for(const l of g.terrain.landforms)l.center=map(l.center);
for(const p of g.terrain.pads)p.center=map(p.center);
for(const r of g.terrain.sculpt.ribbons)r.points=r.points.map(map);
for(const v of g.terrain.viewpoints)v.point=map(v.point);
const old=g.bounds,newMaxE=Math.ceil(mapE(old.maxE)/512)*512;
g.bounds={minE:old.minE,minN:old.minN,maxE:newMaxE,maxN:old.maxN};
const slopes=[];for(let i=0;i<x.length-1;i++)slopes.push((X[i+1]-X[i])/(x[i+1]-x[i]));
const minJacobian=Math.min(...slopes.map((v,i)=>v*Math.min(S[i],S[i+1])));
g.terrain.gameplayCompressionStage3={version:1,baselineNorthM:baseN,eastKnotsM:x,eastTargetsM:X,northScale:S,minimumPiecewiseJacobian:minJacobian,note:'Monotone macro warp. Strongest compression is confined to low-information travel around the northern excursion; local terrain radii and named-scene sizes stay in metres.'};
g.calibration.gameplayCompression={status:'authored',method:'two-stage route-led compression; stage 3 uses a monotone separable macro warp over low-information travel',targetRouteKm:8.95,targetWalkingHoursAt1_85Mps:1.344,note:'Key scenes and local terrain dimensions remain substantially larger than the connective travel between them. Not 1:1.'};
g.contentRevision='old-forest-gameplay-2.1.0';
g.decisions.push({id:'boring-travel-compression-stage3',decision:'Further compress low-information connective travel by roughly one third overall. Preserve the Willow sequence, secret-path relief vocabulary and final approach at much higher local scale than the long northern transit.',sourceRefs:['old-forest-reconstruction-v1']});
writeFileSync(file,JSON.stringify(g,null,2)+'\n');
console.log(JSON.stringify({bounds:g.bounds,minimumPiecewiseJacobian:minJacobian,revision:g.contentRevision}));