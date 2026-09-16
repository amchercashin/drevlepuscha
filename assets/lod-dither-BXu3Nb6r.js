const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./new-sky-D4OOay4J.js","./babylon-BvZH4w7q.js","./preload-helper-HclGiUj8.js","./sky-appearance-DhyiZI5x.js"])))=>i.map(i=>d[i]);
import{o as e}from"./showcase-9L0OWhEB.js";import{n as t}from"./persistent-protocol-Um2PP_Xc.js";import{t as n}from"./preload-helper-HclGiUj8.js";import{t as r}from"./material-0-DjZY5blz.js";import{Ht as i,Ut as a,Wt as o,Xt as s,Yt as c,an as l,cn as u,dn as d,fn as f,gn as p,in as m,nn as h,pn as g,sn as _,tn as v}from"./babylon-BvZH4w7q.js";import{n as y,t as b}from"./seed-BeHOWOeI.js";import{_ as x,a as S,c as C,d as w,f as T,g as E,l as D,n as O,o as k,p as A,r as j,s as M,u as N,v as P}from"./camera-presets-BS89o8Js.js";import{g as F,i as I,p as L}from"./coordinates-Clc7oQvH.js";var R=class{stages=[];readyAt=null;button;constructor(e){this.button=e,this.button.disabled=!0}progress(e){this.button.textContent=e}async stage(e,t){this.progress(e);let n={label:e,start:performance.now(),end:void 0};this.stages.push(n);let r=await t();return n.end=performance.now(),r}async reveal(e,t){await this.stage(`Первый вид леса…`,async()=>{let t=0;for(;!e();){let e=performance.now();if(await new Promise(e=>requestAnimationFrame(()=>e())),document.hidden||(t+=Math.min(250,performance.now()-e)),t>45e3)throw Error(`Не удалось подготовить первый кадр. Перезагрузите прогулку.`)}}),this.readyAt=performance.now(),performance.mark(`scene:playable`),document.body.classList.remove(`booting`),this.button.textContent=`Начать прогулку`,this.button.disabled=!1,this.button.onclick=t}stats(){return{readyAt:this.readyAt,stages:this.stages.map(e=>({...e}))}}};function z(){return new Promise(e=>{let t=new MessageChannel;t.port1.onmessage=()=>{t.port1.close(),t.port2.close(),e()},t.port2.postMessage(null)})}async function B(e,t,{signal:n,timeoutMs:r=45e3}={}){let i=performance.now();for(;!e();){if(n?.throwIfAborted(),performance.now()-i>r)throw Error(`Подготовка заняла слишком долго. Перезагрузите прогулку.`);t(),await z()}}var V=class{started=performance.now();jobs=0;ms;maxJobs;constructor(e=3,t=1){this.ms=e,this.maxJobs=t}run(e){return this.jobs>=this.maxJobs||performance.now()-this.started>=this.ms?!1:(this.jobs++,e(),!0)}};function H(e,t){window.addEventListener(`blur`,t),e.addEventListener(`blur`,t),document.addEventListener(`visibilitychange`,t)}d.ShadersStoreWGSL.daySkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`,d.ShadersStoreWGSL.daySkyPixelShader=`varying skyDirection:vec3f;uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);
 let up=clamp(dir.y,0.0,1.0);
 var colour=mix(uniforms.horizon,uniforms.zenith,pow(up,0.45));
 let sunD=length(dir-uniforms.solar);
 let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0005);
 let moonAA=max(fwidth(moonD),0.0005);
 let sunDisc=1.0-smoothstep(0.012-sunAA,0.012+sunAA,sunD);
 let moonDisc=1.0-smoothstep(0.015-moonAA,0.015+moonAA,moonD);
 let solarVisible=smoothstep(-0.025,0.01,uniforms.solar.y);
 let lunarVisible=smoothstep(-0.025,0.01,uniforms.lunar.y);
 let sunward=max(0.0,dot(normalize(vec2f(dir.x,dir.z)),normalize(vec2f(uniforms.solar.x,uniforms.solar.z))));
 let opening=pow(sunward,3.5)*exp(-up*2.6)*solarVisible*uniforms.daylight;
 let pathward=max(0.0,-dir.z);
 let clearing=pow(pathward,5.0)*exp(-up*2.0)*uniforms.daylight;
 colour+=vec3f(1.0,0.88,0.50)*opening*0.30;
 colour+=vec3f(1.0,0.94,0.72)*clearing*0.16;
 colour+=vec3f(1.0,0.78,0.42)*(exp(-sunD*6.5)*0.22+exp(-sunD*20.0)*0.11)*solarVisible;
 colour=mix(colour,vec3f(1.0,0.94,0.72),sunDisc*solarVisible);
 let moonMottle=0.87+0.08*sin(dir.x*910.0+dir.z*230.0)*sin(dir.y*670.0-dir.z*320.0);
 colour+=vec3f(0.48,0.60,0.83)*exp(-moonD*45.0)*0.06*lunarVisible;
 colour=mix(colour,vec3f(0.82,0.88,0.91)*moonMottle,moonDisc*lunarVisible);
 let uv=vec2f(atan2(dir.z,dir.x)/6.2831853+0.5+uniforms.starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265);
 let q=uv*vec2f(360.0,180.0);
 let cell=floor(q);
 let seed=fract(sin(dot(cell,vec2f(127.1,311.7)))*43758.5453);
 let offset=vec2f(fract(seed*91.13),fract(seed*173.17))*0.65+0.175;
 let starD=length(fract(q)-offset);
 let aa=max(length(fwidth(q))*0.55,0.025);
 let point=1.0-smoothstep(0.045,0.045+aa,starD);
 colour+=vec3f(0.77,0.84,1.0)*point*step(0.976,seed)*uniforms.stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);
 fragmentOutputs.color=vec4f(colour,1.0);
 }`;function ee(e,t){let n=new a(`day-sky`,e,{vertex:`daySky`,fragment:`daySky`},{attributes:[`position`],uniforms:[`worldViewProjection`,`zenith`,`horizon`,`solar`,`lunar`,`stars`,`starAngle`,`daylight`,`skyDepth`],shaderLanguage:o.WGSL});n.setFloat(`skyDepth`,e.getEngine().useReverseDepthBuffer?1e-6:.999999),n.backFaceCulling=!1,n.disableDepthWrite=!0,n.fogEnabled=!1;let r=s(`day-sky`,{diameter:400,segments:12},e);r.material=n,r.isPickable=!1,r.alwaysSelectAsActiveMesh=!0,r.metadata={environment:!0};let i=new f,c=new f,l=new p,u=new p;function d(e){n.setColor3(`zenith`,i.set(...e.zenith)),n.setColor3(`horizon`,c.set(...e.horizon)),n.setVector3(`solar`,l.set(...e.towardSun)),n.setVector3(`lunar`,u.set(...e.towardMoon)),n.setFloat(`stars`,e.stars),n.setFloat(`starAngle`,e.hours/24),n.setFloat(`daylight`,e.daylight)}return e.onBeforeRenderObservable.add(()=>r.position.copyFrom(t.position)),{update:d,mesh:r}}var U=e=>Math.max(0,Math.min(1,e));function W(e,t,n){let r=Math.imul(e+n,374761393)+Math.imul(t,668265263);return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967295}function G(e,t,n,r){let i=e*n,a=t*n,o=Math.floor(i),s=Math.floor(a),c=i-o,l=a-s,u=c*c*(3-2*c),d=l*l*(3-2*l),f=(e,t)=>W((e%n+n)%n,(t%n+n)%n,r),p=f(o,s),m=f(o+1,s),h=f(o,s+1),g=f(o+1,s+1);return(p+(m-p)*u)*(1-d)+(h+(g-h)*u)*d}function K(e,t,n){return G(e,t,4,n)*.5+G(e,t,8,n+1)*.26+G(e,t,16,n+2)*.14+G(e,t,32,n+3)*.07+G(e,t,64,n+4)*.03}function te(){let e=new Uint8Array(262144);for(let t=0;t<256;t++)for(let n=0;n<256;n++){let r=(t*256+n)*4,i=n/256,a=t/256;e[r]=Math.round(K(i,a,37)*255),e[r+1]=Math.round(G(i,a,16,71)*255),e[r+2]=Math.round(G(i,a,64,93)*255),e[r+3]=255}return e}function ne(){let e=new Uint8Array(262144),t=new Float32Array(65536),n=Array.from({length:9},(e,t)=>({x:.18+W(t,1,51)*.64,y:.18+W(t,2,51)*.64,rx:.06+W(t,3,51)*.12,ry:.05+W(t,4,51)*.11}));for(let e=0;e<90;e++){let n=W(e,1,192)*256,r=W(e,2,192)*256,i=2+W(e,3,192)**3*24;for(let e=Math.max(0,Math.floor(r-i*1.3));e<Math.min(256,r+i*1.3);e++)for(let a=Math.max(0,Math.floor(n-i*1.3));a<Math.min(256,n+i*1.3);a++){let o=Math.hypot(a-n,e-r)/i;t[e*256+a]+=.65*Math.exp(-(((o-1)/.11)**2))-.32*Math.max(0,1-o*o)}}for(let r=0;r<256;r++)for(let i=0;i<256;i++){let a=i/256,o=r/256,s=(r*256+i)*4,c=K(a,o,133),l=(G(a,o,16,173)-.5)*.06,u=0;for(let e of n){let t=((a-e.x+l)/e.rx)**2+((o-e.y+l)/e.ry)**2;u=Math.max(u,1-U((t-.5)*1.4))}let d=t[r*256+Math.min(255,i+1)]-t[Math.max(0,r-1)*256+i],f=U(.7+c*.28-u*.27+d*.25);e[s]=Math.round(f*239),e[s+1]=Math.round(f*246),e[s+2]=Math.round(f*255),e[s+3]=255}return e}d.ShadersStoreWGSL.showcaseSkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`,d.ShadersStoreWGSL.showcaseSkyPixelShader=`
varying skyDirection:vec3f;
uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;
uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;uniform sunset:f32;uniform wind:f32;
var cloudMap:texture_2d<f32>;var cloudMapSampler:sampler;
var moonMap:texture_2d<f32>;var moonMapSampler:sampler;
@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);
 let up=max(dir.y,0.0);
 let sunset=uniforms.sunset;
 let sunD=length(dir-uniforms.solar);
 let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0003);
 let moonAA=max(fwidth(moonD),0.0003);
 let horizonMask=smoothstep(-0.035,0.015,dir.y);
 let sunVisible=smoothstep(-0.085,0.005,uniforms.solar.y)*horizonMask;
 let moonVisible=smoothstep(-0.085,0.005,uniforms.lunar.y)*horizonMask;
 let sunRadius=mix(0.031,0.048,1.0-smoothstep(0.0,0.32,abs(uniforms.solar.y)));
 let moonRadius=mix(0.040,0.052,1.0-smoothstep(0.0,0.30,abs(uniforms.lunar.y)));
 let sunDisc=1.0-smoothstep(sunRadius-sunAA,sunRadius+sunAA,sunD);
 let moonDisc=1.0-smoothstep(moonRadius-moonAA,moonRadius+moonAA,moonD);
 let sunward=pow(max(0.0,dot(dir,uniforms.solar)),4.0);
 let twilight=(1.0-smoothstep(0.0,0.30,abs(uniforms.solar.y)));
 let top=mix(uniforms.zenith,vec3f(0.16,0.12,0.29),sunset*0.60);
 let horizon=mix(uniforms.horizon,vec3f(0.80,0.26,0.19),sunset*0.70);
 var colour=mix(horizon,top,pow(up,0.48));
 // Low amber band, then rose/violet above it. The strongest colours follow the sun.
 colour+=vec3f(0.43,0.12,0.035)*exp(-up*7.0)*sunward*sunset;
 colour=mix(colour,vec3f(0.53,0.20,0.36),exp(-pow((up-0.18)/0.15,2.0))*sunset*(0.12+0.25*sunward));
 colour+=vec3f(0.28,0.12,0.15)*twilight*exp(-up*9.0)*(1.0-uniforms.daylight)*0.3;
 let sunTint=mix(vec3f(1.0,0.91,0.66),vec3f(1.0,0.29,0.09),sunset);
 let halo=exp(-sunD*sunD/0.055)*0.23+exp(-sunD*sunD/0.005)*0.48;
 colour+=sunTint*halo*sunVisible;
 // A white-hot core and compact aureole simulate glare locally, respecting forest occlusion.
 let corona=exp(-max(0.0,sunD-sunRadius)*65.0)*0.48;
 colour+=sunTint*corona*sunVisible;
 let vertical=clamp((dir.y-uniforms.solar.y)/sunRadius*0.5+0.5,0.0,1.0);
 let sunsetDisc=mix(vec3f(1.0,0.16,0.09),vec3f(1.0,0.78,0.32),vertical);
 colour=mix(colour,mix(vec3f(1.65,1.52,1.20),sunsetDisc,sunset*0.92),sunDisc*sunVisible);

 let moonRight=normalize(cross(vec3f(0.0,1.0,0.0),uniforms.lunar));
 let moonUp=cross(uniforms.lunar,moonRight);
 let moonXY=vec2f(dot(dir,moonRight),dot(dir,moonUp))/moonRadius;
 let lunarTex=textureSample(moonMap,moonMapSampler,moonXY*vec2f(0.5,-0.5)+0.5).rgb;
 let relief=sqrt(max(0.0,1.0-dot(moonXY,moonXY)));
 let lunarShading=0.52+0.48*relief;
 colour+=vec3f(0.38,0.52,0.83)*exp(-moonD*moonD/0.014)*0.10*moonVisible;
 colour+=vec3f(0.60,0.72,1.0)*exp(-moonD*moonD/0.0028)*0.12*moonVisible;
 colour=mix(colour,lunarTex*lunarShading*vec3f(0.91,0.97,1.10),moonDisc*moonVisible);

 let starUV=vec2f(atan2(dir.z,dir.x)/6.2831853+0.5+uniforms.starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265);
 let q=starUV*vec2f(360.0,180.0);let cell=floor(q);
 let seed=fract(sin(dot(cell,vec2f(127.1,311.7)))*43758.5453);
 let offset=vec2f(fract(seed*91.13),fract(seed*173.17))*0.65+0.175;
 let starD=length(fract(q)-offset);let aa=max(length(fwidth(q))*0.55,0.025);
 let point=1.0-smoothstep(0.045,0.045+aa,starD);
 colour+=vec3f(0.77,0.84,1.0)*point*step(0.976,seed)*uniforms.stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);

 // Project a high cloud layer onto the dome; mipmaps filter the compressed horizon.
 let cloudUV=dir.xz/(max(dir.y,0.0)+0.18)*0.65+vec2f(uniforms.wind,uniforms.wind*0.37);
 let base=textureSample(cloudMap,cloudMapSampler,cloudUV);
 let detail=textureSample(cloudMap,cloudMapSampler,cloudUV*3.1+vec2f(0.17,-uniforms.wind*0.23));
 let lightOffset=uniforms.solar.xz*0.008;
 let neighbour=textureSample(cloudMap,cloudMapSampler,cloudUV+lightOffset).r;
 let density=base.r*0.83+detail.r*0.17;
 let coverage=smoothstep(0.51,0.65,density)*smoothstep(-0.015,0.09,dir.y);
 let depth=smoothstep(0.52,0.73,density);
 let sculpt=clamp(0.50+(base.r-neighbour)*9.0+detail.g*0.14,0.0,1.0);
 let cloudShade=mix(vec3f(0.055,0.072,0.12),vec3f(0.42,0.52,0.60),uniforms.daylight);
 let cloudLight=mix(vec3f(0.18,0.23,0.34),vec3f(1.0,0.97,0.88),uniforms.daylight);
 let warmShade=mix(cloudShade,vec3f(0.28,0.16,0.30),sunset*0.80);
 let warmLight=mix(cloudLight,vec3f(1.0,0.48,0.24),sunset*(0.45+sunward*0.55));
 var cloudColour=mix(warmShade,warmLight,clamp(sculpt*0.8+(1.0-depth)*0.30,0.0,1.0));
 let silver=pow(max(0.0,1.0-abs(coverage-0.45)*2.0),3.0);
 cloudColour+=sunTint*silver*exp(-sunD*sunD/0.12)*sunVisible*0.50;
 cloudColour+=vec3f(0.22,0.30,0.47)*silver*exp(-moonD*moonD/0.14)*moonVisible*0.30;
 colour=mix(colour,cloudColour,coverage*0.97);
 fragmentOutputs.color=vec4f(colour,1.0);
}`;function re(e,t){let n=new a(`showcase-sky`,e,{vertex:`showcaseSky`,fragment:`showcaseSky`},{attributes:[`position`],uniforms:[`worldViewProjection`,`zenith`,`horizon`,`solar`,`lunar`,`stars`,`starAngle`,`daylight`,`sunset`,`wind`,`skyDepth`],samplers:[`cloudMap`,`moonMap`],shaderLanguage:o.WGSL});n.setFloat(`skyDepth`,e.getEngine().useReverseDepthBuffer?1e-6:.999999),n.backFaceCulling=!1,n.disableDepthWrite=!0,n.fogEnabled=!1;let r=i.CreateRGBATexture(te(),256,256,e,!0,!1,c.TRILINEAR_SAMPLINGMODE);r.name=`procedural-clouds`,r.wrapU=r.wrapV=c.WRAP_ADDRESSMODE;let l=i.CreateRGBATexture(ne(),256,256,e,!0,!1,c.TRILINEAR_SAMPLINGMODE);l.name=`procedural-moon`,l.wrapU=l.wrapV=c.CLAMP_ADDRESSMODE,n.setTexture(`cloudMap`,r),n.setTexture(`moonMap`,l),n.setFloat(`wind`,0);let u=s(`showcase-sky`,{diameter:400,segments:12},e);u.material=n,u.isPickable=!1,u.alwaysSelectAsActiveMesh=!0,u.metadata={environment:!0};let d=new f,m=new f,h=new p,g=new p,_=0;function v(e){n.setColor3(`zenith`,d.set(...e.zenith)),n.setColor3(`horizon`,m.set(...e.horizon)),n.setVector3(`solar`,h.set(...e.towardSun)),n.setVector3(`lunar`,g.set(...e.towardMoon)),n.setFloat(`stars`,e.stars),n.setFloat(`starAngle`,e.hours/24),n.setFloat(`daylight`,e.daylight),n.setFloat(`sunset`,e.sunset)}function y(e){_+=Math.max(0,Math.min(e,.05))*.0014,n.setFloat(`wind`,_)}return e.onBeforeRenderObservable.add(()=>u.position.copyFrom(t.position)),{update:v,animate:y,mesh:u}}async function ie(e,r,i,a,o,s={}){let c=s.sky??(s.pausableSky?`showcase`:`legacy`),l=c===`showcase`?re(e,r):c===`new`?(await n(async()=>{let{createNewSky:e}=await import(`./new-sky-D4OOay4J.js`);return{createNewSky:e}},__vite__mapDeps([0,1,2,3]),import.meta.url)).createNewSky(e,r,s.newSky??{}):null,u=c===`new`?l:null,d=l??ee(e,r),f=e.materials.filter(e=>e instanceof v&&[`grass`,`floor-leaves`,`cover-mid`,`cover-far`].includes(e.name)).map(e=>({material:e,emission:e.emissiveColor.clone()})),p=null,m=null,h=12,_=c!==`legacy`,y=!1,b=NaN,S=x(h),C=!0,w=!0,T=document.createElement(`section`);T.className=`daylight-controls`,T.setAttribute(`aria-label`,`Время суток`),T.innerHTML=`<div class="daylight-heading"><strong>Свет и небо</strong><output id="day-time-value">12:00</output></div>
 <div class="daylight-presets"><button type="button" data-hour="7.5">Утро</button><button type="button" data-hour="12">День</button><button type="button" data-hour="17.5">Закат</button><button type="button" data-hour="0">Ночь</button></div>
 <label for="day-time">Время суток</label><input id="day-time" type="range" min="0" max="24" step="0.05" value="12" aria-valuetext="12:00">
 <label><input id="day-auto" type="checkbox"> Смена суток · 20 минут</label>
 <label><input id="day-rays" type="checkbox"> Художественные лучи</label>
 <label for="fog-density">Туман <output id="fog-density-value">0.011</output></label><input id="fog-density" type="range" min="0" max="0.04" step="0.001" value="0.011">`,document.querySelector(`#diagnostics`).insertBefore(T,document.querySelector(`#metrics`));let D=T.querySelector(`#day-time`),O=T.querySelector(`output`),k=T.querySelector(`#day-auto`),A=T.querySelector(`#day-rays`),j=T.querySelector(`#fog-density`),M=T.querySelector(`#fog-density-value`);o||(A.closest(`label`).hidden=!0);let N=-1/0;function F(e=!1){let t=performance.now();if(!e&&(!document.querySelector(`#diagnostics`).open||t-N<250))return;N=t;let n=Math.round(h*60)%1440,r=`${String(Math.floor(n/60)).padStart(2,`0`)}:${String(n%60).padStart(2,`0`)}`;O.value=r,D.value=String(h),D.setAttribute(`aria-valuetext`,r);for(let e of T.querySelectorAll(`button[data-hour]`))e.setAttribute(`aria-pressed`,String(Math.abs(Number(e.dataset.hour)-h)<.03))}function I(){if(C&&h!==b){b=h,S=x(h),i.direction.set(...S.direction),i.intensity=S.mainIntensity,i.diffuse.set(...S.mainColor),a.intensity=S.fillIntensity,a.diffuse.set(...S.fillColor),a.groundColor.set(.2,.26,.2),a.groundColor.scaleInPlace(.35+.65*S.daylight),e.fogColor.set(...S.fogColor),e.clearColor=new g(...S.horizon,1);for(let{material:e,emission:t}of f)t.scaleToRef(S.emissionScale,e.emissiveColor);C=!1}w&&(w=!1,d.update(S),F())}function L(e){p||(h=P(e),_=!1,k.checked=!1,C=!0,I(),F(!0))}function R(e){p||(_=e,k.checked=e)}function z(e){if(!!e!=!!p){e?(m={hours:h,automatic:_},k.checked=!0):m&&=(h=m.hours,_=m.automatic,k.checked=_,null),D.disabled=k.disabled=!!e;for(let t of T.querySelectorAll(`button[data-hour]`))t.disabled=!!e;T.title=e?`Время задаётся постоянной комнатой`:``}p=e}function B(e){y=!!e,A.checked=y,o?.setRays(y)}function V(t){let n=Math.max(0,Math.min(.04,t));e.fogDensity=n,j.value=n.toFixed(3),M.value=n.toFixed(3)}for(let e of T.querySelectorAll(`button[data-hour]`))e.onclick=()=>L(Number(e.dataset.hour));D.oninput=()=>L(Number(D.value)),k.onchange=()=>R(k.checked),A.onchange=()=>B(A.checked),j.oninput=()=>V(Number(j.value));function H(e){let n=h;p?h=t(p):_&&e>0&&(h=P(h+Math.min(e,.05)*24/E)),h!==n&&(C=!0),u?.step(e)&&(w=!0),I()}let U=document.querySelector(`#diagnostics`),W=()=>{U.open&&F(!0)};U.addEventListener(`toggle`,W),e.onDisposeObservable.add(()=>{T.remove(),U.removeEventListener(`toggle`,W)}),V(e.fogDensity),k.checked=_,I(),F(!0);function G(e){u&&(u.configure(e),w=!0,F(!0))}function K(e,t){u?.setCloudWind(e,t)}return{update:H,setClock:z,setTime:L,setAutomatic:R,setRays:B,setFog:V,hour:()=>h,setSkyAppearance:G,setCloudWind:K,settings:()=>u?.settings()??null,sky:()=>u?.stats()??null,skyDiagnostics:()=>u?.diagnostics()??null,stats:()=>({...S,automatic:p?!0:_,sharedClock:!!p,rays:y,fogDensity:e.fogDensity,cycleSeconds:E,shadowMaps:1,skyDraws:1,skyMode:c})}}var q=class extends h{start;end;wind;feet={x:0,y:0,z:0};setRange(e,t){this.start=e,this.end=t}constructor(e,t,n,r=!1){super(e,`CoverFade`,220,{COVER_FADE:!0},!0,!1),this.start=t,this.end=n,this.wind=r,this._enable(!0)}isCompatible(e){return e===o.WGSL}getUniforms(){return{ubo:[{name:`coverFeet`,size:3,type:`vec3`},{name:`coverRange`,size:2,type:`vec2`}]}}bindForSubMesh(e){e.updateFloat3(`coverFeet`,this.feet.x,this.feet.y,this.feet.z),e.updateFloat2(`coverRange`,this.start,this.end)}getCustomCode(e){return e===`fragment`?{CUSTOM_FRAGMENT_DEFINITIONS:this.wind?`varying vWindRestW: vec3f;`:``,CUSTOM_FRAGMENT_MAIN_BEGIN:`
   let coverDistance=distance(${this.wind?`fragmentInputs.vWindRestW`:`fragmentInputs.vPositionW`}.xz,uniforms.coverFeet.xz);
   if(coverDistance>uniforms.coverRange.x){
    let cover=1.0-smoothstep(uniforms.coverRange.x,uniforms.coverRange.y,coverDistance);
    let noise=fract(52.9829189*fract(dot(floor(fragmentInputs.position.xy),vec2f(0.06711056,0.00583715))));
    if(noise>=cover){discard;}
   }
  `}:null}},ae=`
fn forestWindField(root: vec2f, phases: vec3f, weather: vec4f) -> vec2f {
 let p=root*weather.w;
 let field=0.5+0.22*sin(dot(p,vec2f(0.115,0.073))-phases.x)
  +0.17*sin(dot(p,vec2f(0.047,-0.151))-phases.y)
  +0.11*sin(dot(p,vec2f(-0.181,0.031))-phases.z);
 let gust=weather.y*(0.25+0.75*field);
 return vec2f(min(1.0,weather.x*(0.78+0.22*field)+gust),min(1.0,gust));
}`,oe=`
let windRoot=finalWorld[3].xz;
let windField=forestWindField(windRoot,uniforms.windPhases.xyz,uniforms.windWeather);
let windHeight=max(0.1,uniforms.windPlant.x);
let windT=clamp((positionUpdated.y/windHeight-0.18)/0.82,0.0,1.0);
let windWeight=windT*windT*(3.0-2.0*windT);
let windPhase=dot(windRoot,vec2f(0.31,0.17));
let windSway=1.0+0.18*sin(uniforms.windMotion.x+windPhase);
let windAmount=windHeight*length(finalWorld[1].xyz)*min(0.35,0.04*uniforms.windPlant.y*windField.x*uniforms.windWeather.z*uniforms.windResponse.x*windSway);
let windDelta=vec3f(uniforms.windDirection.x,0.0,uniforms.windDirection.y)*windAmount;
worldPos=vec4f(worldPos.xyz+windDelta*windWeight,worldPos.w);
#ifdef NORMAL
// Inverse-transpose of the bend Jacobian, including tilted/nonuniform instances.
let windGradient=finalWorld[1].xyz/dot(finalWorld[1].xyz,finalWorld[1].xyz)*(6.0*windT*(1.0-windT)/(windHeight*0.82));
vertexOutputs.vNormalW=normalize(vertexOutputs.vNormalW-windGradient*dot(windDelta,vertexOutputs.vNormalW)/(1.0+dot(windGradient,windDelta)));
#endif
`,se=`
let windRoot=vertexInputs.plantWind.xy;
let windField=forestWindField(windRoot,uniforms.windPhases.xyz,uniforms.windWeather);
let windT=vertexInputs.plantWind.z;
var windSway=1.0;
#ifdef WIND_DETAIL
let windDistance=distance(windRoot,uniforms.windEye.xz);
if(windDistance<48.0){
 windSway+=0.24*sin(uniforms.windMotion.y+vertexInputs.plantWind.w)*(1.0-smoothstep(12.0,48.0,windDistance));
}
#endif
worldPos=vec4f(worldPos.xyz+vec3f(uniforms.windDirection.x,0.0,uniforms.windDirection.y)*min(0.25,uniforms.windPlant.x*windField.x*uniforms.windWeather.z*uniforms.windResponse.y*windSway)*windT*windT,worldPos.w);
`,J=class extends h{wind;kind;unsubscribe;constructor(e,t,n){super(e,`VegetationWind`,200,{VEGETATION_WIND:!0,WIND_DETAIL:!0},!0,!1),this.wind=t,this.kind=n,this.registerForExtraEvents=!0,this._enable(!0);let r=t.enabled,i=t.detail;this.unsubscribe=t.onChange(()=>{(r!==t.enabled||i!==t.detail)&&(r=t.enabled,i=t.detail,this.markAllDefinesAsDirty())})}isCompatible(e){return e===o.WGSL}prepareDefines(e){this.kind===`tree`&&(e.NORMAL=!0),Object.assign(e,{VEGETATION_WIND:this.wind.enabled,WIND_DETAIL:this.wind.detail&&this.kind!==`far`})}getAttributes(e){this.kind===`tree`?e.includes(`normal`)||e.push(`normal`):e.push(`plantWind`)}getUniforms(){return{ubo:[{name:`windDirection`,size:2,type:`vec2`},{name:`windWeather`,size:4,type:`vec4`},{name:`windPhases`,size:3,type:`vec3`},{name:`windMotion`,size:2,type:`vec2`},{name:`windPlant`,size:2,type:`vec2`},{name:`windResponse`,size:2,type:`vec2`},{name:`windEye`,size:3,type:`vec3`}]}}hardBindForSubMesh(e,t,n,r){let i=this.wind,a=i.snapshot,o=r.getRenderingMesh().metadata?.windTree??[20,1];e.updateFloat2(`windDirection`,...a.directionToXZ),e.updateFloat4(`windWeather`,a.base,a.gust,i.intensity,a.scale),e.updateFloat3(`windPhases`,...a.fieldPhases),e.updateFloat2(`windMotion`,...a.motionPhases),e.updateFloat2(`windPlant`,this.kind===`tree`?o[0]:this.kind===`grass`?.16:.1,o[1]),e.updateFloat2(`windResponse`,i.canopyBend,i.coverBend),e.updateFloat3(`windEye`,i.eye.x,i.eye.y,i.eye.z)}getCustomCode(e){if(e!==`vertex`)return null;let t=this.kind!==`tree`;return{CUSTOM_VERTEX_DEFINITIONS:`${t?`attribute plantWind: vec4f;
varying vWindRestW: vec3f;`:``}\n#ifdef VEGETATION_WIND\n${ae}\n#endif`,CUSTOM_VERTEX_UPDATE_WORLDPOS:`${t?`vertexOutputs.vWindRestW=worldPos.xyz;`:``}\n#ifdef VEGETATION_WIND\n${t?se:oe}\n#endif`}}dispose(){this.unsubscribe()}};function Y(e,t){let n=e.getBoundingInfo().boundingBox,r=new p(t,t,t);e.setBoundingInfo(new u(n.minimum.subtract(r),n.maximum.add(r),e.getWorldMatrix()))}var ce=``+new URL(`oak-w_2_uIGn.webp`,import.meta.url).href,le=``+new URL(`fork-ioT3M-8c.webp`,import.meta.url).href,ue=``+new URL(`young-DTobysOV.webp`,import.meta.url).href,de=``+new URL(`rock-b77blQl4.webp`,import.meta.url).href,fe=``+new URL(`log-BQllRk90.webp`,import.meta.url).href,pe=``+new URL(`stump-BKfljwJX.webp`,import.meta.url).href,me=``+new URL(`slab-CtnC1Qgw.webp`,import.meta.url).href,he=``+new URL(`soil-2oGSipZq.webp`,import.meta.url).href,ge=``+new URL(`foliage-DzpXYesx.webp`,import.meta.url).href,_e=new Map([[r,ce],[A,le],[T,ue],[w,de],[N,fe],[D,pe],[C,me],[M,he],[O,ge]]);function X(t){return e?_e.get(t)??t:t}function ve(e,t,n,r){let i=new v(`cover-far`,e),a=new v(`cover-mid`,e);for(let e of[i,a])e.diffuseColor=f.White(),e.specularColor=f.Black(),e.emissiveColor=new f(.045,.075,.025),e.backFaceCulling=!1,e.twoSidedLighting=!0,e.diffuseTexture=n,e.useAlphaFromDiffuseTexture=!0,e.transparencyMode=l.MATERIAL_ALPHATEST,e.alphaCutOff=.45;r&&(new J(a,r,`fern`),new J(i,r,`far`));let o=new q(a,j.midStart,j.midEnd,!!r),s=[],c=new Map,u=1,d=new Worker(new URL(``+new URL(`floor.worker-BHzNE8Ye.js`,import.meta.url).href,``+import.meta.url),{type:`module`});d.postMessage({type:`init`,boxes:t});let p=null,h=null,g=``,y=0;d.onmessage=({data:e})=>{e.error?g=e.error:(h=e,y=Math.max(y,e.buildMs))},d.onerror=e=>{g=e.message||`Не удалось подготовить лесной покров`},e.onDisposeObservable.add(()=>d.terminate());let b=[],x=[],S=``,C=0,w=0;for(let e=I.minN/64;e<I.maxN/64;e++)for(let t=I.minE/64;t<I.maxE/64;t++)b.push({x:t,z:e,key:`${t}:${e}`});function T(t,n){let{layer:o}=t,s=performance.now(),c=new m(`cover-${o}-${t.key}`,e),l=new _;return Object.assign(l,n),l.applyToMesh(c),r&&(c.setVerticesData(`plantWind`,n.wind,!1,4),Y(c,.25)),c.material=o===`far`?i:a,c.isPickable=!1,c.receiveShadows=!0,c.freezeWorldMatrix(),c.metadata={x:t.x,z:t.z,layer:o},C=performance.now()-s,w=Math.max(w,C),c}let E=(e,t,n)=>Math.hypot(Math.max(e.x*n-t.x,0,t.x-(e.x+1)*n),Math.max(e.z*n+t.z,0,-t.z-(e.z+1)*n)),D=e=>S!==``&&!x.some(t=>E(t,e,32)<64)&&!b.some(t=>E(t,e,64)<128)&&(!p||E(p,e,p.layer===`far`?64:32)>=(p.layer===`far`?128:64));function O(e,t=new V){if(g)throw Error(g);o.feet=e;let n=Math.floor(e.x/32),r=Math.floor(-e.z/32),i=`${n}:${r}`;if(C=0,i!==S){S=i,x=[];let t=new Set;for(let e=r-j.midRadius;e<=r+j.midRadius;e++)for(let r=n-j.midRadius;r<=n+j.midRadius;r++){if(r*32<I.minE||r*32>=I.maxE||e*32<I.minN||e*32>=I.maxN)continue;let n=`${r}:${e}`;t.add(n),!c.has(n)&&(p?.layer!==`mid`||p.key!==n)&&x.push({x:r,z:e,key:n})}x.sort((t,n)=>E(t,e,32)-E(n,e,32)),b.sort((t,n)=>E(t,e,64)-E(n,e,64));for(let[e,n]of c)t.has(e)||(n.dispose(),c.delete(e))}h&&t.run(()=>{let{job:e,geometry:t}=h;h=null,p=null,e.layer===`far`?s.push(T(e,t)):Math.abs(e.x-n)<=j.midRadius&&Math.abs(e.z-r)<=j.midRadius&&c.set(e.key,T(e,t))}),!p&&(x.length||b.length)&&(p=b.length&&E(b[0],e,64)<128&&(!x.length||E(x[0],e,32)>=64)||!x.length?{...b.shift(),layer:`far`}:{...x.shift(),layer:`mid`},d.postMessage(p));for(let t of c.values()){let{x:n,z:r}=t.metadata,i=Math.hypot(Math.max(n*32-1-e.x,0,e.x-(n*32+33)),Math.max(r*32-1+e.z,0,-e.z-(r*32+33)));t.setEnabled(i<j.midEnd*u)}}return{update:O,localReady:D,setDetail:e=>{u=e,o.setRange(j.midStart*e,j.midEnd*e)},hasPending:()=>x.length+b.length+Number(!!p)>0,stats:()=>({farTiles:s.length,farPending:b.length+Number(p?.layer===`far`),midTiles:c.size,midPending:x.length+Number(p?.layer===`mid`),lastBuildMs:C,maxBuildMs:w,workerMaxBuildMs:y,triangles:[...s,...c.values()].reduce((e,t)=>e+t.getTotalIndices()/3,0),fullField:!0})}}var Z=()=>({positions:[],indices:[],colors:[],uvs:[],heights:[],wind:[]});function Q(e,t,n,r){return Math.hypot(Math.max(n*8-1-e,0,e-((n+1)*8+1)),Math.max(r*8-1-t,0,t-((r+1)*8+1)))}function ye(t,n,r,i=L,a=e,o){let s=Z(),c=Z(),l=b(y(`m1-floor-art-v1`,t,n)),u=r.filter(e=>e.max.x>=t*8-1&&e.min.x<=(t+1)*8+1&&e.max.z>=-(n+1)*8-1&&e.min.z<=-n*8+1);function d(t,n,r){return(o?!o(t,n,r):t<I.minE||t>I.maxE||n<I.minN||n>I.maxN||(e?k(t,n,F(n))<.2+r:Math.abs(t-F(n))<1.7+r))||u.some(e=>t>e.min.x-r&&t<e.max.x+r&&-n>e.min.z-r&&-n<e.max.z+r)?!1:Math.hypot(i(t+.25,n)-i(t-.25,n),i(t,n+.25)-i(t,n-.25))*2<.85}function f(e,t,n,r,a,o,s){e.positions.push(t,n,r),e.uvs.push(a,o),e.colors.push(...s,1),e.heights.push(Math.max(0,n-i(t,-r)+.06))}for(let r=0;r<(a?205:65);r++){let o=t*8+(a&&!e?(r%20+l())*.4:l()*8),c=n*8+(a&&!e?(Math.floor(r/20)+l())*.4:l()*8),u=(e?S(o,c):null)?.moss??.5+.25*Math.sin(o*.35+c*.21)+.25*Math.sin(o*.71-c*.28);if(!d(o,c,.15)||l()>(e?.15+u*.7:a?.42+u*.53:u*.8))continue;let p=(a?.2:.13)+l()*(a?.27:.22),m=l(),h=m<.34?[.26,.5,.43]:m<.68?[.36,.54,.3]:[.24,.45,.4];for(let t=0;t<(a?3:4);t++){let t=l()*Math.PI*2,n=Math.cos(t),r=Math.sin(t),u=(a?.03:.017)+l()*(a?.02:.014),d=o+(l()-.5)*.15,m=-c+(l()-.5)*.15,g=i(d,-m)-.025,_=s.positions.length/3;for(let[t,i]of[[0,-1],[0,1],[.6,-1],[.6,1],[1,0]]){let a=u*(1-t*.7),o=t*t*p*.45;e&&s.wind.push(d,m,t,d*.31+m*.17),f(s,d+n*o-r*a*i,g+t*p,m+r*o+n*a*i,0,0,[h[0]+t*.13,h[1]+t*.16,h[2]+t*.1])}s.indices.push(_,_+1,_+2,_+1,_+3,_+2,_+2,_+3,_+4)}}for(let r=0;r<(a?126:14);r++){let o=t*8+l()*8,s=n*8+l()*8,u=(e?S(o,s):null)?.moss??.5+.25*Math.sin(o*.35+s*.21)+.25*Math.sin(o*.71-s*.28);if(!d(o,s,.6)||l()>(e?.1+u*.65:a?.3+u*.68:u))continue;let p=a?l()<.72:r<5,m=(p?a?.66:.62:.35)+l()*(p?a?.26:.28:.2),h=p?7:5,g=l()*Math.PI*2,_=+!p+(l()>.5?2:0),v=_%2==0?.25:.75,y=_<2?.505:.005,b=.84+l()*.24,x=l(),C=x<.34?[.76*b,1*b,.9*b]:x<.68?[.94*b,1.04*b,.74*b]:[.72*b,.97*b,.92*b];for(let t=0;t<h;t++){let n=g+t*Math.PI*2/h,r=Math.cos(n),a=Math.sin(n),u=m*(.75+l()*.25),d=c.positions.length/3;for(let t=0;t<=4;t++){let n=t/4,l=[.035,.34,.29,.18,.015][t],m=i(o,s)+Math.sin(n*Math.PI*.8)*u*(p?.65:.8)-.025;for(let t of[-1,1]){let d=o+r*n*u-a*l*u*.85*t,p=-s+a*n*u+r*l*u*.85*t;e&&c.wind.push(o,-s,n,o*.31-s*.17),f(c,d,Math.max(m,i(d,-p)+.015),p,v+t*l*.5,y+.49*n,C)}if(t<4){let e=d+t*2;c.indices.push(e,e+1,e+2,e+1,e+3,e+2)}}}}for(let e of[s,c])for(let t=0;t<e.indices.length;t+=3)[e.indices[t+1],e.indices[t+2]]=[e.indices[t+2],e.indices[t+1]];return{grass:s,leaves:c}}var $=class extends h{feet={x:0,y:0,z:0};constructor(e){super(e,`GrassDistance`,220,{GRASS_DISTANCE:!0},!0,!1),this._enable(!0)}isCompatible(e){return e===o.WGSL}getAttributes(e){e.push(`bladeHeight`)}getUniforms(){return{ubo:[{name:`grassFeet`,size:3,type:`vec3`}]}}bindForSubMesh(e){e.updateFloat3(`grassFeet`,this.feet.x,this.feet.y,this.feet.z)}getCustomCode(e){return e===`vertex`?{CUSTOM_VERTEX_DEFINITIONS:`attribute bladeHeight: f32;`,CUSTOM_VERTEX_UPDATE_POSITION:`positionUpdated.y -= vertexInputs.bladeHeight * smoothstep(14.0,21.0,distance(positionUpdated.xz,uniforms.grassFeet.xz));`}:null}};function be(e){let t=new c(X(M),e);return t.wrapU=c.MIRROR_ADDRESSMODE,t.wrapV=c.MIRROR_ADDRESSMODE,t.anisotropicFilteringLevel=4,t}function xe(t,n,r){n=n.map(e=>({id:e.id,min:{x:e.min.x,y:e.min.y,z:e.min.z},max:{x:e.max.x,y:e.max.y,z:e.max.z}}));let i=new v(`grass`,t),a=new v(`floor-leaves`,t);for(let e of[i,a])e.diffuseColor=f.White(),e.specularColor=f.Black(),e.backFaceCulling=!1,e.twoSidedLighting=!0;e&&(a.emissiveColor=new f(.12,.17,.065),i.emissiveColor=new f(.045,.075,.025)),a.diffuseTexture=new c(X(O),t),a.diffuseTexture.hasAlpha=!0,a.useAlphaFromDiffuseTexture=!0,a.transparencyMode=l.MATERIAL_ALPHATEST,a.alphaCutOff=.45,a.diffuseTexture.wrapU=c.CLAMP_ADDRESSMODE,a.diffuseTexture.wrapV=c.CLAMP_ADDRESSMODE,r&&(new J(i,r,`grass`),new J(a,r,`fern`));let o=e?[new q(i,j.nearStart,j.nearEnd,!!r),new q(a,j.nearStart,j.nearEnd,!!r)]:[new $(i),new $(a)],s=e?ve(t,n,a.diffuseTexture,r):null,u=e?j.nearRadius:3,d=e?j.nearEnd:21,p=0,h=0,g=0,y={x:0,y:0,z:0},b=new Map,x=1/0,S=1/0,C=[];function w(n,i,a){if(!n.indices.length)return[];let o=`normals`in n?n.normals:[];if(!(`normals`in n)){_.ComputeNormals(n.positions,n.indices,o);for(let e=0;e<o.length;e+=3){o[e+1]=Math.max(.65,Math.abs(o[e+1]));let t=Math.hypot(o[e],o[e+1],o[e+2]);for(let n=0;n<3;n++)o[e+n]/=t}}let s=new _;Object.assign(s,{positions:n.positions,indices:n.indices,colors:n.colors,uvs:n.uvs,normals:o});let c=new m(i,t);return s.applyToMesh(c),r&&(c.setVerticesData(`plantWind`,n.wind,!1,4),Y(c,.35)),e||c.setVerticesData(`bladeHeight`,n.heights,!1,1),c.material=a,c.isPickable=!1,c.receiveShadows=!0,c.freezeWorldMatrix(),[c]}let T=e?new Worker(new URL(``+new URL(`floor.worker-BHzNE8Ye.js`,import.meta.url).href,``+import.meta.url),{type:`module`}):null,E=null,D=null,k=``,A=0;T&&(T.postMessage({type:`init`,boxes:n}),T.onmessage=({data:e})=>{E=null,e.error?k=e.error:(D=e,A=Math.max(A,e.buildMs))},T.onerror=e=>{k=e.message||`Не удалось подготовить растительность`},t.onDisposeObservable.add(()=>T.terminate()));let M=()=>[...C,...E?[E]:[],...D?[D.job]:[]];function N(e,t){if(Math.abs(e.x-x)>u||Math.abs(e.z-S)>u)return;let n=performance.now();b.set(e.key,{x:e.x,z:e.z,meshes:[...w(t.grass,`grass-`+e.key,i),...w(t.leaves,`leaves-`+e.key,a)]}),p=performance.now()-n,h=Math.max(h,p)}function P(e,t=new V){if(k)throw Error(k);y=e;for(let t of o)t.feet=e;let r=Math.floor(e.x/8),i=Math.floor(-e.z/8);if(r!==x||i!==S){x=r,S=i;let e=new Set;C=[];for(let t=i-u;t<=i+u;t++)for(let n=r-u;n<=r+u;n++){let r=`${n}:${t}`;e.add(r),!b.has(r)&&r!==E?.key&&r!==D?.job.key&&C.push({x:n,z:t,key:r})}C.sort((e,t)=>Math.hypot(e.x-r,e.z-i)-Math.hypot(t.x-r,t.z-i));for(let[t,n]of b)if(!e.has(t)){for(let e of n.meshes)e.dispose();b.delete(t)}}if(p=0,D&&t.run(()=>{N(D.job,D.data),D=null}),!E&&!D){let e=C.shift();e&&(T?(E=e,T.postMessage(e)):N(e,ye(e.x,e.z,n)))}s?.update(e,t);for(let t of b.values()){let n=Q(e.x,-e.z,t.x,t.z)<d;for(let e of t.meshes)e.setEnabled(n)}}async function F(e,t){await B(()=>Number.isFinite(x)&&!M().some(t=>Q(e.x,-e.z,t.x,t.z)<d)&&(s?.localReady(e)??!0),()=>{P(e,new V(4,2));let n=s?.stats();t(b.size+(n?.farTiles??0)+(n?.midTiles??0))}),g=h,h=0}return{update:P,prepare:F,setDetail:e=>{d=j.nearEnd*e;for(let t of o)t instanceof q&&t.setRange(j.nearStart*e,d);s?.setDetail(e)},stats:()=>({cells:b.size,pending:M().length,pendingNear:M().filter(e=>Q(y.x,-y.z,e.x,e.z)<j.nearStart).length,cacheLimit:(u*2+1)**2,hideM:d,lastBuildMs:p,maxBuildMs:h,workerMaxBuildMs:A,preparationMaxBuildMs:g,field:s?.stats()??null,triangles:[...b.values()].reduce((e,t)=>e+t.meshes.reduce((e,t)=>e+t.getTotalIndices()/3,0),0)})}}var Se=class extends h{sun;constructor(e,t){super(e,`LeafTransmission`,230,{},!0,!1),this.sun=t,this._enable(!0)}isCompatible(e){return e===o.WGSL}getUniforms(){return{ubo:[{name:`leafSunDirection`,size:3,type:`vec3`},{name:`leafSunColor`,size:3,type:`vec3`}]}}bindForSubMesh(e){let t=this.sun.direction.normalizeToNew(),n=this.sun.diffuse;e.updateFloat3(`leafSunDirection`,-t.x,-t.y,-t.z),e.updateFloat3(`leafSunColor`,n.r*this.sun.intensity,n.g*this.sun.intensity,n.b*this.sun.intensity)}getCustomCode(e){return e===`fragment`?{CUSTOM_FRAGMENT_BEFORE_FOG:`
   let foliage=smoothstep(0.025,0.11,baseColor.g-baseColor.r);
   let forwardScatter=pow(max(0.0,dot(-viewDirectionW,uniforms.leafSunDirection)),5.0);
   let thinEdge=pow(1.0-abs(dot(normalW,viewDirectionW)),1.5);
   let backlit=0.25+0.75*max(0.0,dot(-normalW,uniforms.leafSunDirection));
   let transmitted=foliage*forwardScatter*backlit*(0.12+0.55*thinEdge);
   color=vec4f(color.rgb+vec3f(0.68,0.86,0.24)*uniforms.leafSunColor*transmitted,color.a);
  `}:null}},Ce=class extends h{constructor(e){super(e,`LodDither`,200,{LOD_DITHER:!1},!0,!1),this.registerForExtraEvents=!0,this._enable(!0)}prepareDefines(e,t,n){e.LOD_DITHER=n.name.endsWith(`-fade`)}isCompatible(e){return e===o.WGSL}getUniforms(){return{ubo:[{name:`lodCoverage`,size:2,type:`vec2`}]}}hardBindForSubMesh(e,t,n,r){let i=r.getRenderingMesh().metadata?.lodCoverage??[0,1];e.updateFloat2(`lodCoverage`,i[0],i[1])}getCustomCode(e){return e===`fragment`?{CUSTOM_FRAGMENT_MAIN_BEGIN:`
   #ifdef LOD_DITHER
   let lodPixel = floor(fragmentInputs.position.xy);
   let lodNoise = fract(52.9829189 * fract(dot(lodPixel, vec2f(0.06711056, 0.00583715))));
   if (lodNoise < uniforms.lodCoverage.x || lodNoise >= uniforms.lodCoverage.y) { discard; }
   #endif
  `}:null}};export{X as a,q as c,R as d,H as f,be as i,ie as l,Se as n,J as o,B as p,xe as r,Y as s,Ce as t,V as u};