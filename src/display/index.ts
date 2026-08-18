export { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
export type { DisplaySchemaVersion } from './schemaVersion';

export type { DisplaySurface } from './displaySurface';

export type { DisplayElement } from './displayElement';

export type { DisplayDocument } from './displayDocument';
export { appendCalculationValue, createCalculationValue, CALCULATION_TYPE } from './createCalculation';
export type { CalculationElement, CalculationProperties, CreateCalculationOptions } from './createCalculation';

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
  updateRectangleProperties,
} from './createRectangle';
export { appendText, createText, DEFAULT_TEXT_PROPERTIES, TEXT_TYPE, updateTextProperties } from './createText';
export type { CreateTextOptions, TextAlign, TextElement, TextProperties } from './createText';
export { appendImage, createImage, IMAGE_TYPE } from './createImage';
export type { CreateImageOptions, ImageElement, ImageProperties } from './createImage';
export { appendLibrarySymbol, createLibrarySymbol, DEFAULT_LIBRARY_SYMBOL_COLOR, getLibrarySymbolColor, LIBRARY_SYMBOL_TYPE, updateLibrarySymbolProperties } from './createLibrarySymbol';
export type { CreateLibrarySymbolOptions, LibrarySymbolElement, LibrarySymbolProperties } from './createLibrarySymbol';
export type {
  CreateRectangleOptions,
  RectangleElement,
  RectangleProperties,
  GeometricShape,
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
export type { CreateGaugeOptions, GaugeElement, GaugeProperties, GaugeStyle, GaugeVisualOptions } from './createGauge';

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

export {
  addTrendSeries,
  appendTrend,
  createTrend,
  getTrendSeries,
  getTrendVisualOptions,
  updateTrendVisualOptions,
  updateTrendSeriesOptions,
  trendBindingKey,
  TREND_SERIES_COLORS,
  TREND_TYPE,
} from './createTrend';
export type { CreateTrendOptions, TrendElement, TrendProperties, TrendSeries, TrendVisualOptions, TrendLineStyle, TrendMarker, TrendNumberFormat } from './createTrend';

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
  TRANSPARENT_COLOR,
  updateMultistateConfig,
} from './multistate';
export type { MultistateConfig, MultistateMatch, MultistateOperator, MultistateRule } from './multistate';
