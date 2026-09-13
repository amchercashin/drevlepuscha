import {loadJSON,preloadImages} from './asset-loading.ts';
import oak from '../../assets/trees/meshy-a/tree.json?url';
import fork from '../../assets/trees/fork-oak/variants.json?url';
import young from '../../assets/trees/young-tree/variants.json?url';
import ranger from '../../assets/characters/ranger/runtime.glb?url';

/** Critical data only. Let materials request images when needed: speculative
 * image preloads can starve late engine/model modules on constrained links. */
export function preloadShowcase(params:URLSearchParams){
 preloadImages([ranger]);
 if(params.get('tree')&&params.get('tree')!=='meshy-a')return;
 const variety=params.get('variety')!=='0';
 for(const url of variety?[oak,fork,young]:[oak])void loadJSON(url).catch(()=>{});
}
