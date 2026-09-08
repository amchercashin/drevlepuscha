import './tree-preview.css';
import {treeAsset} from './runtime/tree-assets.ts';
import type {TreeAssetData} from './runtime/tree-assets.ts';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { createRenderer } from './runtime/engine.ts';
import { createReferenceTree, TREE_VERSION } from './domain/reference-tree.ts';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import barkURL from '../assets/trees/bark.png';
import canopyURL from '../assets/trees/canopy.png';
import gameURL from '../assets/trees/game/tree.json?url';
import { treeGLB } from './domain/tree-glb.ts';

try {
  const renderer=await createRenderer(document.querySelector<HTMLCanvasElement>('#tree-canvas')!);
  const {engine,canvas}=renderer,scene=new Scene(engine);scene.useRightHandedSystem=true;
  scene.clearColor=new Color4(0.906,0.898,0.867,1);
  const camera=new ArcRotateCamera('inspection',Math.PI/2,Math.PI/2-0.05,30,new Vector3(0,9,0),scene);
  camera.minZ=0.04;camera.maxZ=200;camera.fov=0.72;
  camera.lowerRadiusLimit=1;camera.upperRadiusLimit=65;camera.lowerBetaLimit=0.01;camera.upperBetaLimit=Math.PI-0.01;
  camera.wheelPrecision=18;camera.panningSensibility=80;camera.inertia=0.65;
  camera.attachControl(canvas,true);scene.activeCamera=camera;
  const ambient=new HemisphericLight('sky',new Vector3(0,1,0),scene);ambient.intensity=0.85;ambient.groundColor=new Color3(0.5,0.54,0.48);
  const sun=new DirectionalLight('soft daylight',new Vector3(-0.5,-0.8,-0.5),scene);sun.intensity=0.6;sun.diffuse=new Color3(1,0.96,0.87);
  const params=new URLSearchParams(location.search),selected=treeAsset(params.get('model')),game=params.get('model')==='game'||!!selected;
  const lod=Math.max(0,Math.min(2,Number(params.get('lod'))||0));
  const cache:TreeAssetData|undefined=game?await (await fetch(selected?.dataURL??gameURL)).json():undefined;
  const parts=cache?cache.levels[lod]:createReferenceTree(),meshes:Mesh[]=[];
  const version=cache?`${cache.version??'game-tree-v1'}-lod${lod}`:TREE_VERSION;
  const exportOptions={doubleSided:cache?.doubleSided,textureMimeTypes:Object.fromEntries(cache?.textureInfo?.map(t=>[t.name,t.mimeType])??[]),...(selected?{source:'Meshy Smart Topology T2; generation.json records provenance'}:{})};
  if(game){document.querySelector('.intro')!.textContent=`Игровое дерево · уровень ${lod}. Общая геометрия для вариаций леса.`;document.querySelector<HTMLElement>('#lod-links')!.hidden=false;const back=document.querySelector<HTMLAnchorElement>('aside > a')!;back.href='./?scene=m1';back.textContent='Вернуться в лес M1';}
  const textureURLs:Record<string,string>=selected?selected.textures:{bark:barkURL,canopy:canopyURL};
  const textures=Object.fromEntries(Object.entries(textureURLs).map(([name,url])=>[name,new Texture(url,scene,false,false)]));
  const textureBytes=lod>=(cache?.bakedColorFromLevel??Infinity)?{}:Object.fromEntries(await Promise.all(Object.entries(textureURLs).map(async([name,url])=>[name,new Uint8Array(await (await fetch(url)).arrayBuffer())])));
  if(selected){
    document.querySelector('h1')!.textContent=selected.label;
    document.querySelector('.intro')!.textContent='Одинаковые свет, масштаб и ракурсы. Одна проба каждого пути.';
    const links=document.querySelector('#lod-links')!;
    links.querySelectorAll<HTMLAnchorElement>('a').forEach((a,i)=>{const next=new URLSearchParams(params);next.set('lod',String(i));a.href='?'+next;});
    const back=document.querySelector<HTMLAnchorElement>('aside > a')!;back.href=`./?scene=m1&tree=${selected.id}`;back.textContent='Посмотреть это дерево в лесу';
    const panel=document.createElement('div');panel.className='asset-comparison';
    panel.innerHTML=`<nav aria-label="Варианты генерации"><a href="?model=meshy-a&lod=${lod}">А · Codex</a><a href="?model=meshy-b&lod=${lod}">Б · Meshy</a></nav><a href="${selected.concept}" target="_blank" rel="noopener"><img src="${selected.concept}" alt="Исходный концепт дерева: ${selected.label}"></a><p>Концепт — нажмите для увеличения</p>`;
    document.querySelector('header')!.append(panel);
  }
  parts.forEach(p=>{
    const mesh=new Mesh(p.name,scene),v=new VertexData();mesh.sideOrientation=1;
    v.positions=p.positions;v.normals=p.normals;v.uvs=p.uvs;v.colors=p.colors;v.indices=p.indices;v.applyToMesh(mesh);
    const m=new StandardMaterial(p.name,scene);m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.ambientColor=new Color3(0.15,0.15,0.15);m.diffuseTexture=lod>=(cache?.bakedColorFromLevel??Infinity)?null:textures[p.name]??null;m.backFaceCulling=!(cache?.doubleSided?.[p.name]??false);mesh.material=m;mesh.freezeWorldMatrix();meshes.push(mesh);
  });
  function mat(name:string,color:string){const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();return m;}
  const ground=CreateDisc('ground',{radius:4.1,tessellation:64},scene);ground.rotation.x=Math.PI/2;ground.position.y=-0.08;ground.scaling.y=0.88;ground.material=mat('earth','#9ba17e');
  // Feathered contact patch, below all roots. Transparent rings share one draw each.
  const shadowMaterial=mat('shadow','#75806a');shadowMaterial.disableLighting=true;shadowMaterial.emissiveColor=Color3.FromHexString('#75806a');
  for(let i=0;i<5;i++){const s=CreateDisc('contact shadow',{radius:4.6+i*0.17,tessellation:48},scene);s.rotation.x=Math.PI/2;s.position.y=-0.12-i*0.005;s.scaling.y=0.77;s.material=shadowMaterial;s.visibility=0.06;}
  const cloak=CreateCylinder('traveller cloak',{height:0.76,diameterBottom:0.4,diameterTop:0.19,tessellation:9},scene);cloak.position.set(2.25,0.49,2.3);cloak.material=mat('ochre cloak','#8d6345');
  const head=CreateSphere('traveller hood',{diameter:0.24,segments:8},scene);head.position.set(2.25,0.99,2.3);head.material=mat('hood','#5b6250');
  for(const x of [2.16,2.34]){const foot=CreateSphere('foot',{diameter:0.14,segments:6},scene);foot.scaling.set(0.75,0.7,1.6);foot.position.set(x,0.07,2.36);foot.material=mat('foot','#6e6656');}
  const staff=CreateCylinder('staff',{height:1.08,diameter:0.025,tessellation:6},scene);staff.position.set(2.53,0.54,2.36);staff.material=mat('staff','#625a47');
  const presets:Record<string,{position:Vector3;target:Vector3}>= {
    front:{position:new Vector3(0,10,35),target:new Vector3(0,9,0)},
    right:{position:new Vector3(35,10,0),target:new Vector3(0,9,0)},
    back:{position:new Vector3(0,10,-35),target:new Vector3(0,9,0)},
    left:{position:new Vector3(-35,10,0),target:new Vector3(0,9,0)},
    top:{position:new Vector3(0,35,0.02),target:new Vector3(0,7,0)},
    roots:{position:new Vector3(5,3.2,7),target:new Vector3(0,1.3,0)},
    traveller:{position:new Vector3(0,1.1,6.5),target:new Vector3(0,10,0)},
  };
  function preset(name:string){const p=presets[name];if(!p)return;camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=0;camera.inertialPanningX=camera.inertialPanningY=0;camera.setTarget(p.target);camera.setPosition(p.position);if(['front','right','back','left'].includes(name))camera.radius=Math.max(camera.radius,14/(2*Math.tan(camera.fov/2)*(canvas.clientWidth/canvas.clientHeight)));if(selected&&['front','right','back','left'].includes(name))camera.radius*=1.1;document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));}
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>preset(b.dataset.view!));preset('front');
  document.querySelector<HTMLInputElement>('#wireframe')!.onchange=e=>meshes.forEach(m=>(m.material as StandardMaterial).wireframe=(e.target as HTMLInputElement).checked);
  const download=document.querySelector<HTMLButtonElement>('#download')!;download.disabled=false;
  download.onclick=()=>{const url=URL.createObjectURL(new Blob([treeGLB(parts,textureBytes,version,exportOptions)],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download=`${version}.glb`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function resize(){const scale=Math.min(1,1280/canvas.clientWidth,720/canvas.clientHeight);engine.setSize(Math.round(canvas.clientWidth*scale),Math.round(canvas.clientHeight*scale));}resize();window.addEventListener('resize',resize);
  const triangles=parts.reduce((s,p)=>s+p.indices.length/3,0),vertices=parts.reduce((s,p)=>s+p.positions.length/3,0);
  document.querySelector('#tree-stats')!.textContent=`${triangles.toLocaleString('ru-RU')} треугольников\nМатериалы: ${parts.length} · ${renderer.kind==='webgpu'?'WebGPU':'WebGL2'}\nНастоящая объёмная геометрия`;
  let frames=0;const times:number[]=[];let last=performance.now();
  engine.runRenderLoop(()=>{scene.render();frames++;const now=performance.now();if(frames>60){times.push(now-last);if(times.length>3600)times.shift();}last=now;});
  if(new URLSearchParams(location.search).has('debug'))Object.defineProperty(window,'treePreview',{value:{preset,stats:()=>({version,triangles,vertices,materials:parts.length,renderer:renderer.kind,frames,camera:camera.position.asArray(),frameTimes:[...times]}),orbit:(angle:number)=>{camera.alpha=angle;},exportGLB:()=>Array.from(new Uint8Array(treeGLB(parts,textureBytes,version,exportOptions)))}});
  window.addEventListener('pagehide',()=>{scene.dispose();engine.dispose();},{once:true});
} catch(error){const el=document.querySelector<HTMLElement>('#error')!;el.hidden=false;el.textContent=`Не удалось открыть дерево: ${String(error)}\nПопробуйте добавить ?renderer=webgl2 к адресу.`;console.error(error);}
