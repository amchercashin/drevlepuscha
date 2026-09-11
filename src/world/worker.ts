import { groveMatrices } from './grove-data.ts';
import {makeFloorPatch} from '../domain/floor-patch.ts';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { habitatWeights, speciesMix, pickSpecies } from './ecology.ts';
import { makePatch } from './patch-data.ts';
import { placementSeed, hash01 } from '../domain/geography.mjs';
import { createWorldGeography } from '../domain/world-geography.mjs';
import { triangleHeight, trailIndex } from './math.ts';
import type { Grid, Trail, TreeRecord } from './schema.ts';
let coarse: any;
let geo: any, g: any, trailAt: ReturnType<typeof trailIndex>;
const scope = self as unknown as {
    onmessage: (event: MessageEvent) => void;
    postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
async function unzip(buffer: ArrayBuffer) { return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); }
scope.onmessage = async ({ data: m }) => {
    try {
        if (m.type === 'init') {
            g = m.geography;
            coarse = m.coarse;
            geo = createWorldGeography(g);
            trailAt = trailIndex(m.trails);
            scope.postMessage({ request: m.request, result: true });
            return;
        }
        if (m.type === 'json') {
            const result = JSON.parse(new TextDecoder().decode(await unzip(m.buffer)));
            scope.postMessage({ request: m.request, result });
            return;
        }
        if (m.type === 'floor') {
            const height=(e:number,n:number)=>triangleHeight(m.grid,e,n);
            const allowed=(e:number,n:number,r:number)=>{
                const x=Math.round((e-m.e)*2),y=Math.round((n-m.n)*2);
                if(x<0||y<0||x>16||y>16||m.blocked[y*17+x])return false;
                const trail=trailAt(e,n);
                return trail.distance>Math.max(.7,trail.width/2)+r+.4;
            };
            const patch=makeFloorPatch(m.e/8,m.n/8,[],height,true,allowed);
            const result=Object.fromEntries(Object.entries(patch).map(([key,g])=>{
                const normals:number[]=[];VertexData.ComputeNormals(g.positions,g.indices,normals);
                for(let i=0;i<normals.length;i+=3){normals[i+1]=Math.max(.65,Math.abs(normals[i+1]));const l=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]/=l;}
                for(let i=0;i<g.positions.length;i+=3){g.positions[i]-=m.e;g.positions[i+2]+=m.n;}
                return [key,{positions:new Float32Array(g.positions),indices:new Uint32Array(g.indices),colors:new Float32Array(g.colors),uvs:new Float32Array(g.uvs),normals:new Float32Array(normals)}];
            }));
            scope.postMessage({request:m.request,result},Object.values(result).flatMap(g=>Object.values(g).map(a=>a.buffer)));
            return;
        }
        if (m.type === 'groves') {
            const result = groveMatrices(m.p, m.origin, coarse);
            scope.postMessage({ request: m.request, result }, [result.matrices.buffer]);
            return;
        }
        if (m.type === 'patch') {
            const result = makePatch(m.e, m.n, m.grid, geo, g, trailAt);
            scope.postMessage({ request: m.request, result }, Object.values(result).map(v => v.buffer));
            return;
        }
        if (m.type === 'tile') {
            const [x, y] = m.id.split(',').map(Number), values = new Float32Array(await unzip(m.buffer)), step = m.stepM, columns = 512 / step + 1;
            if (values.length !== columns * columns)
                throw Error('Invalid tile size ' + m.id);
            const grid: Grid = { origin: [x * 512, y * 512], stepM: step, columns, rows: columns, values }, trees: TreeRecord[] = [];
            const h = (e: number, n: number) => triangleHeight(grid, e, n);
            const habitats = new Map<string, number[]>();
            for (let cy = y * 16; cy < (y + 1) * 16; cy++)
                for (let cx = x * 16; cx < (x + 1) * 16; cx++)
                    for (let i = 0; i < 16; i++) {
                        const seed = placementSeed(g.worldSeed, 'candidate', cx, cy, i), e = cx * 32 + (i % 4) * 8 + 4 + (hash01(seed, 1) - .5) * 4, n = cy * 32 + Math.floor(i / 4) * 8 + 4 + (hash01(seed, 2) - .5) * 4;
                        const zone = geo.zoneAt(e, n);
                        if (!zone)
                            continue;
                        const zi = g.zones.indexOf(zone), s = placementSeed(g.worldSeed, zone.id, cx, cy, i), r = zone.rules;
                        const density = (r.treeDensityPerM2[0] + r.treeDensityPerM2[1]) * .5;
                        if (hash01(s, 3) > density * 64 || hash01(Math.floor(e / 96), Math.floor(n / 96), 73) < .1)
                            continue;
                        const hk = Math.floor(e / 64) + ',' + Math.floor(n / 64);
                        let mix = habitats.get(hk);
                        if (!mix) {
                            const wet = geo.nearbyWater(e, n).some((p: any) => p.distance < p.feature.water.floodplainHalfWidthM + 80);
                            mix = speciesMix(habitatWeights(Math.floor(e / 64) * 64 + 32, Math.floor(n / 64) * 64 + 32, geo.zoneAt), wet);
                            habitats.set(hk, mix);
                        }
                        const family = pickSpecies(mix, hash01(s, 8));
                        const scale = .72 + hash01(s, 4) * .6, width = .8 + hash01(s, 5) * .32, root = [6.25, 7.07, 1.79, 4.11, 8.52][family] * width, trail = trailAt(e, n);
                        if (trail.distance < Math.max(.45, trail.width / 2) + root + .4 || geo.exclusion(e, n))
                            continue;
                        let valid = true, base = h(e, n), high = base;
                        for (let j = 0; j < 8; j++) {
                            const a = j * Math.PI / 4, ee = e + Math.cos(a) * root, nn = n + Math.sin(a) * root;
                            if (geo.exclusion(ee, nn)) {
                                valid = false;
                                break;
                            }
                            const v = h(ee, nn);
                            base = Math.min(base, v);
                            high = Math.max(high, v);
                        }
                        if (!valid || high - base > 3.2)
                            continue;
                        trees.push({ id: `${cx}/${cy}/${i}`, e, n, h: base - .14, scale, width, family, variant: s % 3, yaw: hash01(s, 6) * Math.PI * 2, radius: (family === 2 ? .32 : .65) * width, zone: zi });
                    }
            scope.postMessage({ request: m.request, result: { id: m.id, grid, trees } }, [values.buffer]);
        }
    }
    catch (error) {
        scope.postMessage({ request: m.request, error: String(error) });
    }
};
