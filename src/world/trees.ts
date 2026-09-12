import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { Library } from './library.ts';
import type { EN, TreeRecord } from './schema.ts';
import { tileKey } from './math.ts';
import { fadeOpacity, occludesTraveller } from '../domain/harness.ts';
import {PLAYER_RADIUS,PLAYER_HEIGHT} from '../domain/harness.ts';
import {meshCollider,meshBlocksCylinder} from '../domain/mesh-collision.ts';
import type {MeshCollider} from '../domain/mesh-collision.ts';
interface NearTree {
    t: TreeRecord;
    meshes: Mesh[];
    level: number;
    opacity: number;
}
interface Batch {
    meshes: Mesh[];
    buffer: Float32Array;
    records: TreeRecord[];
    e: number;
    n: number;
}
export class Trees {
    batchQueue = new Map<string, TreeRecord[]>();
    near = new Map<string, NearTree>();
    batches = new Map<string, Batch>();
    origin: EN = { e: 0, n: 0 };
    lastCell = '';
    nearQueue: TreeRecord[] = [];
    resident: TreeRecord[] = [];
    colliderCells = new Map<string, TreeRecord[]>();
    colliders = new WeakMap<TreeRecord,MeshCollider>();
    lastBuildMs = 0;
    maxBuildMs = 0;
    scene: Scene;
    data: WorldData;
    library: Library;
    constructor(scene: Scene, data: WorldData, library: Library) { this.scene=scene;this.data=data;this.library=library; }
    refresh(p: EN) {
        const list: TreeRecord[] = [];
        for (const tile of this.data.tiles.values())
            for (const t of tile.trees)
                if (Math.hypot(t.e - p.e, t.n - p.n) < 430)
                    list.push(t);
        this.resident = list;
        this.colliderCells.clear();
        for (const t of list) {
            const f=this.library.tree(t.family),geometry=f.collisions[t.variant%f.collisions.length];
            let c=this.colliders.get(t);
            if(!c||c.geometry!==geometry){const m=treeMatrix(t);c=meshCollider(geometry,m.m,Matrix.Invert(m).m);this.colliders.set(t,c);}
            for(let x=Math.floor(c.min.x/16);x<=Math.floor(c.max.x/16);x++)for(let y=Math.floor(-c.max.z/16);y<=Math.floor(-c.min.z/16);y++){
            const key = x+','+y, cell = this.colliderCells.get(key) ?? [];
            if (!this.colliderCells.has(key))
                this.colliderCells.set(key, cell);
            cell.push(t);
            }
        }
        const wants = new Set<string>();
        this.nearQueue = [];
        for (const t of list)
            if (Math.hypot(t.e - p.e, t.n - p.n) < 65) {
                wants.add(t.id);
                if (!this.near.has(t.id))
                    this.nearQueue.push(t);
            }
        for (const [id, t] of this.near)
            if (!wants.has(id)) {
                t.meshes.forEach(m => m.dispose());
                this.near.delete(id);
            }
        this.nearQueue.sort((a, b) => Math.hypot(a.e - p.e, a.n - p.n) - Math.hypot(b.e - p.e, b.n - p.n));
        for (const f of new Set(list.map(t => t.family)))
            if (f > 2 && !this.library.families.has(['', '', '', 'conifer', 'willow'][f]))
                void this.library.load(['', '', '', 'conifer', 'willow'][f]).then(() => this.lastCell = '').catch(() => { });
        this.rebuildBatches(p);
    }
    rebuildBatches(p: EN) {
        const groups = new Map<string, TreeRecord[]>();
        for (const t of this.resident) {
            const key = tileKey(t.e, t.n, 256) + '/' + t.family;
            const group = groups.get(key) ?? [];
            if (!groups.has(key))
                groups.set(key, group);
            group.push(t);
        }
        for (const [key, b] of this.batches)
            if (!groups.has(key)) {
                b.meshes.forEach(m => m.dispose());
                this.batches.delete(key);
            }
        for (const key of this.batchQueue.keys())
            if (!groups.has(key))
                this.batchQueue.delete(key);
        for (const [key, records] of groups)
            this.batchQueue.set(key, records);
    }
    updateBatch(key: string, all: TreeRecord[]) {
        const records = all.filter(t => !this.near.has(t.id));
        if (!records.length) {
            const b = this.batches.get(key);
            b?.meshes.forEach(m => m.setEnabled(false));
            return;
        }
        {
            let b = this.batches.get(key);
            const t = records[0], family = this.library.tree(t.family), source = family.variants[0].at(-1)!;
            if (!b || b.buffer.length < records.length * 16 || b.meshes[0].metadata?.family !== family.id) {
                b?.meshes.forEach(m => m.dispose());
                const e = Math.floor(t.e / 256) * 256, n = Math.floor(t.n / 256) * 256, buffer = new Float32Array(Math.max(records.length, 600) * 16);
                const meshes = source.map((s, i) => { const m = new Mesh('forest-batch-' + key + '-' + i, this.scene); s.geometry!.copy('batch-geometry-' + key + '-' + i).applyToMesh(m); m.material = s.material; m.sideOrientation = 1; m.isPickable = false; m.metadata = { family: family.id }; m.position.set(e - this.origin.e, 0, this.origin.n - n); m.freezeWorldMatrix(); m.thinInstanceSetBuffer('matrix', buffer, 16, false); return m; });
                b = { meshes, buffer, records, e, n };
                this.batches.set(key, b);
            }
            b.records = records;
            for (let i = 0; i < records.length; i++) {
                const t = records[i], s = t.scale;
                Matrix.ComposeToRef(new Vector3(t.width, s, t.width), Quaternion.FromEulerAngles(0, t.yaw, 0), new Vector3(t.e - b.e, t.h - (t.family === 0 ? .8 : .25) * s, b.n - t.n), matrix);
                matrix.copyToArray(b.buffer, i * 16);
            }
            for (const m of b.meshes) {
                m.setEnabled(true);
                m.thinInstanceCount = records.length;
                m.thinInstanceBufferUpdated('matrix');
                m.thinInstanceRefreshBoundingInfo();
            }
        }
    }
    create(t: TreeRecord, p: EN) {
        const f = this.library.tree(t.family), level = Math.hypot(t.e - p.e, t.n - p.n) < 30 ? 0 : 1, source = f.variants[t.variant % f.variants.length][level] ?? f.variants[0][0];
        const meshes = source.map((s, i) => { const m = new Mesh(t.id + '-' + i, this.scene); s.geometry!.applyToMesh(m); m.material = s.material; m.sideOrientation = 1; m.isPickable = false; m.receiveShadows = true; m.position.set(t.e - this.origin.e, t.h - (t.family === 0 ? .8 : .25) * t.scale, this.origin.n - t.n); m.scaling.set(t.width, t.scale, t.width); m.rotation.y = t.yaw; m.freezeWorldMatrix(treeMatrix(t,this.origin)); return m; });
        this.near.set(t.id, { t, meshes, level, opacity: 1 });
    }
    update(p: EN, eye: Vector3, h: number, dt: number) {
        const key = tileKey(p.e, p.n, 16) + '/' + this.data.tiles.size + '/' + this.library.families.size;
        if (key !== this.lastCell) {
            this.lastCell = key;
            const s = performance.now();
            this.refresh(p);
            this.lastBuildMs = performance.now() - s;
            this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
        }
        let made = false;
        const start = performance.now();
        while (this.nearQueue.length && performance.now() - start < .6) {
            this.create(this.nearQueue.shift()!, p);
            made = true;
        }
        if (made)
            this.rebuildBatches(p);
        const batchStart = performance.now();
        while (this.batchQueue.size && performance.now() - batchStart < .6) {
            const [id, records] = this.batchQueue.entries().next().value!;
            this.batchQueue.delete(id);
            this.updateBatch(id, records);
        }
        const feet = { x: p.e - this.origin.e, y: h, z: this.origin.n - p.n };
        for (const t of this.near.values()) {
            const distance = Math.hypot(t.t.e - p.e, t.t.n - p.n), level = distance < (t.level === 0 ? 34 : 27) ? 0 : 1;
            if (level !== t.level) {
                const source = this.library.tree(t.t.family).variants[t.t.variant % this.library.tree(t.t.family).variants.length][level];
                if (source)
                    for (let i = 0; i < t.meshes.length; i++) {
                        // Babylon preserves an existing smaller draw range when geometry grows.
                        // Rebuild it so returning to LOD0 draws every trunk and canopy triangle.
                        t.meshes[i].releaseSubMeshes();
                        source[i].geometry!.applyToMesh(t.meshes[i]);
                        t.meshes[i].material = source[i].material;
                    }
                t.level = level;
            }
            for (const m of t.meshes) {
                let blocked = false;
                if (distance < 18) {
                    const b = m.getBoundingInfo().boundingBox;
                    blocked = occludesTraveller(eye, feet, { id: m.id, min: b.minimumWorld, max: b.maximumWorld }, m.visibility < .99, (from, to) => { const start = new Vector3(from.x, from.y, from.z), direction = new Vector3(to.x - from.x, to.y - from.y, to.z - from.z), length = direction.length(); direction.normalize(); const hit = new Ray(start, direction, length).intersectsMesh(m, false); return hit.hit && hit.distance < length - .001; });
                }
                m.visibility = fadeOpacity(m.visibility, blocked ? .16 : 1, dt, blocked ? .12 : .3);
            }
        }
    }
    blocked(e: number, n: number) { const checked=new Set<TreeRecord>(),feet={x:e,y:this.data.height(e,n),z:-n};
        for (let y = Math.floor((n-PLAYER_RADIUS) / 16); y <= Math.floor((n+PLAYER_RADIUS) / 16); y++)
        for (let x = Math.floor((e-PLAYER_RADIUS) / 16); x <= Math.floor((e+PLAYER_RADIUS) / 16); x++)
            for (const t of this.colliderCells.get(x + ',' + y) ?? [])
                if(!checked.has(t)){checked.add(t);if(meshBlocksCylinder(this.colliders.get(t)!,feet,PLAYER_RADIUS,PLAYER_HEIGHT))return true;} return false; }
    shadows(p: EN) { return [...this.near.values()].filter(t => Math.hypot(t.t.e - p.e, t.t.n - p.n) < 45).flatMap(t => t.meshes); }
    rebase(origin: EN) { this.origin = origin; for (const t of this.near.values())
        for (const m of t.meshes) {
            m.unfreezeWorldMatrix();
            m.position.x = t.t.e - origin.e;
            m.position.z = origin.n - t.t.n;
            m.freezeWorldMatrix();
        } for (const b of this.batches.values())
        for (const m of b.meshes) {
            m.unfreezeWorldMatrix();
            m.position.x = b.e - origin.e;
            m.position.z = origin.n - b.n;
            m.freezeWorldMatrix();
        } }
    stats() { return { near: this.near.size, batchQueue: this.batchQueue.size, batches: this.batches.size, trees: this.resident.length, lastBuildMs: this.lastBuildMs, maxBuildMs: this.maxBuildMs }; }
}
const matrix = Matrix.Identity();
function treeMatrix(t:TreeRecord,origin:EN={e:0,n:0}){
 return Matrix.Compose(new Vector3(t.width,t.scale,t.width),Quaternion.FromEulerAngles(0,t.yaw,0),new Vector3(t.e-origin.e,t.h-(t.family===0?.8:.25)*t.scale,origin.n-t.n));
}
