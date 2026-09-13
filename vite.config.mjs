import { defineConfig } from 'vite';
import {runtimeTexturesPlugin} from './tools/runtime-textures.mjs';

export default defineConfig({
  base: './',
  plugins: [runtimeTexturesPlugin(),{
    name:'lightweight-entrance',
    generateBundle(_options,bundle){
      const entry=Object.values(bundle).find(c=>c.type==='chunk'&&c.moduleIds.some(id=>id.endsWith('/src/boot.ts')));
      if(!entry)this.error('Showcase boot chunk missing');
      const visited=new Set();
      const visit=chunk=>{
        if(visited.has(chunk.fileName))return;visited.add(chunk.fileName);
        if(chunk.moduleIds.some(id=>/node_modules[\\/]@babylonjs[\\/]/.test(id)))this.error('Engine must not load before the friend handshake');
        for(const id of chunk.imports){const next=bundle[id];if(next?.type==='chunk')visit(next);}
      };
      visit(entry);
    },
  }],
  publicDir: 'public',
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/references/**', '**/qa/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: false, rollupOptions: {
    input: { main: 'index.html', tree: 'tree.html', multiplayer: 'multiplayer.html' },
    // One lazy engine request instead of dozens of interdependent modules.
    // Boot and the friend handshake do not import this chunk.
    output: { codeSplitting: { groups: [
      // The dynamic-import helper is also used by boot. Do not pull it into
      // the engine through Babylon's own dynamic shader/loader dependencies.
      {name:'preload-helper',test:id=>id.includes('vite/preload-helper'),priority:20},
      {name:'babylon',test:/node_modules[\\/]@babylonjs[\\/](core|loaders)[\\/]/},
    ] } },
  } },
});
