import {writeFileSync} from 'node:fs';
import {sceneData} from './scene-data.mjs';
import {enableShowcase,showcasePath,showcaseHeight} from '../../src/domain/showcase.ts';
import {meshBlocksCylinder} from '../../src/domain/mesh-collision.ts';
enableShowcase();const scene=sceneData(),patches=[];
for(const center of [-80,40,200]){let found=false;search:for(const shift of Array.from({length:33},(_,i)=>(i%2?-1:1)*Math.ceil(i/2)*4))for(const delta of [0,-2,2,-3,3,-5,5,-7,7,-10,10,-15,15]){const n=center+shift;const e=showcasePath(n)+delta,h=showcaseHeight(e,n),max=Math.max(...[-1.4,0,1.4].flatMap(de=>[-1.4,0,1.4].map(dn=>showcaseHeight(e+de,n+dn))));if(max-h>.35||scene.boxes.some(b=>meshBlocksCylinder(b.collision,{x:e,y:h+.5,z:-n},1.4,.8)))continue;patches.push({id:`showcase-insects-${n}`,e,n,h});found=true;break search;}if(!found)throw Error(`No clear insect patch near ${center}`);}
writeFileSync('config/wildlife/insect-sites.json',JSON.stringify(patches,null,2)+'\n');console.log({patches:patches.length});
