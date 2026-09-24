import type {RegionHunt,Weapon} from '../domain/regions/hunt.ts';
import './region.css';

export function createHuntInterface(hunt:RegionHunt,actions:{select:(weapon:Weapon)=>void;attack:()=>void}){
 const hud=document.createElement('section');hud.className='hunt-hud';hud.setAttribute('aria-label','Выслеживание лазутчиков');
 hud.innerHTML='<strong id="hunt-title">Лазутчики · 0/3</strong><div class="hunt-health"><span>Здоровье</span><progress id="hunt-health" max="100" value="100"></progress><output id="hunt-health-value">100</output></div><p id="hunt-objective"></p><div class="hunt-weapons"><button id="hunt-bow" type="button">1 · Лук</button><button id="hunt-sword" type="button">2 · Меч</button><button id="hunt-attack" type="button">Атака</button></div><small id="hunt-help">ЛКМ · атака · Ctrl · тихий шаг · E · осмотреть след</small>';
 const reticle=document.createElement('div');reticle.className='hunt-reticle';reticle.textContent='+';reticle.setAttribute('aria-hidden','true');document.body.append(hud,reticle);
 hud.querySelector<HTMLButtonElement>('#hunt-bow')!.onclick=()=>actions.select('bow');
 hud.querySelector<HTMLButtonElement>('#hunt-sword')!.onclick=()=>actions.select('sword');
 hud.querySelector<HTMLButtonElement>('#hunt-attack')!.onclick=actions.attack;
 function update(player:{e:number;n:number},paused:boolean,crouching:boolean){
  const state=hunt.state,clue=hunt.nextClue,distance=clue?Math.hypot(clue.e-player.e,clue.n-player.n):Infinity;
  hud.querySelector<HTMLElement>('#hunt-title')!.textContent=state.completed?'Дозор завершён':`Лазутчики · ${hunt.downCount}/${state.scouts.length}`;
  hud.querySelector<HTMLProgressElement>('#hunt-health')!.value=state.health;
  hud.querySelector<HTMLOutputElement>('#hunt-health-value')!.value=String(state.health);
  hud.querySelector<HTMLElement>('#hunt-objective')!.textContent=state.completed?'Мост и восточные тропы под охраной.':clue?distance<45?`Осмотрите ${clue.label.toLowerCase()} · ${Math.round(distance)} м`:state.tracks.length?'Ищите продолжение следов на восточной тропе.':'Ищите следы за восточным концом моста.':'Лазутчики разделились у обзорного плеча. Ищите их на тропах леса.';
  hud.querySelector<HTMLButtonElement>('#hunt-bow')!.textContent=`1 · Лук · ${state.arrows}`;
  hud.querySelector<HTMLButtonElement>('#hunt-bow')!.setAttribute('aria-pressed',String(state.weapon==='bow'));
  hud.querySelector<HTMLButtonElement>('#hunt-sword')!.setAttribute('aria-pressed',String(state.weapon==='sword'));
  hud.querySelector<HTMLElement>('#hunt-help')!.textContent=crouching?'Тихий шаг · заметить вас труднее':state.arrows===0?'Колчан пуст · у двора можно взять стрелы':'ЛКМ · атака · Ctrl · тихий шаг · E · осмотреть след';
  reticle.hidden=paused||state.weapon!=='bow';
 }
 return {update,setReticle(x:number,y:number){reticle.style.left=`${x}px`;reticle.style.top=`${y}px`;reticle.style.visibility=Number.isFinite(x)&&Number.isFinite(y)?'visible':'hidden';},dispose(){hud.remove();reticle.remove();}};
}
