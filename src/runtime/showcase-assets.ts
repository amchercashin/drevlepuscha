import {loadJSON,preloadImages} from './asset-loading.ts';
import oak from '../../assets/trees/meshy-a/tree.json?url';
import fork from '../../assets/trees/fork-oak/variants.json?url';
import young from '../../assets/trees/young-tree/variants.json?url';
import oakTexture from '../../assets/trees/meshy-a/material-0.jpg';
import forkTexture from '../../assets/trees/fork-oak/material-0.jpg';
import youngTexture from '../../assets/trees/young-tree/material-0.jpg';
import rock from '../../assets/rocks/moss-boulder/material-0.jpg';
import log from '../../assets/props/fallen-log/material-0.jpg';
import stump from '../../assets/props/old-stump/material-0.jpg';
import slab from '../../assets/props/slate-slab/material-0.jpg';
import soil from '../../assets/floor/soil.png';
import foliage from '../../assets/floor/foliage.png';
import heights from '../../assets/floor/trial/heights.png';
import normals from '../../assets/floor/trial/normals.png';
import patches from '../../assets/floor/trial/patches.png';
import detailSoil from '../../assets/floor/trial/soil.png';
import litter from '../../assets/floor/trial/litter.png';

/** Lightweight URL manifest; no renderer imports on the early request path. */
export function preloadShowcase(params:URLSearchParams){
 if(params.get('tree')&&params.get('tree')!=='meshy-a')return;
 const variety=params.get('variety')!=='0';
 for(const url of variety?[oak,fork,young]:[oak])void loadJSON(url).catch(()=>{});
 preloadImages([oakTexture,...(variety?[forkTexture,youngTexture]:[]),rock,log,stump,slab,soil,foliage,heights,normals,patches,detailSoil,litter]);
}
