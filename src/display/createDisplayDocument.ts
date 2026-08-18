import { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
import { DEFAULT_DISPLAY_SURFACE } from './defaults';
import { generateId } from './ids';
import type { DisplayDocument } from './displayDocument';

export interface CreateDisplayDocumentOptions {
  id?: string;
  name?: string;
  generateId?: () => string;
}

export function createDisplayDocument(options: CreateDisplayDocumentOptions = {}): DisplayDocument {
  const generate = options.generateId ?? generateId;
  return {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    id: options.id ?? generate(),
    name: options.name ?? 'Untitled Display',
    surface: { ...DEFAULT_DISPLAY_SURFACE },
    elements: [],
    calculations: [],
  };
}
