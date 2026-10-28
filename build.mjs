import { build } from 'esbuild';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: { background: 'src/background/index.ts', page: 'src/page/main.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
});

copyFileSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });
copyFileSync('src/page/index.html', 'dist/index.html');
