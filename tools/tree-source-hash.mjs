import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
/** Hash authored inputs, not platform-dependent floating-point evaluation results. */
export function treeSourceHash(){
 const inputs=['../src/domain/reference-tree.ts','../src/domain/seed.ts'].map(path=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}
