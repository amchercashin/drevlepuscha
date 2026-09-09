import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
/** Shared cutout atlas removes a parent only after its child is actually on the GPU. */
export class WorldGround extends MaterialPluginBase {
    origin = { e: 0, n: 0 };
    cutOrigin = { e: 0, n: 0 };
    player = { e: 0, n: 0 };
    camera = { e: 0, n: 0, h: 0 };
    heroH = 0;
    far = 0;
    canopy = 0;
    constructor(material: Material, public cuts: BaseTexture, public litter: BaseTexture) { super(material, 'WorldGround', 210, { WORLD_GROUND: true }, true, false); this._enable(true); }
    override isCompatible(_l: ShaderLanguage) { return true; }
    override getSamplers(s: string[]) { s.push('worldCuts', 'worldLitter'); }
    override getUniforms(language: ShaderLanguage) { return { ubo: [{ name: 'worldOrigin', size: 2, type: 'vec2' }, { name: 'cutOrigin', size: 2, type: 'vec2' }, { name: 'worldPlayer', size: 3, type: 'vec3' }, { name: 'worldEye', size: 3, type: 'vec3' }, { name: 'worldLayer', size: 2, type: 'vec2' }], fragment: language === 0 ? '#ifndef UNIFORMBUFFERS\nuniform vec2 worldOrigin;uniform vec2 cutOrigin;uniform vec3 worldPlayer;uniform vec3 worldEye;uniform vec2 worldLayer;\n#endif' : '' }; }
    override bindForSubMesh(u: UniformBuffer) { u.updateFloat2('worldOrigin', this.origin.e, this.origin.n); u.updateFloat2('cutOrigin', this.cutOrigin.e, this.cutOrigin.n); u.updateFloat3('worldPlayer', this.player.e, this.heroH, this.player.n); u.updateFloat3('worldEye', this.camera.e, this.camera.h, this.camera.n); u.updateFloat2('worldLayer', this.far, this.canopy); u.setTexture('worldCuts', this.cuts); u.setTexture('worldLitter', this.litter); }
    override getCustomCode(type: string, language: ShaderLanguage) {
        if (type !== 'fragment')
            return null;
        const wg = language === 1;
        return { CUSTOM_FRAGMENT_UPDATE_DIFFUSE: wg ? `
 if(uniforms.worldLayer.x<0.5&&uniforms.worldLayer.y<0.5){let litter=textureSample(worldLitter,worldLitterSampler,worldEN/5.0).rgb;let grain=dot(litter,vec3f(0.30,0.59,0.11));baseColor=vec4f(mix(baseColor.rgb*(0.62+grain),litter*0.78,0.22),baseColor.a);}
 ` : `
 if(worldLayer.x<0.5&&worldLayer.y<0.5){vec3 litter=texture2D(worldLitter,worldEN/5.0).rgb;float grain=dot(litter,vec3(0.30,0.59,0.11));baseColor.rgb=mix(baseColor.rgb*(0.62+grain),litter*.78,.22);}
 `, CUSTOM_FRAGMENT_DEFINITIONS: wg ? 'var worldCutsSampler: sampler; var worldCuts: texture_2d<f32>;var worldLitterSampler:sampler;var worldLitter:texture_2d<f32>;' : 'uniform sampler2D worldCuts;uniform sampler2D worldLitter;', CUSTOM_FRAGMENT_MAIN_BEGIN: wg ? `
 let worldEN = vec2f(fragmentInputs.vPositionW.x + uniforms.worldOrigin.x, uniforms.worldOrigin.y - fragmentInputs.vPositionW.z);
 let cutUV = (worldEN-uniforms.cutOrigin)/4096.0;
 if (uniforms.worldLayer.x > 0.5 && all(cutUV >= vec2f(0.0)) && all(cutUV < vec2f(1.0)) && textureSampleLevel(worldCuts,worldCutsSampler,cutUV,0.0).r > 0.5) { discard; }
 if (uniforms.worldLayer.y > 0.5 && distance(worldEN,uniforms.worldPlayer.xz) < 1300.0) { discard; }
 let eyeDelta=uniforms.worldPlayer.xz-uniforms.worldEye.xz;
 let eyeT=clamp(dot(worldEN-uniforms.worldEye.xz,eyeDelta)/max(0.001,dot(eyeDelta,eyeDelta)),0.0,1.0);
 let rayH=mix(uniforms.worldEye.y,uniforms.worldPlayer.y,eyeT);
 if(uniforms.worldLayer.x<0.5 && uniforms.worldLayer.y<0.5 && eyeT>0.03 && eyeT<0.96 && distance(worldEN,mix(uniforms.worldEye.xz,uniforms.worldPlayer.xz,eyeT))<0.6 && fragmentInputs.vPositionW.y>rayH-0.7) { discard; }
 ` : `
 vec2 worldEN=vec2(vPositionW.x+worldOrigin.x,worldOrigin.y-vPositionW.z);
 vec2 cutUV=(worldEN-cutOrigin)/4096.0;
 if(worldLayer.x>0.5 && all(greaterThanEqual(cutUV,vec2(0.0))) && all(lessThan(cutUV,vec2(1.0))) && texture2D(worldCuts,cutUV).r>0.5)discard;
 if(worldLayer.y>0.5 && distance(worldEN,worldPlayer.xz)<1300.0)discard;
 vec2 eyeDelta=worldPlayer.xz-worldEye.xz;
 float eyeT=clamp(dot(worldEN-worldEye.xz,eyeDelta)/max(0.001,dot(eyeDelta,eyeDelta)),0.0,1.0);
 float rayH=mix(worldEye.y,worldPlayer.y,eyeT);
 if(worldLayer.x<0.5 && worldLayer.y<0.5 && eyeT>0.03 && eyeT<0.96 && distance(worldEN,mix(worldEye.xz,worldPlayer.xz,eyeT))<0.6 && vPositionW.y>rayH-0.7)discard;
 ` };
    }
}
