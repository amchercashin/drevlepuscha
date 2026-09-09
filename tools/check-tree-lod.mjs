import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const url = process.env.WORLD_URL ?? 'http://127.0.0.1:4181/';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], report = { backend, url, stages: [], errors };
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
mkdirSync('tmp', { recursive: true });
try {
  await page.goto(url + '?debug=1&renderer=' + backend);
  await page.waitForFunction(() => window.oldForest?.state().ready, null, { timeout: 45000 });
  await page.locator('#resume').click();
  await page.evaluate(() => oldForest.teleport(1200, 25800));
  await page.waitForTimeout(1500);
  const tree = await page.evaluate(() => {
    const { world } = oldForest.inspect(), p = oldForest.state().player;
    return [...world.trees.near.values()].find(t => t.level === 1 && Math.hypot(t.t.e - p.e, t.t.n - p.n) < 50)?.t;
  });
  assert.ok(tree, 'A resident distant tree is available');
  report.tree = tree.id;
  for (const distance of [18, 40, 18, 40, 18]) {
    await page.evaluate(async ({ tree, distance }) => {
      await oldForest.teleport(tree.e, tree.n - distance);
      oldForest.setCamera(0, 12, 5.5);
    }, { tree, distance });
    await page.waitForTimeout(700);
    const stage = await page.evaluate(id => {
      const { world } = oldForest.inspect(), t = world.trees.near.get(id);
      return { level: t?.level, meshes: t?.meshes.map(m => ({
        vertices: m.getTotalVertices(), indices: m.getTotalIndices(),
        drawn: m.subMeshes.reduce((n, s) => n + s.indexCount, 0),
        rangedVertices: m.subMeshes.reduce((n, s) => n + s.verticesCount, 0),
      })) };
    }, tree.id);
    report.stages.push({ distance, ...stage });
    await page.screenshot({ path: `tmp/tree-lod-${backend}-${distance}.png` });
    assert.equal(stage.level, distance < 27 ? 0 : 1);
    for (const m of stage.meshes) {
      assert.equal(m.drawn, m.indices, 'LOD transition must draw the complete index buffer');
      assert.equal(m.rangedVertices, m.vertices, 'LOD transition must cover all vertices');
    }
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS', JSON.stringify(report));
} catch (e) { report.failure = String(e); console.error(e); process.exitCode = 1; }
finally { writeFileSync(`tmp/tree-lod-${backend}.json`, JSON.stringify(report, null, 2)); await browser.close(); }
