import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {GLTFLoaderAnimationStartMode} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AssetContainer} from '@babylonjs/core/assetContainer.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
export interface AnimalArt {id:import('../../domain/wildlife/types.ts').SpeciesId;footOffsetM:number;clips:Record<string,{duration:number;loop:boolean;nominalSpeedMps?:number}>;lods:{level:number;file:string;sha256:string}[];}
export async function fetchWildlifeArt():Promise<AnimalArt[]|null>{
 const response=await fetch(`${import.meta.env.BASE_URL}wildlife/assets.json`);if(!response.ok)throw Error('Не загрузился манифест фауны');
 const manifest=await response.json();if(manifest.status==='test-only')return null;
 if(manifest.v!==1||!Array.isArray(manifest.species))throw Error('Некорректный манифест фауны');
 for(const art of manifest.species as AnimalArt[]){
  if(!['woodland-bird','red-squirrel','roe-deer'].includes(art.id)||art.lods?.length!==3||!Number.isFinite(art.footOffsetM)||art.lods.some((l,i)=>l.level!==i||l.file!==`${art.id}/lod${i}.glb`||!/^[a-f0-9]{64}$/.test(l.sha256)))throw Error('Некорректный ассет фауны');
  if(!Object.values(art.clips).every(c=>c.duration>0))throw Error('Некорректный клип');
 }
 return manifest.species;
}
/** Scene-owned templates; at most two loads, instances attach only in the shared frame budget. */
export function createAnimalLibrary(scene:Scene,arts:AnimalArt[],attachMaterial:(m:Material)=>void){
 const ready=new Map<string,AssetContainer>(),requested=new Set<string>(),queue:string[]=[],errors=new Map<string,string>();let active=0,disposed=false;
 function pump(){
  while(!disposed&&active<2&&queue.length){const key=queue.shift()!;active++;const [species,level]=key.split('/'),art=arts.find(a=>a.id===species)!,spec=art.lods[Number(level)];
   void LoadAssetContainerAsync(`${import.meta.env.BASE_URL}wildlife/${spec.file}?v=${spec.sha256}`,scene,{pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}}).then(asset=>{
    if(disposed||scene.isDisposed){asset.dispose();return;}
    if(!Object.keys(art.clips).every(name=>asset.animationGroups.some(g=>g.name===name))){asset.dispose();throw Error('Неполные анимации животного');}
    for(const m of asset.materials)attachMaterial(m);ready.set(key,asset);
   }).catch(()=>{if(!disposed)errors.set(key,'Не удалось загрузить модель животного');}).finally(()=>{active--;pump();});
  }
 }
 return {arts,request(species:string,lod:number){const key=`${species}/${lod}`;if(disposed||requested.has(key))return;requested.add(key);queue.push(key);pump();},get:(species:string,lod:number)=>ready.get(`${species}/${lod}`),failed:(species:string,lod:number)=>errors.has(`${species}/${lod}`),stats:()=>({assetLoads:active,assetTemplates:ready.size,assetErrors:[...errors.values()]}),dispose(){if(disposed)return;disposed=true;queue.length=0;for(const asset of ready.values())asset.dispose();ready.clear();}};
}
