import {readFileSync} from 'node:fs';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {generateForestPlacements} from '../../src/domain/forest-layout.ts';
import {finalizeForestPlacements,readonlyTreeCatalog} from '../../src/domain/forest-records.ts';
import {showcaseHeight} from '../../src/domain/showcase.ts';
import {FOREST_PROP_LAYOUT,propPlacement} from '../../src/domain/forest-props-layout.ts';
import {collisionGeometry,meshCollider} from '../../src/domain/mesh-collision.ts';
import {treeCollider} from '../../src/domain/forest.ts';
export const readJSON=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
export const treeInputs=['assets/trees/meshy-a/tree.json','assets/trees/fork-oak/variants.json','assets/trees/young-tree/variants.json'];
export const propInputs=Object.keys(FOREST_PROP_LAYOUT).map(key=>`assets/${key==='moss-boulder'?'rocks':'props'}/${key}/variants.json`);
export function sceneData(){
 const [main,...extra]=treeInputs.map(readJSON),variantCounts=extra.map(a=>a.variants.length);
 const families=[{...main,id:'meshy-a',sink:.85},...extra.flatMap((a,i)=>a.variants.map(v=>({...v,version:a.version,sink:[.35,.16][i]})))];
 const records=finalizeForestPlacements(generateForestPlacements({mode:'showcase',rootRadiusM:main.rootRadius,variation:main.placement,heightAt:showcaseHeight}),families,variantCounts,showcaseHeight,true,true);
 const geometry=families.map(f=>collisionGeometry(f.levels[0]));
 const matrices=records.map(({placement:p})=>Matrix.Compose(new Vector3(p.width,p.height,p.depth),Quaternion.FromEulerAngles(p.leanX,p.yaw,p.leanZ),new Vector3(p.e,p.y,-p.n)));
 const treeBoxes=records.map(({placement:p,slot},i)=>({...treeCollider(p,families[slot].trunkRadius),collision:meshCollider(geometry[slot],matrices[i].m,Matrix.Invert(matrices[i]).m)}));
 const catalog=readonlyTreeCatalog(records.map(({placement:p,slot},i)=>{const f=families[slot],b=treeBoxes[i].collision;return {id:p.id,familyId:f.id,variantId:f.id,assetVersion:f.version,modelToAbsoluteXYZ:Array.from(matrices[i].m),bounds:{min:{e:b.min.x,n:-b.max.z,h:b.min.y},max:{e:b.max.x,n:-b.min.z,h:b.max.y}}};}));
 const propBoxes=[];
 for(const path of propInputs){const asset=readJSON(path),key=path.split('/').at(-2),shapes=asset.variants.map(v=>collisionGeometry(v.levels[0]));
  for(const [i,input] of FOREST_PROP_LAYOUT[key].entries()){
   const g=shapes[i%shapes.length],p=propPlacement(input,true,g.root,showcaseHeight),matrix=Matrix.Compose(new Vector3(p.scale,p.scale,p.scale*.9),Quaternion.FromEulerAngles(0,p.yaw,0),new Vector3(p.e,p.y,-p.n));
   const collision=meshCollider(g,matrix.m,Matrix.Invert(matrix).m),id=`${asset.sourceId}-${i}`;
   // Babylon clone keeps the legacy source suffix in mesh.id; do not rename existing props.
   propBoxes.push({id:i<shapes.length?id:`${id}.${asset.sourceId}-${i%shapes.length}`,min:collision.min,max:collision.max,collision});
  }
 }
 return {records,families,matrices,catalog,treeBoxes,propBoxes,boxes:[...propBoxes,...treeBoxes]};
}
