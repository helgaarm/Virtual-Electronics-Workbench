import { PROJECT_SCHEMA_VERSION } from '../src/domain/project';
import { ProjectValidationError, UnsupportedProjectVersionError } from '../src/persistence/migrations';
import { ProjectConflictError } from '../src/persistence/projectErrors';
import { D1ProjectRepository, ProjectTooLargeError } from './d1ProjectRepository';
import type { D1Binding } from './d1Types';

class RequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

async function readDocument(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'Project requests must use application/json.');
  }
  const limit = 2 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new RequestError(413, 'Project document exceeds the 2 MB limit.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Request body must contain valid JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, 'Project document exceeds the 2 MB limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new RequestError(400, 'Request body must contain valid JSON.'); }
}

/** The Worker must verify an email session or require the private Sites gateway before calling. */
export async function projectApi(request: Request, binding: D1Binding | undefined, ownerEmail?: string): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if ((origin !== null && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
        return json({ error: 'Cross-origin writes are not allowed.' }, 403);
      }
    }
    if (!binding) return json({ error: 'Sites database is unavailable. Please retry later.' }, 503);
    // Starting at the primary keeps cross-device reads and revisions current with D1 replication.
    const repository = new D1ProjectRepository(binding.withSession('first-primary'), ownerEmail);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      await repository.checkSchema();
      return json({ status: 'ok', storage: 'd1', projectSchemaVersion: PROJECT_SCHEMA_VERSION });
    }
    if (url.pathname === '/api/projects' && request.method === 'GET') return json(await repository.list());
    const match = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
    if (!match) return json({ error: 'Not found.' }, 404);
    let id: string;
    try { id = decodeURIComponent(match[1]); }
    catch { throw new RequestError(400, 'Invalid project ID.'); }
    if (!id || id.length > 100) throw new RequestError(400, 'Invalid project ID.');
    if (request.method === 'GET') {
      const project = await repository.get(id);
      return project ? json(project) : json({ error: 'Project not found.' }, 404);
    }
    if (request.method === 'DELETE') {
      return await repository.remove(id) ? json({ deleted: true }) : json({ error: 'Project not found.' }, 404);
    }
    const document = await readDocument(request);
    if (typeof document !== 'object' || document === null || !('id' in document) || document.id !== id) {
      throw new RequestError(400, 'URL and project IDs must match.');
    }
    // Validation is authoritative in the repository; this boundary does not trust request JSON.
    return json(await repository.save(document));
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    if (error instanceof ProjectTooLargeError) return json({ error: error.message }, 413);
    if (error instanceof ProjectConflictError) {
      return json({ error: error.message, ...(error.current ? { currentRevision: error.current.revision } : {}) }, 409);
    }
    if (error instanceof UnsupportedProjectVersionError) return json({ error: error.message }, 409);
    if (error instanceof ProjectValidationError) return json({ error: error.message }, 400);
    // Never return SQL, provider diagnostics, or project data in unexpected errors.
    return json({ error: 'Project storage is temporarily unavailable. Please retry.' }, 503);
  }
}
