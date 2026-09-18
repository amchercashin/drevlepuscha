import {readFileSync} from 'node:fs';
import {build} from './build.mjs';
build(true);
if(process.argv.includes('--production')){
 const assets=JSON.parse(readFileSync(new URL('../../public/wildlife/assets.json',import.meta.url),'utf8'));
 if(assets.status!=='accepted'||!assets.species?.length)throw Error('No accepted wildlife assets. Test primitives are not production assets.');
 // The full GLB/clip validator belongs to W3, before accepting the first art asset.
 throw Error('W3 GLB/clip validation not implemented; production acceptance unavailable.');
}
console.log('Wildlife content validated. W1/W2 only; no artistic assets accepted.');
