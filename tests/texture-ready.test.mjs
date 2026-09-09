import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForTextures} from '../src/runtime/texture-ready.ts';
test('startup waits for delayed textures and reports progress',async()=>{
 let ready=false,done=false;const progress=[];
 const task=waitForTextures([{isReady:()=>ready,loadingError:false}],(...p)=>progress.push(p)).then(()=>done=true);
 await new Promise(r=>setTimeout(r,20));assert.equal(done,false);ready=true;await task;
 assert.deepEqual(progress[0],[0,1]);assert.deepEqual(progress.at(-1),[1,1]);
});
test('failed and stalled textures produce a recoverable startup error',async()=>{
 await assert.rejects(waitForTextures([{isReady:()=>false,loadingError:true}],()=>{}),/Не удалось/);
 await assert.rejects(waitForTextures([{isReady:()=>false,loadingError:false}],()=>{},0),/слишком долго/);
});
