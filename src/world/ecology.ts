import { hash01 } from '../domain/geography.mjs';
/** Ecotones average nearby habitat, then preserve local moisture and authored clearings. */
export function habitatWeights(e: number, n: number, zoneAt: (e: number, n: number) => {
    id: string;
} | null) {
    const weights = new Map<string, number>();
    const center = zoneAt(e, n);
    if (!center || center.id === 'eastern_opening')
        return new Map([[center?.id ?? 'outside', 1]]);
    const radius = 160 + 80 * hash01(Math.floor(e / 512), Math.floor(n / 512), 407);
    for (const [dx, dy, w] of [[0, 0, 4], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [.7, .7, .5], [-.7, .7, .5], [.7, -.7, .5], [-.7, -.7, .5]]) {
        const id = zoneAt(e + dx * radius, n + dy * radius)?.id ?? center.id;
        weights.set(id, (weights.get(id) ?? 0) + w);
    }
    let sum = 0;
    for (const v of weights.values())
        sum += v;
    for (const [id, v] of weights)
        weights.set(id, v / sum);
    return weights;
}
export function speciesMix(weights: Map<string, number>, wet: boolean) {
    const result = [0, 0, 0, 0, 0];
    for (const [id, w] of weights) {
        const mix = id === 'north_dry_conifers' ? [.10, .08, .08, .72, .02] : id === 'withywindle_riparian' ? [.12, .1, .13, .0, .65] : id === 'brook_hollows' ? [.25, .2, .3, .01, .24] : id === 'western_edge_regrowth' ? [.27, .18, .52, .03, 0] : [.46, .29, .22, .03, 0];
        for (let i = 0; i < 5; i++)
            result[i] += mix[i] * w;
    }
    // Willow follows water access; transition noise cannot plant riparian stands on a dry ridge.
    if (!wet) {
        result[0] += result[4];
        result[4] = 0;
    }
    return result;
}
export function pickSpecies(mix: number[], roll: number) { let sum = 0; for (let i = 0; i < mix.length; i++) {
    sum += mix[i];
    if (roll < sum)
        return i;
} return 0; }
