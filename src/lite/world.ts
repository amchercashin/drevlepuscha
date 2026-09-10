import {
 addToScene,createBox,createCylinder,createDirectionalLight,createHemisphericLight,createMeshFromData,
 createStandardMaterial,createSphere,createTransformNode,enableStandardVertexColors,loadTexture2D,setFog,
} from '@babylonjs/lite';
import type {DirectionalLight,EngineContext,HemisphericLight,Mesh,SceneContext,Texture2D,TransformNode} from '@babylonjs/lite';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {groundHeight,pathCentre} from '../domain/harness.ts';
import type {Box} from '../domain/harness.ts';
import {asF32,asU32,computeNormals,hexRgb} from './geometry.ts';
import {canopyShadePlugin,soilPatternPlugin,unlit} from './materials.ts';
import {createForestProps} from './props.ts';
import palette from '../../config/art-palette.json';
import soilURL from '../../assets/floor/soil.png';

export const CHECKPOINTS={
 entrance:{e:0,n:0,label:'Западный вход'},
 trunks:{e:0,n:10,label:'Узкий проход'},
 arch:{e:0,n:21,label:'Низкая арка'},
 slope:{e:0,n:34,label:'Подъём'},
 outer:{e:0,n:160,label:'Большой лес'},
};

export async function createWorld(engine:EngineContext,scene:SceneContext,shadowMatrix:Float32Array){
 enableStandardVertexColors();
 const boxes:Box[]=[];
 const color=(id:string)=>hexRgb(palette.colors.find(c=>c.id===id)!.hex);
 function material(name:string,c:[number,number,number]){const m=createStandardMaterial();m.name=name;return unlit(m,c);}
 const warm=material('traveller',color('traveller-accent'));
 const hood=material('hood',hexRgb('#9fa68a'));
 const skin=material('face',hexRgb('#d8bb91'));
 scene.clearColor={r:0.72,g:0.78,b:0.74,a:1};
 setFog(scene,{mode:2,density:0.011,start:0,end:1000,color:[0.52,0.68,0.74]});
 const fill=createHemisphericLight([0,1,0],0.60);
 fill.groundColor=[0.2,0.26,0.2];fill.diffuseColor=[0.78,0.87,1];
 addToScene(scene,fill);
 const sun=createDirectionalLight([-0.35,-0.65,0.6],1.05);
 sun.diffuse=[1,0.96,0.83];
 addToScene(scene,sun);

 const step=2,bounds=FOREST_BOUNDS;
 const north=Array.from({length:(bounds.maxN-bounds.minN)/step+1},(_,i)=>bounds.minN+i*step);
 const cols=(bounds.maxE-bounds.minE)/step+1,rows=north.length;
 const pos:number[]=[],indices:number[]=[],uvs:number[]=[],colors:number[]=[];
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const e=bounds.minE+i*step,n=north[j];
  pos.push(e,groundHeight(e,n),-n);uvs.push(e/5,n/5);colors.push(1,1,1,1);
  if(i<cols-1&&j<rows-1){const k=j*cols+i;indices.push(k,k+1,k+cols,k+1,k+cols+1,k+cols);}
 }
 const ground=createMeshFromData(engine,'ground',asF32(pos),computeNormals(pos,indices,true),asU32(indices),asF32(uvs),undefined,undefined,asF32(colors));
 const earth=material('earth',[1,1,1]);earth.backFaceCulling=false;
 earth.diffuseTexture=await loadTexture2D(engine,soilURL,{invertY:false,addressModeU:'mirror-repeat',addressModeV:'mirror-repeat'});
 earth.uvScale=[1,1];
 earth.plugins=[soilPatternPlugin(),canopyShadePlugin(shadowMatrix)];
 ground.material=earth;ground.receiveShadows=true;ground.pickable=false;
 addToScene(scene,ground);

 await createForestProps(engine,scene,boxes);

 const player=createTransformNode('traveller');
 addToScene(scene,player);
 function child(mesh:Mesh,y:number,z=0,x=0){
  mesh.parent=player;mesh.position.set(x,y,z);mesh.receiveShadows=true;mesh.pickable=false;addToScene(scene,mesh);return mesh;
 }
 const coat=createCylinder(engine,{height:0.67,diameterTop:0.27,diameterBottom:0.48,tessellation:8});coat.material=warm;child(coat,0.44);
 const head=createSphere(engine,{diameter:0.3,segments:8});head.material=hood;child(head,0.95);
 const face=createSphere(engine,{diameter:0.17,segments:6});face.material=skin;child(face,0.94,-0.105);
 const pack=createBox(engine,{width:0.3,height:0.37,depth:0.2});pack.material=hood;child(pack,0.53,0.22);
 const contact=createCylinder(engine,{height:0.003,diameter:0.65,tessellation:20});
 const contactMat=material('contact-color',[0.16,0.22,0.16]);contactMat.alpha=0.3;
 contact.material=contactMat;contact.receiveShadows=false;contact.pickable=false;addToScene(scene,contact);
 const playerMeshes=[coat,head,face,pack];
 const occluders=[...playerMeshes];
 return {boxes,player,shadow:contact,occluders,ground,sun,fill,playerMeshes,soilTexture:earth.diffuseTexture as Texture2D};
}

export type LiteWorld=Awaited<ReturnType<typeof createWorld>>;
export type {DirectionalLight,HemisphericLight,TransformNode};
