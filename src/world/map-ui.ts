import './map-ui.css';
import type { MapData, MapOptions, Poi } from './schema';
type Point2D = {
    x: number;
    y: number;
};
type Segment = {
    a: Point2D;
    b: Point2D;
};
type Contour = {
    level: number;
    segments: Segment[];
};
type LabelRect = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type PreparedMap = {
    data: MapData;
    baseCanvas: HTMLCanvasElement;
    zoneCanvas: HTMLCanvasElement;
    contours: Contour[];
};
type ViewTransform = {
    scale: number;
    offsetX: number;
    offsetY: number;
};
type ActiveTravel = {
    poiId: string;
    controller: AbortController;
};
const PARCHMENT = '#d8cfad';
const TEXT = '#314534';
const TRAIL_WORN = '#866a4f';
const TRAIL_PATH = '#66533f';
const TRAIL_TRACE = '#8e8d86';
const MIN_ZOOM = 0.001;
const MAX_ZOOM = 80;
function clamp(value: number, min: number, max: number): number {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
}
function rectIntersects(a: LabelRect, b: LabelRect, margin: number): boolean {
    return a.x - margin < b.x + b.w + margin
        && a.x + a.w + margin > b.x - margin
        && a.y - margin < b.y + b.h + margin
        && a.y + a.h + margin > b.y - margin;
}
function parseColor(value: string): [
    number,
    number,
    number,
    number
] {
    const v = value.trim().toLowerCase();
    if (v.startsWith('#')) {
        const hex = v.slice(1);
        const expand = (short: string) => short.split('').map((c) => `${c}${c}`).join('');
        const normalized = hex.length === 3 || hex.length === 4 ? expand(hex) : hex;
        if (normalized.length === 6 || normalized.length === 8) {
            const r = Number.parseInt(normalized.slice(0, 2), 16);
            const g = Number.parseInt(normalized.slice(2, 4), 16);
            const b = Number.parseInt(normalized.slice(4, 6), 16);
            const a = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1;
            return [r, g, b, a];
        }
    }
    return [74, 98, 59, 0.7];
}
function mix(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function heightColor(t: number): [
    number,
    number,
    number
] {
    const s = clamp(t, 0, 1);
    const a = [52, 84, 38];
    const b = [72, 109, 52];
    const c = [108, 138, 69];
    const d = [171, 167, 126];
    if (s < 0.35)
        return [mix(a[0], b[0], s / 0.35), mix(a[1], b[1], s / 0.35), mix(a[2], b[2], s / 0.35)];
    if (s < 0.7)
        return [mix(b[0], c[0], (s - 0.35) / 0.35), mix(b[1], c[1], (s - 0.35) / 0.35), mix(b[2], c[2], (s - 0.35) / 0.35)];
    return [mix(c[0], d[0], (s - 0.7) / 0.3), mix(c[1], d[1], (s - 0.7) / 0.3), mix(c[2], d[2], (s - 0.7) / 0.3)];
}
function hillshade(heights: number[], x: number, y: number, cols: number, rows: number, step: number): number {
    const i = y * cols + x;
    const h = heights[i] ?? 0;
    const hL = heights[y * cols + Math.max(0, x - 1)] ?? h;
    const hR = heights[y * cols + Math.min(cols - 1, x + 1)] ?? h;
    const hT = heights[Math.max(0, y - 1) * cols + x] ?? h;
    const hB = heights[Math.min(rows - 1, y + 1) * cols + x] ?? h;
    const dzdx = (hR - hL) / (2 * (step || 1));
    const dzdy = (hB - hT) / (2 * (step || 1));
    const light = { x: -0.4, y: 0.5, z: 1 };
    const nx = -dzdx;
    const ny = dzdy;
    const nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    const l = Math.hypot(light.x, light.y, light.z) || 1;
    const intensity = (nx * light.x + ny * light.y + nz * light.z) / (len * l);
    return clamp(intensity * 0.55 + 0.5, 0.35, 1.2);
}
function buildTerrainCanvases(data: MapData): {
    base: HTMLCanvasElement;
    zone: HTMLCanvasElement;
} {
    const cols = data.raster.columns;
    const rows = data.raster.rows;
    const base = document.createElement('canvas');
    const zone = document.createElement('canvas');
    base.width = Math.max(1, cols);
    base.height = Math.max(1, rows);
    zone.width = Math.max(1, cols);
    zone.height = Math.max(1, rows);
    const ctxBase = base.getContext('2d');
    const ctxZone = zone.getContext('2d');
    if (!ctxBase || !ctxZone)
        throw new Error('Не удалось инициализировать слой рельефа');
    const zoneColors = data.zones.map((z) => parseColor(z.color));
    const zoneData = ctxZone.createImageData(cols, rows);
    const baseData = ctxBase.createImageData(cols, rows);
    const values = data.raster.heights;
    let min = Infinity;
    let max = -Infinity;
    for (const h of values) {
        if (h < min)
            min = h;
        if (h > max)
            max = h;
    }
    const range = max - min || 1;
    const step = data.raster.stepM;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const h = values[i] ?? 0;
            const tone = heightColor((h - min) / range);
            const shade = hillshade(values, x, y, cols, rows, step);
            const p = ((rows - 1 - y) * cols + x) * 4;
            baseData.data[p] = clamp(Math.round(tone[0] * shade), 0, 255);
            baseData.data[p + 1] = clamp(Math.round(tone[1] * shade), 0, 255);
            baseData.data[p + 2] = clamp(Math.round(tone[2] * shade), 0, 255);
            baseData.data[p + 3] = 255;
            const zoneIndex = Number.isFinite(values[i]!) ? Math.trunc(data.raster.zones[i] ?? -1) : -1;
            const c = zoneColors[zoneIndex];
            if (c) {
                zoneData.data[p] = c[0];
                zoneData.data[p + 1] = c[1];
                zoneData.data[p + 2] = c[2];
                zoneData.data[p + 3] = Math.round(c[3] * 160);
            }
            else {
                zoneData.data[p + 3] = 0;
            }
        }
    }
    ctxBase.putImageData(baseData, 0, 0);
    ctxZone.putImageData(zoneData, 0, 0);
    return { base, zone };
}
function buildContours(data: MapData): Contour[] {
    const cols = data.raster.columns;
    const rows = data.raster.rows;
    const { origin: [originE, originN], stepM, heights } = data.raster;
    let min = Infinity;
    let max = -Infinity;
    for (const h of heights) {
        if (h < min)
            min = h;
        if (h > max)
            max = h;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max)
        return [];
    const result: Contour[] = [];
    const start = Math.ceil(min / 20) * 20;
    const end = Math.floor(max / 20) * 20;
    for (let level = start; level <= end; level += 20) {
        const segments: Segment[] = [];
        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const i = row * cols + col;
                const z0 = heights[i] ?? 0;
                const z1 = heights[i + 1] ?? z0;
                const z2 = heights[i + cols + 1] ?? z1;
                const z3 = heights[i + cols] ?? z0;
                const x0 = originE + col * stepM;
                const x1 = x0 + stepM;
                const y0 = originN + row * stepM;
                const y1 = y0 + stepM;
                const pts: Point2D[] = [];
                const add = (a: number, b: number, xa: number, ya: number, xb: number, yb: number) => {
                    if (a === b)
                        return;
                    const t = (level - a) / (b - a);
                    pts.push({ x: xa + (xb - xa) * t, y: ya + (yb - ya) * t });
                };
                add(z0, z1, x0, y0, x1, y0);
                add(z1, z2, x1, y0, x1, y1);
                add(z2, z3, x1, y1, x0, y1);
                add(z3, z0, x0, y1, x0, y0);
                if (pts.length === 2)
                    segments.push({ a: pts[0]!, b: pts[1]! });
                if (pts.length === 4) {
                    const diag = (z0 + z2) >= (z1 + z3);
                    if (diag) {
                        segments.push({ a: pts[0]!, b: pts[1]! }, { a: pts[2]!, b: pts[3]! });
                    }
                    else {
                        segments.push({ a: pts[1]!, b: pts[2]! }, { a: pts[3]!, b: pts[0]! });
                    }
                }
            }
        }
        if (segments.length)
            result.push({ level, segments });
    }
    return result;
}
function createButton(text: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    return button;
}
function createCheckbox(label: string, checked: boolean): {
    container: HTMLLabelElement;
    input: HTMLInputElement;
} {
    const container = document.createElement('label');
    container.className = 'map-ui__checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    container.append(input, document.createTextNode(label));
    return { container, input };
}
function createLegendPath(className: string, label: string): HTMLElement {
    const line = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = `map-ui__swatch ${className}`;
    line.append(icon, document.createTextNode(label));
    return line;
}
export function createWorldMap(options: MapOptions) {
    const canvas3D = document.querySelector<HTMLCanvasElement>('#world');
    const overlay = document.createElement('section');
    overlay.className = 'map-ui';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Карта маршрута');
    const panel = document.createElement('section');
    panel.className = 'map-ui__panel';
    panel.tabIndex = -1;
    const heading = document.createElement('h2');
    heading.textContent = 'Карта Древлепущи';
    const header = document.createElement('header');
    header.className = 'map-ui__header';
    const actions = document.createElement('div');
    actions.className = 'map-ui__actions';
    const close = createButton('×', 'Закрыть карту');
    close.className = 'map-ui__close';
    const fit = createButton('Вписать', 'Показать всю карту');
    fit.className = 'map-ui__small';
    const center = createButton('К игроку', 'Центрировать на игроке');
    center.className = 'map-ui__small';
    const places = document.createElement('select');
    places.setAttribute('aria-label', 'Места на карте');
    places.append(new Option('Места на карте…', ''));
    actions.append(places, fit, center, close);
    header.append(heading, actions);
    const status = document.createElement('p');
    status.className = 'map-ui__status';
    const retry = createButton('Повторить загрузку', 'Повторить загрузку карты');
    retry.className = 'map-ui__small';
    retry.hidden = true;
    const toggles = document.createElement('div');
    toggles.className = 'map-ui__toggles';
    const zonesToggle = createCheckbox('Зоны', true);
    const contoursToggle = createCheckbox('Контуры высот', false);
    const routeToggle = createCheckbox('Литературный маршрут', false);
    zonesToggle.input.setAttribute('aria-label', 'Показать зоны');
    contoursToggle.input.setAttribute('aria-label', 'Показать высотные контуры');
    routeToggle.input.setAttribute('aria-label', 'Показать литературный маршрут');
    toggles.append(zonesToggle.container, contoursToggle.container, routeToggle.container);
    const mapWrap = document.createElement('div');
    mapWrap.className = 'map-ui__map-wrap';
    const mapCanvas = document.createElement('canvas');
    mapCanvas.className = 'map-ui__map';
    mapWrap.append(mapCanvas);
    const mapCtx = (() => {
        const ctx = mapCanvas.getContext('2d');
        if (!ctx)
            throw new Error('Не удалось инициализировать карту');
        return ctx;
    })();
    const card = document.createElement('aside');
    card.className = 'map-ui__card';
    card.hidden = true;
    const cardName = document.createElement('h3');
    const cardHeight = document.createElement('p');
    const cardZone = document.createElement('p');
    const cardProgress = document.createElement('p');
    const cardAction = createButton('Перейти', 'Перейти к точке');
    const cardClose = createButton('Скрыть', 'Закрыть карточку');
    card.append(cardName, cardHeight, cardZone, cardProgress, cardAction, cardClose);
    const legend = document.createElement('aside');
    legend.className = 'map-ui__legend';
    const legendHeader = document.createElement('p');
    legendHeader.className = 'map-ui__legend-title';
    legendHeader.textContent = 'Легенда';
    const legendZones = document.createElement('div');
    legendZones.className = 'map-ui__legend-section';
    const legendZonesTitle = document.createElement('h4');
    legendZonesTitle.textContent = 'Территории';
    const legendTrails = document.createElement('div');
    legendTrails.className = 'map-ui__legend-section';
    const legendTrailsTitle = document.createElement('h4');
    legendTrailsTitle.textContent = 'Тропы';
    const wornItem = createLegendPath('is-worn', 'Натоптанная тропа');
    const pathItem = createLegendPath('is-path', 'Лесная тропа');
    const traceItem = createLegendPath('is-trace', 'Слабый след');
    legendTrails.append(wornItem, pathItem, traceItem);
    legend.append(legendHeader, legendZonesTitle, legendZones, legendTrailsTitle, legendTrails);
    mapWrap.append(card);
    panel.append(header, status, retry, toggles, mapWrap, legend);
    overlay.append(panel);
    document.body.append(overlay);
    let prepared: PreparedMap | null = null;
    let loadPromise: Promise<PreparedMap> | null = null;
    let isOpen = false;
    let isDisposed = false;
    let rafId = 0;
    let lastRender = 0;
    let activeTravel: ActiveTravel | null = null;
    let selectedPoi: Poi | null = null;
    let parentNotified = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    let lastPoseVersion = '';
    const transform: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    function notifyOpen(opened: boolean) {
        if (parentNotified === opened || isDisposed)
            return;
        parentNotified = opened;
        options.onOpen(opened);
    }
    function withMapBounds() {
        return prepared ? prepared.data.bounds : null;
    }
    function worldToScreen(e: number, n: number) {
        if (!prepared)
            return { x: 0, y: 0 };
        const b = prepared.data.bounds;
        return {
            x: (e - b.minE) * transform.scale + transform.offsetX,
            y: (b.maxN - n) * transform.scale + transform.offsetY,
        };
    }
    function screenToWorld(x: number, y: number): {
        e: number;
        n: number;
    } | null {
        if (!prepared)
            return null;
        const b = prepared.data.bounds;
        return {
            e: (x - transform.offsetX) / transform.scale + b.minE,
            n: b.maxN - (y - transform.offsetY) / transform.scale,
        };
    }
    function drawLine(points: number[][], color: string, width: number, dash?: number[]) {
        if (!prepared || points.length < 2)
            return;
        mapCtx.beginPath();
        const first = worldToScreen(points[0]![0], points[0]![1]);
        mapCtx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
            const p = worldToScreen(points[i]![0], points[i]![1]);
            mapCtx.lineTo(p.x, p.y);
        }
        mapCtx.strokeStyle = color;
        mapCtx.lineWidth = width;
        mapCtx.setLineDash(dash ?? []);
        mapCtx.stroke();
        mapCtx.setLineDash([]);
    }
    function fitToBounds() {
        if (!prepared)
            return;
        const bounds = prepared.data.bounds;
        const rect = mapWrap.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const worldW = Math.max(0.0001, bounds.maxE - bounds.minE);
        const worldH = Math.max(0.0001, bounds.maxN - bounds.minN);
        const margin = Math.max(10, Math.min(width, height) * 0.03);
        const scale = Math.min((width - 2 * margin) / worldW, (height - 2 * margin) / worldH);
        transform.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
        transform.offsetX = (width - worldW * transform.scale) / 2;
        transform.offsetY = (height - worldH * transform.scale) / 2;
    }
    function updateLegendZones() {
        legendZones.textContent = '';
        if (!prepared)
            return;
        for (const zone of prepared.data.zones) {
            const row = document.createElement('span');
            const sw = document.createElement('i');
            sw.className = 'map-ui__swatch';
            sw.style.backgroundColor = zone.color;
            row.append(sw, document.createTextNode(zone.name));
            legendZones.append(row);
        }
    }
    function updateCard(poi: Poi | null) {
        if (!poi) {
            card.hidden = true;
            selectedPoi = null;
            cardProgress.textContent = '';
            cardAction.textContent = 'Перейти';
            cardAction.disabled = false;
            return;
        }
        selectedPoi = poi;
        card.hidden = false;
        cardName.textContent = poi.name;
        cardHeight.textContent = `Высота: ${Math.round(poi.height)} м`;
        const zone = prepared?.data.zones.find((x) => x.id === poi.zone);
        cardZone.textContent = `Зона: ${zone?.name ?? poi.zone}`;
        if (activeTravel) {
            if (activeTravel.poiId === poi.id) {
                cardAction.textContent = 'Отмена';
                cardAction.disabled = false;
            }
        }
        else {
            cardAction.textContent = 'Перейти';
            cardAction.disabled = false;
        }
    }
    function drawTerrain() {
        if (!prepared)
            return;
        const rect = mapWrap.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (mapCanvas.width !== width || mapCanvas.height !== height) {
            mapCanvas.width = width;
            mapCanvas.height = height;
            mapCanvas.style.width = `${Math.floor(rect.width)}px`;
            mapCanvas.style.height = `${Math.floor(rect.height)}px`;
        }
        mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        mapCtx.clearRect(0, 0, rect.width, rect.height);
        mapCtx.fillStyle = PARCHMENT;
        mapCtx.fillRect(0, 0, rect.width, rect.height);
        const raster = prepared.data.raster;
        const baseX = (raster.origin[0] - prepared.data.bounds.minE) * transform.scale + transform.offsetX;
        const baseY = (prepared.data.bounds.maxN - (raster.origin[1] + (raster.rows - 1) * raster.stepM)) * transform.scale + transform.offsetY;
        const baseW = (raster.columns - 1) * raster.stepM * transform.scale;
        const baseH = (raster.rows - 1) * raster.stepM * transform.scale;
        mapCtx.drawImage(prepared.baseCanvas, baseX, baseY, baseW, baseH);
        if (zonesToggle.input.checked) {
            mapCtx.globalAlpha = 0.55;
            mapCtx.drawImage(prepared.zoneCanvas, baseX, baseY, baseW, baseH);
            mapCtx.globalAlpha = 1;
        }
    }
    function drawFeatures() {
        if (!prepared)
            return;
        const rect = mapWrap.getBoundingClientRect();
        const labelRects: LabelRect[] = [];
        for (const line of prepared.data.lines) {
            const kind = line.kind.toLowerCase();
            if (kind.includes('river') || kind.includes('water')) {
                drawLine(line.points, '#2f6da6', 2.2);
            }
            else if (kind.includes('road')) {
                drawLine(line.points, '#7a5532', 2.4);
            }
            else if (kind.includes('boundary') || kind.includes('forest')) {
                drawLine(line.points, '#355734', 3.0);
            }
            else {
                drawLine(line.points, '#4f674a', 1.8);
            }
        }
        for (const trail of prepared.data.trails) {
            if (trail.kind === 'trace' && transform.scale < 2.8)
                continue;
            const color = trail.kind === 'worn' ? TRAIL_WORN : trail.kind === 'path' ? TRAIL_PATH : TRAIL_TRACE;
            const width = trail.kind === 'worn' ? Math.max(1, trail.width * 0.95) : trail.kind === 'path' ? 1.4 : 1.0;
            const dash = trail.kind === 'trace' ? [4, 8] : undefined;
            drawLine(trail.points, color, width, dash);
        }
        if (routeToggle.input.checked && prepared.data.route.length > 1) {
            drawLine(prepared.data.route, TRAIL_TRACE, 1.5, [3, 6]);
        }
        if (contoursToggle.input.checked) {
            mapCtx.strokeStyle = 'rgba(38, 61, 30, 0.55)';
            mapCtx.lineWidth = 1;
            mapCtx.setLineDash([2, 3]);
            for (const contour of prepared.contours) {
                const alpha = contour.level % 100 === 0 ? 0.48 : 0.34;
                mapCtx.globalAlpha = alpha;
                mapCtx.beginPath();
                for (const segment of contour.segments) {
                    const a = worldToScreen(segment.a.x, segment.a.y);
                    const b = worldToScreen(segment.b.x, segment.b.y);
                    mapCtx.moveTo(a.x, a.y);
                    mapCtx.lineTo(b.x, b.y);
                }
                mapCtx.stroke();
            }
            mapCtx.globalAlpha = 1;
            mapCtx.setLineDash([]);
        }
        const labelFont = '12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
        const labelHeight = 14;
        const labelPadding = 4;
        const labelMargin = 4;
        const drawPOILabel = true;
        const labelLimit = transform.scale >= .05 ? 64 : 12;
        let labels = 0;
        for (const poi of prepared.data.pois) {
            const p = worldToScreen(poi.point[0], poi.point[1]);
            if (p.x < -32 || p.x > rect.width + 32 || p.y < -32 || p.y > rect.height + 32)
                continue;
            const r = Math.max(2, Math.min(4, transform.scale * 0.8));
            mapCtx.fillStyle = '#2f4c31';
            mapCtx.beginPath();
            mapCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
            mapCtx.fill();
            mapCtx.fillStyle = '#d9d0a8';
            mapCtx.beginPath();
            mapCtx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
            mapCtx.stroke();
            const marker = { x: p.x - (r + 2), y: p.y - (r + 2), w: (r + 2) * 2, h: (r + 2) * 2 };
            labelRects.push(marker);
            if (!drawPOILabel || labels >= labelLimit)
                continue;
            const text = `${poi.name} · ${Math.round(poi.height)} м`;
            mapCtx.font = labelFont;
            mapCtx.textBaseline = 'top';
            const textW = mapCtx.measureText(text).width;
            const candidates = [
                { x: p.x + r + 4, y: p.y - labelHeight },
                { x: p.x - textW - 4, y: p.y - labelHeight },
                { x: p.x - textW * 0.5, y: p.y + r + 5 },
                { x: p.x - textW * 0.5, y: p.y - r - labelHeight - 5 },
            ];
            let placed = false;
            for (const candidate of candidates) {
                const box: LabelRect = {
                    x: candidate.x - labelPadding,
                    y: candidate.y - 1,
                    w: textW + labelPadding * 2,
                    h: labelHeight + 2,
                };
                if (box.x < 0 || box.y < 0 || box.x + box.w > rect.width || box.y + box.h > rect.height)
                    continue;
                if (labelRects.some((item) => item !== marker && rectIntersects(box, item, labelMargin)))
                    continue;
                mapCtx.fillStyle = 'rgba(255,255,255,0.88)';
                mapCtx.fillRect(box.x, box.y, box.w, box.h);
                mapCtx.strokeStyle = 'rgba(28,40,18,0.35)';
                mapCtx.strokeRect(box.x, box.y, box.w, box.h);
                mapCtx.fillStyle = TEXT;
                mapCtx.fillText(text, box.x + labelPadding, box.y + 2);
                labelRects.push(box);
                labels++;
                placed = true;
                break;
            }
            if (!placed) {
                continue;
            }
        }
        const playerPose = options.pose();
        const player = worldToScreen(playerPose.e, playerPose.n);
        const isVisible = player.x > -40 && player.x < rect.width + 40 && player.y > -40 && player.y < rect.height + 40;
        if (isVisible) {
            const half = (playerPose.fov * Math.PI) / 360;
            const dir = (playerPose.yaw * Math.PI) / 180 - Math.PI / 2;
            const coneRadius = Math.min(rect.width, rect.height) * 0.2;
            mapCtx.fillStyle = 'rgba(35, 75, 31, 0.14)';
            mapCtx.beginPath();
            mapCtx.moveTo(player.x, player.y);
            mapCtx.arc(player.x, player.y, coneRadius, dir - half, dir + half);
            mapCtx.closePath();
            mapCtx.fill();
            const arrow = 16;
            const head = { x: player.x + Math.cos(dir) * arrow, y: player.y + Math.sin(dir) * arrow };
            mapCtx.fillStyle = TEXT;
            mapCtx.beginPath();
            mapCtx.moveTo(player.x + Math.cos(dir + 1.6) * 5, player.y + Math.sin(dir + 1.6) * 5);
            mapCtx.lineTo(head.x, head.y);
            mapCtx.lineTo(player.x + Math.cos(dir - 1.6) * 5, player.y + Math.sin(dir - 1.6) * 5);
            mapCtx.closePath();
            mapCtx.fill();
            mapCtx.beginPath();
            mapCtx.arc(player.x, player.y, 3, 0, Math.PI * 2);
            mapCtx.fill();
        }
    }
    function render(force = false) {
        const now = performance.now();
        if (!isOpen || isDisposed || !prepared)
            return;
        if (!force && now - lastRender < 100)
            return;
        lastRender = now;
        const poseVersion = `${options.pose().e.toFixed(2)};${options.pose().n.toFixed(2)};${options.pose().yaw.toFixed(2)};${options.pose().fov.toFixed(2)}`;
        const poseChanged = poseVersion !== lastPoseVersion;
        lastPoseVersion = poseVersion;
        drawTerrain();
        if (!poseChanged && !legend.hidden && force === false) {
            // still redraw at throttled rate; keep.
        }
        drawFeatures();
    }
    function loopFrame(time: number) {
        if (!isOpen || isDisposed) {
            rafId = 0;
            return;
        }
        render();
        rafId = requestAnimationFrame(loopFrame);
    }
    function startLoop() {
        if (rafId || !isOpen)
            return;
        lastRender = 0;
        rafId = requestAnimationFrame(loopFrame);
    }
    function stopLoop() {
        if (!rafId)
            return;
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
    async function ensureMapData(): Promise<PreparedMap> {
        if (prepared)
            return prepared;
        if (!loadPromise) {
            loadPromise = (async () => {
                const data = await options.load();
                const canvases = buildTerrainCanvases(data);
                const contours = buildContours(data);
                prepared = { data, baseCanvas: canvases.base, zoneCanvas: canvases.zone, contours };
                return prepared;
            })();
        }
        return loadPromise;
    }
    function setLoading(message: string, canRetry: boolean) {
        status.textContent = message;
        retry.hidden = !canRetry;
    }
    function openMap(retryLoad = false) {
        if ((isOpen && !retryLoad) || isDisposed)
            return Promise.resolve();
        isOpen = true;
        overlay.hidden = false;
        mapWrap.focus({ preventScroll: true });
        setLoading('Загрузка карты…', false);
        fit.disabled = true;
        center.disabled = true;
        zonesToggle.input.disabled = true;
        contoursToggle.input.disabled = true;
        routeToggle.input.disabled = true;
        retry.hidden = true;
        notifyOpen(true);
        startLoop();
        return ensureMapData()
            .then(() => {
            if (!isOpen || isDisposed)
                return;
            fit.disabled = false;
            if (places.options.length === 1)
                for (const poi of prepared!.data.pois)
                    places.add(new Option(poi.name, poi.id));
            center.disabled = false;
            zonesToggle.input.disabled = false;
            contoursToggle.input.disabled = false;
            routeToggle.input.disabled = false;
            setLoading('Готово: клик по карте. Поверните колёсико для приближения.', false);
            fitToBounds();
            updateLegendZones();
            render(true);
        })
            .catch((error) => {
            if (!isOpen || isDisposed)
                return;
            setLoading(`Ошибка загрузки карты: ${error instanceof Error ? error.message : String(error)}`, true);
        });
    }
    function closeMap() {
        if (!isOpen)
            return;
        isOpen = false;
        overlay.hidden = true;
        stopLoop();
        if (activeTravel) {
            activeTravel.controller.abort();
            activeTravel = null;
        }
        updateCard(null);
        notifyOpen(false);
        cardProgress.textContent = '';
        mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
        canvas3D?.focus({ preventScroll: true });
    }
    function dispose() {
        isDisposed = true;
        closeMap();
        overlay.remove();
        panel.remove();
        removeListeners();
    }
    function setPoiCardAt(x: number, y: number) {
        if (!prepared)
            return;
        const rect = mapWrap.getBoundingClientRect();
        const world = screenToWorld(x - rect.left, y - rect.top);
        if (!world)
            return;
        const maxMeters = Math.max(8, 12 / transform.scale);
        let best: Poi | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const poi of prepared.data.pois) {
            const dx = poi.point[0] - world.e;
            const dy = poi.point[1] - world.n;
            const d = Math.hypot(dx, dy);
            if (d <= maxMeters && d < bestDistance) {
                bestDistance = d;
                best = poi;
            }
        }
        updateCard(best);
    }
    function startTravel(poi: Poi) {
        activeTravel?.controller.abort();
        const ctrl = new AbortController();
        activeTravel = { poiId: poi.id, controller: ctrl };
        cardAction.textContent = 'Отмена';
        cardProgress.textContent = 'Подготовка перемещения…';
        cardAction.disabled = false;
        options.travel(poi.id, ctrl.signal, (text: string) => {
            if (activeTravel?.controller === ctrl && isOpen) {
                cardProgress.textContent = text || 'Перемещение…';
            }
        }).then(() => {
            if (activeTravel?.controller === ctrl && !ctrl.signal.aborted && isOpen) {
                closeMap();
            }
        }).catch((error) => {
            if (!isDisposed && isOpen && activeTravel?.controller === ctrl && !(error instanceof DOMException && error.name === 'AbortError')) {
                cardProgress.textContent = `Ошибка: ${error instanceof Error ? error.message : String(error)}`;
            }
        }).finally(() => {
            if (activeTravel?.controller === ctrl) {
                activeTravel = null;
                cardAction.textContent = 'Перейти';
                cardAction.disabled = false;
            }
        });
    }
    function onWheel(event: WheelEvent) {
        if (!isOpen || !prepared || isDisposed)
            return;
        event.preventDefault();
        const rect = mapWrap.getBoundingClientRect();
        const sx = event.clientX - rect.left;
        const sy = event.clientY - rect.top;
        const before = screenToWorld(sx, sy);
        if (!before)
            return;
        const factor = Math.exp(-event.deltaY * 0.001);
        transform.scale = clamp(transform.scale * factor, MIN_ZOOM, MAX_ZOOM);
        const b = prepared.data.bounds;
        transform.offsetX = sx - (before.e - b.minE) * transform.scale;
        transform.offsetY = sy - (b.maxN - before.n) * transform.scale;
        render(true);
    }
    function onPointerDown(event: PointerEvent) {
        if (!isOpen || isDisposed)
            return;
        if (event.button !== 0)
            return;
        dragging = true;
        moved = false;
        lastX = event.clientX;
        lastY = event.clientY;
        mapCanvas.setPointerCapture(event.pointerId);
    }
    function onPointerMove(event: PointerEvent) {
        if (!isOpen || isDisposed || !dragging)
            return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2)
            moved = true;
        transform.offsetX += dx;
        transform.offsetY += dy;
        lastX = event.clientX;
        lastY = event.clientY;
        render(true);
    }
    function onPointerUp(event: PointerEvent) {
        if (!isOpen || isDisposed)
            return;
        if (!dragging)
            return;
        mapCanvas.releasePointerCapture(event.pointerId);
        if (!moved) {
            setPoiCardAt(event.clientX, event.clientY);
        }
        dragging = false;
    }
    function onResize() {
        if (!isOpen || isDisposed || !prepared)
            return;
        fitToBounds();
        render(true);
    }
    function onKeyDown(event: KeyboardEvent) {
        if (!isOpen || isDisposed)
            return;
        if (event.code === 'Escape' || event.code === 'KeyM') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMap();
        }
    }
    function removeListeners() {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        mapCanvas.removeEventListener('wheel', onWheel);
        mapCanvas.removeEventListener('pointerdown', onPointerDown);
        mapCanvas.removeEventListener('pointermove', onPointerMove);
        mapCanvas.removeEventListener('pointerup', onPointerUp);
        mapCanvas.removeEventListener('pointercancel', onPointerUp);
        mapCanvas.removeEventListener('lostpointercapture', onPointerUp);
    }
    function addListeners() {
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKeyDown);
        mapCanvas.addEventListener('wheel', onWheel, { passive: false });
        mapCanvas.addEventListener('pointerdown', onPointerDown);
        mapCanvas.addEventListener('pointermove', onPointerMove);
        mapCanvas.addEventListener('pointerup', onPointerUp);
        mapCanvas.addEventListener('pointercancel', onPointerUp);
        mapCanvas.addEventListener('lostpointercapture', onPointerUp);
    }
    places.addEventListener('change', () => { if (!prepared)
        return; const poi = prepared.data.pois.find(p => p.id === places.value); if (!poi)
        return; updateCard(poi); const b = prepared.data.bounds; transform.scale = Math.max(transform.scale, .06); transform.offsetX = mapWrap.clientWidth / 2 - (poi.point[0] - b.minE) * transform.scale; transform.offsetY = mapWrap.clientHeight / 2 - (b.maxN - poi.point[1]) * transform.scale; render(true); });
    fit.addEventListener('click', () => {
        if (prepared) {
            fitToBounds();
            render(true);
        }
    });
    center.addEventListener('click', () => {
        if (!prepared)
            return;
        const pose = options.pose();
        const bounds = withMapBounds();
        if (!bounds)
            return;
        transform.offsetX = mapWrap.clientWidth / 2 - (pose.e - bounds.minE) * transform.scale;
        transform.offsetY = mapWrap.clientHeight / 2 - (bounds.maxN - pose.n) * transform.scale;
        render(true);
    });
    retry.addEventListener('click', () => {
        if (isDisposed || !isOpen)
            return;
        loadPromise = null;
        prepared = null;
        void openMap(true);
    });
    close.addEventListener('click', closeMap);
    zonesToggle.input.addEventListener('change', () => render(true));
    contoursToggle.input.addEventListener('change', () => render(true));
    routeToggle.input.addEventListener('change', () => render(true));
    cardClose.addEventListener('click', () => updateCard(null));
    cardAction.addEventListener('click', () => {
        if (!selectedPoi || !prepared || isDisposed)
            return;
        if (activeTravel?.poiId === selectedPoi.id) {
            activeTravel.controller.abort();
            activeTravel = null;
            updateCard(selectedPoi);
            cardProgress.textContent = 'Перемещение отменено.';
            return;
        }
        cardProgress.textContent = '';
        startTravel(selectedPoi);
    });
    addListeners();
    return {
        open: openMap,
        close: closeMap,
        isOpen: () => isOpen,
        dispose,
    };
}
