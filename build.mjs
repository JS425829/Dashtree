// Builds the extension: `node build.mjs [chromium|firefox|all]` (default all).
//   dist/          Chrome and Edge (Chromium, service-worker background)
//   dist-firefox/  Firefox (event-page background)
import { build } from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromiumManifest, firefoxManifest } from './tools/manifest.mjs';

const TARGETS = {
  chromium: { outdir: 'dist', manifest: chromiumManifest, backgroundFormat: 'esm' },
  // Firefox runs the background as a plain script, so it is bundled as one self-contained function
  firefox: { outdir: 'dist-firefox', manifest: firefoxManifest, backgroundFormat: 'iife' },
};

async function buildTarget({ outdir, manifest, backgroundFormat }) {
  mkdirSync(outdir, { recursive: true });
  const common = { outdir, bundle: true, target: 'es2022', sourcemap: true };
  await build({ ...common, entryPoints: { background: 'src/background/index.ts' }, format: backgroundFormat });
  await build({ ...common, entryPoints: { page: 'src/page/main.ts' }, format: 'esm' });

  const base = JSON.parse(readFileSync('manifest.json', 'utf8'));
  writeFileSync(`${outdir}/manifest.json`, `${JSON.stringify(manifest(base), null, 2)}\n`);
  copyFileSync('src/page/index.html', `${outdir}/index.html`);
  cpSync('icons', `${outdir}/icons`, { recursive: true });
  console.log(`built ${outdir}/`);
}

const which = process.argv[2] ?? 'all';
const names = which === 'all' ? Object.keys(TARGETS) : [which];
for (const name of names) {
  if (!TARGETS[name]) throw new Error(`unknown target "${name}" (use chromium, firefox or all)`);
  await buildTarget(TARGETS[name]);
}
