import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePackage} from '../src/domain/wildlife/habitat.ts';
/** Server loads only this small JSON pack, never Babylon, GLBs or compiler geometry. */
export function loadWildlifeContent(){
 try{
  const root=new URL('../public/wildlife/content/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  if(manifest.v!==1||manifest.file!=='showcase/bird.json')throw Error('manifest');
  const bytes=readFileSync(new URL(manifest.file,root));if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('checksum');
  const data=JSON.parse(bytes);validatePackage(data);if(data.identity.contentHash!==manifest.contentHash)throw Error('content hash');return data;
 }catch{throw Error('Пакет фауны отсутствует или устарел: выполните npm run wildlife:build.');}
}
