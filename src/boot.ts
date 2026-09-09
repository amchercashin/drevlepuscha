export {};
const scene=new URLSearchParams(location.search).get('scene');
if(scene==='m0'||scene==='m1')await import('./main.ts');else await import('./world/game.ts');
