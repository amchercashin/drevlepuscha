export const REGION_WGSL=/* wgsl */`
struct Frame {
 viewProjection:mat4x4f,
 sunDirection:vec4f,eye:vec4f,sun:vec4f,ambient:vec4f,
 fog:vec4f,skyZenith:vec4f,skyHorizon:vec4f,
 waterShallow:vec4f,waterDeep:vec4f,terrainTint:vec4f,foliageTint:vec4f,
 misc:vec4f,
 lightProjection:mat4x4f,
 cameraRight:vec4f,cameraUp:vec4f,cameraForward:vec4f,heroFeet:vec4f,
 river:vec4f,wake:vec4f,
};
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var groundDetail:texture_2d<f32>;
@group(0) @binding(2) var groundSampler:sampler;
@group(0) @binding(3) var shadowMap:texture_depth_2d;
@group(0) @binding(4) var shadowSampler:sampler_comparison;
@group(0) @binding(5) var cloudNoise:texture_2d<f32>;
@group(0) @binding(6) var cloudSampler:sampler;
@group(0) @binding(7) var opaqueScene:texture_2d<f32>;
@group(0) @binding(8) var sceneSampler:sampler;
@group(1) @binding(0) var albedo:texture_2d<f32>;
@group(1) @binding(1) var linearSampler:sampler;
@group(1) @binding(2) var<uniform> material:vec4f;
@group(2) @binding(0) var<storage,read> bones:array<mat4x4f>;

struct MeshVertex {
 @location(0) position:vec3f,@location(1) normal:vec3f,
 @location(2) uv:vec2f,@location(3) color:vec4f,
 @location(4) m0:vec4f,@location(5) m1:vec4f,@location(6) m2:vec4f,@location(7) m3:vec4f,
 @location(8) tint:vec4f,
};
struct SkinnedVertex {
 @location(0) position:vec3f,@location(1) normal:vec3f,
 @location(2) uv:vec2f,@location(9) joints:vec4f,@location(10) weights:vec4f,
 @location(4) m0:vec4f,@location(5) m1:vec4f,@location(6) m2:vec4f,@location(7) m3:vec4f,
 @location(8) tint:vec4f,
};
struct FragmentInput {
 @builtin(position) clip:vec4f,@location(0) world:vec3f,
 @location(1) normal:vec3f,@location(2) uv:vec2f,@location(3) color:vec4f,
};
fn windPosition(v:MeshVertex)->vec3f {
 var local=v.position;
 if(material.x>.5 && material.x<1.5){
  let height=pow(clamp(local.y/9.,0.,1.),1.7);
  let gust=sin(frame.misc.x*.91+v.m3.x*.043+v.m3.z*.057+local.y*.23);
  let bend=height*(.10*sin(frame.misc.x*.58+v.m3.z*.067)+.13*gust)*frame.heroFeet.w;
  local.x+=bend*.82;local.z+=bend*.57;
 }
 if(material.x>4.5 && material.x<6.5){
  let bend=v.color.a*v.color.a*frame.heroFeet.w;
  let wave=sin(frame.misc.x*1.8+v.m3.x*.17+v.m3.z*.11+local.x*.31+local.z*.17);
  local.x+=bend*(.045+.04*wave);local.z+=bend*(.025+.032*wave);
 }
 if(material.x>7. && material.x<8.){
  local.y+=v.color.a*.27*sin(frame.misc.x*8.5);
 }
 return local;
}
fn baseMeshVertex(v:MeshVertex)->FragmentInput {
 let model=mat4x4f(v.m0,v.m1,v.m2,v.m3);
 var world=(model*vec4f(windPosition(v),1.)).xyz;
 world.x-=frame.misc.y;world.z+=frame.misc.z;
 if(material.x>.1 && material.x<.3){
  let near=1.-smoothstep(260.,420.,distance(world.xz,frame.heroFeet.xz));
  world.y-=6.*near;
 }
 if(material.x>2.5 && material.x<3.5){world.y+=frame.misc.w;}
 var out:FragmentInput;out.clip=frame.viewProjection*vec4f(world,1.);
 out.world=world;out.normal=normalize((model*vec4f(v.normal,0.)).xyz);
 out.uv=v.uv;out.color=v.color*v.tint;return out;
}
@vertex fn meshVertex(v:MeshVertex)->FragmentInput {return baseMeshVertex(v);}
fn baseShadowVertex(v:MeshVertex)->FragmentInput {
 let model=mat4x4f(v.m0,v.m1,v.m2,v.m3);
 var world=(model*vec4f(windPosition(v),1.)).xyz;
 world.x-=frame.misc.y;world.z+=frame.misc.z;
 var out:FragmentInput;out.clip=frame.lightProjection*vec4f(world,1.);
 out.world=world;out.normal=v.normal;out.uv=v.uv;out.color=v.color;return out;
}
@vertex fn shadowVertex(v:MeshVertex)->FragmentInput {return baseShadowVertex(v);}
fn skinned(v:SkinnedVertex)->MeshVertex {
 let skin=bones[u32(v.joints.x)]*v.weights.x+bones[u32(v.joints.y)]*v.weights.y+
  bones[u32(v.joints.z)]*v.weights.z+bones[u32(v.joints.w)]*v.weights.w;
 let position=(skin*vec4f(v.position,1.)).xyz;
 let normal=normalize((skin*vec4f(v.normal,0.)).xyz);
 return MeshVertex(position,normal,v.uv,vec4f(1.),v.m0,v.m1,v.m2,v.m3,v.tint);
}
@vertex fn skinnedVertex(v:SkinnedVertex)->FragmentInput {return baseMeshVertex(skinned(v));}
@vertex fn skinnedShadowVertex(v:SkinnedVertex)->FragmentInput {return baseShadowVertex(skinned(v));}
@fragment fn shadowFragment(v:FragmentInput){
 if(material.z>0. && textureSample(albedo,linearSampler,v.uv).a<material.z){discard;}
}
fn aces(x:vec3f)->vec3f {return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.));}
@fragment fn meshFragment(v:FragmentInput)->@location(0) vec4f {
 if(material.x>2.5 && material.x<3.5 && v.color.a+frame.misc.w<.015){discard;}
 if(material.x>.5 && material.x<2.1){
  let sight=frame.heroFeet.xz-frame.eye.xz;
  let t=dot(v.world.xz-frame.eye.xz,sight)/max(dot(sight,sight),.01);
  if(t>.05&&t<.97){
   let clearance=distance(v.world.xz,mix(frame.eye.xz,frame.heroFeet.xz,t));
   let keep=mix(.13,1.,smoothstep(.65,2.15,clearance));
   let noise=fract(sin(dot(floor(v.clip.xy),vec2f(91.345,17.271)))*47453.58);
   if(noise>keep){discard;}
  }
 }
 if(material.x>3.5 && material.x<4.5){
  let coverage=smoothstep(580.,800.,distance(v.world.xz,frame.eye.xz));
  let stipple=fract(sin(dot(floor(v.clip.xy),vec2f(12.9898,78.233)))*43758.5453);
  if(stipple>coverage){discard;}
 }
 let tex=textureSample(albedo,linearSampler,v.uv);
 if(material.z>0. && tex.a<material.z){discard;}
 var n=normalize(v.normal);
 var base=tex.rgb*v.color.rgb;
 if(material.x<.1){
  let detail=textureSample(groundDetail,groundSampler,v.world.xz*.23).rgb;
  let path=smoothstep(-.015,.055,base.r-base.g);
  let fine=sin(v.world.x*.73)*sin(v.world.z*.61)+sin(v.world.x*2.87+v.world.z*1.21)*.42;
  let grain=textureSample(groundDetail,groundSampler,v.world.xz*1.37).g;
  base=base*(.86+.06*fine+.11*grain);
  base=mix(base,detail*(.75+base.g*.7),.22+.56*path);
  base*=frame.terrainTint.rgb;
 }
 if(material.x>.5 && material.x<1.5){base*=frame.foliageTint.rgb;}
 if(material.x>4.5 && material.x<6.5){base*=frame.foliageTint.rgb;}
 if(material.x>2.5 && material.x<3.5){
  let flow=normalize(frame.river.xy);
  let across=vec2f(-flow.y,flow.x);
  let along=dot(v.world.xz,flow);
  let side=dot(v.world.xz,across);
  let time=frame.misc.x;
  let warp=textureSampleLevel(cloudNoise,cloudSampler,v.world.xz*.035+flow*time*.008,0.).rg-.5;
  let longWave=along*.91-time*.72+sin(side*.41+warp.y)*.34+warp.x*1.6;
  let shortWave=along*2.47+side*1.67-time*1.31+warp.y*2.1;
  let sideWave=side*1.84+along*.28-time*.41+warp.x*1.3;
  let slopeAlong=(.032*cos(longWave)+.013*cos(shortWave))*frame.river.w;
  let slopeSide=(.020*cos(sideWave)+.009*cos(shortWave))*frame.river.w;
  let slope=flow*slopeAlong+across*slopeSide;
  n=normalize(vec3f(-slope.x,1.,-slope.y));
  let depth=max(0.,v.color.a+frame.misc.w);
  let deep=1.-exp(-depth/max(frame.river.z,.2));
  base=mix(frame.waterShallow.rgb,frame.waterDeep.rgb,deep);
 }
 let sun=max(dot(n,normalize(frame.sunDirection.xyz)),0.);
 let lightClip=frame.lightProjection*vec4f(v.world,1.);
 let shadowUv=lightClip.xy/lightClip.w*vec2f(.5,-.5)+vec2f(.5,.5);
 var shade=1.;
 if(all(shadowUv>=vec2f(0.))&&all(shadowUv<=vec2f(1.))&&lightClip.z>0.&&lightClip.z<lightClip.w){
  let depth=lightClip.z/lightClip.w-.002;
  shade=.24+.76*textureSampleCompareLevel(shadowMap,shadowSampler,shadowUv,depth);
 }
 let bounce=max(dot(n,vec3f(0.,1.,0.)),0.);
 var lit=base*(frame.ambient.rgb*(.72+.28*bounce)+frame.sun.rgb*sun*shade*.86);
 let distance=length(v.world-frame.eye.xyz);let fog=1.-exp(-distance/max(frame.fog.w,1.));
 lit=mix(lit,frame.fog.rgb,clamp(fog,0.,.98));
 if(material.x>2.5 && material.x<3.5){
  // River adaptation of Tidewater's opaque-scene refraction, depth absorption and Fresnel split.
  let depth=max(0.,v.color.a+frame.misc.w);
  let view=normalize(frame.eye.xyz-v.world);
  let uv=v.clip.xy/vec2f(textureDimensions(opaqueScene));
  let bend=vec2f(n.x,-n.z)*.046*smoothstep(.05,1.7,depth);
  let scene=textureSampleLevel(opaqueScene,sceneSampler,clamp(uv+bend,vec2f(.001),vec2f(.999)),0.).rgb;
  let path=depth/max(view.y,.25);
  let absorption=exp(-vec3f(1.40,.84,.50)*path/max(frame.river.z,.2));
  let transmitted=scene*absorption+aces(lit*1.17)*(vec3f(1.)-absorption);
  let reflectedRay=reflect(-view,n);
  let skyHeight=clamp(reflectedRay.y*1.65+.04,0.,1.);
  let reflected=aces(mix(frame.skyHorizon.rgb,frame.skyZenith.rgb,pow(skyHeight,.73))*1.18);
  let fresnel=.0204+.9796*pow(1.-clamp(dot(n,view),0.,1.),5.);
  var river=mix(transmitted,reflected,fresnel);
  let halfVector=normalize(normalize(frame.sunDirection.xyz)+view);
  river+=aces(frame.sun.rgb*pow(max(dot(n,halfVector),0.),95.)*.58*shade);
  let flow=normalize(frame.river.xy);
  let foamUv=v.world.xz*.115-flow*frame.misc.x*.022;
  let foamNoise=textureSampleLevel(cloudNoise,cloudSampler,foamUv,0.).r;
  let shore=1.-smoothstep(.04,.52,depth);
  var foam=shore*(.055+.48*smoothstep(.56,.77,foamNoise));
  // A local, speed-driven V wake keeps the river cheap when the boat is still.
  if(frame.wake.w>.05){
   let heading=vec2f(sin(frame.wake.z),-cos(frame.wake.z));
   let offset=v.world.xz-frame.wake.xy;
   let aft=-dot(offset,heading);
   let side=abs(dot(offset,vec2f(-heading.y,heading.x)));
   let arm=aft*.19+.6;
   let fork=exp(-pow((side-arm)/(.25+max(aft,0.)*.055),2.))*smoothstep(.1,1.3,aft)*(1.-smoothstep(15.,24.,aft));
   let stern=exp(-dot(offset,offset)/3.8);
   foam=max(foam,(fork*.43+stern*.22)*clamp(frame.wake.w/2.5,0.,1.));
  }
  river=mix(river,vec3f(.67,.73,.65),foam);
  river=mix(river,aces(frame.fog.rgb*1.17),clamp(fog,0.,.98));
  return vec4f(clamp(river,vec3f(0.),vec3f(1.)),1.);
 }
 return vec4f(aces(lit*1.17),1.);
}

struct SkyOut {@builtin(position) clip:vec4f,@location(0) uv:vec2f};
@vertex fn skyVertex(@builtin(vertex_index) i:u32)->SkyOut {
 var out:SkyOut;let x=f32((i<<1u)&2u);let y=f32(i&2u);
 out.clip=vec4f(x*2.-1.,1.-y*2.,0.,1.);out.uv=vec2f(x,y);return out;
}
@fragment fn skyFragment(v:SkyOut)->@location(0) vec4f {
 let xy=vec2f(v.uv.x*2.-1.,1.-v.uv.y*2.);
 let ray=normalize(frame.cameraForward.xyz+frame.cameraRight.xyz*xy.x*frame.cameraRight.w+frame.cameraUp.xyz*xy.y*frame.cameraUp.w);
 let height=clamp(ray.y*1.65+.04,0.,1.);
 var sky=mix(frame.skyHorizon.rgb,frame.skyZenith.rgb,pow(height,.73));
 let sunAngle=max(dot(ray,normalize(frame.sunDirection.xyz)),0.);
 let sunDisk=smoothstep(.9993,.9997,sunAngle);
 let halo=pow(sunAngle,24.)*.16+pow(sunAngle,180.)*.24;
 sky+=frame.sun.rgb*(sunDisk*1.7+halo);
 let cloudPlane=ray.xz/max(.10,ray.y+.18);
 let drift=vec2f(frame.misc.x*.0018,-frame.misc.x*.0011);
 let warp=textureSample(cloudNoise,cloudSampler,cloudPlane*.035+drift*.4).ba-.5;
 let lowUv=cloudPlane*.29+warp*.09+drift;
 let highUv=vec2f(cloudPlane.x*.72-cloudPlane.y*.5,cloudPlane.x*.5+cloudPlane.y*.72)*.12-warp*.035-drift*.5;
 let low=textureSample(cloudNoise,cloudSampler,lowUv).r*.82+textureSample(cloudNoise,cloudSampler,lowUv*2.7+drift).r*.18;
 let high=textureSample(cloudNoise,cloudSampler,highUv).g;
 let threshold=1.06-1.12*frame.cameraForward.w;
 let lowMask=smoothstep(threshold-.055,threshold+.055,low)*smoothstep(-.05,.08,ray.y);
 let highMask=smoothstep(threshold+.12,threshold+.21,high)*smoothstep(-.05,.14,ray.y);
 let cloudBody=frame.skyHorizon.rgb*.57+vec3f(.09,.10,.11);
 let cloudTop=vec3f(1.25,1.29,1.20)*(.86+.14*sunAngle);
 let cloud=mix(cloudBody,cloudTop,smoothstep(.43,.62,low));
 sky=mix(sky,frame.skyHorizon.rgb*.83,highMask*.27);
 sky=mix(sky,cloud,lowMask*.96);
 return vec4f(aces(sky*1.18),1.);
}
`;
