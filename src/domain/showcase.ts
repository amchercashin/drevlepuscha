/** Authored local relief in metres. A winding dry valley, tributaries and wooded spurs. */
export let showcaseEnabled = false;
export function enableShowcase() { showcaseEnabled = true; }
export const showcasePath = (n:number) => 17*Math.sin(n*.019)+6*Math.sin(n*.047);
const g=(x:number,w:number)=>Math.exp(-((x/w)**2));
export function relief(e:number,n:number):number {
 const d=e-showcasePath(n), bed=4+.022*n+2.1*Math.sin(n*.025);
 const banks=(6.5+1.8*Math.sin(n*.033))*(1-g(d,11));
 const spurs=3.8*Math.sin(n*.031+e*.017)*Math.sin(e*.026)*Math.min(1,Math.abs(d)/18);
 const sideA=5*g(n-(82+.42*e+7*Math.sin(e*.05)),10)*(1-g(d,10));
 const sideB=4*g(n-(-65-.6*e),13)*(1-g(d,12));
 const ridge=7*g(e-90,50)*g(n-145,95);
 const terrace=2.8*g(e+48,25)*g(n-45,50);
 return bed+banks+spurs-sideA-sideB+ridge+terrace+.13*Math.sin(e*.42)*Math.sin(n*.31);
}
/** Original two metre triangles, also the seam reference for the local trial. */
export function showcaseBaseHeight(e:number,n:number):number {
 const x=Math.floor(e/2)*2,z=Math.floor(n/2)*2,u=(e-x)/2,v=(n-z)/2;
 const a=relief(x,z),b=relief(x+2,z),c=relief(x,z+2),d=relief(x+2,z+2);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export const GROUND_TRIAL={minE:-6,maxE:16,minN:-4,maxN:24,step:.25} as const;
export function groundTrialContains(e:number,n:number){return e>=GROUND_TRIAL.minE&&e<=GROUND_TRIAL.maxE&&n>=GROUND_TRIAL.minN&&n<=GROUND_TRIAL.maxN;}
export function groundTrialMask(e:number,n:number){
 const t=Math.max(0,Math.min(1,Math.min(e-GROUND_TRIAL.minE,GROUND_TRIAL.maxE-e,n-GROUND_TRIAL.minN,GROUND_TRIAL.maxN-n)/2));
 return t*t*(3-2*t);
}
export function groundTrialVertexHeight(e:number,n:number){
 const d=e-showcasePath(n),mask=groundTrialMask(e,n);
 const ruts=-.032*(g(d-.57-.08*Math.sin(n*.8),.24)+g(d+.57-.07*Math.cos(n*.6),.24));
 const hummocks=.026*Math.sin(e*2.2+n*.7)*Math.sin(n*1.8-e*.4)+.013*Math.sin(e*5.1+n*3.3);
 const verge=.027*g(Math.abs(d)-1.7,.5)*(.6+.4*Math.sin(n*1.3));
 return showcaseBaseHeight(e,n)+mask*(ruts+hummocks+verge);
}
/** The small trial shares its actual quarter-metre triangles with feet and camera. */
export function showcaseHeight(e:number,n:number):number {
 if(!groundTrialContains(e,n))return showcaseBaseHeight(e,n);
 const s=GROUND_TRIAL.step,x=Math.floor(e/s)*s,z=Math.floor(n/s)*s,u=(e-x)/s,v=(n-z)/s;
 const a=groundTrialVertexHeight(x,z),b=groundTrialVertexHeight(x+s,z),c=groundTrialVertexHeight(x,z+s),d=groundTrialVertexHeight(x+s,z+s);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export const SHOWCASE_POIS=[
 {name:'Солнечная ложбина',n:0}, {name:'Развилка оврага',n:82},
 {name:'Излучина',n:158}, {name:'Тихая низина',n:-95},
].map(p=>({...p,e:showcasePath(p.n)}));
/** Lift only enough to clear terrain and the eye-to-target segment. No horizontal orbit changes. */
export function terrainCameraLift(eye:{x:number;y:number;z:number},target:{x:number;y:number;z:number},height=showcaseHeight){
 let lift=0;
 for(let i=0;i<=28;i++){
  const t=i/30, x=eye.x+(target.x-eye.x)*t,z=eye.z+(target.z-eye.z)*t;
  lift=Math.max(lift,(height(x,-z)+.24-(eye.y+(target.y-eye.y)*t))/(1-t));
 }
 return Math.max(0,lift);
}
