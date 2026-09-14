import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});
test('rapid voice rejoin and late microphone permission release resources',async({browser})=>{
 test.setTimeout(70000);const pages=[],ids=[],invite={room:crypto.randomUUID(),key:crypto.randomUUID(),serverKey:'unused',kind:'persistent'};
 try{
  for(let i=0;i<2;i++){
   const p=await browser.newPage();pages.push(p);
   await p.route('**/voice-check',r=>r.fulfill({contentType:'text/html',body:'<title>Voice lifecycle check</title>'}));
   await p.goto('http://127.0.0.1:4173/voice-check');
   ids.push(await p.evaluate(async()=> (await import('/src/network/signaling.ts')).selfId));
  }
  for(let i=0;i<2;i++)await pages[i].evaluate(async({invite,ids,i})=>{
   const {createVoiceAudio}=await import('/src/network/voice-audio.ts');
   const game={id:`voice-guest-${i}`,invite,phase:'connected',voiceMembers:()=>ids.map((peerId,n)=>({id:`voice-guest-${n}`,peerId,name:`Guest ${n}`})),onChange:()=>()=>{}};
   window.voice=createVoiceAudio(game,()=>{});voice.join();
  },{invite,ids,i});
  await pages[0].waitForFunction(()=>voice.state().peers===1,null,{timeout:45000});
  const result=await pages[0].evaluate(async()=>{
   const context=new AudioContext(),destination=context.createMediaStreamDestination();
   let release; navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{release=resolve;});
   const capture=voice.setMicrophone(true);voice.leave();voice.join();
   release(destination.stream);await capture;
   const ended=destination.stream.getTracks().every(t=>t.readyState==='ended');await context.close();return ended;
  });
  expect(result).toBe(true);
  for(const p of pages)await p.waitForFunction(()=>voice.state().joined&&voice.state().peers===1,null,{timeout:45000});
  await pages[0].evaluate(()=>voice.dispose());
  expect(await pages[0].evaluate(()=>voice.state())).toMatchObject({joined:false,microphone:false,streams:0});
 }finally{for(const p of pages)await p.close();}
});
