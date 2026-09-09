import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { EN } from './schema.ts';
import { tileKey } from './math.ts';
import { hash01 } from '../domain/geography.mjs';
/** Small authored boundary, one local instanced draw; the tunnel remains open. */
export class Hedge {
    points: (EN & {
        yaw: number;
    })[] = [];
    near: EN[] = [];
    last = '';
    origin: EN = { e: 0, n: 0 };
    mesh;
    buffer = new Float32Array(512 * 16);
    constructor(scene: Scene, public data: WorldData) {
        this.mesh = CreateSphere('high-hay', { diameter: 1, segments: 3 }, scene);
        const mat = new StandardMaterial('high-hay-leaves', scene);
        mat.diffuseColor = new Color3(.28, .36, .22);
        mat.specularColor = Color3.Black();
        this.mesh.material = mat;
        this.mesh.isPickable = false;
        this.mesh.thinInstanceSetBuffer('matrix', this.buffer, 16, false);
        this.mesh.setEnabled(false);
        const line = data.geography.features.find((f: any) => f.id === 'west_high_hay').geometry.coordinates;
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1], b = line[i], de = b[0] - a[0], dn = b[1] - a[1], steps = Math.ceil(Math.hypot(de, dn) / 7);
            for (let j = 0; j < steps; j++) {
                const e = a[0] + de * j / steps, n = a[1] + dn * j / steps;
                if (Math.hypot(e - 512, n - 25420) < 42)
                    continue;
                this.points.push({ e, n, yaw: Math.atan2(-de, dn) });
            }
        }
    }
    update(p: EN) {
        const key = tileKey(p.e, p.n, 64);
        if (key === this.last)
            return;
        this.last = key;
        const matrix = Matrix.Identity();
        let count = 0;
        this.near = [];
        for (const q of this.points) {
            const d = Math.hypot(q.e - p.e, q.n - p.n);
            if (d > 650)
                continue;
            if (d < 80)
                this.near.push(q);
            const height = 5 + hash01(q.e, q.n, 911) * 1.8;
            Matrix.ComposeToRef(new Vector3(7, height, 10), Quaternion.FromEulerAngles(0, q.yaw, 0), new Vector3(q.e - this.origin.e, this.data.height(q.e, q.n) + height * .4, this.origin.n - q.n), matrix);
            matrix.copyToArray(this.buffer, count++ * 16);
        }
        this.mesh.thinInstanceCount = count;
        this.mesh.setEnabled(count > 0);
        if (count) {
            this.mesh.thinInstanceBufferUpdated('matrix');
            this.mesh.thinInstanceRefreshBoundingInfo();
        }
    }
    blocked(e: number, n: number) { return this.near.some(p => (p.e - e) ** 2 + (p.n - n) ** 2 < 3.6 ** 2); }
    rebase(origin: EN) { this.origin = origin; this.last = ''; }
}
