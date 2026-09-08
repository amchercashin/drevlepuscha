import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {groundHeight,pathCentre} from '../domain/harness.ts';
import type {Box,Point3} from '../domain/harness.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {createRandom,seedFor} from '../domain/seed.ts';

class GrassDistance extends MaterialPluginBase {
 feet:Point3={x:0,y:0,z:0};
 constructor(material:StandardMaterial){super(material,'GrassDistance',220,{},true,false);this._enable(true);}
 override isCompatible(_language:ShaderLanguage){return true;}
 override getAttributes(attributes:string[]){attributes.push('bladeHeight');}
 override getUniforms(language:ShaderLanguage){return {ubo:[{name:'grassFeet',size:3,type:'vec3'}],vertex:language===0?'#ifndef UNIFORMBUFFERS\nuniform vec3 grassFeet;\n#endif':''};}
 override bindForSubMesh(ubo:UniformBuffer){ubo.updateFloat3('grassFeet',this.feet.x,this.feet.y,this.feet.z);}
 override getCustomCode(type:string,language:ShaderLanguage){if(type!=='vertex')return null;return {CUSTOM_VERTEX_DEFINITIONS:language===1?'attribute bladeHeight: f32;':'attribute float bladeHeight;',CUSTOM_VERTEX_UPDATE_POSITION:language===1?'positionUpdated.y -= vertexInputs.bladeHeight * smoothstep(14.0,21.0,distance(positionUpdated.xz,uniforms.grassFeet.xz));':'positionUpdated.y -= bladeHeight * smoothstep(14.0,21.0,distance(positionUpdated.xz,grassFeet.xz));'};}
}

/** Small repeatable soil grain; broad moss/earth masses remain in vertex colours. */
export function soilTexture(scene:Scene){
 const texture=new DynamicTexture('soil-grain',256,scene,false);
 const ctx=texture.getContext(),r=createRandom(seedFor('m1-soil-v1'));
 ctx.fillStyle='#c1bcaa';ctx.fillRect(0,0,256,256);
 for(let i=0;i<7000;i++){const v=140+Math.floor(r()*65);ctx.fillStyle=`rgba(${v+12},${v+8},${v},0.28)`;ctx.fillRect(r()*256,r()*256,1+r()*4,1+r()*2);}
 // Small leaf litter is baked into the soil, not individual transparent meshes.
 for(let i=0;i<95;i++){const x=r()*256,y=r()*256,a=r()*Math.PI;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=i%3?'rgba(111,100,67,0.6)':'rgba(211,195,143,0.6)';ctx.beginPath();ctx.moveTo(-3,0);ctx.quadraticCurveTo(0,-2,4,0);ctx.quadraticCurveTo(0,2,-3,0);ctx.fill();ctx.restore();}
 texture.update();return texture;
}

/** Opaque tapered blades, batched by cell. Only a bounded neighbourhood exists. */
export function createForestFloor(scene:Scene,boxes:Box[]){
 const material=new StandardMaterial('grass',scene);material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.backFaceCulling=false;material.twoSidedLighting=true;
 const distance=new GrassDistance(material);
 const cells=new Map<string,Mesh>();let lastE=Infinity,lastN=Infinity;
 function cell(cx:number,cz:number){
  const nearby=boxes.filter(b=>b.max.x>=cx*8&&b.min.x<=(cx+1)*8&&b.max.z>=-(cz+1)*8&&b.min.z<=-cz*8);
  const random=createRandom(seedFor('m1-grass-v1',cx,cz));
  const uvs:number[]=[];
  const positions:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[];
  for(let i=0;i<150;i++){
   const e=cx*8+random()*8,n=cz*8+random()*8;
   if(e<FOREST_BOUNDS.minE||e>FOREST_BOUNDS.maxE||n<FOREST_BOUNDS.minN||n>FOREST_BOUNDS.maxN)continue;
   const pathDistance=Math.abs(e-pathCentre(n));
   if(pathDistance<1.35+random()*0.6||random()>0.65+0.25*Math.sin(e*0.45+n*0.24))continue;
   if(nearby.some(b=>e>b.min.x-0.25&&e<b.max.x+0.25&&-n>b.min.z-0.25&&-n<b.max.z+0.25))continue;
   const h=0.12+random()*0.22,tint=random();
   for(let blade=0;blade<5;blade++){
    const a=random()*Math.PI*2,w=0.018+random()*0.025,dx=Math.cos(a),dz=Math.sin(a),x=e+(random()-0.5)*0.17,z=-n+(random()-0.5)*0.17;
    const y=groundHeight(x,-z)-0.025,k=positions.length/3,top=h*(0.6+random()*0.6);
    positions.push(x-dz*w,y,z+dx*w,x+dz*w,y,z-dx*w,x+dx*top*0.35,y+top,z+dz*top*0.35);
    indices.push(k,k+1,k+2);uvs.push(0,0,0,0,top+0.03,0);
    for(let v=0;v<3;v++){const light=v===2?1.2:0.76;colors.push((0.27+tint*0.12)*light,(0.35+tint*0.13)*light,(0.12+tint*0.09)*light,1);}
   }
  }
  // Ferns share the opaque cell mesh: no additional material or draw call.
  for(let fern=0;fern<3;fern++){
   const e=cx*8+random()*8,n=cz*8+random()*8;
   if(e<FOREST_BOUNDS.minE||e>FOREST_BOUNDS.maxE||n<FOREST_BOUNDS.minN||n>FOREST_BOUNDS.maxN||Math.abs(e-pathCentre(n))<2.1)continue;
   if(nearby.some(b=>e>b.min.x-0.5&&e<b.max.x+0.5&&-n>b.min.z-0.5&&-n<b.max.z+0.5))continue;
   const y=groundHeight(e,n)-0.01,length=0.5+random()*0.3,rotation=random()*Math.PI*2;
   function vertex(x:number,h:number,z:number,tip=false){positions.push(x,y+h,z);uvs.push(h+0.025,0);colors.push(tip?0.43:0.24,tip?0.57:0.39,tip?0.31:0.26,1);}
   for(let frond=0;frond<7;frond++){
    const a=rotation+frond*Math.PI*2/7,dx=Math.cos(a),dz=Math.sin(a),len=length*(0.8+random()*0.25);
    for(let segment=0;segment<7;segment++){
     const a=segment/7,b=(segment+1)/7,k=positions.length/3;
     const ha=Math.sin(a*Math.PI*0.8)*len*0.48,hb=Math.sin(b*Math.PI*0.8)*len*0.48;
     vertex(e+dx*len*a-dz*0.006,ha,-n+dz*len*a+dx*0.006);vertex(e+dx*len*a+dz*0.006,ha,-n+dz*len*a-dx*0.006);
     vertex(e+dx*len*b-dz*0.006,hb,-n+dz*len*b+dx*0.006);vertex(e+dx*len*b+dz*0.006,hb,-n+dz*len*b-dx*0.006);
     indices.push(k,k+1,k+2,k+1,k+3,k+2);
    }
    for(let j=1;j<=6;j++){
     const t=j/7,cx=e+dx*len*t,cz=-n+dz*len*t,h=Math.sin(t*Math.PI*0.8)*len*0.48;
     const width=len*0.24*(1-t)+0.025;
     for(const side of [-1,1]){
      const k=positions.length/3;
      vertex(cx-dx*0.035,h,cz-dz*0.035);vertex(cx-dz*width*side+dx*0.04,h+0.015,cz+dx*width*side+dz*0.04,true);
      vertex(cx+dx*0.06,h+0.025,cz+dz*0.06);vertex(cx-dz*width*side*0.38,h+0.018,cz+dx*width*side*0.38);
      indices.push(k,k+1,k+3,k+1,k+2,k+3);
     }
    }
   }
  }
  VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();Object.assign(data,{positions,indices,normals,colors,uvs});const mesh=new Mesh(`grass-${cx}-${cz}`,scene);data.applyToMesh(mesh);mesh.setVerticesData('bladeHeight',uvs.filter((_,i)=>i%2===0),false,1);mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;mesh.freezeWorldMatrix();return mesh;
 }
 function update(feet:Point3){
  distance.feet=feet;
  const cx=Math.floor(feet.x/8),cz=Math.floor(-feet.z/8);if(cx===lastE&&cz===lastN)return;lastE=cx;lastN=cz;
  const wanted=new Set<string>();
  for(let z=cz-3;z<=cz+3;z++)for(let x=cx-3;x<=cx+3;x++){
   const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key))cells.set(key,cell(x,z));
  }
  for(const [key,mesh] of cells)if(!wanted.has(key)){mesh.dispose();cells.delete(key);}
 }
 return {update,stats:()=>({cells:cells.size,triangles:[...cells.values()].reduce((sum,m)=>sum+m.getTotalIndices()/3,0)})};
}
