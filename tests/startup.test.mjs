import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameWorkBudget,prepareUntil,SceneStartup} from '../src/runtime/startup.ts';

test('local readiness ends preparation while optional streaming work remains',async()=>{
 let critical=3,optional=200;
 await prepareUntil(()=>critical===0,()=>{critical--;optional--;});
 assert.equal(critical,0);assert.equal(optional,197);
});
test('preparation propagates failures and cancellation',async()=>{
 await assert.rejects(prepareUntil(()=>false,()=>{throw Error('worker failed');}),/worker failed/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(prepareUntil(()=>false,()=>{}, {signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(prepareUntil(()=>false,()=>{}, {timeoutMs:-1}),/Подготовка/);
});
test('layers sharing a frame budget cannot each upload a separate batch',()=>{
 const budget=new FrameWorkBudget(100,1);let jobs=0;
 assert.equal(budget.run(()=>jobs++),true);
 assert.equal(budget.run(()=>jobs++),false);
 assert.equal(jobs,1);
 assert.equal(new FrameWorkBudget(-1).run(()=>jobs++),false);
});
test('first-frame readiness survives a minute in a background tab',async t=>{
 const oldDocument=globalThis.document,oldRaf=globalThis.requestAnimationFrame;
 t.after(()=>{globalThis.document=oldDocument;globalThis.requestAnimationFrame=oldRaf;});
 let time=0,frames=0;
 t.mock.method(performance,'now',()=>time);
 globalThis.document={hidden:false,body:{classList:{remove(){}}}};
 globalThis.requestAnimationFrame=callback=>{
  frames++;time+=frames===1?60000:16;document.hidden=frames===1;callback(time);return frames;
 };
 const button={disabled:true,textContent:'',onclick:null},startup=new SceneStartup(button);
 await startup.reveal(()=>frames>=2,()=>{});
 assert.equal(button.disabled,false);assert.equal(startup.readyAt,60016);
});
