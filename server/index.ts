import { resolve } from 'node:path';
import { createApp } from './app';
import { SqliteProjectRepository } from './sqliteProjectRepository';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const databaseFile = process.env.WORKBENCH_DB ?? resolve(process.cwd(), 'data', 'workbench.sqlite');
const repository = new SqliteProjectRepository(databaseFile);
const app = createApp(repository, resolve(process.cwd(), 'dist'));

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Virtual Electronics Workbench API listening on http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${databaseFile}`);
});

function shutdown(): void {
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
