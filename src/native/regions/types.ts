import type {WorldData} from '../../world/data.ts';
import type {RegionStructureLayout} from '../../domain/regions/structure-layout.ts';

export type Color3=readonly [number,number,number];

/** A renderer-neutral art direction. New regions provide data and a profile, not new WGSL. */
export interface RegionVisualProfile {
 groundTextureUrl:string;
 skyZenith:Color3;skyHorizon:Color3;fog:Color3;
 sun:Color3;sunDirection:Color3;ambient:Color3;
 waterShallow:Color3;waterDeep:Color3;
 /** World-space east/south flow; metres of visible water before it turns opaque. */
 riverFlowXZ:readonly [number,number];riverClarityM:number;riverRippleStrength:number;
 terrainTint:Color3;foliageTint:Color3;
 windStrength:number;cloudCoverage:number;
 fogDistanceM:number;nearTerrainM:number;nearTreesM:number;midTreesM:number;farTreesM:number;structureM:number;fineFloorM:number;
}

export interface NativeRegionSource {
 id:string;data:WorldData;layout:RegionStructureLayout;
 entry:{e:number;n:number};
 regionalAssetBase:string;treeLibraryUrl:string;
 visuals:RegionVisualProfile;
}

export interface NativeRegionActor {id:string;e:number;n:number;h:number;yaw:number;speed:number;kind:'hero'|'southerner'|'goblin'|'orc'|'wolf'|'raven'|'clue';visible:boolean;}
export interface NativeRegionFrame {
 eye:readonly [number,number,number];target:readonly [number,number,number];
 player:{e:number;n:number};time:number;actors:readonly NativeRegionActor[];
 active:boolean;
 boats:readonly {id:string;e:number;n:number;heading:number;occupied:boolean}[];
 weapon:'bow'|'sword';
 gateOpen:boolean;waterOffsetM:number;
}
