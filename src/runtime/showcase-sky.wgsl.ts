/** Babylon WGSL preprocessing. One opaque sphere; no intermediate render targets. */
export const skyVertex=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`;
export const skyFragment=`
varying skyDirection:vec3f;
uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;
uniform moonRight:vec3f;uniform moonUp:vec3f;uniform lightSource:vec3f;
uniform moonIllumination:f32;uniform sourcePower:f32;
uniform stars:f32;uniform starRotation:vec2f;uniform twinklePhase:f32;
uniform daylight:f32;uniform sunset:f32;uniform quality:f32;
uniform starSettings:vec2f;uniform moonSettings:vec4f;
uniform lowShape:vec4f;uniform highShape:vec4f;uniform lowScale:vec2f;uniform highScale:vec2f;
uniform lowBase:vec2f;uniform lowDetail:vec2f;uniform highBase:vec2f;uniform highDetail:vec2f;uniform warpOffset:vec2f;
var cloudMap:texture_2d<f32>;var cloudMapSampler:sampler;
var moonMap:texture_2d<f32>;var moonMapSampler:sampler;

fn starHash(x:i32,y:i32,salt:u32)->u32 {
 let wrapped=((x%360)+360)%360;
 var h=u32(wrapped)*374761393u+u32(y)*668265263u+37u+salt*2246822519u;
 h=(h^(h>>13u))*1274126177u;return h^(h>>16u);
}
fn starRandom(x:i32,y:i32,salt:u32)->f32 {return f32(starHash(x,y,salt)>>8u)/16777216.0;}
fn starField(dir:vec3f,pixel:f32,moonDistance:f32)->vec3f {
 // Longitude is undefined exactly at either pole; its faded-out value must stay finite.
 let longitude=atan2(dir.z,select(dir.x,0.000001,abs(dir.x)+abs(dir.z)<0.000001));
 let q=vec2f(longitude/6.283185307+0.5,acos(clamp(dir.y,-1.0,1.0))/3.141592654)*vec2f(360.0,180.0);
 let cell=vec2i(floor(q));let latitudeScale=length(dir.xz);
 let stepAngle=vec2f(0.017453293*max(latitudeScale,0.001),0.017453293);
 var result=vec3f(0.0);
 for(var y=-1;y<=1;y++) {for(var x=-1;x<=1;x++) {
  let c=cell+vec2i(x,y);
  if(c.y>=0&&c.y<180) {
   let population=starRandom(c.x,c.y,0u);
   if(population>0.976) {
    // Unwrapped local cell for position; only hash wraps at the longitude seam.
    let offset=vec2f(starRandom(c.x,c.y,1u),starRandom(c.x,c.y,2u))*0.7+0.15;
    let distance=length((q-(vec2f(c)+offset))*stepAngle);
    let bright=step(0.9995,population);let medium=step(0.996,population);
    let radius=0.00045+0.00024*medium+0.00065*bright;
    let aa=max(pixel*0.55,0.00004);
    let point=(1.0-smoothstep(max(0.0,radius-aa),radius+aa,distance))*radius*radius/(radius*radius+aa*aa);
    let halo=exp(-distance*distance/(radius*radius*7.0))*0.10*bright;
    let phase=starRandom(c.x,c.y,3u)*6.283185307;
    let harmonic=8.0+floor(starRandom(c.x,c.y,4u)*17.0);
    let twinkle=1.0+uniforms.starSettings.y*sin(uniforms.twinklePhase*harmonic+phase);
    let tint=starRandom(c.x,c.y,5u);
    let colour=mix(mix(vec3f(0.79,0.87,1.0),vec3f(1.0),smoothstep(0.15,0.65,tint)),vec3f(1.0,0.88,0.74),smoothstep(0.86,1.0,tint));
    let weakContrast=mix(mix(1.0,0.57,uniforms.moonIllumination),1.0,medium)*(1.0-(1.0-medium)*exp(-moonDistance*moonDistance/0.08)*0.6*uniforms.moonIllumination);
    result+=colour*(point+halo)*(0.55+0.45*medium+1.0*bright)*twinkle*weakContrast;
   }
  }
 }}
 return result*smoothstep(0.015,0.10,latitudeScale);
}
fn cloudMask(f:f32,coverage:f32)->f32 {
 let threshold=mix(1.06,-0.06,coverage);return smoothstep(threshold-0.06,threshold+0.06,f);
}
fn transmission(f:f32,mask:f32,depth:f32)->f32 {return max(0.0,(exp(-depth*mask*(0.5+0.5*f))-0.001)/0.999);}
fn cloudColour(density:f32,mask:f32,sculpt:f32,dir:vec3f,sourceDistance:f32,sourceVisible:f32)->vec3f {
 let sunward=pow(max(0.0,dot(dir,uniforms.solar)),4.0);
 let darkBase=mix(vec3f(0.028,0.042,0.072),vec3f(0.42,0.52,0.60),uniforms.daylight);
 let litTop=mix(vec3f(0.12,0.17,0.25)*sourceVisible,vec3f(1.0,0.97,0.88),uniforms.daylight);
 let coldMass=mix(darkBase,vec3f(0.28,0.16,0.30),uniforms.sunset*0.80);
 let warmLight=mix(litTop,vec3f(1.0,0.48,0.24),uniforms.sunset*(0.45+sunward*0.55));
 var colour=mix(coldMass,warmLight,clamp(sculpt*0.8+(1.0-smoothstep(0.52,0.73,density))*0.30,0.0,1.0));
 let edge=pow(max(0.0,1.0-abs(mask-0.45)*2.0),3.0);
 let edgeTint=mix(vec3f(0.40,0.54,0.80),mix(vec3f(1.0,0.91,0.66),vec3f(1.0,0.40,0.18),uniforms.sunset),uniforms.daylight);
 colour+=edgeTint*edge*exp(-sourceDistance*sourceDistance/0.12)*sourceVisible*0.40;
 return mix(uniforms.horizon,colour,smoothstep(-0.06,0.10,dir.y));
}
@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);let up=max(dir.y,0.0);
 let sunset=uniforms.sunset;let sunD=length(dir-uniforms.solar);let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0003);let moonAA=max(fwidth(moonD),0.0003);
 let horizonMask=smoothstep(-0.035,0.015,dir.y);
 let sunVisible=smoothstep(-0.085,0.005,uniforms.solar.y)*horizonMask;
 let sunRadius=mix(0.031,0.048,1.0-smoothstep(0.0,0.32,abs(uniforms.solar.y)));
 let moonRadius=mix(0.040,0.052,1.0-smoothstep(0.0,0.30,abs(uniforms.lunar.y)))*uniforms.moonSettings.x;
 // Coplanar artistic orbits do not simulate eclipses; also suppress occultation.
 let separation=length(uniforms.lunar-uniforms.solar);
 let noEclipse=smoothstep(sunRadius+moonRadius,(sunRadius+moonRadius)*1.6,separation);
 let moonVisible=smoothstep(-0.085,0.005,uniforms.lunar.y)*horizonMask*noEclipse;
 let sunDisc=1.0-smoothstep(sunRadius-sunAA,sunRadius+sunAA,sunD);
 let moonDisc=1.0-smoothstep(moonRadius-moonAA,moonRadius+moonAA,moonD);
 let sunward=pow(max(0.0,dot(dir,uniforms.solar)),4.0);
 let twilight=1.0-smoothstep(0.0,0.30,abs(uniforms.solar.y));
 let top=mix(uniforms.zenith,vec3f(0.16,0.12,0.29),sunset*0.60);
 let horizon=mix(uniforms.horizon,vec3f(0.80,0.26,0.19),sunset*0.70);
 var colour=mix(horizon,top,pow(up,0.48));
 colour+=vec3f(0.43,0.12,0.035)*exp(-up*7.0)*sunward*sunset;
 colour=mix(colour,vec3f(0.53,0.20,0.36),exp(-pow((up-0.18)/0.15,2.0))*sunset*(0.12+0.25*sunward));
 colour+=vec3f(0.28,0.12,0.15)*twilight*exp(-up*9.0)*(1.0-uniforms.daylight)*0.3;
 let atmosphere=colour;
 // Derivatives use the continuous direction, never wrapped longitude or fract(q).
 let rot=uniforms.starRotation;
 let starDirection=vec3f(rot.x*dir.x-rot.y*dir.z,dir.y,rot.y*dir.x+rot.x*dir.z);
 let angularPixel=max(length(dpdx(starDirection)),length(dpdy(starDirection)));
 if(uniforms.stars>0.001) {
  colour+=starField(starDirection,angularPixel,moonD)*uniforms.stars*uniforms.starSettings.x*smoothstep(0.0,0.15,dir.y)*(1.0-moonDisc*moonVisible)*(1.0-sunDisc*sunVisible);
 }
 let sunTint=mix(vec3f(1.0,0.91,0.66),vec3f(1.0,0.29,0.09),sunset);
 let halo=exp(-sunD*sunD/0.055)*0.23+exp(-sunD*sunD/0.005)*0.48;
 colour+=sunTint*halo*sunVisible;
 let corona=exp(-max(0.0,sunD-sunRadius)*65.0)*0.48;colour+=sunTint*corona*sunVisible;
 let vertical=clamp((dir.y-uniforms.solar.y)/sunRadius*0.5+0.5,0.0,1.0);
 let sunsetDisc=mix(vec3f(1.0,0.16,0.09),vec3f(1.0,0.78,0.32),vertical);
 colour=mix(colour,mix(vec3f(1.65,1.52,1.20),sunsetDisc,sunset*0.92),sunDisc*sunVisible);
 // sin(angular radius) corresponding to the same chord radius used by moonDisc.
 let projectedRadius=moonRadius*sqrt(1.0-moonRadius*moonRadius*0.25);
 let moonXY=vec2f(dot(dir,uniforms.moonRight),dot(dir,uniforms.moonUp))/projectedRadius;
 let lunarTex=textureSample(moonMap,moonMapSampler,moonXY*vec2f(0.5,-0.5)+0.5).rgb;
 let relief=sqrt(max(0.0,1.0-dot(moonXY,moonXY)));
 let lunarShading=1.0-uniforms.moonSettings.w*(1.0-relief);
 let moonLight=vec3f(dot(uniforms.solar,uniforms.moonRight),dot(uniforms.solar,uniforms.moonUp),-dot(uniforms.solar,uniforms.lunar));
 let ndl=dot(vec3f(moonXY,relief),moonLight);let terminatorAA=max(fwidth(ndl),0.015);
 let lit=smoothstep(-terminatorAA,terminatorAA,ndl);
 let nightSide=mix(lunarTex*0.025,atmosphere,uniforms.daylight);
 let daySide=lunarTex*lunarShading*vec3f(0.91,0.97,1.10)*uniforms.moonSettings.y;
 colour+=(vec3f(0.38,0.52,0.83)*exp(-moonD*moonD/0.014)*0.18+vec3f(0.60,0.72,1.0)*exp(-moonD*moonD/0.0028)*0.22)*moonVisible*uniforms.moonSettings.z*uniforms.moonIllumination;
 colour=mix(colour,mix(nightSide,daySide,lit),moonDisc*moonVisible);

 // Five shared density samples. Repeat samplers wrap continuous spatial coordinates.
 let p=dir.xz/(up+0.18);
 let warp=textureSample(cloudMap,cloudMapSampler,p*0.19+uniforms.warpOffset).ba-0.5;
 let lowUV=p*uniforms.lowScale+uniforms.lowBase+warp*uniforms.lowShape.w;
 let lowDetailUV=p*uniforms.lowScale*uniforms.lowShape.z+uniforms.lowDetail+warp*uniforms.lowShape.w*uniforms.lowShape.z;
 let highP=vec2f(p.x*0.8-p.y*0.6,p.x*0.6+p.y*0.8);
 let highWarp=vec2f(-warp.y,warp.x)*uniforms.highShape.w;
 let highUV=highP*uniforms.highScale+uniforms.highBase+highWarp;
 let highDetailUV=highP*uniforms.highScale*uniforms.highShape.z+uniforms.highDetail+highWarp*uniforms.highShape.z;
 let lowBase=textureSample(cloudMap,cloudMapSampler,lowUV).r;
 let lowDetail=textureSample(cloudMap,cloudMapSampler,lowDetailUV).r;
 let highBase=textureSample(cloudMap,cloudMapSampler,highUV).g;
 let highDetail=textureSample(cloudMap,cloudMapSampler,highDetailUV).g;
 let lowDensity=clamp(lowBase*0.83+lowDetail*0.17,0.0,1.0);
 let highDensity=clamp(highBase*0.88+highDetail*0.12,0.0,1.0);
 let lowMask=cloudMask(lowDensity,uniforms.lowShape.x);let highMask=cloudMask(highDensity,uniforms.highShape.x);
 let lowT=transmission(lowDensity,lowMask,uniforms.lowShape.y);let highT=transmission(highDensity,highMask,uniforms.highShape.y);
 let lightOffset=uniforms.lightSource.xz*0.008;
 let lowDx=dpdx(lowUV);let lowDy=dpdy(lowUV);let highDx=dpdx(highUV);let highDy=dpdy(highUV);
 var lowSculpt=0.5;var highSculpt=0.5;
 // Explicit gradients permit quality branches without per-pixel derivative hazards.
 if(uniforms.quality>=1.0) {let neighbour=textureSampleGrad(cloudMap,cloudMapSampler,lowUV+lightOffset,lowDx,lowDy).r;lowSculpt=clamp(0.5+(lowBase-neighbour)*9.0,0.0,1.0);}
 if(uniforms.quality>=2.0) {let offset=vec2f(lightOffset.x*0.8-lightOffset.y*0.6,lightOffset.x*0.6+lightOffset.y*0.8);let neighbour=textureSampleGrad(cloudMap,cloudMapSampler,highUV+offset,highDx,highDy).g;highSculpt=clamp(0.5+(highBase-neighbour)*7.0,0.0,1.0);}
 let sourceDistance=length(dir-uniforms.lightSource);let sourceVisible=smoothstep(0.0,0.20,uniforms.lightSource.y)*uniforms.sourcePower;
 let highColour=cloudColour(highDensity,highMask,highSculpt,dir,sourceDistance,sourceVisible);
 let lowColour=cloudColour(lowDensity,lowMask,lowSculpt,dir,sourceDistance,sourceVisible);
 colour=colour*highT+highColour*(1.0-highT);
 colour=colour*lowT+lowColour*(1.0-lowT);
 fragmentOutputs.color=vec4f(colour,1.0);
}`;
