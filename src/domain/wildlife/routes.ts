import type {ENH,OriginEN,PreparedRoute,RouteSample,WildlifePose} from './types.ts';
export const distance=(a:ENH,b:ENH)=>Math.hypot(a.e-b.e,a.n-b.n,a.h-b.h);
export const localXYZ=(p:ENH,origin:OriginEN)=>({x:p.e-origin.e,y:p.h,z:origin.n-p.n});
export const directionXYZ=(normal:readonly [number,number,number])=>({x:normal[0],y:normal[2],z:-normal[1]});
export function sampleRoute(route:PreparedRoute,metres:number):RouteSample{
 const samples=route.samples,d=Math.max(0,Math.min(route.lengthM,metres));let lo=0,hi=samples.length-1;
 while(hi-lo>1){const mid=(hi+lo)>>1;if(samples[mid].distanceM<=d)lo=mid;else hi=mid;}
 const a=samples[lo],b=samples[hi],t=(d-a.distanceM)/(b.distanceM-a.distanceM);
 const normal=a.normal.map((v,i)=>v+(b.normal[i]-v)*t),length=Math.hypot(...normal);
 return {distanceM:d,point:{e:a.point.e+(b.point.e-a.point.e)*t,n:a.point.n+(b.point.n-a.point.n)*t,h:a.point.h+(b.point.h-a.point.h)*t},normal:normal.map(v=>v/length) as [number,number,number]};
}
export function routeHeading(route:PreparedRoute,metres:number){const a=sampleRoute(route,Math.max(0,metres-.02)).point,b=sampleRoute(route,Math.min(route.lengthM,metres+.02)).point;return Math.atan2(b.e-a.e,b.n-a.n)*180/Math.PI;}
/** Piecewise authored timing keeps ground, mounting and climbing continuous on every client. */
export function routeMotion(route:PreparedRoute,timeMs:number){
 const keys=route.motion;if(!keys?.length)return null;const t=Math.max(0,timeMs);let i=0;while(i+1<keys.length&&keys[i+1].atMs<=t)i++;
 const a=keys[i],b=keys[i+1];return {state:a.state,sinceMs:a.atMs,distanceM:b?a.distanceM+(b.distanceM-a.distanceM)*Math.min(1,(t-a.atMs)/(b.atMs-a.atMs)):a.distanceM,speedMps:b?(b.distanceM-a.distanceM)/(b.atMs-a.atMs)*1000:0};
}
export function routeMetres(route:PreparedRoute,pose:WildlifePose,timeMs:number){
 if(pose.state==='alert'&&pose.speedMps===0&&pose.route)return pose.routeStartDistanceM;
 return routeMotion(route,timeMs-pose.routeStartMs)?.distanceM??pose.routeStartDistanceM+Math.max(0,timeMs-pose.routeStartMs)*pose.speedMps/1000;
}
/** Model XYZ -> absolute XYZ -> ENH. Normals use the inverse transpose. */
export function transformAnchor(point:readonly number[],normal:readonly number[],matrix:readonly number[]){
 const m=matrix,p={e:point[0]*m[0]+point[1]*m[4]+point[2]*m[8]+m[12],n:-(point[0]*m[2]+point[1]*m[6]+point[2]*m[10]+m[14]),h:point[0]*m[1]+point[1]*m[5]+point[2]*m[9]+m[13]};
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
 const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-12)throw Error('Singular tree transform');
 const x=((e*i-f*h)*normal[0]+(f*g-d*i)*normal[1]+(d*h-e*g)*normal[2])/det;
 const y=((c*h-b*i)*normal[0]+(a*i-c*g)*normal[1]+(b*g-a*h)*normal[2])/det;
 const z=((b*f-c*e)*normal[0]+(c*d-a*f)*normal[1]+(a*e-b*d)*normal[2])/det;
 const len=Math.hypot(x,y,z);if(len<1e-9)throw Error('Invalid anchor normal');
 return {point:p,normal:[x/len,-z/len,y/len] as [number,number,number]};
}
