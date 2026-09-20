import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import {CanopyShade} from '../runtime/canopy-shade.ts';
export function regionShade(scene:Scene,geo:any,origin:()=>{e:number;n:number},shadows:ShadowGenerator){
 const pixels=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const e=-2048+(x+.5)*36,n=-1536+(y+.5)*32;pixels.set([Math.round((geo.height(e,n)+16)/128*255),geo.forestAt(e,n)?255:0,0,255],(y*128+x)*4);}
 const field=RawTexture.CreateRGBATexture(pixels,128,128,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);field.wrapU=field.wrapV=Texture.CLAMP_ADDRESSMODE;
 scene.onDisposeObservable.add(()=>field.dispose());
 const attached=new WeakSet<Material>();return (m:Material)=>{if(attached.has(m))return;attached.add(m);new CanopyShade(m,shadows,{field,origin});};
}
