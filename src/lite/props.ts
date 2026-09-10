import {addToScene,createMeshFromData,createStandardMaterial,eulerToQuat,loadTexture2D,mat4Compose,setThinInstances} from '@babylonjs/lite';
import type {EngineContext,SceneContext} from '@babylonjs/lite';
import {showcasePath} from '../domain/showcase.ts';
import {groundHeight} from '../domain/harness.ts';
import type {Box} from '../domain/harness.ts';
import type {TreePart} from '../domain/reference-tree.ts';
import {asF32,asU32,computeNormals} from './geometry.ts';
import {unlit} from './materials.ts';
import rock from '../../assets/rocks/moss-boulder/variants.json';
import rockTexture from '../../assets/rocks/moss-boulder/material-0.jpg';
import log from '../../assets/props/fallen-log/variants.json';
import logTexture from '../../assets/props/fallen-log/material-0.jpg';
import stump from '../../assets/props/old-stump/variants.json';
import stumpTexture from '../../assets/props/old-stump/material-0.jpg';
import slab from '../../assets/props/slate-slab/variants.json';
import slabTexture from '../../assets/props/slate-slab/material-0.jpg';

interface PropAsset {sourceId:string;variants:{levels:TreePart[][]}[];}
export async function createForestProps(engine:EngineContext,scene:SceneContext,boxes:Box[]){
 async function place(asset:PropAsset,texture:string,placements:number[][]){
  const material=unlit(createStandardMaterial(),[1,1,1]);
  material.name=asset.sourceId;
  material.diffuseTexture=await loadTexture2D(engine,texture,{invertY:false});
  const templates=new Map<number,{positions:Float32Array;normals:Float32Array;indices:Uint32Array;uvs:Float32Array}>();
  const groups=new Map<number,{mesh:ReturnType<typeof createMeshFromData>;matrices:number[];boxes:Box[]}>();
  for(const [i,[pe,pn,scale,yaw]] of placements.entries()){
   const n=pn*4-70,e=showcasePath(n)+pe*1.8,variant=i%asset.variants.length;
   let data=templates.get(variant);
   if(!data){
    const part=asset.variants[variant].levels[0][0];
    data={positions:asF32(part.positions),normals:part.normals?.length?asF32(part.normals):computeNormals(part.positions,part.indices),indices:asU32(part.indices),uvs:asF32(part.uvs)};
    templates.set(variant,data);
   }
   let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
   for(let v=0;v<data.positions.length;v+=3){
    const x=data.positions[v]*scale,z=data.positions[v+2]*scale*.9;
    const wx=e+x*Math.cos(yaw)+z*Math.sin(yaw),wz=n+x*Math.sin(yaw)-z*Math.cos(yaw);
    minX=Math.min(minX,wx);maxX=Math.max(maxX,wx);minZ=Math.min(minZ,wz);maxZ=Math.max(maxZ,wz);
   }
   let base=groundHeight(e,n);
   for(const x of [minX,maxX])for(const z of [minZ,maxZ])base=Math.min(base,groundHeight(x,z));
   const y=base-.10*scale;
   const q=eulerToQuat(0,yaw,0);
   const matrix=mat4Compose(e,y,-n,q[0],q[1],q[2],q[3],scale,scale,scale*.9);
   let group=groups.get(variant);
   if(!group){
    const mesh=createMeshFromData(engine,`${asset.sourceId}-${variant}`,data.positions,data.normals,data.indices,data.uvs);
    mesh.material=material;mesh.receiveShadows=true;mesh.pickable=false;addToScene(scene,mesh);
    group={mesh,matrices:[],boxes:[]};groups.set(variant,group);
   }
   for(let k=0;k<16;k++)group.matrices.push(matrix[k]);
   const box={id:`${asset.sourceId}-${i}`,min:{x:minX,y:y,z:-maxZ},max:{x:maxX,y:y+scale*2,z:-minZ}};
   boxes.push(box);
  }
  for(const group of groups.values())setThinInstances(group.mesh,new Float32Array(group.matrices),group.matrices.length/16);
 }
 await place(rock as PropAsset,rockTexture,[[-2.7,5,.75,.3],[3.4,12,1.2,1.5],[-3.2,18,.85,2.4],[4.3,24,1.1,.8],[-4,35,.9,2.9],[3.7,43,.7,1.2],[-3.3,51,1.15,2]]);
 await place(slab as PropAsset,slabTexture,[[-3.3,10,.9,.2],[4.2,20,1.1,1.8],[-5.2,40,.85,2.3],[4.5,55,1.1,.6]]);
 await place(stump as PropAsset,stumpTexture,[[-4,14,.9,.3],[4.8,31,1.05,2.1],[-4.8,50,.85,1.4]]);
 await place(log as PropAsset,logTexture,[[-4.7,9,1,.3],[4.8,30,1.15,-.4],[-5.5,49,.9,.7],[7,57,1.2,.2]]);
}
