import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Point3} from '../domain/harness.ts';
import {SHOWCASE_GROUND,groundDetailVertexHeight,showcaseBaseHeight,showcaseHeight,showcasePath} from '../domain/showcase.ts';
import {trailClearance} from '../domain/trail-edge.ts';
import {groundPatch} from '../domain/ground-patches.ts';
import {createRandom,seedFor} from '../domain/seed.ts';
import {CoverFade} from './cover-fade.ts';

/** The coarse surface is cut only after a replacement tile is on the GPU. */
class GroundCuts extends MaterialPluginBase {
 constructor(material:StandardMaterial,private cuts:RawTexture){super(material,'GroundCuts',210,{},true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getSamplers(s:string[]){s.push('groundCuts');}
 override bindForSubMesh(u:UniformBuffer){u.setTexture('groundCuts',this.cuts);}
 override getCustomCode(type:string){return type==='fragment'?{
  CUSTOM_FRAGMENT_DEFINITIONS:'var groundCuts:texture_2d<f32>;',
  CUSTOM_FRAGMENT_MAIN_BEGIN:`
   let groundCell=vec2i(floor((vec2f(fragmentInputs.vPositionW.x,-fragmentInputs.vPositionW.z)+256.0)/8.0));
   if(all(groundCell>=vec2i(0))&&all(groundCell<vec2i(64,80))){if(textureLoad(groundCuts,groundCell,0).r>0.5){discard;}}
  `,
 }:null;}
}

/** Detail becomes exactly the coarse surface before the outer tile boundary. */
class GroundMorph extends MaterialPluginBase {
 feet:Point3={x:0,y:0,z:0};
 constructor(material:StandardMaterial){super(material,'GroundMorph',220,{},true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getAttributes(a:string[]){a.push('groundBaseY','groundBaseNormal');}
 override getUniforms(){return {ubo:[{name:'groundAnchor',size:2,type:'vec2'}]};}
 override bindForSubMesh(u:UniformBuffer){u.updateFloat2('groundAnchor',this.feet.x,-this.feet.z);}
 override getCustomCode(type:string){return type==='vertex'?{
  CUSTOM_VERTEX_DEFINITIONS:'attribute groundBaseY:f32;attribute groundBaseNormal:vec3f;',
  CUSTOM_VERTEX_UPDATE_POSITION:`
   let groundDistance=distance(vec2f(positionUpdated.x,-positionUpdated.z),uniforms.groundAnchor);
   let groundWeight=1.0-smoothstep(11.0,15.5,groundDistance);
   positionUpdated.y=mix(vertexInputs.groundBaseY,positionUpdated.y,groundWeight);
  `,
  CUSTOM_VERTEX_UPDATE_NORMAL:'normalUpdated=normalize(mix(vertexInputs.groundBaseNormal,normalUpdated,groundWeight));',
 }:null;}
}

type Tile={x:number;n:number;meshes:Mesh[]};
export function createGroundDetails(scene:Scene,coarse:StandardMaterial,detail:StandardMaterial,accents:StandardMaterial,baseNormal:(e:number,n:number)=>number[]){
 const pixels=new Uint8Array(64*80),cuts=RawTexture.CreateRTexture(pixels,64,80,scene,false,false,Texture.NEAREST_SAMPLINGMODE);
 new GroundCuts(coarse,cuts);const morph=new GroundMorph(detail),fade=new CoverFade(accents,11,17);
 const tiles=new Map<string,Tile>();let pending:{x:number;n:number;key:string}[]=[],lastX=Infinity,lastN=Infinity,maxBuildMs=0;
 const index=(x:number,n:number)=>(n+32)*64+x+32;
 function update(feet:Point3){
  morph.feet=fade.feet=feet;
  const cx=Math.floor(feet.x/8),cn=Math.floor(-feet.z/8);let dirty=false;
  if(cx!==lastX||cn!==lastN){
   lastX=cx;lastN=cn;pending=[];const wanted=new Set<string>();
   for(let n=cn-2;n<=cn+2;n++)for(let x=cx-2;x<=cx+2;x++){
    if(x< -32||x>=32||n< -32||n>=48)continue;
    const key=`${x}:${n}`;wanted.add(key);if(!tiles.has(key))pending.push({x,n,key});
   }
   pending.sort((a,b)=>Math.hypot(a.x-cx,a.n-cn)-Math.hypot(b.x-cx,b.n-cn));
   for(const [key,tile] of tiles)if(!wanted.has(key)){for(const mesh of tile.meshes)mesh.dispose();pixels[index(tile.x,tile.n)]=0;tiles.delete(key);dirty=true;}
  }
  // At most one small tile upload per frame, rather than a full-forest high-resolution mesh.
  const next=pending.shift();
  if(next){
   const started=performance.now();
   const meshes=[makeGroundTile(scene,next.x,next.n,detail,baseNormal),makeAccentTile(scene,next.x,next.n,accents)];
   tiles.set(next.key,{x:next.x,n:next.n,meshes});pixels[index(next.x,next.n)]=255;dirty=true;
   maxBuildMs=Math.max(maxBuildMs,performance.now()-started);
  }
  if(dirty)cuts.update(pixels);
 }
 async function prepare(feet:Point3){do{update(feet);await new Promise(resolve=>setTimeout(resolve,0));}while(pending.length);maxBuildMs=0;}
 scene.onDisposeObservable.add(()=>cuts.dispose());
 return {update,prepare,stats:()=>({tiles:tiles.size,pending:pending.length,cacheLimit:25,maxBuildMs,triangles:[...tiles.values()].reduce((s,t)=>s+t.meshes.reduce((v,m)=>v+m.getTotalIndices()/3,0),0),opaque:[...tiles.values()].every(t=>t.meshes.every(m=>m.visibility===1)),centre:[lastX,lastN]})};
}

function makeGroundTile(scene:Scene,cx:number,cn:number,material:StandardMaterial,baseNormal:(e:number,n:number)=>number[]){
 const step=SHOWCASE_GROUND.step,cols=33,positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[],baseY:number[]=[],baseNormals:number[]=[];
 for(let j=0;j<cols;j++)for(let i=0;i<cols;i++){
  const e=cx*8+i*step,n=cn*8+j*step;
  positions.push(e,groundDetailVertexHeight(e,n),-n);uvs.push(e/5,n/5);baseY.push(showcaseBaseHeight(e,n));baseNormals.push(...baseNormal(e,n));
  if(i<cols-1&&j<cols-1){const k=j*cols+i;indices.push(k,k+1,k+cols,k+1,k+cols+1,k+cols);}
 }
 VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
 // Derivatives at shared borders use neighbours on both sides, independent of load order.
 for(let j=0;j<cols;j++)for(let i=0;i<cols;i++)if(i===0||j===0||i===cols-1||j===cols-1){
  const e=cx*8+i*step,n=cn*8+j*step,dx=(groundDetailVertexHeight(e+step,n)-groundDetailVertexHeight(e-step,n))/(2*step),dn=(groundDetailVertexHeight(e,n+step)-groundDetailVertexHeight(e,n-step))/(2*step),l=Math.hypot(dx,1,dn),k=(j*cols+i)*3;
  normals[k]=-dx/l;normals[k+1]=1/l;normals[k+2]=dn/l;
 }
 const mesh=new Mesh(`ground-detail-${cx}:${cn}`,scene),data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
 mesh.setVerticesData('groundBaseY',baseY,false,1);mesh.setVerticesData('groundBaseNormal',baseNormals,false,3);
 setup(mesh,material);return mesh;
}

function setup(mesh:Mesh,material:StandardMaterial){mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.metadata={showcaseGround:true};mesh.freezeWorldMatrix();}
function makeAccentTile(scene:Scene,cx:number,cn:number,material:StandardMaterial){
 const random=createRandom(seedFor('showcase-ground-litter-1',cx,cn)),positions:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[];
 const add=(e:number,n:number,y:number,c:number[])=>{positions.push(e,showcaseHeight(e,n)+y,-n);colors.push(...c,1);};
 for(let i=0;i<38;i++){
  const n=cn*8+random()*8,e=cx*8+random()*8;
  if(trailClearance(e,n,showcasePath(n))<-.2)continue;
  const patch=groundPatch(e,n);if(random()>.08+.85*patch.leaves*(1-.6*patch.moss))continue;
  const len=.07+random()*.085,width=len*.4,angle=random()*Math.PI*2,k=positions.length/3;
  const c=[.37+random()*.07,.32+random()*.05,.19+random()*.05];
  for(const [x,z,y] of [[-len,0,.006],[0,-width,.009],[0,0,.025+random()*.015],[0,width,.012],[len,0,.035]])add(e+x*Math.cos(angle)-z*Math.sin(angle),n+x*Math.sin(angle)+z*Math.cos(angle),y,c);
  indices.push(k,k+1,k+2,k+1,k+4,k+2,k+4,k+3,k+2,k+3,k,k+2);
 }
 for(let i=0;i<2;i++){
  const n=cn*8+random()*8,e=cx*8+random()*8;if(trailClearance(e,n,showcasePath(n))<-.1||random()>.18+.7*groundPatch(e,n).leaves)continue;
  const a=random()*6.28,len=.3+random()*.6,r=.018+random()*.014,k=positions.length/3;
  for(let end=0;end<2;end++)for(let side=0;side<6;side++){
   const t=side/6*Math.PI*2,w=Math.cos(t)*r;
   add(e+Math.cos(a)*end*len-Math.sin(a)*w,n+Math.sin(a)*end*len+Math.cos(a)*w,.013+Math.sin(t)*r,[.28,.24,.17]);
  }
  for(let side=0;side<6;side++){const a=k+side,b=k+(side+1)%6;indices.push(a,b,a+6,b,b+6,a+6);}
 }
 VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
 const mesh=new Mesh(`ground-litter-${cx}:${cn}`,scene),data=new VertexData();Object.assign(data,{positions,indices,colors,normals});data.applyToMesh(mesh);setup(mesh,material);return mesh;
}
