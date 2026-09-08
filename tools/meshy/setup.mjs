/** Register the pinned local Meshy server in Codex. Re-run after moving the checkout. */
import {copyFile,mkdir,chmod,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=fileURLToPath(new URL('serve.mjs',import.meta.url));
const config=join(process.env.CODEX_HOME||join(homedir(),'.codex'),'config.toml');
const backupDir=join(root,'references/private/meshy-setup');
await mkdir(backupDir,{recursive:true});
if(await readFile(config).catch(()=>null)){
 const backup=join(backupDir,'codex-config-'+Date.now()+'.toml');await copyFile(config,backup);await chmod(backup,0o600);
}
execFileSync('codex',['mcp','add','meshy','--',process.execPath,server],{cwd:root,stdio:'inherit'});
console.log('Meshy uses the local .env.meshy.local; no key is stored in Codex config.');
