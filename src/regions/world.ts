import type {Scene} from '@babylonjs/core/scene.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {WorldData} from '../world/data.ts';
import {Library} from '../world/library.ts';
import {Terrain} from '../world/terrain.ts';
import {Trees} from '../world/trees.ts';
import {Floor} from '../world/floor.ts';
import {RegionHorizon} from './horizon.ts';
import {RegionAssets} from './assets.ts';
import {Props} from '../world/props.ts';
import type {WindSystem} from '../runtime/wind.ts';
import {createRegionWater} from './water.ts';
import {requestLandscapeAround} from '../world/request-around.ts';
import {originFor,tileKey} from '../world/math.ts';
import {FrameWorkBudget,prepareUntil} from '../runtime/startup.ts';
import type {EN} from '../world/schema.ts';

/** Regional composition around shared streaming classes; no old-forest objects. */
export class RegionWorld {
 origin:EN={e:0,n:0};last='';rebases=0;destination:EN|undefined;
 waterState='normal';
 assets=new RegionAssets(this);
 setWater(state:string){this.waterState=state;this.water.setLevel(this.data.geo.source.states.waterLevelsM[state]);this.floor.invalidate();}
 terrain:Terrain;trees:Trees;floor:Floor;horizon:RegionHorizon;props:Props;
 onRebase:((origin:EN)=>void)[]=[];
 constructor(public data:WorldData,public library:Library,public scene:Scene,public water:Awaited<ReturnType<typeof createRegionWater>>){
  this.terrain=new Terrain(scene,data);this.terrain.createFar();this.trees=new Trees(scene,data,library);
  this.props=new Props(scene,data,library,this.terrain);
  this.floor=new Floor(scene,data,this.terrain,(e,n)=>this.trees.blocked(e,n)||this.props.blocked(e,n)||data.geo.coverExclusion(e,n)||(data.geo.waterAt(e,n,this.waterState)?.depth??0)>.02,library.wind);this.horizon=new RegionHorizon(scene,data,library);
  scene.onDisposeObservable.add(()=>data.dispose());
 }
 static async create(scene:Scene,sun:DirectionalLight,wind?:WindSystem){const data=await new WorldData({baseUrl:'regions/brandywine-bridge/world/',cacheNamespace:'brandywine-bridge-',geographyKind:'brandywine'}).init();let world:RegionWorld|undefined;const library=await new Library(scene,data,sun,wind,()=>world?.origin??{e:0,n:0}).init();world=new RegionWorld(data,library,scene,await createRegionWater(scene,data));await world.assets.init();return world;}
 update(p:EN,eye:{e:number;n:number;h:number},h:number,dt:number){
  if(Math.hypot(p.e-this.origin.e,p.n-this.origin.n)>1024){this.origin=originFor(p);this.rebases++;for(const part of [this.terrain,this.trees,this.floor,this.horizon,this.props,this.water])part.rebase(this.origin);this.onRebase.forEach(f=>f(this.origin));}
  const key=tileKey(p.e,p.n,128);if(key!==this.last){this.last=key;requestLandscapeAround(this.data,this.terrain,p);this.data.evict(p,this.destination);}
  const budget=new FrameWorkBudget();
  this.terrain.keep=this.destination;this.terrain.update(p,eye,h+.85,budget);
  this.trees.update(p,new Vector3(eye.e-this.origin.e,eye.h,this.origin.n-eye.n),h,dt,budget);
  this.floor.update(p,budget);this.water.update(dt);this.horizon.update(p,budget);this.props.update(p,budget);
  return budget;
 }
 async prepare(p:EN){
  this.destination=p;this.terrain.keep=p;
  try {await this.data.load(tileKey(p.e,p.n));requestLandscapeAround(this.data,this.terrain,p);
   await prepareUntil(()=>this.terrain.ready(p),()=>{this.terrain.update(p,{...p,h:this.data.height(p.e,p.n)+3},this.data.height(p.e,p.n));});
  }finally{this.destination=undefined;}
 }
 stats(){return {...this.data.stats(),terrain:this.terrain.stats(),trees:this.trees.stats(),origin:this.origin,rebases:this.rebases};}
}
