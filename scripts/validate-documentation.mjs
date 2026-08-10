import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);

function markdownFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (excludedDirectories.has(entry)) return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return entry.endsWith('.md') ? [path] : [];
  });
}

const failures = [];
const files = markdownFiles(root);
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const destination = match[1];
    if (/^(?:[a-z]+:|#)/i.test(destination)) continue;
    const path = destination.split('#', 1)[0];
    if (!existsSync(resolve(dirname(file), path))) {
      failures.push(`${relative(root, file)} links to missing ${destination}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation validation failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation validation passed (${files.length} Markdown files checked).`);
}
