import {showcasePath} from './showcase.ts';
export const FOREST_PROP_LAYOUT={
 'moss-boulder':[[-2.7,5,.75,.3],[3.4,12,1.2,1.5],[-3.2,18,.85,2.4],[4.3,24,1.1,.8],[-4,35,.9,2.9],[3.7,43,.7,1.2],[-3.3,51,1.15,2]],
 'slate-slab':[[-3.3,10,.9,.2],[4.2,20,1.1,1.8],[-5.2,40,.85,2.3],[4.5,55,1.1,.6]],
 'old-stump':[[-4,14,.9,.3],[4.8,31,1.05,2.1],[-4.8,50,.85,1.4]],
 'fallen-log':[[-4.7,9,1,.3],[4.8,30,1.15,-.4],[-5.5,49,.9,.7],[7,57,1.2,.2]],
} as const;
export function propPlacement(input:readonly number[],showcase:boolean,bounds:{min:{x:number;z:number};max:{x:number;z:number}},heightAt:(e:number,n:number)=>number){
 const [pe,pn,scale,yaw]=input,n=showcase?pn*4-70:pn,e=showcase?showcasePath(n)+pe*1.8:pe;
 let base=heightAt(e,n);
 for(const x of [bounds.min.x,bounds.max.x])for(const z of [bounds.min.z,bounds.max.z]){
  const dx=x*scale,dz=z*scale*.9;base=Math.min(base,heightAt(e+dx*Math.cos(yaw)+dz*Math.sin(yaw),n+dx*Math.sin(yaw)-dz*Math.cos(yaw)));
 }
 return {e,n,scale,yaw,y:base-.10*scale};
}
