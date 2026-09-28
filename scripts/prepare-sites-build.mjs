import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, 'dist/client/index.html'))) throw new Error('Build the Sites frontend first.');
await build({
  configFile: false,
  root,
  define: { __SITES_INDEX_HTML__: JSON.stringify(readFileSync(resolve(root, 'dist/client/index.html'), 'utf8')) },
  build: {
    outDir: 'dist/server',
    lib: { entry: 'sites/worker.ts', formats: ['es'], fileName: () => 'index.js' },
  },
});
// The Sites asset gateway bypasses Worker response headers, including for index.html.
// Serve the compiled document exclusively through the Worker; JS/CSS remain static assets.
unlinkSync(resolve(root, 'dist/client/index.html'));
mkdirSync(resolve(root, 'dist/.openai'), { recursive: true });
copyFileSync(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
cpSync(resolve(root, 'drizzle'), resolve(root, 'dist/.openai/drizzle'), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY_LICENSES.md']) {
  copyFileSync(resolve(root, file), resolve(root, 'dist/client', file));
}
