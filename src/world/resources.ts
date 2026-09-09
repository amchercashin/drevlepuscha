import type { Scene } from '@babylonjs/core/scene.js';
/** Allocation estimate, not a browser/driver memory meter. Shared buffers count once. */
export function resourceEstimate(scene: Scene, instanceBytes: number, decodedBytes: number) {
    const buffers = new Set<unknown>(), textures = new Set<unknown>();
    let geometry = 0, textureBytes = 0;
    for (const g of scene.getGeometries()) {
        for (const vb of Object.values(g.getVertexBuffers() ?? {})) {
            const buffer = vb.getBuffer();
            if (!buffer || buffers.has(buffer))
                continue;
            buffers.add(buffer);
            const data = vb.getData();
            if (data)
                geometry += Array.isArray(data) ? data.length * 4 : data.byteLength;
        }
        const indices = g.getIndices();
        if (indices)
            geometry += ArrayBuffer.isView(indices) ? indices.byteLength : indices.length * 4;
    }
    for (const texture of scene.textures) {
        const internal = texture.getInternalTexture();
        if (!internal || textures.has(internal))
            continue;
        textures.add(internal);
        textureBytes += internal.width * internal.height * 4 * (internal.type === 1 ? 4 : 1) * (internal.generateMipMaps ? 4 / 3 : 1) * Math.max(1, internal.samples);
    }
    const engine = scene.getEngine(), framebuffers = engine.getRenderWidth() * engine.getRenderHeight() * 40; // RGBA8 + depth, 4x MSAA and two presentable colour buffers.
    const knownCPU = geometry + instanceBytes + decodedBytes * 3; // includes two worker copies as conservative allowance
    const gpu = geometry + instanceBytes + textureBytes + framebuffers;
    // Browser/driver overhead and JS object headers are excluded. Reserve stays separate.
    return { geometryBytes: geometry, textureBytes, instanceBytes, framebufferEstimateBytes: framebuffers, knownCPUBytes: knownCPU, gpuEstimateBytes: gpu, knownTotalBytes: knownCPU + gpu, reserveBytes: 256 * 1048576, budgetBytes: 1024 * 1048576 };
}
