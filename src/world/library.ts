import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import { LodDither } from '../runtime/lod-dither.ts';
import { LeafTransmission } from '../runtime/leaf-transmission.ts';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
export interface Family {
    id: string;
    variants: Mesh[][][];
    bounds: any[];
    texture: Texture;
    bytes: number;
}
export class Library {
    index: Record<string, {
        data: string;
        texture: string;
        bytes: number;
    }> = {};
    families = new Map<string, Family>();
    pending = new Map<string, Promise<Family>>();
    constructor(public scene: Scene, public data: WorldData, public sun: DirectionalLight) { }
    async init() { const r = await fetch(import.meta.env.BASE_URL + 'world/library.json', {cache:'no-cache'}); if (!r.ok)
        throw Error('Библиотека недоступна'); this.index = await r.json(); await Promise.all(['oak', 'fork', 'young'].map(id => this.load(id))); return this; }
    load(id: string): Promise<Family> {
        const existing = this.families.get(id);
        if (existing)
            return Promise.resolve(existing);
        const running = this.pending.get(id);
        if (running)
            return running;
        const spec = this.index[id];
        if (!spec)
            return this.load(id === 'conifer' ? 'young' : 'fork');
        const task = (async () => {
            const data = await this.data.json(spec.data);
            let texture!: Texture;
            const textureReady = new Promise<void>((resolve, reject) => { texture = new Texture(import.meta.env.BASE_URL + 'world/' + spec.texture, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE, resolve, () => reject(Error('Texture ' + id))); });
            texture.anisotropicFilteringLevel = 4;
            const m = new StandardMaterial('world-' + id, this.scene);
            m.diffuseTexture = texture;
            m.specularColor = Color3.Black();
            m.backFaceCulling = !data.doubleSided?.['material-0'];
            new LodDither(m);
            new LeafTransmission(m, this.sun);
            const baked = new StandardMaterial('world-' + id + '-baked', this.scene);
            baked.specularColor = Color3.Black();
            baked.backFaceCulling = m.backFaceCulling;
            new LodDither(baked);
            const entries = data.variants ?? [data];
            const variants = entries.map((variant: any, vi: number) => variant.levels.map((parts: any[], li: number) => parts.map((part: any, pi: number) => { const mesh = new Mesh(`${id}-${vi}-${li}-${pi}`, this.scene), v = new VertexData(); Object.assign(v, part); v.applyToMesh(mesh); mesh.sideOrientation = 1; mesh.material = li >= (variant.bakedColorFromLevel ?? Infinity) ? baked : m; mesh.setEnabled(false); mesh.isPickable = false; mesh.receiveShadows = true; return mesh; })));
            await textureReady;
            // Compile shared regular and instanced programs before the family can replace its fallback.
            for (const parts of variants[0])
                for (const mesh of parts) {
                    await mesh.material!.forceCompilationAsync(mesh);
                    await mesh.material!.forceCompilationAsync(mesh, { useInstances: true });
                }
            const family = { id, variants, bounds: entries.map((x: any) => x.bounds), texture, bytes: spec.bytes };
            this.families.set(id, family);
            return family;
        })();
        this.pending.set(id, task);
        void task.finally(() => this.pending.delete(id)).catch(() => { });
        return task;
    }
    tree(family: number) { return this.families.get(['oak', 'fork', 'young', 'conifer', 'willow'][family]) ?? this.families.get(family === 3 ? 'young' : 'fork')!; }
    stats() { return { families: [...this.families.keys()], textures: this.families.size, textureBytes: this.families.size * 2048 * 2048 * 4 * 4 / 3 }; }
}
