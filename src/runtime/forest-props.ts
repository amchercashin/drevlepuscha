import {FOREST_PROP_LAYOUT,propPlacement} from '../domain/forest-props-layout.ts';
import {showcaseTexture} from './showcase-textures.ts';
import {showcaseEnabled} from '../domain/showcase.ts';
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
 function place(asset:PropAsset,texture:string,placements:readonly (readonly number[])[]){
  const material=new StandardMaterial(asset.sourceId,scene);material.diffuseTexture=new Texture(showcaseTexture(texture),scene,false,false);material.specularColor=Color3.Black();
  const templates=new Map<number,Mesh>();
  const collisions=asset.variants.map(v=>collisionGeometry(v.levels[0]));
  for(const [i,input] of placements.entries()){
   const variant=i%asset.variants.length,id=`${asset.sourceId}-${i}`;let m:Mesh;
   const source=templates.get(variant);
   if(source)m=source.clone(id,null,true)!;
   else{m=new Mesh(id,scene);const data=new VertexData();Object.assign(data,asset.variants[variant].levels[0][0]);data.applyToMesh(m);m.sideOrientation=1;m.material=material;templates.set(variant,m);}
   const local=m.getBoundingInfo().boundingBox;
   const {e,n,scale,yaw,y}=propPlacement(input,showcaseEnabled,{min:local.minimum,max:local.maximum},groundHeight);
   m.scaling.set(scale,scale,scale*.9);m.rotation.y=yaw;
   m.position.set(e,y,-n);m.receiveShadows=true;m.computeWorldMatrix(true);
   const b=m.getBoundingInfo().boundingBox,matrix=m.getWorldMatrix();boxes.push({id:m.id,min:b.minimumWorld.clone(),max:b.maximumWorld.clone(),collision:meshCollider(collisions[variant],matrix.m,Matrix.Invert(matrix).m)});
  }
 }
 place(rock,rockTexture,FOREST_PROP_LAYOUT['moss-boulder']);
 place(slab,slabTexture,FOREST_PROP_LAYOUT['slate-slab']);
 place(stump,stumpTexture,FOREST_PROP_LAYOUT['old-stump']);
 place(log,logTexture,FOREST_PROP_LAYOUT['fallen-log']);
}
