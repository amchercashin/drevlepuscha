import type {BirdBehavior,SpeciesId} from './types.ts';
/** Species decisions are pure data, shared by browser and Node authorities. */
export const LAND_BEHAVIOR:Partial<Record<SpeciesId,BirdBehavior>>={
 'red-squirrel':{alertRadiusM:8,fleeRadiusM:4,runningMultiplier:1.5,confirmMs:400,recoverMs:1800,takeoffMs:400,speedMps:.8,observerClearanceM:1.1,cooldownMs:120000},
 'roe-deer':{alertRadiusM:16,fleeRadiusM:8,runningMultiplier:1.5,confirmMs:600,recoverMs:2500,takeoffMs:400,speedMps:.55,observerClearanceM:2.5,cooldownMs:180000}
};
