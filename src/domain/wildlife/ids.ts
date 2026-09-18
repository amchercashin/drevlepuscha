export const cellId=(e:number,n:number)=>`${Math.floor(e/64)}:${Math.floor(n/64)}`;
export const entityId=(realm:string,cell:string,site:string,slot:number)=>[realm,cell,site,String(slot)].map(encodeURIComponent).join('/');
/** Per-entity choice only, never a replacement for the full composite ID. */
export function choice(seed:string,id:string,decision:number,count:number){
 let h=2166136261;for(const c of `${seed}|${id}|${decision}`)h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h>>>0)%count;
}
