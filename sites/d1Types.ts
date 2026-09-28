/** The subset of the D1 binding used here; no Node or provider SDK in the Worker. */
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Session {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface D1Binding {
  withSession(constraint: 'first-primary'): D1Session;
}
