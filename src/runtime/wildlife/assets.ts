import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {GLTFLoaderAnimationStartMode} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AssetContainer} from '@babylonjs/core/assetContainer.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
export interface BirdArt {id:'woodland-bird';clips:Record<string,{duration:number;loop:boolean}>;lods:{level:number;file:string;sha256:string}[];}
export async function fetchBirdArt():Promise<BirdArt|null>{
 const response=await fetch(`${import.meta.env.BASE_URL}wildlife/assets.json`);if(!response.ok)throw Error('Не загрузился манифест птицы');
 const manifest=await response.json();if(manifest.status==='test-only')return null;
 const art=manifest.species?.find((s:BirdArt)=>s.id==='woodland-bird');if(manifest.v!==1||!art||art.lods?.length!==3||art.lods.some((l:BirdArt['lods'][number],i:number)=>l.level!==i||!/^woodland-bird\/lod[0-2]\.glb$/.test(l.file)||!/^[a-f0-9]{64}$/.test(l.sha256)))throw Error('Некорректный манифест птицы');
 for(const name of ['perch_idle','alert','takeoff','fly_loop'])if(!(art.clips[name]?.duration>0))throw Error('Отсутствует клип птицы');return art;
}
/** Scene-owned templates; at most two loads, instances attach only in the shared frame budget. */
export function createBirdLibrary(scene:Scene,art:BirdArt,attachMaterial:(m:Material)=>void){
 const ready=new Map<number,AssetContainer>(),requested=new Set<number>(),queue:number[]=[],errors=new Map<number,string>();let active=0,disposed=false;
 function pump(){
  while(!disposed&&active<2&&queue.length){const lod=queue.shift()!;active++;const spec=art.lods[lod];
   void LoadAssetContainerAsync(`${import.meta.env.BASE_URL}wildlife/${spec.file}?v=${spec.sha256}`,scene,{pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}}).then(asset=>{
    if(disposed||scene.isDisposed){asset.dispose();return;}
    if(!['perch_idle','alert','takeoff','fly_loop'].every(name=>asset.animationGroups.some(g=>g.name===name))){asset.dispose();throw Error('Птица: неполные анимации');}
    for(const m of asset.materials)attachMaterial(m);ready.set(lod,asset);
   }).catch(()=>{if(!disposed)errors.set(lod,'Не удалось загрузить модель птицы');}).finally(()=>{active--;pump();});
  }
 }
 return {art,request(lod:number){if(disposed||requested.has(lod))return;requested.add(lod);queue.push(lod);pump();},get:(lod:number)=>ready.get(lod),failed:(lod:number)=>errors.has(lod),stats:()=>({assetLoads:active,assetTemplates:ready.size,assetErrors:[...errors.values()]}),dispose(){if(disposed)return;disposed=true;queue.length=0;for(const asset of ready.values())asset.dispose();ready.clear();}};
}
