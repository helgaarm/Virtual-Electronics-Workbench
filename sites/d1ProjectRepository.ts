import type { WorkbenchProject } from '../src/domain/project';
import { migrateProjectDocument } from '../src/persistence/migrations';
import { ProjectConflictError } from '../src/persistence/projectErrors';
import type { ProjectRepository, ProjectSummary } from '../src/persistence/projectRepository';
import type { D1Session } from './d1Types';

// D1's 2,000,000-byte row limit includes metadata as well as the document.
export const MAX_SITES_PROJECT_BYTES = 1_900_000;
export class ProjectTooLargeError extends Error {
  constructor() { super('Project exceeds the Sites storage limit of 1.9 MB.'); }
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export class D1ProjectRepository implements ProjectRepository {
  private ready?: Promise<void>;
  private readonly table: 'projects' | 'account_projects';
  private readonly ownerClause: string;
  private readonly ownerValues: string[];
  /** An account scope is supplied only after server-side session verification. */
  constructor(private readonly database: D1Session, private readonly ownerEmail?: string) {
    this.table = ownerEmail === undefined ? 'projects' : 'account_projects';
    this.ownerClause = ownerEmail === undefined ? '' : 'owner_email = ? AND ';
    this.ownerValues = ownerEmail === undefined ? [] : [ownerEmail];
  }

  checkSchema(): Promise<void> {
    this.ready ??= this.database.prepare('SELECT version FROM workbench_schema WHERE id = 1')
      .first<{ version: number }>().then((row) => {
        if (row?.version !== 1) throw new Error('Unsupported Sites database schema.');
      });
    return this.ready;
  }

  async list(): Promise<ProjectSummary[]> {
    await this.checkSchema();
    const { results } = await this.database.prepare(
      `SELECT id, name, created_at, updated_at FROM ${this.table} WHERE ${this.ownerClause}1 = 1 ORDER BY updated_at DESC, id`,
    ).bind(...this.ownerValues).all<ProjectRow>();
    return results.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  private async document(id: string): Promise<string | undefined> {
    await this.checkSchema();
    const row = await this.database.prepare(`SELECT document FROM ${this.table} WHERE ${this.ownerClause}id = ?`)
      .bind(...this.ownerValues, id).first<{ document: string }>();
    return row?.document;
  }

  async get(id: string): Promise<WorkbenchProject | undefined> {
    const document = await this.document(id);
    return document === undefined ? undefined : migrateProjectDocument(JSON.parse(document) as unknown);
  }

  async save(value: unknown): Promise<WorkbenchProject> {
    const project = migrateProjectDocument(value);
    const previousDocument = await this.document(project.id);
    const existing = previousDocument === undefined ? undefined : migrateProjectDocument(JSON.parse(previousDocument) as unknown);
    if (existing ? existing.revision !== project.revision : project.revision !== 0) {
      throw new ProjectConflictError(existing);
    }
    const saved = { ...project, revision: project.revision + 1, createdAt: existing?.createdAt ?? project.createdAt };
    const document = JSON.stringify(saved);
    if (new TextEncoder().encode(document).byteLength > MAX_SITES_PROJECT_BYTES) throw new ProjectTooLargeError();

    // Compare the entire stored document in the write itself. A concurrent update, delete,
    // or a future-format document can never be overwritten after the preceding read.
    const statement = previousDocument === undefined
      ? this.database.prepare(`INSERT INTO ${this.table} (${this.ownerEmail === undefined ? '' : 'owner_email, '}id, name, created_at, updated_at, document)
          VALUES (${this.ownerEmail === undefined ? '' : '?, '}?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING document`)
        .bind(...this.ownerValues, saved.id, saved.name, saved.createdAt, saved.updatedAt, document)
      : this.database.prepare(`UPDATE ${this.table} SET name = ?, updated_at = ?, document = ?
          WHERE ${this.ownerClause}id = ? AND document = ? RETURNING document`)
        .bind(saved.name, saved.updatedAt, document, ...this.ownerValues, saved.id, previousDocument);
    const row = await statement.first<{ document: string }>();
    if (!row) throw new ProjectConflictError(await this.get(project.id));
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    await this.checkSchema();
    const result = await this.database.prepare(`DELETE FROM ${this.table} WHERE ${this.ownerClause}id = ?`).bind(...this.ownerValues, id).run();
    return result.meta.changes > 0;
  }
}
