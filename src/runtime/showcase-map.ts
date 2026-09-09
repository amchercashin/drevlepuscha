import {showcaseHeight,showcasePath,SHOWCASE_POIS} from '../domain/showcase.ts';
export function createShowcaseMap(pose:()=>{e:number;n:number;yaw:number},pause:(v:boolean)=>void,travel:(e:number,n:number)=>void){
 const panel=document.createElement('section');panel.className='ravine-map';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Карта лесных ложбин');
 panel.innerHTML='<div class="map-sheet"><header><div><p>ДРЕВЛЕПУЩА · ПОЛЕВОЙ АТЛАС</p><h2>Лесные ложбины</h2></div><button aria-label="Закрыть карту">Закрыть · M</button></header><div class="map-content"><canvas width="640" height="800" aria-label="Рельеф, тропа и положение путника"></canvas><aside><h3>По тропе</h3><div class="map-pois"></div><p>Горизонтали через 2 м.<br>Тёмная отмывка — склон.<br>Светлая линия — тропа.</p><p class="map-position"></p><p>Участок 512 × 640 м<br>Север ↑</p></aside></div></div>';
 document.body.append(panel);const button=document.createElement('button');button.className='atlas-button';button.textContent='M · Карта леса';document.body.append(button);
 const canvas=panel.querySelector('canvas')!,ctx=canvas.getContext('2d')!,base=document.createElement('canvas');base.width=640;base.height=800;const b=base.getContext('2d')!;
 const x=(e:number)=>(e+256)*1.25,y=(n:number)=>(384-n)*1.25;
 let built=false;
 function build(pixels:Uint8ClampedArray){
  built=true;
  const raster=document.createElement('canvas');raster.width=320;raster.height=400;const c=raster.getContext('2d')!,im=c.createImageData(320,400);
  im.data.set(pixels);
  c.putImageData(im,0,0);b.drawImage(raster,0,0,640,800);
  b.strokeStyle='#f5e8b8';b.lineWidth=3;b.beginPath();for(let n=-256;n<=384;n+=2){const e=showcasePath(n);n===-256?b.moveTo(x(e),y(n)):b.lineTo(x(e),y(n));}b.stroke();
  b.font='13px Georgia';b.textAlign='center';
  for(let n=-190;n<350;n+=95)for(let e=-190;e<230;e+=125){b.fillStyle='#34453b';b.fillText(`${showcaseHeight(e,n).toFixed(0)} м`,x(e),y(n));}
  for(const [i,p] of SHOWCASE_POIS.entries()){
   b.fillStyle='#f8edcf';b.strokeStyle='#475f49';b.lineWidth=2;b.beginPath();b.arc(x(p.e),y(p.n),10,0,Math.PI*2);b.fill();b.stroke();b.fillStyle='#243e30';b.fillText(String(i+1),x(p.e),y(p.n)+4);
  }
  b.strokeStyle='#34453b';b.lineWidth=2;b.beginPath();b.moveTo(30,762);b.lineTo(155,762);b.stroke();b.fillStyle='#34453b';b.fillText('100 м',92,784);
 }
 function draw(){if(panel.hidden)return;if(!built){ctx.fillStyle="#dddcc0";ctx.fillRect(0,0,640,800);ctx.fillStyle="#34453b";ctx.font="20px Georgia";ctx.fillText("Готовим карту рельефа…",160,400);return;}ctx.drawImage(base,0,0);const p=pose(),a=p.yaw*Math.PI/180,px=x(p.e),py=y(p.n);
  ctx.fillStyle='rgba(203,126,48,.22)';ctx.beginPath();ctx.moveTo(px,py);ctx.arc(px,py,43,a-Math.PI/2-.43,a-Math.PI/2+.43);ctx.closePath();ctx.fill();ctx.fillStyle='#a7472e';ctx.strokeStyle='#fff4d2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();ctx.stroke();
  panel.querySelector('.map-position')!.textContent=`Вы здесь · ${showcaseHeight(p.e,p.n).toFixed(1)} м`;
 }
 function close(){panel.hidden=true;pause(false);document.querySelector<HTMLCanvasElement>('#world')!.focus();}
 function open(){pause(true);document.querySelector<HTMLElement>('#pause')!.hidden=true;panel.hidden=false;draw();panel.querySelector<HTMLButtonElement>('button')!.focus();}
 button.onclick=open;panel.querySelector<HTMLButtonElement>('header button')!.onclick=close;
 for(const [i,p] of SHOWCASE_POIS.entries()){const bt=document.createElement('button');bt.innerHTML=`<span>${i+1}. ${p.name}</span><small>${showcaseHeight(p.e,p.n).toFixed(1)} м</small>`;bt.onclick=()=>{travel(p.e,p.n);close();};panel.querySelector('.map-pois')!.append(bt);}
 window.addEventListener('keydown',e=>{if(e.code==='KeyM'||e.code==='Escape'&&!panel.hidden){e.preventDefault();e.stopImmediatePropagation();panel.hidden?open():close();}},true);
 const worker=new Worker(new URL('./showcase-map.worker.ts',import.meta.url),{type:'module'});
 worker.onmessage=e=>{build(e.data);draw();worker.terminate();};
 worker.onerror=()=>{worker.terminate();panel.querySelector('.map-position')!.textContent='Не удалось подготовить карту. Перезагрузите страницу.';};
 return {draw,isOpen:()=>!panel.hidden};
}
