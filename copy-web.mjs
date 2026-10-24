import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const web = join(root, 'www');
await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
for (const file of ['index.html','app.js','manifest.json','sw.js','icon-192.png','icon-512.png']) {
  await cp(join(root, file), join(web, file));
}
await build({
  entryPoints: [join(root, 'native-notifications.mjs')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: join(web, 'native-notifications.js'),
  minify: true,
});
console.log('Web assets copied to www/');
