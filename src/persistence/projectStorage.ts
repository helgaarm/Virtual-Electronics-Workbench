import { ApiProjectRepository } from './apiProjectRepository';

export function createProjectStorage(mode = import.meta.env.MODE, accountEmail?: string) {
  const sites = mode === 'sites';
  return {
    repository: new ApiProjectRepository('/api/projects', sites ? 'sites' : 'local', sites ? accountEmail : undefined),
    sites,
    label: sites ? 'Sites projects' : 'SQLite projects',
    location: sites ? 'Sites' : 'SQLite',
    status: sites ? 'Saved in Sites' : 'SQLite persistence',
    description: sites
      ? 'Projects are saved in the private Sites database and available from your other devices.'
      : 'Projects are saved in the local SQLite database.',
    unavailable: sites
      ? 'Sites storage is unavailable. Check your connection and sign in, then retry.'
      : 'SQLite service is not reachable yet. Run npm run dev to enable Save and Open.',
  };
}
