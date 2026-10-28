// Builds one self-contained HTML file: the real page code + sample data, openable straight from disk.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  stdin: { contents: "import './chrome-shim.ts'; import '../src/page/main.ts';", resolveDir: 'tools', loader: 'ts' },
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
});

const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = readFileSync('src/page/index.html', 'utf8').replace(
  '<script type="module" src="page.js"></script>',
  () => `<script>${js}</script>`,
);

mkdirSync('.superpowers/preview', { recursive: true });
writeFileSync('.superpowers/preview/preview.html', html);
console.log('wrote .superpowers/preview/preview.html');
