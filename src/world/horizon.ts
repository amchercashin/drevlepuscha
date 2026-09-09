import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { EN } from './schema.ts';
import { tileKey } from './math.ts';
/** Worker-built volumetric grove ring. No per-tree work on the render thread. */
export class Horizon {
    mesh: Mesh;
    origin: EN = { e: 0, n: 0 };
    last = '';
    buffer = new Float32Array(18000 * 16);
    count = 0;
    generation = 0;
    constructor(scene: Scene, public data: WorldData) { this.mesh = CreateSphere('grove-volumes', { segments: 2, diameter: 1 }, scene); const m = new StandardMaterial('grove-leaves', scene); m.diffuseColor = new Color3(.27, .36, .26); m.specularColor = Color3.Black(); this.mesh.material = m; this.mesh.thinInstanceSetBuffer('matrix', this.buffer, 16, false); this.mesh.isPickable = false; this.mesh.setEnabled(false); }
    update(p: EN) {
        const key = tileKey(p.e, p.n, 128);
        if (key === this.last)
            return;
        this.last = key;
        const generation = ++this.generation, point = { ...p };
        void this.data.call('groves', { p: point, origin: this.origin }).then(result => { if (generation !== this.generation)
            return; this.buffer.set(result.matrices); this.count = result.count; this.mesh.thinInstanceCount = this.count; this.mesh.thinInstanceBufferUpdated('matrix'); this.mesh.setBoundingInfo(new BoundingInfo(new Vector3(point.e - this.origin.e - 1700, -100, this.origin.n - point.n - 1700), new Vector3(point.e - this.origin.e + 1700, 500, this.origin.n - point.n + 1700))); this.mesh.setEnabled(this.count > 0); }).catch(() => { });
    }
    rebase(origin: EN) { this.origin = origin; this.last = ''; }
}
