/** Art direction supplied by a region; the WebGPU shader uses the same data layout everywhere. */
export interface NativeRegionVisuals {
 lightShafts:readonly {e:number;n:number;height:number;radius:number}[];
 shaftGain:number;
 fogDistanceScale:number;
}

export const MAX_LIGHT_SHAFTS=4;
export const REGION_VISUAL_FLOATS=(MAX_LIGHT_SHAFTS+1)*4;

export function packRegionVisuals(visuals:NativeRegionVisuals):Float32Array {
 if(visuals.lightShafts.length>MAX_LIGHT_SHAFTS)throw new Error(`Регион поддерживает не более ${MAX_LIGHT_SHAFTS} световых лучей.`);
 if(!Number.isFinite(visuals.shaftGain)||visuals.shaftGain<0||!Number.isFinite(visuals.fogDistanceScale)||visuals.fogDistanceScale<=0)throw new Error('Некорректные параметры освещения региона.');
 const packed=new Float32Array(REGION_VISUAL_FLOATS);
 visuals.lightShafts.forEach(({e,n,height,radius},i)=>{
  if(![e,n,height,radius].every(Number.isFinite)||radius<=0)throw new Error(`Некорректный световой луч региона: ${i}.`);
  packed.set([e,height,-n,radius],i*4);
 });
 packed.set([visuals.shaftGain,visuals.lightShafts.length,visuals.fogDistanceScale,0],MAX_LIGHT_SHAFTS*4);
 return packed;
}
