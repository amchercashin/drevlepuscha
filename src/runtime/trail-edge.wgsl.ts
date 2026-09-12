/** Matches domain/trail-edge.ts. Fine 2D bites only affect the material, not walkability. */
export const TRAIL_EDGE_WGSL=`
fn trailHash(cell:i32,seed:u32)->f32 {
 var h=bitcast<u32>(cell)^seed;h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;
 return f32(h^(h>>16u))/4294967295.0;
}
fn trailNoise(n:f32,seed:u32)->f32 {
 let i=i32(floor(n));let t=fract(n);return mix(trailHash(i,seed),trailHash(i+1,seed),t*t*(3.0-2.0*t))*2.0-1.0;
}
fn trailWidth(n:f32,right:bool)->f32 {
 let seed=select(17u,83u,right);
 return 1.55+0.48*trailNoise(n*0.16,seed)+0.23*trailNoise(n*0.63,seed+11u)+0.09*trailNoise(n*1.7,seed+29u);
}
fn trailNoise2(p:vec2f)->f32 {
 let i=vec2i(floor(p));let t=fract(p);let s=t*t*(3.0-2.0*t);
 let a=trailHash(i.x,bitcast<u32>(i.y)*31337u+197u);let b=trailHash(i.x+1,bitcast<u32>(i.y)*31337u+197u);
 let c=trailHash(i.x,bitcast<u32>(i.y+1)*31337u+197u);let d=trailHash(i.x+1,bitcast<u32>(i.y+1)*31337u+197u);
 return mix(mix(a,b,s.x),mix(c,d,s.x),s.y)*2.0-1.0;
}
fn trailForest(en:vec2f)->f32 {
 let centre=17.0*sin(en.y*0.019)+6.0*sin(en.y*0.047);let d=en.x-centre;
 let bites=0.20*trailNoise2(en*0.85)+0.13*trailNoise2(en*3.1);
 return smoothstep(-0.38,0.35,abs(d)-trailWidth(en.y,d>=0.0)+bites);
}
`;
