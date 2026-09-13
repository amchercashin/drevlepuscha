type Cost={cpuMs:number;gpuMs:number};
export function timingSummary(values:number[]){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 return {samples:sorted.length,mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)!};
}

/** Opt-in, bounded capture for real Safari/iPhone measurements, without devtools. */
export function performanceReport(start:()=>void,finish:()=>{frames:number[];costs:Cost[];context:unknown}){
 const controls=document.createElement('div'),button=document.createElement('button'),help=document.createElement('p');
 button.type='button';button.id='performance-report';button.textContent='Замерить производительность · 20 секунд';
 help.textContent='Запусти замер, закрой настройки и пройдись. Затем вернись сюда, чтобы скачать результат.';
 controls.append(button,help);document.querySelector('#diagnostics')!.append(controls);
 let timer:ReturnType<typeof setTimeout>|undefined,report:unknown;
 button.onclick=()=>{
  if(report){
   const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='drevlepuscha-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   report=undefined;button.textContent='Замерить ещё раз · 20 секунд';return;
  }
  start();button.disabled=true;button.textContent='Идёт замер · пройдись по лесу';
  const began=performance.now();
  timer=setTimeout(()=>{
   const {frames,costs,context}=finish(),frameMs=timingSummary(frames);
   report={version:1,date:new Date().toISOString(),userAgent:navigator.userAgent,elapsedMs:performance.now()-began,
    scope:'Actual device; visible unpaused frames. CPU time measures application/render submission, not GPU completion.',
    fps:frameMs?1000/frameMs.mean:null,frameMs,cpuSubmitMs:timingSummary(costs.map(c=>c.cpuMs)),
    gpuMainPassMs:timingSummary(costs.map(c=>c.gpuMs).filter(t=>t>0)),framesOver33Ms:frames.filter(t=>t>33.34).length,context};
   button.disabled=false;button.textContent='Скачать результат замера';
   help.textContent=frameMs?`Средняя частота: ${Math.round(1000/frameMs.mean)} FPS. Скачай файл результата.`:'Нет кадров прогулки. Сними паузу и повтори замер.';
  },20000);
 };
 return ()=>{clearTimeout(timer);controls.remove();};
}
