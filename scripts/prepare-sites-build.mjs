import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, 'dist/client/index.html'))) throw new Error('Build the Sites frontend first.');
await build({
  configFile: false,
  root,
  build: {
    outDir: 'dist/server',
    lib: { entry: 'sites/worker.ts', formats: ['es'], fileName: () => 'index.js' },
  },
});
mkdirSync(resolve(root, 'dist/.openai'), { recursive: true });
copyFileSync(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
cpSync(resolve(root, 'drizzle'), resolve(root, 'dist/.openai/drizzle'), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY_LICENSES.md']) {
  copyFileSync(resolve(root, file), resolve(root, 'dist/client', file));
}
