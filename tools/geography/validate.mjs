import {createGeography, nearestOnLine,pointInRing} from '../../src/domain/geography.mjs';
function hasCrossing(ring) {
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=1;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){
  const a=ring[i-1],b=ring[i],c=ring[j-1],d=ring[j];
  if(cross(a,b,c)*cross(a,b,d)<-1e-7&&cross(c,d,a)*cross(c,d,b)<-1e-7)return true;
 }return false;
}
export function validateGeography(g,sourceIds) {
  const errors=[],fail=(ok,s)=>{if(!ok)errors.push(s);};
  fail(g.schemaVersion===1,'Unsupported schemaVersion');
  fail(g.coordinateSystem?.units==='metres','Metres required');
  const b=g.bounds;fail([b.minE,b.minN,b.maxE,b.maxN].every(Number.isFinite)&&b.minE<b.maxE&&b.minN<b.maxN,'Invalid bounds');
  const ids=new Set(g.features.map(f=>f.id));fail(ids.size===g.features.length,'Duplicate feature IDs');
  function refs(x){if(!x||typeof x!=='object')return;if(x.sourceRefs){fail(x.sourceRefs.length>0,'Empty sourceRefs');for(const id of x.sourceRefs)fail(sourceIds.has(id),'Unknown source: '+id);}for(const v of Object.values(x))refs(v);}
  refs(g);
  const zoneIds=new Set(g.zones.map(z=>z.id));fail(zoneIds.size===g.zones.length,'Duplicate zone IDs');
  for(const item of [...g.features,...g.zones]){
    const d=item.dressing;
    fail(d&&['terrain','moisture','vegetation'].every(k=>typeof d[k]==='string'&&d[k].trim().length>0),'Missing dressing tags '+item.id);
    fail(Array.isArray(d?.details)&&d.details.length>0&&d.details.every(s=>typeof s==='string'&&s.trim().length>0),'Missing dressing details '+item.id);
    fail(d?.provenance?.status==='authored'&&d.provenance.sourceRefs?.length>0,'Dressing must remain an authored specification '+item.id);
  }
  for(const f of g.features){
    fail(['canonical','inferred','authored'].includes(f.existence.status),'Invalid existence '+f.id);
    fail(['inferred','authored'].includes(f.geometryProvenance.status),'Numeric geometry must remain reconstructed: '+f.id);
    fail(Number.isFinite(f.geometryProvenance.uncertaintyM)&&f.geometryProvenance.uncertaintyM>=0,'Invalid uncertainty '+f.id);
    const t=f.geometry.type,p=f.geometry.coordinates;
    fail(['Point','LineString','Polygon'].includes(t),'Invalid geometry '+f.id);
    const points=t==='Point'?[p]:t==='Polygon'?p.flat():p;
    fail(points.every(v=>v.length===2&&v.every(Number.isFinite)&&v[0]>=b.minE&&v[0]<=b.maxE&&v[1]>=b.minN&&v[1]<=b.maxN),'Invalid coordinates '+f.id);
    if(t==='Polygon')for(const ring of p)fail(ring.length>=4&&JSON.stringify(ring[0])===JSON.stringify(ring.at(-1)),'Unclosed polygon '+f.id);
    if(t==='Polygon')for(const ring of p)fail(!hasCrossing(ring),'Self-intersection '+f.id);
    if(t==='LineString')fail(p.length>=2&&p.every((v,i)=>!i||v[0]!==p[i-1][0]||v[1]!==p[i-1][1]),'Degenerate line '+f.id);
    if(f.water){const w=f.water;fail(w.stations.length===p.length&&w.stations.every((s,i)=>s.length===3&&s.every(Number.isFinite)&&s[0]===p[i][0]&&s[1]===p[i][1]),'Station mismatch '+f.id);fail(w.stations.every((s,i)=>!i||s[2]<=w.stations[i-1][2]),'River rises downstream '+f.id);fail(w.widthM>0&&w.depthM>0,'Invalid water dimensions '+f.id);}
    if(f.route)for(const id of f.route.checkpointIds)fail(ids.has(id),'Unknown checkpoint '+id);
    if(f.route?.surface){const v=f.route.surface;
      fail(v.halfWidthM>0&&v.blendM>0,'Invalid surface widths '+f.id);
      fail(Array.isArray(v.stations)&&v.stations.length===p.length&&v.stations.every((q,i)=>q.length===3&&q.every(Number.isFinite)&&q[0]===p[i][0]&&q[1]===p[i][1]),'Invalid surface stations '+f.id);
    }

  }
  if(errors.length)return errors;
  const m=createGeography(g),get=id=>m.features.get(id),point=id=>get(id).geometry.coordinates;
  for(const f of g.features.filter(f=>f.water?.confluence)){
    const parent=get(f.water.confluence);if(!parent?.water){errors.push('Missing parent river '+f.id);continue;}
    const s=f.water.stations.at(-1),p=nearestOnLine(s[0],s[1],parent.water.stations);
    fail(p.distance<0.01&&Math.abs(p.h-s[2])<0.01,'Disconnected confluence '+f.id);
    let node=f,seen=new Set();while(node?.water?.confluence){fail(!seen.has(node.id),'Drainage cycle '+f.id);if(seen.has(node.id))break;seen.add(node.id);node=get(node.water.confluence);}
  }
  for(const c of g.constraints){
    if(c.a&&!ids.has(c.a)||c.b&&!ids.has(c.b)){errors.push('Unknown constraint feature '+c.id);continue;}
    let ok=false;
    if(c.type==='northOf')ok=point(c.a)[1]>point(c.b)[1];
    if(c.type==='eastOf')ok=point(c.a)[0]>point(c.b)[0];
    if(c.type==='higherThan')ok=m.height(...point(c.a))-m.height(...point(c.b))>=c.minM;
    if(c.type==='nearWater')ok=nearestOnLine(...point(c.a),get(c.b).water.stations).distance<=c.maxM;
    if(c.type==='distanceRange'){const p=point(c.a),d=Math.hypot(p[0]-c.point[0],p[1]-c.point[1]);ok=d>=c.rangeM[0]&&d<=c.rangeM[1];}
    if(c.type==='outside')ok=!pointInRing(...point(c.a),get(c.b).geometry.coordinates[0]);
    if(c.type==='profileDip'){const h=c.points.map(p=>m.height(...p));ok=h[0]-h[1]>=c.minM&&h[2]-h[1]>=c.minM;}
    fail(ok,'Constraint failed '+c.id);
  }
  for(const f of g.features.filter(f=>f.route)){
    let last=-1;
    for(const id of f.route.checkpointIds){const n=nearestOnLine(...point(id),f.geometry.coordinates);fail(n.distance<30,'Route misses '+id);fail(n.segment+n.t>=last,'Route order wrong '+id);last=n.segment+n.t;}
  }
  return errors;
}
