import type { DisplaySchemaVersion } from './schemaVersion';
import type { DisplaySurface } from './displaySurface';
import type { DisplayElement } from './displayElement';
import type { CalculationDefinition } from '../calculations/calculationEngine';

export interface DisplayDocument {
  schemaVersion: DisplaySchemaVersion;
  id: string;
  name: string;
  surface: DisplaySurface;
  elements: DisplayElement[];
  calculations?: CalculationDefinition[];
}
