import {enableShowcase} from './domain/showcase.ts';
import {preloadShowcase} from './runtime/showcase-assets.ts';
const params=new URLSearchParams(location.search);
try {
if(params.get('engine')==='lite'){
 enableShowcase();document.body.classList.remove('booting');
 await import('./lite/main.ts');
}else{
 const scene=params.get('scene');
 if(scene==='world'){document.body.classList.remove('showcase');document.title='Древлепуща — прогулка по карте';document.querySelector('h1')!.textContent='Древлепуща';document.querySelector('#pause-title')!.textContent='За Высокой Изгородью';await import('./world/game.ts');}
 else{if(scene!=='m0'&&scene!=='m1'){enableShowcase();preloadShowcase(params);}else document.body.classList.remove('showcase');await import('./main.ts');}
}

}catch(error){
 document.body.classList.remove('booting');
 document.querySelector('#pause-title')!.textContent='Не удалось открыть прогулку';
 document.querySelector('#pause-description')!.textContent='Проверьте соединение и повторите загрузку.';
 const button=document.querySelector<HTMLButtonElement>('#resume')!;button.textContent='Перезагрузить';button.disabled=false;button.onclick=()=>location.reload();
 if(params.get('debug')==='1')console.error(error);
}
