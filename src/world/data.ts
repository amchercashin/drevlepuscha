import type { WorldManifest, Grid, EN, TilePayload, Trail, MapData } from './schema.ts';
import { tileKey, triangleHeight } from './math.ts';
import { createWorldGeography } from '../domain/world-geography.mjs';
export class WorldData {
    workers = [new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })];
    requests = new Map<number, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    }>();
    serial = 0;
    manifest!: WorldManifest;
    coarse!: Grid & {
        zones: number[];
        forestMask: number[];
    };
    geography: any;
    geo: any;
    trails!: Trail[];
    tiles = new Map<string, TilePayload>();
    pending = new Map<string, Promise<TilePayload>>();
    active = 0;
    queue: {
        run: () => void;
        reject: (e: Error) => void;
    }[] = [];
    networkBytes = 0;
    cacheHits = 0;
    failures = 0;
    retryAt = new Map<string, number>();
    lastFailureAt = 0;
    cache: Cache | undefined;
    cacheBytes = 0;
    cacheEntries = new Map<string, number>();
    constructor() { for (const worker of this.workers) {
        worker.onmessage = ({ data: m }) => { const p = this.requests.get(m.request); if (p) {
            this.requests.delete(m.request);
            m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
        } };
        worker.onerror = e => { for (const p of this.requests.values())
            p.reject(new Error(e.message)); this.requests.clear(); };
    } }
    async call(type: string, data: any, transfer: Transferable[] = [], workerIndex = type === 'patch' || type === 'groves' ? 1 : 0) { const request = ++this.serial; return new Promise<any>((resolve, reject) => { this.requests.set(request, { resolve, reject }); this.workers[workerIndex].postMessage({ type, request, ...data }, transfer); }); }
    async bytes(file: string, signal?: AbortSignal, bypassCache = false) {
        const url = new URL(import.meta.env.BASE_URL + 'world/' + file, location.origin).href + (this.manifest ? '?v=' + this.manifest.version : '');
        if (bypassCache) {
            await this.cache?.delete(url);
            this.cacheBytes -= this.cacheEntries.get(url) ?? 0;
            this.cacheEntries.delete(url);
        }
        const cached = bypassCache ? undefined : await this.cache?.match(url);
        if (cached) {
            this.cacheHits++;
            const size = this.cacheEntries.get(url);
            if (size !== undefined) {
                this.cacheEntries.delete(url);
                this.cacheEntries.set(url, size);
            }
            return cached.arrayBuffer();
        }
        const r = await fetch(url, { signal, cache: file==='manifest.json.pack'?'no-cache':'default' });
        if (!r.ok)
            throw Error(`Не удалось загрузить участок (${r.status})`);
        const b = await r.arrayBuffer();
        this.networkBytes += b.byteLength;
        // Cache is expendable. A quota error must not turn a playable scene into an error screen.
        if (this.cache && b.byteLength < 2 * 1048576) {
            const c = this.cache;
            void c.put(url, new Response(b.slice(0), { headers: { 'content-length': String(b.byteLength) } })).then(async () => { this.cacheBytes += b.byteLength - (this.cacheEntries.get(url) ?? 0); this.cacheEntries.set(url, b.byteLength); while (this.cacheBytes > 256 * 1048576 && this.cacheEntries.size) {
                const [key, size] = this.cacheEntries.entries().next().value!;
                this.cacheEntries.delete(key);
                this.cacheBytes -= size;
                await c.delete(key);
            } }).catch(() => { });
        }
        return b;
    }
    async json(file: string) { const buffer = await this.bytes(file); return this.call('json', { buffer }, [buffer]); }
    async init() {
        this.manifest = await this.json('manifest.json.pack');
        try {
            const name = 'old-forest-' + this.manifest.version;
            for (const key of await caches.keys())
                if (key.startsWith('old-forest-') && key !== name)
                    await caches.delete(key);
            this.cache = await caches.open(name);
            for (const req of await this.cache.keys()) {
                const r = await this.cache.match(req), size = Number(r?.headers.get('content-length') ?? 0);
                this.cacheEntries.set(req.url, size);
                this.cacheBytes += size;
            }
        }
        catch { }
        const [coarse, g, trails] = await Promise.all([this.json(this.manifest.coarse), this.json(this.manifest.geography), this.json(this.manifest.trails)]);
        this.coarse = { ...coarse, values: new Float32Array(coarse.values) };
        this.geography = g;
        this.geo = createWorldGeography(g);
        this.trails = trails;
        await Promise.all(this.workers.map((_, i) => this.call('init', { geography: g, trails, coarse: this.coarse }, [], i)));
        return this;
    }
    load(id: string, signal?: AbortSignal): Promise<TilePayload> {
        if (this.tiles.has(id))
            return Promise.resolve(this.tiles.get(id)!);
        const old = this.pending.get(id);
        if (old)
            return old;
        if ((this.retryAt.get(id) ?? 0) > performance.now())
            return Promise.reject(Error('Повторная попытка отложена'));
        const spec = this.manifest.tiles[id];
        if (!spec)
            return Promise.reject(Error('За границей карты'));
        const result = new Promise<TilePayload>((resolve, reject) => { const run = async () => { this.active++; try {
            let buffer = await this.bytes(spec.file, signal);
            const valid = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('') === spec.sha256;
            if (!await valid(buffer)) {
                buffer = await this.bytes(spec.file, signal, true);
                if (!await valid(buffer))
                    throw Error('Повреждены данные участка');
            }
            const tile = await this.call('tile', { id, buffer, stepM: spec.stepM }, [buffer]) as TilePayload;
            if (signal?.aborted)
                throw new DOMException('Cancelled', 'AbortError');
            this.tiles.set(id, tile);
            this.retryAt.delete(id);
            resolve(tile);
        }
        catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) {
                this.failures++;
                this.lastFailureAt = performance.now();
                this.retryAt.set(id, performance.now() + 4000);
            }
            reject(e);
        }
        finally {
            this.active--;
            this.pending.delete(id);
            this.pump();
        } }; this.queue.push({ run, reject }); this.pump(); });
        this.pending.set(id, result);
        return result;
    }
    pump() { while (this.active < 4 && this.queue.length)
        this.queue.shift()!.run(); }
    height(e: number, n: number) { return triangleHeight(this.tiles.get(tileKey(e, n))?.grid ?? this.coarse, e, n); }
    ready(e: number, n: number) { return this.tiles.has(tileKey(e, n)); }
    waterDepth(e: number, n: number) { const h = this.height(e, n); let depth = 0; for (const p of this.geo.nearbyWater(e, n))
        if (p.distance < p.feature.water.widthM / 2 + 3)
            depth = Math.max(depth, p.h - h); return depth; }
    evict(p: EN, keep: EN | undefined) { for (const [id, t] of this.tiles) {
        const e = t.grid.origin[0] + 256, n = t.grid.origin[1] + 256;
        if (Math.hypot(e - p.e, n - p.n) > 1150 && (!keep || Math.hypot(e - keep.e, n - keep.n) > 1150))
            this.tiles.delete(id);
    } }
    async map(): Promise<MapData> { return this.json(this.manifest.map); }
    stats() { let bytes = 0, trees = 0; for (const t of this.tiles.values()) {
        bytes += t.grid.values.byteLength + t.trees.length * 128;
        trees += t.trees.length;
    } return { tiles: this.tiles.size, treeRecords: trees, decodedBytes: bytes, queued: this.queue.length, pending: this.pending.size, networkBytes: this.networkBytes, cacheHits: this.cacheHits, failures: this.failures }; }
    dispose() { this.workers.forEach(w => w.terminate()); for (const p of this.requests.values())
        p.reject(new Error('World disposed')); this.requests.clear(); this.tiles.clear(); }
}
