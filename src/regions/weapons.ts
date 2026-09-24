import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Weapon} from '../domain/regions/hunt.ts';

/** Small readable weapons until the ranger receives dedicated hand animations. */
export function createRegionWeapons(scene:Scene,hero:TransformNode){
 const material=(id:string,color:string)=>{const m=new StandardMaterial(id,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();return m;};
 const wood=material('bow-wood','#755737'),string=material('bow-string','#c2ad7b'),steel=material('sword-steel','#a9b7b3'),grip=material('sword-grip','#57402c');
 const bow=new TransformNode('ranger-bow',scene),sword=new TransformNode('ranger-sword',scene);bow.parent=hero;sword.parent=hero;
 const bar=(id:string,root:TransformNode,x:number,y:number,z:number,width:number,height:number,depth:number,mat:StandardMaterial,angle=0)=>{
  const mesh=CreateBox(id,{width,height,depth},scene);mesh.parent=root;mesh.position.set(x,y,z);mesh.rotation.z=angle;mesh.material=mat;mesh.isPickable=false;return mesh;
 };
 const points=Array.from({length:9},(_,i)=>({x:.55+.23*Math.sin(i/8*Math.PI),y:.54+i*.145}));
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
  bar('bow-limb-'+i,bow,(a.x+b.x)/2,(a.y+b.y)/2,-.24,.045,Math.hypot(dx,dy)+.015,.045,wood,-Math.atan2(dx,dy));
 }
 bar('bow-string',bow,.55,1.12,-.24,.012,1.18,.012,string);
 bar('sword-blade',sword,.55,1.15,-.25,.075,.75,.024,steel);
 bar('sword-guard',sword,.55,.76,-.25,.29,.045,.075,steel);
 bar('sword-grip',sword,.55,.57,-.25,.065,.32,.065,grip);
 return {update(weapon:Weapon){bow.setEnabled(weapon==='bow');sword.setEnabled(weapon==='sword');}};
}
