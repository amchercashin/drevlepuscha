import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
const sha=text=>createHash('sha256').update(text).digest('hex');
export function contactEvidence(config){
 const art=JSON.parse(readFileSync(new URL('../../public/wildlife/assets.json',import.meta.url))).species.find(s=>s.id===config.species);
 return {lodHashes:art.lods.map(l=>l.sha256),footOffsetM:art.footOffsetM,rigGuideSha256:sha(readFileSync(new URL('../../config/wildlife/squirrel-rig-guide.json',import.meta.url),'utf8').replaceAll('\r\n','\n')),routeSourceSha256:sha(JSON.stringify({tree:config.tree,ground:config.ground,mount:config.mount,climb:config.climb}))};
}
