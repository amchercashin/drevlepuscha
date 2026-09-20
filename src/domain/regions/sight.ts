/** Eye-to-eye visibility in metric coordinates; camera zoom/LOD never enter the query. */
export function regionSight(a:{e:number;n:number;h:number},b:{e:number;n:number;h:number},height:(e:number,n:number)=>number,blocked:(e:number,n:number,h:number)=>boolean=()=>false){
 const length=Math.hypot(b.e-a.e,b.n-a.n),steps=Math.max(1,Math.ceil(length/2));
 for(let i=1;i<steps;i++){const t=i/steps,e=a.e+(b.e-a.e)*t,n=a.n+(b.n-a.n)*t,h=a.h+(b.h-a.h)*t;if(height(e,n)>h||blocked(e,n,h))return {visible:false,at:{e,n,h},distanceM:length*t};}
 return {visible:true,at:null,distanceM:length};
}
