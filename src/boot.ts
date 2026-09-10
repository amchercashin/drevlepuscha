export {};
const params=new URLSearchParams(location.search);
if(params.get('engine')==='lite'){
 const {enableShowcase}=await import('./domain/showcase.ts');enableShowcase();
 await import('./lite/main.ts');
}else{
 const scene=params.get('scene');
 if(scene==='world')await import('./world/game.ts');
 else{if(scene!=='m0'&&scene!=='m1'){const {enableShowcase}=await import('./domain/showcase.ts');enableShowcase();}await import('./main.ts');}
}
