export { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
export type { DisplaySchemaVersion } from './schemaVersion';

export type { DisplaySurface } from './displaySurface';

export type { DisplayElement } from './displayElement';

export type { DisplayDocument } from './displayDocument';

export { DEFAULT_DISPLAY_SURFACE } from './defaults';

export { generateId } from './ids';

export { createDisplayDocument } from './createDisplayDocument';
export type { CreateDisplayDocumentOptions } from './createDisplayDocument';
export {
  createDisplayHistory,
  DISPLAY_HISTORY_LIMIT,
  hasRedo,
  hasUndo,
  recordDisplayEdit,
  redoDisplayEdit,
  undoDisplayEdit,
} from './displayHistory';
export type { DisplayHistoryState } from './displayHistory';

export {
  appendDisplayElement,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  RECTANGLE_TYPE,
} from './createRectangle';
export type {
  CreateRectangleOptions,
  RectangleElement,
  RectangleProperties,
} from './createRectangle';

export { appendValue, createValue, VALUE_TYPE } from './createValue';
export {
  DEFAULT_VALUE_VISUAL_OPTIONS,
  getValueVisualOptions,
  normalizeValueVisualOptions,
  updateValueVisualOptions,
} from './createValue';

export {
  appendGauge,
  createGauge,
  GAUGE_TYPE,
  getGaugeOptions,
  updateGaugeOptions,
} from './createGauge';
export type { CreateGaugeOptions, GaugeElement, GaugeProperties } from './createGauge';

export {
  appendBar,
  createBar,
  BAR_TYPE,
  getBarOptions,
  updateBarOptions,
} from './createBar';
export type { BarElement, BarProperties, CreateBarOptions } from './createBar';

export {
  DEFAULT_SCALE_OPTIONS,
  formatScaleValue,
  getScaleRatio,
  normalizeScaleOptions,
} from './scaleOptions';
export type { BarOrientation, ScaleVisualOptions } from './scaleOptions';
export type {
  CreateValueOptions,
  ValueElement,
  ValueProperties,
  ValueTextAlign,
  ValueVisualOptions,
} from './createValue';

export { appendTrend, createTrend, TREND_TYPE } from './createTrend';
export type { CreateTrendOptions, TrendElement, TrendProperties } from './createTrend';

export type { PiPointBinding } from '../pi/piPointBinding';

export {
  DISPLAY_EXPORT_FORMAT,
  DISPLAY_EXPORT_VERSION,
  DisplayImportError,
  getDisplayExportFileName,
  parseImportedDisplay,
  serializeDisplay,
} from './displayTransfer';
export type { DisplayExportEnvelope } from './displayTransfer';

export {
  createDefaultMultistateRule,
  evaluateMultistate,
  getMultistateColor,
  isValidMultistateRule,
  normalizeMultistateConfig,
  updateMultistateConfig,
} from './multistate';
export type { MultistateConfig, MultistateMatch, MultistateOperator, MultistateRule } from './multistate';
