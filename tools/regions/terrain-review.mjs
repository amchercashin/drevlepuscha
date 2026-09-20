import {distance, lineLength, nearestStation, previewHeight, previewWater} from './authoring-core.mjs';

export function sampleLine(points, stepM = 2) {
  const samples = [{point: points[0], distanceM: 0}];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b), count = Math.ceil(length / stepM);
    for (let j = 1; j <= count; j++) samples.push({point: a.map((v, k) => v + (b[k] - v) * j / count), distanceM: total + length * j / count});
    total += length;
  }
  return samples;
}

export function terrainReview(source) {
  const round = n => Number(n.toFixed(3));
  const sections = (source.terrainRefinement?.sections ?? []).map(section => ({
    ...section, lengthM: round(lineLength(section.points)),
    samples: sampleLine(section.points, 8).map(({point, distanceM}) => ({distanceM: round(distanceM), baselineM: round(previewHeight(source, ...point, false)), detailedM: round(previewHeight(source, ...point))})),
  }));
  const routes = source.topology.edges.filter(e => !['boat','bridge'].includes(e.kind)).map(edge => {
    let maxGrade = 0, wetSamples = 0, worstPoint;
    const samples = sampleLine(edge.points);
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], h = previewHeight(source, ...p.point);
      if ((previewWater(source, ...p.point)?.depth ?? 0) > .35) wetSamples++;
      if (i) {
        const a = samples[i - 1], grade = Math.abs(h - previewHeight(source, ...a.point)) / (p.distanceM - a.distanceM);
        if (grade > maxGrade) {maxGrade = grade; worstPoint = p.point.map(round);}
      }
    }
    return {id: edge.id, maxGradePercent: round(maxGrade * 100), worstPoint, wetSamples, sampleStepM: 2, note: 'Raw terrain only; no road grading, navigation or bridge approaches.'};
  });
  const landings = source.pois.filter(p => p.id.includes('LANDING')).map(p => {
    const q = nearestStation(...p.point, source.rivers.find(r => r.id === 'brandywine').stations);
    return {id: p.id, point: p.point, distanceFromShoreM: round(q.distance - q.width / 2), baselineHeightM: round(previewHeight(source, ...p.point, false)), detailedHeightM: round(previewHeight(source, ...p.point)), waterLevelM: round(q.level), note: 'Dry approach anchor, not final boat boarding position.'};
  });
  const bridges = source.topology.crossings.filter(c => c.kind === 'bridge').map(c => ({id: c.id, deckHeightM: c.deckHeightM, approaches: c.endpoints.map(id => {
    const p = source.topology.nodes.find(n => n.id === id).point, groundM = previewHeight(source, ...p);
    return {id, groundM: round(groundM), ungradedDeckDifferenceM: round(c.deckHeightM - groundM)};
  })}));
  return {status: 'MAP_REVIEW_NOT_3D_ACCEPTANCE', sections, routes, landings, bridges,
    limitations: ['2m analytical samples do not turn a 16m preview into production collision.', 'No LOS, passability or frame rate acceptance.', 'Bank axes and widths retain polygonal joins; smoothing and the lower backwater mesh are P2 work.', 'Water presets change planner availability; flood extent is not simulated.']};
}
