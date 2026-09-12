import {test,expect} from '@playwright/test';

for(const route of ['/?debug=1','/?scene=world&debug=1']){
 test(`WebGPU unavailable shows an actionable error: ${route}`,async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  await page.goto(route);
  await expect(page.locator('#pause-description')).toContainText('WebGPU');
  await expect(page.locator('#renderer')).toHaveCount(0);
  await expect(page.locator('#resume')).toHaveText('Перезагрузить');
  expect(await page.evaluate(()=>window.m0?.state().ready??window.oldForest?.state().ready??false)).toBe(false);
 });
}

test('obsolete renderer selection cannot activate a second backend',async({page})=>{
 await page.goto('/?debug=1&renderer=webgl2');
 await page.waitForFunction(()=>window.m0?.state().ready);
 expect(await page.evaluate(()=>m0.state().render.backend)).toBe('webgpu');
 await expect(page.locator('#renderer')).toHaveCount(0);
});

test('GPU device initialization failure is visible and can be retried',async({page})=>{
 await page.addInitScript(()=>{
  const original=navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter=async options=>{
   const adapter=await original(options);
   if(adapter)adapter.requestDevice=async()=>{throw new Error('Test device initialization failure');};
   return adapter;
  };
 });
 await page.goto('/?debug=1');
 await expect(page.locator('#pause-description')).toContainText('WebGPU');
 await expect(page.locator('#resume')).toHaveText('Перезагрузить');
 expect(await page.evaluate(()=>window.m0?.state().ready??false)).toBe(false);
});


test('optional GPU timers are not required for the walk',async({page})=>{
 await page.addInitScript(()=>{
  const original=navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter=async options=>{
   const adapter=await original(options);
   if(adapter){
    Object.defineProperty(adapter,'features',{value:new Set([...adapter.features].filter(f=>f!=='timestamp-query'))});
    const requestDevice=adapter.requestDevice.bind(adapter);
    adapter.requestDevice=descriptor=>{
     if(descriptor?.requiredFeatures?.includes('timestamp-query'))throw new Error('Optional timer was required');
     return requestDevice(descriptor);
    };
   }
   return adapter;
  };
 });
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 expect(await page.evaluate(()=>m0.state().render.backend)).toBe('webgpu');
 expect(await page.evaluate(()=>m0.state().errors)).toEqual([]);
});
