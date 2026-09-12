/** Stable, non-periodic bank widths; left and right have independent erosion patterns. */
export function trailHash(cell:number,seed:number){
 let h=(cell^seed)>>>0;h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
 return ((h^(h>>>16))>>>0)/4294967295;
}
export function trailNoise(n:number,seed:number){const i=Math.floor(n),t=n-i,s=t*t*(3-2*t);return (trailHash(i,seed)*(1-s)+trailHash(i+1,seed)*s)*2-1;}
export function trailWidth(n:number,right:boolean){const seed=right?83:17;return 1.55+.48*trailNoise(n*.16,seed)+.23*trailNoise(n*.63,seed+11)+.09*trailNoise(n*1.7,seed+29);}
export function trailClearance(e:number,n:number,centre:number){const d=e-centre;return Math.abs(d)-trailWidth(n,d>=0);}
