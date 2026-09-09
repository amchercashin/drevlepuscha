import { habitatWeights } from './ecology.ts';
import type { Grid } from './schema.ts';
import { triangleHeight, trailIndex } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
const palette = [[.37, .42, .27], [.43, .48, .3], [.28, .37, .31], [.33, .43, .33], [.37, .42, .29], [.39, .40, .28], [.57, .55, .36], [.43, .44, .28], [.43, .39, .29]];
export function makePatch(e: number, n: number, grid: Grid, geo: any, g: any, trailAt: ReturnType<typeof trailIndex>) {
    const positions = new Float32Array(65 * 65 * 3), normals = new Float32Array(65 * 65 * 3), uvs = new Float32Array(65 * 65 * 2), indices = new Uint16Array(64 * 64 * 6), pixels = new Uint8Array(128 * 128 * 4);
    const h = (x: number, y: number) => x < grid.origin[0] || x > grid.origin[0] + 512 || y < grid.origin[1] || y > grid.origin[1] + 512 ? geo.height(x, y) : triangleHeight(grid, x, y);
    let index = 0;
    for (let j = 0; j < 65; j++)
        for (let i = 0; i < 65; i++) {
            const k = j * 65 + i, x = e + i * 2, y = n + j * 2;
            positions.set([i * 2, h(x, y), -j * 2], k * 3);
            const dx = (h(x + 1, y) - h(x - 1, y)) / 2, dn = (h(x, y + 1) - h(x, y - 1)) / 2, len = Math.hypot(dx, 1, dn);
            normals.set([-dx / len, 1 / len, dn / len], k * 3);
            uvs.set([i / 64, j / 64], k * 2);
            if (i < 64 && j < 64) {
                indices.set([k, k + 1, k + 65, k + 1, k + 66, k + 65], index);
                index += 6;
            }
        }
    const cornerColors: number[][] = [];
    for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++) {
            const weights = habitatWeights(e + i * 64, n + j * 64, geo.zoneAt), c = [0, 0, 0];
            for (const [id, w] of weights) {
                const tint = palette[g.zones.findIndex((z: any) => z.id === id)] ?? [.57, .55, .36];
                for (let q = 0; q < 3; q++)
                    c[q] += tint[q] * w;
            }
            cornerColors.push(c);
        }
    for (let j = 0; j < 128; j++)
        for (let i = 0; i < 128; i++) {
            const x = e + i + .5, y = n + j + .5, p = trailAt(x, y), fade = p.kind === 'trace' ? .35 : p.kind === 'path' ? .65 : 1, w = Math.max(.3, p.width / 2), blend = Math.max(0, 1 - Math.max(0, p.distance - w) / .8) * fade, noise = .94 + hash01(x * 2, y * 2, 13) * .12, k = (j * 128 + i) * 4, cx = Math.floor(i / 64), cy = Math.floor(j / 64), u = (i % 64 + .5) / 64, v = (j % 64 + .5) / 64;
            for (let q = 0; q < 3; q++) {
                const a = cornerColors[cy * 3 + cx][q], b = cornerColors[cy * 3 + cx + 1][q], c = cornerColors[(cy + 1) * 3 + cx][q], d = cornerColors[(cy + 1) * 3 + cx + 1][q], tint = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
                pixels[k + q] = 255 * (tint * (1 - blend) + [.49, .40, .27][q] * blend) * noise;
            }
            pixels[k + 3] = 255;
        }
    return { positions, normals, uvs, indices, pixels };
}
