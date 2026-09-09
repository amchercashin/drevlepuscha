import {showcaseEnabled} from '../domain/showcase.ts';
import {createForestProps} from './forest-props.ts';
import {SoilPattern} from './soil-pattern.ts';
import {soilTexture} from './forest-floor.ts';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { groundHeight, pathCentre, BOUNDS } from '../domain/harness.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import type { Box } from '../domain/harness.ts';
import { createRandom, seedFor } from '../domain/seed.ts';
import palette from '../../config/art-palette.json';
import targets from '../../config/render-targets.json';

export const CHECKPOINTS = {
  entrance: { e: 0, n: 0, label: 'Западный вход' },
  trunks: { e: 0, n: 10, label: 'Узкий проход' },
  arch: { e: 0, n: 21, label: 'Низкая арка' },
  slope: { e: 0, n: 34, label: 'Подъём' },
  outer: { e: 0, n: 160, label: 'Большой лес' },
};

export function createWorld(scene: Scene, forestMode=false) {
  const boxes: Box[] = [];
  const color = (id: string) => Color3.FromHexString(palette.colors.find(c => c.id === id)!.hex);
  function material(name: string, c: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = c; m.specularColor.set(0, 0, 0); return m;
  }
  const bark = material('trunk', color('stone-trunk'));
  const leaf = material('canopy', color('canopy-main'));
  const stone = material('stone', Color3.FromHexString('#777e76'));
  const warm = material('traveller', color('traveller-accent'));
  const hood = material('hood', Color3.FromHexString('#9fa68a'));
  const skin = material('face', Color3.FromHexString('#d8bb91'));
  scene.clearColor = new Color4(0.72, 0.78, 0.74, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = showcaseEnabled ? 0.0025 : forestMode ? 0.004 : 0.023;
  scene.fogColor = new Color3(0.65, 0.73, 0.68);
  const fill = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  fill.intensity = showcaseEnabled ? 0.60 : forestMode ? 0.46 : 0.75; fill.groundColor = new Color3(0.2, 0.26, 0.2);if(forestMode)fill.diffuse=new Color3(0.78,0.87,1);
  const sun = new DirectionalLight('sun', forestMode?new Vector3(-0.35,-0.65,0.6):new Vector3(-0.5, -1, 0.3), scene);
  sun.intensity = forestMode ? 1.05 : 0.85; sun.diffuse = forestMode?showcaseEnabled?new Color3(1,.96,.83):new Color3(1,0.88,0.66):new Color3(1, 0.94, 0.78);

  // One fixed grid and a continuous height function shared with collision queries.
  const mesh = new Mesh('ground', scene), data = new VertexData();
  const uvs:number[]=[];
  const pos: number[] = [], indices: number[] = [], normals: number[] = [], colors: number[] = [];
  const bounds=forestMode?FOREST_BOUNDS:BOUNDS,step=showcaseEnabled?2:forestMode?4:1;
  const north=Array.from({length:(bounds.maxN-bounds.minN)/step+1},(_,i)=>bounds.minN+i*step);
  if(forestMode&&!showcaseEnabled)for(let n=28;n<=52;n++)if(!north.includes(n))north.push(n);north.sort((a,b)=>a-b);
  const cols = (bounds.maxE - bounds.minE)/step + 1, rows = north.length;
  const path = color('path'), earth = Color3.FromHexString('#63735b');
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const e = bounds.minE + i*step, n = north[j];
    pos.push(e, groundHeight(e, n), -n);uvs.push(e/5,n/5);
    const blend = Math.max(0, 1 - Math.max(0, Math.abs(e - pathCentre(n)) - 0.75) / 1.4);
    const soil=forestMode?Color3.Lerp(Color3.FromHexString('#686049'),Color3.FromHexString('#65724a'),0.5+0.3*Math.sin(e*0.31+n*0.17)+0.2*Math.sin(n*0.61-e*0.23)):earth;
    const c = Color3.Lerp(soil, path, blend);
    const shade = 0.96 + 0.04 * Math.sin(e * 0.72 + n * 0.33);
    colors.push(...(forestMode?[1,1,1,1]:[c.r * shade, c.g * shade, c.b * shade, 1]));
    if (i < cols - 1 && j < rows - 1) {
      const k = j * cols + i;
      indices.push(k, k + 1, k + cols, k + 1, k + cols + 1, k + cols);
    }
  }
  VertexData.ComputeNormals(pos, indices, normals, { useRightHandedSystem: true });
  data.uvs=uvs;data.positions = pos; data.indices = indices; data.normals = normals; data.colors = colors; data.applyToMesh(mesh);
  const earthMaterial = material('earth', Color3.White()); earthMaterial.backFaceCulling = false;
  if(forestMode){earthMaterial.diffuseTexture=soilTexture(scene);new SoilPattern(earthMaterial);mesh.receiveShadows=true;}
  mesh.material = earthMaterial;

  function box(id: string, e: number, n: number, width: number, height: number, depth: number, bottom = groundHeight(e, n)) {
    const m = CreateBox(id, { width, height, depth }, scene);
    m.position.set(e, bottom + height / 2, -n); m.material = stone;
    boxes.push({ id, min: {x:e-width/2,y:bottom,z:-n-depth/2}, max: {x:e+width/2,y:bottom+height,z:-n+depth/2} });
    return m;
  }
  function tree(id: string, e: number, n: number, radius: number, height: number) {
    const bottom = groundHeight(e, n);
    const trunk = CreateCylinder(id, {height, diameterBottom:radius*2, diameterTop:radius*1.35, tessellation:9}, scene);
    trunk.position.set(e, bottom+height/2, -n); trunk.material = bark;
    boxes.push({ id, min:{x:e-radius,y:bottom,z:-n-radius}, max:{x:e+radius,y:bottom+height,z:-n+radius} });
    for (let j = 0; j < 2; j++) {
      const crown=CreateSphere(`${id}-crown-${j}`,{segments:5,diameter:1},scene);
      crown.scaling.set(4.8+j*1.3,3.1,4.5);
      crown.position.set(e+(j===0?-1:1.1),bottom+height-0.7+j,-n+j*0.5);crown.material=leaf;
    }
  }
  // Purposeful test obstacles, separate from seeded background trees.
  if(!forestMode){
  tree('narrow-left',-1,14,0.55,10);
  tree('narrow-right',1,14,0.55,12);
  tree('camera-trunk',-2.8,5,0.9,14);
  tree('canopy-probe',3.6,7,1,15);
  }
  const rng=createRandom(seedFor(targets.fixedSeed,'m0-trees'));
  if(!forestMode){
  for(let i=0;i<26;i++) {
    const n=-7+i*2.5,e=(i%2?-1:1)*(5+rng()*12);
    tree(`forest-${i}`,e,n,0.35+rng()*0.5,7+rng()*7);
  }
  }
  if(!forestMode){
  box('arch-left',-1.65,25,0.65,2.4,1.1);
  box('arch-right',1.65,25,0.65,2.4,1.1);
  box('arch-lintel',0,25,3.95,0.6,1.1,groundHeight(0,25)+1.75);
  box('wall',-5,19,0.55,3.2,6);
  box('slope-rock',3,40,1.8,2.1,2.3);
  box('end-marker',0,55,1.1,2.8,0.85);
  for(let i=0;i<10;i++) box(`edge-stone-${i}`,(i%2?-1:1)*(3.2+rng()),4+i*4.5,0.5+rng()*0.5,0.2+rng()*0.3,0.65);
  }
  if(forestMode)createForestProps(scene,boxes);
  for(const m of scene.meshes) {m.freezeWorldMatrix();m.isPickable=false;}

  const occluders=scene.meshes.filter(m=>m!==mesh);

  const player=new TransformNode('traveller',scene);
  const coat=CreateCylinder('coat',{height:0.67,diameterTop:0.27,diameterBottom:0.48,tessellation:8},scene);
  coat.parent=player;coat.position.y=0.44;coat.material=warm;
  const head=CreateSphere('hood',{diameter:0.3,segments:8},scene);
  head.parent=player;head.position.y=0.95;head.material=hood;
  const face=CreateSphere('face',{diameter:0.17,segments:6},scene);
  face.parent=player;face.position.set(0,0.94,-0.105);face.material=skin;
  const pack=CreateBox('pack',{width:0.3,height:0.37,depth:0.2},scene);
  pack.parent=player;pack.position.set(0,0.53,0.22);pack.material=hood;
  const shadow=CreateCylinder('contact',{height:0.003,diameter:0.65,tessellation:20},scene);
  const shadowMat=material('contact-color',new Color3(0.16,0.22,0.16));shadowMat.alpha=0.3;
  shadow.material=shadowMat;
  return { boxes, player, shadow, occluders, ground:mesh, sun };
}
