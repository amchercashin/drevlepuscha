/** Local sky appearance. No clock, engine or shared weather state. */
export type UV=readonly [number,number];
export type SkyQuality=0|1|2;
export const SKY_SEED=37;
export const STAR_COLUMNS=360,STAR_ROWS=180;
export interface CloudLayerSettings {
 coverage:number;opticalDepth:number;scale:UV;detailScale:number;warpStrength:number;velocity:UV;detailVelocity:UV;
}
export interface SkySettings {
 low:CloudLayerSettings;high:CloudLayerSettings;motionScale:number;
 stars:{brightness:number;twinkle:number};
 moon:{sizeScale:number;brightness:number;halo:number;limbShade:number};
}
export type SkySettingsPatch={low?:Partial<CloudLayerSettings>;high?:Partial<CloudLayerSettings>;motionScale?:number;stars?:Partial<SkySettings['stars']>;moon?:Partial<SkySettings['moon']>};
export const SKY_DEFAULTS:SkySettings={
 low:{coverage:.46,opticalDepth:3.8,scale:[.65,.65],detailScale:3.1,warpStrength:.09,velocity:[.0014,.000518],detailVelocity:[.0011,-.00032]},
 high:{coverage:.37,opticalDepth:1.25,scale:[.28,.85],detailScale:2.7,warpStrength:.045,velocity:[-.00038,.00019],detailVelocity:[-.00016,.00029]},
 motionScale:1,stars:{brightness:1,twinkle:.06},moon:{sizeScale:1,brightness:1,halo:.55,limbShade:.08},
};
function finite(value:number,min:number,max:number){
 if(!Number.isFinite(value))throw new Error('Sky settings must be finite');
 return Math.max(min,Math.min(max,value));
}
function pair(value:UV,min:number,max:number):UV{return [finite(value[0],min,max),finite(value[1],min,max)];}
function layer(base:CloudLayerSettings,patch:Partial<CloudLayerSettings>={}):CloudLayerSettings {
 const s={...base,...patch};
 return {coverage:finite(s.coverage,0,1),opticalDepth:finite(s.opticalDepth,0,16),scale:pair(s.scale,.01,16),detailScale:finite(s.detailScale,.1,16),warpStrength:finite(s.warpStrength,0,.15),velocity:pair(s.velocity,-.05,.05),detailVelocity:pair(s.detailVelocity,-.05,.05)};
}
export function skySettings(base:SkySettings=SKY_DEFAULTS,patch:SkySettingsPatch={}):SkySettings {
 const stars={...base.stars,...patch.stars},moon={...base.moon,...patch.moon};
 return {low:layer(base.low,patch.low),high:layer(base.high,patch.high),motionScale:finite(patch.motionScale??base.motionScale,0,4),
  stars:{brightness:finite(stars.brightness,0,2),twinkle:finite(stars.twinkle,0,.12)},
  moon:{sizeScale:finite(moon.sizeScale,.5,1.5),brightness:finite(moon.brightness,0,2),halo:finite(moon.halo,0,1),limbShade:finite(moon.limbShade,0,.2)}};
}
export const modulo=(x:number,period:number)=>((x%period)+period)%period;
export type CloudOffsets={lowBase:UV;lowDetail:UV;highBase:UV;highDetail:UV;warp:UV};
export function cloudOffsets(seconds:number,s:SkySettings):CloudOffsets {
 const offset=(v:UV):UV=>[modulo(seconds*v[0],1),modulo(seconds*v[1],1)];
 return {lowBase:offset(s.low.velocity),lowDetail:offset(s.low.detailVelocity),highBase:offset(s.high.velocity),highDetail:offset(s.high.detailVelocity),warp:offset([.000073,-.000051])};
}
export function advanceSkyTime(seconds:number,dt:number,motionScale:number){return seconds+(Number.isFinite(dt)&&dt>0?Math.min(dt,.05)*motionScale:0);}
/** Same integer avalanche as WGSL; only the seed cell wraps, never its local position. */
export function starHash(x:number,y:number,salt=0){
 let h=(Math.imul(modulo(x,STAR_COLUMNS),374761393)+Math.imul(y,668265263)+SKY_SEED+Math.imul(salt,2246822519))>>>0;
 h=Math.imul(h^(h>>>13),1274126177)>>>0;
 return (h^(h>>>16))>>>0;
}
export function starRotation(hours:number):UV {const angle=modulo(hours,24)*Math.PI/12;return [Math.cos(angle),Math.sin(angle)];}
/** Reference for fixtures, not a second renderer. */
export function cloudTransmission(density:number,coverage:number,opticalDepth:number){
 const f=Math.max(0,Math.min(1,density)),w=.06,threshold=1+w-(1+2*w)*coverage;
 const t=Math.max(0,Math.min(1,(f-threshold+w)/(2*w))),mask=t*t*(3-2*t);
 return Math.max(0,(Math.exp(-opticalDepth*mask*(.5+.5*f))-.001)/.999);
}
export function moonBasis(direction:readonly [number,number,number]) {
 const length=Math.hypot(...direction);
 if(!Number.isFinite(length)||length<1e-8)throw new Error('Moon direction must be finite and nonzero');
 const n=direction.map(v=>v/length),ref=Math.abs(n[1])>.98?[0,0,1]:[0,1,0];
 const right=[ref[1]*n[2]-ref[2]*n[1],ref[2]*n[0]-ref[0]*n[2],ref[0]*n[1]-ref[1]*n[0]];
 const scale=Math.hypot(...right);for(let i=0;i<3;i++)right[i]/=scale;
 return {right:right as [number,number,number],up:[n[1]*right[2]-n[2]*right[1],n[2]*right[0]-n[0]*right[2],n[0]*right[1]-n[1]*right[0]] as [number,number,number]};
}
/** CPU level-0 bilinear sampling: same texel centres, repeat and channels as WGSL.
 * It approximates the GPU mip-filtered transmission, particularly near the horizon. */
export function sampleCloudChannel(pixels:Uint8Array,size:number,u:number,v:number,channel:number){
 const x=u*size-.5,y=v*size-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const at=(a:number,b:number)=>pixels[(modulo(b,size)*size+modulo(a,size))*4+channel]/255;
 return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
}
export function cloudTransmissionAt(pixels:Uint8Array,size:number,direction:readonly [number,number,number],s:SkySettings,o:CloudOffsets){
 const denominator=Math.max(direction[1],0)+.18,px=direction[0]/denominator,py=direction[2]/denominator;
 const channel=(u:number,v:number,c:number)=>sampleCloudChannel(pixels,size,u,v,c);
 const wx=channel(px*.19+o.warp[0],py*.19+o.warp[1],2)-.5,wy=channel(px*.19+o.warp[0],py*.19+o.warp[1],3)-.5;
 function layer(p:UV,w:UV,l:CloudLayerSettings,base:UV,detail:UV,c:number,weight:number){
  const u=p[0]*l.scale[0],v=p[1]*l.scale[1],wu=w[0]*l.warpStrength,wv=w[1]*l.warpStrength;
  const f=channel(u+base[0]+wu,v+base[1]+wv,c)*weight+channel(u*l.detailScale+detail[0]+wu*l.detailScale,v*l.detailScale+detail[1]+wv*l.detailScale,c)*(1-weight);
  return cloudTransmission(f,l.coverage,l.opticalDepth);
 }
 return layer([px,py],[wx,wy],s.low,o.lowBase,o.lowDetail,0,.83)*layer([px*.8-py*.6,px*.6+py*.8],[-wy,wx],s.high,o.highBase,o.highDetail,1,.88);
}
export function sourceTransmission(pixels:Uint8Array,size:number,toward:readonly [number,number,number],s:SkySettings,o:CloudOffsets){
 const basis=moonBasis(toward);let sum=0;
 for(const [x,y] of [[0,0],[.02,0],[-.02,0],[0,.02],[0,-.02]]){
  const d=toward.map((v,i)=>v+basis.right[i]*x+basis.up[i]*y),length=Math.hypot(...d);
  sum+=cloudTransmissionAt(pixels,size,[d[0]/length,d[1]/length,d[2]/length],s,o);
 }return sum/5;
}
