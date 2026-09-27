import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Binding, D1Session, D1Statement } from '../../sites/d1Types';

/** Executes the actual D1 SQL against SQLite instead of mocking query outcomes. */
export class SqliteD1 implements D1Binding, D1Session {
  readonly database: DatabaseSync;
  readonly queries: string[] = [];
  constructor(filename = ':memory:', migrate = true) {
    this.database = new DatabaseSync(filename);
    if (migrate) {
      this.database.exec(readFileSync(new URL('../../drizzle/0000_workbench.sql', import.meta.url), 'utf8'));
      this.database.exec(readFileSync(new URL('../../drizzle/0001_email_auth.sql', import.meta.url), 'utf8'));
    }
  }
  withSession(constraint: 'first-primary'): D1Session {
    if (constraint !== 'first-primary') throw new Error('Expected primary read consistency.');
    return this;
  }
  async batch(statements: D1Statement[]): Promise<unknown[]> {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  prepare(sql: string): D1Statement {
    this.queries.push(sql);
    const statement = this.database.prepare(sql);
    const make = (values: (string | number | null)[]): D1Statement => ({
      bind: (...bound) => make(bound),
      first: async <T>() => (statement.get(...values) as unknown as T | undefined) ?? null,
      all: async <T>() => ({ results: statement.all(...values) as unknown as T[] }),
      run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
    });
    return make([]);
  }
  close(): void { this.database.close(); }
}
