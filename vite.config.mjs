import { defineConfig } from 'vite';
import {runtimeTexturesPlugin} from './tools/runtime-textures.mjs';

export default defineConfig({
  base: './',
  plugins: [runtimeTexturesPlugin()],
  publicDir: 'public',
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/references/**', '**/qa/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: false, rollupOptions: {
    input: { main: 'index.html', tree: 'tree.html', multiplayer: 'multiplayer.html' },
    // Shader snippets otherwise add many tiny requests before the
    // first frame. Keep the two languages separate and the renderer lazy.
    output: { codeSplitting: { groups: [
      {name:'shaders-wgsl',test:/node_modules[\\/]@babylonjs[\\/]core[\\/]ShadersWGSL[\\/]/},
      {name:'shaders-glsl',test:/node_modules[\\/]@babylonjs[\\/]core[\\/]Shaders[\\/]/},
    ] } },
  } },
});
