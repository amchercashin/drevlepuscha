import type {WindPreset} from './wind.ts';
export const WIND_SLIDERS={
 intensity:{label:'Общая сила',min:0,max:6,step:.05},
 gustStrength:{label:'Сила порывов',min:0,max:4,step:.05},
 gustFrequency:{label:'Частота порывов',min:.25,max:3,step:.05},
 canopyBend:{label:'Изгиб крон',min:0,max:4,step:.05},
 coverBend:{label:'Движение травы и папоротников',min:0,max:3,step:.05},
 motionSpeed:{label:'Темп колебаний',min:.25,max:2.5,step:.05},
} as const;
export type WindKnob=keyof typeof WIND_SLIDERS;
export type WindSettings={enabled:boolean;preset:WindPreset}&Record<WindKnob,number>;
export const DEFAULT_WIND:WindSettings={enabled:true,intensity:1,preset:'forest',gustStrength:1,gustFrequency:1,canopyBend:1,coverBend:1,motionSpeed:1};
/** Partial updates preserve old saved preferences; unknown/non-finite values are ignored. */
export function updateWindSettings(current:WindSettings,patch:Partial<WindSettings>){
 const result={...current};
 if(typeof patch.enabled==='boolean')result.enabled=patch.enabled;
 if(patch.preset==='forest'||patch.preset==='enchanted')result.preset=patch.preset;
 for(const key of Object.keys(WIND_SLIDERS) as WindKnob[]){const value=patch[key],range=WIND_SLIDERS[key];if(typeof value==='number'&&Number.isFinite(value))result[key]=Math.max(range.min,Math.min(range.max,value));}
 return result;
}
