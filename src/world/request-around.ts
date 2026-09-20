import type {WorldData} from './data.ts';
import type {Terrain} from './terrain.ts';
import type {EN} from './schema.ts';
import {tileKey} from './math.ts';
export function requestLandscapeAround(data:WorldData, terrain:Terrain, p:EN) {
        const list: EN[] = [];
        for (let y = -3; y <= 3; y++)
            for (let x = -3; x <= 3; x++)
                list.push({ e: Math.floor(p.e / 128) * 128 + x * 128, n: Math.floor(p.n / 128) * 128 + y * 128 });
        list.sort((a, b) => Math.hypot(a.e + 64 - p.e, a.n + 64 - p.n) - Math.hypot(b.e + 64 - p.e, b.n + 64 - p.n));
        for (const point of list)
            if (data.manifest.tiles[tileKey(point.e, point.n)])
                terrain.request(point.e, point.n);
        const tiles: EN[] = [];
        for (let y = -1; y <= 1; y++)
            for (let x = -1; x <= 1; x++)
                tiles.push({ e: Math.floor(p.e / 512) * 512 + x * 512, n: Math.floor(p.n / 512) * 512 + y * 512 });
        tiles.sort((a, b) => Math.hypot(a.e + 256 - p.e, a.n + 256 - p.n) - Math.hypot(b.e + 256 - p.e, b.n + 256 - p.n));
        for (const t of tiles)
            if (data.manifest.tiles[tileKey(t.e, t.n)])
                void data.load(tileKey(t.e, t.n)).catch(() => { });
    }
