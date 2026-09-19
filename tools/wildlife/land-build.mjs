import {distance,transformAnchor} from '../../src/domain/wildlife/routes.ts';
import {cellId} from '../../src/domain/wildlife/ids.ts';
import {meshBlocksCylinder} from '../../src/domain/mesh-collision.ts';
export function landEpisode(config,scene,hash){
 const tree=config.tree?scene.catalog.get(config.tree.id):null;
 if(config.tree&&(!tree||tree.familyId!==config.tree.familyId||tree.assetVersion!==config.tree.assetVersion))throw Error('Incompatible land support');
 if(config.tree?.modelToAbsoluteXYZ?.some((v,i)=>Math.abs(v-tree.modelToAbsoluteXYZ[i])>1e-6))throw Error('Changed land support transform');
 if(config.species==='red-squirrel')for(const sample of [config.mount.at(-1),...config.climb]){
  const actual=transformAnchor(sample.anchor.point,sample.anchor.normal,tree.modelToAbsoluteXYZ);
  // A binding can never silently reuse an anchor after a tree transform changes.
  if(distance(actual.point,sample.point)>.025)throw Error('Stale land anchor');
 }
 const id=cellId(config.home.e,config.home.n),routes=[];
 function route(name,points,stages,to){
  let length=0;const samples=points.map((s,i)=>{if(i)length+=distance(points[i-1].point,s.point);return {point:s.point,normal:s.normal,distanceM:length};});
  const bounds={min:{},max:{}};for(const k of ['e','n','h']){bounds.min[k]=Math.min(...samples.map(s=>s.point[k]));bounds.max[k]=Math.max(...samples.map(s=>s.point[k]));}
  let atMs=0,lastD=0;const motion=stages.map(stage=>{const d=samples[stage.index].distanceM;atMs+=(d-lastD)/(stage.previousSpeed??1)*1000;lastD=d;return {atMs,distanceM:d,state:stage.state};});
  return {id:name,from:config.id,to,kind:config.species==='red-squirrel'?'climb':'ground',lengthM:length,samples,bounds,clearanceM:config.species==='red-squirrel'?.45:.95,maxSlopeDeg:config.species==='red-squirrel'?90:25,...(tree?{treeId:tree.id}:{}),motion};
 }
 if(config.species==='red-squirrel'){
  const points=[...config.ground,...config.mount,...config.climb],groundEnd=config.ground.length-1,mountEnd=groundEnd+config.mount.length;
  const mountLength=points.slice(groundEnd,mountEnd+1).reduce((d,s,i,a)=>d+(i?distance(a[i-1].point,s.point):0),0);
  routes.push(route(`${config.id}-escape`,points,[{index:0,state:'ground-bound'},{index:groundEnd,state:'mount',previousSpeed:.8},{index:mountEnd,state:'climb',previousSpeed:mountLength/.4},{index:points.length-1,state:'trunk-idle',previousSpeed:.35}],`${config.tree.id}-cover`));
 }else for(const corridor of config.corridors)for(const [mode,speed] of [['walk-away',.55],['flee',2]])routes.push(route(`${corridor.id}-${mode}`,corridor.samples,[{index:0,state:mode},{index:corridor.samples.length-1,state:'recover',previousSpeed:speed}],corridor.id));
 if(config.species==='red-squirrel')for(const sample of [...config.mount,...config.climb])if(scene.boxes.some(b=>b.id!==tree.id&&meshBlocksCylinder(b.collision,{x:sample.point.e,y:sample.point.h-.3,z:-sample.point.n},.55,.9)))throw Error('Another collider blocks the contact route');
 // The grounded segment must remain clear of every collider, including its support tree.
 for(const r of routes)for(const s of r.samples){if(config.species==='red-squirrel'&&s.distanceM>r.motion[1].distanceM)break;
  if(scene.boxes.some(b=>meshBlocksCylinder(b.collision,{x:s.point.e,y:s.point.h+.008,z:-s.point.n},r.clearanceM,config.species==='red-squirrel'?.65:1.35)))throw Error(`Blocked land corridor ${r.id}`);
 }
 const obstacles=scene.boxes.filter(b=>Math.hypot((b.min.x+b.max.x)/2-config.home.e,-(b.min.z+b.max.z)/2-config.home.n)<64).map(b=>({id:b.id,min:{e:b.min.x,n:-b.max.z,h:b.min.y},max:{e:b.max.x,n:-b.min.z,h:b.max.y}}));
 return {id,contentHash:hash,sites:[{id:config.id,cellId:id,species:config.species,home:config.home,...(tree?{treeId:tree.id}:{}),allowedRoutes:routes.map(r=>r.id),refuges:[...new Set(routes.map(r=>r.to))],maxResidents:1,tags:['candidate-episode']}],routes,obstacles,neighbors:[]};
}
