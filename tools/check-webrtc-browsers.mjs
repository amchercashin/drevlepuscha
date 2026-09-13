// Independent Safari/Chrome check, deliberately without Trystero, MQTT or 3D.
// Run, then open the printed host URL in Safari. Chrome joins automatically.
// Only loopback carries SDP; output contains candidate types, never addresses.
import http from 'node:http';
import {chromium} from 'playwright-core';
const messages={host:[],guest:[]}, reports={};
const port=5199;
const html=`<!doctype html><meta charset="utf-8"><title>WebRTC browser check</title><h1>WebRTC browser check</h1><pre id="status">Starting</pre><script>
const role=new URLSearchParams(location.search).get('role')||'host',other=role==='host'?'guest':'host';
const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
const state={role,received:0,sent:0,localTypes:{},remoteTypes:{},errors:[]};
const send=body=>fetch('/send?to='+other,{method:'POST',body:JSON.stringify(body)});
async function report(){state.connection=pc.connectionState;state.ice=pc.iceConnectionState;state.local=pc.localDescription?.type;state.remote=pc.remoteDescription?.type;document.querySelector('#status').textContent=JSON.stringify(state,null,2);fetch('/report?role='+role,{method:'POST',body:JSON.stringify(state)});}
pc.onicecandidate=e=>{if(e.candidate){state.localTypes[e.candidate.type]=(state.localTypes[e.candidate.type]||0)+1;send({candidate:e.candidate.toJSON()});}};
pc.onconnectionstatechange=report;pc.oniceconnectionstatechange=report;
function channel(c){c.onopen=()=>{state.channel='open';c.send('hello');state.sent++;report();};c.onmessage=()=>{state.received++;report();};}
pc.ondatachannel=e=>channel(e.channel);
const pending=[];
setInterval(async()=>{for(const msg of await (await fetch('/receive?role='+role)).json()){try{if(msg.description){await pc.setRemoteDescription(msg.description);for(const c of pending.splice(0))await pc.addIceCandidate(c);if(msg.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());await send({description:pc.localDescription});}}else if(msg.candidate){const type=msg.candidate.candidate.match(/ typ (\\w+)/)?.[1];state.remoteTypes[type]=(state.remoteTypes[type]||0)+1;if(pc.remoteDescription)await pc.addIceCandidate(msg.candidate);else pending.push(msg.candidate);}}catch(e){state.errors.push(e.message);}report();}},300);
if(role==='host'){channel(pc.createDataChannel('check'));pc.setLocalDescription().then(()=>send({description:pc.localDescription}));}
setInterval(report,2000);
</script>`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),role=url.searchParams.get('role'),to=url.searchParams.get('to');
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>65536){res.writeHead(413);res.end();return;}}
  if(url.pathname==='/send' && to in messages){messages[to].push(JSON.parse(body));res.end('{}');}
  else if(url.pathname==='/receive' && role in messages)res.end(JSON.stringify(messages[role].splice(0)));
  else if(url.pathname==='/report' && role in messages){reports[role]=JSON.parse(body);res.end('{}');}
  else if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else{res.writeHead(404);res.end('{}');}
 }catch{res.writeHead(400);res.end('{}');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
console.log(`Open in Safari: http://127.0.0.1:${port}/?role=host`);
let browser;
try{
 const deadline=Date.now()+120000;
 while(!reports.host){if(Date.now()>deadline)throw Error('Safari host was not opened');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/?role=guest`);
 let passed=false;
 try{await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('"received": 1'),null,{timeout:45000});passed=true;}catch{}
 // Both endpoints must independently report receipt of the other endpoint's packet.
 passed &&= reports.host?.received>0 && reports.guest?.received>0;
 console.log(JSON.stringify({passed,scope:'Safari and installed Chrome on one Mac; current network and VPN settings',reports},null,2));
 if(!passed)process.exitCode=1;
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
