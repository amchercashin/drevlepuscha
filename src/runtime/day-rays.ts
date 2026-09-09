/** Four authored light columns, clipped analytically against scene depth.
 * No shadow-map sampling: these are art-directed gaps, not physical volumetrics. */
export function rayDeclarations(w:boolean){return w?
 'uniform rayPower:f32;uniform rayBases:array<vec4f,4>;':
 'uniform float rayPower;uniform vec4 rayBases[4];';}
export function rayContribution(w:boolean){
 const u=w?'uniforms.':'',v3=w?'vec3f':'vec3',v4=w?'vec4f':'vec4';
 const d=(name:string,value:string,type='float',mutable=false)=>w?`${mutable?'var':'let'} ${name}=${value};`:`${type} ${name}=${value};`;
 return `
 ${d('shafts','0.0','float',true)}
 if(${u}rayPower>0.0&&${u}airDensity>0.0&&${u}sunDirection.y>0.10){
  ${w?'for(var beam:i32=0;beam<4;beam++){':'for(int beam=0;beam<4;beam++){'}
   ${d('base',`${u}rayBases[beam]`,v4)}
   ${d('axis',`${u}sunDirection`,v3)}
   ${d('relative',`${u}eye-base.xyz`,v3)}
   ${d('ad','dot(direction,axis)')}
   ${d('ao','dot(relative,axis)')}
   ${d('perp','direction-axis*ad',v3)}
   ${d('offset','relative-axis*ao',v3)}
   ${d('qa','max(dot(perp,perp),0.0001)')}
   ${d('centre','-dot(perp,offset)/qa')}
   ${d('radial','dot(offset+perp*centre,offset+perp*centre)')}
   ${d('halfChord','sqrt(max(0.0,base.w*base.w-radial)/qa)')}
   ${d('lo','max(0.0,centre-halfChord)','float',true)}
   ${d('hi','min(rayLength,centre+halfChord)','float',true)}
   if(abs(ad)>0.0001){
    ${d('ta','(0.20-ao)/ad')}${d('tb','(8.0-ao)/ad')}
    lo=max(lo,min(ta,tb));hi=min(hi,max(ta,tb));
   }else if(ao<0.20||ao>8.0){hi=lo;}
   ${d('middle','clamp(ao+ad*(lo+hi)*0.5,0.0,8.0)')}
   ${d('feather','1.0-smoothstep(0.0,base.w*base.w,radial)')}
   shafts+=max(0.0,hi-lo)*feather*smoothstep(0.20,1.4,middle)*(1.0-smoothstep(6.0,8.0,middle));
  }
 }
 ${d('shaftColour',`${u}sunColor*shafts*${u}rayPower*(0.4+0.6*phase)`,v3)}
 `;
}
