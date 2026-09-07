import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('repository workflow permission validation', () => {
  for (const newline of ['\n', '\r\n']) {
    it(`enforces permission indentation with ${JSON.stringify(newline)} line endings`, () => {
      const fixture = mkdtempSync(path.join(tmpdir(), 'workbench-security-'));
      try {
        for (const file of ['.github', '.gitignore', 'package.json', 'CONTRIBUTING.md', 'SECURITY.md']) {
          cpSync(path.resolve(file), path.join(fixture, file), { recursive: true });
        }
        const workflowPath = path.join(fixture, '.github/workflows/dependabot-auto-repair.yml');
        const workflow = readFileSync(workflowPath, 'utf8').replace(/\r?\n/g, newline);
        const validate = () => spawnSync(process.execPath, [path.resolve('scripts/validate-repository-security.mjs')], {
          cwd: fixture,
          encoding: 'utf8',
        });
        writeFileSync(workflowPath, workflow);
        const valid = validate();
        expect(valid.stderr).toBe('');
        expect(valid.status).toBe(0);

        writeFileSync(workflowPath, workflow.replace('      actions: write', '       actions: write'));
        const invalid = validate();
        expect(invalid.status).toBe(1);
        expect(invalid.stderr).toContain('must not grant actions: write at indentation 7');

        writeFileSync(workflowPath, workflow.replace('      actions: write', '      issues: write'));
        const unauthorized = validate();
        expect(unauthorized.status).toBe(1);
        expect(unauthorized.stderr).toContain('must not grant issues: write');
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  }
});
