import {TRAIL_EDGE_WGSL} from '../runtime/trail-edge.wgsl.ts';

export const SCENE_WGSL = /* wgsl */ `${TRAIL_EDGE_WGSL}
struct Frame {
 viewProj:mat4x4f,
 lightViewProj:mat4x4f,
 camera:vec4f,
 sunDir:vec4f,
 sunColor:vec4f,
 skyTop:vec4f,
 skyHorizon:vec4f,
 fogColor:vec4f,
 params:vec4f,             // seconds, daylight, sunset, fog density
 moonDir:vec4f,
 viewport:vec4f,           // width, height, tan(fov/2), aspect
 cameraRight:vec4f,
 cameraUp:vec4f,
 cameraForward:vec4f,
 ambient:vec4f,
 lightDir:vec4f,
 wind:vec4f,              // direction x/z, canopy and cover amplitude
};
struct Material { kindOpacity:vec4f, tint:vec4f };
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var shadowMap:texture_depth_2d;
@group(0) @binding(2) var shadowSampler:sampler_comparison;
@group(1) @binding(0) var albedo:texture_2d<f32>;
@group(1) @binding(1) var albedoSampler:sampler;
@group(1) @binding(2) var<uniform> material:Material;
@group(1) @binding(3) var groundPatches:texture_2d<f32>;
@group(1) @binding(4) var groundHeights:texture_2d<f32>;
@group(1) @binding(5) var groundNormals:texture_2d<f32>;
@group(1) @binding(6) var groundSoil:texture_2d<f32>;
@group(1) @binding(7) var groundLitter:texture_2d<f32>;
@group(2) @binding(0) var<storage,read> bones:array<mat4x4f>;

struct VertexIn {
 @location(0) position:vec3f,
 @location(1) normal:vec3f,
 @location(2) uv:vec2f,
 @location(3) m0:vec4f,
 @location(4) m1:vec4f,
 @location(5) m2:vec4f,
 @location(6) m3:vec4f,
 @location(7) tone:vec4f,
 @location(8) color:vec4f,
};
struct VertexOut {
 @builtin(position) clip:vec4f,
 @location(0) world:vec3f,
 @location(1) normal:vec3f,
 @location(2) uv:vec2f,
 @location(3) tone:vec4f,
};
struct SkinnedIn {
 @location(0) position:vec3f,
 @location(1) normal:vec3f,
 @location(2) uv:vec2f,
 @location(8) joints:vec4f,
 @location(9) weights:vec4f,
 @location(3) m0:vec4f,
 @location(4) m1:vec4f,
 @location(5) m2:vec4f,
 @location(6) m3:vec4f,
 @location(7) tone:vec4f,
};
struct FoliageIn {
 @location(0) position:vec3f,
 @location(1) normal:vec3f,
 @location(2) uv:vec2f,
 @location(8) color:vec4f,
 @location(10) plantWind:vec4f,
 @location(3) m0:vec4f,
 @location(4) m1:vec4f,
 @location(5) m2:vec4f,
 @location(6) m3:vec4f,
 @location(7) tone:vec4f,
};
fn worldVertex(input:VertexIn)->VertexOut {
 var out:VertexOut;
 let model=mat4x4f(input.m0,input.m1,input.m2,input.m3);
 var local=input.position;
 if(material.kindOpacity.x>0.5 && material.kindOpacity.x<1.5) {
  let bend=pow(clamp(local.y/8.0,0.0,1.0),1.65);
  let gust=sin(frame.params.x*0.94+input.m3.x*0.043+input.m3.z*0.056+local.y*0.22);
  let movement=bend*(0.10*sin(frame.params.x*0.62+input.m3.z*0.07)+0.14*gust)*frame.wind.z;
  local.x+=movement*frame.wind.x;
  local.z+=movement*frame.wind.y;
 }
 let world=model*vec4f(local,1.0);
 out.world=world.xyz;
 out.normal=normalize((model*vec4f(input.normal,0.0)).xyz);
 out.uv=input.uv;
 out.tone=input.tone*input.color;
 out.clip=frame.viewProj*world;
 return out;
}
@vertex fn vs(input:VertexIn)->VertexOut { return worldVertex(input); }
@vertex fn vsShadow(input:VertexIn)->@builtin(position) vec4f {
 let world=worldVertex(input);
 return frame.lightViewProj*vec4f(world.world,1.0);
}
fn skinnedVertex(input:SkinnedIn)->VertexOut {
 let skin=bones[u32(input.joints.x)]*input.weights.x+bones[u32(input.joints.y)]*input.weights.y+
  bones[u32(input.joints.z)]*input.weights.z+bones[u32(input.joints.w)]*input.weights.w;
 let position=skin*vec4f(input.position,1.0);
 let normal=normalize((skin*vec4f(input.normal,0.0)).xyz);
 return worldVertex(VertexIn(position.xyz,normal,input.uv,input.m0,input.m1,input.m2,input.m3,input.tone,vec4f(1.0)));
}
@vertex fn vsSkinned(input:SkinnedIn)->VertexOut { return skinnedVertex(input); }
@vertex fn vsSkinnedShadow(input:SkinnedIn)->@builtin(position) vec4f {
 let world=skinnedVertex(input);
 return frame.lightViewProj*vec4f(world.world,1.0);
}
@vertex fn vsFoliage(input:FoliageIn)->VertexOut {
 let t=input.plantWind.z;
 let wave=sin(frame.params.x*1.8+input.plantWind.x*.17+input.plantWind.y*.11+input.plantWind.w);
 let displacement=frame.wind.w*t*t*(0.045+0.040*wave);
 let moved=input.position+vec3f(frame.wind.x*displacement,0.0,frame.wind.y*displacement);
 var out=worldVertex(VertexIn(moved,input.normal,input.uv,input.m0,input.m1,input.m2,input.m3,input.tone,input.color));
 return out;
}

fn hash(p:vec2f)->f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p:vec2f)->f32 {
 let i=floor(p);let f=fract(p);let u=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2f(1.0,0.0)),u.x),mix(hash(i+vec2f(0.0,1.0)),hash(i+vec2f(1.0,1.0)),u.x),u.y);
}
fn trialBlend(h:vec2f,forest:f32)->f32 {return smoothstep(-0.13,0.13,h.y-h.x+(forest*2.0-1.0)*0.8);}
fn trialSurface(uv:vec2f,dx:vec2f,dy:vec2f,forest:f32)->f32 {
 let h=textureSampleGrad(groundHeights,albedoSampler,uv,dx,dy).rg;
 return mix(h.x,h.y,trialBlend(h,forest));
}
fn shadowFactor(world:vec3f,normal:vec3f)->f32 {
 let clip=frame.lightViewProj*vec4f(world,1.0);
 let ndc=clip.xyz/clip.w;
 let uv=vec2f(ndc.x*0.5+0.5,0.5-ndc.y*0.5);
 if(any(uv<vec2f(0.0))||any(uv>vec2f(1.0))||ndc.z<0.0||ndc.z>1.0){return 1.0;}
 let bias=0.0008+0.0020*(1.0-max(dot(normal,frame.lightDir.xyz),0.0));
 let texel=1.0/vec2f(textureDimensions(shadowMap));
 var sum=0.0;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  sum+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))*texel,ndc.z-bias);
 }}
 return 0.17+0.83*sum/9.0;
}
@fragment fn fs(input:VertexOut)->@location(0) vec4f {
 let kind=material.kindOpacity.x;
 let texel=textureSample(albedo,albedoSampler,input.uv);
 let opacity=material.kindOpacity.y*input.tone.w;
 if(kind>2.5&&kind<3.5&&texel.a<0.46){discard;}
 if(opacity<0.999){
  let dither=hash(floor(input.clip.xy));
  if(dither>opacity){discard;}
 }
 var base:vec3f;
 var n=normalize(input.normal);
 if(kind<0.5){
  let en=vec2f(input.world.x,-input.world.z);
  let field=textureSample(groundPatches,albedoSampler,(en+vec2f(256.0))/vec2f(512.0,640.0));
  let forest=trailForest(en);
  let moss=field.g*forest*0.9;
  let cover=forest*(0.12+0.88*field.r)*(1.0-0.65*moss);
  let farSoil=mix(vec3f(0.50,0.435,0.325),vec3f(0.41,0.355,0.25),cover);
  let farColor=mix(farSoil,vec3f(0.27,0.36,0.19),moss*(1.0-0.7*cover));
  base=farColor*(0.94+0.12*dot(texel.rgb,vec3f(.30,.59,.11)));
  let distanceToEye=distance(input.world,frame.camera.xyz);
  let uv=vec2f(0.8660254*en.x-0.5*en.y,0.5*en.x+0.8660254*en.y)/3.2+(field.ba-0.5)*0.9;
  let uvDx=dpdx(uv);let uvDy=dpdy(uv);
  let enDx=dpdx(en);let enDy=dpdy(en);
  if(distanceToEye<26.0){
   let determinant=enDx.x*enDy.y-enDx.y*enDy.x;
   let safeDet=select(-max(abs(determinant),.0000001),max(abs(determinant),.0000001),determinant>=0.0);
   let jacE=(uvDx*enDy.y-uvDy*enDx.y)/safeDet;
   let jacN=(uvDy*enDx.x-uvDx*enDy.x)/safeDet;
   let viewDir=normalize(frame.camera.xyz-input.world);
   let facing=max(0.0,dot(viewDir,n));
   let parallax=(1.0-smoothstep(7.0,14.0,distanceToEye))*smoothstep(.08,.3,facing);
   var sampleUV=uv;
   if(parallax>.001){
    let ray=(jacE*viewDir.x-jacN*viewDir.z)/max(.25,facing)*.065*parallax;
    var walk=uv+ray*.55;
    var previous=walk;
    var level=1.0;
    var previousGap=level-trialSurface(walk,uvDx,uvDy,cover);
    for(var step=0;step<16;step++){
     previous=walk;walk-=ray/16.0;level-=1.0/16.0;
     let gap=level-trialSurface(walk,uvDx,uvDy,cover);
     if(gap<=0.0){walk=mix(previous,walk,clamp(previousGap/max(.0001,previousGap-gap),0.0,1.0));break;}
     previousGap=gap;
    }
    sampleUV=walk;
   }
   let heights=textureSampleGrad(groundHeights,albedoSampler,sampleUV,uvDx,uvDy);
   let blend=trialBlend(heights.rg,cover);
   let soil=textureSampleGrad(groundSoil,albedoSampler,sampleUV,uvDx,uvDy);
   let litter=textureSampleGrad(groundLitter,albedoSampler,sampleUV,uvDx,uvDy).rgb;
   let cavity=mix(heights.b,heights.a,blend);
   let fineMoss=moss*(1.0-.9*blend)*smoothstep(0.0,.75,soil.a+moss*.25);
   let reliefColor=mix(mix(soil.rgb,litter,blend),vec3f(.25,.33,.17)*(.83+.34*soil.a),fineMoss)*(.88+.12*cavity);
   let detail=1.0-smoothstep(17.0,26.0,distanceToEye);
   base=mix(base,reliefColor,detail);
   let normalMap=textureSampleGrad(groundNormals,albedoSampler,sampleUV,uvDx,uvDy)*2.0-1.0;
   let slopes=mix(normalMap.rg,normalMap.ba,blend);
   let tangentE=normalize(vec3f(1.0,-n.x/max(.2,n.y),0.0));
   let tangentN=normalize(cross(n,tangentE));
   let bumped=normalize(n+tangentE*dot(slopes,jacE*3.2)+tangentN*dot(slopes,jacN*3.2));
   n=normalize(mix(n,bumped,detail));
  }
 }
 else if(kind>1.5&&kind<2.5){
  base=texel.rgb*input.tone.rgb;
  let luma=dot(base,vec3f(0.2126,0.7152,0.0722));
  let cloth=smoothstep(0.06,0.22,(base.g-base.b)/max(luma,0.02));
  let warm=smoothstep(0.10,0.26,(base.r-base.g)/max(luma,0.02));
  base=mix(base,luma*material.tint.rgb,cloth*(1.0-warm));
 }
 else {base=texel.rgb*material.tint.rgb*input.tone.rgb;}
 let ndotl=max(dot(n,frame.lightDir.xyz),0.0);
 let wrap=select(0.0,max(dot(-n,frame.lightDir.xyz),0.0)*0.25,(kind>0.5&&kind<1.5)||(kind>2.5&&kind<3.5));
 let shade=shadowFactor(input.world,n);
 let ambient=frame.ambient.rgb*(0.70+0.30*max(n.y,0.0));
 var lit=ambient+frame.sunColor.rgb*(ndotl+wrap)*shade;
 if(kind>1.5&&kind<2.5){lit+=vec3f(0.19,0.21,0.18);}
 if(kind>2.5&&kind<3.5){lit+=vec3f(.12,.17,.08);}
 let dist=distance(input.world,frame.camera.xyz);
 let fog=1.0-exp(-pow(dist*frame.params.w*1.4,2.0));
 let color=mix(base*lit,frame.fogColor.rgb,fog);
 return vec4f(color,1.0);
}

struct ScreenOut { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
@vertex fn screenVs(@builtin(vertex_index) id:u32)->ScreenOut {
 var out:ScreenOut;
 let p=vec2f(f32((id<<1u)&2u),f32(id&2u));
 out.uv=p;out.clip=vec4f(p*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0.0,1.0);
 return out;
}
@fragment fn skyFs(input:ScreenOut)->@location(0) vec4f {
 let ndc=vec2f(input.uv.x*2.0-1.0,1.0-input.uv.y*2.0);
 let ray=normalize(frame.cameraForward.xyz+frame.cameraRight.xyz*ndc.x*frame.viewport.z*frame.viewport.w+frame.cameraUp.xyz*ndc.y*frame.viewport.z);
 let h=max(ray.y,0.0);
 let sunDir=normalize(frame.sunDir.xyz);
 let sunD=length(ray-sunDir);
 let moonD=length(ray-normalize(frame.moonDir.xyz));
 let sunset=frame.params.z;
 var color=mix(frame.skyHorizon.rgb,frame.skyTop.rgb,pow(h,0.52));
 let sunward=pow(max(dot(ray,sunDir),0.0),8.0);
 color+=vec3f(0.56,0.14,0.035)*exp(-h*8.0)*sunward*sunset;
 color=mix(color,vec3f(0.61,0.25,0.38),exp(-pow((h-0.18)/0.15,2.0))*sunset*0.22);
 let cloudUV=ray.xz/(max(ray.y,0.0)+0.23)*0.38+vec2f(frame.params.x*0.00005,frame.params.x*0.000019);
 let cloud=textureSample(albedo,albedoSampler,cloudUV).r;
 let cloud2=textureSample(albedo,albedoSampler,cloudUV*2.7+0.13).r;
 let density=cloud*0.78+cloud2*0.22;
 let cover=smoothstep(0.48,0.66,density)*smoothstep(-0.01,0.12,ray.y);
 let warm=mix(vec3f(0.68,0.75,0.78),vec3f(1.25,0.60,0.32),sunset*(0.3+0.7*sunward));
 var cloudColor=mix(vec3f(0.19,0.26,0.31),warm,smoothstep(0.48,0.72,density));
 cloudColor+=vec3f(0.8,0.43,0.16)*exp(-sunD*sunD/0.08)*cover*sunset*0.4;
 color=mix(color,cloudColor,cover*0.95);
 let sunVisible=smoothstep(-0.08,0.02,sunDir.y)*smoothstep(-0.03,0.02,ray.y);
 let disc=1.0-smoothstep(0.026,0.033,sunD);
 color+=vec3f(1.8,1.37,0.83)*(disc*sunVisible+0.30*exp(-sunD*sunD/0.003)*sunVisible);
 let moonVisible=smoothstep(-0.06,0.02,frame.moonDir.y)*smoothstep(-0.03,0.02,ray.y);
 color+=vec3f(0.6,0.75,1.0)*(1.0-smoothstep(0.027,0.035,moonD))*moonVisible;
 let starCell=floor(vec2f(atan2(ray.z,ray.x)*57.3,acos(clamp(ray.y,-1.0,1.0))*57.3));
 let star=hash(starCell);
 let starSpot=length(fract(vec2f(atan2(ray.z,ray.x),acos(clamp(ray.y,-1.0,1.0)))*57.3)-vec2f(hash(starCell+1.0),hash(starCell+9.0)));
 color+=vec3f(0.8,0.86,1.0)*step(0.994,star)*(1.0-smoothstep(0.025,0.055,starSpot))*(1.0-frame.params.y)*smoothstep(0.0,0.15,ray.y);
 return vec4f(color,1.0);
}
`;

export const POST_WGSL = /* wgsl */ `
@group(0) @binding(0) var hdr:texture_2d<f32>;
@group(0) @binding(1) var linearSampler:sampler;
struct Out { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) id:u32)->Out {
 var out:Out;let p=vec2f(f32((id<<1u)&2u),f32(id&2u));
 out.uv=p;out.clip=vec4f(p*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0.0,1.0);return out;
}
@fragment fn fs(input:Out)->@location(0) vec4f {
 let c=textureSample(hdr,linearSampler,input.uv).rgb*1.0;
 let a=2.51;let b=0.03;let d=0.59;let e=0.14;
 let mapped=clamp((c*(a*c+b))/(c*(2.43*c+d)+e),vec3f(0.0),vec3f(1.0));
 return vec4f(pow(mapped,vec3f(1.0/2.2)),1.0);
}
`;
