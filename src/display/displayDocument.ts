import type { DisplaySchemaVersion } from './schemaVersion';
import type { DisplaySurface } from './displaySurface';
import type { DisplayElement } from './displayElement';

export interface DisplayDocument {
  schemaVersion: DisplaySchemaVersion;
  id: string;
  name: string;
  surface: DisplaySurface;
  elements: DisplayElement[];
}
