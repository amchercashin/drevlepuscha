import {addToScene,createShaderMaterial,createSphere,setShaderFloat,setShaderVector3} from '@babylonjs/lite';
import type {EngineContext,Mesh,SceneContext} from '@babylonjs/lite';
import type {Daylight} from '../domain/daylight.ts';

const vertexSource=`
struct VertexOutput{ @builtin(position) position:vec4<f32>, @location(0) skyDirection:vec3<f32> }
@vertex fn mainVertex(input:VertexInput)->VertexOutput{
 var out:VertexOutput;
 out.skyDirection=input.position;
 var clip=shaderSystem.worldViewProjection*vec4<f32>(input.position,1.0);
 clip.z=clip.w*0.999999;
 out.position=clip;
 return out;
}`;

const fragmentSource=`
struct VertexOutput{ @builtin(position) position:vec4<f32>, @location(0) skyDirection:vec3<f32> }
@fragment fn mainFragment(input:VertexOutput)->@location(0) vec4<f32>{
 let dir=normalize(input.skyDirection);
 let up=clamp(dir.y,0.0,1.0);
 var colour=mix(shaderUniforms.horizon,shaderUniforms.zenith,pow(up,0.45));
 let sunD=length(dir-shaderUniforms.solar);
 let moonD=length(dir-shaderUniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0005);
 let moonAA=max(fwidth(moonD),0.0005);
 let sunDisc=1.0-smoothstep(0.012-sunAA,0.012+sunAA,sunD);
 let moonDisc=1.0-smoothstep(0.015-moonAA,0.015+moonAA,moonD);
 let solarVisible=smoothstep(-0.025,0.01,shaderUniforms.solar.y);
 let lunarVisible=smoothstep(-0.025,0.01,shaderUniforms.lunar.y);
 let sunward=max(0.0,dot(normalize(vec2<f32>(dir.x,dir.z)),normalize(vec2<f32>(shaderUniforms.solar.x,shaderUniforms.solar.z))));
 let opening=pow(sunward,3.5)*exp(-up*2.6)*solarVisible*shaderUniforms.daylight;
 let pathward=max(0.0,-dir.z);
 let clearing=pow(pathward,5.0)*exp(-up*2.0)*shaderUniforms.daylight;
 colour+=vec3<f32>(1.0,0.88,0.50)*opening*0.30;
 colour+=vec3<f32>(1.0,0.94,0.72)*clearing*0.16;
 colour+=vec3<f32>(1.0,0.78,0.42)*(exp(-sunD*6.5)*0.22+exp(-sunD*20.0)*0.11)*solarVisible;
 colour=mix(colour,vec3<f32>(1.0,0.94,0.72),sunDisc*solarVisible);
 let moonMottle=0.87+0.08*sin(dir.x*910.0+dir.z*230.0)*sin(dir.y*670.0-dir.z*320.0);
 colour+=vec3<f32>(0.48,0.60,0.83)*exp(-moonD*45.0)*0.06*lunarVisible;
 colour=mix(colour,vec3<f32>(0.82,0.88,0.91)*moonMottle,moonDisc*lunarVisible);
 let uv=vec2<f32>(atan2(dir.z,dir.x)/6.2831853+0.5+shaderUniforms.starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265);
 let q=uv*vec2<f32>(360.0,180.0);
 let cell=floor(q);
 let seed=fract(sin(dot(cell,vec2<f32>(127.1,311.7)))*43758.5453);
 let offset=vec2<f32>(fract(seed*91.13),fract(seed*173.17))*0.65+0.175;
 let starD=length(fract(q)-offset);
 let aa=max(length(fwidth(q))*0.55,0.025);
 let point=1.0-smoothstep(0.045,0.045+aa,starD);
 colour+=vec3<f32>(0.77,0.84,1.0)*point*step(0.976,seed)*shaderUniforms.stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);
 return vec4<f32>(colour,1.0);
}`;

export function createDaySky(engine:EngineContext,scene:SceneContext){
 const material=createShaderMaterial({
  name:'day-sky',vertexSource,fragmentSource,attributes:['position'],
  uniforms:['worldViewProjection',
   {name:'zenith',type:'vec3<f32>'},{name:'horizon',type:'vec3<f32>'},
   {name:'solar',type:'vec3<f32>'},{name:'lunar',type:'vec3<f32>'},
   {name:'stars',type:'f32'},{name:'starAngle',type:'f32'},{name:'daylight',type:'f32'}],
  backFaceCulling:false,depthWrite:false,
 });
 const mesh=createSphere(engine,{diameter:400,segments:12});
 mesh.name='day-sky';mesh.material=material;mesh.receiveShadows=false;mesh.pickable=false;
 addToScene(scene,mesh);
 function update(s:Daylight,cameraPos:{x:number;y:number;z:number}){
  mesh.position.set(cameraPos.x,cameraPos.y,cameraPos.z);
  setShaderVector3(material,'zenith',s.zenith);
  setShaderVector3(material,'horizon',s.horizon);
  setShaderVector3(material,'solar',s.towardSun);
  setShaderVector3(material,'lunar',s.towardMoon);
  setShaderFloat(material,'stars',s.stars);
  setShaderFloat(material,'starAngle',s.hours/24);
  setShaderFloat(material,'daylight',s.daylight);
 }
 return {update,mesh};
}
