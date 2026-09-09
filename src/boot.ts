export {};
const scene=new URLSearchParams(location.search).get('scene');
if(scene==='world')await import('./world/game.ts');else{if(scene!=='m0'&&scene!=='m1'){const {enableShowcase}=await import('./domain/showcase.ts');enableShowcase();}await import('./main.ts');}
