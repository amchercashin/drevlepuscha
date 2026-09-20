import {previewHeight, previewWater, nearestStation, smooth, distance, reliefNoise} from './authoring-core.mjs';
import {pointInRing, nearestOnLine} from '../geography.mjs';
import {REGION_BUILDINGS} from './objects.mjs';

/** Local region geometry, with actual authored IDs and no old-forest placeholders. */
export function regionGeography(source) {
  const zones=source.forests.map(f=>({id:f.id,name:f.name,tint:f.biome==='riparian'?[.32,.43,.29]:[.37,.42,.27],rules:{treeDensityPerM2:f.treeDensityPerM2,understoryCover:.6,deadwoodFraction:.12},speciesWeights:['oak','fork','young','conifer','willow'].map(k=>f.speciesWeights[k]??0)}));
  zones.push({id:'tributary-hills',name:'Лесистые склоны притока',tint:[.37,.44,.28],rules:{treeDensityPerM2:[.001,.0025],understoryCover:.6,deadwoodFraction:.12},speciesWeights:[.35,.25,.35,0,.05]});
  zones.push({id:'orchard',name:'Сад Бакленда',tint:[.45,.48,.28],rules:{treeDensityPerM2:[.001,.0015],understoryCover:.3,deadwoodFraction:0},speciesWeights:[0,0,1,0,0]});
  zones.push({id:'fields',name:'Поля и луга',tint:[.5,.52,.32],rules:{treeDensityPerM2:[.00003,.00006],understoryCover:.25,deadwoodFraction:0},speciesWeights:[.75,.10,.15,0,0]});
  return {regionSource:source,worldSeed:source.worldSeed,bounds:source.playBounds,zones,
    features:source.rivers.map(r=>({id:r.id,geometry:{type:'LineString',coordinates:r.stations.map(p=>p.slice(0,2))},water:{...r,widthM:r.stations[0][3]}}))};
}

export function createBrandywineGeography(g) {
  const s=g.regionSource;
  // Extend only the terminal directions into storage padding. Authored in-bounds axes stay fixed.
  const padded=structuredClone(s);
  for(const river of padded.rivers){
    river.chainageOffsetM=-800;
    for(const end of [0,1]){
      if(end===1&&river.id==='the-water')continue;
      const list=river.stations,a=end?list.at(-1):list[0],b=end?list.at(-2):list[1];
      const len=distance(a,b),p=[a[0]+(a[0]-b[0])/len*800,a[1]+(a[1]-b[1])/len*800,a[2]+(a[2]-b[2])/len*800,a[3],a[4]];
      end?list.push(p):list.unshift(p);
    }
  }
  const bridges=s.topology.crossings.filter(c=>c.kind==='bridge').map(c=>{
    const edge=s.topology.edges.find(e=>e.crossingId===c.id);
    return {...c,points:edge.points,widthM:c.id==='main-bridge'?6:2.4};
  });
  // Ramps are earthwork only outside the wet channel; decks remain separate support surfaces.
  const ramps=bridges.flatMap(b=>[0,1].map(end=>{
    const a=end?b.points.at(-1):b.points[0],other=end?b.points[0]:b.points.at(-1),len=distance(a,other),run=b.id==='main-bridge'?110:38;
    return {a,b:[a[0]+(a[0]-other[0])/len*run,a[1]+(a[1]-other[1])/len*run],height:b.deckHeightM,width:b.widthM/2+2};
  }));
  function height(e,n){
    let h=previewHeight(padded,e,n);
    for(const ramp of ramps){
      const q=nearestOnLine(e,n,[ramp.a,ramp.b]);
      if(q.distance>ramp.width+9||(previewWater(padded,e,n)?.depth??0)>.01)continue;
      const target=ramp.height+(previewHeight(padded,...ramp.b)-ramp.height)*smooth(q.t);
      h+=(Math.max(h,target)-h)*(1-smooth((q.distance-ramp.width)/9));
    }
    return h;
  }
  // Matches production Float32 tiles, including halo samples beyond the resident tile.
  function surfaceHeight(e,n){const E=Math.floor(e/2)*2,N=Math.floor(n/2)*2,u=(e-E)/2,v=(n-N)/2,a=Math.fround(height(E,N)),b=Math.fround(height(E+2,N)),c=Math.fround(height(E,N+2)),d=Math.fround(height(E+2,N+2));return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);}
  const zoneAt=(e,n)=>{
    const authored=s.forests.findIndex(f=>pointInRing(e,n,f.polygon));if(authored>=0)return g.zones[authored];
    if(Math.hypot((e-850)/160,(n+800)/190)<1)return g.zones.find(z=>z.id==='orchard');
    if(e< -400&&n>1050&&n<2100){const q=nearestStation(e,n,padded.rivers.find(r=>r.id==='the-water').stations);if(q.distance>55&&q.distance<310&&reliefNoise(e,n,160,s.worldSeed)>.05)return g.zones.find(z=>z.id==='tributary-hills');}
    return g.zones.at(-1);
  };
  const nearbyWater=(e,n)=>padded.rivers.map(r=>{const q=nearestStation(e,n,r.stations);return {...q,h:q.level,feature:{id:r.id,water:{...r,widthM:q.width}}};});
  const exclusion=(e,n)=>nearbyWater(e,n).some(q=>q.distance<q.width/2+9)||REGION_BUILDINGS.some(b=>Math.abs(e-b.e)<b.width/2+8&&Math.abs(n-b.n)<b.depth/2+8)||s.pois.some(p=>distance(p.point,[e,n])<(p.id==='INN'?30:12))||s.hedges.some(h=>nearestOnLine(e,n,h.points).distance<h.widthM/2+4);
  return {height,surfaceHeight,zoneAt,nearbyWater,exclusion,bridges,source:s,padded,ramps,
    waterAt:(e,n,state='normal')=>{const near=nearbyWater(e,n).filter(q=>q.distance<=q.width/2+64);if(!near.length)return null;const level=Math.max(...near.map(q=>q.level))+s.states.waterLevelsM[state],depth=level-surfaceHeight(e,n);return depth>=0?{level,depth,bodies:near.map(q=>q.feature.id)}:null;},
    forestAt:(e,n)=>zoneAt(e,n).id!=='fields'};
}
