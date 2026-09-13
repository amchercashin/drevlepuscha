/** Muted forest dyes: moss, pine, slate, ochre, heather and clay. */
export const CLOAK_COLORS = ['#61715a', '#46685e', '#5a697a', '#88764f', '#776174', '#8a6254'] as const;

/** The existing random room ID shuffles six distinct dyes identically on every client. */
export function roomCloakColors(roomId:string):string[]{
 let seed=2166136261;
 for(const char of roomId)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
 const colors:string[]=[...CLOAK_COLORS];
 for(let i=colors.length-1;i>0;i--){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const j=seed%(i+1);[colors[i],colors[j]]=[colors[j],colors[i]];
 }
 return colors;
}
