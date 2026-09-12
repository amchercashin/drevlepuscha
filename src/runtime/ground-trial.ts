import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {SHOWCASE_GROUND} from '../domain/showcase.ts';
import {createGroundDetails} from './ground-detail.ts';
import {SoilPattern} from './soil-pattern.ts';
import {soilTexture} from './forest-floor.ts';
import heightsURL from '../../assets/floor/trial/heights.png';
import normalsURL from '../../assets/floor/trial/normals.png';
import soilURL from '../../assets/floor/trial/soil.png';
import litterURL from '../../assets/floor/trial/litter.png';
import materialInfo from '../../assets/floor/trial/material.json';
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
    let trialMask=1.0;
    let trialDistance=distance(scene.vEyePosition.xyz,fragmentInputs.vPositionW);
    // Continuous world warp breaks the repetition without multiplying texture reads in POM.
    let trialOriginalUV=vec2f(0.8660254*trialEN.x-0.5*trialEN.y,0.5*trialEN.x+0.8660254*trialEN.y)/3.2+(groundField.ba-0.5)*0.9;
    // Derivatives are computed before any divergent branch, including the POM loop.
    let trialDx=dpdx(trialOriginalUV);let trialDy=dpdy(trialOriginalUV);
    let groundDx=dpdx(trialEN);let groundDy=dpdy(trialEN);
    let groundDet=groundDx.x*groundDy.y-groundDx.y*groundDy.x;
    let groundSafeDet=select(-max(abs(groundDet),0.0000001),max(abs(groundDet),0.0000001),groundDet>=0.0);
    let groundJacE=(trialDx*groundDy.y-trialDy*groundDx.y)/groundSafeDet;
    let groundJacN=(trialDy*groundDx.x-trialDx*groundDy.x)/groundSafeDet;
    if(uniforms.trialMode>0.5&&trialDistance<26.0){
     let trialForest=groundCover;
     let trialNear=1.0-smoothstep(7.0,14.0,trialDistance);
     let trialFacing=max(0.0,dot(viewDirectionW,normalW));
     let trialParallax=trialNear*trialMask*smoothstep(0.08,0.3,trialFacing);
     var trialUV=trialOriginalUV;
     if(uniforms.trialMode>1.5&&trialParallax>0.001){
      // Real-world relief is 6.5 cm, attenuated at grazing angles and beyond 7 m.
      let trialRay=(groundJacE*viewDirectionW.x-groundJacN*viewDirectionW.z)/max(0.25,trialFacing)*0.065*trialParallax;
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
     let trialEarth=textureSampleGrad(trialSoil,trialSoilSampler,trialUV,trialDx,trialDy);
     let trialLeaves=textureSampleGrad(trialLitter,trialLitterSampler,trialUV,trialDx,trialDy).rgb;
     let trialCavity=mix(trialData.b,trialData.a,trialMix);
     let groundMossFine=groundMoss*(1.0-0.9*trialMix)*smoothstep(0.0,0.75,trialEarth.a+groundMoss*0.25);
     let groundMossColour=vec3f(0.25,0.33,0.17)*(0.83+0.34*trialEarth.a);
     let trialColour=mix(mix(trialEarth.rgb,trialLeaves,trialMix),groundMossColour,groundMossFine)*(0.88+0.12*trialCavity);
     // The same leaf/moss field also controls the distant palette, avoiding a moving colour boundary.
     let trialDetail=trialMask*(1.0-smoothstep(17.0,26.0,trialDistance));
     baseColor=vec4f(mix(baseColor.rgb,trialColour,trialDetail),baseColor.a);
     let trialNormals=textureSampleGrad(trialNormal,trialNormalSampler,trialUV,trialDx,trialDy)*2.0-1.0;
     let trialXY=mix(trialNormals.rg,trialNormals.ba,trialMix);
     let trialZ=sqrt(max(0.06,1.0-dot(trialXY,trialXY)));
     let trialEast=normalize(vec3f(1.0,-normalW.x/max(0.2,normalW.y),0.0));
     let trialNorth=normalize(cross(normalW,trialEast));
     let groundSlopes=trialXY/trialZ;
     let trialPerturbed=normalize(normalW+trialEast*dot(groundSlopes,groundJacE*3.2)+trialNorth*dot(groundSlopes,groundJacN*3.2));
     normalW=normalize(mix(normalW,trialPerturbed,trialDetail));
    }
   `,
  };
 }
}

export function createGroundTrial(scene:Scene,coarse:StandardMaterial,baseNormal:(e:number,n:number)=>number[]){
 const maps=[heightsURL,normalsURL,soilURL,litterURL].map((url,i)=>{
  const t=new Texture(url,scene,false,false);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;
  t.gammaSpace=i>1;t.anisotropicFilteringLevel=4;return t;
 });
 const material=new StandardMaterial('ground-detail',scene);material.specularColor=Color3.Black();
 material.diffuseTexture=soilTexture(scene);material.backFaceCulling=false;new SoilPattern(material);
 const relief=[new GroundRelief(coarse,maps),new GroundRelief(material,maps)];
 const accents=new StandardMaterial('ground-litter',scene);accents.diffuseColor=Color3.White();accents.specularColor=Color3.Black();accents.backFaceCulling=false;
 const details=createGroundDetails(scene,coarse,material,accents,baseNormal);
 const setMode=(mode:GroundTrialMode)=>{for(const plugin of relief)plugin.mode=mode;};
 return {setMode,update:details.update,prepare:details.prepare,stats:()=>({mode:relief[0].mode,bounds:SHOWCASE_GROUND,...details.stats(),textureMiB:materialInfo.textureMemoryMiBWithMips,materialVersion:materialInfo.version,pomSteps:16,pomFade:[7,14]})};
}

export function createGroundTrialControls(trial:ReturnType<typeof createGroundTrial>,focus:()=>void,visit:()=>void){
 const panel=document.createElement('section');panel.className='ground-trial-panel';panel.setAttribute('aria-label','Земля в шоукейсе');
 panel.innerHTML='<div class="ground-trial-heading"><strong>Земля под ногами</strong><button type="button" data-ground-visit>К входу</button></div><p>Весь шоукейс · сравните материал</p><div class="ground-trial-modes" role="group" aria-label="Материал земли"><button type="button" data-ground-mode="0">Исходный</button><button type="button" data-ground-mode="1">Нормали</button><button type="button" data-ground-mode="2">Глубина</button></div><small>Мелкие бугры и веточки общие для трёх режимов.</small>';
 document.body.append(panel);
 function select(mode:GroundTrialMode){trial.setMode(mode);for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-ground-mode]'))button.setAttribute('aria-pressed',String(Number(button.dataset.groundMode)===mode));}
 for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-ground-mode]'))button.onclick=()=>{select(Number(button.dataset.groundMode) as GroundTrialMode);focus();};
 panel.querySelector<HTMLButtonElement>('[data-ground-visit]')!.onclick=()=>{visit();focus();};select(2);
 return {setMode:select};
}
