import { soilTexture } from '../runtime/forest-floor.ts';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { EN } from './schema.ts';
import { WorldGround } from './ground.ts';
import { triangleHeight, tileKey, trailIndex } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
const palette = [[.37, .42, .27], [.43, .48, .3], [.28, .37, .31], [.33, .43, .33], [.37, .42, .29], [.39, .40, .28], [.57, .55, .36], [.43, .44, .28], [.43, .39, .29]];
export class Terrain {
    focus: EN = { e: 0, n: 0 };
    keep: EN | undefined;
    patches = new Map<string, Mesh>();
    pending = new Set<string>();
    jobs: (() => void)[] = [];
    origin: EN = { e: 0, n: 0 };
    plugins: WorldGround[] = [];
    far: Mesh[] = [];
    litter: Texture;
    cutBytes = new Uint8Array(32 * 32 * 4);
    cuts: RawTexture;
    cutOrigin: EN = { e: 0, n: 0 };
    trailAt: ReturnType<typeof trailIndex>;
    lastBuildMs = 0;
    maxBuildMs = 0;
    uploaded = 0;
    constructor(public scene: Scene, public data: WorldData) { this.cuts = RawTexture.CreateRGBATexture(this.cutBytes, 32, 32, scene, false, false, Texture.NEAREST_SAMPLINGMODE); this.cuts.wrapU = this.cuts.wrapV = Texture.CLAMP_ADDRESSMODE; this.trailAt = trailIndex(data.trails); this.litter = soilTexture(scene); this.litter.uScale = this.litter.vScale = 32; }
    material(name: string, far = 0, canopy = 0) { const m = new StandardMaterial(name, this.scene); m.diffuseColor = Color3.White(); m.specularColor = Color3.Black(); m.backFaceCulling = false; const plugin = new WorldGround(m, this.cuts, this.litter); plugin.far = far; plugin.canopy = canopy; this.plugins.push(plugin); return m; }
    createFar() {
        const g = this.data.coarse, ground = this.material('distant-land', 1), canopy = this.material('distant-canopy', 0, 1);
        canopy.backFaceCulling = true;
        for (let y = 0; y < g.rows - 1; y += 32)
            for (let x = 0; x < g.columns - 1; x += 32) {
                const cols = Math.min(32, g.columns - 1 - x) + 1, rows = Math.min(32, g.rows - 1 - y) + 1;
                for (let layer = 0; layer < 2; layer++) {
                    const positions: number[] = [], indices: number[] = [], colors: number[] = [], normals: number[] = [];
                    for (let j = 0; j < rows; j++)
                        for (let i = 0; i < cols; i++) {
                            const k = (y + j) * g.columns + x + i, e = g.origin[0] + (x + i) * 128, n = g.origin[1] + (y + j) * 128, zone = g.zones[k], forest = !!g.forestMask[k];
                            positions.push(i * 128, g.values[k] + (layer && forest ? 14 + hash01(x + i, y + j, 127) * 8 : 0), -j * 128);
                            const c = palette[zone] ?? [.53, .54, .36], shade = .85 + hash01(x + i, y + j, 129) * .2;
                            colors.push(...c.map(v => v * shade * (layer ? .76 : 1)), 1);
                            if (i < cols - 1 && j < rows - 1) {
                                const a = j * cols + i;
                                if (!layer || [k, k + 1, k + g.columns, k + g.columns + 1].every(v => g.forestMask[v]))
                                    indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
                            }
                        }
                    VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true });
                    if (!indices.length)
                        continue;
                    const m = new Mesh('world-far-' + layer + '-' + x + '-' + y, this.scene), v = new VertexData();
                    Object.assign(v, { positions, indices, normals, colors });
                    v.applyToMesh(m);
                    m.material = layer ? canopy : ground;
                    m.position.set(g.origin[0] + x * 128, 0, -g.origin[1] - y * 128);
                    m.metadata = { e: m.position.x, n: -m.position.z };
                    m.isPickable = false;
                    m.freezeWorldMatrix();
                    this.far.push(m);
                }
            }
    }
    request(e: number, n: number) {
        const pe = Math.floor(e / 128) * 128, pn = Math.floor(n / 128) * 128, id = tileKey(e, n, 128);
        if (this.patches.has(id) || this.pending.has(id))
            return;
        this.pending.add(id);
        void this.data.load(tileKey(e, n)).then(async (tile) => { const geometry = await this.data.call('patch', { e: pe, n: pn, grid: tile.grid }); this.jobs.push(() => { if (Math.hypot(pe + 64 - this.focus.e, pn + 64 - this.focus.n) < 660 || (this.keep && Math.hypot(pe + 64 - this.keep.e, pn + 64 - this.keep.n) < 660))
            this.build(pe, pn, id, geometry); this.pending.delete(id); }); }).catch(() => this.pending.delete(id));
    }
    build(e: number, n: number, id: string, geometry: any) {
        const { positions, normals, indices, uvs, pixels } = geometry;
        const texture = RawTexture.CreateRGBATexture(pixels, 128, 128, this.scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        const m = new Mesh('terrain-' + id, this.scene), v = new VertexData();
        Object.assign(v, { positions, normals, indices, uvs });
        v.applyToMesh(m);
        const mat = this.material('soil-' + id);
        mat.diffuseTexture = texture;
        m.material = mat;
        m.position.set(e - this.origin.e, .012, this.origin.n - n);
        m.metadata = { e, n, ready: false, plugin: this.plugins.at(-1) };
        m.isPickable = false;
        m.receiveShadows = true;
        m.freezeWorldMatrix();
        this.patches.set(id, m);
        this.uploaded += positions.length * 4 + normals.length * 4 + uvs.length * 4 + indices.length * 2 + pixels.byteLength;
        this.updateCuts();
    }
    updateCuts() { this.cutBytes.fill(0); for (const m of this.patches.values()) {
        if (!m.metadata.ready)
            continue;
        const x = (m.metadata.e - this.cutOrigin.e) / 128, y = (m.metadata.n - this.cutOrigin.n) / 128;
        if (x >= 0 && x < 32 && y >= 0 && y < 32) {
            const k = (y * 32 + x) * 4;
            this.cutBytes[k] = 255;
            this.cutBytes[k + 3] = 255;
        }
    } this.cuts.update(this.cutBytes); }
    update(p: EN, eye: {
        e: number;
        n: number;
        h: number;
    }, heroH: number) {
        this.focus = { ...p };
        const cut = { e: Math.floor(p.e / 128) * 128 - 2048, n: Math.floor(p.n / 128) * 128 - 2048 };
        if (cut.e !== this.cutOrigin.e || cut.n !== this.cutOrigin.n) {
            this.cutOrigin = cut;
            this.updateCuts();
        }
        for (const plugin of this.plugins) {
            plugin.origin = this.origin;
            plugin.player = p;
            plugin.camera = eye;
            plugin.heroH = heroH;
            plugin.cutOrigin = this.cutOrigin;
        }
        if (this.jobs.length) {
            const start = performance.now();
            this.jobs.shift()!();
            this.lastBuildMs = performance.now() - start;
            this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
        }
        let activated = false;
        for (const m of this.patches.values())
            if (!m.metadata.ready && m.isReady(true)) {
                m.metadata.ready = true;
                activated = true;
            }
        if (activated)
            this.updateCuts();
        for (const [id, m] of this.patches)
            if (Math.hypot(m.metadata.e + 64 - p.e, m.metadata.n + 64 - p.n) > 660 && (!this.keep || Math.hypot(m.metadata.e + 64 - this.keep.e, m.metadata.n + 64 - this.keep.n) > 660)) {
                const mat = m.material as StandardMaterial;
                this.plugins = this.plugins.filter(x => x !== m.metadata.plugin);
                mat.diffuseTexture?.dispose();
                mat.dispose();
                m.dispose();
                this.patches.delete(id);
                this.updateCuts();
            }
    }
    rebase(origin: EN) { this.origin = origin; for (const m of [...this.far, ...this.patches.values()]) {
        m.unfreezeWorldMatrix();
        m.position.x = m.metadata.e - origin.e;
        m.position.z = origin.n - m.metadata.n;
        m.freezeWorldMatrix();
    } }
    ready(p: EN) { return this.patches.get(tileKey(p.e, p.n, 128))?.metadata.ready === true; }
    stats() { return { patches: this.patches.size, preparing: this.pending.size, uploadQueue: this.jobs.length, lastBuildMs: this.lastBuildMs, maxBuildMs: this.maxBuildMs, uploadedBytes: this.uploaded }; }
}
