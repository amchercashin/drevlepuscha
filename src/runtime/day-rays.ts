/** Four authored light columns, clipped analytically against scene depth.
 * No shadow-map sampling: these are art-directed gaps, not physical volumetrics. */
export function rayDeclarations(){return "uniform rayPower:f32;uniform rayBases:array<vec4f,4>;";}
export function rayContribution(){return `
 var shafts=0.0;
 if(uniforms.rayPower>0.0&&uniforms.airDensity>0.0&&uniforms.sunDirection.y>0.10){
  for(var beam:i32=0;beam<4;beam++){
   let base=uniforms.rayBases[beam];
   let axis=uniforms.sunDirection;
   let relative=uniforms.eye-base.xyz;
   let ad=dot(direction,axis);
   let ao=dot(relative,axis);
   let perp=direction-axis*ad;
   let offset=relative-axis*ao;
   let qa=max(dot(perp,perp),0.0001);
   let centre=-dot(perp,offset)/qa;
   let radial=dot(offset+perp*centre,offset+perp*centre);
   let halfChord=sqrt(max(0.0,base.w*base.w-radial)/qa);
   var lo=max(0.0,centre-halfChord);
   var hi=min(rayLength,centre+halfChord);
   if(abs(ad)>0.0001){
    let ta=(0.20-ao)/ad;let tb=(8.0-ao)/ad;
    lo=max(lo,min(ta,tb));hi=min(hi,max(ta,tb));
   }else if(ao<0.20||ao>8.0){hi=lo;}
   let middle=clamp(ao+ad*(lo+hi)*0.5,0.0,8.0);
   let feather=1.0-smoothstep(0.0,base.w*base.w,radial);
   shafts+=max(0.0,hi-lo)*feather*smoothstep(0.20,1.4,middle)*(1.0-smoothstep(6.0,8.0,middle));
  }
 }
 let shaftColour=uniforms.sunColor*shafts*uniforms.rayPower*(0.4+0.6*phase);
 `;}
