import aData from '../../assets/trees/meshy-a/tree.json?url';
import aTexture from '../../assets/trees/meshy-a/material-0.jpg';
import aConcept from '../../assets/trees/meshy-a/concept.png';
import bData from '../../assets/trees/meshy-b/tree.json?url';
import bTexture from '../../assets/trees/meshy-b/material-0.jpg';
import bConcept from '../../assets/trees/meshy-b/concept.png';
import type {TreeVariation} from '../domain/forest.ts';
import type {TreePart} from '../domain/reference-tree.ts';

export interface TreeAssetData {version:string;placement?:TreeVariation;bakedColorFromLevel?:number;levels:TreePart[][];triangles:number[];doubleSided?:Record<string,boolean>;textureInfo?:{name:string;mimeType:string}[];rootRadius?:number;trunkRadius?:number;}
const assets={
 'meshy-a':{id:'meshy-a',label:'А · концепт Codex',dataURL:aData,textures:{'material-0':aTexture},concept:aConcept},
 'meshy-b':{id:'meshy-b',label:'Б · концепт Meshy',dataURL:bData,textures:{'material-0':bTexture},concept:bConcept},
};
export function treeAsset(id:string|null){return id==='meshy-a'||id==='meshy-b'?assets[id]:undefined;}
