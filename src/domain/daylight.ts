export type RGB=[number,number,number];
export type Direction=[number,number,number];
export const DAY_PRESETS={morning:7.5,day:12,sunset:17.5,night:0} as const;
export const CYCLE_SECONDS=1200;
export const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((v,i)=>v+(b[i]-v)*t) as RGB;
export function normalizeHour(hour:number){
 if(!Number.isFinite(hour))throw new Error('Time must be finite');
 return ((hour%24)+24)%24;
}
/** Art-directed full-moon orbit, not astronomical ephemerides. EN uses north = -Z. */
export function daylightAt(hour:number){
 const hours=normalizeHour(hour),angle=(hours-6)*Math.PI/12;
 const towardSun:Direction=[Math.cos(angle),Math.sin(angle)*.82,-Math.sin(angle)*Math.sqrt(1-.82**2)];
 const towardMoon=towardSun.map(v=>-v) as Direction,elevation=towardSun[1];
 const daylight=smooth(-.22,.20,elevation),sunPower=smooth(0,.22,elevation);
 const moonPower=smooth(0,.20,-elevation),source=elevation>=0?'sun':'moon';
 const sunset=(1-smooth(.08,.42,Math.abs(elevation)))*smooth(-.25,.0,elevation);
 const mainColor:RGB=source==='sun'?mix([1,.51,.24],[1,.96,.83],smooth(.04,.42,elevation)):[.72,.82,1];
 const mainIntensity=source==='sun'?1.05*sunPower:.32*moonPower;
 const horizon=mix(mix([.035,.055,.085],[.65,.73,.68],daylight),[.70,.40,.25],sunset*.6);
 return {hours,towardSun,towardMoon,source,mainColor,mainIntensity,daylight,
  direction:(source==='sun'?towardSun:towardMoon).map(v=>-v) as Direction,
  fillIntensity:.26+.34*daylight,fillColor:mix([.60,.70,.86],[.78,.87,1],daylight),
  zenith:mix([.006,.014,.036],[.21,.40,.51],daylight),horizon,
  fogColor:mix(mix([.028,.044,.066],[.65,.73,.68],daylight),[.64,.44,.31],sunset*.45),
  stars:1-smooth(-.22,.01,elevation),sunset,emissionScale:.045+.955*daylight,
  rayStrength:source==='sun'?sunPower*.30:moonPower*.035};
}
export type Daylight=ReturnType<typeof daylightAt>;
