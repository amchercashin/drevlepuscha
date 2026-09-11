import type { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import '../style.css';
import { createRenderer } from '../runtime/engine.ts';
import {createDaylight} from '../runtime/daylight.ts';
import { createTouchControls } from '../runtime/touch-controls.ts';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
import { WorldStreamer } from './streamer.ts';
import { createWorldMap } from './map-ui.ts';
import { cameraOffset, normalizeAzimuth, shortestAngleDelta } from '../domain/coordinates.ts';
import { moveOnTerrain } from './math.ts';
import { renderResolution } from '../runtime/resolution.ts';
import type { ResolutionQuality } from '../runtime/resolution.ts';
import config from '../../config/camera-presets.json';
const params = new URLSearchParams(location.search), debug = params.get('debug') === '1';
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
let canvas = $<HTMLCanvasElement>('#world');
const pause = $('#pause'), resume = $<HTMLButtonElement>('#resume');
const errors: string[] = [];
let world: WorldStreamer | undefined;
function poiOffset(id: string) { return ({ hay_gate: [-12, 0], tom_house: [-16, 0], old_man_willow: [-18, 12], lily_pool: [0, 25], short_fall: [0, 24] } as Record<string, number[]>)[id] ?? [0, 0]; }
function error(message: string) { errors.push(message); $('#pause-title').textContent = 'Не удалось открыть лес'; $('#pause-description').textContent = message; pause.hidden = false; resume.disabled = false; resume.textContent = 'Повторить'; resume.onclick = () => location.reload(); }
try {
    const renderer = await createRenderer(canvas, true, 'webgpu'), engine = renderer.engine;
    canvas = renderer.canvas;
    engine.useReverseDepthBuffer = true;
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(.72, .78, .74, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = .001;
    scene.fogColor = new Color3(.67, .75, .70);
    const camera = new FreeCamera('traveller-camera', new Vector3(0, 120, 5), scene);
    camera.inputs.clear();
    camera.minZ = .1;
    camera.maxZ = 65536;
    camera.fov = config.travel.fovVerticalDeg * Math.PI / 180;
    scene.activeCamera = camera;
    const ambient = new HemisphericLight('sky', Vector3.Up(), scene);
    ambient.intensity = .56;
    ambient.diffuse = new Color3(.78, .87, 1);
    ambient.groundColor = new Color3(.2, .26, .2);
    const sun = new DirectionalLight('sun', new Vector3(-.35, -.65, .6), scene);
    sun.diffuse = new Color3(1, .88, .66);
    sun.intensity = .95;
    const shadows = new ShadowGenerator(512, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.setDarkness(.22);
    shadows.bias = .001;
    shadows.normalBias = .025;
    shadows.frustumEdgeFalloff = .15;
    sun.autoUpdateExtends = false;
    sun.autoCalcShadowZBounds = false;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = 140;
    sun.orthoLeft = -40;
    sun.orthoRight = 40;
    sun.orthoTop = 40;
    sun.orthoBottom = -40;
    const player = { e: 500, n: 25420, heading: 90 };
    let yaw = 90, yawTarget = 90, pitch = 12, distance = 5.5, paused = true, loading = true, dragging = false, frames = 0;
    try {
        const saved = JSON.parse(localStorage.getItem('old-forest-pose-v1') ?? 'null');
        if (saved && saved.version === 1 && [saved.e, saved.n, saved.yaw, saved.pitch, saved.distance].every(Number.isFinite) && saved.e >= -8190 && saved.e <= 32766 && saved.n >= -4094 && saved.n <= 40958) {
            player.e = saved.e;
            player.n = saved.n;
            yaw = yawTarget = saved.yaw;
            pitch = Math.max(-25, Math.min(35, saved.pitch));
            distance = Math.max(3.5, Math.min(8, saved.distance));
        }
    }
    catch { }
    const hero = new TransformNode('traveller', scene);
    function color(name: string, hex: string) { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = Color3.Black(); return m; }
    const coatMat = color('traveller-cloak', '#a77d47'), hoodMat = color('traveller-hood', '#9fa68a'), skin = color('traveller-face', '#d8bb91');
    const coat = CreateCylinder('coat', { height: .67, diameterTop: .27, diameterBottom: .48, tessellation: 8 }, scene);
    coat.parent = hero;
    coat.position.y = .44;
    coat.material = coatMat;
    const hood = CreateSphere('hood', { diameter: .3, segments: 8 }, scene);
    hood.parent = hero;
    hood.position.y = .95;
    hood.material = hoodMat;
    const face = CreateSphere('face', { diameter: .17, segments: 6 }, scene);
    face.parent = hero;
    face.position.set(0, .94, -.105);
    face.material = skin;
    const pack = CreateBox('pack', { width: .3, height: .37, depth: .2 }, scene);
    pack.parent = hero;
    pack.position.set(0, .53, .22);
    pack.material = hoodMat;
    const sceneMetrics = new SceneInstrumentation(scene), gpuMetrics = new EngineInstrumentation(engine);
    const webgpu = engine.isWebGPU ? engine as WebGPUEngine : undefined;
    if (webgpu)
        webgpu.enableGPUTimingMeasurements = true;
    else
        gpuMetrics.captureGPUFrameTime = true;
    function gpuTime() { return webgpu?.gpuTimeInFrameForMainPass?.counter.current !== undefined ? webgpu.gpuTimeInFrameForMainPass.counter.current / 1e6 : gpuMetrics.gpuFrameTimeCounter.current / 1e6; }
    $('#pause-title').textContent = 'За Высокой Изгородью';
    $('#pause-description').textContent = 'Подготавливается место, где начнётся прогулка…';
    $('.badge').textContent = 'Древлепуща · 718 км²';
    $('.muted').textContent = 'Лес в масштабе 1:1. Подробности подгружаются вокруг путника.';
    $('nav').innerHTML = '<button id="open-map" type="button">M · Карта леса</button>';
    $('#location').textContent = 'Высокая Изгородь';
    document.title = 'Древлепуща — прогулка по карте 1:1';
    document.querySelector('h1')!.textContent='Древлепуща';
    const streamStatus = document.createElement('div');
    streamStatus.setAttribute('role', 'status');
    streamStatus.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:8px 14px;background:#26372ee6;color:#eee5c9;border-radius:5px;pointer-events:none';
    streamStatus.hidden = true;
    document.body.append(streamStatus);
    const keys = new Set<string>();
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const quality = $<HTMLSelectElement>('#resolution-quality');
    quality.insertBefore(new Option('Авто · цель 60 FPS', 'auto'), quality.firstChild);
    quality.value = 'auto';
    let pixelBudget = 3.7e6;
    function resize() { const q = quality.value as ResolutionQuality; let size = renderResolution(canvas.clientWidth, canvas.clientHeight, devicePixelRatio, quality.value === 'auto' ? 'high' : q, Math.min(8192, engine.getCaps().maxTextureSize)); if (quality.value === 'auto') {
        const scale = Math.min(1, Math.sqrt(pixelBudget / (size.width * size.height)));
        size = { ...size, width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
    } // WebGPU submits after this callback. Resize only after endFrame has submitted its buffers.
        queueMicrotask(()=>engine.setSize(size.width, size.height)); }
    quality.onchange = resize;
    window.addEventListener('resize', resize);
    resize();
    const rendererSelect = $<HTMLSelectElement>('#renderer');
    rendererSelect.value = params.get('renderer') ?? 'webgpu';
    rendererSelect.onchange = () => { const url = new URL(location.href); url.searchParams.set('renderer', rendererSelect.value); location.assign(url); };
    $('#preset').closest('label');
    $('#preset').setAttribute('hidden', '');
    document.querySelector('label[for="preset"]')?.setAttribute('hidden', '');
    let lastTime = performance.now(), lastUi = 0, lastSave = 0, lastAdapt = 0, healthySince = 0;
    const frameSamples: number[] = [], cpuSamples: number[] = [], gpuSamples: number[] = [];
    let collecting = false;
    let autoMove: {
        points: number[][];
        index: number;
        speed: number;
        distance: number;
    } | undefined;
    const setPaused = (p: boolean) => { paused = p; keys.clear(); dragging = false; pause.hidden = !p || loading || map.isOpen(); if (p && !loading) {
        $('#pause-title').textContent = 'Прогулка на паузе';
        $('#pause-description').textContent = 'Продолжите исследование или откройте карту клавишей M.';
        resume.textContent = 'Продолжить';
    } lastTime = performance.now(); };
    const focus = () => { setPaused(false); canvas.focus({ preventScroll: true }); };
    const map = createWorldMap({ pose: () => ({ e: player.e, n: player.n, yaw, fov: 2 * Math.atan(Math.tan(camera.fov / 2) * engine.getAspectRatio(camera)) * 180 / Math.PI }), onOpen: open => { keys.clear(); dragging = false; paused = open; if (open)
            pause.hidden = true;
        else if (!loading)
            focus(); }, load: () => world!.data.map(), travel: async (id, signal, progress) => { const f = world!.data.geography.features.find((f: any) => f.id === id); if (!f || f.geometry.type !== 'Point')
            throw Error('Место не найдено'); const [e, n] = f.geometry.coordinates; const o = poiOffset(id); const p = await world!.prepareDestination({ e: e + o[0], n: n + o[1] }, signal, progress); if (signal.aborted)
            return; Object.assign(player, p); world!.last = ''; world!.trees.lastCell = ''; autoMove = undefined; save(); } });
    $('#open-map').addEventListener('click', () => { if (!loading)
        void map.open(); });
    $('#reset').addEventListener('click', () => void map.open());
    const touch = createTouchControls(canvas, { active: () => !paused && !loading, engage: () => { autoMove = undefined; }, look: (x, y) => { yawTarget = normalizeAzimuth(yawTarget + x * .2); pitch = clamp(pitch + y * .16, -25, 35); }, zoom: delta => { distance = clamp(distance + delta, 3.5, 8); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (paused || loading)
        return; canvas.focus(); if (e.button === 2) {
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    } });
    canvas.addEventListener('pointermove', e => { if (dragging && !paused) {
        yawTarget = normalizeAzimuth(yawTarget + e.movementX * .2);
        pitch = clamp(pitch + e.movementY * .16, -25, 35);
    } });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        canvas.addEventListener(event, () => { dragging = false; });
    canvas.addEventListener('wheel', e => { if (!paused && !loading) {
        e.preventDefault();
        distance = clamp(distance + e.deltaY * .004, 3.5, 8);
    } }, { passive: false });
    window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && !loading) {
        if (!map.isOpen()) {
            e.preventDefault();
            void map.open();
        }
        return;
    } if (map.isOpen())
        return; if (e.code === 'Escape' && !loading) {
        e.preventDefault();
        setPaused(!paused);
        if (!paused)
            canvas.focus();
        return;
    } if (paused || loading || document.activeElement !== canvas)
        return; if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
        keys.add(e.code);
        autoMove = undefined;
        if (e.code === 'Space') {
            yawTarget = player.heading;
            pitch = 12;
            distance = 5.5;
        }
    } });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { if (!loading && !map.isOpen())
        setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && !loading)
        setPaused(true); });
    canvas.addEventListener('blur', () => keys.clear());
    function save() { try {
        localStorage.setItem('old-forest-pose-v1', JSON.stringify({ version: 1, ...player, yaw, pitch, distance }));
    }
    catch { } }
    window.addEventListener('pagehide', save);
    world = await WorldStreamer.create(scene, sun);
    const w = world;
    const daylight=createDaylight(scene,camera,sun,ambient,null);
    const query = { height: (e: number, n: number) => w.data.height(e, n), ready: (e: number, n: number) => w.ready(e, n), waterDepth: (e: number, n: number) => w.data.waterDepth(e, n), blocked: (e: number, n: number) => w.blocked(e, n) };
    function state() { const anchor = new Vector3(player.e - w.origin.e, w.data.height(player.e, player.n) + .95, w.origin.n - player.n), actual = Vector3.Distance(anchor, camera.position), offset = cameraOffset(yaw + 180, Math.max(0, pitch), distance); return { ready: !loading, paused, frames, player: { ...player, h: w.data.height(player.e, player.n) }, camera: { yaw, pitch, distance, currentDistance: actual, followError: Vector3.Distance(camera.position, anchor.add(new Vector3(offset.x, offset.y, offset.z))) }, render: { backend: renderer.kind, width: engine.getRenderWidth(), height: engine.getRenderHeight(), triangles: scene.getActiveIndices() / 3, drawCalls: sceneMetrics.drawCallsCounter.current, meshes: scene.meshes.length, gpuMs: gpuTime(), gpuTiming: engine.getCaps().timerQuery !== undefined, pixelBudget }, world: w.stats(), mapOpen: map.isOpen(), errors: [...errors], traversal: autoMove ? { index: autoMove.index, distance: autoMove.distance } : null, heap: (performance as unknown as {
            memory?: {
                usedJSHeapSize: number;
            };
        }).memory?.usedJSHeapSize ?? null }; }
    engine.runRenderLoop(() => {
        const start = performance.now(), raw = start - lastTime;
        lastTime = start;
        const dt = Math.min(.05, raw / 1000);
        try {
            if (!paused && !loading) {
                yaw = normalizeAzimuth(yaw + shortestAngleDelta(yaw, yawTarget) * (1 - Math.exp(-dt / .085)));
                let de = 0, dn = 0;
                if (autoMove) {
                    let target = autoMove.points[autoMove.index];
                    if (target) {
                        const length = Math.hypot(target[0] - player.e, target[1] - player.n);
                        if (length < 1) {
                            autoMove.index++;
                            target = autoMove.points[autoMove.index];
                        }
                        if (target) {
                            const dx = target[0] - player.e, dy = target[1] - player.n, len = Math.hypot(dx, dy);
                            de = dx / len * autoMove.speed * dt;
                            dn = dy / len * autoMove.speed * dt;
                        }
                    }
                }
                else {
                    let f = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) + touch.state.forward, r = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touch.state.right;
                    const len = Math.hypot(f, r);
                    if (len > 1) {
                        f /= len;
                        r /= len;
                    }
                    const a = yaw * Math.PI / 180, speed = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.state.running ? 15 : 1.85;
                    de = (Math.sin(a) * f + Math.cos(a) * r) * speed * dt;
                    dn = (Math.cos(a) * f - Math.sin(a) * r) * speed * dt;
                }
                if (de || dn) {
                    streamStatus.hidden = query.ready(player.e + de, player.n + dn);
                    if (!streamStatus.hidden)
                        streamStatus.textContent = 'Местность впереди ещё подгружается…';
                    const moved = moveOnTerrain(player, de, dn, query, w.data.manifest.bounds);
                    if (autoMove)
                        autoMove.distance += Math.hypot(moved.e - player.e, moved.n - player.n);
                    Object.assign(player, moved);
                    player.heading = normalizeAzimuth(Math.atan2(de, dn) * 180 / Math.PI);
                }
            }
            const h = w.data.height(player.e, player.n), offset = cameraOffset(yaw + 180, Math.max(0, pitch), distance), eye = { e: player.e + offset.x, n: player.n - offset.z, h: h + .95 + offset.y };
            w.update(player, eye, h, dt);
            hero.position.set(player.e - w.origin.e, h, w.origin.n - player.n);
            hero.rotation.y = -player.heading * Math.PI / 180;
            camera.position.set(eye.e - w.origin.e, eye.h, w.origin.n - eye.n);
            const lookUp = Math.tan(Math.max(0, -pitch) * Math.PI / 180) * distance;
            camera.setTarget(new Vector3(player.e - w.origin.e, h + .95 + lookUp, w.origin.n - player.n));
            camera.position.set(eye.e - w.origin.e, eye.h, w.origin.n - eye.n);
            daylight.update(paused||loading?0:dt);
            const lightTarget = new Vector3(Math.floor(hero.position.x / 8) * 8, h, Math.floor(hero.position.z / 8) * 8);
            sun.position.copyFrom(lightTarget.subtract(sun.direction.scale(60)));
            shadows.getShadowMap()!.renderList = [coat, hood, pack, ...w.trees.shadows(player), ...[...w.dressing.groups.values()].flat().filter(m => Math.hypot(m.metadata.e - player.e, m.metadata.n - player.n) < 40), ...[...w.props.cells.values()].filter(p => Math.hypot(p.e - player.e, p.n - player.n) < 30).flatMap(p => p.meshes)];
            scene.render();
            frames++;
            const cpu = performance.now() - start, gpu = gpuTime();
            if (collecting && !loading && frameSamples.length < 3600) {
                frameSamples.push(raw);
                cpuSamples.push(cpu);
                if (gpu > 0)
                    gpuSamples.push(gpu);
            }
            if (start - lastUi > 500) {
                lastUi = start;
                $('#fps').textContent = Math.round(engine.getFps()) + ' FPS';
                $('#metrics').textContent = `${renderer.kind.toUpperCase()} · ${engine.getRenderWidth()} × ${engine.getRenderHeight()}\n${w.terrain.patches.size} участков · ${w.trees.resident.length} деревьев рядом\n${sceneMetrics.drawCallsCounter.current} вызовов · ${Math.round(scene.getActiveIndices() / 3000)} тыс. треугольников\nCPU ${cpu.toFixed(1)} мс · GPU ${gpu > 0 ? gpu.toFixed(1) + ' мс' : 'нет замера'}\n${(w.data.networkBytes / 1048576).toFixed(1)} МиБ загружено`;
                const zone = w.data.geo.zoneAt(player.e, player.n);
                $('#location').textContent = zone?.name ?? 'Открытая местность';
            }
            if (!paused && !loading && quality.value === 'auto' && start - lastAdapt > 6000) {
                lastAdapt = start;
                if (gpu > 12 || engine.getFps() < 53) {
                    healthySince = 0;
                    pixelBudget = Math.max(2.1e6, pixelBudget * .9);
                    resize();
                }
                else if (gpu > 0 && gpu < 9) {
                    if (!healthySince)
                        healthySince = start;
                    if (start - healthySince > 20000) {
                        pixelBudget = Math.min(3.7e6, pixelBudget * 1.03);
                        resize();
                    }
                }
                else
                    healthySince = 0;
            }
            if (!loading && start - lastSave > 10000) {
                lastSave = start;
                save();
            }
        }
        catch (e) {
            engine.stopRenderLoop();
            error(String(e));
        }
    });
    if (debug) Object.assign(window,{worldDaylight:daylight});
    if (debug)
        Object.assign(window, { oldForest: { state, inspect: () => ({ scene, engine, world: w }), setPaused, openMap: () => map.open(), setCamera: (y: number, p: number, d: number) => { yaw = yawTarget = normalizeAzimuth(y); pitch = clamp(p, -25, 35); distance = clamp(d, 3.5, 8); }, teleport: async (e: number, n: number) => { const p = await w.prepareDestination({ e, n }, new AbortController().signal, () => { }); Object.assign(player, p); w.last = ''; w.trees.lastCell = ''; }, travel: async (id: string) => { const f = w.data.geography.features.find((f: any) => f.id === id); if (!f)
                    throw Error(id); const p = await w.prepareDestination({ e: f.geometry.coordinates[0] + poiOffset(id)[0], n: f.geometry.coordinates[1] + poiOffset(id)[1] }, new AbortController().signal, () => { }); Object.assign(player, p); w.last = ''; w.trees.lastCell = ''; }, beginMeasurement: () => { frameSamples.length = cpuSamples.length = gpuSamples.length = 0; collecting = true; }, endMeasurement: () => { collecting = false; return { frames: [...frameSamples], cpu: [...cpuSamples], gpu: [...gpuSamples] }; }, startTraversal: (points: number[][], speed = 15) => { autoMove = { points, index: 1, speed, distance: 0 }; focus(); }, stopTraversal: () => { autoMove = undefined; }, pois: () => w.data.geography.features.filter((f: any) => f.geometry.type === 'Point').map((f: any) => ({ id: f.id, point: f.geometry.coordinates })), route: () => w.data.geography.features.find((f: any) => f.id === 'frodo_route').geometry.coordinates } });
    const initial = await w.prepareDestination(player, new AbortController().signal, text => { $('#pause-description').textContent = text; });
    Object.assign(player, initial);
    loading = false;
    pause.hidden = false;
    $('#pause-description').textContent = 'Большой лес, холмы, лощины и Ветлянка. M — карта и переход к известным местам. WASD — идти, Shift — быстрый ход.';
    resume.disabled = false;
    resume.textContent = 'Начать прогулку';
    resume.onclick = focus;
    engine.onContextLostObservable.add(() => { engine.stopRenderLoop(); error('Графический контекст потерян. Перезагрузите прогулку.'); });
}
catch (e) {
    error(String(e));
}
