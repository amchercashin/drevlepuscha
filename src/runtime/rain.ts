import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {SkyQuality} from '../domain/sky.ts';
import {rainDrop,rainDropIndices,rainTiles,RAIN_TILE_SIZE,RAIN_PERIOD,RAIN_SEED} from '../domain/rain.ts';
import {rainVertex,rainFragment} from './rain.wgsl.ts';

ShaderStore.ShadersStoreWGSL.showcaseRainVertexShader=rainVertex;
ShaderStore.ShadersStoreWGSL.showcaseRainPixelShader=rainFragment;
type RainSurface={groundHeightAt:(x:number,z:number)=>number;shelterHeightAt?:(x:number,z:number)=>number|null;origin?:()=>{x:number;z:number}};
export function createRain(scene:Scene,surface:RainSurface){
 const mesh=new Mesh('showcase-rain',scene),data=new VertexData();
 data.positions=[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0];data.indices=[0,1,2,0,2,3];data.applyToMesh(mesh);
 mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={environment:true};mesh.setEnabled(false);
 const material=new ShaderMaterial('showcase-rain',scene,{vertex:'showcaseRain',fragment:'showcaseRain'},
  {attributes:['position','rainColumn','rainMotion'],uniforms:['viewProjection','eye','cameraRight','rainTime','precipitation','rainColour','fogDensity'],needAlphaBlending:true,shaderLanguage:ShaderLanguage.WGSL});
 material.backFaceCulling=false;material.disableDepthWrite=true;material.fogEnabled=false;mesh.material=material;
 const right=new Vector3(),colour=new Vector3();let seconds=0,quality:SkyQuality=2,precipitation=0,lastTile='',disposed=false,instances=0;
 function rebuild(x:number,z:number){
  const indices=rainDropIndices(quality),tiles=rainTiles(x,z);instances=tiles.length*indices.length;
  const matrices=new Float32Array(instances*16),columns=new Float32Array(instances*4),motions=new Float32Array(instances*4);
  let i=0;
  for(const [tx,tz] of tiles)for(const index of indices){
   const d=rainDrop(tx,tz,index),o=surface.origin?.()??{x:0,z:0},x=d.x-o.x,z=d.z-o.z,ground=surface.groundHeightAt(x,z),shelter=surface.shelterHeightAt?.(x,z);
   columns.set([x,z,ground,Math.max(ground+.02,shelter??ground)],i*4);motions.set([d.phase,d.harmonic,d.length,d.threshold],i*4);
   matrices[i*16]=matrices[i*16+5]=matrices[i*16+10]=matrices[i*16+15]=1;
   i++;
  }
  mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceSetBuffer('rainColumn',columns,4,true);mesh.thinInstanceSetBuffer('rainMotion',motions,4,true);
 }
 function update(dt:number,cameraPosition:Vector3,amount:number,daylight:number){
  if(disposed)return;
  seconds=(seconds+(Number.isFinite(dt)&&dt>0?Math.min(dt,.05):0))%RAIN_PERIOD;
  precipitation=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;
  mesh.setEnabled(precipitation>0.0001);if(!mesh.isEnabled())return;
  const o=surface.origin?.()??{x:0,z:0},absoluteX=cameraPosition.x+o.x,absoluteZ=cameraPosition.z+o.z;
  const tile=`${Math.floor(absoluteX/RAIN_TILE_SIZE)},${Math.floor(absoluteZ/RAIN_TILE_SIZE)},${quality},${o.x},${o.z}`;
  if(tile!==lastTile){rebuild(absoluteX,absoluteZ);lastTile=tile;}
  const camera=scene.activeCamera!;camera.getViewMatrix().invertToRef(inverseView);
  // Camera's world right remains finite when looking straight up; only billboards rotate.
  Vector3.TransformNormalToRef(Vector3.RightReadOnly,inverseView,right);right.normalize();
  material.setVector3('eye',cameraPosition);material.setVector3('cameraRight',right);material.setFloat('rainTime',seconds);material.setFloat('precipitation',precipitation);
  material.setVector3('rainColour',colour.set(.22+daylight*.48,.29+daylight*.47,.39+daylight*.45));material.setFloat('fogDensity',scene.fogDensity);
 }
 const inverseView=Matrix.Identity();
 function dispose(){if(disposed)return;disposed=true;scene.onDisposeObservable.remove(cleanup);mesh.dispose();material.dispose();}
 const cleanup=scene.onDisposeObservable.add(dispose);
 return {update,setQuality:(value:SkyQuality)=>{quality=value;},dispose,stats:()=>({seed:RAIN_SEED,quality,precipitation,seconds,instances:mesh.isEnabled()?instances:0,enabled:mesh.isEnabled(),shelters:!!surface.shelterHeightAt,tiles:mesh.isEnabled()?9:0})};
}
