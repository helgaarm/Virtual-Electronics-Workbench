import { PROJECT_SCHEMA_VERSION, type WorkbenchProject } from '../domain/project';

export class UnsupportedProjectVersionError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateProjectDocument(value: unknown): WorkbenchProject {
  if (!isRecord(value)) throw new Error('Project document must be an object.');
  if (value.version !== PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(
      `Project version ${String(value.version)} is not supported by version ${PROJECT_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(value.board) ||
    typeof value.board.id !== 'string' ||
    typeof value.board.columns !== 'number' ||
    typeof value.powerOn !== 'boolean' ||
    (value.workspace !== 'build' && value.workspace !== 'analysis') ||
    !Array.isArray(value.components) ||
    !Array.isArray(value.probes) ||
    !isRecord(value.view)
  ) {
    throw new Error('Project document is missing required fields.');
  }
  return value as unknown as WorkbenchProject;
}
