import type {ResolutionQuality} from './resolution.ts';
export type ShowcaseQuality=ResolutionQuality|'auto';
export const QUALITY_PROFILES={
 performance:{density:1,pixels:960*540,treeDistance:.48,coverDistance:.65,groundMode:1 as const,transitions:false,skyQuality:0 as const},
 balanced:{density:1.5,pixels:1280*720,treeDistance:.7,coverDistance:.8,groundMode:1 as const,transitions:false,skyQuality:1 as const},
 high:{density:2,pixels:2560*1440,treeDistance:1,coverDistance:1,groundMode:2 as const,transitions:true,skyQuality:2 as const},
 native:{density:2,pixels:Infinity,treeDistance:1,coverDistance:1,groundMode:2 as const,transitions:true,skyQuality:2 as const},
};
export function recommendedQuality(touch:boolean,memory?:number):ResolutionQuality{
 return memory!==undefined&&memory<=4?'performance':touch?'balanced':'high';
}
export function showcaseResolution(width:number,height:number,dpr:number,quality:ResolutionQuality,maxDimension=8192){
 const p=QUALITY_PROFILES[quality],w=Math.max(1,width),h=Math.max(1,height);
 const scale=Math.min(Math.max(1,dpr),p.density,Math.sqrt(p.pixels/(w*h)),maxDimension/w,maxDimension/h);
 return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale)),scale};
}
/** Bounded feedback during actual play. Ignore tab stalls and isolated hitches.
 * Downgrade at most twice per visit; manual choices never run this controller. */
export class AutoQuality {
 private frames:number[]=[];private slowWindows=0;
 effective:ResolutionQuality;
 constructor(effective:ResolutionQuality){this.effective=effective;}
 reset(){this.frames=[];this.slowWindows=0;}
 sample(ms:number){
  if(ms<=0||ms>100){this.reset();return false;}
  this.frames.push(ms);if(this.frames.length<180)return false;
  this.frames.sort((a,b)=>a-b);const slow=this.frames[135]>18.5;
  this.frames=[];this.slowWindows=slow?this.slowWindows+1:0;
  if(this.slowWindows<2)return false;
  this.slowWindows=0;
  const next=this.effective==='high'||this.effective==='native'?'balanced':'performance';
  if(next===this.effective)return false;this.effective=next;return true;
 }
}
