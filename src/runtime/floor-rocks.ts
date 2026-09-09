import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {groundHeight} from '../domain/harness.ts';
import type {Box} from '../domain/harness.ts';
import rock from '../../assets/rocks/moss-boulder/rock.json';
import textureURL from '../../assets/rocks/moss-boulder/material-0.jpg';

/** Small authored trial along the route: one shared 662-triangle mesh and one atlas. */
export function createFloorRocks(scene:Scene,boxes:Box[]){
 const material=new StandardMaterial('moss-boulder',scene);material.diffuseTexture=new Texture(textureURL,scene,false,false);material.specularColor=Color3.Black();
 const source=new Mesh('moss-boulder-0',scene),data=new VertexData();Object.assign(data,rock.parts[0]);data.applyToMesh(source);source.sideOrientation=1;source.material=material;
 const placements=[[-2.7,5,.75,.3],[3.4,12,1.2,1.5],[-3.2,18,.85,2.4],[4.3,24,1.1,.8],[-4,35,.9,2.9],[3.7,43,.7,1.2],[-3.3,51,1.15,2]];
 for(const [i,[e,n,scale,yaw]] of placements.entries()){
  const m=i===0?source:source.clone('moss-boulder-'+i,null,true)!;
  m.scaling.set(scale,scale,scale*.9);m.rotation.y=yaw;
  // Sample footprint and bury the base; upper surface remains a genuine 3D silhouette.
  let base=groundHeight(e,n);for(let j=0;j<8;j++){const a=j*Math.PI/4;base=Math.min(base,groundHeight(e+Math.cos(a)*scale*.8,n+Math.sin(a)*scale*.8));}
  m.position.set(e,base-.12*scale,-n);m.receiveShadows=true;m.computeWorldMatrix(true);
  const b=m.getBoundingInfo().boundingBox;boxes.push({id:m.id,min:b.minimumWorld.clone(),max:b.maximumWorld.clone()});
 }
}
