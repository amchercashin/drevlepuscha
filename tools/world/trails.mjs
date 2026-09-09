import {hash01, pointInRing} from '../../src/domain/geography.mjs';

/** Global graph is built before partitioning: crossing a tile never changes a path. */
export function buildTrails(g, geo, heightmap) {
  const trails = [];
  const forest = g.features.find((f) => f.id === 'forest_boundary').geometry.coordinates[0];
  const heights = new Map();

  const height = (e, n) => heightmap.sample(e, n);
  const safe = (e, n) => {
    if (
      e < g.bounds.minE + 2 ||
      e > g.bounds.maxE - 2 ||
      n < g.bounds.minN + 2 ||
      n > g.bounds.maxN - 2
    ) {
      return false;
    }

    return !geo.nearbyWater(e, n).some((p) => p.distance < p.feature.water.widthM / 2 + 2);
  };

  function legal(a, b) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8);
    let h = height(...a);

    for (let i = 1; i <= steps; i++) {
      const e = a[0] + (b[0] - a[0]) * (i / steps);
      const n = a[1] + (b[1] - a[1]) * (i / steps);
      const v = height(e, n);

      if (!safe(e, n) || Math.abs(v - h) > (Math.hypot(b[0] - a[0], b[1] - a[1]) / steps) * 0.72) {
        return false;
      }

      h = v;
    }

    return true;
  }

  function legalPath(points) {
    for (let i = 1; i < points.length; i++) {
      if (!legal(points[i - 1], points[i])) {
        return false;
      }
    }

    return true;
  }

  function chaikinPass(points) {
    if (points.length < 3) {
      return points.slice(0);
    }

    const out = [points[0].slice(0)];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }

    out.push(points.at(-1).slice(0));
    return out;
  }

  function smoothPath(points) {
    if (points.length < 3) {
      return points.slice(0);
    }

    let smoothed = points;
    for (let i = 0; i < 2; i++) {
      smoothed = chaikinPass(smoothed);
    }

    if (!legalPath(smoothed)) {
      return points.slice(0);
    }

    return smoothed;
  }

  function sample32(points) {
    const out = [points[0].slice(0)];

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len === 0) {
        continue;
      }

      const n = Math.floor(len / 32);
      for (let s = 1; s < n; s++) {
        const t = (32 * s) / len;
        out.push([a[0] + dx * t, a[1] + dy * t]);
      }

      const last = out.at(-1);
      if (last[0] !== b[0] || last[1] !== b[1]) {
        out.push(b.slice(0));
      }
    }

    return out;
  }

  function meander(points, seed) {
    if (points.length < 3) {
      return points.slice(0);
    }

    const spaced = sample32(points);
    if (spaced.length < 3) {
      return spaced;
    }

    const amplitude = 2.2;
    const out = [spaced[0].slice(0)];

    for (let i = 1; i < spaced.length - 1; i++) {
      const prev = spaced[i - 1];
      const cur = spaced[i];
      const next = spaced[i + 1];
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const len = Math.hypot(dx, dy);

      if (len === 0) {
        out.push(cur.slice(0));
        continue;
      }

      const jitter = (hash01(cur[0], cur[1], seed) - 0.5) * 2 * amplitude;
      const nx = -dy / len;
      const ny = dx / len;
      out.push([cur[0] + nx * jitter, cur[1] + ny * jitter]);
    }

    out.push(spaced.at(-1).slice(0));

    if (!legalPath(out)) {
      return spaced;
    }

    return out;
  }

  function refineGenerated(points, kind, seed) {
    const smoothed = smoothPath(points);
    if (kind !== 'wood' && kind !== 'fade' && kind !== 'poi') {
      return smoothed;
    }

    return meander(smoothed, seed);
  }

  function add(id, kind, width, points) {
    let run = [];

    const flush = () => {
      if (run.length > 1) {
        trails.push({
          id: id + '-' + trails.length,
          kind,
          width,
          points: run,
        });
      }
      run = [];
    };

    for (const p of points) {
      if (run.length && !legal(run.at(-1), p)) {
        flush();
      }

      if (safe(...p)) {
        run.push(p.slice(0, 2));
      } else {
        flush();
      }
    }

    flush();
  }

  for (const f of g.features.filter((f) => f.route || f.kind === 'road')) {
    const p = f.geometry.coordinates;

    if (f.id === 'frodo_route') {
      for (const [a, b] of [[0, 2], ...f.route.cutSegments, [p.length - 4, p.length - 1]]) {
        add(
          f.id + '-' + a,
          a < 2 ? 'worn' : 'path',
          a < 2 ? 1.7 : 0.8,
          p.slice(a, b + 1),
        );
      }
    } else {
      add(f.id, f.kind === 'road' ? 'worn' : 'path', f.kind === 'road' ? 2 : 0.8, p);
    }
  }

  const cell = 32;

  function node(x, y) {
    const k = x + ',' + y;
    if (!heights.has(k)) {
      const e = x * cell;
      const n = y * cell;
      heights.set(k, safe(e, n) ? height(e, n) : NaN);
    }
    return heights.get(k);
  }

  // Bounded A* with binary heap, slope/wetness costs, stable tie order.
  function route(a, b) {
    const start = a.map((v) => Math.round(v / cell));
    const end = b.map((v) => Math.round(v / cell));
    const key = (p) => p.join(',');
    const s = key(start);
    const target = key(end);
    const dist = new Map([[s, 0]]);
    const previous = new Map();
    const open = [];

    const estimate = (x, y) => Math.hypot(end[0] - x, end[1] - y);
    const push = (v) => {
      open.push(v);
      let i = open.length - 1;
      while (i) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= v[0]) {
          break;
        }
        open[i] = open[p];
        i = p;
      }
      open[i] = v;
    };

    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        let i = 0;
        while (i * 2 + 1 < open.length) {
          let j = i * 2 + 1;
          if (j + 1 < open.length && open[j + 1][0] < open[j][0]) {
            j++;
          }
          if (open[j][0] >= last[0]) {
            break;
          }
          open[i] = open[j];
          i = j;
        }
        open[i] = last;
      }
      return top;
    };

    push([estimate(...start), 0, ...start]);
    let visited = 0;

    while (open.length && visited++ < 16000) {
      const [, cost, x, y] = pop();
      const k = x + ',' + y;

      if (cost !== dist.get(k)) {
        continue;
      }

      if (k === target) {
        let out = [];
        let cur = k;

        while (cur) {
          out.push(cur.split(',').map(Number).map((v) => v * cell));
          cur = previous.get(cur);
        }

        out.reverse();
        const simple = [out[0]];
        for (let i = 1; i < out.length; ) {
          let j = Math.min(i + 10, out.length - 1);
          while (j > i && !legal(simple.at(-1), out[j])) {
            j--;
          }
          simple.push(out[j]);
          i = j + 1;
        }

        return simple;
      }

      const h = node(x, y);
      if (!Number.isFinite(h)) {
        continue;
      }

      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;

        if (Math.abs(nx - start[0]) + Math.abs(ny - start[1]) > estimate(...start) * 2 + 40) {
          continue;
        }

        const v = node(nx, ny);
        const length = Math.hypot(dx, dy);
        const slope = Math.abs(v - h) / (cell * length);

        if (!Number.isFinite(v) || slope > 0.62) {
          continue;
        }

        const nk = nx + ',' + ny;
        const next = cost + length * (1 + slope * 8);

        if (next < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, next);
          previous.set(nk, k);
          push([next + estimate(nx, ny), next, nx, ny]);
        }
      }
    }

    return null;
  }

  const hubs = new Map();
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 23; y++) {
      const e = x * 2048 + 512 + (hash01(x, y, 77) - 0.5) * 1100;
      const n = y * 2048 + 512 + (hash01(x, y, 78) - 0.5) * 1100;
      if (pointInRing(e, n, forest) && safe(e, n)) {
        hubs.set(x + ',' + y, [e, n]);
      }
    }
  }

  const hubList = [...hubs.entries()].map(([id, point]) => {
    const [x, y] = id.split(',').map(Number);
    return { id, x, y, point };
  });

  const seenEdges = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const hub of hubList) {
    const neighbors = [];

    for (const candidate of hubList) {
      if (candidate.id === hub.id) {
        continue;
      }

      const distance = Math.hypot(hub.point[0] - candidate.point[0], hub.point[1] - candidate.point[1]);
      if (distance <= 3400) {
        neighbors.push({ ...candidate, distance });
      }
    }

    neighbors.sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < Math.min(3, neighbors.length); i++) {
      const target = neighbors[i];
      const first = edgeKey(hub.id, target.id);
      if (seenEdges.has(first)) {
        continue;
      }

      const canConnect = i < 2 ? 0.78 : 0.3;
      const [left, right] = first.split('|');
      const [lx, ly] = left.split(',').map(Number);
      const [rx, ry] = right.split(',').map(Number);
      const pairSeed = lx * 991 + rx * 719 + ly * 557 + ry * 193 + i;
      if (hash01(lx + rx, ly + ry, pairSeed) >= canConnect) {
        continue;
      }

      const path = route(hub.point, target.point);
      if (!path) {
        continue;
      }

      seenEdges.add(first);
      const isTrace = hash01(lx, ly, 94) < 0.28;
      const refined = refineGenerated(path, 'wood', lx + ly * 31 + i);
      add(`wood-${first}`, isTrace ? 'trace' : 'path', isTrace ? 0.35 : 0.7, refined);
    }
  }

  for (const [key, a] of hubs) {
    const [x, y] = key.split(',').map(Number);
    if (hash01(x, y, 97) < 0.48) {
      const b = [
        a[0] + 240 + hash01(x, y, 98) * 300,
        a[1] - 170 - hash01(x, y, 99) * 250,
      ];

      if (pointInRing(...b, forest)) {
        const path = route(a, b);
        if (path) {
          const refined = refineGenerated(path, 'fade', x * 7 + y);
          add('fade-' + key, 'trace', 0.3, refined);
        }
      }
    }
  }

  for (const f of g.features.filter((f) => f.geometry.type === 'Point')) {
    const a = f.geometry.coordinates;
    if (!pointInRing(...a, forest)) {
      continue;
    }

    const nearest = [...hubs.values()].sort(
      (p, q) =>
        Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]),
    )[0];

    if (nearest) {
      const path = route(a, nearest);
      if (path) {
        const refined = refineGenerated(path, 'poi', a[0] + a[1]);
        add(
          'poi-' + f.id,
          ['hay_gate', 'entry_hollow', 'bonfire_glade'].includes(f.id) ? 'worn' : 'path',
          1.1,
          refined,
        );
      }
    }
  }

  return trails;
}
