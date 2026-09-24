import { groveMatrices } from './grove-data.ts';
import {regionGroveMatrices} from './region-grove-data.ts';
import {regionCanopyGeometry} from './region-canopy-data.ts';
import {makeFloorPatch} from '../domain/floor-patch.ts';
import type {FloorGeometry} from '../domain/floor-patch.ts';
import { habitatWeights, speciesMix, pickSpecies } from './ecology.ts';
import { makePatch } from './patch-data.ts';
import { placementSeed, hash01 } from '../domain/geography.mjs';
import { createWorldGeography } from '../domain/world-geography.mjs';
import {createBrandywineGeography} from '../domain/regions/brandywine.mjs';
import { triangleHeight, trailIndex } from './math.ts';
import type { Grid, Trail, TreeRecord } from './schema.ts';
let coarse: any;
let geo: any, g: any, trailAt: ReturnType<typeof trailIndex>;
function vertexNormals(positions:number[],indices:number[]){
 const normals=new Float32Array(positions.length);
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const abx=positions[b]-positions[a],aby=positions[b+1]-positions[a+1],abz=positions[b+2]-positions[a+2];
  const acx=positions[c]-positions[a],acy=positions[c+1]-positions[a+1],acz=positions[c+2]-positions[a+2];
  const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
  for(const j of [a,b,c]){normals[j]+=nx;normals[j+1]+=ny;normals[j+2]+=nz;}
 }
 for(let i=0;i<normals.length;i+=3){const x=normals[i],y=Math.max(.65,Math.abs(normals[i+1])),z=normals[i+2],length=Math.hypot(x,y,z);normals[i]=x/length;normals[i+1]=y/length;normals[i+2]=z/length;}
 return normals;
}
function regionFloorChunk(e:number,n:number,water:'low'|'normal'|'high'){
 const parts:{grass:FloorGeometry[];leaves:FloorGeometry[]}={grass:[],leaves:[]};
 const values=new Float32Array(37*37);
 for(let y=0;y<37;y++)for(let x=0;x<37;x++)values[y*37+x]=geo.surfaceHeight(e-2+x,n-2+y);
 const heightGrid={origin:[e-2,n-2] as [number,number],stepM:1,columns:37,rows:37,values};
 const height=(E:number,N:number)=>triangleHeight(heightGrid,E,N);
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){
  const cellE=e+x*8,cellN=n+y*8,zone=geo.zoneAt(cellE+4,cellN+4),cover=zone?.rules.understoryCover??0;
  if(cover<.05)continue;
  const blocked=new Uint8Array(17*17);
  for(let by=0;by<17;by++)for(let bx=0;bx<17;bx++){
   const E=cellE+bx*.5,N=cellN+by*.5,z=geo.zoneAt(E,N);
   blocked[by*17+bx]=Number(!z||(z.rules.understoryCover??0)<.05||geo.coverExclusion(E,N)||(geo.waterAt(E,N,water)?.depth??0)>.03);
  }
  const allowed=(E:number,N:number,r:number)=>{
   const ix=Math.round((E-cellE)*2),iy=Math.round((N-cellN)*2),trail=trailAt(E,N);
   return ix>=0&&ix<=16&&iy>=0&&iy<=16&&!blocked[iy*17+ix]&&trail.distance>Math.max(.7,trail.width/2)+r+.4;
  };
  const patch=makeFloorPatch(cellE/8,cellN/8,[],height,cover>.4,allowed,cover>.4?'woodland':'meadow');
  parts.grass.push(patch.grass);parts.leaves.push(patch.leaves);
 }
 const pack=(items:FloorGeometry[])=>{
  const vertexCount=items.reduce((sum,item)=>sum+item.positions.length/3,0),indexCount=items.reduce((sum,item)=>sum+item.indices.length,0);
  const vertices=new Float32Array(vertexCount*12),indices=new Uint32Array(indexCount);
  let vertexOffset=0,indexOffset=0;
  const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  for(const item of items){
   const normals=vertexNormals(item.positions,item.indices),count=item.positions.length/3;
   for(let i=0;i<count;i++)vertices.set([
    item.positions[i*3]-e,item.positions[i*3+1],item.positions[i*3+2]+n,
    normals[i*3],normals[i*3+1],normals[i*3+2],
    item.uvs[i*2],item.uvs[i*2+1],
    linear(item.colors[i*4]),linear(item.colors[i*4+1]),linear(item.colors[i*4+2]),item.wind[i*4+2]??0,
   ],(vertexOffset+i)*12);
   for(let i=0;i<item.indices.length;i++)indices[indexOffset+i]=item.indices[i]+vertexOffset;
   vertexOffset+=count;indexOffset+=item.indices.length;
  }
  return {vertices,indices};
 };
 return {grass:pack(parts.grass),leaves:pack(parts.leaves)};
}
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
            geo = m.geographyKind==='brandywine'?createBrandywineGeography(g):createWorldGeography(g);
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
            const patch=makeFloorPatch(m.e/8,m.n/8,[],height,m.lush??true,allowed,m.regional);
            const result=Object.fromEntries(Object.entries(patch).map(([key,g])=>{
                const normals=vertexNormals(g.positions,g.indices);
                for(let i=0;i<g.positions.length;i+=3){g.positions[i]-=m.e;g.positions[i+2]+=m.n;}
                return [key,{positions:new Float32Array(g.positions),indices:new Uint32Array(g.indices),colors:new Float32Array(g.colors),uvs:new Float32Array(g.uvs),normals:new Float32Array(normals),wind:new Float32Array(g.wind)}];
            }));
            scope.postMessage({request:m.request,result},Object.values(result).flatMap(g=>Object.values(g).map(a=>a.buffer)));
            return;
        }
        if(m.type==='region-floor'){
            const result=regionFloorChunk(m.e,m.n,m.water);
            scope.postMessage({request:m.request,result},[result.grass.vertices.buffer,result.grass.indices.buffer,result.leaves.vertices.buffer,result.leaves.indices.buffer]);return;
        }
        if (m.type === 'groves') {
            const result = groveMatrices(m.p, m.origin, coarse);
            scope.postMessage({ request: m.request, result }, [result.matrices.buffer]);
            return;
        }
        if(m.type==='region-groves'){
            const result=regionGroveMatrices(m.p,m.origin,coarse,geo);
            scope.postMessage({request:m.request,result},Object.values(result).map(a=>a.buffer));return;
        }
        if(m.type==='region-canopy'){
            const result=regionCanopyGeometry(coarse,geo);
            scope.postMessage({request:m.request,result},Object.values(result).map(a=>a.buffer));return;
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
            const h = (e: number, n: number) => geo.surfaceHeight&&(e<grid.origin[0]||e>grid.origin[0]+512||n<grid.origin[1]||n>grid.origin[1]+512)?geo.surfaceHeight(e,n):triangleHeight(grid, e, n);
            const habitats = new Map<string, number[]>();
            for (let cy = y * 16; cy < (y + 1) * 16; cy++)
                for (let cx = x * 16; cx < (x + 1) * 16; cx++)
                    for (let i = 0; i < 16; i++) {
                        const seed = placementSeed(g.worldSeed, 'candidate', cx, cy, i), e = cx * 32 + (i % 4) * 8 + 4 + (hash01(seed, 1) - .5) * 4, n = cy * 32 + Math.floor(i / 4) * 8 + 4 + (hash01(seed, 2) - .5) * 4;
                        const zone = geo.zoneAt(e, n);
                        if (!zone)
                            continue;
                        const zi = g.zones.indexOf(zone), s = placementSeed(g.worldSeed, g.regionSource?g.regionSource.regionId+'-'+zone.id:zone.id, cx, cy, i), r = zone.rules;
                        const density = (r.treeDensityPerM2[0] + r.treeDensityPerM2[1]) * .5 * (g.regionSource&&zone.id!=='fields'&&zone.id!=='orchard'?1.65:1);
                        if (hash01(s, 3) > density * 64 || hash01(Math.floor(e / 96), Math.floor(n / 96), 73) < .1)
                            continue;
                        const hk = Math.floor(e / 64) + ',' + Math.floor(n / 64);
                        let mix = habitats.get(hk);
                        if (!mix) {
                            const wet = geo.nearbyWater(e, n).some((p: any) => p.distance < p.feature.water.floodplainHalfWidthM + 80);
                            mix = (zone.speciesWeights as number[] | undefined) ?? speciesMix(habitatWeights(Math.floor(e / 64) * 64 + 32, Math.floor(n / 64) * 64 + 32, geo.zoneAt), wet);
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
