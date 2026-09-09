import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { Library } from './library.ts';
import type { EN } from './schema.ts';
import { tileKey } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
import { fadeOpacity, occludesTraveller } from '../domain/harness.ts';
export class Dressing {
    tasks = new Map<string, Promise<void>>();
    origin: EN = { e: 0, n: 0 };
    groups = new Map<string, Mesh[]>();
    boxes: {
        id: string;
        e: number;
        n: number;
        w: number;
        d: number;
        bottom: number;
        top: number;
    }[] = [];
    last = '';
    pending = new Set<string>();
    materials: StandardMaterial[];
    constructor(public scene: Scene, public data: WorldData, public library: Library) { this.materials = ['#68715b', '#5a6649', '#a18b5d', '#7c6850', '#968676', '#bbc085'].map((color, i) => { const m = new StandardMaterial('dressing-' + i, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); return m; }); }
    place(m: Mesh, e: number, n: number, h: number) { m.position.set(e - this.origin.e, h, this.origin.n - n); m.metadata = { e, n }; m.receiveShadows = true; m.isPickable = false; m.freezeWorldMatrix(); return m; }
    box(id: string, e: number, n: number, w: number, height: number, d: number, mat = 0, bottom = this.data.height(e, n), collide = true) { const m = CreateBox(id, { width: w, height, depth: d }, this.scene); m.material = this.materials[mat]; this.place(m, e, n, bottom + height / 2); if (collide)
        this.boxes.push({ id, e, n, w, d, bottom, top: bottom + height }); return m; }
    async asset(id: string, asset: string, e: number, n: number, scale = 1, yaw = 0) { const f = await this.library.load(asset), source = f.variants[0][0]; return source.map((s, i) => { const m = new Mesh(id + '-' + i, this.scene); s.geometry!.applyToMesh(m); m.material = s.material; m.sideOrientation = 1; m.scaling.setAll(scale); m.rotation.y = yaw; this.place(m, e, n, this.data.height(e, n) - .08); return m; }); }
    async build(f: any) {
        const [e, n] = f.geometry.coordinates, id = f.id, out: Mesh[] = [];
        if (id === 'tom_house' || id === 'haysend') {
            const count = id === 'tom_house' ? 1 : 5;
            for (let i = 0; i < count; i++) {
                const ee = e + (i % 3) * 22, nn = n + Math.floor(i / 3) * 24;
                out.push(...await this.asset(id + '-' + i, 'cottage', ee, nn, id === 'tom_house' ? 1 : .85, -Math.PI / 2));
                const top = this.data.height(ee, nn) - .08, bottom = Math.min(...[-3.2, 3.2].flatMap(dx => [-3.8, 3.8].map(dn => this.data.height(ee + dx, nn + dn)))) - .25;
                out.push(this.box(id + '-foundation-' + i, ee, nn, 6.4, Math.max(.2, top - bottom), 7.6, 4, bottom));
                this.boxes.push({ id, e: ee, n: nn, w: 6, d: 10, bottom: this.data.height(ee, nn), top: this.data.height(ee, nn) + 5 });
            }
        }
        else if (id === 'old_man_willow') {
            out.push(...await this.asset(id, 'willow', e, n, 1.55));
            this.boxes.push({ id, e, n, w: 3.5, d: 3.5, bottom: this.data.height(e, n), top: this.data.height(e, n) + 10 });
        }
        else if (id === 'hay_gate') {
            const h = this.data.height(e, n), positions: number[] = [], indices: number[] = [], normals: number[] = [];
            for (let j = 0; j <= 12; j++) {
                const a = j * Math.PI / 12;
                for (const side of [-1, 1])
                    positions.push(side * 8, 1.1 + Math.sin(a) * 1.5, Math.cos(a) * 1.5);
                if (j < 12) {
                    const k = j * 2;
                    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
                }
            }
            const roof = new Mesh('entry-tunnel', this.scene), v = new VertexData();
            VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true });
            Object.assign(v, { positions, indices, normals });
            v.applyToMesh(roof);
            roof.material = this.materials[4];
            this.materials[4].backFaceCulling = false;
            out.push(this.place(roof, e, n, h));
            out.push(this.box(id + '-north', e, n + 1.8, 16, 2.5, .7, 4, h), this.box(id + '-south', e, n - 1.8, 16, 2.5, .7, 4, h));
            for (const side of [-1, 1]) {
                out.push(this.box(id + '-hedge-' + side, e, n + side * 21, 7, 3.8, 36, 1, h));
                for (let i = 0; i < 7; i++) {
                    const crown = CreateSphere(id + '-hedge-crown-' + side + '-' + i, { diameter: 1, segments: 3 }, this.scene);
                    crown.scaling.set(8 + hash01(i, side, 22) * 2, 4, 6.5);
                    crown.material = this.materials[1];
                    out.push(this.place(crown, e, n + side * (6 + i * 5), h + 3.7));
                }
            }
        }
        else if (id === 'flower_garden' || id === 'kitchen_garden') {
            const plants = CreateSphere(id + '-plants', { diameter: id === 'flower_garden' ? .34 : .42, segments: 2 }, this.scene);
            plants.material = this.materials[id === 'flower_garden' ? 2 : 1];
            const matrices = new Float32Array(91 * 16), matrix = Matrix.Identity();
            let count = 0;
            for (let j = -3; j <= 3; j++)
                for (let i = -6; i <= 6; i++) {
                    const ee = e + i * .7, nn = n + j * 1.1;
                    Matrix.ComposeToRef(Vector3.One(), Quaternion.Identity(), new Vector3(ee - e, this.data.height(ee, nn) + .15, n - nn), matrix);
                    matrix.copyToArray(matrices, count++ * 16);
                }
            this.place(plants, e, n, 0);
            plants.thinInstanceSetBuffer('matrix', matrices, 16, true);
            plants.thinInstanceRefreshBoundingInfo();
            out.push(plants);
            for (const side of [-1, 1])
                out.push(this.box(id + '-border-' + side, e, n + side * 4.3, 10, .18, .25, 4, undefined, false));
        }
        else if (id === 'bonfire_glade') {
            for (let i = 0; i < 9; i++) {
                const a = i * Math.PI * 2 / 9;
                out.push(...await this.asset(id + '-stone-' + i, 'rock', e + Math.cos(a) * 2, n + Math.sin(a) * 2, .24, a));
            }
            for (let i = 0; i < 3; i++)
                out.push(...await this.asset(id + '-log-' + i, 'log', e + (i - 1) * .7, n, .5, i * 1.1));
        }
        else if (id === 'short_fall') {
            for (let i = 0; i < 7; i++)
                out.push(...await this.asset(id + '-rock-' + i, 'slab', e - 12 + i * 4, n - 7, .65, i));
        }
        else if (id === 'lily_pool') {
            for (let i = 0; i < 25; i++) {
                const ee = e + (hash01(i, 10) - .5) * 20, nn = n + (hash01(i, 11) - .5) * 12, p = this.data.geo.nearbyWater(ee, nn)[0];
                if (!p)
                    continue;
                const m = CreateCylinder(id + '-' + i, { diameter: .35 + hash01(i, 12) * .4, height: .01, tessellation: 7 }, this.scene);
                m.material = this.materials[1];
                out.push(this.place(m, ee, nn, p.h + .05));
            }
        }
        this.groups.set(id, out);
    }
    ensure(f: any) { if (this.groups.has(f.id))
        return Promise.resolve(); const old = this.tasks.get(f.id); if (old)
        return old; this.pending.add(f.id); const task = this.build(f).finally(() => { this.pending.delete(f.id); this.tasks.delete(f.id); }); this.tasks.set(f.id, task); return task; }
    update(p: EN, eye: {
        x: number;
        y: number;
        z: number;
    }, h: number, dt: number) {
        const key = tileKey(p.e, p.n, 128);
        if (key !== this.last) {
            this.last = key;
            for (const f of this.data.geography.features.filter((f: any) => f.geometry.type === 'Point')) {
                const [e, n] = f.geometry.coordinates, d = Math.hypot(e - p.e, n - p.n);
                if (d < 480 && !this.groups.has(f.id) && !this.pending.has(f.id)) {
                    void this.ensure(f).catch(() => { });
                }
                else if (d > 800 && this.groups.has(f.id)) {
                    this.groups.get(f.id)!.forEach(m => m.dispose());
                    this.groups.delete(f.id);
                    this.boxes = this.boxes.filter(b => !b.id.startsWith(f.id));
                }
            }
        }
        const feet = { x: p.e - this.origin.e, y: h, z: this.origin.n - p.n };
        for (const group of this.groups.values())
            for (const m of group) {
                if (Math.hypot(m.metadata.e - p.e, m.metadata.n - p.n) > 25 && m.visibility > .999)
                    continue;
                const b = m.getBoundingInfo().boundingBox, blocked = occludesTraveller(eye, feet, { id: m.id, min: b.minimumWorld, max: b.maximumWorld }, m.visibility < .99, (from, to) => { const start = new Vector3(from.x, from.y, from.z), direction = new Vector3(to.x - from.x, to.y - from.y, to.z - from.z), length = direction.length(); direction.normalize(); const hit = new Ray(start, direction, length).intersectsMesh(m, false); return hit.hit && hit.distance < length - .001; });
                m.visibility = fadeOpacity(m.visibility, blocked ? .16 : 1, dt, blocked ? .12 : .3);
            }
    }
    blocked(e: number, n: number, h: number) { return this.boxes.some(b => h + 1 > b.bottom && h < b.top && Math.abs(e - b.e) < b.w / 2 + .28 && Math.abs(n - b.n) < b.d / 2 + .28); }
    rebase(origin: EN) { this.origin = origin; for (const group of this.groups.values())
        for (const m of group) {
            m.unfreezeWorldMatrix();
            m.position.x = m.metadata.e - origin.e;
            m.position.z = origin.n - m.metadata.n;
            m.freezeWorldMatrix();
        } }
}
