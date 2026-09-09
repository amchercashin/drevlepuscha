/** Renderer-independent geography sampling. All distances/heights in metres ENU. */
export const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
export const smooth = x => { x=clamp(x); return x*x*(3-2*x); };
export function pointInRing(e,n,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [x,y]=ring[i], [u,v]=ring[j];
    if((y>n)!==(v>n) && e<(u-x)*(n-y)/(v-y)+x) inside=!inside;
  } return inside;
}
export function nearestOnLine(e,n,points) {
  let best={distance:Infinity,segment:0,t:0,e:0,n:0,h:0};
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=clamp(((e-a[0])*dx+(n-a[1])*dy)/(dx*dx+dy*dy));
    const x=a[0]+dx*t,y=a[1]+dy*t,d=Math.hypot(e-x,n-y);
    if(d<best.distance) best={distance:d,segment:i,t,e:x,n:y,h:(a[2]??0)+((b[2]??0)-(a[2]??0))*t};
  } return best;
}
export function hash01(e,n,seed=0) {
  let x=Math.imul(e|0,374761393)^Math.imul(n|0,668265263)^(seed|0);
  x=Math.imul(x^(x>>>13),1274126177); return ((x^(x>>>16))>>>0)/4294967296;
}
function noise(e,n,scale,seed) {
  const x=e/scale,y=n/scale,ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
  const a=hash01(ix,iy,seed),b=hash01(ix+1,iy,seed),c=hash01(ix,iy+1,seed),d=hash01(ix+1,iy+1,seed);
  return 2*((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v)-1;
}
/** Small spatial bins make offline raster generation bounded per sample. */
function makeIndex(features,marginFor) {
  const bins=new Map(),size=1024;
  for(const f of features) {
    const pts=f.water?.stations??f.geometry.coordinates,m=marginFor(f);
    for(let i=0;i<pts.length-1;i++) {
      const a=pts[i],b=pts[i+1];
      for(let x=Math.floor((Math.min(a[0],b[0])-m)/size);x<=Math.floor((Math.max(a[0],b[0])+m)/size);x++)
        for(let y=Math.floor((Math.min(a[1],b[1])-m)/size);y<=Math.floor((Math.max(a[1],b[1])+m)/size);y++) {
          const k=x+','+y;if(!bins.has(k)) bins.set(k,[]);bins.get(k).push({f,a,b,i});
        }
    }
  }
  return (e,n)=>bins.get(Math.floor(e/size)+','+Math.floor(n/size))??[];
}
function segmentNearest(e,n,s) {
  const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=clamp(((e-s.a[0])*dx+(n-s.a[1])*dy)/(dx*dx+dy*dy));
  const x=s.a[0]+t*dx,y=s.a[1]+t*dy;
  return {distance:Math.hypot(e-x,n-y),h:(s.a[2]??0)+t*((s.b[2]??0)-(s.a[2]??0)),t};
}
export function createGeography(g) {
  const features=new Map(g.features.map(f=>[f.id,f]));
  const waters=g.features.filter(f=>f.water), routes=g.features.filter(f=>f.route);
  const waterIndex=makeIndex(waters,f=>f.water.floodplainHalfWidthM+f.water.blendWidthM);
  const routeIndex=makeIndex(routes,()=>20), forest=features.get('forest_boundary').geometry.coordinates[0];
  const zones=[...g.zones].sort((a,b)=>b.priority-a.priority);
  function nearbyWater(e,n) {
    const found=new Map();
    for(const s of waterIndex(e,n)) {
      const p=segmentNearest(e,n,s),old=found.get(s.f.id);
      if(!old||p.distance<old.distance)found.set(s.f.id,{...p,feature:s.f});
    } return [...found.values()];
  }
  function naturalHeight(e,n) {
    const t=g.terrain;let h=t.basePlane.h0+e*t.basePlane.eSlope+n*t.basePlane.nSlope;
    for(const l of t.landforms) {
      let x=(e-l.center[0])/l.radiusM[0],y=(n-l.center[1])/l.radiusM[1];
      if(l.id==='bald-hill-rise') {const asymmetry=1+0.45*smooth(x)*smooth(-y);x*=asymmetry;y*=asymmetry;}
      const q=x*x+y*y;if(q<18)h+=l.amplitudeM*Math.exp(-q);
    }
    for(let i=0;i<t.noise.amplitudesM.length;i++) h+=t.noise.amplitudesM[i]*noise(e,n,t.noise.wavelengthsM[i],g.worldSeed+i*101);
    return h;
  }
  function height(e,n) {
    let h=naturalHeight(e,n),core=null;
    for(const p of nearbyWater(e,n)) {
      const w=p.feature.water,d=p.distance;
      let width=w.widthM,depth=w.depthM;
      for(const pool of w.pools??[]) {const a=1-smooth(Math.hypot(e-pool.center[0],n-pool.center[1])/pool.radiusM);width+=(pool.widthM-w.widthM)*a;depth+=(pool.depthM-w.depthM)*a;}
      const half=width/2;
      if(d<=half+6) {
        const bank=smooth((d-half)/6);
        const bed=p.h-depth*(1-Math.pow(clamp(d/half),2));
        const target=d<=half?bed:p.h+w.bankHeightM*bank;
        if(!core||d/(half+6)<core.rank)core={h:target,rank:d/(half+6)};
      } else if(d<w.floodplainHalfWidthM+w.blendWidthM) {
        const floor=p.h+w.bankHeightM+0.003*Math.max(0,d-half-6);
        const influence=1-smooth((d-w.floodplainHalfWidthM)/w.blendWidthM);
        h=Math.min(h,h+(floor-h)*influence);
      }
    }
    if(core)h=core.h;
    else for(const pad of g.terrain.pads??[]) {
      const d=Math.hypot(e-pad.center[0],n-pad.center[1]);
      h+=(pad.h-h)*(1-smooth((d-pad.radiusM)/pad.blendM));
    }
    // Track depressions are local, and cannot lower river beds or banks.
    if(!core) {
      let cut=0;
      for(const s of routeIndex(e,n)) {
        const r=s.f.route;if(!r.cutSegments.some(([a,b])=>s.i>=a&&s.i<b))continue;
        const p=segmentNearest(e,n,s),width=r.widthM/2;
        const hollow=(r.hollowSegments??[]).some(([a,b])=>s.i>=a&&s.i<b)?r.hollowDepthM*(1-smooth(p.distance/r.hollowHalfWidthM)):0;
        cut=Math.max(cut,hollow+r.cutDepthM*(1-smooth((p.distance-width)/4)));
      }h-=cut;
    }
    return h;
  }
  const slope=(e,n,step=2)=>Math.atan(Math.hypot((height(e+step,n)-height(e-step,n))/(2*step),(height(e,n+step)-height(e,n-step))/(2*step)))*180/Math.PI;
  function zoneAt(e,n) {
    if(!pointInRing(e,n,forest))return null;
    const near=nearbyWater(e,n);
    for(const z of zones) {
      const s=z.selector;
      if(s.type==='forest'||(s.type==='polygon'&&pointInRing(e,n,s.coordinates)))return z;
      if(s.type==='water-buffer'&&near.some(p=>p.feature.id===s.featureId&&p.distance<s.halfWidthM))return z;
      if(s.type==='brook-buffer'&&near.some(p=>p.feature.kind==='brook'&&p.distance<s.halfWidthM))return z;
      if(s.type==='point-ring') {const p=features.get(s.featureId).geometry.coordinates,d=Math.hypot(e-p[0],n-p[1]);if(d>=s.innerM&&d<s.outerM)return z;}
      if(s.type==='slope') {const a=slope(e,n);if(a>=s.minDegrees&&a<s.maxDegrees)return z;}
    }return null;
  }
  function exclusion(e,n) {
    if(!pointInRing(e,n,forest))return 'outside-forest';
    for(const p of nearbyWater(e,n))if(p.distance<p.feature.placement.reserveM)return p.feature.id;
    for(const id of g.placementPolicy.pointExceptions) {
      const f=features.get(id),p=f.geometry.coordinates;if(Math.hypot(e-p[0],n-p[1])<f.placement.reserveM)return id;
    }
    for(const s of routeIndex(e,n))if(segmentNearest(e,n,s).distance<s.f.placement.reserveM)return s.f.id;
    // Western arrival is explicitly root-dominated with little understory.
    return null;
  }
  return {height,naturalHeight,slope,zoneAt,exclusion,nearbyWater,features};
}
/** Bilinear read of SOUTH-first raster, inclusive end nodes, no out-of-range clamping. */
export function sampleRaster(grid,e,n) {
  const x=(e-grid.origin[0])/grid.stepM,y=(n-grid.origin[1])/grid.stepM;
  if(x<0||y<0||x>grid.columns-1||y>grid.rows-1)throw new RangeError('Outside raster');
  const i=Math.min(Math.floor(x),grid.columns-2),j=Math.min(Math.floor(y),grid.rows-2),u=x-i,v=y-j;
  const a=grid.values[j*grid.columns+i],b=grid.values[j*grid.columns+i+1],c=grid.values[(j+1)*grid.columns+i],d=grid.values[(j+1)*grid.columns+i+1];
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}

/** Stable ASCII key; integer cell indices (including negative), never traversal order. */
export function placementSeed(worldSeed,zoneId,cellE,cellN,candidateIndex) {
  if(![worldSeed,cellE,cellN,candidateIndex].every(Number.isInteger)||candidateIndex<0||!/^[-a-z0-9_]+$/.test(zoneId))throw new Error('Invalid placement key');
  let hash=2166136261;for(const c of `${worldSeed}/${zoneId}/${cellE}/${cellN}/${candidateIndex}`)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  return hash;
}
