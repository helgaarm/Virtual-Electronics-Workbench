import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Express } from 'express';
import { UnsupportedProjectVersionError } from '../src/persistence/migrations';
import { SqliteProjectRepository } from './sqliteProjectRepository';

export function createApp(repository: SqliteProjectRepository, staticDirectory?: string): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', storage: 'sqlite' });
  });

  app.get('/api/projects', (_request, response) => {
    response.json(repository.list());
  });

  app.get('/api/projects/:id', (request, response) => {
    const project = repository.get(request.params.id);
    if (!project) return response.status(404).json({ error: 'Project not found.' });
    return response.json(project);
  });

  app.put('/api/projects/:id', (request, response) => {
    try {
      if (!request.body || request.params.id !== request.body.id) {
        return response.status(400).json({ error: 'URL and project IDs must match.' });
      }
      return response.json(repository.save(request.body));
    } catch (error) {
      const status = error instanceof UnsupportedProjectVersionError ? 409 : 400;
      return response.status(status).json({
        error: error instanceof Error ? error.message : 'Invalid project document.',
      });
    }
  });

  app.delete('/api/projects/:id', (request, response) => {
    if (!repository.remove(request.params.id)) {
      return response.status(404).json({ error: 'Project not found.' });
    }
    return response.json({ deleted: true });
  });

  if (staticDirectory && existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
      return response.sendFile(resolve(staticDirectory, 'index.html'));
    });
  }

  return app;
}
