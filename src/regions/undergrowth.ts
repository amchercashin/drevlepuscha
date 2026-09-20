import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import {hash01} from '../domain/geography.mjs';
import type {EN} from '../world/schema.ts';
import type {RegionWorld} from './world.ts';
import {CoverFade} from '../runtime/cover-fade.ts';
import {VegetationWind,expandWindBounds} from '../runtime/vegetation-wind.ts';
import foliageURL from '../../assets/floor/foliage.png';

export class ShrubPassage extends MaterialPluginBase {
 constructor(m:StandardMaterial){super(m,'ShrubPassage',221,{},true,false);this._enable(true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.WGSL;}
 override getCustomCode(type:string){return type==='fragment'?{CUSTOM_FRAGMENT_MAIN_BEGIN:`
 let shrubEye=scene.vEyePosition.xz;let shrubFeet=uniforms.coverFeet.xz;let shrubDelta=shrubFeet-shrubEye;
 let shrubT=clamp(dot(fragmentInputs.vPositionW.xz-shrubEye,shrubDelta)/max(.01,dot(shrubDelta,shrubDelta)),0.0,1.0);
 let shrubClearance=distance(fragmentInputs.vPositionW.xz,mix(shrubEye,shrubFeet,shrubT));
 let shrubKeep=mix(.08,1.0,smoothstep(.55,1.5,shrubClearance));
 if(fract(52.9829189*fract(dot(floor(fragmentInputs.position.xy),vec2f(.06711056,.00583715))))>shrubKeep){discard;}
 `}:null;}
}

/** A persistent middle layer: loose leafy shrubs, clustered away from paths and landings. */
export function createUndergrowth(scene:Scene,world:RegionWorld){
 const material=new StandardMaterial('regional-shrubs',scene);material.specularColor=Color3.Black();material.backFaceCulling=false;material.twoSidedLighting=true;
 const texture=new Texture(foliageURL,scene);texture.hasAlpha=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.transparencyMode=1;material.alphaCutOff=.45;
 const fade=new CoverFade(material,85,110);new ShrubPassage(material);if(world.library.wind)new VegetationWind(material,world.library.wind,'tree',()=>world.origin);
 const source=new Mesh('shrub-source',scene),v=new VertexData(),positions:number[]=[],indices:number[]=[],uvs:number[]=[],colors:number[]=[],normals:number[]=[];
 // Bent broadleaf fans at several heights, rather than opaque spheres or miniature trees.
 for(let i=0;i<130;i++){
  const angle=hash01(i,11,702)*Math.PI*2,r=Math.sqrt(hash01(i,13,703))*.95,centre=hash01(i,17,704),x=Math.cos(angle)*r,z=Math.sin(angle)*r,y=.15+(1-r*.65)*centre*1.1;
  const length=.18+hash01(i,21,705)*.2,turn=angle+hash01(i,22,706)*1.5,dx=Math.cos(turn),dz=Math.sin(turn),k=positions.length/3;
  for(let j=0;j<4;j++){const t=j/3,width=Math.sin(t*Math.PI)*.13+.012;for(const side of [-1,1]){
   positions.push(x+dx*t*length-dz*width*side,y+Math.sin(t*Math.PI)*.18-t*.12,z+dz*t*length+dx*width*side);
   uvs.push(.75+side*width*.48,.005+.49*t);const tint=.7+hash01(i,23,707)*.35;colors.push(.73*tint,.94*tint,.57*tint,1);
  }if(j<3){const q=k+j*2;indices.push(q,q+2,q+1,q+1,q+2,q+3);}}
 }
 VertexData.ComputeNormals(positions,indices,normals);Object.assign(v,{positions,indices,uvs,colors,normals});v.applyToMesh(source);source.setEnabled(false);source.material=material;
 const cells=new Map<string,Mesh>();let key='',queue:{e:number;n:number;id:string}[]=[];
 world.onRebase.push(o=>{for(const m of cells.values()){m.unfreezeWorldMatrix();m.position.set(m.metadata.e-o.e,0,o.n-m.metadata.n);m.freezeWorldMatrix();}});
 function build(e:number,n:number,id:string){
  const matrices:number[]=[];
  for(let i=0;i<10;i++){
   const E=e+hash01(e,n,i+911)*32,N=n+hash01(e,n,i+933)*32,q=world.data.geo.nearbyWater(E,N),shore=Math.min(...q.map((w:any)=>w.distance-w.width/2));
   const woodland=world.data.geo.forestAt(E,N),patch=.5+.5*Math.sin(E*.031+Math.sin(N*.019)*2);
   if(hash01(e,n,i+977)>(shore<35?.7:woodland?.32:patch>.65?.55:.05)||world.data.geo.exclusion(E,N)||world.terrain.trailAt(E,N).distance<5||(world.data.geo.waterAt(E,N,world.waterState)?.depth??0)>.02)continue;
   const h=world.data.geo.surfaceHeight(E,N),s=.65+hash01(e,n,i+991)*.8;
   if(Math.abs(world.data.geo.surfaceHeight(E+1,N)-h)>.7)continue;
   matrices.push(...Matrix.Compose(new Vector3(s,s,s),Quaternion.RotationYawPitchRoll(hash01(e,n,i+995)*6.28,0,0),new Vector3(E-e,h,N*-1+n)).m);
  }
  const mesh=new Mesh('shrub-cell-'+id,scene);source.geometry!.copy('shrub-geometry-'+id).applyToMesh(mesh);mesh.material=material;mesh.metadata={e,n,windTree:[1.8,.4]};mesh.isPickable=false;mesh.receiveShadows=true;
  mesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);mesh.position.set(e-world.origin.e,0,world.origin.n-n);mesh.thinInstanceRefreshBoundingInfo();expandWindBounds(mesh,.35);mesh.freezeWorldMatrix();if(!matrices.length)mesh.setEnabled(false);cells.set(id,mesh);
 }
 return {update(p:EN,budget:FrameWorkBudget){const next=Math.floor(p.e/32)+','+Math.floor(p.n/32);if(next!==key){key=next;queue=[];const wanted=new Set<string>();for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const e=Math.floor(p.e/32)*32+x*32,n=Math.floor(p.n/32)*32+y*32,id=e+','+n;if(Math.hypot(e+16-p.e,n+16-p.n)>135)continue;wanted.add(id);if(!cells.has(id))queue.push({e,n,id});}queue.sort((a,b)=>Math.hypot(a.e-p.e,a.n-p.n)-Math.hypot(b.e-p.e,b.n-p.n));for(const [id,m]of cells)if(!wanted.has(id)){m.dispose();cells.delete(id);}}
  if(queue.length)budget.run(()=>{const q=queue.shift()!;build(q.e,q.n,q.id);});fade.feet={x:p.e-world.origin.e,y:0,z:world.origin.n-p.n};
 },meshes:()=>[...cells.values()]};
}
