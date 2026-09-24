import {TRAIL_EDGE_WGSL} from '../runtime/trail-edge.wgsl.ts';

export const FRAME_WGSL = /* wgsl */ `
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
 skyLowShape:vec4f,
 skyHighShape:vec4f,
 skyLowScaleOffset:vec4f,
 skyHighScaleOffset:vec4f,
 skyDetailOffsets:vec4f,
 skyWarpTimeQuality:vec4f,
 skyOptions:vec4f,
 moonOptions:vec4f,
 moonRight:vec4f,
 moonUp:vec4f,
 weather:vec4f,
};
@group(0) @binding(0) var<uniform> frame:Frame;
`;

export const SCENE_WGSL = /* wgsl */ `${TRAIL_EDGE_WGSL}${FRAME_WGSL}
struct Material { kindOpacity:vec4f, tint:vec4f };
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
@group(1) @binding(8) var moonMap:texture_2d<f32>;
@group(1) @binding(9) var moonSampler:sampler;
@group(1) @binding(10) var groundContact:texture_2d<f32>;
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
 if((material.kindOpacity.x>0.5 && material.kindOpacity.x<1.5)||(material.kindOpacity.x>4.5&&material.kindOpacity.x<5.5)) {
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
fn shadeScene(input:VertexOut)->vec4f {
 let kind=material.kindOpacity.x;
 let texel=textureSample(albedo,albedoSampler,input.uv);
 let opacity=material.kindOpacity.y*input.tone.w;
 if(kind>2.5&&kind<3.5&&texel.a<0.46){discard;}
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
  base=pow(farColor,vec3f(2.2))*(0.94+0.12*dot(texel.rgb,vec3f(.30,.59,.11)));
  let distanceToEye=distance(input.world,frame.camera.xyz);
  let detailRange=select(select(26.0,56.0,frame.skyWarpTimeQuality.w>0.5),80.0,frame.skyWarpTimeQuality.w>1.5);
  let uv=vec2f(0.8660254*en.x-0.5*en.y,0.5*en.x+0.8660254*en.y)/3.2+(field.ba-0.5)*0.9;
  let uvDx=dpdx(uv);let uvDy=dpdy(uv);
  let enDx=dpdx(en);let enDy=dpdy(en);
  if(distanceToEye<detailRange){
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
   let detail=1.0-smoothstep(detailRange*.6,detailRange,distanceToEye);
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
 let wrap=select(0.0,max(dot(-n,frame.lightDir.xyz),0.0)*0.25,(kind>0.5&&kind<1.5)||(kind>2.5&&kind<3.5)||(kind>4.5&&kind<5.5));
 let shade=shadowFactor(input.world,n);
 var ambient=frame.ambient.rgb*(0.70+0.30*max(n.y,0.0));
 if(kind<0.5){
  let en=vec2f(input.world.x,-input.world.z);
  let contact=textureSample(groundContact,albedoSampler,(en+vec2f(256.0))/vec2f(512.0,640.0)).r;
  ambient*=1.0-.43*contact;
 }
 var lit=ambient+frame.sunColor.rgb*(ndotl+wrap)*shade;
 if(kind>1.5&&kind<2.5){lit+=vec3f(0.19,0.21,0.18);}
 if(kind>2.5&&kind<3.5){lit+=vec3f(.12,.17,.08);}
 let dist=distance(input.world,frame.camera.xyz);
 let fog=1.0-exp(-pow(dist*frame.params.w*1.4,2.0));
 var color=mix(base*lit,frame.fogColor.rgb,fog);
 if(frame.weather.y>0.5){
  let viewRay=normalize(input.world-frame.camera.xyz);
  let alignment=pow(max(dot(viewRay,normalize(frame.sunDir.xyz)),0.0),12.0);
  let glow=frame.weather.z*frame.params.y*alignment*(1.0-exp(-dist*.012))*(.35+.65*shade)*.16;
  color+=vec3f(.75,.68,.48)*glow;
 }
 return vec4f(color,opacity);
}
@fragment fn fs(input:VertexOut)->@location(0) vec4f {
 let shaded=shadeScene(input);
 if(shaded.a<0.999&&hash(floor(input.clip.xy))>shaded.a){discard;}
 return vec4f(shaded.rgb,1.0);
}
@fragment fn fsBlend(input:VertexOut)->@location(0) vec4f {
 return shadeScene(input);
}

struct ScreenOut { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
@vertex fn screenVs(@builtin(vertex_index) id:u32)->ScreenOut {
 var out:ScreenOut;
 let p=vec2f(f32((id<<1u)&2u),f32(id&2u));
 out.uv=p;out.clip=vec4f(p*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0.0,1.0);
 return out;
}
fn cloudMask(density:f32,coverage:f32)->f32 {
 let threshold=1.06-1.12*coverage;
 return smoothstep(threshold-.06,threshold+.06,density);
}
fn cloudTransmission(density:f32,mask:f32,depth:f32)->f32 {
 return max(0.0,(exp(-depth*mask*(.5+.5*density))-.001)/.999);
}
fn cloudColor(density:f32,mask:f32,ray:vec3f,sunDistance:f32)->vec3f {
 let daylight=frame.params.y;let sunset=frame.params.z;
 let body=mix(vec3f(.028,.042,.072),vec3f(.42,.52,.60),daylight);
 let top=mix(vec3f(.12,.17,.25),vec3f(1.0,.97,.88),daylight);
 let warm=mix(top,vec3f(1.0,.48,.24),sunset*.7);
 let sculpt=smoothstep(.48,.72,density);
 var color=mix(body,warm,sculpt);
 let edge=pow(max(0.0,1.0-abs(mask-.45)*2.0),3.0);
 color+=mix(vec3f(.4,.54,.8),vec3f(1.0,.91,.66),daylight)*edge*exp(-sunDistance*sunDistance/.12)*.3;
 return mix(frame.skyHorizon.rgb,color,smoothstep(-.06,.10,ray.y));
}
@fragment fn skyFs(input:ScreenOut)->@location(0) vec4f {
 let ndc=vec2f(input.uv.x*2.0-1.0,1.0-input.uv.y*2.0);
 let ray=normalize(frame.cameraForward.xyz+frame.cameraRight.xyz*ndc.x*frame.viewport.z*frame.viewport.w+frame.cameraUp.xyz*ndc.y*frame.viewport.z);
 let up=max(ray.y,0.0);let sunDir=normalize(frame.sunDir.xyz);let moonDir=normalize(frame.moonDir.xyz);
 let sunD=length(ray-sunDir);let moonD=length(ray-moonDir);let sunVisible=smoothstep(-.085,.005,sunDir.y)*smoothstep(-.035,.015,ray.y);
 let sunset=frame.params.z;
 var color=mix(frame.skyHorizon.rgb,frame.skyTop.rgb,pow(up,.48));
 let sunward=pow(max(dot(ray,sunDir),0.0),4.0);
 color+=vec3f(.43,.12,.035)*exp(-up*7.0)*sunward*sunset;
 color=mix(color,vec3f(.53,.20,.36),exp(-pow((up-.18)/.15,2.0))*sunset*(.12+.25*sunward));
 let sunRadius=mix(.031,.048,1.0-smoothstep(0.0,.32,abs(sunDir.y)));
 let sunDisc=1.0-smoothstep(sunRadius-.002,sunRadius+.002,sunD);
 let sunTint=mix(vec3f(1.0,.91,.66),vec3f(1.0,.29,.09),sunset);
 color+=sunTint*(exp(-sunD*sunD/.055)*.23+exp(-sunD*sunD/.005)*.48)*sunVisible;
 color=mix(color,mix(vec3f(1.65,1.52,1.2),vec3f(1.0,.38,.15),sunset),sunDisc*sunVisible);
 let moonRadius=.045*frame.skyOptions.z;
 let noEclipse=smoothstep(sunRadius+moonRadius,(sunRadius+moonRadius)*1.6,length(moonDir-sunDir));
 let moonVisible=smoothstep(-.085,.005,moonDir.y)*smoothstep(-.035,.015,ray.y)*noEclipse;
 let moonDisc=1.0-smoothstep(moonRadius-.002,moonRadius+.002,moonD);
 let moonXY=vec2f(dot(ray,frame.moonRight.xyz),dot(ray,frame.moonUp.xyz))/max(.001,moonRadius);
 let lunar=textureSample(moonMap,moonSampler,moonXY*vec2f(.5,-.5)+.5).rgb;
 let relief=sqrt(max(0.0,1.0-dot(moonXY,moonXY)));
 let moonLight=vec3f(dot(sunDir,frame.moonRight.xyz),dot(sunDir,frame.moonUp.xyz),-dot(sunDir,moonDir));
 let lit=smoothstep(-.015,.015,dot(vec3f(moonXY,relief),moonLight));
 let lunarColor=mix(mix(lunar*.025,color,frame.params.y),lunar*frame.skyOptions.w*(1.0-frame.moonOptions.y*(1.0-relief)),lit);
 color+=vec3f(.6,.72,1.0)*exp(-moonD*moonD/.003)*frame.moonOptions.x*frame.moonOptions.w*moonVisible*.2;
 color=mix(color,lunarColor,moonDisc*moonVisible);
 let starCell=floor(vec2f(atan2(ray.z,ray.x)*57.3,acos(clamp(ray.y,-1.0,1.0))*57.3));
 let star=hash(starCell);let starSpot=length(fract(vec2f(atan2(ray.z,ray.x),acos(clamp(ray.y,-1.0,1.0)))*57.3)-vec2f(hash(starCell+1.0),hash(starCell+9.0)));
 let twinkle=1.0+frame.skyOptions.y*sin(frame.skyWarpTimeQuality.z*11.0+star*21.0);
 color+=vec3f(.8,.86,1.0)*step(.994,star)*(1.0-smoothstep(.025,.055,starSpot))*frame.skyOptions.x*twinkle*(1.0-frame.params.y)*smoothstep(0.0,.15,ray.y);
 let p=ray.xz/(up+.18);
 let warp=textureSample(albedo,albedoSampler,p*.19+frame.skyWarpTimeQuality.xy).ba-.5;
 let lowUV=p*frame.skyLowScaleOffset.xy+frame.skyLowScaleOffset.zw+warp*frame.skyLowShape.w;
 let lowDetailUV=p*frame.skyLowScaleOffset.xy*frame.skyLowShape.z+frame.skyDetailOffsets.xy+warp*frame.skyLowShape.w*frame.skyLowShape.z;
 let highP=vec2f(p.x*.8-p.y*.6,p.x*.6+p.y*.8);let highWarp=vec2f(-warp.y,warp.x)*frame.skyHighShape.w;
 let highUV=highP*frame.skyHighScaleOffset.xy+frame.skyHighScaleOffset.zw+highWarp;
 let highDetailUV=highP*frame.skyHighScaleOffset.xy*frame.skyHighShape.z+frame.skyDetailOffsets.zw+highWarp*frame.skyHighShape.z;
 let lowDensity=textureSample(albedo,albedoSampler,lowUV).r*.83+textureSample(albedo,albedoSampler,lowDetailUV).r*.17;
 let highDensity=textureSample(albedo,albedoSampler,highUV).g*.88+textureSample(albedo,albedoSampler,highDetailUV).g*.12;
 let lowMask=cloudMask(lowDensity,frame.skyLowShape.x);let highMask=cloudMask(highDensity,frame.skyHighShape.x);
 let lowT=cloudTransmission(lowDensity,lowMask,frame.skyLowShape.y);let highT=cloudTransmission(highDensity,highMask,frame.skyHighShape.y);
 color=color*highT+cloudColor(highDensity,highMask,ray,sunD)*(1.0-highT);
 color=color*lowT+cloudColor(lowDensity,lowMask,ray,sunD)*(1.0-lowT);
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

export const RAIN_WGSL = /* wgsl */ `${FRAME_WGSL}
struct Drop { column:vec4f, motion:vec4f };
@group(1) @binding(0) var<storage,read> drops:array<Drop>;
struct RainOut {
 @builtin(position) clip:vec4f,
 @location(0) uv:vec2f,
 @location(1) world:vec3f,
 @location(2) floor:f32,
 @location(3) alpha:f32,
};
@vertex fn rainVs(@builtin(vertex_index) id:u32,@builtin(instance_index) instance:u32)->RainOut {
 let drop=drops[instance];let column=drop.column;let motion=drop.motion;
 let corner=vec2f(select(-.5,.5,id==1u||id==2u||id==4u),select(-.5,.5,id==2u||id==4u||id==5u));
 let phase=fract(frame.params.x*motion.y/256.0+motion.x);
 let heavy=smoothstep(.4,1.0,frame.weather.x);
 let y=column.z+(1.0-phase)*24.0;
 let world=vec3f(column.x,y,column.y)+frame.cameraRight.xyz*corner.x*(.026+.004*heavy)+vec3f(0.0,corner.y*motion.z*(1.0+.55*heavy),0.0);
 let radial=1.0-smoothstep(12.0,16.0,length(world.xz-frame.camera.xz));
 let respawn=smoothstep(0.0,.055,phase)*(1.0-smoothstep(.92,1.0,phase));
 let amount=smoothstep(motion.w,motion.w+.08,frame.weather.x);
 var out:RainOut;out.clip=frame.viewProj*vec4f(world,1.0);out.uv=corner+.5;out.world=world;out.floor=column.w;
 out.alpha=radial*respawn*amount*(1.0+.23*heavy);return out;
}
@fragment fn rainFs(input:RainOut)->@location(0) vec4f {
 if(input.world.y<input.floor){discard;}
 let width=1.0-smoothstep(.12,.5,abs(input.uv.x-.5));
 let ends=smoothstep(0.0,.15,input.uv.y)*(1.0-smoothstep(.7,1.0,input.uv.y));
 let haze=exp(-frame.params.w*distance(input.world,frame.camera.xyz));
 let color=vec3f(.22+frame.params.y*.48,.29+frame.params.y*.47,.39+frame.params.y*.45);
 return vec4f(color,width*ends*input.alpha*haze*.32);
}
`;
