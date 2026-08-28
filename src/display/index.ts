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
  areDisplayDocumentsEqual,
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
export { appendProgramming, createProgramming, PROGRAMMING_TYPE } from './createProgramming';
export type { CreateProgrammingOptions, ProgrammingElement, ProgrammingProperties, ProgrammingQueryItem } from './createProgramming';
export { appendLibrarySymbol, createLibrarySymbol, DEFAULT_LIBRARY_SYMBOL_COLOR, getLibrarySymbolColor, LIBRARY_SYMBOL_TYPE, updateLibrarySymbolProperties } from './createLibrarySymbol';
export type { CreateLibrarySymbolOptions, LibrarySymbolElement, LibrarySymbolProperties } from './createLibrarySymbol';
export type {
  CreateRectangleOptions,
  RectangleElement,
  RectangleProperties,
  GeometricShape,
} from './createRectangle';
export {
  createGroup,
  extractAllGroupBindingsAndElements,
  findTopLevelElementId,
  getElementAbsoluteGeometry,
  GROUP_TYPE,
  groupElements,
  resizeGroup,
  scaleGroupChildren,
  ungroupElements,
  updateElementInDocument,
  updateGroupProperties,
} from './createGroup';
export type { CreateGroupOptions, GroupElement, GroupProperties } from './createGroup';

export { isElementLocked, updateElementLocked } from './createLocked';

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
  BAR_CHART_TYPE,
  DEFAULT_BAR_CHART_VISUAL_OPTIONS,
  DEFAULT_BAR_CHART_WIDTH,
  DEFAULT_BAR_CHART_HEIGHT,
  createBarChart,
  appendBarChart,
  addBarChartItem,
  removeBarChartItem,
  moveBarChartItem,
  getBarChartItems,
  getBarChartVisualOptions,
  updateBarChartVisualOptions,
  updateBarChartProperties,
  normalizeBarChartVisualOptions,
  barChartBindingKey,
  getBarChartItemConsumerId,
} from './createBarChart';
export type {
  BarChartElement,
  BarChartProperties,
  BarChartItem,
  BarChartVisualOptions,
  BarChartOrientation,
  BarChartGridMode,
  BarChartNumberFormat,
  BarChartLabelMode,
  BarChartScaleMode,
  BarChartStartMode,
  CreateBarChartOptions,
} from './createBarChart';
export { BarChartElementView } from './components/BarChartElementView';
export type { BarChartElementViewProps } from './components/BarChartElementView';

export { XY_PLOT_TYPE, addXYPlotYSeries, appendXYPlot, createXYPlot, getXYPlotYSeries, moveXYPlotYSeries, removeXYPlotYSeries, updateXYPlotProperties } from './createXYPlot';
export type { XYPlotElement, XYPlotProperties, XYPlotYSeries } from './createXYPlot';

export { addTableItem, appendTable, createTable, defaultTableColumns, removeTableItem, moveTableItem, TABLE_COLUMNS, TABLE_COLUMN_LABELS, TABLE_TYPE, updateTableProperties } from './createTable';
export type { CreateTableOptions, TableColumnAlign, TableColumnConfig, TableColumnId, TableDataItem, TableElement, TableProperties, TableStyle } from './createTable';

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
  addCalculationTrendSeries,
  addTrendSeries,
  appendTrend,
  createTrend,
  createTrendElementForElement,
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
export { convertDisplayElementType, getElementPiBindings, symbolConversionTargets } from './symbolConversion';
export type { SymbolBindingCapability, SymbolConversionType } from './symbolConversion';

export {
  DISPLAY_EXPORT_FORMAT,
  DISPLAY_EXPORT_VERSION,
  DisplayImportError,
  getDisplayExportFileName,
  parseImportedDisplay,
  serializeDisplayCsv,
  serializeDisplayXml,
  serializeDisplay,
} from './displayTransfer';
export type { DisplayExportEnvelope, DisplayExportFileFormat } from './displayTransfer';

export {
  createDefaultMultistateRule,
  evaluateMultistate,
  getMultistateColor,
  isValidMultistateRule,
  normalizeMultistateConfig,
  TRANSPARENT_COLOR,
  updateMultistateConfig,
  updateBackgroundMultistateConfig,
} from './multistate';
export type { MultistateConfig, MultistateMatch, MultistateOperator, MultistateRule } from './multistate';
