/** Shared by visible vegetation, shadow depth and the GPU parity check. */
export const windFieldWGSL=`
fn forestWindField(root: vec2f, phases: vec3f, weather: vec4f) -> vec2f {
 let p=root*weather.w;
 let field=0.5+0.22*sin(dot(p,vec2f(0.115,0.073))-phases.x)
  +0.17*sin(dot(p,vec2f(0.047,-0.151))-phases.y)
  +0.11*sin(dot(p,vec2f(-0.181,0.031))-phases.z);
 let gust=weather.y*(0.25+0.75*field);
 return vec2f(min(1.0,weather.x*(0.78+0.22*field)+gust),min(1.0,gust));
}`;

export const treeWindWGSL=`
let windRoot=finalWorld[3].xz;
let windField=forestWindField(windRoot,uniforms.windPhases.xyz,uniforms.windWeather);
let windHeight=max(0.1,uniforms.windPlant.x);
let windT=clamp((positionUpdated.y/windHeight-0.18)/0.82,0.0,1.0);
let windWeight=windT*windT*(3.0-2.0*windT);
let windPhase=dot(windRoot,vec2f(0.31,0.17));
let windSway=1.0+0.18*sin(uniforms.windMotion.x+windPhase);
let windAmount=windHeight*length(finalWorld[1].xyz)*min(0.35,0.04*uniforms.windPlant.y*windField.x*uniforms.windWeather.z*uniforms.windResponse.x*windSway);
let windDelta=vec3f(uniforms.windDirection.x,0.0,uniforms.windDirection.y)*windAmount;
worldPos=vec4f(worldPos.xyz+windDelta*windWeight,worldPos.w);
#ifdef NORMAL
// Inverse-transpose of the bend Jacobian, including tilted/nonuniform instances.
let windGradient=finalWorld[1].xyz/dot(finalWorld[1].xyz,finalWorld[1].xyz)*(6.0*windT*(1.0-windT)/(windHeight*0.82));
vertexOutputs.vNormalW=normalize(vertexOutputs.vNormalW-windGradient*dot(windDelta,vertexOutputs.vNormalW)/(1.0+dot(windGradient,windDelta)));
#endif
`;

export const coverWindWGSL=`
let windRoot=vertexInputs.plantWind.xy;
let windField=forestWindField(windRoot,uniforms.windPhases.xyz,uniforms.windWeather);
let windT=vertexInputs.plantWind.z;
var windSway=1.0;
#ifdef WIND_DETAIL
let windDistance=distance(windRoot,uniforms.windEye.xz);
if(windDistance<48.0){
 windSway+=0.24*sin(uniforms.windMotion.y+vertexInputs.plantWind.w)*(1.0-smoothstep(12.0,48.0,windDistance));
}
#endif
worldPos=vec4f(worldPos.xyz+vec3f(uniforms.windDirection.x,0.0,uniforms.windDirection.y)*min(0.25,uniforms.windPlant.x*windField.x*uniforms.windWeather.z*uniforms.windResponse.y*windSway)*windT*windT,worldPos.w);
`;
