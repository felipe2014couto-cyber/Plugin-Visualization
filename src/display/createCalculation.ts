import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { normalizeValueVisualOptions, type ValueVisualOptions } from './createValue';

export const CALCULATION_TYPE = 'calculation' as const;

export interface CalculationProperties extends Record<string, unknown> {
  calculationId: string;
  visual: ValueVisualOptions;
}

export type CalculationElement = DisplayElement<typeof CALCULATION_TYPE, CalculationProperties>;

export interface CreateCalculationOptions {
  calculationId: string;
  visual?: Partial<ValueVisualOptions>;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createCalculationValue(options: CreateCalculationOptions): CalculationElement {
  const surface = options.surface;
  const width = options.width ?? Math.min(240, surface?.width ?? 240);
  const height = options.height ?? Math.min(100, surface?.height ?? 100);
  const safeWidth = Math.max(1, Math.min(width, surface?.width ?? width));
  const safeHeight = Math.max(1, Math.min(height, surface?.height ?? height));
  const generate = options.generateId ?? generateId;
  const existingIds = new Set(options.existingIds ?? []);
  let id = options.id ?? generate();
  while (existingIds.has(id)) {
    id = generate();
  }

  return {
    id,
    type: CALCULATION_TYPE,
    x: options.x ?? Math.max(0, ((surface?.width ?? safeWidth) - safeWidth) / 2),
    y: options.y ?? Math.max(0, ((surface?.height ?? safeHeight) - safeHeight) / 2),
    width: safeWidth,
    height: safeHeight,
    properties: {
      calculationId: options.calculationId,
      visual: normalizeValueVisualOptions(options.visual),
    },
  };
}

export function appendCalculationValue(document: DisplayDocument, element: CalculationElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}
