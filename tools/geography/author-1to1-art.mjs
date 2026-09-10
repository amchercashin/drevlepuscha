/** Add local Stage-2 terrain art to the untouched 1:1 macro geography. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pointInRing,nearestOnLine} from '../../src/domain/geography.mjs';
const file=fileURLToPath(new URL('../../content/geography/old-forest/geography.json',import.meta.url));
const g=JSON.parse(readFileSync(file,'utf8'));
if(g.contentRevision!=='old-forest-1.1.0'||g.terrain.sculpt)throw Error('Run only once on the untouched 1:1 geography.');
const feature=id=>g.features.find(f=>f.id===id),main=feature('frodo_route'),route=main.geometry.coordinates,ring=feature('forest_boundary').geometry.coordinates[0];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),cum=[0];for(let i=1;i<route.length;i++)cum.push(cum.at(-1)+dist(route[i-1],route[i]));
function pointAt(s){s=Math.max(0,Math.min(cum.at(-1),s));let i=1;while(i<cum.length&&cum[i]<s)i++;const a=route[i-1],b=route[i],t=(s-cum[i-1])/(cum[i]-cum[i-1]||1);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function tangentAt(s){const a=pointAt(Math.max(0,s-8)),b=pointAt(Math.min(cum.at(-1),s+8)),d=dist(a,b)||1;return [(b[0]-a[0])/d,(b[1]-a[1])/d];}
function nearestS(p){const n=nearestOnLine(...p,route);return cum[n.segment]+(cum[n.segment+1]-cum[n.segment])*n.t;}
const cps=Object.fromEntries(main.route.checkpointIds.map(id=>[id,nearestS(feature(id).geometry.coordinates)]));
const misleading=feature('misleading_path'),ma=misleading.geometry.coordinates.at(-2),mb=misleading.geometry.coordinates.at(-1),md=dist(ma,mb),back=12;misleading.geometry.coordinates[misleading.geometry.coordinates.length-1]=[mb[0]+(ma[0]-mb[0])*back/md,mb[1]+(ma[1]-mb[1])*back/md];
function sampleSpan(a,b,step=18){const n=Math.max(2,Math.ceil((b-a)/step));return Array.from({length:n+1},(_,i)=>pointAt(a+(b-a)*i/n));}
function inside(points){return points.every(p=>pointInRing(...p,ring));}
function loopPath(a,b,wanted,phase=0){for(const scale of [1,.8,.6,.45,.3])for(const sign of [1,-1]){const n=28,out=[];for(let i=0;i<=n;i++){const t=i/n,s=a+(b-a)*t,p=pointAt(s),v=tangentAt(s),normal=[-v[1],v[0]],envelope=Math.sin(Math.PI*t)**1.15,wiggle=.88+.12*Math.sin(t*Math.PI*4+phase);out.push([p[0]+normal[0]*wanted*scale*sign*envelope*wiggle,p[1]+normal[1]*wanted*scale*sign*envelope*wiggle]);}if(inside(out))return out;}throw Error('No inside loop '+a);}
function spurPath(a,along,wanted,phase=0){for(const scale of [1,.8,.6,.45,.3])for(const sign of [1,-1]){const n=16,out=[];for(let i=0;i<=n;i++){const t=i/n,s=a+along*t,p=pointAt(s),v=tangentAt(s),normal=[-v[1],v[0]],envelope=Math.sin(t*Math.PI/2),wiggle=.9+.1*Math.sin(t*Math.PI*3+phase);out.push([p[0]+normal[0]*wanted*scale*sign*envelope*wiggle,p[1]+normal[1]*wanted*scale*sign*envelope*wiggle]);}if(inside(out))return out;}throw Error('No inside spur '+a);}
const authoredRef=['old-forest-reconstruction-v1'];
const dress=(terrain,moisture,vegetation,details)=>({terrain,moisture,vegetation,details,provenance:{status:'authored',sourceRefs:authoredRef}});
const specs=[
 ['root_secret','Корневая щель',loopPath(850,2050,170,.2),false,'извилистая сухая ложбина с корневыми бортами','сухо; мох в тени','старые широколиственные; редкий подлесок'],
 ['fern_bowl','Папоротниковая чаша',spurPath(cps.bonfire_glade+900,230,150,1.1),true,'укрытая чаша за низкой седловиной','влажнее окружающего склона','папоротники пятнами; молодой подрост'],
 ['hidden_saddle','Скрытая седловина',loopPath(cps.bald_hill+1800,cps.bald_hill+3400,310,2.4),false,'понижение между двумя лесными плечами','сухая верхняя тропа','старые деревья; просвет на седловине'],
 ['quiet_amphitheatre','Тихий амфитеатр',loopPath(cps.bald_hill+(cps.gully_mouth-cps.bald_hill)*.62,cps.bald_hill+(cps.gully_mouth-cps.bald_hill)*.70,360,.7),false,'чашеобразное боковое понижение с высоким бортом','прохладно и умеренно влажно','сомкнутый древний лес; мох и валежник'],
 ['high_bank','Верхняя береговая тропа',loopPath(cps.old_man_willow+650,cps.east_eaves-650,210,1.9),false,'узкая полка над долиной Ветлянки','сухой верхний берег','дубы и бук; меньше подлеска на полке'],
 ['fall_window','Окно к водопаду',spurPath(cps.east_eaves-520,150,115,2.8),true,'короткая скрытая полка к обзору воды','влажный воздух; сухая опора','ива и широколиственные; просвет к воде']
];
const viewpoints=[];
for(const [id,name,points,deadEnd,terrain,moisture,vegetation] of specs){const place=deadEnd?points.at(-1):points[Math.floor(points.length/2)],trailId=id+'_trail';
 const trail={id:trailId,name:name+' — скрытая тропа',kind:'path',existence:{status:'authored',verification:'authored',sourceRefs:authoredRef},geometry:{type:'LineString',coordinates:points},geometryProvenance:{status:'authored',sourceRefs:authoredRef,uncertaintyM:0},evidence:{summary:'Авторское игровое ответвление внутри исходной 1:1-географии.',locator:'gameplay terrain art'},placement:{mode:'corridor',reserveM:1.6},route:{widthM:1.5,cutDepthM:.12,cutSegments:[[0,points.length-1]],checkpointIds:[],hollowDepthM:.35,hollowHalfWidthM:6,hollowSegments:[[0,points.length-1]],hidden:true,deadEnd},discovery:{initiallyHidden:true},dressing:dress(terrain,moisture,vegetation,['Сохранять свободный проход 1,5–2 м.','Вход прикрывать рельефом и растительностью; не превращать в широкую дорогу.'])};
 const poi={id,name,kind:'secret-place',existence:{status:'authored',verification:'authored',sourceRefs:authoredRef},geometry:{type:'Point',coordinates:place},geometryProvenance:{status:'authored',sourceRefs:authoredRef,uncertaintyM:0},evidence:{summary:'Авторская игровая микросцена; не каноническое место.',locator:'gameplay terrain art'},placement:{mode:'fixed',reserveM:10},dressing:dress(terrain,moisture,vegetation,['Локальная композиция рельефа важнее количества декора.','Сохранять читаемый силуэт чаши/седловины с уровня путника.'])};
 g.features.push(trail,poi);const v=tangentAt(nearestS(points[0])),az=Math.atan2(v[0],v[1])*180/Math.PI;viewpoints.push({id,name,point:place,azimuthDeg:az,spanM:520});
 const angle=Math.atan2(points.at(-1)[1]-points[0][1],points.at(-1)[0]-points[0][0])*180/Math.PI;
 g.terrain.landforms.push({id:id+'-bowl',center:place,radiusM:[55,85],amplitudeM:deadEnd?-3.8:-5.2,rotationDeg:angle},{id:id+'-shoulder-a',center:[place[0]+45*Math.cos((angle+90)*Math.PI/180),place[1]+45*Math.sin((angle+90)*Math.PI/180)],radiusM:[45,95],amplitudeM:deadEnd?5.5:8.5,rotationDeg:angle},{id:id+'-shoulder-b',center:[place[0]+58*Math.cos((angle-90)*Math.PI/180),place[1]+58*Math.sin((angle-90)*Math.PI/180)],radiusM:[65,42],amplitudeM:deadEnd?4:6.2,rotationDeg:angle});
}
const ribbon=(id,a,b,half,outer,bank,seed)=>({id,points:sampleSpan(a,b),halfWidthM:half,outerWidthM:outer,bankHeightM:bank,endFadeM:140,seed});
const h0=cps.bald_hill,h1=cps.gully_mouth,span=h1-h0;
const ribbons=[ribbon('root-gate',100,cps.bonfire_glade-180,11,52,4.5,11),ribbon('west-hollow',cps.bonfire_glade+220,cps.bald_hill-350,16,72,7.2,21),ribbon('north-saddle',h0+450,h0+span*.22,18,86,8.5,31),ribbon('lost-hollow',h0+span*.30,h0+span*.52,20,96,10.5,41),ribbon('deep-gully',h0+span*.60,h0+span*.88,18,92,11.5,51),ribbon('gully-willow',cps.gully_mouth+120,cps.old_man_willow-100,15,74,8.2,61),ribbon('willow-bank',cps.old_man_willow+100,cps.east_eaves-220,14,68,6.5,71)];
for(const [id,,points] of specs)ribbons.push({id:'secret-'+id,points,halfWidthM:10,outerWidthM:48,bankHeightM:id==='hidden_saddle'?8:id==='quiet_amphitheatre'?7:5,endFadeM:55,seed:100+ribbons.length});
g.terrain.sculpt={version:2,protectIds:['hay_gate','entry_hollow','bonfire_glade','bald_hill','old_man_willow','short_fall','east_eaves','tom_house','approach_knoll','tom_hill_brow'],ribbons};
g.terrain.viewpoints=viewpoints;g.terrain.detailMarginM=80;
g.terrain.detailPolicy={macroStepM:16,trailWaterPoiStepM:2,note:'2 m detail is generated only near routes, water and named places; remote terrain stays on the 16 m macro grid until approached/integrated.'};
for(const id of ['withywindle','gully_brook','north_brook','south_brook'])feature(id).water.terrainVariation=id==='withywindle'?.14:.18;
g.placementPolicy.backgroundForest={mode:'deterministic-zone-fill',cellM:32,note:'Remote ordinary forest is reconstructed from worldSeed, zone, cell and candidate index. Do not author or keep every tree globally.'};
g.calibration.gameplayPresentation={macroScale:'1:1',localTerrain:'authored',note:'Original 1:1 coordinates, forest outline, rivers, POIs and vegetation zones are unchanged. Only local terrain around routes and new optional paths is authored.'};
g.decisions.push({id:'one-to-one-local-art',decision:'Keep Tolkien-derived macro geography at 1:1. Add Stage-2 ravines, saddles and hidden paths only as local terrain; use coarse deterministic zone fill away from routes.','sourceRefs':authoredRef});
g.contentRevision='old-forest-1to1-art-2.0.0';g.generatorVersion='terrain-2.0.0';
writeFileSync(file,JSON.stringify(g,null,2)+'\n');
console.log(JSON.stringify({routeKm:cum.at(-1)/1000,features:g.features.length,zones:g.zones.length,ribbons:ribbons.length,hidden:specs.length,bounds:g.bounds}));
