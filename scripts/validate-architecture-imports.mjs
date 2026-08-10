import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');

const rules = [
  {
    directory: 'src/domain',
    forbidden: ['react', 'react-dom', 'three', '/simulation/', '/state/', '/ui/', '/workbench/'],
  },
  {
    directory: 'src/simulation',
    forbidden: ['react', 'react-dom', 'three', '/state/', '/ui/', '/workbench/'],
  },
  {
    directory: 'src/measurement',
    forbidden: ['react', 'react-dom', 'three', '/state/', '/ui/', '/workbench/'],
  },
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function normalizedTarget(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  return `/${relative(root, resolve(sourceFile, '..', specifier)).replaceAll('\\', '/')}/`;
}

const violations = [];
for (const rule of rules) {
  for (const file of sourceFiles(resolve(root, rule.directory))) {
    const source = readFileSync(file, 'utf8');
    const imports = source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g);
    for (const match of imports) {
      const target = normalizedTarget(file, match[2]);
      const forbidden = rule.forbidden.find((value) => (
        value.startsWith('/') ? target.includes(value) : target === value || target.startsWith(`${value}/`)
      ));
      if (forbidden) violations.push(`${relative(root, file)} imports forbidden dependency ${match[2]}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`Architecture boundary validation failed:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Architecture boundary validation passed.');
}
