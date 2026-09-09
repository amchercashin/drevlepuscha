import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { EN } from './schema.ts';
import type { WorldData } from './data.ts';
import type { Terrain } from './terrain.ts';
import { hash01 } from '../domain/geography.mjs';
import { tileKey } from './math.ts';
export class Floor {
    cells = new Map<string, Mesh>();
    queue: {
        e: number;
        n: number;
        id: string;
    }[] = [];
    last = '';
    origin: EN = { e: 0, n: 0 };
    material: StandardMaterial;
    constructor(public scene: Scene, public data: WorldData, public terrain: Terrain, public blocked: (e: number, n: number) => boolean) { this.material = new StandardMaterial('local-understory', scene); this.material.specularColor = Color3.Black(); this.material.backFaceCulling = false; this.material.twoSidedLighting = true; }
    build(e: number, n: number, id: string) {
        const positions: number[] = [], indices: number[] = [], normals: number[] = [], colors: number[] = [], zone = this.data.geo.zoneAt(e + 4, n + 4), cover = zone?.rules.understoryCover ?? .08;
        for (let i = 0; i < 72; i++) {
            const x = e + hash01(e + i, n, 991) * 8, y = n + hash01(e, n + i, 992) * 8;
            if (hash01(e + i, n, 993) > Math.min(.9, cover * 3 + .08) || this.terrain.trailAt(x, y).distance < Math.max(.7, this.terrain.trailAt(x, y).width / 2) + .6 || this.blocked(x, y) || this.data.waterDepth(x, y) > .03)
                continue;
            const h = this.data.height(x, y), size = .12 + hash01(e + i, n, 994) * .32;
            if (Math.abs(this.data.height(x + 1, y) - h) > .65)
                continue;
            for (let blade = 0; blade < 3; blade++) {
                const a = hash01(i, e + n, 996) * 6.28 + blade * 2.09, w = .035, dx = Math.cos(a) * w, dn = Math.sin(a) * w, k = positions.length / 3;
                positions.push(x - e - dx, h, n - y - dn, x - e + dx, h, n - y + dn, x - e + dx * 3, h + size, n - y + dn * 3);
                indices.push(k, k + 1, k + 2);
                for (let v = 0; v < 3; v++) {
                    normals.push(0, 1, 0);
                    colors.push(.28 + hash01(e + i, n, 998) * .13, .39 + hash01(e + i, n, 999) * .14, .19, 1);
                }
            }
            if (cover > .5 && i % 9 === 0) {
                for (let leaf = 0; leaf < 5; leaf++) {
                    const a = leaf * 1.256, k = positions.length / 3;
                    positions.push(x - e, h + .1, n - y, x - e + Math.cos(a) * .5, h + .3, n - y + Math.sin(a) * .5, x - e + Math.cos(a + .5) * .4, h + .2, n - y + Math.sin(a + .5) * .4);
                    indices.push(k, k + 1, k + 2);
                    for (let v = 0; v < 3; v++) {
                        normals.push(0, 1, 0);
                        colors.push(.24, .40, .24, 1);
                    }
                }
            }
        }
        const m = new Mesh('understory-' + id, this.scene), v = new VertexData();
        Object.assign(v, { positions, indices, normals, colors });
        v.applyToMesh(m);
        m.material = this.material;
        m.position.set(e - this.origin.e, 0, this.origin.n - n);
        m.metadata = { e, n };
        m.isPickable = false;
        m.receiveShadows = true;
        m.freezeWorldMatrix();
        this.cells.set(id, m);
    }
    update(p: EN) {
        const key = tileKey(p.e, p.n, 8);
        if (key !== this.last) {
            this.last = key;
            this.queue = [];
            const e = Math.floor(p.e / 8) * 8, n = Math.floor(p.n / 8) * 8, wanted = new Set<string>();
            for (let y = -3; y <= 3; y++)
                for (let x = -3; x <= 3; x++) {
                    const ee = e + x * 8, nn = n + y * 8, id = tileKey(ee, nn, 8);
                    wanted.add(id);
                    if (!this.cells.has(id))
                        this.queue.push({ e: ee, n: nn, id });
                }
            this.queue.sort((a, b) => Math.hypot(a.e - p.e, a.n - p.n) - Math.hypot(b.e - p.e, b.n - p.n));
            for (const [id, m] of this.cells)
                if (!wanted.has(id)) {
                    m.dispose();
                    this.cells.delete(id);
                }
        }
        const next = this.queue.shift();
        if (next && this.data.ready(next.e, next.n))
            this.build(next.e, next.n, next.id);
        for (const m of this.cells.values()) {
            const distance = Math.hypot(m.metadata.e + 4 - p.e, m.metadata.n + 4 - p.n);
            m.setEnabled(m.getTotalIndices() > 0 && distance < 26);
            m.unfreezeWorldMatrix();
            m.position.y = -Math.max(0, Math.min(1, (distance - 19) / 7)) * .6;
            m.freezeWorldMatrix();
        }
    }
    rebase(origin: EN) { this.origin = origin; for (const m of this.cells.values()) {
        m.unfreezeWorldMatrix();
        m.position.x = m.metadata.e - origin.e;
        m.position.z = origin.n - m.metadata.n;
        m.freezeWorldMatrix();
    } }
}
