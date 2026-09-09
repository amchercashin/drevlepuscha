import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { Library } from './library.ts';
import type { Terrain } from './terrain.ts';
import type { EN } from './schema.ts';
import { tileKey } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
export class Props {
    origin: EN = { e: 0, n: 0 };
    cells = new Map<string, {
        meshes: Mesh[];
        e: number;
        n: number;
        w: number;
        d: number;
    }>();
    queue: {
        e: number;
        n: number;
        id: string;
        asset: string;
        scale: number;
    }[] = [];
    last = '';
    wanted = new Set<string>();
    loading = false;
    constructor(public scene: Scene, public data: WorldData, public library: Library, public terrain: Terrain) { }
    update(p: EN) {
        const key = tileKey(p.e, p.n, 32);
        if (key !== this.last) {
            this.last = key;
            this.wanted.clear();
            this.queue = [];
            for (let y = Math.floor(p.n / 32) - 3; y <= Math.floor(p.n / 32) + 3; y++)
                for (let x = Math.floor(p.e / 32) - 3; x <= Math.floor(p.e / 32) + 3; x++) {
                    const e = x * 32 + 4 + hash01(x, y, 770) * 24, n = y * 32 + 4 + hash01(x, y, 771) * 24, id = x + ',' + y;
                    if (Math.hypot(e - p.e, n - p.n) > 95 || !this.data.ready(e, n))
                        continue;
                    const zone = this.data.geo.zoneAt(e, n);
                    if (!zone || hash01(x, y, 772) > .28 + zone.rules.deadwoodFraction || this.data.geo.exclusion(e, n) || this.data.waterDepth(e, n) > .03)
                        continue;
                    const path = this.terrain.trailAt(e, n);
                    if (path.distance < path.width / 2 + 4)
                        continue;
                    this.wanted.add(id);
                    if (!this.cells.has(id))
                        this.queue.push({ e, n, id, asset: ['rock', 'log', 'stump', 'slab'][Math.floor(hash01(x, y, 773) * 4)], scale: .55 + hash01(x, y, 774) * .65 });
                }
            this.queue.sort((a, b) => Math.hypot(a.e - p.e, a.n - p.n) - Math.hypot(b.e - p.e, b.n - p.n));
            for (const [id, c] of this.cells)
                if (!this.wanted.has(id)) {
                    c.meshes.forEach(m => m.dispose());
                    this.cells.delete(id);
                }
        }
        const next = this.queue.shift();
        if (next && !this.loading) {
            this.loading = true;
            void this.library.load(next.asset).then(f => { if (!this.wanted.has(next.id))
                return; const vi = Math.abs(Math.floor(next.e / 32) + Math.floor(next.n / 32)) % f.variants.length, source = f.variants[vi][0], meshes = source.map((s, i) => { const m = new Mesh('forest-prop-' + next.id + '-' + i, this.scene); s.geometry!.applyToMesh(m); m.material = s.material; m.sideOrientation = 1; m.scaling.setAll(next.scale); m.rotation.y = hash01(next.e, next.n, 775) * 6.28; let h = this.data.height(next.e, next.n); for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                h = Math.min(h, this.data.height(next.e + Math.cos(a) * 2, next.n + Math.sin(a) * 2));
            } m.position.set(next.e - this.origin.e, h - .1, this.origin.n - next.n); m.receiveShadows = true; m.isPickable = false; m.freezeWorldMatrix(); return m; }); const box = meshes[0].getBoundingInfo().boundingBox; this.cells.set(next.id, { meshes, e: next.e, n: next.n, w: box.maximumWorld.x - box.minimumWorld.x, d: box.maximumWorld.z - box.minimumWorld.z }); }).catch(() => { }).finally(() => { this.loading = false; });
        }
        else if (next)
            this.queue.unshift(next);
    }
    blocked(e: number, n: number) { for (const p of this.cells.values())
        if (Math.abs(e - p.e) < p.w / 2 + .28 && Math.abs(n - p.n) < p.d / 2 + .28)
            return true; return false; }
    rebase(origin: EN) { this.origin = origin; for (const p of this.cells.values())
        for (const m of p.meshes) {
            m.unfreezeWorldMatrix();
            m.position.x = p.e - origin.e;
            m.position.z = origin.n - p.n;
            m.freezeWorldMatrix();
        } }
}
