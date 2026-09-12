/** Scene-independent startup contract: critical data → local readiness → first frame.
 * Optional streaming queues keep running after ready; an empty queue is not a gate. */
export class SceneStartup {
 readonly stages:{label:string;start:number;end?:number}[]=[];
 readyAt:number|null=null;
 private button:HTMLButtonElement;
 constructor(button:HTMLButtonElement){this.button=button;this.button.disabled=true;}
 progress(label:string){this.button.textContent=label;}
 async stage<T>(label:string,work:()=>Promise<T>):Promise<T>{
  this.progress(label);const stage={label,start:performance.now(),end:undefined as number|undefined};this.stages.push(stage);
  const result=await work();stage.end=performance.now();return result;
 }
 async reveal(isReady:()=>boolean,activate:()=>void){
  await this.stage('Первый вид леса…',()=>prepareUntil(isReady,()=>{}));
  this.readyAt=performance.now();performance.mark('scene:playable');document.body.classList.remove('booting');
  this.button.textContent='Начать прогулку';this.button.disabled=false;this.button.onclick=activate;
 }
 stats(){return {readyAt:this.readyAt,stages:this.stages.map(s=>({...s}))};}
}

/** Yield without the nested setTimeout(0) 4 ms clamp. Also works in workers. */
export function yieldPreparation():Promise<void>{
 return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);});
}
export async function prepareUntil(ready:()=>boolean,step:()=>void,{signal,timeoutMs=45000}:{signal?:AbortSignal;timeoutMs?:number}={}){
 const start=performance.now();
 while(!ready()){
  signal?.throwIfAborted();
  if(performance.now()-start>timeoutMs)throw Error('Подготовка заняла слишком долго. Перезагрузите прогулку.');
  step();await yieldPreparation();
 }
}

/** Shared soft time limit and a strict job count: one indivisible upload may exceed ms. */
export class FrameWorkBudget {
 private started=performance.now();private jobs=0;
 private ms:number;private maxJobs:number;
 constructor(ms=3,maxJobs=1){this.ms=ms;this.maxJobs=maxJobs;}
 run(work:()=>void){
  if(this.jobs>=this.maxJobs||performance.now()-this.started>=this.ms)return false;
  this.jobs++;work();return true;
 }
}

/** Losing focus cancels input, never the user's play/pause choice. */
export function bindInputFocus(canvas:HTMLCanvasElement,reset:()=>void){
 window.addEventListener('blur',reset);canvas.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',reset);
}
