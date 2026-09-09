import type { EN, Grid } from './schema.ts';
import { triangleHeight } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
export function groveMatrices(p: EN, origin: EN, grid: Grid & {
    zones: number[];
    forestMask: number[];
}) {
    const buffer = new Float32Array(18000 * 16);
    let count = 0;
    for (let y = Math.floor(p.n / 64) - 25; y <= Math.floor(p.n / 64) + 25; y++)
        for (let x = Math.floor(p.e / 64) - 25; x <= Math.floor(p.e / 64) + 25; x++) {
            const e = x * 64 + 32, n = y * 64 + 32, distance = Math.hypot(e - p.e, n - p.n);
            if (distance < 410 || distance > 1550)
                continue;
            const ix = Math.round((e - grid.origin[0]) / 128), iy = Math.round((n - grid.origin[1]) / 128);
            if (ix < 0 || iy < 0 || ix >= grid.columns || iy >= grid.rows)
                continue;
            const zone = grid.zones[iy * grid.columns + ix];
            if (zone < 0 || zone === 6 || !grid.forestMask[iy * grid.columns + ix])
                continue;
            for (let i = 0; i < 6; i++) {
                const ee = e + (hash01(x + i * 71, y, 600) - .5) * 64, nn = n + (hash01(x, y + i * 47, 601) - .5) * 64, h = triangleHeight(grid, ee, nn), s = 25 + hash01(x + i, y, 606) * 17, k = count++ * 16;
                buffer[k] = s;
                buffer[k + 5] = 12 + hash01(x, y + i, 607) * 12;
                buffer[k + 10] = s * .85;
                buffer[k + 12] = ee - origin.e;
                buffer[k + 13] = h + 15;
                buffer[k + 14] = origin.n - nn;
                buffer[k + 15] = 1;
            }
        }
    return { matrices: buffer.slice(0, count * 16), count };
}
