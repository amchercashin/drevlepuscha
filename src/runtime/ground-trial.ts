import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {GROUND_TRIAL,groundTrialVertexHeight,groundTrialMask,showcaseHeight,showcasePath} from '../domain/showcase.ts';
import {createRandom} from '../domain/seed.ts';
import {SoilPattern} from './soil-pattern.ts';
import {soilTexture} from './forest-floor.ts';
import heightsURL from '../../assets/floor/trial/heights.png';
import normalsURL from '../../assets/floor/trial/normals.png';
import soilURL from '../../assets/floor/trial/soil.png';
import litterURL from '../../assets/floor/trial/litter.png';
import './ground-trial.css';

export type GroundTrialMode=0|1|2;
/** Four small shared maps; the height march reads both material heights in one fetch. */
class GroundRelief extends MaterialPluginBase {
 mode:GroundTrialMode=2;
 constructor(material:StandardMaterial,private maps:Texture[]){super(material,'GroundRelief',225,{},true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getSamplers(s:string[]){s.push('trialHeight','trialNormal','trialSoil','trialLitter');}
 override getActiveTextures(active:Texture[]){active.push(...this.maps);}
 override hasTexture(texture:Texture){return this.maps.includes(texture);}
 override getUniforms(){return {ubo:[{name:'trialMode',size:1,type:'float'}]};}
 override bindForSubMesh(u:UniformBuffer){u.updateFloat('trialMode',this.mode);['trialHeight','trialNormal','trialSoil','trialLitter'].forEach((name,i)=>u.setTexture(name,this.maps[i]));}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  return {
   CUSTOM_FRAGMENT_DEFINITIONS:`
    var trialHeightSampler:sampler;var trialHeight:texture_2d<f32>;
    var trialNormalSampler:sampler;var trialNormal:texture_2d<f32>;
    var trialSoilSampler:sampler;var trialSoil:texture_2d<f32>;
    var trialLitterSampler:sampler;var trialLitter:texture_2d<f32>;
    fn trialBlend(h:vec2f,forest:f32)->f32 {return smoothstep(-0.13,0.13,h.y-h.x+(forest*2.0-1.0)*0.8);}
    fn trialSurface(uv:vec2f,dx:vec2f,dy:vec2f,forest:f32)->f32 {
     let h=textureSampleGrad(trialHeight,trialHeightSampler,uv,dx,dy).rg;
     return mix(h.x,h.y,trialBlend(h,forest));
    }
   `,
   CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
    let trialEN=vec2f(fragmentInputs.vPositionW.x,-fragmentInputs.vPositionW.z);
    let trialBorder=min(min(trialEN.x+6.0,16.0-trialEN.x),min(trialEN.y+4.0,24.0-trialEN.y));
    let trialMask=smoothstep(0.0,2.0,trialBorder);
    let trialOriginalUV=trialEN/2.4;
    // Derivatives are computed before any divergent branch, including the POM loop.
    let trialDx=dpdx(trialOriginalUV);let trialDy=dpdy(trialOriginalUV);
    if(uniforms.trialMode>0.5&&trialMask>0.001){
     let trialPath=17.0*sin(trialEN.y*0.019)+6.0*sin(trialEN.y*0.047);
     let trialEdge=abs(trialEN.x-trialPath)+0.12*sin(trialEN.y*3.1+trialEN.x*1.5);
     let trialForest=smoothstep(0.95,2.05,trialEdge);
     let trialDistance=distance(scene.vEyePosition.xyz,fragmentInputs.vPositionW);
     let trialNear=1.0-smoothstep(7.0,14.0,trialDistance);
     let trialFacing=max(0.0,dot(viewDirectionW,normalW));
     let trialParallax=trialNear*trialMask*smoothstep(0.08,0.3,trialFacing);
     var trialUV=trialOriginalUV;
     if(uniforms.trialMode>1.5&&trialParallax>0.001){
      // Real-world relief is 6.5 cm, attenuated at grazing angles and beyond 7 m.
      let trialRay=vec2f(viewDirectionW.x,-viewDirectionW.z)/max(0.25,trialFacing)*(0.065/2.4)*trialParallax;
      var rayUV=trialOriginalUV+trialRay*0.55;
      var previousUV=rayUV;var previousGap=0.0;
      var level=1.0;let stepUV=trialRay/16.0;
      previousGap=level-trialSurface(rayUV,trialDx,trialDy,trialForest);
      for(var step=0;step<16;step++){
       previousUV=rayUV;
       rayUV-=stepUV;level-=1.0/16.0;
       let gap=level-trialSurface(rayUV,trialDx,trialDy,trialForest);
       if(gap<=0.0){
        let hit=clamp(previousGap/max(0.0001,previousGap-gap),0.0,1.0);
        rayUV=mix(previousUV,rayUV,hit);break;
       }
       previousGap=gap;
      }
      trialUV=rayUV;
     }
     let trialData=textureSampleGrad(trialHeight,trialHeightSampler,trialUV,trialDx,trialDy);
     let trialMix=trialBlend(trialData.rg,trialForest);
     let trialEarth=textureSampleGrad(trialSoil,trialSoilSampler,trialUV,trialDx,trialDy).rgb;
     let trialLeaves=textureSampleGrad(trialLitter,trialLitterSampler,trialUV,trialDx,trialDy).rgb;
     let trialCavity=mix(trialData.b,trialData.a,trialMix);
     let trialColour=mix(trialEarth,trialLeaves,trialMix)*(0.88+0.12*trialCavity);
     // Keep the existing colour at the boundary and smoothly recover it in the distance.
     let trialDetail=trialMask*(1.0-smoothstep(17.0,26.0,trialDistance));
     baseColor=vec4f(mix(baseColor.rgb,trialColour,trialDetail),baseColor.a);
     let trialNormals=textureSampleGrad(trialNormal,trialNormalSampler,trialUV,trialDx,trialDy)*2.0-1.0;
     let trialXY=mix(trialNormals.rg,trialNormals.ba,trialMix);
     let trialZ=sqrt(max(0.06,1.0-dot(trialXY,trialXY)));
     let trialEast=normalize(vec3f(1.0,-normalW.x/max(0.2,normalW.y),0.0));
     let trialNorth=normalize(cross(normalW,trialEast));
     let trialPerturbed=normalize(normalW*trialZ+trialEast*trialXY.x+trialNorth*trialXY.y);
     normalW=normalize(mix(normalW,trialPerturbed,trialDetail));
    }
   `,
  };
 }
}

export function createGroundTrial(scene:Scene,boundaryNormal:(e:number,n:number)=>number[]){
 const maps=[heightsURL,normalsURL,soilURL,litterURL].map((url,i)=>{
  const t=new Texture(url,scene,false,false);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;
  t.gammaSpace=i>1;t.anisotropicFilteringLevel=4;return t;
 });
 const material=new StandardMaterial('ground-trial',scene);material.specularColor=Color3.Black();
 material.diffuseTexture=soilTexture(scene);material.backFaceCulling=false;new SoilPattern(material);
 const relief=new GroundRelief(material,maps);
 const {minE,maxE,minN,maxN,step}=GROUND_TRIAL,cols=Math.round((maxE-minE)/step)+1,rows=Math.round((maxN-minN)/step)+1;
 const positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const e=minE+i*step,n=minN+j*step;
  positions.push(e,groundTrialVertexHeight(e,n),-n);uvs.push(e/5,n/5);
  if(i<cols-1&&j<rows-1){const k=j*cols+i;indices.push(k,k+1,k+cols,k+1,k+cols+1,k+cols);}
 }
 VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
 // Boundary normals match the old 2 m mesh, so there is no lighting rectangle at the seam.
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)if(i===0||j===0||i===cols-1||j===rows-1){
  normals.splice((j*cols+i)*3,3,...boundaryNormal(minE+i*step,minN+j*step));
 }
 const mesh=new Mesh('ground-trial',scene),data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
 mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();
 const accents=createGroundAccents(scene);
 const setMode=(mode:GroundTrialMode)=>{relief.mode=mode;};
 return {mesh,accents,setMode,stats:()=>({mode:relief.mode,bounds:GROUND_TRIAL,triangles:indices.length/3,accentTriangles:accents.getTotalIndices()/3,textureMiB:5.34,pomSteps:16,pomFade:[7,14]})};
}

/** A single opaque draw: small folded leaves and half-buried branch fragments, no physics or shadow pass. */
function createGroundAccents(scene:Scene){
 const random=createRandom(91209),positions:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[];
 const add=(e:number,n:number,y:number,c:number[])=>{positions.push(e,showcaseHeight(e,n)+y,-n);colors.push(...c,1);};
 for(let i=0;i<150;i++){
  const n=-1+random()*22,e=showcasePath(n)+(random()<.5?-1:1)*(1.3+random()*2.1);
  if(groundTrialMask(e,n)<.95)continue;
  const len=.07+random()*.085,width=len*.4,angle=random()*Math.PI*2,k=positions.length/3;
  const c=[.37+random()*.07,.32+random()*.05,.19+random()*.05];
  for(const [x,z,y] of [[-len,0,.006],[0,-width,.009],[0,0,.025+random()*.015],[0,width,.012],[len,0,.035]]){
   add(e+x*Math.cos(angle)-z*Math.sin(angle),n+x*Math.sin(angle)+z*Math.cos(angle),y,c);
  }
  indices.push(k,k+1,k+2,k+1,k+4,k+2,k+4,k+3,k+2,k+3,k,k+2);
 }
 for(let i=0;i<14;i++){
  const n=1+random()*19,e=showcasePath(n)+(i%2?1:-1)*(1.4+random()*1.4),a=random()*6.28,len=.3+random()*.6,r=.018+random()*.014,k=positions.length/3;
  for(let end=0;end<2;end++)for(let side=0;side<6;side++){
   const t=side/6*Math.PI*2,w=Math.cos(t)*r;
   add(e+Math.cos(a)*end*len-Math.sin(a)*w,n+Math.sin(a)*end*len+Math.cos(a)*w,.013+Math.sin(t)*r,[.28,.24,.17]);
  }
  for(let side=0;side<6;side++){const a=k+side,b=k+(side+1)%6;indices.push(a,b,a+6,b,b+6,a+6);}
 }
 VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
 const mesh=new Mesh('ground-trial-litter',scene),data=new VertexData();Object.assign(data,{positions,indices,colors,normals});data.applyToMesh(mesh);
 const material=new StandardMaterial('ground-trial-litter',scene);material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.backFaceCulling=false;
 mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();return mesh;
}

export function createGroundTrialControls(trial:ReturnType<typeof createGroundTrial>,focus:()=>void,visit:()=>void){
 const panel=document.createElement('section');panel.className='ground-trial-panel';panel.setAttribute('aria-label','Проба земли у входа');
 panel.innerHTML='<div class="ground-trial-heading"><strong>Земля под ногами</strong><button type="button" data-ground-visit>К участку</button></div><p>Проба у входа · сравните материал</p><div class="ground-trial-modes" role="group" aria-label="Материал земли"><button type="button" data-ground-mode="0">Исходный</button><button type="button" data-ground-mode="1">Нормали</button><button type="button" data-ground-mode="2">Глубина</button></div><small>Мелкие бугры и веточки общие для трёх режимов.</small>';
 document.body.append(panel);
 function select(mode:GroundTrialMode){trial.setMode(mode);for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-ground-mode]'))button.setAttribute('aria-pressed',String(Number(button.dataset.groundMode)===mode));}
 for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-ground-mode]'))button.onclick=()=>{select(Number(button.dataset.groundMode) as GroundTrialMode);focus();};
 panel.querySelector<HTMLButtonElement>('[data-ground-visit]')!.onclick=()=>{visit();focus();};select(2);
 return {setMode:select};
}
