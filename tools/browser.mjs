import { chromium } from '@playwright/test';

export async function openHarness(viewport={width:1600,height:900}) {
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  const errors=[];
  page.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname))errors.push(`Unexpected external runtime request: ${url.origin}${url.pathname}`);});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||/uncaptured error|validationerror|device lost/i.test(m.text()))errors.push(m.text());});
  try {
  const url=new URL(process.env.HARNESS_URL||'http://127.0.0.1:4173');
  url.searchParams.set('debug','1');
  const renderer=process.argv.find(a=>a.startsWith('--renderer='))?.slice('--renderer='.length)||process.env.RENDERER;
  if(renderer)url.searchParams.set('renderer',renderer);
  await page.goto(url.href);
  await page.waitForFunction(()=>window.m0?.state().ready);
  await page.getByRole('button',{name:'Начать прогулку'}).click();
  await page.bringToFront();
  return {browser,page,errors};
  } catch(error) {await browser.close();throw error;}
}
