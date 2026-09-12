import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';

export interface RuntimeRenderer {
  engine: WebGPUEngine;
  canvas: HTMLCanvasElement;
  kind: 'webgpu';
  info: { vendor: string; renderer: string; version: string };
}

/** One renderer for every scene. Old renderer query parameters have no effect. */
export async function createRenderer(canvas: HTMLCanvasElement, performanceCapture = false): Promise<RuntimeRenderer> {
  if (!await WebGPUEngine.IsSupportedAsync) {
    throw new Error('Для прогулки нужен WebGPU. Обновите браузер и проверьте аппаратное ускорение.');
  }
  // GPU timing is optional; its absence must not prevent the walk from starting.
  const gpu = Reflect.get(navigator, 'gpu') as { requestAdapter(): Promise<{ features: ReadonlySet<string> } | null> };
  const adapter = performanceCapture ? await gpu.requestAdapter() : null;
  const timing = adapter?.features.has('timestamp-query') ?? false;
  const engine = new WebGPUEngine(canvas, {
    antialias: true, enableAllFeatures: false, setMaximumLimits: false,
    deviceDescriptor: timing ? { requiredFeatures: ['timestamp-query'] } : undefined,
  });
  try {
    await engine.initAsync();
    return { engine, canvas, kind: 'webgpu', info: engine.getInfo() };
  } catch (error) {
    // Babylon may throw while disposing an engine whose device never initialized.
    try { engine.dispose(); } catch { /* Preserve the initialization error. */ }
    throw new Error('Не удалось запустить WebGPU. Обновите браузер и проверьте аппаратное ускорение.', { cause: error });
  }
}
