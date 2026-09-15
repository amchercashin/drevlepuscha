import bank from '../../config/showcase-audio.json';
import {ambientPhase,ambientWind} from '../domain/ambient.ts';
import type {Point3,Box} from '../domain/harness.ts';
import type {WindSystem} from './wind.ts';

type Asset=typeof bank.assets[number];
type Loop={source:AudioBufferSourceNode;gain:GainNode;pan?:PannerNode;anchor?:Point3};
const LOOP_IDS=bank.assets.filter(a=>a.kind==='loop').map(a=>a.id);
const intervals:Record<string,[number,number]>={T01:[30,75],T02:[35,85],T03:[100,210],B01:[16,40],B02:[12,35],B03:[40,100],B04:[55,130],I02:[25,65]};
const KEY='showcase-audio-v1';
// The replacement cricket source is unusually quiet (-52 dB RMS, -38 dB peak).
// Modest fixed playback gain keeps it audible at night; raw/encoded samples stay intact.
const cricketGain=10**(16/20);

/** One scene-owned mixer for solo and rooms. Events are local, weather is scene-owned. */
export class ShowcaseAudio {
 private context?:AudioContext;
 private master?:GainNode;
 private buffers=new Map<string,Promise<AudioBuffer>>();
 private loops=new Map<string,Loop>();
 private voices=new Set<AudioBufferSourceNode>();
 private due=new Map<string,number>();
 private abort=new AbortController();
 private trees:Point3[];
 private nearby:Point3[]=[];
 private anchorTime=0;
 private elapsed=0;
 private lastEvent=-10;
 private pendingEvents=0;
 private volume=.8;
 private paused=true;
 private disposed=false;
 private starting?:Promise<void>;
 private lastStrength=0;
 private lastGust=0;
 private lastHour=12;
 private gains:Record<string,number>={};
 private issues:string[]=[];
 private loaded=new Set<string>();
 private eventsPlayed=0;
 private panel=document.createElement('section');
 private status:HTMLElement;
 private visibility=()=>this.applyMaster();
 constructor(private wind:WindSystem,trees:Box[]){
  this.trees=trees.map(b=>({x:(b.min.x+b.max.x)/2,y:b.min.y,z:(b.min.z+b.max.z)/2}));
  try{const saved=JSON.parse(localStorage.getItem(KEY)??'null');if(Number.isFinite(saved?.volume))this.volume=Math.max(0,Math.min(1,saved.volume));}catch{}
  this.panel.className='daylight-panel';
  this.panel.innerHTML='<strong>Звуки леса</strong><label for="forest-audio-volume">Общая громкость <output id="forest-audio-level"></output></label><input id="forest-audio-volume" type="range" min="0" max="100" step="1"><small id="forest-audio-status" role="status"></small>';
  this.status=this.panel.querySelector('#forest-audio-status')!;
  const volume=this.panel.querySelector<HTMLInputElement>('#forest-audio-volume')!,level=this.panel.querySelector<HTMLOutputElement>('#forest-audio-level')!;
  volume.value=String(Math.round(this.volume*100));level.value=`${volume.value}%`;
  volume.oninput=()=>{this.volume=Number(volume.value)/100;level.value=`${volume.value}%`;this.save();this.applyMaster();void this.start();};
  document.querySelector('#diagnostics')!.insertBefore(this.panel,document.querySelector('#metrics'));
  document.addEventListener('visibilitychange',this.visibility);
  for(const asset of bank.assets)if(asset.kind!=='loop')this.due.set(asset.id,this.delay(asset.id)*.5);
 }
 private save(){try{localStorage.setItem(KEY,JSON.stringify({volume:this.volume}));}catch{}}
 private active(){return this.volume>0&&!this.paused&&!document.hidden&&!this.disposed;}
 private applyMaster(){
  const ctx=this.context;
  if(ctx&&this.master)this.master.gain.setTargetAtTime(this.active()?this.volume:0,ctx.currentTime,.08);
  // Let existing tails finish silently; never replay old events after focus returns.
 }
 setPaused(paused:boolean){this.paused=paused;this.applyMaster();}
 /** Called by a user gesture; asset loading never blocks entering the forest. */
 async start(){
  if(this.disposed||this.volume===0)return;
  try{
   if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);}
   if(this.context.state==='suspended')await this.context.resume();
   this.applyMaster();
   if(this.loops.size===LOOP_IDS.length)return;
   if(!this.starting){
    this.status.textContent='Загружаем звуки…';
    this.starting=Promise.allSettled(LOOP_IDS.map(id=>this.addLoop(bank.assets.find(a=>a.id===id)!))).then(()=>{
     if(!this.disposed)this.status.textContent=this.loops.size===LOOP_IDS.length?'':'Часть звуков не загрузилась. Нажмите на лес, чтобы повторить.';
    }).finally(()=>{this.starting=undefined;});
   }
   await this.starting;
  }catch(error){this.report(error);this.status.textContent='Звук пока недоступен. Нажмите на лес, чтобы повторить.';}
 }
 private report(error:unknown){if(!this.disposed){const message=String(error);if(!this.issues.includes(message))this.issues.push(message);}}
 private load(asset:Asset){
  let pending=this.buffers.get(asset.id);
  if(!pending){
   pending=fetch(`${import.meta.env.BASE_URL}audio/showcase/${asset.file}`,{signal:this.abort.signal})
    .then(r=>{if(!r.ok)throw new Error(`Audio ${asset.id}: HTTP ${r.status}`);return r.arrayBuffer();})
    .then(data=>this.context!.decodeAudioData(data)).then(buffer=>{this.loaded.add(asset.id);return buffer;})
    .catch(error=>{this.buffers.delete(asset.id);this.report(error);throw error;});
   this.buffers.set(asset.id,pending);
  }
  return pending;
 }
 private panner(position:Point3,refDistance=8){
  const p=this.context!.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=refDistance;p.maxDistance=120;p.rolloffFactor=1;
  p.positionX.value=position.x;p.positionY.value=position.y;p.positionZ.value=position.z;
  return p;
 }
 private async addLoop(asset:Asset){
  if(this.loops.has(asset.id))return;
  const buffer=await this.load(asset);if(this.disposed)return;
  const ctx=this.context!,source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;gain.gain.value=0;
  source.connect(gain);
  const pan=asset.channels===1?this.panner({x:0,y:0,z:0},3):undefined;
  if(pan){gain.connect(pan);pan.connect(this.master!);}else gain.connect(this.master!);
  this.loops.set(asset.id,{source,gain,pan});
  // Arbitrary phase prevents all bed textures starting together; no playback-rate modulation.
  source.start(0,Math.random()*buffer.duration);
 }
 private delay(id:string){const [lo,hi]=intervals[id];return lo+Math.random()*(hi-lo);}
 private async event(asset:Asset,position:Point3){
  this.pendingEvents++;
  try{
   const buffer=await this.load(asset);
   if(!this.active()||this.voices.size>=2)return;
   const ctx=this.context!,source=ctx.createBufferSource(),gain=ctx.createGain(),pan=this.panner(position,asset.id==='T03'?12:8);
   source.buffer=buffer;gain.gain.value=(asset.group==='birds'?.65:.55)*asset.trim;
   const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=asset.id==='T03'?1400:12000;
   source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master!);
   this.voices.add(source);this.eventsPlayed++;
   source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
   source.start(); // Entire source, including the natural quiet tail. No duration argument.
  }catch{/* Logged at the loading boundary; retry only at a later event. */}
  finally{this.pendingEvents--;}
 }
 update(dt:number,hour:number,eye:Point3,forward:Point3){
  const ctx=this.context;if(!ctx||this.disposed)return;
  this.lastHour=hour;
  const listener=ctx.listener;
  listener.positionX.value=eye.x;listener.positionY.value=eye.y;listener.positionZ.value=eye.z;
  listener.forwardX.value=forward.x;listener.forwardY.value=forward.y;listener.forwardZ.value=forward.z;
  listener.upX.value=0;listener.upY.value=1;listener.upZ.value=0;
  const sample=this.wind.sampleAt(eye.x,eye.y,eye.z);
  this.lastStrength=sample.strength01;this.lastGust=sample.gust01;
  const levels=ambientWind(sample.strength01,sample.gust01,this.wind.canopyBend,this.wind.coverBend);
  if(this.active())this.elapsed+=Math.max(0,Math.min(dt,.1));
  if(this.elapsed>=this.anchorTime){
   this.anchorTime=this.elapsed+1;
   this.nearby=this.trees.filter(p=>Math.hypot(p.x-eye.x,p.z-eye.z)<85);
   const ground=this.loops.get('W06');
   if(ground?.pan&&(!ground.anchor||Math.hypot(ground.anchor.x-eye.x,ground.anchor.z-eye.z)>18)){
    ground.anchor=this.nearby.reduce<Point3|undefined>((best,p)=>!best||Math.hypot(p.x-eye.x,p.z-eye.z)<Math.hypot(best.x-eye.x,best.z-eye.z)?p:best,undefined);
    if(ground.anchor){ground.pan.positionX.setTargetAtTime(ground.anchor.x,ctx.currentTime,.5);ground.pan.positionY.setTargetAtTime(ground.anchor.y+.3,ctx.currentTime,.5);ground.pan.positionZ.setTargetAtTime(ground.anchor.z,ctx.currentTime,.5);}
   }
  }
  for(const asset of bank.assets){
   const phase=ambientPhase(hour,asset.phaseWeights),loop=this.loops.get(asset.id);
   if(loop){
    let level=(levels[asset.id]??.32*cricketGain)*phase*asset.trim;
    if(asset.id==='W06'&&!loop.anchor)level=0;
    // Gusts already have the vegetation's smooth envelope; only de-click the audio gain.
    this.gains[asset.id]=level;loop.gain.gain.setTargetAtTime(level,ctx.currentTime,asset.id==='I01'?1.5:.06);
   }else if(asset.kind!=='loop'&&this.active()&&this.elapsed>=(this.due.get(asset.id)??Infinity)){
    this.due.set(asset.id,this.elapsed+this.delay(asset.id));
    const chance=phase*(asset.id.startsWith('T')?.15+.85*sample.gust01:1);
    if(this.voices.size+this.pendingEvents>=2||this.elapsed-this.lastEvent<4||Math.random()>chance)continue;
    const distant=asset.id==='T03',min=distant?35:5,max=distant?85:45;
    const sites=this.nearby.filter(p=>{const d=Math.hypot(p.x-eye.x,p.z-eye.z);return d>=min&&d<=max;});
    if(!sites.length)continue;
    const point=sites[Math.floor(Math.random()*sites.length)];
    this.lastEvent=this.elapsed;void this.event(asset,{...point,y:point.y+(asset.id.startsWith('B')?5:1)});
   }
  }
 }
 stats(){return {version:bank.version,context:this.context?.state??'not-started',volume:this.volume,active:this.active(),loops:this.loops.size,loaded:[...this.loaded],voices:this.voices.size,eventsPlayed:this.eventsPlayed,strength:this.lastStrength,gust:this.lastGust,hour:this.lastHour,gains:{...this.gains},errors:[...this.issues]};}
 dispose(){
  this.disposed=true;this.abort.abort();document.removeEventListener('visibilitychange',this.visibility);this.panel.remove();
  for(const {source,gain,pan} of this.loops.values()){source.stop();source.disconnect();gain.disconnect();pan?.disconnect();}
  for(const source of this.voices)source.stop();
  this.loops.clear();this.buffers.clear();this.master?.disconnect();void this.context?.close().catch(()=>{});
 }
}
