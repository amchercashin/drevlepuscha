/**
 * Which sky the showcase draws. `newsky=1` keeps the previous sky as the default
 * and the new one as an opt-in during review, so a comparison needs no rebuild.
 */
export type SkyMode='legacy'|'showcase'|'new';
export function skyModeFromParams(params:URLSearchParams):SkyMode{
 const requested=params.get('newsky');
 if(requested!==null)return requested==='0'?'showcase':'new';
 return params.get('scene')==='m0'||params.get('scene')==='m1'?'legacy':'showcase';
}
