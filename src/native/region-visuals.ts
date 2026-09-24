/** Art direction supplied by a region; the WebGPU shader uses the same data layout everywhere. */
export interface SurfaceFinish {roughness:number;translucency:number}
export interface TreeLodRange {near:number;far:number;blend:number}

export interface NativeRegionVisuals {
 lightShafts:readonly {e:number;n:number;height:number;radius:number}[];
 shaftGain:number;
 fogDistanceScale:number;
 finishes:Readonly<Record<'terrain'|'trunk'|'cloth'|'foliage'|'stone'|'timber',SurfaceFinish>>;
 treeLod:Readonly<{high:TreeLodRange;balanced:TreeLodRange;performance:TreeLodRange;drawDistance:number}>;
 foliageAtlasUrl:string;
 crownLeaves:Readonly<{count:number;scale:number;lift:number;tint:readonly [number,number,number];atlasQuadrants:readonly number[]}>;
}

export const MAX_LIGHT_SHAFTS=4;
export const REGION_VISUAL_FLOATS=(MAX_LIGHT_SHAFTS+2)*4;

export function packRegionVisuals(visuals:NativeRegionVisuals):Float32Array {
 if(visuals.lightShafts.length>MAX_LIGHT_SHAFTS)throw new Error(`Регион поддерживает не более ${MAX_LIGHT_SHAFTS} световых лучей.`);
 if(!Number.isFinite(visuals.shaftGain)||visuals.shaftGain<0||!Number.isFinite(visuals.fogDistanceScale)||visuals.fogDistanceScale<=0)throw new Error('Некорректные параметры освещения региона.');
 for(const [name,finish] of Object.entries(visuals.finishes)){
  if(!Number.isFinite(finish.roughness)||finish.roughness<.12||finish.roughness>1||!Number.isFinite(finish.translucency)||finish.translucency<0||finish.translucency>1)throw new Error(`Некорректный материал региона: ${name}.`);
 }
 if(!Number.isFinite(visuals.treeLod.drawDistance)||visuals.treeLod.drawDistance<=0)throw new Error('Некорректная дальность деревьев региона.');
 for(const name of ['high','balanced','performance'] as const){
  const {near,far,blend}=visuals.treeLod[name];
  if(![near,far,blend].every(Number.isFinite)||near<=blend*.5||far<=near+blend||visuals.treeLod.drawDistance<=far+blend*.5)throw new Error(`Некорректный LOD деревьев региона: ${name}.`);
 }
 const leaves=visuals.crownLeaves;
 if(!visuals.foliageAtlasUrl||!Number.isInteger(leaves.count)||leaves.count<0||leaves.count>2000||!Number.isFinite(leaves.scale)||leaves.scale<=0||leaves.scale>3||!Number.isFinite(leaves.lift)||leaves.lift<0||leaves.lift>1||leaves.tint.some(value=>!Number.isFinite(value)||value<0||value>1)||leaves.atlasQuadrants.length<1||leaves.atlasQuadrants.some(value=>!Number.isInteger(value)||value<0||value>3))throw new Error('Некорректные листья кроны региона.');
 const packed=new Float32Array(REGION_VISUAL_FLOATS);
 visuals.lightShafts.forEach(({e,n,height,radius},i)=>{
  if(![e,n,height,radius].every(Number.isFinite)||radius<=0)throw new Error(`Некорректный световой луч региона: ${i}.`);
  packed.set([e,height,-n,radius],i*4);
 });
 packed.set([visuals.shaftGain,visuals.lightShafts.length,visuals.fogDistanceScale,0],MAX_LIGHT_SHAFTS*4);
 return packed;
}
