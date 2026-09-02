import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { PiPointBinding } from '../pi/piPointBinding';

import { VALUE_TYPE } from './createValue';
import { GAUGE_TYPE } from './createGauge';
import { BAR_TYPE } from './createBar';
import { TEXT_TYPE } from './createText';
import { RECTANGLE_TYPE } from './createRectangle';
import { LIBRARY_SYMBOL_TYPE } from './createLibrarySymbol';
import { TREND_TYPE } from './createTrend';
import { TABLE_TYPE } from './createTable';
import { BAR_CHART_TYPE } from './createBarChart';
import { XY_PLOT_TYPE } from './createXYPlot';

export type DataSourceCapability = 'single' | 'multiple' | 'xy' | 'none';

/**
 * Returns the PI Point binding capability of an element type.
 */
export function getElementDataSourceCapability(element: DisplayElement): DataSourceCapability {
  switch (element.type) {
    case VALUE_TYPE:
    case GAUGE_TYPE:
    case BAR_TYPE:
    case TEXT_TYPE:
    case RECTANGLE_TYPE:
    case LIBRARY_SYMBOL_TYPE:
      return 'single';
    case TREND_TYPE:
    case TABLE_TYPE:
    case BAR_CHART_TYPE:
      return 'multiple';
    case XY_PLOT_TYPE:
      return 'xy';
    default:
      return 'none';
  }
}

/**
 * Creates a copy of the display document with the PI Point binding replaced 
 * on the specified single-binding element.
 * Retains all visual configurations, limits, coordinates, z-order, and ID.
 * Removes any calculationId.
 */
export function replaceElementPiBinding(
  document: DisplayDocument,
  elementId: string,
  binding: PiPointBinding
): DisplayDocument {
  const index = document.elements.findIndex((candidate) => candidate.id === elementId);
  if (index === -1) {
    return document;
  }
  
  const element = document.elements[index];
  const properties = {
    ...element.properties,
    binding,
  } as Record<string, unknown>;

  // A direct drop of a PI Point removes any existing calculation.
  if ('calculationId' in properties) {
    properties.calculationId = undefined;
  }

  return {
    ...document,
    elements: [
      ...document.elements.slice(0, index),
      { ...element, properties },
      ...document.elements.slice(index + 1),
    ],
  };
}
