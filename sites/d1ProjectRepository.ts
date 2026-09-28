import type { WorkbenchProject } from '../src/domain/project';
import { migrateProjectDocument } from '../src/persistence/migrations';
import { ProjectConflictError } from '../src/persistence/projectErrors';
import type { ProjectRepository, ProjectSummary } from '../src/persistence/projectRepository';
import type { D1Session } from './d1Types';

// D1's 2,000,000-byte row limit includes metadata as well as the document.
export const MAX_SITES_PROJECT_BYTES = 1_900_000;
export const MAX_SITES_PROJECTS = 100;
export const MAX_SITES_ACCOUNT_BYTES = 50_000_000;
export const SITES_PROJECT_PAGE_SIZE = 50;
export class ProjectQuotaExceededError extends Error {
  constructor() { super('Sites storage quota reached (100 projects or 50 MB). Export and delete unneeded projects, or reduce this project before saving.'); }
}
export class InvalidProjectCursorError extends Error {
  constructor() { super('Invalid project list cursor.'); }
}
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
      .first<{ version: number }>().then(async (row) => {
        if (row?.version !== 1) throw new Error('Unsupported Sites database schema.');
        const storage = await this.database.prepare('SELECT version FROM project_storage_schema WHERE id = 1').first<{ version: number }>();
        if (storage?.version !== 1) throw new Error('Unsupported Sites storage schema.');
      });
    return this.ready;
  }

  async list(): Promise<ProjectSummary[]> {
    const projects: ProjectSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listPage(cursor);
      projects.push(...page.projects); cursor = page.nextCursor;
      if (cursor && projects.length >= 10_000) throw new Error('Too many projects. Use paginated export.');
    } while (cursor);
    return projects;
  }

  async listPage(cursor?: string): Promise<{ projects: ProjectSummary[]; nextCursor?: string }> {
    await this.checkSchema();
    let after: string[] = [];
    if (cursor !== undefined) {
      try {
        if (cursor.length > 512 || !/^[A-Za-z0-9+/=]+$/.test(cursor)) throw new InvalidProjectCursorError();
        const parsed: unknown = JSON.parse(atob(cursor));
        if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((value) => typeof value !== 'string' || value.length > 100)) throw new InvalidProjectCursorError();
        after = [parsed[0] as string, parsed[0] as string, parsed[1] as string];
      } catch { throw new InvalidProjectCursorError(); }
    }
    const { results } = await this.database.prepare(
      `SELECT id, name, created_at, updated_at FROM ${this.table} WHERE ${this.ownerClause}1 = 1
        ${after.length ? 'AND (updated_at < ? OR (updated_at = ? AND id > ?))' : ''}
        ORDER BY updated_at DESC, id LIMIT ?`,
    ).bind(...this.ownerValues, ...after, SITES_PROJECT_PAGE_SIZE + 1).all<ProjectRow>();
    const rows = results.slice(0, SITES_PROJECT_PAGE_SIZE);
    const last = rows.at(-1);
    return {
      projects: rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at })),
      ...(results.length > SITES_PROJECT_PAGE_SIZE && last ? { nextCursor: btoa(JSON.stringify([last.updated_at, last.id])) } : {}),
    };
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
    const bytes = new TextEncoder().encode(document).byteLength;
    if (bytes > MAX_SITES_PROJECT_BYTES) throw new ProjectTooLargeError();
    const scope = this.ownerEmail ?? '';

    // Compare the entire stored document in the write itself. A concurrent update, delete,
    // or a future-format document can never be overwritten after the preceding read.
    const statement = previousDocument === undefined
      ? this.database.prepare(`INSERT INTO ${this.table} (${this.ownerEmail === undefined ? '' : 'owner_email, '}id, name, created_at, updated_at, document)
          SELECT ${this.ownerEmail === undefined ? '' : '?, '}?, ?, ?, ?, ?
          WHERE coalesce((SELECT project_count FROM project_storage_usage WHERE scope = ?), 0) < ?
            AND coalesce((SELECT document_bytes FROM project_storage_usage WHERE scope = ?), 0) + ? <= ?
          ON CONFLICT DO NOTHING RETURNING document`)
        .bind(...this.ownerValues, saved.id, saved.name, saved.createdAt, saved.updatedAt, document,
          scope, MAX_SITES_PROJECTS, scope, bytes, MAX_SITES_ACCOUNT_BYTES)
      : this.database.prepare(`UPDATE ${this.table} SET name = ?, updated_at = ?, document = ?
          WHERE ${this.ownerClause}id = ? AND document = ?
            AND (? <= length(CAST(document AS BLOB)) OR
              (SELECT document_bytes FROM project_storage_usage WHERE scope = ?) - length(CAST(document AS BLOB)) + ? <= ?)
          RETURNING document`)
        .bind(saved.name, saved.updatedAt, document, ...this.ownerValues, saved.id, previousDocument,
          bytes, scope, bytes, MAX_SITES_ACCOUNT_BYTES);
    const row = await statement.first<{ document: string }>();
    if (!row) {
      if (await this.document(project.id) !== previousDocument) throw new ProjectConflictError(await this.get(project.id));
      throw new ProjectQuotaExceededError();
    }
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    await this.checkSchema();
    const result = await this.database.prepare(`DELETE FROM ${this.table} WHERE ${this.ownerClause}id = ?`).bind(...this.ownerValues, id).run();
    return result.meta.changes > 0;
  }
}
