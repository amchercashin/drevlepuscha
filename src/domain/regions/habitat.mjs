import {hash01} from '../geography.mjs';
import {barrierAt} from './traversal.mjs';
/** Habitat and escape routes are derived from regional terrain, never showcase coordinates. */
export function regionalHabitat(geo,contentHash){
 const cells=[],b=geo.source.playBounds;
 for(let cy=Math.floor(b.minN/256);cy<Math.ceil(b.maxN/256);cy++)for(let cx=Math.floor(b.minE/256);cx<Math.ceil(b.maxE/256);cx++){
  const cell={id:`habitat/${cx}/${cy}`,contentHash,sites:[],routes:[],neighbors:[],obstacles:[]};
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
   const e=cx*256+x*64+32,n=cy*256+y*64+32,forest=geo.forestAt(e,n);
   if(e<b.minE+30||e>b.maxE-30||n<b.minN+30||n>b.maxN-30||hash01(e,n,810)> (forest?.7:.035)||geo.exclusion(e,n))continue;
   const species=forest?['woodland-bird','red-squirrel','roe-deer'][Math.floor(hash01(e,n,811)*3)]:'woodland-bird',id=`${cell.id}/${x}/${y}`,home={e,n,h:geo.height(e,n)+(species==='woodland-bird'?.12:0)},routes=[];
   for(let direction=0;direction<4;direction++){
    const angle=direction*Math.PI/2+hash01(e,n,812)*Math.PI/2,length=species==='woodland-bird'?24:16,points=[home];let safe=true,maxSlope=0;
    for(let d=1;d<=length;d++){
     const E=e+Math.sin(angle)*d,N=n+Math.cos(angle)*d,ground=geo.height(E,N),previous=points.at(-1);
     const h=species==='woodland-bird'?Math.max(home.h+Math.min(d,5)*.8,ground+Math.min(d,5)*.8):ground;
     maxSlope=Math.max(maxSlope,Math.atan2(Math.abs(h-previous.h),1)*180/Math.PI);
     if(barrierAt(geo,E,N,false)||(species!=='woodland-bird'&&((geo.waterAt(E,N)?.depth??0)>.02||maxSlope>30))){safe=false;break;}
     points.push({e:E,n:N,h});
    }
    if(!safe)continue;
    let lengthM=0;const samples=points.map((p,i)=>{if(i){const a=points[i-1];lengthM+=Math.hypot(p.e-a.e,p.n-a.n,p.h-a.h);}return {distanceM:lengthM,point:p,normal:[0,0,1]};});
    const route={id:`${id}/escape${direction}`,kind:species==='woodland-bird'?'flight':'ground',from:id,to:`${id}/refuge${direction}`,lengthM,samples,bounds:{min:{e:Math.min(...points.map(p=>p.e)),n:Math.min(...points.map(p=>p.n)),h:Math.min(...points.map(p=>p.h))},max:{e:Math.max(...points.map(p=>p.e)),n:Math.max(...points.map(p=>p.n)),h:Math.max(...points.map(p=>p.h))}},clearanceM:.35,maxSlopeDeg:maxSlope};
    if(species!=='woodland-bird')route.motion=[{atMs:0,distanceM:0,state:species==='roe-deer'?'walk-away':'ground-bound'},{atMs:lengthM/(species==='roe-deer'?.9:2)*1000,distanceM:lengthM,state:species==='roe-deer'?'recover':'ground-bound'}];
    routes.push(route);
    if(species==='roe-deer')routes.push({...route,id:route.id+'/flee',motion:[{atMs:0,distanceM:0,state:'flee'},{atMs:lengthM/4*1000,distanceM:lengthM,state:'recover'}]});
   }
   if(!routes.length)continue;
   cell.sites.push({id,cellId:cell.id,species,home,maxResidents:1,allowedRoutes:routes.map(r=>r.id),refuges:[...new Set(routes.map(r=>r.to))],tags:[forest?'woodland-floor':'meadow']});cell.routes.push(...routes);
  }if(cell.sites.length)cells.push(cell);
 }
 return cells;
}
