import './touch-controls.css';

type Actions = {
  active:()=>boolean; look:(x:number,y:number)=>void; zoom:(delta:number)=>void;
  engage:()=>void;
};

// Detect input capabilities, including hybrid laptops, rather than browser names.
export function createTouchControls(canvas:HTMLCanvasElement,actions:Actions) {
  const state={forward:0,right:0,running:false};
  const root=document.createElement('section');
  root.className='touch-controls';root.setAttribute('aria-label','Сенсорное управление');
  root.innerHTML='<div class="touch-stick" aria-label="Джойстик: ближе к центру — идти, внешний круг — бежать"><i>Бег</i><span></span></div><div class="touch-actions"><button type="button" data-action="near" aria-label="Приблизить камеру">＋</button><button type="button" data-action="far" aria-label="Отдалить камеру">−</button></div>';
  document.body.append(root);
  const stick=root.querySelector<HTMLElement>('.touch-stick')!,knob=stick.querySelector('span')!;
  const nav=document.querySelector('footer nav')!,home=nav.parentElement!;
  const hint=document.querySelector('.pause-card .small')!,desktopHint=hint.textContent;
  const panel=document.querySelector('#diagnostics')!;
  let moveId:number|null=null,lookId:number|null=null,lastX=0,lastY=0;
  const reset=()=>{moveId=lookId=null;state.forward=state.right=0;state.running=false;stick.classList.remove('running');knob.style.transform='';};
  let detected=false;
  const query=matchMedia('(pointer: coarse)');
  const update=()=>{const enabled=detected||query.matches;document.body.classList.toggle('touch-enabled',enabled);root.hidden=!enabled;
    (enabled?panel:home).append(nav);
    hint.textContent=enabled?'Слева — идти; внешний круг — бежать. Проведите по сцене для осмотра.':desktopHint;};
  query.addEventListener('change',update);update();
  window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!detected){detected=true;update();}},{capture:true});
  const move=(e:PointerEvent)=>{const r=stick.getBoundingClientRect(),radius=r.width/2-22;let x=(e.clientX-r.x-r.width/2)/radius,y=(e.clientY-r.y-r.height/2)/radius;const length=Math.hypot(x,y);state.running=length>=(state.running?0.72:0.85);stick.classList.toggle('running',state.running);if(length>1){x/=length;y/=length;}state.right=Math.abs(x)<0.08?0:x;state.forward=Math.abs(y)<0.08?0:-y;knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;};
  stick.addEventListener('pointerdown',e=>{if(!actions.active()||moveId!==null)return;e.preventDefault();actions.engage();moveId=e.pointerId;stick.setPointerCapture(e.pointerId);move(e);});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===moveId)move(e);});
  const stop=(e:PointerEvent)=>{if(e.pointerId===moveId){moveId=null;state.forward=state.right=0;state.running=false;stick.classList.remove('running');knob.style.transform='';}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>stop(e as PointerEvent));
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||!actions.active()||lookId!==null)return;actions.engage();lookId=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lookId||!actions.active())return;actions.look(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if((e as PointerEvent).pointerId===lookId)lookId=null;});
  root.addEventListener('click',e=>{const action=(e.target as HTMLElement).closest('button')?.dataset.action;if(!actions.active())return;
    if(action==='near')actions.zoom(-0.5);if(action==='far')actions.zoom(0.5);
});
  window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  new MutationObserver(()=>{if(!actions.active())reset();}).observe(document.querySelector('#pause')!,{attributes:true,attributeFilter:['hidden']});
  return {state,reset};
}
