export type SpeciesId='woodland-bird'|'red-squirrel'|'roe-deer';
export interface ENH {e:number;n:number;h:number;}
export interface OriginEN {e:number;n:number;}
export interface MetricPlayerPose {e:number;n:number;headingDeg:number;speedMps:number;running:boolean;}
export interface WildlifeObserver extends MetricPlayerPose {id:string;h:number;observedAtMs:number;}
export interface WildlifeTreeDescriptor {id:string;familyId:string;variantId:string;assetVersion:string;modelToAbsoluteXYZ:readonly number[];bounds:{min:ENH;max:ENH};}
export interface ReadonlyTreeCatalog {get(id:string):WildlifeTreeDescriptor|undefined;all():Iterable<WildlifeTreeDescriptor>;nearby(e:number,n:number,radiusM:number):Iterable<WildlifeTreeDescriptor>;}
export interface WildlifeLimits {maxActiveEntities:number;decisionStepMs:number;maxCatchUpSteps:number;maxRecentEvents:number;maxVisibilityTestsPerStep:number;maxResidentCells:number;maxDormantRecords:number;activeRadiusM:number;exitRadiusM:number;exitDelayMs:number;eventLifetimeMs:number;}
export interface BirdBehavior {alertRadiusM:number;fleeRadiusM:number;runningMultiplier:number;confirmMs:number;recoverMs:number;takeoffMs:number;speedMps:number;observerClearanceM:number;cooldownMs:number;}
export interface WildlifeContentId {realmId:string;contentHash:string;behaviorVersion:number;}
export interface RouteRef {cellId:string;routeId:string;}
export interface HabitatSite {id:string;cellId:string;species:SpeciesId;home:ENH;allowedRoutes:readonly string[];refuges:readonly string[];treeId?:string;maxResidents:number;tags:readonly string[];}
export interface RouteSample {distanceM:number;point:ENH;normal:readonly [number,number,number];}
export interface PreparedRoute {id:string;kind:'ground'|'flight'|'mount-trunk'|'climb'|'refuge';from:string;to:string;lengthM:number;samples:readonly RouteSample[];bounds:{min:ENH;max:ENH};clearanceM:number;maxSlopeDeg:number;treeId?:string;}
export interface ObstacleProxy {id:string;min:ENH;max:ENH;}
export interface HabitatCell {id:string;contentHash:string;sites:readonly HabitatSite[];routes:readonly PreparedRoute[];neighbors:readonly string[];obstacles:readonly ObstacleProxy[];}
export interface WildlifeEnvironment {totalGameHours:number;daylight01:number;precipitation01:number;}
export interface WildlifeStepInput {simMs:number;observers:readonly WildlifeObserver[];environment:WildlifeEnvironment;}
export type BirdState='perched'|'alert'|'takeoff'|'flying'|'hidden';
export type SquirrelState='forage'|'alert'|'ground-bound'|'mount'|'climb'|'trunk-idle'|'hidden';
export type DeerState='graze'|'alert'|'walk-away'|'flee'|'recover'|'hidden';
interface PoseBase {id:string;generation:number;siteId:string;stateSinceMs:number;point:ENH;headingDeg:number;route:RouteRef|null;routeStartMs:number;routeStartDistanceM:number;speedMps:number;animationVariant:number;}
export type WildlifePose=PoseBase & ({species:'woodland-bird';state:BirdState}|{species:'red-squirrel';state:SquirrelState}|{species:'roe-deer';state:DeerState});
export interface WildlifeEvent {seq:number;entityId:string;entityGeneration:number;kind:'bird-flush'|'squirrel-scramble'|'deer-startle';atMs:number;position:ENH;cueVariant:number;}
export interface WildlifeFrame {v:1;authorityEpoch:string;content:WildlifeContentId;seq:number;simMs:number;eventWatermark:number;entities:readonly WildlifePose[];recentEvents:readonly WildlifeEvent[];}
export interface WildlifeRegionSource {readonly identity:WildlifeContentId;requestCells(ids:readonly string[],signal:AbortSignal):Promise<readonly HabitatCell[]>;getCell(id:string):HabitatCell|undefined;sampleGround(e:number,n:number):{ready:true;h:number}|{ready:false};findTree(id:string):WildlifeTreeDescriptor|undefined;}
export interface WildlifePackage {identity:WildlifeContentId;limits:WildlifeLimits;bird:BirdBehavior;cells:readonly HabitatCell[];treeBindings?:readonly {id:string;familyId:string;assetVersion:string}[];}
