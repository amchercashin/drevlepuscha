import type { EN, Grid, Trail, TreeRecord, Bounds } from './schema.ts';
export const tileKey = (e: number, n: number, size = 512) => Math.floor(e / size) + ',' + Math.floor(n / size);
export const originFor = (p: EN) => ({ e: Math.floor(p.e / 512) * 512, n: Math.floor(p.n / 512) * 512 });
/** Same diagonal as terrain indices a,b,c / b,d,c; never bilinear collision. */
export function triangleHeight(grid: Grid, e: number, n: number) {
    const x = Math.max(0, Math.min(grid.columns - 1, (e - grid.origin[0]) / grid.stepM)), y = Math.max(0, Math.min(grid.rows - 1, (n - grid.origin[1]) / grid.stepM));
    const i = Math.min(Math.floor(x), grid.columns - 2), j = Math.min(Math.floor(y), grid.rows - 2), u = x - i, v = y - j, k = j * grid.columns + i;
    const a = grid.values[k], b = grid.values[k + 1], c = grid.values[k + grid.columns], d = grid.values[k + grid.columns + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function trailIndex(trails: Trail[], size = 64) {
    const bins = new Map<string, {
        a: number[];
        b: number[];
        width: number;
        kind: string;
    }[]>();
    for (const t of trails)
        for (let i = 1; i < t.points.length; i++) {
            const a = t.points[i - 1], b = t.points[i], m = t.width / 2 + 10;
            for (let y = Math.floor((Math.min(a[1], b[1]) - m) / size); y <= Math.floor((Math.max(a[1], b[1]) + m) / size); y++)
                for (let x = Math.floor((Math.min(a[0], b[0]) - m) / size); x <= Math.floor((Math.max(a[0], b[0]) + m) / size); x++) {
                    const k = x + ',' + y, items = bins.get(k) ?? [];
                    if (!bins.has(k))
                        bins.set(k, items);
                    items.push({ a, b, width: t.width, kind: t.kind });
                }
        }
    return (e: number, n: number) => { let distance = Infinity, width = 0, kind = 'trace'; for (const s of bins.get(tileKey(e, n, size)) ?? []) {
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], t = Math.max(0, Math.min(1, ((e - s.a[0]) * dx + (n - s.a[1]) * dy) / (dx * dx + dy * dy))), d = Math.hypot(e - s.a[0] - t * dx, n - s.a[1] - t * dy);
        if (d - s.width / 2 < distance - width / 2) {
            distance = d;
            width = s.width;
            kind = s.kind;
        }
    } return { distance, width, kind, clear: distance < Math.max(.45, width / 2) + .2 }; };
}
export function moveOnTerrain(p: EN, de: number, dn: number, query: {
    height: (e: number, n: number) => number;
    ready: (e: number, n: number) => boolean;
    waterDepth: (e: number, n: number) => number;
    blocked: (e: number, n: number) => boolean;
}, bounds: Bounds) {
    let { e, n } = p;
    const steps = Math.max(1, Math.ceil(Math.hypot(de, dn) / .12));
    function allowed(x: number, y: number) {
        if (x < bounds.minE + 1 || x > bounds.maxE - 1 || y < bounds.minN + 1 || y > bounds.maxN - 1 || !query.ready(x, y) || query.waterDepth(x, y) > .35 || query.blocked(x, y))
            return false;
        const delta = Math.abs(query.height(x, y) - query.height(e, n)), length = Math.hypot(x - e, y - n);
        return delta <= .3 && delta <= Math.tan(40 * Math.PI / 180) * length + .008;
    }
    for (let i = 0; i < steps; i++) {
        const x = de / steps, y = dn / steps;
        if (allowed(e + x, n + y)) {
            e += x;
            n += y;
        }
        else {
            if (x && allowed(e + x, n))
                e += x;
            if (y && allowed(e, n + y))
                n += y;
        }
    }
    return { e, n };
}
export function treesBlock(trees: Iterable<TreeRecord>, e: number, n: number) { for (const t of trees)
    if ((t.e - e) ** 2 + (t.n - n) ** 2 < (t.radius + .28) ** 2)
        return true; return false; }
