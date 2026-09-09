import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const library=JSON.parse(readFileSync('config/forest-asset-library.json'));
for(const profile of library.profiles)execFileSync(process.execPath,['--experimental-strip-types','tools/prepare-forest-asset.mjs',profile],{stdio:'inherit'});
