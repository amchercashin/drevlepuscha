import {WildlifeWorld} from '../domain/wildlife/world.ts';
import type {WildlifeEnvironment,WildlifeEvent,WildlifeFrame,WildlifeObserver,WildlifePackage} from '../domain/wildlife/types.ts';
import {frameValidator} from './wildlife-protocol.ts';
export interface WildlifeSessionView {
 readonly role:'authority'|'replica';latest():WildlifeFrame|null;
 subscribe(listener:(frame:WildlifeFrame,initial:boolean)=>void):()=>void;
 setSceneReady(ready:boolean):void;presentationMs(now:number):number;
}
export interface WildlifeSessionOptions {data:WildlifePackage;world?:WildlifeWorld;gameHours?:number;}
/** Transport-neutral holder. A guest never constructs the authority world. */
export class WildlifeSession {
 readonly options:WildlifeSessionOptions;readonly role:'authority'|'replica';
 readonly view:WildlifeSessionView;private world?:WildlifeWorld;
 private frame:WildlifeFrame|null=null;private receivedAt=0;private simBase=0;private startedAt=0;
 private validator:ReturnType<typeof frameValidator>;private listeners=new Set<(frame:WildlifeFrame,initial:boolean)=>void>();
 private disposed=false;private ready=false;private onReady:(ready:boolean)=>void=()=>{};
 constructor(options:WildlifeSessionOptions,role:'authority'|'replica',epoch:string,now:number){
  this.options=options;this.role=role;
  this.validator=frameValidator(options.data);this.startedAt=now;
  if(role==='authority'){this.world=options.world??new WildlifeWorld({content:options.data.identity,authorityEpoch:epoch,seed:options.data.identity.contentHash,cells:new Map(options.data.cells.map(c=>[c.id,c])),limits:options.data.limits,bird:options.data.bird});this.frame=this.world.snapshot();this.simBase=this.frame.simMs;}
  this.view=Object.freeze({role,latest:()=>this.frame?structuredClone(this.frame):null,subscribe:(listener:(frame:WildlifeFrame,initial:boolean)=>void)=>{this.listeners.add(listener);if(this.frame)listener(structuredClone(this.frame),true);return ()=>{this.listeners.delete(listener);};},setSceneReady:(ready:boolean)=>{this.ready=ready;this.onReady(ready);},presentationMs:(now:number)=>this.frame?Math.min(this.frame.simMs+250,this.frame.simMs+Math.max(0,now-this.receivedAt))-(role==='replica'?120:0):0});
 }
 bindReady(callback:(ready:boolean)=>void){this.onReady=callback;callback(this.ready);}
 resendReady(){this.onReady(this.ready);}
 advance(now:number,observers:readonly WildlifeObserver[],environment:WildlifeEnvironment){
  if(this.disposed||!this.world)return;
  this.world.advance({simMs:this.simBase+Math.max(0,now-this.startedAt),observers,environment});
  this.publish(this.world.snapshot(),now,false);
 }
 accept(value:unknown,now:number,welcome=false){
  if(this.disposed||this.role!=='replica'||!this.validator(value))return false;
  if(!welcome&&(!this.frame||value.authorityEpoch!==this.frame.authorityEpoch||value.seq<=this.frame.seq||value.simMs<this.frame.simMs||value.eventWatermark<this.frame.eventWatermark))return false;
  this.publish(value,now,welcome);return true;
 }
 private publish(frame:WildlifeFrame,now:number,initial:boolean){this.frame=structuredClone(frame);this.receivedAt=now;for(const listener of this.listeners)listener(structuredClone(frame),initial);}
 /** Transfer the actual core for solo -> host, not an incomplete wire checkpoint. */
 detachWorld(){const world=this.world;this.world=undefined;return world;}
 stats(){return {listeners:this.listeners.size,sceneReady:this.ready,...this.world?.stats()};}
 dispose(){if(this.disposed)return;this.disposed=true;this.world?.dispose();this.world=undefined;this.listeners.clear();this.frame=null;this.onReady=()=>{};}
}
/** Presentation event window; initial attach, reconnect and epoch change discard history. */
export class WildlifeEvents {
 private watermark=0;private epoch='';private pending:WildlifeEvent[]=[];
 accept(frame:WildlifeFrame,initial:boolean){
  if(initial||frame.authorityEpoch!==this.epoch){this.epoch=frame.authorityEpoch;this.watermark=frame.eventWatermark;this.pending=[];return;}
  for(const e of frame.recentEvents)if(e.seq>this.watermark)this.pending.push(e);
  this.watermark=Math.max(this.watermark,frame.eventWatermark);this.pending=this.pending.slice(-32);
 }
 due(time:number){const due=this.pending.filter(e=>time>=e.atMs&&time-e.atMs<=500);this.pending=this.pending.filter(e=>e.atMs>time);return due;}
 clear(){this.pending=[];this.epoch='';this.watermark=0;}
}
