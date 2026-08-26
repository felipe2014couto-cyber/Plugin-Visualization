/**
 * piVisionConverter.ts
 *
 * Converte a definicao JSON de um Display do PI Vision (AVEVA)
 * para o formato nativo DisplayDocument do PIMS Vision / Aperam Visualization.
 *
 * LIMITACOES CONHECIDAS:
 * - dataSourceUid: o JSON do PI Vision nao contem o UID do datasource do Grafana.
 *   O importador tenta detectar o datasource e, no uso direto desta funcao,
 *   utiliza PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER como fallback.
 * - Expressoes PI sao traduzidas para o mecanismo de calculos local; funcoes
 *   proprietarias que nao existam no mecanismo ainda podem exigir ajuste.
 * - Imagens de fundo (BackgroundImage) sao ignoradas nesta versao.
 * - Graficos industriais sao incorporados pelo proxy a partir da biblioteca
 *   oficial; quando indisponiveis, o conversor usa um SVG esquematico local.
 */

import { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
import { generateId } from './ids';
import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { PiPointBinding } from '../pi/piPointBinding';
import type { CalculationDefinition } from '../calculations/calculationEngine';
import type { MultistateConfig, MultistateRule, MultistateOperator } from './multistate';
import {
  VALUE_TYPE,
  DEFAULT_VALUE_VISUAL_OPTIONS,
  type ValueProperties,
  type ValueTextAlign,
} from './createValue';
import {
  TREND_TYPE,
  TREND_SERIES_COLORS,
  createCalculationTrendBinding,
  type TrendProperties,
  type TrendSeries,
} from './createTrend';
import { GAUGE_TYPE, type GaugeProperties } from './createGauge';
import { BAR_TYPE, type BarProperties } from './createBar';
import {
  TABLE_TYPE,
  type TableProperties,
  type TableDataItem,
  defaultTableColumns,
} from './createTable';
import {
  TEXT_TYPE,
  DEFAULT_TEXT_PROPERTIES,
  type TextProperties,
  type TextAlign,
} from './createText';
import {
  RECTANGLE_TYPE,
  DEFAULT_RECTANGLE_PROPERTIES,
  type RectangleProperties,
  type GeometricShape,
} from './createRectangle';
import { IMAGE_TYPE, type ImageProperties } from './createImage';
import { LIBRARY_SYMBOL_TYPE, type LibrarySymbolProperties } from './createLibrarySymbol';

// ---------------------------------------------------------------------------
// Placeholder de datasource
// ---------------------------------------------------------------------------

/**
 * UID temporario usado como dataSourceUid quando o JSON do PI Vision nao
 * contem a informacao do datasource do Grafana. O usuario deve corrigir
 * esse valor no editor apos a importacao.
 */
export const PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER = '__pims_import__';

// ---------------------------------------------------------------------------
// Interfaces que modelam o JSON exportado pelo PI Vision
// ---------------------------------------------------------------------------

export interface PiVisionDisplay {
  Id?: number | string;
  Name?: string;
  Description?: string;
  Width?: number;
  Height?: number;
  BackgroundColor?: string;
  DisplayProperties?: {
    BackgroundColor?: string;
    Calculations?: PiVisionCalculation[];
  };
  Symbols?: PiVisionSymbol[];
}

export interface PiVisionCalculation {
  Name?: string;
  Description?: string | null;
  Server?: string;
  Expression?: string;
}

export interface PiVisionSymbol {
  Id?: string;
  SymbolType?: string;
  /** Posicao horizontal em pixels a partir da esquerda do canvas. */
  Left?: number;
  /** Posicao vertical em pixels a partir do topo do canvas. */
  Top?: number;
  Width?: number;
  Height?: number;
  ZIndex?: number;
  /** O endpoint OpenEditDisplay devolve os bindings no nivel do simbolo. */
  DataSources?: string[];
  MSDataSources?: string[];
  Configuration?: PiVisionSymbolConfiguration;
  Multistate?: PiVisionMultistateConfig;
}

export interface PiVisionSymbolConfiguration {
  // DataSources: lista de paths pi:\\ ou af:\\ dos tags vinculados
  DataSources?: string[];
  DataItems?: PiVisionDataItem[];
  Left?: number;
  Top?: number;
  Right?: number;
  Center?: number;
  Width?: number;
  Height?: number;
  // Aparencia
  ForeColor?: string;
  BackColor?: string;
  BackgroundColor?: string;
  Fill?: string;
  Stroke?: string;
  ValueStroke?: string;
  TextSize?: number;
  FontSize?: number;
  FontName?: string;
  FormatType?: string;
  NameType?: string;
  CustomName?: string;
  Decimals?: number;
  // Visibilidade de campos
  ShowLabel?: boolean;
  ShowTagName?: boolean;
  ShowUnit?: boolean;
  ShowTimestamp?: boolean;
  ShowTime?: boolean;
  ShowUOM?: boolean;
  ShowValue?: boolean;
  TextAlignment?: string;
  // Escala (Gauge / Bar)
  MinValue?: number;
  MaxValue?: number;
  ValueScaleSettings?: {
    MinValue?: number;
    MaxValue?: number;
  };
  FaceAngle?: number;
  IndicatorType?: string;
  IndicatorColor?: string;
  BorderColor?: string;
  ScaleColor?: string;
  ValueColor?: string;
  ScaleLabels?: string;
  LabelLocation?: string;
  // Trend
  Traces?: PiVisionTrace[];
  TraceSettings?: PiVisionTrace[];
  Title?: string;
  TrendConfig?: {
    LegendWidth?: number;
  };
  // Forma geometrica (Shape)
  ShapeType?: string;
  StrokeWidth?: number;
  StrokeStyle?: string;
  Rotation?: number;
  Points?: Array<{ X?: number; Y?: number }>;
  DirectoryKey?: string;
  FileKey?: string;
  GraphicSource?: string;
  Flip?: string;
  AttachmentId?: number;
  ImageData?: string;
  Multistates?: PiVisionThresholdMultistate[];
  // Texto estatico
  Content?: string;
  Text?: string;
  StaticText?: string;
  LinkURL?: string;
  NewTab?: boolean | null;
  // Orientacao (Bar)
  Orientation?: string;
}

export interface PiVisionThresholdMultistate {
  LowerValue?: number;
  StateVariables?: string[];
  States?: Array<{
    UpperValue?: number;
    StateValues?: unknown[];
  }>;
}

export interface PiVisionDataItem {
  Path?: string;
  DataSource?: string;
  Color?: string;
  Label?: string;
  LegendLabel?: string;
  CustomName?: string;
  MinValue?: number;
  MaxValue?: number;
}

export interface PiVisionTrace {
  Path?: string;
  DataSource?: string;
  Color?: string;
  Label?: string;
  LegendLabel?: string;
  CustomName?: string;
  MinValue?: number;
  MaxValue?: number;
}

export interface PiVisionMultistateConfig {
  Triggers?: PiVisionMultistateTrigger[];
}

export interface PiVisionMultistateTrigger {
  Expression?: string;
  ForeColor?: string;
  BackColor?: string;
}

// ---------------------------------------------------------------------------
// Classe de erro de conversao
// ---------------------------------------------------------------------------

export class PiVisionConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiVisionConvertError';
  }
}

// ---------------------------------------------------------------------------
// Calculos do PI Vision
// ---------------------------------------------------------------------------

export function convertPiVisionCalculations(
  source: PiVisionCalculation[] | undefined,
  dataSourceUid: string,
): CalculationDefinition[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const names = new Set<string>();
  return source.flatMap((calculation) => {
    const name = calculation.Name?.trim();
    const rawExpression = calculation.Expression?.trim();
    const serverPath = removePiVisionResourceId(calculation.Server ?? '');
    if (!name || !rawExpression || !serverPath) {
      return [];
    }

    const normalizedName = normalizeCalculationName(name);
    if (names.has(normalizedName)) {
      return [];
    }
    names.add(normalizedName);

    const pointNames = extractPiVisionExpressionPointNames(rawExpression);
    const inputs = pointNames.map((pointName) => ({
      name: pointName,
      binding: { dataSourceUid, serverPath, pointName },
    }));
    const description = calculation.Description?.trim();

    return [{
      id: generateId(),
      name,
      ...(description ? { description } : {}),
      expression: translatePiVisionExpression(rawExpression),
      inputs,
    }];
  });
}

export function translatePiVisionExpression(expression: string): string {
  const withoutQuotedPointNames = expression.replace(/'([^']+)'/g, '$1').trim();
  const conditional = withoutQuotedPointNames.match(/^if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+)$/i);
  const translated = conditional
    ? `IF(${translatePiVisionExpression(conditional[1])}, ${translatePiVisionExpression(conditional[2])}, ${translatePiVisionExpression(conditional[3])})`
    : withoutQuotedPointNames;

  return translated
    .replace(/<>/g, '!=')
    .replace(/(?<![<>=!])=(?!=)/g, '==')
    .replace(/\band\b/gi, '&&')
    .replace(/\bor\b/gi, '||');
}


const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
function isPiTimeString(str: string): boolean {
  const lower = str.trim().toLocaleLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) {
    return true;
  }
  if (/^(\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)[+-]\d+[smhdwy]$/.test(lower)) {
    return true;
  }
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(lower)) {
    return true;
  }
  return false;
}

function extractPiVisionExpressionPointNames(expression: string): string[] {
  const names = new Map<string, string>();
  for (const match of expression.matchAll(/'([^']+)'/g)) {
    const pointName = match[1].trim();
    const normalized = pointName.toLocaleLowerCase();
    if (pointName && !names.has(normalized) && !isPiTimeString(pointName)) {
      names.set(normalized, pointName);
    }
  }
  return [...names.values()];
}

function normalizeCalculationName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function resolveCalculationReference(
  path: string,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): CalculationDefinition | undefined {
  const match = path.trim().match(/^calc:(.+?)(?:\.value)?$/i);
  return match ? calculationsByName.get(normalizeCalculationName(match[1])) : undefined;
}

function firstCalculation(
  symbol: PiVisionSymbol,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): CalculationDefinition | undefined {
  return getDataSourcePaths(symbol)
    .map((path) => resolveCalculationReference(path, calculationsByName))
    .find((calculation): calculation is CalculationDefinition => calculation !== undefined);
}

// ---------------------------------------------------------------------------
// Funcao principal
// ---------------------------------------------------------------------------

/**
 * Converte um objeto JSON do PI Vision para um DisplayDocument do PIMS Vision.
 *
 * @param json - Objeto JavaScript resultante do parse do JSON exportado pelo PI Vision.
 * @param dataSourceUid - UID do datasource PI no Grafana. Se nao fornecido, usa o placeholder
 *   `PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER` que deve ser corrigido pelo usuario.
 * @returns DisplayDocument compativel com o PIMS Vision.
 * @throws PiVisionConvertError se o input nao for um objeto valido.
 */
function applyContextualColors(elements: DisplayElement[]) {
  const isInside = (textEl: DisplayElement, bgEl: DisplayElement) => {
    const cx = textEl.x + textEl.width / 2;
    const cy = textEl.y + textEl.height / 2;
    return cx >= bgEl.x && cx <= bgEl.x + bgEl.width &&
           cy >= bgEl.y && cy <= bgEl.y + bgEl.height;
  };

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'value' || el.type === 'text' || el.type === 'calculation') {
      const isText = el.type === 'text';
      const color = isText ? (el.properties as any).color : (el.properties as any).visual?.color;
      
      if (color === '#ffffff' || color === 'white' || color === '#fff') {
        let backgroundElement = null;
        for (let j = i - 1; j >= 0; j--) {
          const bg = elements[j];
          if (bg.type === 'rectangle' || bg.type === 'ellipse' || bg.type === 'polygon' || bg.type === 'graphic') {
            if (isInside(el, bg)) {
              backgroundElement = bg;
              break;
            }
          }
        }

        if (backgroundElement) {
          const bgFill = (backgroundElement.properties as any).fill;
          const isBgBlack = bgFill === '#000000' || bgFill === 'black';
          const hasBgMultistate = !!(backgroundElement.properties as any).multistate?.enabled;
          
          const newColor = (isBgBlack && !hasBgMultistate) ? '#ffffff' : '#000000';
          
          if (isText) {
            (el.properties as any).color = newColor;
          } else {
            (el.properties as any).visual.color = newColor;
          }
        }
      }
    }
  }
}

export function convertPiVisionDisplay(
  json: unknown,
  dataSourceUid?: string,
): DisplayDocument {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new PiVisionConvertError('JSON do PI Vision invalido: esperado um objeto.');
  }

  const display = json as PiVisionDisplay;
  const uid = dataSourceUid?.trim() || PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER;

  const symbols: PiVisionSymbol[] = Array.isArray(display.Symbols) ? display.Symbols : [];
  const calculations = convertPiVisionCalculations(display.DisplayProperties?.Calculations, uid);
  const calculationsByName = new Map(calculations.map((calculation) => [normalizeCalculationName(calculation.name), calculation]));
  const bounds = getDisplayBounds(symbols);
  const width = typeof display.Width === 'number' && display.Width > 0
    ? display.Width
    : bounds?.width ?? 1920;
  const height = typeof display.Height === 'number' && display.Height > 0
    ? display.Height
    : bounds?.height ?? 1080;
  const backgroundColor = normalizeColor(display.BackgroundColor ?? display.DisplayProperties?.BackgroundColor) ?? '#1f1f1f';

  const existingIds = new Set<string>();
  const elements: DisplayElement[] = [];

  for (const symbol of symbols) {
    const element = convertSymbol(symbol, uid, existingIds, calculationsByName);
    if (element !== undefined) {
      existingIds.add(element.id);
      elements.push(element);
    }
  }
  const normalizedElements = normalizeImportedTrendLayout(elements);
  applyContextualColors(normalizedElements);

  return {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    id: generateId(),
    name: typeof display.Name === 'string' && display.Name.trim() ? display.Name.trim() : 'Display Importado',
    surface: { width, height, backgroundColor },
    elements: normalizedElements,
    calculations,
  };
}

// ---------------------------------------------------------------------------
// Conversao por tipo de simbolo
// ---------------------------------------------------------------------------

function convertSymbol(
  symbol: PiVisionSymbol,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const type = (symbol.SymbolType ?? '').trim().toLowerCase();
  const geo = extractGeometry(symbol);

  switch (type) {
    case 'value':
    case 'currentvalue':
      return convertValue(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'trend':
    case 'multitrend':
      return convertTrend(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'gauge':
    case 'radialgauge':
    case 'lineargauge':
      return convertGauge(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'verticalbar':
    case 'horizontalbar':
    case 'verticalgauge':
    case 'horizontalgauge':
    case 'bar':
      return convertBar(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'table':
    case 'simpletable':
      return convertTable(symbol, geo, dataSourceUid, existingIds);

    case 'statictext':
    case 'label':
    case 'text':
      return convertText(symbol, geo, existingIds);

    case 'rectangle':
    case 'ellipse':
    case 'line':
    case 'arc':
    case 'triangle':
    case 'pentagon':
    case 'shape':
      return convertShape(symbol, geo, dataSourceUid, existingIds);

    case 'graphic':
      return convertGraphic(symbol, geo, dataSourceUid, existingIds);

    case 'image':
      return convertAttachedImage(symbol, geo, existingIds);

    case 'group':
      // O PI Vision ja inclui os filhos do grupo em Symbols. O grupo e apenas
      // metadado de selecao e nao deve produzir uma segunda forma no canvas.
      return undefined;

    default:
      // Simbolo desconhecido: representa como Rectangle com label
      return convertUnknownAsRectangle(symbol, geo, type, existingIds);
  }
}

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

function convertValue(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const valueGeo = hasExplicitWidth(symbol)
    ? geo
    : { ...geo, width: estimateCompactValueWidth(cfg) };
  const binding = firstBinding(symbol, dataSourceUid);
  const calculation = firstCalculation(symbol, calculationsByName);
  if (!binding && !calculation) {
    return undefined;
  }

  const color = normalizeColor(cfg.ForeColor ?? cfg.ValueStroke ?? cfg.Stroke) ?? '#131313';
  const backgroundColor = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill) ?? DEFAULT_VALUE_VISUAL_OPTIONS.backgroundColor;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? DEFAULT_VALUE_VISUAL_OPTIONS.fontSize;
  const textAlign = normalizeTextAlign(cfg.TextAlignment);

  const properties: ValueProperties = {
    ...(binding ? { binding } : {}),
    ...(calculation ? { calculationId: calculation.id } : {}),
    visual: {
      ...DEFAULT_VALUE_VISUAL_OPTIONS,
      color,
      backgroundColor,
      fontSize,
      textAlign,
      showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTagName,
      showUnit: cfg.ShowUnit ?? cfg.ShowUOM ?? DEFAULT_VALUE_VISUAL_OPTIONS.showUnit,
      showTimestamp: cfg.ShowTimestamp ?? cfg.ShowTime ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTimestamp,
      showValue: cfg.ShowValue ?? DEFAULT_VALUE_VISUAL_OPTIONS.showValue,
      decimals: normalizeDecimals(cfg.Decimals) ?? decimalsFromFormat(cfg.FormatType),
      labelMode: cfg.NameType === 'C' && typeof cfg.CustomName === 'string' ? 'custom' : 'tag',
      customLabel: typeof cfg.CustomName === 'string' ? cfg.CustomName : '',
    },
    _piVisionPreserveFontSize: true,
    _piVisionSquareBackground: true,
    ...convertMultistateIfPresent(symbol.Multistate),
  };

  return makeElement(VALUE_TYPE, valueGeo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

function convertTrend(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const rawTraces: Array<PiVisionTrace | PiVisionDataItem> = [
    ...(Array.isArray(cfg.Traces) ? cfg.Traces : []),
    ...(Array.isArray(cfg.DataItems) ? cfg.DataItems : []),
    ...(Array.isArray(cfg.TraceSettings) ? cfg.TraceSettings : []),
  ];

  // Se nao ha traces, tenta extrair da lista generica de DataSources
  const paths = getDataSourcePaths(symbol);
  const tracePaths = rawTraces
    .map((t) => t.Path ?? t.DataSource ?? '')
    .filter(Boolean);
  const allPaths = tracePaths.length > 0 ? tracePaths : paths;

  if (allPaths.length === 0) {
    return undefined;
  }

  const series: TrendSeries[] = [];
  for (let i = 0; i < allPaths.length; i++) {
    const calculation = resolveCalculationReference(allPaths[i], calculationsByName);
    const binding = calculation
      ? createCalculationTrendBinding(calculation.id)
      : parseDataSourcePath(allPaths[i], dataSourceUid);
    if (!binding) {
      continue;
    }
    const traceInfo = rawTraces[i];
    const rawColor = traceInfo?.Color;
    const color = normalizeColor(rawColor) ?? TREND_SERIES_COLORS[i % TREND_SERIES_COLORS.length];
    const legendLabel = traceInfo?.Label ?? traceInfo?.LegendLabel ?? traceInfo?.CustomName ?? calculation?.name ?? undefined;
    const scaleMin = typeof traceInfo?.MinValue === 'number' ? traceInfo.MinValue : undefined;
    const scaleMax = typeof traceInfo?.MaxValue === 'number' ? traceInfo.MaxValue : undefined;
    series.push({
      binding,
      ...(calculation ? { calculationId: calculation.id } : {}),
      color,
      ...(legendLabel ? { legendLabel } : {}),
      ...(scaleMin !== undefined ? { scaleMin } : {}),
      ...(scaleMax !== undefined ? { scaleMax } : {}),
    });
  }

  if (series.length === 0) {
    return undefined;
  }

  const legendWidth = typeof cfg.TrendConfig?.LegendWidth === 'number' && Number.isFinite(cfg.TrendConfig.LegendWidth)
    ? Math.max(100, Math.round(cfg.TrendConfig.LegendWidth))
    : undefined;
  const fontSize = normalizeFontSize(cfg.FontSize);
  const properties: TrendProperties = {
    series,
    visual: {
      ...(typeof cfg.Title === 'string' ? { title: cfg.Title } : {}),
      ...(typeof cfg.FontName === 'string' && cfg.FontName.trim() ? { fontFamily: cfg.FontName.trim() } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(legendWidth !== undefined ? { legendWidth } : {}),
    },
  };
  return makeElement(TREND_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

function convertGauge(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const binding = firstBinding(symbol, dataSourceUid);
  const calculation = firstCalculation(symbol, calculationsByName);
  if (!binding && !calculation) {
    return undefined;
  }

  const minimum = typeof cfg.ValueScaleSettings?.MinValue === 'number'
    ? cfg.ValueScaleSettings.MinValue
    : typeof cfg.MinValue === 'number' ? cfg.MinValue : 0;
  const maximum = typeof cfg.ValueScaleSettings?.MaxValue === 'number'
    ? cfg.ValueScaleSettings.MaxValue
    : typeof cfg.MaxValue === 'number' ? cfg.MaxValue : 100;
  const color = normalizeColor(cfg.IndicatorColor ?? cfg.ValueColor ?? cfg.ForeColor) ?? '#00a2e8';
  const multistate = convertMultistateIfPresent(symbol.Multistate);

  const properties: GaugeProperties = {
    ...(binding ? { binding } : {}),
    ...(calculation ? { calculationId: calculation.id } : {}),
    minimum,
    maximum,
    showValue: cfg.ShowValue !== false,
    showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? true,
    decimals: normalizeDecimals(cfg.Decimals) ?? decimalsFromFormat(cfg.FormatType),
    gaugeStyle: normalizeGaugeStyle(cfg.IndicatorType),
    scaleMode: 'custom',
    title: '',
    labelPosition: cfg.LabelLocation?.toLowerCase() === 'bottom' ? 'below' : 'above',
    scaleDisplay: cfg.ScaleLabels?.toLowerCase() === 'all' ? 'all' : 'endpoints',
    gaugeAngle: typeof cfg.FaceAngle === 'number' ? cfg.FaceAngle : 270,
    gaugeBorderColor: normalizeColor(cfg.BorderColor) ?? '#ffffff',
    gaugeScaleColor: normalizeColor(cfg.ScaleColor) ?? '#ffffff',
    showUnit: cfg.ShowUnit === true || cfg.ShowUOM === true,
    showTimestamp: cfg.ShowTimestamp === true || cfg.ShowTime === true,
    color,
    ...multistate,
  };

  return makeElement(GAUGE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Bar
// ---------------------------------------------------------------------------

function convertBar(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const binding = firstBinding(symbol, dataSourceUid);
  const calculation = firstCalculation(symbol, calculationsByName);
  if (!binding && !calculation) {
    return undefined;
  }

  const minimum = typeof cfg.ValueScaleSettings?.MinValue === 'number'
    ? cfg.ValueScaleSettings.MinValue
    : typeof cfg.MinValue === 'number' ? cfg.MinValue : 0;
  const maximum = typeof cfg.ValueScaleSettings?.MaxValue === 'number'
    ? cfg.ValueScaleSettings.MaxValue
    : typeof cfg.MaxValue === 'number' ? cfg.MaxValue : 100;
  const symType = (symbol.SymbolType ?? '').toLowerCase();
  const cfgOrientation = (cfg.Orientation ?? '').toLowerCase();
  const orientation = (symType === 'horizontalbar' || symType === 'horizontalgauge' || cfgOrientation === 'horizontal')
    ? 'horizontal'
    : 'vertical';
  const color = normalizeColor(cfg.Fill ?? cfg.ForeColor) ?? '#6e9fff';
  const multistate = convertMultistateIfPresent(symbol.Multistate);
  const isPiVisionCompactGauge = symType === 'verticalgauge' || symType === 'horizontalgauge';

  const properties: BarProperties = {
    ...(binding ? { binding } : {}),
    ...(calculation ? { calculationId: calculation.id } : {}),
    minimum,
    maximum,
    showValue: cfg.ShowValue !== false,
    showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? true,
    showUnit: cfg.ShowUnit === true || cfg.ShowUOM === true,
    decimals: normalizeDecimals(cfg.Decimals) ?? decimalsFromFormat(cfg.FormatType),
    orientation,
    color,
    fillColor: color,
    backgroundColor: normalizeColor(cfg.Background ?? cfg.BackColor) ?? 'transparent',
    borderColor: normalizeColor(cfg.ValueStroke ?? cfg.Stroke) ?? '#ffffff',
    borderWidth: typeof cfg.StrokeWidth === 'number' ? cfg.StrokeWidth : 1,
    tagNameMode: cfg.NameType === 'C' && typeof cfg.CustomName === 'string' ? 'custom' : 'tag',
    customTagName: typeof cfg.CustomName === 'string' ? cfg.CustomName : '',
    ...(isPiVisionCompactGauge ? { _piVisionCompactGauge: true } : {}),
    ...multistate,
  };

  return makeElement(BAR_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function convertTable(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const paths = getDataSourcePaths(symbol);
  const dataItems = Array.isArray(cfg.DataItems) ? cfg.DataItems : [];
  const allPaths = dataItems.map((d) => d.Path ?? d.DataSource ?? '').filter(Boolean);
  const sourcePaths = allPaths.length > 0 ? allPaths : paths;

  const items: TableDataItem[] = sourcePaths
    .map((path) => {
      const binding = parseDataSourcePath(path, dataSourceUid);
      return binding ? { binding } : undefined;
    })
    .filter((item): item is TableDataItem => item !== undefined);

  if (items.length === 0) {
    return undefined;
  }

  const properties: TableProperties = {
    items,
    columns: defaultTableColumns(geo.width),
    decimals: normalizeDecimals(cfg.Decimals),
    style: 'dark',
  };

  return makeElement(TABLE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Text estatico
// ---------------------------------------------------------------------------

function convertText(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  existingIds: Set<string>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const text = cfg.Content ?? cfg.Text ?? cfg.StaticText ?? '';
  const color = normalizeColor(cfg.ForeColor ?? cfg.Stroke) ?? '#131313';
  const backgroundColor = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill) ?? DEFAULT_TEXT_PROPERTIES.backgroundColor;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? DEFAULT_TEXT_PROPERTIES.fontSize;
  const textAlign = normalizeTextAlign(cfg.TextAlignment) as TextAlign;

  const properties: TextProperties = {
    ...DEFAULT_TEXT_PROPERTIES,
    text,
    color,
    backgroundColor: backgroundColor ?? 'transparent',
    fontSize,
    textAlign,
    rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
    ...(typeof cfg.LinkURL === 'string' && cfg.LinkURL.trim() ? { linkUrl: cfg.LinkURL.trim() } : {}),
    ...(typeof cfg.NewTab === 'boolean' ? { openInNewTab: cfg.NewTab } : {}),
  };

  return makeElement(TEXT_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Formas geometricas
// ---------------------------------------------------------------------------

function convertShape(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const symType = (symbol.SymbolType ?? cfg.ShapeType ?? 'rectangle').toLowerCase();
  const shape = normalizeGeometricShape(symType);
  const fill = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill) ?? DEFAULT_RECTANGLE_PROPERTIES.fill;
  const stroke = normalizeColor(cfg.ForeColor ?? cfg.Stroke) ?? DEFAULT_RECTANGLE_PROPERTIES.stroke;
  const thresholdMultistate = convertPiVisionThresholdMultistate(cfg.Multistates);
  const multistateBinding = firstMultistateBinding(symbol, dataSourceUid);
  const multistate = thresholdMultistate
    ? { multistate: thresholdMultistate }
    : convertMultistateIfPresent(symbol.Multistate);

  const properties: RectangleProperties = {
    ...DEFAULT_RECTANGLE_PROPERTIES,
    fill,
    stroke,
    shape,
    rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
    strokeWidth: typeof cfg.StrokeWidth === 'number' ? cfg.StrokeWidth : undefined,
    strokeStyle: cfg.StrokeStyle,
    points: normalizeLinePoints(cfg.Points),
    ...(multistateBinding ? { binding: multistateBinding } : {}),
    ...multistate,
  };

  return makeElement(RECTANGLE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Graficos industriais do PI Vision
// ---------------------------------------------------------------------------

function convertGraphic(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const fileKey = cfg.FileKey?.trim() || 'Graphic';
  const officialSource = sanitizePiVisionSvg(cfg.GraphicSource);
  const src = officialSource
    ? `data:image/svg+xml,${encodeURIComponent(officialSource)}`
    : createPiVisionGraphicDataUrl(fileKey, normalizeColor(cfg.Fill) ?? '#808080');
  const multistate = convertPiVisionThresholdMultistate(cfg.Multistates);
  const binding = firstMultistateBinding(symbol, dataSourceUid);
  if (multistate && binding) {
    const properties: LibrarySymbolProperties = {
      symbolId: `pi-vision:${cfg.DirectoryKey ?? ''}/${fileKey}`,
      name: fileKey,
      src,
      viewBox: extractSvgViewBox(officialSource) ?? '0 0 100 100',
      color: normalizeColor(cfg.Fill) ?? '#808080',
      rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
      binding,
      multistate,
      _piVisionDirectoryKey: cfg.DirectoryKey,
      _piVisionFileKey: fileKey,
    };
    return makeElement(LIBRARY_SYMBOL_TYPE, geo, properties, existingIds);
  }
  const properties: ImageProperties = {
    src,
    alt: fileKey,
    rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
    _piVisionDirectoryKey: cfg.DirectoryKey,
    _piVisionFileKey: fileKey,
  };
  return makeElement(IMAGE_TYPE, geo, properties, existingIds);
}

function extractSvgViewBox(source: string | undefined): string | undefined {
  return source?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
}

function sanitizePiVisionSvg(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const source = value.trim();
  if (!source.startsWith('<svg') || !source.endsWith('</svg>')) {
    return undefined;
  }
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*(?:"(?:https?:|javascript:)[^"]*"|'(?:https?:|javascript:)[^']*')/gi, '');
}

function convertAttachedImage(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  existingIds: Set<string>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  if (typeof cfg.ImageData !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(cfg.ImageData)) {
    return undefined;
  }
  const properties: ImageProperties = {
    src: cfg.ImageData,
    alt: `Imagem PI Vision ${cfg.AttachmentId ?? ''}`.trim(),
    rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
    _piVisionAttachmentId: cfg.AttachmentId,
  };
  return makeElement(IMAGE_TYPE, geo, properties, existingIds);
}

function createPiVisionGraphicDataUrl(fileKey: string, color: string): string {
  const key = fileKey.toLowerCase();
  let body: string;
  if (key.includes('saw blade')) {
    body = '<path d="M50 3 57 15 70 9 72 23 87 22 82 36 96 42 85 52 96 63 81 68 86 83 71 81 68 96 56 89 49 100 41 87 28 94 27 79 12 80 18 65 3 58 15 48 4 37 20 31 15 17 30 19 34 5 45 14Z" fill="url(#metal)" stroke="#555" stroke-width="3"/><circle cx="50" cy="50" r="19" fill="#8c9298" stroke="#444" stroke-width="4"/><circle cx="50" cy="50" r="8" fill="#34383c"/>';
  } else if (key.includes('tank')) {
    body = '<path d="M16 18Q16 4 50 4T84 18V82Q84 96 50 96T16 82Z" fill="url(#metal)" stroke="#5b5b5b" stroke-width="3"/><ellipse cx="50" cy="18" rx="34" ry="14" fill="#d9dde0" stroke="#666" stroke-width="2"/><path d="M27 96v4m46-4v4" stroke="#333" stroke-width="5"/>';
  } else if (key.includes('flame')) {
    body = `<path d="M55 96C18 91 13 57 35 34c-2 18 9 22 14 6 4-13-2-24 8-38 2 20 29 31 27 60-1 17-11 29-29 34Z" fill="${escapeSvgAttribute(color)}" stroke="#333" stroke-width="2"/><path d="M53 88c-15-4-18-18-7-31 0 10 7 9 10 3 7 10 13 23-3 28Z" fill="#ffd43b"/>`;
  } else if (key.includes('opposite arrows')) {
    body = `<path d="M8 38 38 8v18h54v24H38v18Zm84 24L62 92V74H8V50h54V32Z" fill="${escapeSvgAttribute(color)}"/>`;
  } else if (key.includes('arrow')) {
    body = `<path d="M15 80c2-38 20-58 52-60V5l28 28-28 28V45C43 47 31 59 28 83Z" fill="${escapeSvgAttribute(color)}" stroke="#333" stroke-width="2"/>`;
  } else if (key.includes('rectangular pushbutton')) {
    body = `<rect x="4" y="18" width="92" height="64" rx="8" fill="url(#metal)" stroke="#555" stroke-width="4"/><rect x="14" y="27" width="72" height="42" rx="5" fill="${escapeSvgAttribute(color)}" stroke="#777" stroke-width="3"/><path d="M18 32h64" stroke="#fff" stroke-opacity=".7" stroke-width="4"/>`;
  } else {
    const lampColor = key.includes('green') ? '#7fff00' : key.includes('black') ? '#292929' : color;
    body = `<ellipse cx="50" cy="82" rx="34" ry="12" fill="#555"/><circle cx="50" cy="48" r="39" fill="url(#metal)" stroke="#555" stroke-width="4"/><circle cx="50" cy="48" r="27" fill="${escapeSvgAttribute(lampColor)}" stroke="#333" stroke-width="3"/><ellipse cx="42" cy="38" rx="10" ry="7" fill="#fff" opacity=".5"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fafafa"/><stop offset=".45" stop-color="#8c9298"/><stop offset=".7" stop-color="#e7e7e7"/><stop offset="1" stop-color="#666"/></linearGradient></defs>${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeSvgAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (character) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[character] ?? character));
}

// ---------------------------------------------------------------------------
// Simbolo desconhecido → Rectangle com label
// ---------------------------------------------------------------------------

function convertUnknownAsRectangle(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  originalType: string,
  existingIds: Set<string>,
): DisplayElement {
  const properties: RectangleProperties = {
    ...DEFAULT_RECTANGLE_PROPERTIES,
    // Marca o tipo original para rastreabilidade
    _piVisionSymbolType: originalType,
  };
  return makeElement(RECTANGLE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Conversao de Multistate
// ---------------------------------------------------------------------------

/**
 * Converte os triggers de Multistate do PI Vision para MultistateConfig do PIMS Vision.
 * Retorna um objeto parcial pronto para ser espalhado nas properties do elemento.
 */
export function convertMultistate(
  triggers: PiVisionMultistateTrigger[],
): MultistateConfig {
  const rules: MultistateRule[] = triggers
    .map((trigger, index) => convertMultistateTrigger(trigger, index))
    .filter((rule): rule is MultistateRule => rule !== undefined);

  return { enabled: rules.length > 0, rules };
}

function convertMultistateIfPresent(
  multistate?: PiVisionMultistateConfig,
): { multistate?: MultistateConfig } {
  if (!multistate || !Array.isArray(multistate.Triggers) || multistate.Triggers.length === 0) {
    return {};
  }
  const config = convertMultistate(multistate.Triggers);
  return config.rules.length > 0 ? { multistate: config } : {};
}

function convertPiVisionThresholdMultistate(
  source: PiVisionThresholdMultistate[] | undefined,
): MultistateConfig | undefined {
  const definition = Array.isArray(source) ? source[0] : undefined;
  const states = Array.isArray(definition?.States) ? definition?.States ?? [] : [];
  if (states.length === 0) {
    return undefined;
  }

  const colorIndex = Math.max(0, definition?.StateVariables?.findIndex((name) => /color|fill/i.test(name)) ?? 0);
  const converted = states.flatMap((state) => {
    const upperValue = state.UpperValue;
    const color = normalizeMultistateColor(state.StateValues?.[colorIndex]);
    return typeof upperValue === 'number' && Number.isFinite(upperValue) && color
      ? [{ upperValue, color }]
      : [];
  });
  if (converted.length === 0) {
    return undefined;
  }

  const rules: MultistateRule[] = converted.map((state, index) => {
    if (index === converted.length - 1 && index > 0) {
      return {
        id: generateId(),
        operator: 'gte',
        value: converted[index - 1].upperValue,
        color: state.color,
      };
    }
    return { id: generateId(), operator: 'lte', value: state.upperValue, color: state.color };
  });
  return { enabled: true, rules };
}

function normalizeMultistateColor(value: unknown): string | undefined {
  const color = normalizeColor(value);
  if (!color) {
    return undefined;
  }
  if (color === 'transparent') {
    return color;
  }
  const shortHex = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }
  const rgba = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (rgba) {
    if (rgba[4] !== undefined && Number(rgba[4]) === 0) {
      return 'transparent';
    }
    return `#${[rgba[1], rgba[2], rgba[3]]
      .map((component) => Math.max(0, Math.min(255, Math.round(Number(component)))).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  const namedColors: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
    yellow: '#ffff00', orange: '#ffa500', purple: '#800080', lime: '#00ff00', gray: '#808080', grey: '#808080',
  };
  return namedColors[color.toLowerCase()];
}

function convertMultistateTrigger(
  trigger: PiVisionMultistateTrigger,
  index: number,
): MultistateRule | undefined {
  const expression = (trigger.Expression ?? '').trim();
  const color = normalizeColor(trigger.ForeColor) ?? '#d32f2f';

  if (!expression) {
    return undefined;
  }

  const parsed = parseExpression(expression);
  if (!parsed) {
    return undefined;
  }

  return {
    id: generateId(),
    ...parsed,
    color,
  };
}

/**
 * Parseia a expressao de trigger do PI Vision para o formato de operador/valor.
 *
 * Formatos suportados:
 *   "< 10"       → { operator: 'lt', value: 10 }
 *   "<= 10"      → { operator: 'lte', value: 10 }
 *   "> 20"       → { operator: 'gt', value: 20 }
 *   ">= 20"      → { operator: 'gte', value: 20 }
 *   "= 5"        → { operator: 'eq', value: 5 }
 *   "= Shutdown" → { operator: 'eq', value: 'Shutdown' }
 *   "10 to 20"   → { operator: 'between', value: 10, value2: 20 }
 */
function parseExpression(
  expression: string,
): Pick<MultistateRule, 'operator' | 'value' | 'value2'> | undefined {
  const expr = expression.trim();

  // Between: "10 to 20" ou "10-20"
  const betweenMatch = expr.match(/^(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i)
    ?? expr.match(/^(-?[\d.]+)\s*-\s*(-?[\d.]+)$/);
  if (betweenMatch) {
    const v1 = parseFloat(betweenMatch[1]);
    const v2 = parseFloat(betweenMatch[2]);
    if (Number.isFinite(v1) && Number.isFinite(v2)) {
      return { operator: 'between', value: Math.min(v1, v2), value2: Math.max(v1, v2) };
    }
  }

  // Operadores relacionais: <=, >=, <, >, =
  const relationalMatch = expr.match(/^(<=|>=|<|>|=)\s*(.+)$/);
  if (relationalMatch) {
    const opStr = relationalMatch[1];
    const rawValue = relationalMatch[2].trim();
    const operator = opStringToOperator(opStr);
    if (!operator) {
      return undefined;
    }
    const numValue = parseFloat(rawValue);
    const value: number | string = Number.isFinite(numValue) ? numValue : rawValue;
    return { operator, value };
  }

  return undefined;
}

function opStringToOperator(op: string): MultistateOperator | undefined {
  switch (op) {
    case '<': return 'lt';
    case '<=': return 'lte';
    case '>': return 'gt';
    case '>=': return 'gte';
    case '=': return 'eq';
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Conversao de DataSource Path
// ---------------------------------------------------------------------------

/**
 * Converte um path de datasource do PI Vision para um PiPointBinding.
 *
 * Formatos suportados:
 *   pi:\\SERVER\TAGNAME
 *   \\SERVER\TAGNAME
 *   SERVER\TAGNAME
 *   af:\\SERVER\DB\Element|Attribute  (pointName = tudo apos o servidor)
 */
export function parseDataSourcePath(
  path: string,
  dataSourceUid: string,
): PiPointBinding | undefined {
  if (!path || !dataSourceUid) {
    return undefined;
  }

  let normalized = path.trim();

  // Remove prefixo de protocolo: "pi:\\" ou "af:\\"
  normalized = normalized.replace(/^[a-z]+:\\+/i, '');
  // Remove barras iniciais extras
  normalized = normalized.replace(/^\\+/, '');

  if (!normalized) {
    return undefined;
  }

  // Divide no primeiro separador de caminho
  const firstSep = normalized.indexOf('\\');
  if (firstSep < 1) {
    return undefined;
  }

  const serverPath = removePiVisionResourceId(normalized.slice(0, firstSep));
  const remainder = normalized.slice(firstSep + 1);

  if (!remainder) {
    return undefined;
  }

  // Para paths AF com subestrutura (DB\Element|Attribute), o "pointName"
  // e a ultima parte apos o ultimo separador ou pipe
  const lastSep = Math.max(remainder.lastIndexOf('\\'), remainder.lastIndexOf('|'));
  const rawPointName = lastSep >= 0 ? remainder.slice(lastSep + 1) : remainder;
  const pointName = removePiVisionResourceId(rawPointName);

  if (!serverPath || !pointName) {
    return undefined;
  }

  return { dataSourceUid, serverPath, pointName };
}

// ---------------------------------------------------------------------------
// Utilitarios internos
// ---------------------------------------------------------------------------

interface ElementGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

function extractGeometry(symbol: PiVisionSymbol): ElementGeometry {
  const cfg = symbol.Configuration ?? {};
  const left = typeof symbol.Left === 'number' ? symbol.Left : cfg.Left;
  const top = typeof symbol.Top === 'number' ? symbol.Top : cfg.Top;
  const configuredWidth = typeof symbol.Width === 'number' ? symbol.Width : cfg.Width;
  const right = cfg.Right;
  const derivedWidth = typeof right === 'number' && typeof left === 'number' ? right - left : undefined;
  const centeredWidth = typeof cfg.Center === 'number' && typeof left === 'number'
    ? (cfg.Center - left) * 2
    : undefined;
  const width = typeof configuredWidth === 'number' && configuredWidth > 0
    ? configuredWidth
    : typeof derivedWidth === 'number' && derivedWidth > 0 ? derivedWidth : centeredWidth;
  const configuredHeight = typeof symbol.Height === 'number' ? symbol.Height : cfg.Height;

  return {
    x: typeof left === 'number' ? Math.max(0, left) : 0,
    y: typeof top === 'number' ? Math.max(0, top) : 0,
    width: typeof width === 'number' && width > 0 ? width : 200,
    height: typeof configuredHeight === 'number' && configuredHeight > 0 ? configuredHeight : 100,
  };
}

function hasExplicitWidth(symbol: PiVisionSymbol): boolean {
  const cfg = symbol.Configuration ?? {};
  return (typeof symbol.Width === 'number' && symbol.Width > 0)
    || (typeof cfg.Width === 'number' && cfg.Width > 0)
    || (typeof cfg.Right === 'number' && typeof cfg.Left === 'number' && cfg.Right > cfg.Left)
    || (typeof cfg.Center === 'number' && typeof cfg.Left === 'number' && cfg.Center > cfg.Left);
}

function estimateCompactValueWidth(cfg: PiVisionSymbolConfiguration): number {
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? 14;
  // Valores antigos do PI Vision podem omitir Width. Esses campos exibem apenas
  // o dado atual. Algarismos em fontes industriais sao estreitos; quatro
  // larguras de fonte mais a margem reproduzem o painel compacto original.
  return Math.max(48, Math.min(76, Math.round(fontSize * 4.8)));
}

function getDisplayBounds(symbols: PiVisionSymbol[]): { width: number; height: number } | undefined {
  if (symbols.length === 0) {
    return undefined;
  }
  const geometries = symbols.map(extractGeometry);
  return {
    width: Math.max(1, Math.ceil(Math.max(...geometries.map((geo) => geo.x + geo.width)))),
    height: Math.max(1, Math.ceil(Math.max(...geometries.map((geo) => geo.y + geo.height)))),
  };
}

function normalizeImportedTrendLayout(elements: DisplayElement[]): DisplayElement[] {
  const trends = elements.filter((element) => element.type === TREND_TYPE);
  return elements.map((element) => {
    if (element.type !== TREND_TYPE) {
      return element;
    }

    const nextInRow = trends
      .filter((candidate) => {
        if (candidate.id === element.id || candidate.x <= element.x) {
          return false;
        }
        const verticalIntersection = Math.max(
          0,
          Math.min(element.y + element.height, candidate.y + candidate.height) - Math.max(element.y, candidate.y),
        );
        return verticalIntersection / Math.min(element.height, candidate.height) >= 0.75;
      })
      .sort((left, right) => left.x - right.x)[0];

    if (!nextInRow || element.x + element.width <= nextInRow.x) {
      return element;
    }

    const availableWidth = nextInRow.x - element.x - 8;
    if (availableWidth < 240) {
      return element;
    }
    return { ...element, width: availableWidth };
  });
}

function makeElement<TType extends string, TProps>(
  type: TType,
  geo: ElementGeometry,
  properties: TProps,
  existingIds: Set<string>,
): DisplayElement<TType, TProps> {
  let id = generateId();
  while (existingIds.has(id)) {
    id = generateId();
  }
  return { id, type, x: geo.x, y: geo.y, width: geo.width, height: geo.height, properties };
}

function firstBinding(
  symbol: PiVisionSymbol,
  dataSourceUid: string,
): PiPointBinding | undefined {
  const cfg = symbol.Configuration ?? {};
  const paths = getDataSourcePaths(symbol);
  if (paths.length === 0 && Array.isArray(cfg.DataItems) && cfg.DataItems.length > 0) {
    const first = cfg.DataItems[0];
    return parseDataSourcePath(first.Path ?? first.DataSource ?? '', dataSourceUid);
  }
  return paths.length > 0 ? parseDataSourcePath(paths[0], dataSourceUid) : undefined;
}

function firstMultistateBinding(
  symbol: PiVisionSymbol,
  dataSourceUid: string,
): PiPointBinding | undefined {
  const path = Array.isArray(symbol.MSDataSources) ? symbol.MSDataSources[0] : undefined;
  return typeof path === 'string' ? parseDataSourcePath(path, dataSourceUid) : undefined;
}

function getDataSourcePaths(symbol: PiVisionSymbol): string[] {
  if (Array.isArray(symbol.DataSources) && symbol.DataSources.length > 0) {
    return symbol.DataSources;
  }
  const configuredDataSources = symbol.Configuration?.DataSources;
  return Array.isArray(configuredDataSources) ? configuredDataSources : [];
}

function removePiVisionResourceId(pathPart: string): string {
  const resourceIdIndex = pathPart.indexOf('?');
  return (resourceIdIndex >= 0 ? pathPart.slice(0, resourceIdIndex) : pathPart).trim();
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value === 'number') {
    const bgr = value & 0xFFFFFF;
    const b = (bgr >> 16) & 0xFF;
    const g = (bgr >> 8) & 0xFF;
    const r = bgr & 0xFF;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'transparent' || trimmed.toLowerCase() === 'none') {
    return 'transparent';
  }
  // Aceita hex com ou sem #
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }
  if (/^rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^(?:black|white|gray|grey|red|green|blue|yellow|orange|purple|lime|navy|maroon|silver)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return undefined;
}

function decimalsFromFormat(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^[NnFf](\d+)$/);
  return match ? normalizeDecimals(Number(match[1])) : null;
}

function normalizeGaugeStyle(value: unknown): GaugeProperties['gaugeStyle'] {
  if (typeof value !== 'string') {
    return 'pointer';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'triangle') {
    return 'triangle';
  }
  if (normalized === 'line') {
    return 'line';
  }
  return normalized === 'arc' ? 'arc' : 'pointer';
}

function normalizeLinePoints(value: PiVisionSymbolConfiguration['Points']): Array<{ x: number; y: number }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const points = value.flatMap((point) => typeof point.X === 'number' && typeof point.Y === 'number'
    ? [{ x: point.X, y: point.Y }]
    : []);
  return points.length >= 2 ? points : undefined;
}

function normalizeFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(8, Math.min(96, value));
}

function normalizeDecimals(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
    return null;
  }
  return value;
}

function normalizeTextAlign(value: unknown): ValueTextAlign {
  if (typeof value !== 'string') {
    return 'center';
  }
  const lower = value.trim().toLowerCase();
  if (lower === 'left') {
    return 'left';
  }
  if (lower === 'right') {
    return 'right';
  }
  return 'center';
}

function normalizeGeometricShape(type: string): GeometricShape {
  switch (type) {
    case 'ellipse':
    case 'oval':
    case 'circle':
      return 'ellipse';
    case 'line':
      return 'line';
    case 'arc':
      return 'arc';
    case 'triangle':
      return 'triangle';
    case 'pentagon':
      return 'pentagon';
    default:
      return 'rectangle';
  }
}
