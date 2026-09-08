export type ResolutionQuality='performance'|'balanced'|'high'|'native';
export function renderResolution(width:number,height:number,dpr:number,quality:ResolutionQuality,maxDimension=8192){
 const density=Math.max(1,Math.min(2,dpr));
 const budgets={performance:1280*720,balanced:1920*1080,high:2560*1440,native:Infinity};
 const w=Math.max(1,width),h=Math.max(1,height);
 const scale=Math.min(density,Math.sqrt(budgets[quality]/(w*h)),maxDimension/w,maxDimension/h);
 return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale)),scale};
}
