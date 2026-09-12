import {showcaseEnabled} from './showcase.ts';
import {trailClearance} from './trail-edge.ts';
import {groundPatch} from './ground-patches.ts';
import {groundHeight,pathCentre} from './harness.ts';
import type {Box} from './harness.ts';
import {FOREST_BOUNDS} from './forest.ts';
import {createRandom,seedFor} from './seed.ts';

export const FLOOR_CELL_M=8;
export const FLOOR_HIDE_M=21;
export interface FloorGeometry {positions:number[];indices:number[];colors:number[];uvs:number[];heights:number[]}
const geometry=():FloorGeometry=>({positions:[],indices:[],colors:[],uvs:[],heights:[]});
/** Distance to the cell expanded for leaves crossing its edge. */
export function floorCellDistance(e:number,n:number,cx:number,cz:number){
 return Math.hypot(Math.max(cx*8-1-e,0,e-((cx+1)*8+1)),Math.max(cz*8-1-n,0,n-((cz+1)*8+1)));
}
export function makeFloorPatch(cx:number,cz:number,boxes:Box[],height=groundHeight,lush=showcaseEnabled,placementAllowed?:(e:number,n:number,r:number)=>boolean){
 const grass=geometry(),leaves=geometry(),random=createRandom(seedFor('m1-floor-art-v1',cx,cz));
 const nearby=boxes.filter(b=>b.max.x>=cx*8-1&&b.min.x<=(cx+1)*8+1&&b.max.z>=-(cz+1)*8-1&&b.min.z<=-cz*8+1);
 function allowed(e:number,n:number,r:number){
  if(placementAllowed?!placementAllowed(e,n,r):(e<FOREST_BOUNDS.minE||e>FOREST_BOUNDS.maxE||n<FOREST_BOUNDS.minN||n>FOREST_BOUNDS.maxN||(showcaseEnabled?trailClearance(e,n,pathCentre(n))<.2+r:Math.abs(e-pathCentre(n))<1.7+r)))return false;
  if(nearby.some(b=>e>b.min.x-r&&e<b.max.x+r&&-n>b.min.z-r&&-n<b.max.z+r))return false;
  // Bare steep banks, richer pockets on gentler ground; no assumption of a flat floor.
  const slope=Math.hypot(height(e+.25,n)-height(e-.25,n),height(e,n+.25)-height(e,n-.25))*2;
  return slope<.85;
 }
 function vertex(g:FloorGeometry,x:number,y:number,z:number,u:number,v:number,c:number[]){
  g.positions.push(x,y,z);g.uvs.push(u,v);g.colors.push(...c,1);
  g.heights.push(Math.max(0,y-height(x,-z)+.06));
 }
 // Full-cell candidates with world-anchored patches; no repeating empty half of an 8 m tile.
 for(let i=0;i<(lush?205:65);i++){
  const e=cx*8+(lush&&!showcaseEnabled?((i%20)+random())*.4:random()*8),n=cz*8+(lush&&!showcaseEnabled?(Math.floor(i/20)+random())*.4:random()*8);
  const field=showcaseEnabled?groundPatch(e,n):null;
  const patch=field?.moss??(.5+.25*Math.sin(e*.35+n*.21)+.25*Math.sin(e*.71-n*.28));
  if(!allowed(e,n,.15)||random()>(showcaseEnabled?.15+patch*.7: lush?.42+patch*.53:patch*.8))continue;
  const h=(lush?.20:.13)+random()*(lush?.27:.22),grassHue=random();
  const grassBase=grassHue<.34?[.26,.50,.43]:grassHue<.68?[.36,.54,.30]:[.24,.45,.40];
  for(let blade=0;blade<(lush?3:4);blade++){
   const a=random()*Math.PI*2,dx=Math.cos(a),dz=Math.sin(a),w=(lush?.030:.017)+random()*(lush?.020:.014);
   const x=e+(random()-.5)*.15,z=-n+(random()-.5)*.15,y=height(x,-z)-.025,k=grass.positions.length/3;
   for(const [t,side] of [[0,-1],[0,1],[.6,-1],[.6,1],[1,0]]){
    const width=w*(1-t*.7),bend=t*t*h*.45;
    vertex(grass,x+dx*bend-dz*width*side,y+t*h,z+dz*bend+dx*width*side,0,0,[grassBase[0]+t*.13,grassBase[1]+t*.16,grassBase[2]+t*.10]);
   }
   grass.indices.push(k,k+1,k+2,k+1,k+3,k+2,k+2,k+3,k+4);
  }
 }
 // One atlas and curved strips, no geometry for each fern leaflet.
 for(let plant=0;plant<(lush?126:14);plant++){
  const e=cx*8+random()*8,n=cz*8+random()*8;
  const field=showcaseEnabled?groundPatch(e,n):null;
  const patch=field?.moss??(.5+.25*Math.sin(e*.35+n*.21)+.25*Math.sin(e*.71-n*.28));
  if(!allowed(e,n,.6)||random()>(showcaseEnabled?.1+patch*.65: lush?.30+patch*.68:patch))continue;
  const fern=lush?random()<.72:plant<5,len=(fern?(lush?.66:.62):.35)+random()*(fern?(lush?.26:.28):.20),count=fern?7:5,rotation=random()*Math.PI*2;
  const quadrant=(fern?0:1)+(random()>.5?2:0),centreU=quadrant%2===0?.25:.75,baseV=quadrant<2?.505:.005;
  const tint=.84+random()*.24,leafHue=random();
  const leafTint=leafHue<.34?[.76*tint,1.00*tint,.90*tint]:leafHue<.68?[.94*tint,1.04*tint,.74*tint]:[.72*tint,.97*tint,.92*tint];
  for(let leaf=0;leaf<count;leaf++){
   const a=rotation+leaf*Math.PI*2/count,dx=Math.cos(a),dz=Math.sin(a),length=len*(.75+random()*.25),k=leaves.positions.length/3;
   for(let j=0;j<=4;j++){
    const t=j/4,half=[.035,.34,.29,.18,.015][j];
    const y=height(e,n)+Math.sin(t*Math.PI*.80)*length*(fern?.65:.8)-.025;
    for(const side of [-1,1]){
     const x=e+dx*t*length-dz*half*length*.85*side,z=-n+dz*t*length+dx*half*length*.85*side;
     // Lift strip above local terrain on slopes, preserving an arched silhouette.
     vertex(leaves,x,Math.max(y,height(x,-z)+.015),z,centreU+side*half*.5,baseV+.49*t,leafTint);
    }
    if(j<4){const q=k+j*2;leaves.indices.push(q,q+1,q+2,q+1,q+3,q+2);}
   }
  }
 }
 // Upper leaf surfaces face upward in Babylon's left-handed scene.
 for(const g of [grass,leaves])for(let i=0;i<g.indices.length;i+=3)[g.indices[i+1],g.indices[i+2]]=[g.indices[i+2],g.indices[i+1]];
 return {grass,leaves};
}
