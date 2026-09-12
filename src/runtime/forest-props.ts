import {showcaseEnabled,showcasePath} from '../domain/showcase.ts';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {groundHeight} from '../domain/harness.ts';
import {collisionGeometry,meshCollider} from '../domain/mesh-collision.ts';
import {Matrix} from '@babylonjs/core/Maths/math.vector.js';
import type {Box} from '../domain/harness.ts';
import type {TreePart} from '../domain/reference-tree.ts';
import rock from '../../assets/rocks/moss-boulder/variants.json';
import rockTexture from '../../assets/rocks/moss-boulder/material-0.jpg';
import log from '../../assets/props/fallen-log/variants.json';
import logTexture from '../../assets/props/fallen-log/material-0.jpg';
import stump from '../../assets/props/old-stump/variants.json';
import stumpTexture from '../../assets/props/old-stump/material-0.jpg';
import slab from '../../assets/props/slate-slab/variants.json';
import slabTexture from '../../assets/props/slate-slab/material-0.jpg';

interface PropAsset {sourceId:string;variants:{levels:TreePart[][]}[];}
/** Prepared shape variants share one material per family and geometry across repeated copies. */
export function createForestProps(scene:Scene,boxes:Box[]){
 function place(asset:PropAsset,texture:string,placements:number[][]){
  const material=new StandardMaterial(asset.sourceId,scene);material.diffuseTexture=new Texture(texture,scene,false,false);material.specularColor=Color3.Black();
  const templates=new Map<number,Mesh>();
  const collisions=asset.variants.map(v=>collisionGeometry(v.levels[0]));
  for(const [i,[pe,pn,scale,yaw]] of placements.entries()){
   const n=showcaseEnabled?pn*4-70:pn,e=showcaseEnabled?showcasePath(n)+pe*1.8:pe;
   const variant=i%asset.variants.length,id=`${asset.sourceId}-${i}`;let m:Mesh;
   const source=templates.get(variant);
   if(source)m=source.clone(id,null,true)!;
   else{m=new Mesh(id,scene);const data=new VertexData();Object.assign(data,asset.variants[variant].levels[0][0]);data.applyToMesh(m);m.sideOrientation=1;m.material=material;templates.set(variant,m);}
   m.scaling.set(scale,scale,scale*.9);m.rotation.y=yaw;
   // Footprint comes from the warped geometry; sample the actual rotated base on hills.
   const local=m.getBoundingInfo().boundingBox;let base=groundHeight(e,n);
   for(const x of [local.minimum.x,local.maximum.x])for(const z of [local.minimum.z,local.maximum.z]){
    const dx=x*scale,dz=z*scale*.9;base=Math.min(base,groundHeight(e+dx*Math.cos(yaw)+dz*Math.sin(yaw),n+dx*Math.sin(yaw)-dz*Math.cos(yaw)));
   }
   m.position.set(e,base-.10*scale,-n);m.receiveShadows=true;m.computeWorldMatrix(true);
   const b=m.getBoundingInfo().boundingBox,matrix=m.getWorldMatrix();boxes.push({id:m.id,min:b.minimumWorld.clone(),max:b.maximumWorld.clone(),collision:meshCollider(collisions[variant],matrix.m,Matrix.Invert(matrix).m)});
  }
 }
 place(rock,rockTexture,[[-2.7,5,.75,.3],[3.4,12,1.2,1.5],[-3.2,18,.85,2.4],[4.3,24,1.1,.8],[-4,35,.9,2.9],[3.7,43,.7,1.2],[-3.3,51,1.15,2]]);
 place(slab,slabTexture,[[-3.3,10,.9,.2],[4.2,20,1.1,1.8],[-5.2,40,.85,2.3],[4.5,55,1.1,.6]]);
 place(stump,stumpTexture,[[-4,14,.9,.3],[4.8,31,1.05,2.1],[-4.8,50,.85,1.4]]);
 place(log,logTexture,[[-4.7,9,1,.3],[4.8,30,1.15,-.4],[-5.5,49,.9,.7],[7,57,1.2,.2]]);
}
