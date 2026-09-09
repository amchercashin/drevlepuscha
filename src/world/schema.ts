/** Metres ENU throughout the domain; Babylon coordinates exist only in runtime. */
export interface EN {
    e: number;
    n: number;
}
export interface Bounds {
    minE: number;
    minN: number;
    maxE: number;
    maxN: number;
}
export interface Grid {
    origin: [
        number,
        number
    ];
    stepM: number;
    columns: number;
    rows: number;
    values: Float32Array;
}
export type TrailKind = 'worn' | 'path' | 'trace';
export interface Trail {
    id: string;
    kind: TrailKind;
    width: number;
    points: number[][];
}
export interface Poi {
    id: string;
    name: string;
    kind: string;
    point: [
        number,
        number
    ];
    height: number;
    zone: string;
}
export interface MapData {
    bounds: Bounds;
    pois: Poi[];
    lines: {
        id: string;
        kind: string;
        points: number[][];
    }[];
    forest: number[][];
    trails: Trail[];
    zones: {
        id: string;
        name: string;
        color: string;
    }[];
    raster: {
        origin: [
            number,
            number
        ];
        stepM: number;
        columns: number;
        rows: number;
        heights: number[];
        zones: number[];
    };
    route: number[][];
}
export interface MapPose extends EN {
    yaw: number;
    fov: number;
}
export interface MapOptions {
    pose: () => MapPose;
    onOpen: (open: boolean) => void;
    travel: (id: string, signal: AbortSignal, progress: (text: string) => void) => Promise<void>;
    load: () => Promise<MapData>;
}
export interface TileSpec {
    file: string;
    bytes: number;
    sha256: string;
    stepM: number;
}
export interface WorldManifest {
    version: string;
    bounds: Bounds;
    tileSize: number;
    tiles: Record<string, TileSpec>;
    coarse: string;
    map: string;
    geography: string;
    trails: string;
    assetBytes: number;
    packedBytes: number;
}
export interface TreeRecord {
    id: string;
    e: number;
    n: number;
    h: number;
    family: number;
    variant: number;
    scale: number;
    width: number;
    yaw: number;
    radius: number;
    zone: number;
}
export interface TilePayload {
    id: string;
    grid: Grid;
    trees: TreeRecord[];
    trails: Trail[];
}
