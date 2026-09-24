import type {RegionVisualProfile} from '../native/regions/types.ts';
import groundTextureUrl from '../../assets/optimized/showcase/soil.webp';

/** Only Brandywine's art choices live here. The WebGPU renderer imports the interface. */
export const brandywineVisuals:RegionVisualProfile={
 groundTextureUrl,
 skyZenith:[.085,.25,.47],skyHorizon:[.52,.69,.77],fog:[.55,.67,.70],
 sun:[1,.84,.63],sunDirection:[-.45,.78,.42],ambient:[.34,.42,.40],
 waterShallow:[.22,.35,.31],waterDeep:[.045,.15,.17],
 riverFlowXZ:[.18,.98],riverClarityM:2.2,riverRippleStrength:1,
 terrainTint:[.93,1.04,.89],foliageTint:[.91,1.04,.78],
 windStrength:1,cloudCoverage:.4,
 fogDistanceM:1800,nearTerrainM:300,nearTreesM:65,midTreesM:160,farTreesM:390,structureM:900,fineFloorM:65,
};
