// Trystero 0.25.4 eagerly creates 20 WebRTC offers per browser, even in an
// empty room. Allocate on checkout instead: no speculative ICE/STUN work on
// phones, and offers gather addresses when a participant actually appears.
// Upstream has no pool-size option. Keep this tiny patch pinned and fail loudly
// if the dependency changes; never silently patch an unknown implementation.
import {readFileSync, writeFileSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
const file=new URL('../node_modules/@trystero-p2p/core/dist/offer-pool.mjs',import.meta.url);
const originalHash='901a9194c2c7c39ba7a32bdb68aae4af47e1667dac4c34962bae3804ba8de3e5';
const source=readFileSync(file,'utf8');
const original=source.replace('const poolSize = 0;','const poolSize = 20;');
if(createHash('sha256').update(original).digest('hex')!==originalHash)throw Error('Review the Trystero on-demand offer patch after upgrading core');
const patched=original.replace('const poolSize = 20;','const poolSize = 0;');
if(source!==patched){
 writeFileSync(file,patched);
 // Vite's dependency cache otherwise may retain the original installed file.
 rmSync(new URL('../node_modules/.vite',import.meta.url),{recursive:true,force:true});
}
