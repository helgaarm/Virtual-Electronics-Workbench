import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WorkbenchProject } from '../src/domain/project';
import { migrateProjectDocument } from '../src/persistence/migrations';
import type { ProjectSummary } from '../src/persistence/projectRepository';

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  document: string;
}

export class SqliteProjectRepository {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec('PRAGMA foreign_keys = ON');
    if (filename !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    const version = this.database.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) {
      throw new Error(`SQLite schema version ${version.user_version} is newer than this application.`);
    }
    if (version.user_version < 1) {
      this.database.exec(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          document TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects(updated_at DESC);
        PRAGMA user_version = 1;
        COMMIT;
      `);
    }
  }

  list(): ProjectSummary[] {
    const rows = this.database
      .prepare('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC')
      .all() as unknown as Array<Omit<ProjectRow, 'document'>>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  get(id: string): WorkbenchProject | undefined {
    const row = this.database
      .prepare('SELECT document FROM projects WHERE id = ?')
      .get(id) as { document: string } | undefined;
    return row ? migrateProjectDocument(JSON.parse(row.document) as unknown) : undefined;
  }

  save(value: unknown): WorkbenchProject {
    const project = migrateProjectDocument(value);
    this.database
      .prepare(
        `INSERT INTO projects (id, name, created_at, updated_at, document)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at,
           document = excluded.document`,
      )
      .run(
        project.id,
        project.name,
        project.createdAt,
        project.updatedAt,
        JSON.stringify(project),
      );
    return project;
  }

  remove(id: string): boolean {
    return this.database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.database.close();
  }
}
