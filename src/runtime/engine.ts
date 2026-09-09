import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';

export type RendererKind='webgpu'|'webgl2';
export interface RuntimeRenderer {
  engine:AbstractEngine;canvas:HTMLCanvasElement;kind:RendererKind;
  info:{vendor:string;renderer:string;version:string};fallbackReason:string|null;
}

/** WebGPU first. Only automatic selection may fall back; explicit QA requests must fail visibly. */
export async function createRenderer(canvas:HTMLCanvasElement,performanceCapture=false):Promise<RuntimeRenderer> {
  const requested=new URLSearchParams(location.search).get('renderer')||'auto';
  let fallbackReason:string|null=null;
  if(requested!=='webgl2'){
    let candidate:AbstractEngine|undefined;
    try {
      const {WebGPUEngine}=await import('@babylonjs/core/Engines/webgpuEngine.js');
      if(!await WebGPUEngine.IsSupportedAsync)throw new Error('WebGPU недоступен в этом браузере или на этом устройстве.');
      const gpu=new WebGPUEngine(canvas,{antialias:true,enableAllFeatures:false,setMaximumLimits:false,deviceDescriptor:performanceCapture?{requiredFeatures:['timestamp-query']}:undefined});candidate=gpu;
      await gpu.initAsync();
      // StandardMaterial uses native WGSL; no external GLSL/WASM compiler download.
      return {engine:gpu,canvas,kind:'webgpu',info:gpu.getInfo(),fallbackReason:null};
    }catch(error){
      candidate?.dispose();
      if(requested==='webgpu')throw error;
      fallbackReason=String(error);
      // A canvas that acquired a WebGPU context cannot later acquire WebGL.
      const replacement=canvas.cloneNode(true) as HTMLCanvasElement;canvas.replaceWith(replacement);canvas=replacement;
    }
  }
  const {Engine}=await import('@babylonjs/core/Engines/engine.js');
  if(performanceCapture){await import('@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js');await import('@babylonjs/core/Engines/Extensions/engine.query.js');}
  const gl=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:true,doNotHandleContextLost:false},false);
  if(gl.webGLVersion<2){gl.dispose();throw new Error('Нужен WebGPU или WebGL2. Проверьте аппаратное ускорение браузера.');}
  return {engine:gl,canvas,kind:'webgl2',info:gl.getGlInfo(),fallbackReason};
}
