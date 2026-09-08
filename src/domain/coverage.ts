export const COVERAGE = ['unmapped', 'atlas', 'terrain', 'playable', 'reviewed'] as const;
export type Coverage = typeof COVERAGE[number];
/** Renderer visibility is not permission to enter a playable region. */
export function canEnterTravel(coverage: Coverage): boolean {
  return coverage === 'playable' || coverage === 'reviewed';
}
