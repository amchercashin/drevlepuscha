import moonUrl from '../../assets/sky/moon-albedo.png?url';
/** User-supplied full-disc albedo, edge extended under the analytic disc mask,
 * no baked glow/phase; loader invertY=false (the shader flips V once).
 * Numerical RGB is sampled as-is, without hardware sRGB decode, like the fallback.
 */
export const moonAlbedoUrl:string|null=moonUrl;
