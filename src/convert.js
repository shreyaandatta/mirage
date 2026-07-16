import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

/**
 * Convert a .ply splat file to compressed .ksplat entirely in-browser and
 * trigger a download (DESIGN.md §7 "Perf conversion"). ksplat is smaller and
 * parses much faster on subsequent loads.
 *
 * @param {string} url            object URL (or path) of the source .ply
 * @param {string} outputName     e.g. "garden.ksplat"
 * @param {(pct:number)=>void} onProgress
 */
export async function convertPlyToKSplat(url, outputName, onProgress) {
  const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromURL(
    url,
    (pct) => onProgress?.(pct),
    /* progressiveLoad */ false,
    /* onProgressiveLoadSectionProgress */ undefined,
    /* minimumAlpha */ 1,
    /* compressionLevel */ 1,
    /* optimizeSplatData */ true,
    /* sphericalHarmonicsDegree */ 1,
  );
  GaussianSplats3D.KSplatLoader.downloadFile(splatBuffer, outputName);
}
