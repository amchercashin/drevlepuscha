import {test,expect} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,screenshot:'off'});
test('wildlife review fits a phone layout and leaves the joystick accessible',async({page})=>{
 test.setTimeout(60000);await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').tap();
 const layout=await page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {width:innerWidth,controls:[...document.querySelector('.wildlife-review').children].map(r),stick:r(document.querySelector('.touch-stick')),touch:document.body.classList.contains('touch-enabled')};});
 expect(layout.touch).toBe(true);for(const c of layout.controls){expect(c.left).toBeGreaterThanOrEqual(0);expect(c.right).toBeLessThanOrEqual(layout.width);expect(c.bottom).toBeLessThanOrEqual(layout.stick.top);}
 await page.getByLabel('Место фауны').selectOption('trail-squirrel-01');await page.getByRole('button',{name:'Отойти',exact:true}).tap();await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.siteId==='trail-squirrel-01'));
 await page.getByRole('button',{name:'К животному',exact:true}).tap();await page.waitForFunction(()=>m0.wildlife.state().instances.some(e=>e.id.includes('trail-squirrel-01')&&e.lod===0));
});
