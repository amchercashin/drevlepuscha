/**
 * Dependency-free authoring helpers, not an engine implementation.
 * Coordinates: local EN metres. No DOM, Babylon, wall clock or random global state.
 */
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lineLength = points => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
export function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
}
export function storageInfo(source) {
  const b = source.playBounds, s = source.storage.tileSizeM;
  const bounds = { minE: Math.floor(b.minE / s) * s, maxE: Math.ceil(b.maxE / s) * s, minN: Math.floor(b.minN / s) * s, maxN: Math.ceil(b.maxN / s) * s };
  const columns = (bounds.maxE - bounds.minE) / s, rows = (bounds.maxN - bounds.minN) / s;
  const tiles = [];
  for (let n = bounds.minN / s; n < bounds.maxN / s; n++) for (let e = bounds.minE / s; e < bounds.maxE / s; e++) tiles.push(`${e},${n}`);
  return { bounds, columns, rows, count: columns * rows, tiles };
}
export function nearestStation(e, n, stations) {
  let best = { distance: Infinity };
  let along = 0;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i], de = b[0] - a[0], dn = b[1] - a[1], d2 = de * de + dn * dn;
    if (d2 === 0) continue;
    const t = clamp(((e - a[0]) * de + (n - a[1]) * dn) / d2), x = a[0] + t * de, y = a[1] + t * dn;
    const d = Math.hypot(e - x, n - y);
    if (d < best.distance) best = { distance: d, e: x, n: y, alongM: along + t * Math.sqrt(d2), segment: i - 1, t, level: a[2] + t * (b[2] - a[2]), width: a[3] + t * (b[3] - a[3]), depth: a[4] + t * (b[4] - a[4]) };
    along += Math.sqrt(d2);
  }
  return best;
}
// Smooth, bounded field in absolute EN: independent of tile/visit order.
function lattice(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
export function reliefNoise(e, n, scale, seed) {
  const x = e / scale, y = n / scale, ix = Math.floor(x), iy = Math.floor(y);
  const u = smooth(x - ix), v = smooth(y - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
/** Preview bed/terrain only: bridge decks and exact road grading deliberately excluded. */
export function previewHeight(source, e, n, detailed = true) {
  let h = source.terrain.baseHeightM;
  for (const form of [...source.landforms, ...(detailed ? source.terrainRefinement?.forms ?? [] : [])]) {
    const a = form.rotationDeg * Math.PI / 180, x = e - form.center[0], y = n - form.center[1];
    const u = (x * Math.cos(a) + y * Math.sin(a)) / form.radiusM[0], v = (-x * Math.sin(a) + y * Math.cos(a)) / form.radiusM[1];
    h += form.amplitudeM * Math.exp(-(u * u + v * v));
  }
  h += source.terrain.noiseAmplitudeM * Math.sin(e * .011 + .8) * Math.cos(n * .014 - .3);
  if (detailed && source.terrainRefinement?.rollingGround) {
    const ground = source.terrainRefinement.rollingGround;
    let weight = 1;
    for (const meadow of ground.meadows) weight *= smooth(distance([e,n], meadow.center) / meadow.radiusM);
    for (const [i, layer] of ground.layers.entries()) h += weight * layer.amplitudeM * reliefNoise(e, n, layer.scaleM, source.worldSeed + i * 101);
  }
  let bed = Infinity;
  for (const river of source.rivers) {
    const q = nearestStation(e, n, river.stations);
    const relief=detailed?source.terrainRefinement?.surfaceRelief:null;
    let protectedWeight=1;
    if(relief)for(const poi of source.pois.filter(p=>/BRIDGE|SHALLOWS|LANDING/.test(p.id)))protectedWeight*=smooth((distance([q.e,q.n],poi.point)-100)/150);
    const along=q.alongM+(river.chainageOffsetM??0);
    // Expand small coves outside the authored navigation corridor; never narrow its deep axis.
    const half=q.width/2+(relief?protectedWeight*relief.shoreIrregularityM*(.5+.5*reliefNoise(along,0,45,source.worldSeed+922)):0);
    let depth = q.depth;
    if (river.id === 'the-water') {
      const ford = source.pois.find(p => p.id === 'WATER_SHALLOWS').point;
      depth += (.2 - depth) * (1 - smooth(distance([q.e, q.n], ford) / 32));
    }
    if (q.distance <= half) {
      // Union of submerged beds at the confluence; never flatten a bridge into the river.
      bed = Math.min(bed, q.level - depth * (1 - (q.distance / half) ** 2));
    } else {
      const profile = bankProfile(source, river, q, e, n, detailed);
      const bank = q.level + profile.heightM * smooth((q.distance - half) / profile.widthM);
      // The old constant floodplain target shaved off every hill behind the bank.
      // Retain part of the authored relief on the dry terrace, blending from the graded shore.
      const terrace = relief ? smooth((q.distance-half-profile.widthM)/65)*Math.max(0,h-source.terrain.baseHeightM)*.55 : 0;
      const flood = q.level + profile.heightM + .002 * Math.max(0, q.distance - half - profile.widthM) + terrace;
      const target = q.distance < half + profile.widthM ? bank : flood;
      const weight = 1 - smooth((q.distance - profile.floodplainHalfWidthM) / profile.blendM);
      if (weight > 0) h = Math.min(h, h + (target - h) * weight);
    }
  }
  if(Number.isFinite(bed))return bed;
  const relief=detailed?source.terrainRefinement?.surfaceRelief:null;
  if(relief){
    const dry=smooth(Math.max(0,h-Math.max(...source.rivers.map(r=>nearestStation(e,n,r.stations).level)))/2);
    let protect=1;for(const p of source.pois)protect*=smooth(distance([e,n],p.point)/(/LANDING|BRIDGE|SHALLOWS/.test(p.id)?32:8));
    h+=dry*protect*(relief.shoulderAmplitudeM*reliefNoise(e,n,relief.shoulderScaleM,source.worldSeed+1409)+relief.hummockAmplitudeM*reliefNoise(e,n,relief.hummockScaleM,source.worldSeed+1721));
  }
  return h;
}
/** Side is relative to the downstream river axis; left/right never mean screen side. */
export function bankProfile(source, river, q, e, n, detailed = true) {
  let heightM = river.bankHeightM, widthM = 12;
  let floodplainHalfWidthM = river.floodplainHalfWidthM, blendM = river.blendM;
  if (!detailed) return { heightM, widthM, floodplainHalfWidthM, blendM };
  const a = river.stations[q.segment], b = river.stations[q.segment + 1];
  const side = (b[0] - a[0]) * (n - q.n) - (b[1] - a[1]) * (e - q.e) >= 0 ? 'left' : 'right';
  const variation = source.terrainRefinement?.riverValleys?.find(v => v.riverId === river.id);
  if (variation) {
    const seed = source.worldSeed + (side === 'left' ? 311 : 877);
    const alongM = q.alongM + (river.chainageOffsetM ?? 0);
    const broad = reliefNoise(alongM, 0, variation.scaleM, seed);
    const local = reliefNoise(alongM, 0, variation.scaleM * .37, seed + 31);
    const rise = .75 * broad + .25 * local;
    heightM = variation.meanHeightM + variation.heightAmplitudeM * rise;
    widthM = variation.meanWidthM * (1 + .3 * local);
    floodplainHalfWidthM = variation.floodplainHalfWidthM * (1 + .25 * broad);
    blendM = variation.blendM * (1 + .2 * local);
    // Local level meadows/landings remain deliberate places within a varied bank.
  }
  for (const reach of source.terrainRefinement?.bankProfiles ?? []) {
    if (reach.riverId !== river.id || (reach.side !== 'both' && reach.side !== side)) continue;
    const weight = 1 - smooth(distance([q.e, q.n], reach.center) / reach.radiusM);
    heightM += (reach.heightM - heightM) * weight;
    widthM += (reach.widthM - widthM) * weight;
  }
  return { heightM, widthM, floodplainHalfWidthM, blendM };
}
export function previewWater(source, e, n, state = source.states.defaultWater) {
  if (!(state in source.states.waterLevelsM)) throw new Error(`Unknown water state ${state}`);
  const bodies = source.rivers.map(r => ({ id: r.id, ...nearestStation(e, n, r.stations) })).filter(q => q.distance <= q.width / 2 + 64);
  if (!bodies.length) return null;
  const level = Math.max(...bodies.map(q => q.level)) + source.states.waterLevelsM[state];
  const depth = level - previewHeight(source, e, n);
  return depth >= -1e-7 ? { level, depth: Math.max(0, depth), bodies: bodies.map(q => q.id) } : null;
}
function intersection(a, b, c, d) {
  const x = b[0] - a[0], y = b[1] - a[1], u = d[0] - c[0], v = d[1] - c[1], den = x * v - y * u;
  if (Math.abs(den) < 1e-9) {
    if (Math.abs((c[0] - a[0]) * y - (c[1] - a[1]) * x) > 1e-8) return null;
    const length2 = x * x + y * y;
    if (!length2) return null;
    const t0 = ((c[0] - a[0]) * x + (c[1] - a[1]) * y) / length2;
    const t1 = ((d[0] - a[0]) * x + (d[1] - a[1]) * y) / length2;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    return lo <= hi ? [a[0] + x * (lo + hi) / 2, a[1] + y * (lo + hi) / 2] : null;
  }
  const dx = c[0] - a[0], dy = c[1] - a[1], t = (dx * v - dy * u) / den, s = (dx * y - dy * x) / den;
  return t >= -1e-8 && t <= 1 + 1e-8 && s >= -1e-8 && s <= 1 + 1e-8 ? [a[0] + x * t, a[1] + y * t] : null;
}
export function lineIntersections(a, b) {
  const hits = [];
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const hit = intersection(a[i - 1], a[i], b[j - 1], b[j]);
    if (hit && !hits.some(p => distance(p, hit) < 1e-5)) hits.push(hit);
  }
  return hits;
}
export function validateSource(source) {
  const errors = [], b = source.playBounds;
  const fail = message => errors.push(message);
  const collections = ['pois', 'rivers', 'roads', 'hedges', 'forests', 'landforms'];
  for (const key of collections) if (!Array.isArray(source[key])) fail(`Missing array ${key}`);
  if (errors.length) return { ok: false, errors };
  for (const [name, items] of [...collections.map(k => [k, source[k]]), ...['nodes', 'edges', 'crossings'].map(k => [k, source.topology[k]])]) {
    const ids = new Set();
    for (const item of items) { if (!item.id || ids.has(item.id)) fail(`Duplicate/missing ${name} id: ${item.id}`); ids.add(item.id); }
  }
  const finitePoint = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite);
  if (source.coordinateSystem?.kind !== 'LOCAL_EN_METRES' || source.coordinateSystem?.origin !== 'BRIDGE') fail('Expected local EN metres at BRIDGE');
  if (!b || !Object.values(b).every(Number.isFinite) || b.minE >= b.maxE || b.minN >= b.maxN) fail('Invalid bounds');
  if (!Number.isInteger(source.worldSeed)) fail('Invalid seed');
  for (const key of ['tileSizeM', 'renderPatchSizeM', 'previewStepM', 'productionSampleStepM', 'detailStepM']) if (!(source.storage[key] > 0) || !Number.isFinite(source.storage[key])) fail(`Invalid storage ${key}`);
  for (const key of ['baseHeightM', 'noiseAmplitudeM']) if (!Number.isFinite(source.terrain[key])) fail(`Invalid terrain ${key}`);
  for (const [id, p] of Object.entries(source.profiles)) if (!(p.walkMps > 0) || !Number.isFinite(p.walkMps)) fail(`Invalid profile ${id}`);
  for (const value of Object.values(source.states.waterLevelsM)) if (!Number.isFinite(value)) fail('Invalid water level');
  for (const r of source.rivers) {
    if (r.stations.length < 2 || r.stations.some(p => p.length !== 5 || !p.every(Number.isFinite) || p[3] <= 0 || p[4] <= 0)) fail(`Invalid stations ${r.id}`);
    for (let i = 1; i < r.stations.length; i++) if (r.stations[i][2] > r.stations[i - 1][2] || distance(r.stations[i], r.stations[i - 1]) === 0) fail(`Invalid downstream profile ${r.id}`);
    for (const key of ['floodplainHalfWidthM', 'blendM', 'bankHeightM']) if (!(r[key] > 0) || !Number.isFinite(r[key])) fail(`Invalid river ${r.id}/${key}`);
  }
  for (const item of [...source.roads, ...source.hedges]) if (item.points.length < 2 || item.points.some(p => !finitePoint(p))) fail(`Invalid line ${item.id}`);
  for (const f of source.forests) if (f.polygon.length < 3 || f.polygon.some(p => !finitePoint(p))) fail(`Invalid polygon ${f.id}`);
  const forms = [...source.landforms, ...(source.terrainRefinement?.forms ?? [])];
  if (new Set(forms.map(f => f.id)).size !== forms.length) fail('Duplicate landform id');
  for (const f of forms) if (!finitePoint(f.center) || !finitePoint(f.radiusM) || !f.radiusM.every(v => v > 0) || !Number.isFinite(f.rotationDeg) || !Number.isFinite(f.amplitudeM)) fail(`Invalid landform ${f.id}`);
  const banks = source.terrainRefinement?.bankProfiles ?? [];
  for (const layer of source.terrainRefinement?.rollingGround?.layers ?? []) if (![layer.scaleM,layer.amplitudeM].every(v => Number.isFinite(v) && v > 0)) fail('Invalid rolling ground layer');
  for (const meadow of source.terrainRefinement?.rollingGround?.meadows ?? []) if (!finitePoint(meadow.center) || !(meadow.radiusM > 0)) fail('Invalid meadow');
  for (const v of source.terrainRefinement?.riverValleys ?? []) if (!source.rivers.some(r => r.id === v.riverId) || !['scaleM','meanHeightM','heightAmplitudeM','meanWidthM','floodplainHalfWidthM','blendM'].every(k => Number.isFinite(v[k]) && v[k] > 0) || v.heightAmplitudeM >= v.meanHeightM) fail('Invalid river valley');
  if (new Set(banks.map(f => f.id)).size !== banks.length) fail('Duplicate bank profile id');
  for (const p of banks) if (!source.rivers.some(r => r.id === p.riverId) || !finitePoint(p.center) || !['left','right','both'].includes(p.side) || ![p.radiusM,p.widthM,p.heightM].every(v => Number.isFinite(v) && v > 0)) fail(`Invalid bank profile ${p.id}`);
  for (const p of source.terrainRefinement?.sections ?? []) if (p.points.length < 2 || p.points.some(q => !finitePoint(q))) fail(`Invalid section ${p.id}`);
  if (errors.length) return { ok: false, errors };
  const inside = p => p[0] >= b.minE && p[0] <= b.maxE && p[1] >= b.minN && p[1] <= b.maxN;
  for (const p of [...source.pois, ...source.topology.nodes]) if (!finitePoint(p.point) || !inside(p.point)) fail(`Invalid point ${p.id}`);
  const nodes = new Map(source.topology.nodes.map(n => [n.id, n]));
  const crossings = new Map(source.topology.crossings.map(c => [c.id, c]));
  const boatIds = new Set();
  for (const c of crossings.values()) {
    if (c.endpoints.length !== 2 || c.endpoints[0] === c.endpoints[1] || c.endpoints.some(id => !nodes.has(id))) fail(`Invalid crossing endpoints ${c.id}`);
    if (!c.profiles?.length || c.profiles.some(p => !(p in source.profiles))) fail(`Invalid crossing profiles ${c.id}`);
    if (c.kind === 'boat') {
      if (!c.boatId || boatIds.has(c.boatId) || ![-1,0,1].includes(c.initialSide) || !Number.isFinite(c.speedMps) || c.speedMps <= 0 || !Number.isFinite(c.boardingSeconds) || c.boardingSeconds < 0) fail(`Invalid boat ${c.id}`);
      boatIds.add(c.boatId);
    }
  }
  for (const e of source.topology.edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) { fail(`Unknown node in ${e.id}`); continue; }
    if (e.points.length < 2 || e.points.some(p => !finitePoint(p) || !inside(p))) { fail(`Invalid geometry ${e.id}`); continue; }
    if (!e.profiles?.length || e.profiles.some(p => !(p in source.profiles))) fail(`Invalid edge profiles ${e.id}`);
    if (distance(e.points[0], nodes.get(e.from).point) > .01 || distance(e.points.at(-1), nodes.get(e.to).point) > .01) fail(`Endpoint mismatch ${e.id}`);
    if (lineLength(e.points) <= 0) fail(`Zero length ${e.id}`);
    const crossing = e.crossingId && crossings.get(e.crossingId);
    if (e.crossingId && !crossing) fail(`Unknown crossing ${e.id}`);
    if (crossing && ![e.from, e.to].every(n => crossing.endpoints.includes(n))) fail(`Crossing endpoints ${e.id}`);
    if (crossing && crossing.kind !== e.kind) fail(`Crossing kind ${e.id}`);
    for (const river of source.rivers) if (lineIntersections(e.points, river.stations).length && crossing?.waterId !== river.id) fail(`Unauthorized water crossing ${e.id}/${river.id}`);
    for (const hedge of source.hedges) if (lineIntersections(e.points, hedge.points).length && crossing?.barrierId !== hedge.id) fail(`Unauthorized hedge crossing ${e.id}/${hedge.id}`);
  }
  for (const f of source.forests) {
    if (polygonArea(f.polygon) <= 0) fail(`Empty forest ${f.id}`);
    if (Math.abs(Object.values(f.speciesWeights).reduce((s, v) => s + v, 0) - 1) > 1e-8) fail(`Species weights ${f.id}`);
  }
  const water = source.rivers.find(r => r.id === 'the-water'), main = source.rivers.find(r => r.id === 'brandywine');
  const mouth = water.stations.at(-1), q = nearestStation(mouth[0], mouth[1], main.stations);
  if (q.distance > .01 || Math.abs(q.level - mouth[2]) > .01) fail('Confluence position/level mismatch');
  return { ok: errors.length === 0, errors, counts: { pois: source.pois.length, nodes: nodes.size, edges: source.topology.edges.length, crossings: crossings.size }, storage: storageInfo(source) };
}
/** Boat positions are state variables. A boat cannot be used from the opposite bank. */
export function findRoute(source, start, goal, options = {}) {
  const { profile = 'ranger', water = 'normal', boats = true, bridgeOpen = true, gateOpen = true, disabledEdges = [], boatSides } = options;
  if (!(profile in source.profiles)) throw new Error(`Unknown profile ${profile}`);
  if (!(water in source.states.waterLevelsM)) throw new Error(`Unknown water state ${water}`);
  const nodes = new Map(source.topology.nodes.map(n => [n.id, n]));
  if (!nodes.has(start) || !nodes.has(goal)) throw new Error('Unknown start or goal');
  const crossings = new Map(source.topology.crossings.map(c => [c.id, c]));
  const boatList = source.topology.crossings.filter(c => c.kind === 'boat');
  const initial = boatList.map(c => boats ? (boatSides?.[c.boatId] ?? c.initialSide) : -1);
  if (initial.some(v => ![-1, 0, 1].includes(v))) throw new Error('Boat side must be -1, 0 or 1');
  const boatIndex = new Map(boatList.map((c, i) => [c.id, i])), disabled = new Set(disabledEdges);
  const key = (node, sides) => `${node}|${sides.join(',')}`;
  const root = { node: start, sides: initial, cost: 0, length: 0, edges: [], nodes: [start] };
  const queue = [root], costs = new Map([[key(start, initial), 0]]);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.node.localeCompare(b.node));
    const item = queue.shift();
    if (item.cost > costs.get(key(item.node, item.sides))) continue;
    if (item.node === goal) return { ...item, seconds: item.cost, finalBoatSides: Object.fromEntries(boatList.map((c, i) => [c.boatId, item.sides[i]])) };
    for (const edge of source.topology.edges) {
      if (disabled.has(edge.id) || !edge.profiles.includes(profile)) continue;
      const reverse = edge.to === item.node && edge.bidirectional;
      if (edge.from !== item.node && !reverse) continue;
      const next = reverse ? edge.from : edge.to, cross = edge.crossingId && crossings.get(edge.crossingId);
      if (cross && !cross.profiles.includes(profile)) continue;
      if (cross?.id === 'main-bridge' && !bridgeOpen) continue;
      if (cross?.kind === 'gate' && !gateOpen) continue;
      if (cross?.kind === 'ford' && !cross.waterStates.includes(water)) continue;
      const sides = item.sides.slice(), length = lineLength(edge.points);
      let seconds = length / source.profiles[profile].walkMps;
      if (cross?.kind === 'boat') {
        const i = boatIndex.get(cross.id), fromSide = cross.endpoints.indexOf(item.node);
        if (sides[i] !== fromSide) continue;
        sides[i] = 1 - fromSide;
        seconds = length / cross.speedMps + cross.boardingSeconds;
      }
      const cost = item.cost + seconds, k = key(next, sides);
      if (cost < (costs.get(k) ?? Infinity) - 1e-8) {
        costs.set(k, cost); queue.push({ node: next, sides, cost, length: item.length + length, edges: [...item.edges, edge.id], nodes: [...item.nodes, next] });
      }
    }
  }
  return null;
}
