import { resourceEstimate } from './resources.ts';
import { Hedge } from './hedge.ts';
import { Props } from './props.ts';
import type { Scene } from '@babylonjs/core/scene.js';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { EN } from './schema.ts';
import { WorldData } from './data.ts';
import { Library } from './library.ts';
import { Terrain } from './terrain.ts';
import { Trees } from './trees.ts';
import { Horizon } from './horizon.ts';
import { Dressing } from './dressing.ts';
import { Floor } from './floor.ts';
import { createWater } from './water.ts';
import { tileKey, originFor } from './math.ts';
export class WorldStreamer {
    origin: EN = { e: 0, n: 0 };
    hedge: Hedge;
    props: Props;
    terrain: Terrain;
    trees: Trees;
    horizon: Horizon;
    dressing: Dressing;
    floor: Floor;
    water: ReturnType<typeof createWater>;
    destination: EN | undefined;
    last = '';
    travelGeneration = 0;
    lastRetry = 0;
    prepareMs: number[] = [];
    rebases = 0;
    constructor(public scene: Scene, public data: WorldData, public library: Library) { this.terrain = new Terrain(scene, data); this.terrain.createFar(); this.trees = new Trees(scene, data, library); this.horizon = new Horizon(scene, data); this.dressing = new Dressing(scene, data, library); this.floor = new Floor(scene, data, this.terrain, (e, n) => this.blocked(e, n)); this.water = createWater(scene, data); this.props = new Props(scene, data, library, this.terrain); this.hedge = new Hedge(scene, data); }
    static async create(scene: Scene, sun: DirectionalLight) { const data = await new WorldData().init(), library = await new Library(scene, data, sun).init(); return new WorldStreamer(scene, data, library); }
    requestAround(p: EN) {
        const list: EN[] = [];
        for (let y = -3; y <= 3; y++)
            for (let x = -3; x <= 3; x++)
                list.push({ e: Math.floor(p.e / 128) * 128 + x * 128, n: Math.floor(p.n / 128) * 128 + y * 128 });
        list.sort((a, b) => Math.hypot(a.e + 64 - p.e, a.n + 64 - p.n) - Math.hypot(b.e + 64 - p.e, b.n + 64 - p.n));
        for (const point of list)
            if (this.data.manifest.tiles[tileKey(point.e, point.n)])
                this.terrain.request(point.e, point.n);
        const tiles: EN[] = [];
        for (let y = -1; y <= 1; y++)
            for (let x = -1; x <= 1; x++)
                tiles.push({ e: Math.floor(p.e / 512) * 512 + x * 512, n: Math.floor(p.n / 512) * 512 + y * 512 });
        tiles.sort((a, b) => Math.hypot(a.e + 256 - p.e, a.n + 256 - p.n) - Math.hypot(b.e + 256 - p.e, b.n + 256 - p.n));
        for (const t of tiles)
            if (this.data.manifest.tiles[tileKey(t.e, t.n)])
                void this.data.load(tileKey(t.e, t.n)).catch(() => { });
    }
    update(p: EN, eye: {
        e: number;
        n: number;
        h: number;
    }, h: number, dt: number) {
        if (Math.hypot(p.e - this.origin.e, p.n - this.origin.n) > 1024) {
            this.origin = originFor(p);
            this.rebases++;
            this.terrain.rebase(this.origin);
            this.trees.rebase(this.origin);
            this.horizon.rebase(this.origin);
            this.dressing.rebase(this.origin);
            this.floor.rebase(this.origin);
            this.water.rebase(this.origin);
            this.props.rebase(this.origin);
            this.hedge.rebase(this.origin);
        }
        if (this.data.retryAt.size && performance.now() - this.lastRetry > 4500) {
            this.lastRetry = performance.now();
            this.requestAround(p);
        }
        const key = tileKey(p.e, p.n, 128);
        if (key !== this.last) {
            this.last = key;
            this.requestAround(p);
            this.data.evict(p, this.destination);
        }
        this.terrain.keep = this.destination;
        this.terrain.update(p, eye, h + .85);
        this.trees.update(p, new Vector3(eye.e - this.origin.e, eye.h, this.origin.n - eye.n), h, dt);
        this.horizon.update(p);
        this.floor.update(p);
        this.dressing.update(p, { x: eye.e - this.origin.e, y: eye.h, z: this.origin.n - eye.n }, h, dt);
        this.water.update(dt);
        this.props.update(p);
        this.hedge.update(p);
    }
    blocked(e: number, n: number) { return this.hedge.blocked(e, n) || this.trees.blocked(e, n) || this.props.blocked(e, n) || this.dressing.blocked(e, n, this.data.height(e, n)); }
    ready(e: number, n: number) { return this.data.ready(e, n) && this.terrain.ready({ e, n }); }
    async prepareDestination(point: EN, signal: AbortSignal, progress: (text: string) => void) {
        const b = this.data.manifest.bounds;
        if (![point.e, point.n].every(Number.isFinite) || point.e < b.minE + 1 || point.e > b.maxE - 1 || point.n < b.minN + 1 || point.n > b.maxN - 1)
            throw Error('За границей карты');
        const started = performance.now(), generation = ++this.travelGeneration;
        this.destination = point;
        this.terrain.keep = point;
        const check = () => { if (signal.aborted || generation !== this.travelGeneration)
            throw new DOMException('Переход отменён', 'AbortError'); };
        try {
            progress('Подгружается местность…');
            const ids = new Set<string>();
            for (let y = -1; y <= 1; y++)
                for (let x = -1; x <= 1; x++) {
                    const id = tileKey(point.e + x * 128, point.n + y * 128);
                    if (this.data.manifest.tiles[id])
                        ids.add(id);
                }
            await Promise.all([...ids].map(id => this.data.load(id, signal)));
            check();
            await Promise.all(this.data.geography.features.filter((f: any) => f.geometry.type === 'Point' && Math.hypot(f.geometry.coordinates[0] - point.e, f.geometry.coordinates[1] - point.n) < 400).map((f: any) => this.dressing.ensure(f)));
            check();
            const safe = this.safeAnchor(point);
            this.destination = safe;
            this.terrain.keep = safe;
            progress('Готовятся деревья и поверхность…');
            const types = new Set<number>();
            for (const id of ids)
                for (const t of this.data.tiles.get(id)!.trees)
                    if (Math.hypot(t.e - safe.e, t.n - safe.n) < 430)
                        types.add(t.family);
            await Promise.all([...types].map(f => this.library.load(['oak', 'fork', 'young', 'conifer', 'willow'][f])));
            check();
            for (let y = -1; y <= 1; y++)
                for (let x = -1; x <= 1; x++)
                    this.terrain.request(safe.e + x * 128, safe.n + y * 128);
            while (![-1, 0, 1].every(y => [-1, 0, 1].every(x => this.terrain.ready({ e: safe.e + x * 128, n: safe.n + y * 128 })))) {
                check();
                if (performance.now() - started > 45000)
                    throw Error('Подготовка заняла слишком долго. Повторите переход.');
                await new Promise(r => setTimeout(r, 30));
            }
            check();
            this.prepareMs.push(performance.now() - started);
            return safe;
        }
        finally {
            if (generation === this.travelGeneration) {
                this.destination = undefined;
                this.terrain.keep = undefined;
                this.last = '';
                this.dressing.last = '';
            }
        }
    }
    safeAnchor(point: EN) {
        const candidates = [point];
        for (let radius = 2; radius <= 100; radius += 2)
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6;
                candidates.push({ e: point.e + Math.cos(a) * radius, n: point.n + Math.sin(a) * radius });
            }
        for (const p of candidates) {
            if (!this.data.ready(p.e, p.n) || this.data.waterDepth(p.e, p.n) > .05)
                continue;
            const h = this.data.height(p.e, p.n);
            if (Math.max(Math.abs(this.data.height(p.e + .5, p.n) - h), Math.abs(this.data.height(p.e - .5, p.n) - h), Math.abs(this.data.height(p.e, p.n + .5) - h), Math.abs(this.data.height(p.e, p.n - .5) - h)) > .32)
                continue;
            const settlement = this.data.geography.features.find((f: any) => f.id === 'haysend').geometry.coordinates;
            if (Math.abs(p.e - settlement[0]) < 8 && Math.abs(p.n - settlement[1]) < 8)
                continue;
            const tile = this.data.tiles.get(tileKey(p.e, p.n))!;
            if (tile.trees.some(t => Math.hypot(t.e - p.e, t.n - p.n) < t.radius + .6))
                continue;
            const willow = this.data.geography.features.find((f: any) => f.id === 'old_man_willow').geometry.coordinates;
            if (Math.hypot(p.e - willow[0], p.n - willow[1]) < 6)
                continue;
            const house = this.data.geography.features.find((f: any) => f.id === 'tom_house').geometry.coordinates;
            if (Math.abs(p.e - house[0]) < 6 && Math.abs(p.n - house[1]) < 7)
                continue;
            return p;
        }
        throw Error('Не найден безопасный подход к месту');
    }
    stats() { const data = this.data.stats(), instances = this.horizon.buffer.byteLength + this.hedge.buffer.byteLength + [...this.trees.batches.values()].reduce((n, b) => n + b.buffer.byteLength, 0); return { ...data, resources: resourceEstimate(this.scene, instances, data.decodedBytes), terrain: this.terrain.stats(), forest: this.trees.stats(), library: this.library.stats(), groves: this.horizon.count, floorCells: this.floor.cells.size, props: this.props.cells.size, dressing: this.dressing.groups.size, origin: { ...this.origin }, rebases: this.rebases, prepareMs: this.prepareMs.slice(-20) }; }
}
