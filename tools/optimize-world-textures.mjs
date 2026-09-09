/** Offline deployment encoding; untouched source atlases stay available for reprocessing. */
import jpeg from './meshy/node_modules/jpeg-js/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
for(const path of ['assets/trees/meshy-a','assets/trees/fork-oak','assets/trees/young-tree','assets/trees/conifer','assets/trees/willow','assets/rocks/moss-boulder','assets/props/fallen-log','assets/props/old-stump','assets/props/slate-slab','assets/props/cottage']){const input=readFileSync(path+'/material-0.jpg'),output=jpeg.encode(jpeg.decode(input,{useTArray:true}),78).data;writeFileSync(path+'/runtime.jpg',output);console.log(path,input.length,'→',output.length);}
