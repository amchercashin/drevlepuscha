import test from 'node:test';
import assert from 'node:assert/strict';
import {
  triangleHeight,
  trailIndex,
  moveOnTerrain,
  tileKey,
  originFor,
} from '../src/world/math.ts';
import { habitatWeights, speciesMix, pickSpecies } from '../src/world/ecology.ts';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('triangular height deviates from bilinear on saddle and is planar on ENU slopes', () => {
  const saddleGrid = {
    origin: [0, 0],
    stepM: 1,
    columns: 2,
    rows: 2,
    values: new Float32Array([0, 1, 1, 0]),
  };
  const bilinear = (grid, e, n) => {
    const x = (e - grid.origin[0]) / grid.stepM;
    const y = (n - grid.origin[1]) / grid.stepM;
    const i = Math.min(Math.floor(x), grid.columns - 2);
    const j = Math.min(Math.floor(y), grid.rows - 2);
    const u = x - i;
    const v = y - j;
    const k = j * grid.columns + i;
    const a = grid.values[k];
    const b = grid.values[k + 1];
    const c = grid.values[k + grid.columns];
    const d = grid.values[k + grid.columns + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  const saddleA = triangleHeight(saddleGrid, 0.3, 0.3);
  const saddleB = triangleHeight(saddleGrid, 0.8, 0.3);
  assert.equal(saddleA > bilinear(saddleGrid, 0.3, 0.3), true);
  assert.equal(saddleB > bilinear(saddleGrid, 0.8, 0.3), true);

  const planeGrid = {
    origin: [0, 0],
    stepM: 1,
    columns: 2,
    rows: 2,
    values: new Float32Array([0, 1, 2, 3]),
  };
  close(triangleHeight(planeGrid, 0.2, 0.6), 1.4);
  close(triangleHeight(planeGrid, 0.8, 0.6), 2.0);
});

test('adjacent grids share exact same-height boundary', () => {
  const left = {
    origin: [0, 0],
    stepM: 1,
    columns: 2,
    rows: 2,
    values: new Float32Array([0, 1, 2, 3]),
  };
  const right = {
    origin: [1, 0],
    stepM: 1,
    columns: 2,
    rows: 2,
    values: new Float32Array([1, 2, 3, 4]),
  };
  close(triangleHeight(left, 1, 0), triangleHeight(right, 1, 0));
  close(triangleHeight(left, 1, 0.5), triangleHeight(right, 1, 0.5));
});

test('tile ownership and origin snap are correct for negative coordinates', () => {
  assert.equal(tileKey(-1, -1), '-1,-1');
  assert.equal(tileKey(-513, -257, 128), '-5,-3');
  assert.deepEqual(originFor({ e: -1, n: -1 }), { e: -512, n: -512 });
  assert.deepEqual(originFor({ e: -513, n: -1024 }), { e: -1024, n: -1024 });
});

test('movement blocks slopes above 40°, water >0.35, unready cells, and uses bounded substeps', () => {
  const bounds = { minE: -100, minN: -100, maxE: 100, maxN: 100 };
  const blockedBySteep = moveOnTerrain(
    { e: 0, n: 0 },
    10,
    0,
    {
      height: (e, n) => e,
      ready: () => true,
      waterDepth: () => 0,
      blocked: () => false,
    },
    bounds
  );
  assert.deepEqual(blockedBySteep, { e: 0, n: 0 });

  const blockedByWater = moveOnTerrain(
    { e: 0, n: 0 },
    2,
    0,
    {
      height: () => 0,
      ready: () => true,
      waterDepth: () => 0.36,
      blocked: () => false,
    },
    bounds
  );
  assert.deepEqual(blockedByWater, { e: 0, n: 0 });

  const notReady = moveOnTerrain(
    { e: 0, n: 0 },
    2,
    0,
    {
      height: () => 0,
      ready: () => false,
      waterDepth: () => 0,
      blocked: () => false,
    },
    bounds
  );
  assert.deepEqual(notReady, { e: 0, n: 0 });

  const clippedBySubsteps = moveOnTerrain(
    { e: 0, n: 0 },
    1,
    0,
    {
      height: () => 0,
      ready: () => true,
      waterDepth: () => 0,
      blocked: (e, _n) => e >= 0.6,
    },
    bounds
  );
  assert.equal(clippedBySubsteps.n, 0);
  assert.ok(clippedBySubsteps.e > 0.5 && clippedBySubsteps.e < 0.62);
});

test('movement slides along an obstacle when diagonal motion is blocked', () => {
  const bounds = { minE: -100, minN: -100, maxE: 100, maxN: 100 };
  const slid = moveOnTerrain(
    { e: 0, n: 0 },
    1,
    1,
    {
      height: () => 0,
      ready: () => true,
      waterDepth: () => 0,
      blocked: (_e, n) => n > 0.12,
    },
    bounds
  );
  assert.ok(slid.e > 0.9);
  assert.ok(Math.abs(slid.n - 0.08333333333333331) < 1e-9);
});

test('trail clearance uses walk corridor width and detects cross-bin trail segments', () => {
  const trails = [{ id: 'r', kind: 'path', width: 1.8, points: [[0, 0], [100, 0]] }];
  const atTrail = trailIndex(trails, 64);

  assert.ok(atTrail(0.75, 0).clear);
  assert.equal(atTrail(1.2, 1.2).clear, false);
  const binCross = atTrail(95, 0.6);
  assert.equal(binCross.kind, 'path');
  assert.ok(binCross.clear);
  assert.equal(atTrail(95, 1.2).clear, false);
});

test('habitat weights are normalized and boundary mixing is deterministic', () => {
  const boundaryZones = (e, n) => ({ id: e + n >= 0 ? 'north_dry_conifers' : 'western_edge_regrowth' });
  const first = habitatWeights(0, 0, boundaryZones);
  const second = habitatWeights(0, 0, boundaryZones);
  const total = [...first.values()].reduce((acc, value) => acc + value, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.deepEqual([...first], [...second]);
  assert.ok(first.size > 1);
  const species = speciesMix(first, false);
  const speciesTotal = species.reduce((acc, value) => acc + value, 0);
  assert.ok(Math.abs(speciesTotal - 1) < 1e-12);
  assert.ok(species[0] > 0 && species[3] > 0);
});

test('dry ridges cannot receive willow, and authoring zones stay outside until mapped', () => {
  const dryRidge = speciesMix(new Map([['north_dry_conifers', 1]]), false);
  assert.equal(dryRidge[4], 0);
  const wetRidge = speciesMix(new Map([['north_dry_conifers', 1]]), true);
  assert.equal(wetRidge[4], 0.02);

  const meadow = habitatWeights(1234, 4567, () => null);
  assert.equal(meadow.size, 1);
  assert.equal(meadow.get('outside'), 1);
  assert.equal(habitatWeights(0, 0, () => ({ id: 'eastern_opening' })).size, 1);
});

test('pickSpecies is deterministic on forest mixes; mixed outside is handled by caller', () => {
  const mix = speciesMix(new Map([['north_dry_conifers', 1]]), true);
  const first = pickSpecies(mix, 0.3);
  const second = pickSpecies(mix, 0.3);
  assert.equal(first, second);
  assert.ok(first >= 0 && first < mix.length);
});

import {readFileSync} from 'node:fs';
import {createWorldGeography} from '../src/domain/world-geography.mjs';
test('runtime meadow remains mapped beyond the forest boundary without changing terrain',()=>{
 const g=JSON.parse(readFileSync(new URL('../content/geography/old-forest/geography.json',import.meta.url)));
 const world=createWorldGeography(g);assert.equal(world.zoneAt(22400,19350).id,'eastern_opening');assert.equal(world.zoneAt(-8000,0),null);assert.equal(world.exclusion(22400,19350),'outside-forest');
});
