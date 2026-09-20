import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateSource, polygonArea, lineLength, distance, previewHeight, findRoute } from './authoring-core.mjs';
import { terrainReview } from './terrain-review.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
// --out is for isolated reproducibility tests; only these fixed filenames are written.
if (process.argv.length > 2 && (process.argv[2] !== '--out' || process.argv.length !== 4)) throw Error('Usage: node tools/regions/build-brandywine-preview.mjs [--out directory]');
const output = process.argv[3] && resolve(process.argv[3]);
const dataDir = output ? resolve(output, 'data') : resolve(root, 'content/regions/brandywine-bridge/generated');
const mapDir = output ? resolve(output, 'maps') : resolve(root, 'public/regions/brandywine-bridge/preview');
const sourcePath = 'content/regions/brandywine-bridge/region-source.json';
const g = JSON.parse(readFileSync(resolve(root, sourcePath), 'utf8'));
const report = validateSource(g);
if (!report.ok) throw new Error(report.errors.join('\n'));
for (const dir of [mapDir, dataDir]) mkdirSync(dir, { recursive: true });
const write = (name, value) => writeFileSync(resolve(name.startsWith('maps/') ? mapDir : dataDir, name.slice(5)), value);
const json = (name, value) => write(name, JSON.stringify(value, null, 2) + '\n');
const hash = data => createHash('sha256').update(data).digest('hex');
json('data/build-inputs.json', Object.fromEntries([sourcePath, 'tools/regions/authoring-core.mjs', 'tools/regions/terrain-review.mjs', 'tools/regions/build-brandywine-preview.mjs'].map(p => [p, hash(readFileSync(resolve(root, p)))])));
const review = terrainReview(g);
json('data/terrain-review.json', review);
const b = g.playBounds, step = g.storage.previewStepM;
const cols = (b.maxE-b.minE)/step+1, rows = (b.maxN-b.minN)/step+1;
const heights = new Float32Array(cols*rows), raw = Buffer.alloc(cols*rows*4);
let min = Infinity, max = -Infinity;
for (let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
  const k=y*cols+x, h=previewHeight(g,b.minE+x*step,b.minN+y*step); heights[k]=h; raw.writeFloatLE(h,k*4); min=Math.min(min,h); max=Math.max(max,h);
}
write('data/terrain-preview.f32le',raw);
json('data/terrain-preview.meta.json',{status:'DESIGN_PREVIEW_NOT_PRODUCTION_COLLISION',dtype:'float32',endianness:'little',order:'row-major; SOUTH-first; E increases fastest',originEN:[b.minE,b.minN],stepM:step,columns:cols,rows,extent:g.playBounds,minHeightM:min,maxHeightM:max,datum:'arbitrary local vertical datum; water at bridge = 0m',containsBridgeDecks:false,containsFinalRoadGrading:false,sha256:hash(raw),generator:'tools/regions/authoring-core.mjs::previewHeight'});
json('data/topology-derived.json',{regionId:g.regionId,schemaVersion:'brandywine-topology-0.1',source:'region-source.json',nodes:g.topology.nodes,crossings:g.topology.crossings,edges:g.topology.edges.map(e=>({...e,lengthM:Number(lineLength(e.points).toFixed(3))}))});
const samples=[['INN','NORTH_GATE'],['INN','ROAD_LOOKOUT'],['INN','RANGER_SHELTER'],['INN','UPPER_LANDING_W'],['INN','BUCKLAND_ORCHARD']].filter(([,id])=>g.topology.nodes.some(n=>n.id===id)).map(([a,z])=>{const r=findRoute(g,a,z,{boats:false});return{from:a,to:z,lengthM:Math.round(r.length),walkingMinutes:Number((r.seconds/60).toFixed(1)),note:'graph path, level-ground speed, no stops or 3D slope cost',edges:r.edges};});
json('data/validation-report.json',{...report,storage:{...report.storage,tiles:undefined},forests:g.forests.map(f=>({id:f.id,areaKm2:polygonArea(f.polygon)/1e6})),preview:{columns:cols,rows,bytes:raw.length,min,max},routeExamples:samples,limitations:['Analytical validation of authoring data, not engine runtime.','Axis intersections checked; all bank widths, slopes, structures, LOS and local collision require greybox tests.','Graph paths do not prohibit off-path walking.','No full-atlas registration and no production height tiles.']});
const esc = s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const X=e=>64+(e-b.minE)*.23, Y=n=>128+(b.maxN-n)*.23;
const points=a=>a.map(p=>`${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ');
const poly=(p,attrs)=>`<polyline points="${points(p)}" ${attrs}/>`;
const text=(x,y,s,attrs='')=>`<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
const palette=(h)=>{const t=Math.max(0,Math.min(1,h/55)),a=[237,240,219],c=[184,164,123];return '#'+a.map((v,i)=>Math.round(v+(c[i]-v)*t).toString(16).padStart(2,'0')).join('');};
let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1530 1190" role="img" aria-label="Проект региона у Брендивинского моста"><defs><clipPath id="mapclip"><rect x="64" y="128" width="920" height="920"/></clipPath><pattern id="forestfill" width="17" height="17" patternUnits="userSpaceOnUse"><rect width="17" height="17" fill="#91ad80"/><path d="M3 10l3-6 3 6z M11 16l2-4 2 4z" fill="#68865f" opacity=".45"/></pattern></defs><style>text{font-family:Arial,DejaVu Sans,sans-serif;fill:#243735} .halo{paint-order:stroke;stroke:#f6f7ed;stroke-width:4;stroke-linejoin:round} .edge{fill:none;stroke-linejoin:round;stroke-linecap:round}</style><rect width="1530" height="1190" fill="#fafbf7"/>`;
s+=text(64,55,'БРЕНДИВИНСКИЙ МОСТ', 'font-size="32" font-weight="700"');
s+=text(64,88,'План региона · 4 × 4 км · метры EN · рельеф 0.1.1', 'font-size="19"');
s+=text(1020,51,'КАРТА ДЛЯ РАЗРАБОТКИ', 'font-size="18" font-weight="700"');
s+=text(1020,80,'Не реконструкция карты Толкина.', 'font-size="17"');
s+=`<g clip-path="url(#mapclip)"><rect x="64" y="128" width="920" height="920" fill="#e9ecd8"/><g id="layer-relief">`;
function reliefSvg(heights){let out='';
for(let y=0;y<rows-1;y+=2)for(let x=0;x<cols-1;x+=2){const h=heights[y*cols+x];out+=`<rect x="${X(b.minE+x*step).toFixed(2)}" y="${Y(b.minN+(y+2)*step).toFixed(2)}" width="7.5" height="7.5" fill="${palette(h)}"/>`;}
// Marching-squares contour segments for a design preview only.
out+='<g fill="none" stroke="#917e5a" stroke-width=".65" opacity=".45">';
for(let level=5;level<=50;level+=5){let d='';for(let y=0;y<rows-2;y+=2)for(let x=0;x<cols-2;x+=2){const p=[[x,y],[x+2,y],[x+2,y+2],[x,y+2]],hits=[];for(let i=0;i<4;i++){const a=p[i],z=p[(i+1)%4],v=heights[a[1]*cols+a[0]],w=heights[z[1]*cols+z[0]];if((v<level)!==(w<level)){const t=(level-v)/(w-v);hits.push([X(b.minE+(a[0]+(z[0]-a[0])*t)*step),Y(b.minN+(a[1]+(z[1]-a[1])*t)*step)]);}}for(let i=0;i+1<hits.length;i+=2)d+=`M${hits[i][0].toFixed(1)},${hits[i][1].toFixed(1)}L${hits[i+1][0].toFixed(1)},${hits[i+1][1].toFixed(1)}`;}out+=`<path d="${d}"/>`;}

return out+'</g>'; }
const baseline = new Float32Array(cols*rows);
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)baseline[y*cols+x]=previewHeight(g,b.minE+x*step,b.minN+y*step,false);
s+='<g id="relief-detailed">'+reliefSvg(heights)+'</g><g id="relief-baseline" style="display:none">'+reliefSvg(baseline)+'</g>';
s+='</g><g id="layer-woods" opacity=".45">';
for(const f of g.forests)s+=`<polygon points="${points(f.polygon)}" fill="url(#forestfill)" stroke="#557858" stroke-width="2"/>`;
s+='</g><g id="layer-water">';
for(const r of g.rivers){s+=poly(r.stations,`class="edge" stroke="#a6c8bf" stroke-width="${r.floodplainHalfWidthM*.46}" opacity=".22"`);for(let i=1;i<r.stations.length;i++){const a=r.stations[i-1],z=r.stations[i];s+=poly([a,z],`class="edge" stroke="#79aab6" stroke-width="${((a[3]+z[3])/2*.23).toFixed(2)}"`);}s+=poly(r.stations,'class="edge" stroke="#548894" stroke-width="1" opacity=".5"');}
s+='</g><g id="layer-grid" opacity=".32">';
for(let e=-1500;e<=2000;e+=500)s+=`<path d="M${X(e)} 128V1048" stroke="#697575" stroke-width=".7"/>`;
for(let n=-1500;n<=2500;n+=500)s+=`<path d="M64 ${Y(n)}H984" stroke="#697575" stroke-width=".7"/>`;
s+='</g><g id="layer-roads">';
for(const h of g.hedges)s+=poly(h.points,'class="edge" stroke="#375f37" stroke-width="5"');
for(const r of g.roads){s+=poly(r.points,'class="edge" stroke="#887251" stroke-width="6"');s+=poly(r.points,'class="edge" stroke="#e8d5a4" stroke-width="3"');}
s+='</g><g id="layer-topology">';
for(const e of g.topology.edges){const c=e.kind==='boat'?'#2c657e':e.kind==='ford'?'#9a702f':'#826c53';s+=poly(e.points,`id="edge-${e.id}" class="edge" stroke="${c}" stroke-width="${e.kind==='boat'?2.8:1.5}" ${['path','boat','ford'].includes(e.kind)?'stroke-dasharray="5 4"':''} opacity=".82"`);}
s+='</g><g id="layer-details" style="display:none">';
for(const [i,f] of g.terrainRefinement.forms.entries()){const [e,n]=f.center;s+=`<ellipse cx="${X(e)}" cy="${Y(n)}" rx="${f.radiusM[0]*.23}" ry="${f.radiusM[1]*.23}" transform="rotate(${-f.rotationDeg} ${X(e)} ${Y(n)})" fill="none" stroke="#944e88" stroke-width="2" stroke-dasharray="6 5"><title>${esc(f.name)}</title></ellipse>`+text(X(e),Y(n),'Р'+(i+1),'font-size="16" class="halo"');}
for(const [i,p] of g.terrainRefinement.bankProfiles.entries()){s+=`<circle cx="${X(p.center[0])}" cy="${Y(p.center[1])}" r="9" fill="#d57532"><title>${esc(p.name)} · ${p.side}</title></circle>`;}
s+='</g><g id="route-highlight" fill="none"></g><g id="layer-pois">';
const offsets={BRIDGE:[-10,-22],INN:[-10,20],NORTH_GATE:[18,8],UPPER_LANDING_W:[-15,-16],UPPER_LANDING_E:[15,15],FISHING_LANDING_W:[-14,-12],FISHING_LANDING_E:[14,15]};
for(const p of g.pois){const[x,y]=[X(p.point[0]),Y(p.point[1])],[dx,dy]=offsets[p.id]??[10,-13];s+=`<g><title>${esc(p.name)} · ${p.point.join(', ')} м</title><circle cx="${x}" cy="${y}" r="3" fill="#203935"/><path d="M${x} ${y}l${dx} ${dy}" stroke="#33483d"/><circle cx="${x+dx}" cy="${y+dy}" r="12" fill="#fafbf7" stroke="#33483d" stroke-width="1.5"/>${text(x+dx,y+dy+4,p.mapNumber,'font-size="12" text-anchor="middle" font-weight="700"')}</g>`;}
s+='</g></g><rect x="64" y="128" width="920" height="920" fill="none" stroke="#68776b"/>';
for(let e=-1500;e<=2000;e+=500)s+=text(X(e),1072,e,'font-size="13" text-anchor="middle"');
for(let n=-1500;n<=2500;n+=500)s+=text(55,Y(n)+4,n,'font-size="13" text-anchor="end"');
s+=text(952,1100,'E, м','font-size="15"');s+=text(25,112,'N, м','font-size="15"');
s+=`<path d="M944 215V158l-7 14m7-14l7 14" stroke="#304a43" stroke-width="2.5" fill="none"/>${text(944,150,'С','font-size="16" text-anchor="middle"')}`;
s+=`<path d="M75 1120h115m-115-5v10m115-10v10" stroke="#304a43" stroke-width="3"/>${text(75,1148,'0','font-size="14"')}${text(190,1148,'500 м','font-size="14" text-anchor="end"')}`;
s+=text(250,1125,'Горизонтали: 5 м. Рельеф — предварительный эскиз.', 'font-size="16"');
s+=text(250,1151,'Точки и русла заданы данными; видимость ещё не проверена в 3D.', 'font-size="14"');
s+=text(1020,140,'ОРИЕНТИРЫ', 'font-size="19" font-weight="700"');
for(const p of g.pois)s+=text(1020,174+(p.mapNumber-1)*30,`${String(p.mapNumber).padStart(2,'0')}  ${p.name}`,'font-size="16"');
s+=text(1020,723,'ПЕРЕХОДЫ И ПОКРОВ', 'font-size="18" font-weight="700"');
const legend=[['#e8d5a4','Дорога / каменный мост'],['#826c53','Пешеходный коридор'],['#2c657e','Лодка: положение сохраняется'],['#375f37','Изгородь: проход через ворота'],['#91ad80','Авторские лес и рощи'],['#79aab6','Река / прибрежная полоса']];
legend.forEach(([color,label],i)=>{const y=757+i*29;s+=`<path d="M1020 ${y-5}h30" stroke="${color}" stroke-width="6"/>`+text(1062,y,label,'font-size="15"');});
s+=text(1020,963,'Основной лес: 1,115 км². Роща: 0,271 км².','font-size="15"');
s+=text(1020,992,'Старый лес и дальние канонические места','font-size="15"');s+=text(1020,1014,'за пределами этой области.','font-size="15"');
s+=text(1020,1060,'Источник: region-source.json','font-size="15"');s+=text(1020,1085,'Проверено: граф, уровни устья, единицы.','font-size="15"');s+=text(1020,1110,'Не проверено: коллизии, берега, обзор.','font-size="15"');s+='</svg>';
write('maps/region-topography.svg',s);
const layout={FORD_N:[140,190],NW_TRACK:[415,190],UPPER_LANDING_W:[650,190],UPPER_LANDING_E:[900,190],FOOTBRIDGE_N:[415,350],FOOTBRIDGE_S:[415,510],FORD_S:[140,510],WEST_GROVE:[265,675],WEST_FARM:[140,1030],INN:[490,990],ROAD_W:[100,875],WEST_JUNCTION:[295,875],BRIDGE_W:[650,875],BRIDGE_E:[900,875],EAST_JUNCTION:[1110,875],ROAD_E_ENTRY:[1340,690],ROAD_E:[1520,520],ROAD_LOOKOUT:[1130,660],RANGER_SHELTER:[1110,340],RIDGE:[1480,195],HOLLOW:[1310,500],EAST_BANK:[900,510],FISHING_LANDING_W:[650,1060],FISHING_LANDING_E:[900,1060],LOWER_COVE:[430,1240],BUCKLAND_ORCHARD:[1090,1260],BUCKLAND_BRANCH:[1300,1190],GATE_N:[1320,945],GATE_S:[1460,1100],BUCKLAND_EXIT:[1460,1280],STOCK_EXIT:[145,1240]};
let t=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1660 1420"><style>text{font-family:Arial,DejaVu Sans,sans-serif;fill:#233d37}.node{fill:#fafbf7;stroke:#597266;stroke-width:1.5}</style><rect width="1660" height="1420" fill="#fafbf7"/><rect x="745" y="130" width="55" height="1190" fill="#d4e6e9"/><text x="50" y="55" font-size="30" font-weight="700">СВЯЗНОСТЬ РЕГИОНА</text><text x="50" y="88" font-size="18">${g.topology.nodes.length} узел / ${g.topology.edges.length} связей · схема без масштаба · линии не ограничивают свободную ходьбу</text><text x="180" y="135" font-size="18">Шир / западный берег</text><text x="1060" y="135" font-size="18">Внешний берег / Бакленд</text>`;
for(const e of g.topology.edges){const a=layout[e.from],z=layout[e.to],color=e.kind==='boat'?'#357a99':e.kind==='ford'?'#b58939':e.kind==='gate'?'#537e3b':'#87908a';t+=`<path d="M${a}L${z}" fill="none" stroke="${color}" stroke-width="${e.crossingId?4:2}" ${e.kind==='boat'||e.kind==='ford'?'stroke-dasharray="8 5"':''}/>`;}
for(const n of g.topology.nodes){const[x,y]=layout[n.id];const parts=n.name.length>21?n.name.split(' '):[n.name];let lines=[n.name];if(parts.length>1){let at=Math.ceil(parts.length/2);lines=[parts.slice(0,at).join(' '),parts.slice(at).join(' ')];}t+=`<g><title>${esc(n.id)}: ${n.point.join(', ')} м</title><rect class="node" x="${x-84}" y="${y-25}" width="168" height="50" rx="6"/>`;lines.forEach((l,i)=>t+=text(x,y+(lines.length===1?5:-4+i*17),l,'font-size="13" text-anchor="middle"'));t+='</g>';}
t+=text(55,1370,'Синие пунктиры — лодки; охра — сезонный брод; зелёный — ворота.','font-size="18"');t+=text(55,1399,'Пересечение линий без узла не создаёт развилку. Переходы зависят от воды, профиля и положения лодок.','font-size="16"');t+='</svg>';
write('maps/region-topology.svg',t);
// Portable, fully offline viewer. The sole data source and planner are embedded at build time.
const core = `const distance=${distance.toString()}; const lineLength=${lineLength.toString()}; ${findRoute.toString()}`;
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Брендивинский мост · проект региона</title><style>body{margin:0;background:#f4f5f0;color:#213831;font:16px system-ui,sans-serif}header,aside{padding:18px 24px}header{background:#fff;border-bottom:1px solid #d0d6cc}h1{margin:0 0 7px;font-size:25px}p{line-height:1.5;margin:.4em 0}main{display:grid;grid-template-columns:minmax(0,1fr) 340px}#map svg{width:100%;height:auto}aside{background:#fff;border-left:1px solid #d0d6cc}label{display:block;margin:9px 0}select,button{font:inherit;padding:6px;max-width:100%}select{width:100%}button{cursor:pointer}small{display:block;color:#506358;line-height:1.5;margin:8px 0}#result{padding:12px;background:#f0f3eb;margin-top:12px;line-height:1.6}fieldset{border:1px solid #d0d6cc;margin:16px 0;padding:12px}legend{font-weight:600}@media(max-width:1050px){main{grid-template-columns:1fr}aside{border-left:0}}@media print{aside,header{display:none}}</style><header><h1>Регион у Брендивинского моста</h1><p>Инструмент проектирования: карта, граф и условные переходы. Не запущенная игра и не окончательная топография.</p></header><main><div id="map">${s}</div><aside><fieldset><legend>Рельеф для приёмки</legend><label>Вариант<select id="terrain-mode"><option value="detailed">Уточнение 0.1.1</option><option value="baseline">Исходный пакет 0.1</option></select></label><label><input type="checkbox" data-layer="details"> Показать зоны уточнения</label><small>Р1 — седловина; Р2 — северная ложбина; Р3 — отрог у укрытия; Р4 — полевая ложбина; Р5 — холм у садов. Оранжевые отметки — участки изменения берегов.</small><small>Уточнение — авторский кандидат. Оси рек, 17 ориентиров и граф сохранены. Береговые сходы стали положе; русла остаются глубокими.</small><label>Разрез<select id="section">${review.sections.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><svg id="profile-plot" viewBox="0 0 290 145" aria-label="Профиль рельефа"></svg><small id="profile-caption"></small><small>Серый — исходный; зелёный — уточнённый. Высота в метрах; вертикальный масштаб увеличен. Это поверхность земли и дна, без мостовых настилов.</small></fieldset><strong>Проверить путь</strong><label>Откуда<select id="start"></select></label><label>Куда<select id="goal"></select></label><label>Путник<select id="profile"><option value="ranger">Следопыт · 1,6 м/с</option><option value="hobbit">Хоббит · 1,2 м/с</option><option value="wagon">Повозка · 1,2 м/с</option></select></label><label>Вода<select id="water"><option value="normal">Обычная</option><option value="low">Низкая</option><option value="high">Высокая</option></select></label><label><input id="boats" type="checkbox" checked> Лодки доступны</label><label><input id="bridge" type="checkbox" checked> Мост открыт</label><label><input id="gate" type="checkbox" checked> Ворота открыты</label><button id="route">Рассчитать путь</button><div id="result" role="status"></div><small>Каждый расчёт начинается с исходных позиций лодок: нижняя на западе, верхняя на востоке. Внутри одного пути лодки перемещаются; они не телепортируются.</small><small>Время — геометрическая оценка без склонов, задержек и осмотра. Мост закрывается только диагностическим переключателем, не по канону.</small><fieldset><legend>Слои карты</legend>${[['relief','Рельеф / горизонтали'],['woods','Лесные участки'],['grid','Сетка 500 м'],['topology','Коридоры графа'],['pois','Ориентиры']].map(([id,label])=>`<label><input type="checkbox" data-layer="${id}" checked> ${label}</label>`).join('')}</fieldset><small>Размещение: исходный дизайн v0.1. Рельеф: эскиз 16 м; профили посчитаны отдельно через 8 м. Мостовые настилы, точные берега и уклоны ещё не спроектированы в движке.</small><small>Карта открывается локально без сервера, библиотек и сетевых запросов.</small></aside></main><script>const source=${JSON.stringify(g).replaceAll('<','\\u003c')};${core}
const review=${JSON.stringify(review)};
const $=id=>document.getElementById(id);
$('terrain-mode').onchange=()=>{const detailed=$('terrain-mode').value==='detailed';$('relief-detailed').style.display=detailed?'':'none';$('relief-baseline').style.display=detailed?'none':'';};
function drawProfile(){const section=review.sections.find(s=>s.id===$('section').value);if(!section)return;const svg=$('profile-plot');svg.replaceChildren();const min=Math.floor(Math.min(...section.samples.flatMap(p=>[p.baselineM,p.detailedM]))-1),max=Math.ceil(Math.max(...section.samples.flatMap(p=>[p.baselineM,p.detailedM]))+1);for(const [key,color] of [['baselineM','#929a98'],['detailedM','#24654e']]){const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',section.samples.map(p=>(12+p.distanceM/section.lengthM*266)+','+(130-(p[key]-min)/(max-min)*115)).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width','2');svg.append(line);}$('profile-caption').textContent=section.name+' · '+Math.round(section.lengthM)+' м; высоты '+min+'…'+max+' м.';}
$('section').value=review.sections[0].id;$('section').onchange=drawProfile;drawProfile();
for(const n of source.topology.nodes){for(const id of ['start','goal']){const o=document.createElement('option');o.value=n.id;o.textContent=n.name;$(id).append(o);}}$('start').value='INN';$('goal').value='RANGER_SHELTER';const sx=e=>64+(e+1600)*.23,sy=n=>128+(2500-n)*.23;function run(){const r=findRoute(source,$('start').value,$('goal').value,{profile:$('profile').value,water:$('water').value,boats:$('boats').checked,bridgeOpen:$('bridge').checked,gateOpen:$('gate').checked});$('route-highlight').replaceChildren();if(!r){$('result').textContent='В выбранном состоянии пути нет.';return;}for(const id of r.edges){const e=source.topology.edges.find(e=>e.id===id),p=document.createElementNS('http://www.w3.org/2000/svg','polyline');p.setAttribute('points',e.points.map(p=>sx(p[0])+','+sy(p[1])).join(' '));p.setAttribute('stroke','#bd4238');p.setAttribute('stroke-width','5');p.setAttribute('stroke-linejoin','round');$('route-highlight').append(p);}$('result').textContent=(r.length/1000).toFixed(2)+' км · '+(r.seconds/60).toFixed(1)+' мин. Маршрут: '+r.nodes.map(id=>source.topology.nodes.find(n=>n.id===id).name).join(' → ');}$('route').onclick=run;document.querySelectorAll('[data-layer]').forEach(box=>box.onchange=()=>{$('layer-'+box.dataset.layer).style.display=box.checked?'':'none';});run();</script></html>`;
write('maps/region-viewer.html',html);
console.log(JSON.stringify({ok:true,previewBytes:raw.length,storageTiles:report.storage.count,outputs:['maps/region-topography.svg','maps/region-topology.svg','maps/region-viewer.html','data/terrain-preview.f32le','data/topology-derived.json'],routeExamples:samples},null,2));
