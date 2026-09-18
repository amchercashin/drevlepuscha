import {validatePackage} from '../domain/wildlife/habitat.ts';
import type {WildlifePackage} from '../domain/wildlife/types.ts';
export const wildlifeDebug=()=>{const q=new URLSearchParams(location.search);return q.get('debug')==='1'&&q.get('wildlife')==='1';};
let cached:Promise<WildlifePackage>|undefined;
export function loadShowcaseWildlife(){
 return cached??=(async()=>{
  const base=`${import.meta.env.BASE_URL}wildlife/content/`,response=await fetch(base+'manifest.json');if(!response.ok)throw Error('Не удалось загрузить манифест фауны');const manifest=await response.json();
  if(manifest.v!==1||manifest.file!=='showcase/bird.json')throw Error('Несовместимый манифест фауны');
  const r=await fetch(base+manifest.file);if(!r.ok)throw Error('Не удалось загрузить тестовый пакет фауны');
  const bytes=await r.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==manifest.sha256)throw Error('Версии леса различаются; обновите страницу');
  const data:unknown=JSON.parse(new TextDecoder().decode(bytes));validatePackage(data);if(data.identity.contentHash!==manifest.contentHash)throw Error('Версии леса различаются; обновите страницу');return data;
 })();
}
