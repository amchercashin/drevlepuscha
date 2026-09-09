/** One-time, bounded authoring deformation; baked coordinates remain the map source. */
import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../../content/geography/old-forest/geography.json',import.meta.url)),g=JSON.parse(readFileSync(file));
if(g.terrain.curvature)throw Error('Curvature is already baked; do not deform the same map twice.');
if(g.features.some(f=>f.route?.surface))throw Error('Re-author coordinates before grading; existing surface stations cannot be warped implicitly.');
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);},distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Repair the folded contextual river left by the previous compression, west of the forest.
const brandy=g.features.find(f=>f.id==='brandywine');brandy.water.stations[5]=[-3500,19500,9];brandy.water.stations[6]=[-4200,17100,5];brandy.water.stations[7]=[-4250,15500,2];
const protectedPoints=g.features.filter(f=>f.geometry.type==='Point').map(f=>f.geometry.coordinates.slice());protectedPoints.push(g.features.find(f=>f.id==='withywindle').water.stations.at(-1).slice(0,2));
function warp(p){const [e,n]=p;let fade=1;for(const q of protectedPoints)fade=Math.min(fade,smooth((distance(p,q)-18)/90));
 const b=g.bounds;fade*=smooth(Math.min(e-b.minE,b.maxE-e,n-b.minN,b.maxN-n)/256);
 return [e+fade*(9*Math.sin(n/72+e/175)+4*Math.sin(e/56-n/130)),n+fade*(7*Math.sin(e/105-n/150)+3*Math.sin(n/65+e/185))];
}
const mapped=p=>warp(p).map(x=>Math.round(x*1e6)/1e6);
function densify(points,step){const out=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],count=Math.ceil(distance(a,b)/step);for(let j=0;j<count;j++)out.push(a.map((v,k)=>v+(b[k]-v)*j/count));}out.push(points.at(-1));return out;}
let minimumJacobian=Infinity;
for(const f of g.features){const points=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates;
 for(const p of densify(points.length===1?[points[0],[points[0][0]+1,points[0][1]]]:points,32)){
  const a=warp([p[0]-.5,p[1]]),b=warp([p[0]+.5,p[1]]),c=warp([p[0],p[1]-.5]),d=warp([p[0],p[1]+.5]);minimumJacobian=Math.min(minimumJacobian,(b[0]-a[0])*(d[1]-c[1])-(d[0]-c[0])*(b[1]-a[1]));
 }
}
if(minimumJacobian<.25)throw Error('Authoring warp too strong: '+minimumJacobian);
const junctions=g.features.filter(f=>f.water?.confluence).map(f=>f.water.stations.at(-1));
function rounded(points,radius){const out=[points[0]];
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1];
  if(junctions.some(p=>distance(p,b)<.01)||protectedPoints.some(p=>distance(p,b)<50)){out.push(b);continue;}
  const r=Math.min(radius,distance(a,b)*.15,distance(b,c)*.15),p=b.map((v,k)=>v+(a[k]-v)*r/distance(a,b)),q=b.map((v,k)=>v+(c[k]-v)*r/distance(b,c));out.push(p);
  for(let j=1;j<=6;j++){const t=j/6;out.push(b.map((_,k)=>p[k]*(1-t)*(1-t)+2*b[k]*t*(1-t)+q[k]*t*t));}
 }out.push(points.at(-1));return out;
}
for(const f of g.features){const geo=f.geometry;
 if(f.water)f.water.stations=rounded(f.water.stations,f.id==='brandywine'?160:f.id==='gully_brook'?6:18);

 if(f.water){f.water.stations=densify(f.water.stations,f.id==='brandywine'?96:20).map(p=>[...mapped(p),p[2]]);geo.coordinates=f.water.stations.map(p=>p.slice(0,2));for(const pool of f.water.pools??[])pool.center=mapped(pool.center);}
 else if(geo.type==='Point')geo.coordinates=mapped(geo.coordinates);
 else if(geo.type==='Polygon')geo.coordinates=geo.coordinates.map(r=>densify(r,64).map(mapped));
 else geo.coordinates=(f.route?geo.coordinates:densify(geo.coordinates,64)).map(mapped);
}
for(const c of g.constraints){if(c.points)c.points=c.points.map(mapped);if(c.point)c.point=mapped(c.point);}
for(const z of g.zones)if(z.selector.type==='polygon')z.selector.coordinates=densify(z.selector.coordinates,64).map(mapped);
for(const l of g.terrain.landforms)l.center=mapped(l.center);
for(const p of g.terrain.pads)p.center=mapped(p.center);
for(const r of g.terrain.sculpt.ribbons)r.points=r.points.map(mapped);
for(const v of g.terrain.viewpoints)v.point=mapped(v.point);
g.terrain.curvature={version:1,maximumComponentDisplacementM:13,minimumSampledJacobian:minimumJacobian,note:'Bounded authored deformation sampled along features; not a proof of injectivity everywhere. Named scene centres preserved. River corners rounded separately by at most 6 m in the brook and 18 m in the Withywindle.'};
g.decisions.push({id:'organic-water-and-route','decision':'Winding river and path centre-lines are co-deformed; confluences and water levels remain linked. Contextual western river fold repaired. The field is baked, not evaluated by the game.','sourceRefs':['old-forest-reconstruction-v1']});
writeFileSync(file,JSON.stringify(g,null,2)+'\n');console.log('Curved geography:',JSON.stringify(g.terrain.curvature));
