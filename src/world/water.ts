import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { WorldData } from './data.ts';
import type { EN } from './schema.ts';
export function createWater(scene: Scene, data: WorldData) {
    const meshes: Mesh[] = [], mat = new StandardMaterial('flowing-water', scene);
    mat.diffuseColor = new Color3(.30, .43, .40);
    mat.specularColor = new Color3(.38, .43, .36);
    mat.specularPower = 80;
    mat.alpha = .88;
    mat.backFaceCulling = false;
    const pixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
            const k = (y * 64 + x) * 4, v = 165 + 45 * Math.sin(y * .55 + Math.sin(x * .19) * 2);
            pixels.set([v * .87, v, v * .98, 255], k);
        }
    const texture = RawTexture.CreateRGBATexture(pixels, 64, 64, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    mat.diffuseTexture = texture;
    for (const f of data.geography.features.filter((f: any) => f.water)) {
        const stations = f.water.stations;
        for (let index = 1; index < stations.length; index++) {
            const a = stations[index - 1], b = stations[index], dx = b[0] - a[0], dn = b[1] - a[1], length = Math.hypot(dx, dn), steps = Math.max(1, Math.ceil(length / 16)), positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
            const cascade = f.id === 'withywindle' && a[0] === 21150 && b[0] === 21110;
            const sections = cascade ? [[0, 0], [1 / 3, 0], [1 / 3, 1 / 3], [2 / 3, 1 / 3], [2 / 3, 2 / 3], [1, 2 / 3], [1, 1]] : Array.from({ length: steps + 1 }, (_, j) => [j / steps, j / steps]);
            for (let j = 0; j < sections.length; j++) {
                const [t, ht] = sections[j], e = a[0] + dx * t, n = a[1] + dn * t, h = a[2] + (b[2] - a[2]) * ht + .035;
                let width = f.water.widthM;
                for (const pool of f.water.pools ?? []) {
                    const r = Math.max(0, 1 - Math.hypot(e - pool.center[0], n - pool.center[1]) / pool.radiusM);
                    width += (pool.widthM - f.water.widthM) * r;
                }
                for (const sign of [-1, 1]) {
                    positions.push(e - a[0] - dn / length * width / 2 * sign, h, a[1] - n - dx / length * width / 2 * sign);
                    normals.push(0, 1, 0);
                    uvs.push(sign > 0 ? 1 : 0, t * length / 6 + (cascade ? ht : 0));
                }
                if (j < sections.length - 1) {
                    const k = j * 2;
                    indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
                }
            }
            if (cascade)
                VertexData.ComputeNormals(positions, indices, normals, { useRightHandedSystem: true });
            const mesh = new Mesh(f.id + '-' + index, scene), v = new VertexData();
            Object.assign(v, { positions, normals, uvs, indices });
            v.applyToMesh(mesh);
            mesh.material = mat;
            mesh.metadata = { e: a[0], n: a[1] };
            mesh.position.set(a[0], 0, -a[1]);
            mesh.isPickable = false;
            mesh.freezeWorldMatrix();
            meshes.push(mesh);
            if (cascade) {
                const foamMat = new StandardMaterial('fall-foam', scene);
                foamMat.diffuseColor = new Color3(.8, .84, .73);
                foamMat.emissiveColor = new Color3(.12, .15, .12);
                foamMat.diffuseTexture = texture;
                foamMat.specularColor = Color3.Black();
                foamMat.alpha = .8;
                foamMat.backFaceCulling = false;
                for (let j = 1; j <= 3; j++) {
                    const t = j / 3, e = a[0] + dx * t, n = a[1] + dn * t, h = a[2] + (b[2] - a[2]) * t + .07;
                    const foam = new Mesh('fall-foam-' + j, scene), vd = new VertexData(), pp: number[] = [];
                    for (const [along, side] of [[0, -1], [0, 1], [1.4, -1], [1.4, 1]])
                        pp.push(-dn / length * f.water.widthM * .45 * side + dx / length * along, h, -dx / length * f.water.widthM * .45 * side - dn / length * along);
                    Object.assign(vd, { positions: pp, normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1, 1, 1], indices: [0, 2, 1, 1, 2, 3] });
                    vd.applyToMesh(foam);
                    foam.material = foamMat;
                    foam.metadata = { e, n };
                    foam.position.set(e, 0, -n);
                    foam.isPickable = false;
                    foam.freezeWorldMatrix();
                    meshes.push(foam);
                }
            }
        }
    }
    return { meshes, update: (dt: number) => { texture.vOffset = (texture.vOffset + dt * .018) % 1; }, rebase: (origin: EN) => { for (const m of meshes) {
            m.unfreezeWorldMatrix();
            m.position.set(m.metadata.e - origin.e, 0, origin.n - m.metadata.n);
            m.freezeWorldMatrix();
        } } };
}
