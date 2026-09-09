export function createGeography(g:any):any;
export function sampleRaster(grid:any,e:number,n:number):number;
export function placementSeed(seed:number,zone:string,e:number,n:number,index:number):number;
export function pointInRing(e:number,n:number,points:number[][]):boolean;
export function nearestOnLine(e:number,n:number,points:number[][]):{distance:number;segment:number;t:number;e:number;n:number;h:number};
export function hash01(e:number,n:number,seed?:number):number;
export function smooth(x:number):number;
export function clamp(x:number,a?:number,b?:number):number;
