import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { validate } from './schema-validator.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const nonempty = x => typeof x === 'string' && x.length > 0;
const ordered = b => b.minE < b.maxE && b.minN < b.maxN;

/** Every sourceId/sourceRefs occurrence is checked, including nested POIs. */
export function provenanceErrors(value, sourceIds, path = '$') {
  const errors = [];
  if (Array.isArray(value)) return value.flatMap((v, i) => provenanceErrors(v, sourceIds, `${path}[${i}]`));
  if (!record(value)) return errors;
  if ('sourceId' in value && !sourceIds.has(value.sourceId)) errors.push(`${path}: unknown sourceId ${value.sourceId}`);
  if ('sourceRefs' in value) {
    const refs = value.sourceRefs;
    if (!Array.isArray(refs) || !refs.length || !refs.every(nonempty)) errors.push(`${path}: invalid sourceRefs`);
    else {
      if (new Set(refs).size !== refs.length) errors.push(`${path}: duplicate sourceRefs`);
      for (const ref of refs) if (!sourceIds.has(ref)) errors.push(`${path}: unknown sourceRef ${ref}`);
    }
  }
  for (const [key, child] of Object.entries(value)) errors.push(...provenanceErrors(child, sourceIds, `${path}.${key}`));
  return errors;
}

/** Called after structural validation. This fixture has no canonical geography. */
export function semanticRegionErrors(region) {
  const errors = [];
  const b = region.bounds;
  if (!ordered(b)) errors.push('Invalid bounds ordering');
  const within = p => p.e >= b.minE && p.e <= b.maxE && p.n >= b.minN && p.n <= b.maxN;
  const allIds = [];
  for (const river of region.rivers) {
    allIds.push(river.id);
    river.stations.forEach((p, i) => {
      if (!within(p)) errors.push(`River outside bounds: ${river.id}`);
      if (i && p.h > river.stations[i - 1].h) errors.push(`River rises downstream: ${river.id}`);
    });
  }
  for (const path of region.paths) {
    allIds.push(path.id);
    if (!path.points.every(within)) errors.push(`Path outside bounds: ${path.id}`);
  }
  for (const place of region.places) {
    allIds.push(place.id);
    if (!within(place.position)) errors.push(`Place outside bounds: ${place.id}`);
    if (region.coordinateFrame === 'sandbox-local-enh' && place.provenance.status !== 'invented') errors.push(`Sandbox POI must be explicitly invented: ${place.id}`);
  }
  if (!within(region.artFocus)) errors.push('Art focus outside bounds');
  if (new Set(allIds).size !== allIds.length) errors.push('Duplicate IDs in region');
  if (region.coordinateFrame === 'sandbox-local-enh' && region.provenance.status !== 'invented') errors.push('Sandbox must be explicitly invented');
  return errors;
}

export function semanticCameraErrors(cameras) {
  const errors = [];
  const presets = cameras.visualReviewPresets;
  const t = cameras.travel;
  if (new Set(presets.map(p => p.id)).size !== presets.length) errors.push('Duplicate camera IDs');
  for (const id of ['trail_forward', 'look_up_canopy', 'close_trunk', 'wide_path']) {
    if (!presets.some(p => p.id === id)) errors.push(`Missing third-person preset ${id}`);
  }
  if (!(t.distanceMinM <= t.distanceM && t.distanceM <= t.distanceMaxM)) errors.push('Invalid third-person distance limits');
  if (!(t.pitchMinDeg < t.pitchDefaultDeg && t.pitchDefaultDeg < t.pitchMaxDeg)) errors.push('Invalid third-person pitch limits');
  if (t.nearClipM >= t.distanceMinM) errors.push('Near clip must be smaller than minimum distance');
  for (const p of presets) {
    if (p.pitchDeg < t.pitchMinDeg || p.pitchDeg > t.pitchMaxDeg) errors.push(`Preset pitch outside travel limits: ${p.id}`);
    if (p.distanceM < t.distanceMinM || p.distanceM > t.distanceMaxM) errors.push(`Preset distance outside travel limits: ${p.id}`);
  }
  if (!presets.some(p => p.id === 'look_up_canopy' && p.pitchDeg < 0)) errors.push('Canopy preset must look up with negative pitch');
  return errors;
}

export function runValidation(baseDir = root) {
  const errors = [];
  const read = file => {
    const full = resolve(baseDir, file);
    const rel = relative(baseDir, full);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || isAbsolute(file) || file.includes('\\')) throw new Error(`Use a relative project path with forward slashes: ${file}`);
    return JSON.parse(readFileSync(full, 'utf8'));
  };
  const pairs = [
    ['schemas/region.schema.json', 'content/sandbox/riverbend.region.json'],
    ['schemas/world-manifest.schema.json', 'content/canon/world.manifest.json'],
    ['schemas/world-manifest.schema.json', 'content/sandbox/world.manifest.json'],
    ['schemas/save.schema.json', 'content/sandbox/save.example.json'],
    ['schemas/drevlepuscha-poi.schema.json', 'content/canon/drevlepuscha/poi.json'],
    ['schemas/drevlepuscha-macro.schema.json', 'content/canon/drevlepuscha/macro-map.json'],
    ['schemas/camera-presets.schema.json', 'config/camera-presets.json'],
  ];
  const loaded = new Map();
  for (const [schema, file] of pairs) {
    try {
      const value = read(file);
      const found = validate(read(schema), value);
      errors.push(...found.map(error => `${file}: ${error}`));
      if (!found.length) loaded.set(file, value);
    } catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  const sourceIds = new Set();
  try {
    const register = read('references/sources.json');
    if (register.version !== 1 || !Array.isArray(register.sources)) throw new Error('Expected version 1 and sources array');
    for (const source of register.sources) {
      if (!record(source) || !['id', 'title', 'status', 'locator'].every(key => nonempty(source[key]))) { errors.push('Invalid source register entry'); continue; }
      if (sourceIds.has(source.id)) errors.push(`Duplicate source ID: ${source.id}`);
      sourceIds.add(source.id);
    }
  } catch (error) { errors.push(`references/sources.json: ${error.message}`); }
  for (const [file, value] of loaded) errors.push(...provenanceErrors(value, sourceIds).map(error => `${file}: ${error}`));
  const regionSchema = read('schemas/region.schema.json');
  const checkedRegions = new Set();
  const checkRegion = (file, region) => {
    if (checkedRegions.has(file)) return;
    checkedRegions.add(file);
    errors.push(...semanticRegionErrors(region).map(error => `${file}: ${error}`));
    errors.push(...provenanceErrors(region, sourceIds).map(error => `${file}: ${error}`));
  };
  if (loaded.has('content/sandbox/riverbend.region.json')) checkRegion('content/sandbox/riverbend.region.json', loaded.get('content/sandbox/riverbend.region.json'));
  for (const file of ['content/canon/world.manifest.json', 'content/sandbox/world.manifest.json']) {
    const m = loaded.get(file);
    if (!m) continue;
    if (m.sourceStatus === 'pending' && (m.coverage !== 'unmapped' || m.source !== null || m.bounds !== null || m.regionFiles.length)) errors.push(`${file}: pending source cannot claim mapped geography`);
    if (m.sourceStatus !== 'pending' && !m.source) errors.push(`${file}: missing source`);
    if (m.source && !sourceIds.has(m.source.id)) errors.push(`${file}: unknown source ID ${m.source.id}`);
    if (m.bounds && !ordered(m.bounds)) errors.push(`${file}: invalid bounds ordering`);
    if (new Set(m.regionFiles).size !== m.regionFiles.length) errors.push(`${file}: duplicate regionFiles`);
    for (const regionFile of m.regionFiles) {
      try {
        const region = read(regionFile);
        const found = validate(regionSchema, region);
        if (found.length) { errors.push(...found.map(error => `${regionFile}: ${error}`)); continue; }
        checkRegion(regionFile, region);
        if (region.contentRevision !== m.contentRevision || region.generatorVersion !== m.generatorVersion) errors.push(`${file}: version mismatch in ${regionFile}`);
        if (m.bounds && (region.bounds.minE < m.bounds.minE || region.bounds.maxE > m.bounds.maxE || region.bounds.minN < m.bounds.minN || region.bounds.maxN > m.bounds.maxN)) errors.push(`${file}: region outside manifest bounds: ${regionFile}`);
      } catch (error) { errors.push(`${file}: invalid region file ${regionFile}: ${error.message}`); }
    }
  }
  const poi = loaded.get('content/canon/drevlepuscha/poi.json');
  if (poi && new Set(poi.features.map(f => f.id)).size !== poi.features.length) errors.push('Duplicate Drevlepuscha feature IDs');
  const macro = loaded.get('content/canon/drevlepuscha/macro-map.json');
  if (macro) {
    const [minE, minN, maxE, maxN] = macro.firstSlice.boundsNormalized;
    if (!ordered({ minE, minN, maxE, maxN })) errors.push('Invalid first-slice normalized bounds ordering');
    // The proposed first slice must actually contain the named entry and glade.
    if (poi) for (const id of ['hay_gate', 'bonfire_glade']) {
      const feature = poi.features.find(f => f.id === id);
      if (!feature || feature.geometry.type !== 'Point') { errors.push(`Missing first-slice point: ${id}`); continue; }
      const [e, n] = feature.geometry.coordinates;
      if (e < minE || e > maxE || n < minN || n > maxN) errors.push(`First-slice point outside bounds: ${id}`);
    }
  }
  const cameras = loaded.get('config/camera-presets.json');
  if (cameras) errors.push(...semanticCameraErrors(cameras));
  const save = loaded.get('content/sandbox/save.example.json');
  const region = loaded.get('content/sandbox/riverbend.region.json');
  if (save && region && save.discoveredIds.some(id => !region.places.some(p => p.id === id))) errors.push('Saved discovery has no POI');
  return errors;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const errors = runValidation();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('PASS: 7 JSON contracts, referenced regions, nested provenance and source IDs, normalized draft layout, third-person camera presets.');
}
