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
  type TableColumnConfig,
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
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl } from '../library';

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
  Background?: string;
  BackgroundColor?: string;
  Fill?: string;
  Stroke?: string;
  ValueStroke?: string;
  TextSize?: number;
  FontSize?: number;
  FontName?: string;
  FormatType?: string;
  Columns?: string[];
  [key: string]: unknown;
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
    Blink?: boolean | number | string;
    IsBlinking?: boolean | number | string;
    Blinking?: boolean | number | string;
    Flash?: boolean | number | string;
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
  States?: Array<Record<string, unknown>>;
  Thresholds?: Array<Record<string, unknown>>;
  Blink?: unknown[];
  Blinking?: unknown[];
  BlinkState?: unknown[];
  IsBlinking?: unknown[];
  Flash?: unknown[];
  [key: string]: unknown;
}

export interface PiVisionMultistateTrigger {
  Expression?: string;
  ForeColor?: string;
  BackColor?: string;
  Blink?: boolean | number | string;
  IsBlinking?: boolean | number | string;
  Blinking?: boolean | number | string;
  Flash?: boolean | number | string;
  BlinkState?: boolean | number | string;
  [key: string]: unknown;
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
    : (bounds?.width ?? 1920);
  const height = typeof display.Height === 'number' && display.Height > 0
    ? display.Height
    : (bounds?.height ?? 1080);
  const rawBg = normalizeColor(display.BackgroundColor ?? display.DisplayProperties?.BackgroundColor);
  const backgroundColor = (rawBg && rawBg.toLowerCase() !== '#ffffff' && rawBg.toLowerCase() !== '#fff') ? rawBg : '#1f1f1f';

  const existingIds = new Set<string>();
  const elements: DisplayElement[] = [];

  for (const symbol of symbols) {
    const element = convertSymbol(symbol, uid, existingIds, calculationsByName);
    if (element !== undefined) {
      existingIds.add(element.id);
      elements.push(element);
    }
  }
  const normalizedElements = normalizeImportedButtonLayout(normalizeImportedTrendLayout(elements));
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
    case 'assettable':
    case 'eventtable':
      return convertTable(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'statictext':
    case 'label':
    case 'text':
      return convertText(symbol, geo, dataSourceUid, existingIds, calculationsByName);
    case 'rectangle':
    case 'circle':
    case 'ellipse':
    case 'line':
    case 'polygon':
    case 'polyline':
    case 'path':
    case 'shape':
      return convertShape(symbol, geo, dataSourceUid, existingIds, calculationsByName);

    case 'graphic':
      return convertGraphic(symbol, geo, dataSourceUid, existingIds, calculationsByName);

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
  const calculation = firstCalculation(symbol, calculationsByName);
  const binding = calculation ? undefined : firstBinding(symbol, dataSourceUid);
  if (!binding && !calculation) {
    return undefined;
  }

  const color = normalizeColor(cfg.ForeColor ?? cfg.ValueStroke ?? cfg.Stroke) ?? DEFAULT_VALUE_VISUAL_OPTIONS.color;
  const rawBg = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill);
  const isDefaultWhiteOrTransparent = !rawBg || rawBg.toLowerCase() === '#ffffff' || rawBg.toLowerCase() === '#fff' || rawBg === 'transparent' || cfg.Transparent === true;
  const backgroundColor = isDefaultWhiteOrTransparent ? 'transparent' : rawBg;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize);
  const textAlign = normalizeTextAlign(cfg.TextAlignment);
  const thresholdMultistate = convertPiVisionThresholdMultistate(cfg.Multistates);
  const multistate = thresholdMultistate
    ? { multistate: thresholdMultistate }
    : convertMultistateIfPresent(symbol.Multistate ?? (cfg.Multistate as PiVisionMultistateConfig), cfg);

  const properties: ValueProperties = {
    ...(binding ? { binding } : {}),
    ...(calculation ? { calculationId: calculation.id } : {}),
    visual: {
      ...DEFAULT_VALUE_VISUAL_OPTIONS,
      color,
      backgroundColor,
      fontSize: fontSize ?? DEFAULT_VALUE_VISUAL_OPTIONS.fontSize,
      textAlign,
      showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTagName,
      showUnit: cfg.ShowUnit ?? cfg.ShowUOM ?? DEFAULT_VALUE_VISUAL_OPTIONS.showUnit,
      showTimestamp: cfg.ShowTimestamp ?? cfg.ShowTime ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTimestamp,
      showValue: cfg.ShowValue ?? DEFAULT_VALUE_VISUAL_OPTIONS.showValue,
      decimals: normalizeDecimals(cfg.Decimals) ?? decimalsFromFormat(cfg.FormatType),
      labelMode: cfg.NameType === 'C' && typeof cfg.CustomName === 'string' ? 'custom' : 'tag',
      customLabel: typeof cfg.CustomName === 'string' ? cfg.CustomName : '',
    },
    _piVisionPreserveFontSize: fontSize !== undefined,
    _piVisionSquareBackground: true,
    ...multistate,
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
    .map((t) => t?.Path ?? t?.DataSource ?? '')
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
  const multistate = convertMultistateIfPresent(symbol.Multistate ?? (cfg.Multistate as PiVisionMultistateConfig), cfg);

  const gaugeBorderColorRaw = normalizeColor(cfg.BorderColor ?? cfg.Stroke ?? cfg.ForeColor) ?? '#ffffff';
  const gaugeScaleColorRaw = normalizeColor(cfg.ScaleColor ?? cfg.ForeColor ?? cfg.Stroke) ?? '#ffffff';
  const gaugeBorderColor = (gaugeBorderColorRaw.toLowerCase() === '#ffffff' || gaugeBorderColorRaw.toLowerCase() === '#fff') ? '#fefefe' : gaugeBorderColorRaw;
  const gaugeScaleColor = (gaugeScaleColorRaw.toLowerCase() === '#ffffff' || gaugeScaleColorRaw.toLowerCase() === '#fff') ? '#fefefe' : gaugeScaleColorRaw;

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
    showScale: cfg.ShowScale !== false,
    gaugeAngle: typeof cfg.FaceAngle === 'number' ? cfg.FaceAngle : 270,
    // PI Vision usa ForeColor como cor geral quando não há uma cor específica
    // para a moldura ou para a escala. Preservar esses fallbacks evita que o
    // Gauge convertido fique branco independentemente do símbolo original.
    gaugeBorderColor,
    gaugeScaleColor,
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
  const multistate = convertMultistateIfPresent(symbol.Multistate ?? (cfg.Multistate as PiVisionMultistateConfig), cfg);
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
    ...(typeof cfg.BarStart === 'number' ? { barStartMode: 'custom', barStartValue: cfg.BarStart } : typeof cfg.Start === 'number' ? { barStartMode: 'custom', barStartValue: cfg.Start } : {}),
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
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const paths = getDataSourcePaths(symbol);
  const dataItems = Array.isArray(cfg.DataItems) ? cfg.DataItems : [];
  const allPaths = dataItems.map((d) => d?.Path ?? d?.DataSource ?? '').filter(Boolean);
  const sourcePaths = allPaths.length > 0 ? allPaths : paths;

  const items: TableDataItem[] = sourcePaths
    .map((path): TableDataItem | undefined => {
      const calculation = resolveCalculationReference(path, calculationsByName);
      if (calculation) {
        return {
          binding: calculation.inputs[0]?.binding ?? {
            dataSourceUid,
            serverPath: 'calc',
            pointName: calculation.name,
          },
          path,
          customName: calculation.name,
          nameMode: 'custom' as const,
        };
      }
      if (path.trim().toLowerCase().startsWith('calc:')) {
        const calcName = path.trim().replace(/^calc:/i, '').replace(/\.value$/i, '').trim();
        return {
          binding: {
            dataSourceUid,
            serverPath: 'calc',
            pointName: calcName,
          },
          path,
          customName: calcName,
          nameMode: 'custom' as const,
        };
      }
      const binding = parseDataSourcePath(path, dataSourceUid);
      return binding ? { binding, path } : undefined;
    })
    .filter((item): item is TableDataItem => item !== undefined);

  if (items.length === 0) {
    return undefined;
  }

  const properties: TableProperties = {
    items,
    columns: convertTableColumns(cfg.Columns, defaultTableColumns(geo.width), geo.width),
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
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const text = decodePiVisionText(cfg.Content ?? cfg.Text ?? cfg.StaticText ?? '');
  const rawColor = normalizeColor(cfg.ForeColor ?? cfg.Stroke);
  const rawBg = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill);
  const isDefaultWhiteOrTransparent = !rawBg || rawBg.toLowerCase() === '#ffffff' || rawBg.toLowerCase() === '#fff' || rawBg === 'transparent' || cfg.Transparent === true;
  const backgroundColor = isDefaultWhiteOrTransparent ? 'transparent' : rawBg;
  const color = rawColor ?? DEFAULT_TEXT_PROPERTIES.color;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? DEFAULT_TEXT_PROPERTIES.fontSize;
  const textAlign = normalizeTextAlign(cfg.TextAlignment) as TextAlign;

  const multistate = convertMultistateIfPresent(symbol.Multistate ?? (cfg.Multistate as PiVisionMultistateConfig), cfg);
  const binding = firstMultistateBinding(symbol, dataSourceUid);
  const calculation = firstMultistateCalculation(symbol, calculationsByName);

  const properties: TextProperties = {
    ...DEFAULT_TEXT_PROPERTIES,
    text,
    color,
    backgroundColor,
    fontSize,
    textAlign,
    rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
    ...(typeof cfg.LinkURL === 'string' && cfg.LinkURL.trim() ? { linkUrl: cfg.LinkURL.trim() } : {}),
    ...(typeof cfg.NewTab === 'boolean' ? { openInNewTab: cfg.NewTab } : {}),
    ...(multistate.multistate || multistate.backgroundMultistate
      ? { ...multistate, ...(binding ? { binding } : {}), ...(calculation ? { calculationId: calculation.id } : {}) }
      : {}),
  };

  const textGeo = { ...geo };
  const textLines = text.split('\n');
  const longestLine = Math.max(1, ...textLines.map((l) => l.length));
  const lineCount = Math.max(1, textLines.length);
  const minWidth = Math.ceil(longestLine * fontSize * 0.65 + 16);
  const minHeight = Math.ceil(lineCount * fontSize * 1.3);
  if (textGeo.width < minWidth) {
    textGeo.width = minWidth;
  }
  if (textGeo.height < minHeight) {
    textGeo.height = minHeight;
  }

  return makeElement(TEXT_TYPE, textGeo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Formas geometricas
// ---------------------------------------------------------------------------

function convertShape(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const symType = (symbol.SymbolType ?? cfg.ShapeType ?? 'rectangle').toLowerCase();
  const shape = normalizeGeometricShape(symType);
  const fill = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor ?? cfg.Fill) ?? DEFAULT_RECTANGLE_PROPERTIES.fill;
  const stroke = normalizeColor(cfg.ForeColor ?? cfg.Stroke) ?? DEFAULT_RECTANGLE_PROPERTIES.stroke;
  const thresholdMultistate = convertPiVisionThresholdMultistate(cfg.Multistates);
  const multistateBinding = firstMultistateBinding(symbol, dataSourceUid);
  const calculation = firstMultistateCalculation(symbol, calculationsByName);
  const multistate = thresholdMultistate
    ? { multistate: thresholdMultistate }
    : convertMultistateIfPresent(symbol.Multistate ?? (cfg.Multistate as PiVisionMultistateConfig), cfg);

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
    ...(calculation ? { calculationId: calculation.id } : {}),
    ...multistate,
  };

  return makeElement(RECTANGLE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Graficos industriais do PI Vision - De-Para de Símbolos
// ---------------------------------------------------------------------------

export function mapPiVisionGraphicToLocalSymbol(
  directoryKey: string | undefined,
  fileKey: string,
): { id: string; name: string } | undefined {
  const searchKey = `${directoryKey ?? ''}/${fileKey}`.toLowerCase();

  // De-para de Motores e Conjuntos PI Vision -> Plugin Grafana:
  // PI Vision 1 -> Motor 01 (pims-vision:motores:01)
  // PI Vision 2 -> Motor 02 (pims-vision:motores:02)
  // PI Vision 3 -> Motor 03 (pims-vision:motores:03)
  // PI Vision 4 -> Motor 04 (pims-vision:motores:04)
  // PI Vision 5 -> Bomba 01 (pims-vision:bombas:01 - Conjunto Motor-Bomba Centrífuga)
  // PI Vision 6 -> Bomba 02 (pims-vision:bombas:02 - Conjunto Motor-Bomba Deslocamento/Inline)
  if (searchKey.includes('motor') || searchKey.includes('motores')) {
    if (searchKey.match(/motor[\s_-]*(0?3|3\b)/)) {
      return { id: 'pims-vision:motores:03', name: 'Motor 03' };
    }
    if (searchKey.match(/motor[\s_-]*(0?4|4\b)/)) {
      return { id: 'pims-vision:motores:04', name: 'Motor 04' };
    }
    if (searchKey.match(/motor[\s_-]*(0?5|5\b)/)) {
      return { id: 'pims-vision:bombas:01', name: 'Bomba 01' };
    }
    if (searchKey.match(/motor[\s_-]*(0?6|6\b)/)) {
      return { id: 'pims-vision:bombas:02', name: 'Bomba 02' };
    }
    if (searchKey.match(/motor[\s_-]*(0?2|2\b)/) || searchKey.includes('compact') || searchKey.includes('vertical')) {
      return { id: 'pims-vision:motores:02', name: 'Motor 02' };
    }
    return { id: 'pims-vision:motores:01', name: 'Motor 01' };
  }

  if (searchKey.includes('pump') || searchKey.includes('bomba')) {
    if (searchKey.match(/(?:pump|bomba)[\s_-]*(0?2|2\b)/)) {
      return { id: 'pims-vision:bombas:02', name: 'Bomba 02' };
    }
    return { id: 'pims-vision:bombas:01', name: 'Bomba 01' };
  }

  return undefined;
}

function convertGraphic(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const fileKey = cfg.FileKey?.trim() || 'Graphic';
  const officialSource = sanitizePiVisionSvg(cfg.GraphicSource);
  const src = officialSource
    ? `data:image/svg+xml,${encodeURIComponent(officialSource)}`
    : createPiVisionGraphicDataUrl(fileKey, normalizeColor(cfg.Fill) ?? '#808080');
  const multistate = convertPiVisionThresholdMultistate(cfg.Multistates);
  const binding = firstMultistateBinding(symbol, dataSourceUid);
  const calculation = firstMultistateCalculation(symbol, calculationsByName);
  
  const mappedSymbol = mapPiVisionGraphicToLocalSymbol(cfg.DirectoryKey, fileKey);
  const localSymbolId = mappedSymbol?.id;
  const localName = mappedSymbol?.name;

  const flipH = cfg.Flip === 'H' || cfg.Flip === 'Horizontal' || cfg.Flip === 'Both' || cfg.FlipH === true;
  const flipV = cfg.Flip === 'V' || cfg.Flip === 'Vertical' || cfg.Flip === 'Both' || cfg.FlipV === true;

  if (localSymbolId || (multistate && (binding || calculation))) {
    const symbolDefinition = localSymbolId ? findIndustrialSymbol(localSymbolId) : undefined;
    const finalSrc = symbolDefinition ? getIndustrialSymbolAssetUrl(symbolDefinition) : src;
    const properties: LibrarySymbolProperties = {
      symbolId: localSymbolId ?? `pi-vision:${cfg.DirectoryKey ?? ''}/${fileKey}`,
      name: localName ?? fileKey,
      src: finalSrc,
      viewBox: extractSvgViewBox(officialSource) ?? '0 0 100 100',
      color: normalizeColor(cfg.Fill) ?? '#808080',
      rotation: typeof cfg.Rotation === 'number' ? cfg.Rotation : 0,
      ...(flipH ? { flipHorizontal: true } : {}),
      ...(flipV ? { flipVertical: true } : {}),
      ...(binding ? { binding } : {}),
      ...(calculation ? { calculationId: calculation.id } : {}),
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

function createPiVisionGraphicDataUrl(fileKey: string, _color: string): string {
  const key = fileKey.toLowerCase();
  let body: string;
  if (key.includes('flowcharting 5') || key.includes('terminator') || key.includes('pill') || key.includes('rounded')) {
    body = '<rect x="2" y="2" width="96" height="96" rx="28" ry="28" fill="#ffffff" stroke="#ffffff" stroke-width="2"/>';
  } else if (key.includes('flowcharting 4') || key.includes('decision') || key.includes('diamond')) {
    body = '<polygon points="50,2 98,50 50,98 2,50" fill="#ffffff"/>';
  } else if (key.includes('flowcharting 6') || key.includes('hexagon')) {
    body = '<polygon points="22,2 78,2 98,50 78,98 22,98 2,50" fill="#ffffff"/>';
  } else if (key.includes('flowcharting 1') || key.includes('process') || key.includes('box') || key.includes('rectangle')) {
    body = '<rect x="2" y="2" width="96" height="96" rx="4" ry="4" fill="#ffffff" stroke="#ffffff" stroke-width="2"/>';
  } else if (key.includes('flowchart')) {
    body = '<rect x="2" y="2" width="96" height="96" rx="20" ry="20" fill="#ffffff" stroke="#ffffff" stroke-width="2"/>';
  } else if (key.includes('saw blade')) {
    body = '<path d="M50 3 57 15 70 9 72 23 87 22 82 36 96 42 85 52 96 63 81 68 86 83 71 81 68 96 56 89 49 100 41 87 28 94 27 79 12 80 18 65 3 58 15 48 4 37 20 31 15 17 30 19 34 5 45 14Z" fill="#ffffff"/>';
  } else if (key.includes('tank') || key.includes('vessel')) {
    body = '<rect x="10" y="10" width="80" height="80" rx="20" ry="20" fill="#ffffff"/>';
  } else if (key.includes('flame')) {
    body = '<path d="M55 96C18 91 13 57 35 34c-2 18 9 22 14 6 4-13-2-24 8-38 2 20 29 31 27 60-1 17-11 29-29 34Z" fill="#ffffff"/>';
  } else if (key.includes('opposite arrows')) {
    body = '<path d="M8 38 38 8v18h54v24H38v18Zm84 24L62 92V74H8V50h54V32Z" fill="#ffffff"/>';
  } else if (key.includes('arrow')) {
    body = '<path d="M15 80c2-38 20-58 52-60V5l28 28-28 28V45C43 47 31 59 28 83Z" fill="#ffffff"/>';
  } else if (key.includes('pushbutton') || key.includes('button')) {
    body = '<rect x="4" y="10" width="92" height="80" rx="12" ry="12" fill="#ffffff"/>';
  } else if (key.includes('circle') || key.includes('lamp') || key.includes('led') || key.includes('indicator')) {
    body = '<circle cx="50" cy="50" r="46" fill="#ffffff"/>';
  } else {
    body = '<rect x="2" y="2" width="96" height="96" rx="16" ry="16" fill="#ffffff"/>';
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
  multistateInput: PiVisionMultistateConfig | PiVisionMultistateTrigger[],
  cfg?: PiVisionSymbolConfiguration,
): MultistateConfig {
  const triggers: PiVisionMultistateTrigger[] = Array.isArray(multistateInput)
    ? multistateInput
    : Array.isArray(multistateInput?.Triggers)
      ? multistateInput.Triggers
      : [];

  const multistate = Array.isArray(multistateInput) ? undefined : multistateInput;

  const parentBlinks = (Array.isArray(multistate?.Blink) ? multistate?.Blink : undefined)
    ?? (Array.isArray(multistate?.Blinking) ? multistate?.Blinking : undefined)
    ?? (Array.isArray(multistate?.BlinkState) ? multistate?.BlinkState : undefined)
    ?? (Array.isArray(multistate?.IsBlinking) ? multistate?.IsBlinking : undefined)
    ?? (Array.isArray(multistate?.Flash) ? multistate?.Flash : undefined)
    ?? (Array.isArray(cfg?.Blink) ? cfg?.Blink : undefined)
    ?? (Array.isArray(cfg?.Blinking) ? cfg?.Blinking : undefined)
    ?? (Array.isArray(cfg?.BlinkState) ? cfg?.BlinkState : undefined);

  const parentStates = (Array.isArray(multistate?.States) ? multistate?.States : undefined)
    ?? (Array.isArray(multistate?.Thresholds) ? multistate?.Thresholds : undefined);

  const rules: MultistateRule[] = triggers
    .map((trigger, index) => {
      const stateObj = parentStates?.[index];
      const parentBlinkVal = parentBlinks?.[index];
      return convertMultistateTrigger(trigger, index, stateObj, parentBlinkVal);
    })
    .filter((rule): rule is MultistateRule => rule !== undefined);

  return { enabled: rules.length > 0, rules };
}

function convertMultistateIfPresent(
  multistate?: PiVisionMultistateConfig,
  cfg?: PiVisionSymbolConfiguration,
): { multistate?: MultistateConfig; backgroundMultistate?: MultistateConfig } {
  if (!multistate || !Array.isArray(multistate.Triggers) || multistate.Triggers.length === 0) {
    return {};
  }
  const config = convertMultistate(multistate, cfg);

  const hasBackgroundTriggers = multistate.Triggers.some((t) => typeof t.BackColor === 'string' && t.BackColor.trim() !== '');
  if (hasBackgroundTriggers) {
    const parentBlinks = (Array.isArray(multistate?.Blink) ? multistate?.Blink : undefined)
      ?? (Array.isArray(multistate?.Blinking) ? multistate?.Blinking : undefined)
      ?? (Array.isArray(multistate?.BlinkState) ? multistate?.BlinkState : undefined)
      ?? (Array.isArray(multistate?.IsBlinking) ? multistate?.IsBlinking : undefined)
      ?? (Array.isArray(multistate?.Flash) ? multistate?.Flash : undefined)
      ?? (Array.isArray(cfg?.Blink) ? cfg?.Blink : undefined)
      ?? (Array.isArray(cfg?.Blinking) ? cfg?.Blinking : undefined)
      ?? (Array.isArray(cfg?.BlinkState) ? cfg?.BlinkState : undefined);

    const parentStates = (Array.isArray(multistate?.States) ? multistate?.States : undefined)
      ?? (Array.isArray(multistate?.Thresholds) ? multistate?.Thresholds : undefined);

    const bgRules: MultistateRule[] = multistate.Triggers
      .map((t, idx) => {
        const expr = (t.Expression ?? '').trim();
        const color = normalizeColor(t.BackColor);
        if (!expr || !color) return undefined;
        const parsed = parseExpression(expr);
        if (!parsed) return undefined;
        const stateObj = parentStates?.[idx];
        const stateRec = (stateObj && typeof stateObj === 'object') ? stateObj as Record<string, unknown> : undefined;
        const parentBlinkVal = parentBlinks?.[idx];
        const trigRec = t as Record<string, unknown>;
        const isBlink = Boolean(
          trigRec.Blink === true || trigRec.Blink === 1 || trigRec.Blink === 'true' ||
          trigRec.IsBlinking === true || trigRec.IsBlinking === 1 || trigRec.IsBlinking === 'true' ||
          trigRec.Blinking === true || trigRec.Blinking === 1 || trigRec.Blinking === 'true' ||
          trigRec.Flash === true || trigRec.Flash === 1 || trigRec.Flash === 'true' ||
          trigRec.BlinkState === true || trigRec.BlinkState === 1 || trigRec.BlinkState === 'true' ||
          trigRec.IsBlink === true || trigRec.IsBlink === 1 || trigRec.IsBlink === 'true' ||
          parentBlinkVal === true || parentBlinkVal === 1 || parentBlinkVal === 'true' ||
          stateRec?.Blink === true || stateRec?.Blink === 1 || stateRec?.Blink === 'true' ||
          stateRec?.IsBlinking === true || stateRec?.IsBlinking === 1 || stateRec?.IsBlinking === 'true' ||
          stateRec?.Blinking === true || stateRec?.Blinking === 1 || stateRec?.Blinking === 'true' ||
          stateRec?.Flash === true || stateRec?.Flash === 1 || stateRec?.Flash === 'true' ||
          Boolean(Array.isArray(stateRec?.StateValues) && stateRec?.StateValues?.some((v) => v === true || v === 1 || v === 'true')) ||
          Boolean(Array.isArray(trigRec?.StateValues) && trigRec?.StateValues?.some((v) => v === true || v === 1 || v === 'true'))
        );
        return {
          id: generateId(),
          ...parsed,
          color,
          ...(isBlink ? { blink: true } : {}),
        };
      })
      .filter((r): r is MultistateRule => r !== undefined);

    return {
      ...(config.rules.length > 0 ? { multistate: config } : {}),
      ...(bgRules.length > 0 ? { backgroundMultistate: { enabled: true, rules: bgRules } } : {}),
    };
  }

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
  const blinkIndex = definition?.StateVariables?.findIndex((name) => /blink|flash/i.test(name)) ?? -1;

  const converted = states.flatMap((state) => {
    const upperValue = state.UpperValue;
    const color = normalizeMultistateColor(state.StateValues?.[colorIndex]);
    const rawBlink = blinkIndex >= 0 ? state.StateValues?.[blinkIndex] : undefined;
    const isBlink = Boolean(
      rawBlink === true || rawBlink === 1 || rawBlink === 'true' ||
      state.Blink === true || state.Blink === 1 || state.Blink === 'true' ||
      state.IsBlinking === true || state.IsBlinking === 1 || state.IsBlinking === 'true' ||
      state.Blinking === true || state.Blinking === 1 || state.Blinking === 'true' ||
      state.Flash === true || state.Flash === 1 || state.Flash === 'true'
    );
    return typeof upperValue === 'number' && Number.isFinite(upperValue) && color
      ? [{ upperValue, color, blink: isBlink }]
      : [];
  });
  if (converted.length === 0) {
    return undefined;
  }

  const isDigital = converted.length <= 4 && converted.every((s, i) => s.upperValue === i);

  const rules: MultistateRule[] = converted.map((state, index) => {
    const blinkProp = state.blink ? { blink: true } : {};
    if (isDigital) {
      const digitalName = converted.length === 2 ? (state.upperValue === 0 ? 'Off' : 'On') : undefined;
      return {
        id: generateId(),
        operator: 'eq',
        value: state.upperValue,
        digitalStateValue: state.upperValue,
        ...(digitalName ? { digitalStateName: digitalName } : {}),
        color: state.color,
        ...blinkProp,
      };
    }
    if (index === converted.length - 1 && index > 0) {
      return {
        id: generateId(),
        operator: 'gte',
        value: converted[index - 1].upperValue,
        color: state.color,
        ...blinkProp,
      };
    }
    return { id: generateId(), operator: 'lte', value: state.upperValue, color: state.color, ...blinkProp };
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
  stateObj?: unknown,
  parentBlinkVal?: unknown,
): MultistateRule | undefined {
  const expression = (trigger.Expression ?? '').trim();
  const color = normalizeColor(trigger.ForeColor ?? (trigger as Record<string, unknown>).Color ?? (trigger as Record<string, unknown>).Fill) ?? '#d32f2f';

  if (!expression) {
    return undefined;
  }

  const parsed = parseExpression(expression);
  if (!parsed) {
    return undefined;
  }

  const trigRec = trigger as Record<string, unknown>;
  const stateRec = (stateObj && typeof stateObj === 'object') ? stateObj as Record<string, unknown> : undefined;

  const isBlink = Boolean(
    trigRec.Blink === true || trigRec.Blink === 1 || trigRec.Blink === 'true' ||
    trigRec.IsBlinking === true || trigRec.IsBlinking === 1 || trigRec.IsBlinking === 'true' ||
    trigRec.Blinking === true || trigRec.Blinking === 1 || trigRec.Blinking === 'true' ||
    trigRec.Flash === true || trigRec.Flash === 1 || trigRec.Flash === 'true' ||
    trigRec.BlinkState === true || trigRec.BlinkState === 1 || trigRec.BlinkState === 'true' ||
    trigRec.IsBlink === true || trigRec.IsBlink === 1 || trigRec.IsBlink === 'true' ||
    parentBlinkVal === true || parentBlinkVal === 1 || parentBlinkVal === 'true' ||
    stateRec?.Blink === true || stateRec?.Blink === 1 || stateRec?.Blink === 'true' ||
    stateRec?.IsBlinking === true || stateRec?.IsBlinking === 1 || stateRec?.IsBlinking === 'true' ||
    stateRec?.Blinking === true || stateRec?.Blinking === 1 || stateRec?.Blinking === 'true' ||
    stateRec?.Flash === true || stateRec?.Flash === 1 || stateRec?.Flash === 'true' ||
    Boolean(Array.isArray(stateRec?.StateValues) && stateRec?.StateValues?.some((v) => v === true || v === 1 || v === 'true')) ||
    Boolean(Array.isArray(trigRec?.StateValues) && trigRec?.StateValues?.some((v) => v === true || v === 1 || v === 'true'))
  );

  return {
    id: generateId(),
    ...parsed,
    color,
    ...(isBlink ? { blink: true } : {}),
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

  // Remove prefixo de protocolo: "pi:\\", "af:\\"
  normalized = normalized.replace(/^[a-z]+:\\+/i, '');
  // Remove barras iniciais extras
  normalized = normalized.replace(/^[\\/]+/, '');

  if (!normalized) {
    return undefined;
  }

  // Divide no primeiro separador de caminho
  const firstSep = normalized.indexOf('\\') >= 0
    ? normalized.indexOf('\\')
    : normalized.indexOf('/');

  if (firstSep < 1) {
    return undefined;
  }

  const remainder = normalized.slice(firstSep + 1);

  if (!remainder) {
    return undefined;
  }

  // Para paths AF com subestrutura (DB\Element|Attribute), o "pointName"
  // e a ultima parte apos o ultimo separador ou pipe
  const lastSep = Math.max(remainder.lastIndexOf('\\'), remainder.lastIndexOf('/'), remainder.lastIndexOf('|'));
  const rawPointName = lastSep >= 0 ? remainder.slice(lastSep + 1) : remainder;
  const pointName = removePiVisionResourceId(rawPointName);

  // O serverPath deve ser tudo antes do pointName para nao perder subestruturas (ex: DB\Element)
  const pointNameIndex = normalized.lastIndexOf(rawPointName);
  let newServerPath = pointNameIndex > 0 ? normalized.slice(0, pointNameIndex) : normalized;
  // Limpar pipes ou barras no final do serverPath
  newServerPath = newServerPath.replace(/[\\/|]+$/, '');
  newServerPath = removePiVisionResourceId(newServerPath);

  if (!newServerPath || !pointName) {
    return undefined;
  }

  return { dataSourceUid, serverPath: newServerPath, pointName };
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

/**
 * PI Vision can export a navigation label with a text box that is wider than
 * (and horizontally offset from) the rectangle used as its button. Rendering
 * both geometries literally leaves the label outside the button in the SVG.
 * Align linked labels to the matching background rectangle during import.
 */
export function normalizeImportedButtonLayout(elements: DisplayElement[]): DisplayElement[] {
  const backgrounds = elements.filter((element): element is DisplayElement<'rectangle', RectangleProperties> => (
    element.type === RECTANGLE_TYPE
      && element.properties.shape === 'rectangle'
      && typeof element.properties.fill === 'string'
      && element.properties.fill !== 'transparent'
      && element.height > 0
      && element.height <= 80
  ));

  return elements.map((element) => {
    if (element.type !== TEXT_TYPE) {
      return element;
    }

    const linkUrl = element.properties.linkUrl;
    const textBackground = element.properties.backgroundColor;
    if (typeof linkUrl !== 'string' || !linkUrl.trim() || typeof textBackground !== 'string' || textBackground === 'transparent') {
      return element;
    }

    const textCenterX = element.x + element.width / 2;
    const textCenterY = element.y + element.height / 2;
    const match = backgrounds
      .filter((background) => background.properties.fill === textBackground)
      .filter((background) => Math.abs((background.y + background.height / 2) - textCenterY) <= Math.max(18, background.height))
      .map((background) => ({
        background,
        distance: Math.abs(background.x + background.width / 2 - textCenterX),
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.background;

    if (!match) {
      return element;
    }

    return {
      ...element,
      x: match.x,
      y: match.y + Math.max(0, (match.height - element.height) / 2),
      width: match.width,
    };
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
    return parseDataSourcePath(first?.Path ?? first?.DataSource ?? '', dataSourceUid);
  }
  return paths.length > 0 ? parseDataSourcePath(paths[0], dataSourceUid) : undefined;
}

function firstMultistateBinding(
  symbol: PiVisionSymbol,
  dataSourceUid: string,
): PiPointBinding | undefined {
  const path = Array.isArray(symbol.MSDataSources) && symbol.MSDataSources.length > 0
    ? symbol.MSDataSources[0]
    : getDataSourcePaths(symbol)[0];
  return typeof path === 'string' ? parseDataSourcePath(path, dataSourceUid) : undefined;
}

function firstMultistateCalculation(
  symbol: PiVisionSymbol,
  calculationsByName: ReadonlyMap<string, CalculationDefinition>,
): CalculationDefinition | undefined {
  const path = Array.isArray(symbol.MSDataSources) && symbol.MSDataSources.length > 0
    ? symbol.MSDataSources[0]
    : getDataSourcePaths(symbol)[0];
  return typeof path === 'string' ? resolveCalculationReference(path, calculationsByName) : undefined;
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

function decodePiVisionText(value: unknown): string {
  const text = String(value);
  const decoded = text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (entity, token: string) => {
    const normalized = token.toLocaleLowerCase();
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'amp') return '&';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'nbsp') return ' ';
    const codePoint = normalized.startsWith('#x') ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
  // PI Vision stores line breaks as HTML markup, sometimes escaped as
  // &lt;br&gt;. Convert both forms to the newline understood by the text view.
  return decoded.replace(/<br\s*\/?>/gi, '\n').replace(/\r\n?/g, '\n');
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

function convertTableColumns(piVisionColumns: unknown, defaultCols: TableColumnConfig[], tableWidth: number): TableColumnConfig[] {
  if (!Array.isArray(piVisionColumns) || piVisionColumns.length === 0) {
    return defaultCols;
  }
  const cols = piVisionColumns.map(c => String(c).toLowerCase());
  const updated = defaultCols.map(c => {
    let piName = c.id.toLowerCase();
    if (piName === 'units') piName = 'engunits';
    if (piName === 'trend') piName = 'sparkline';
    const visible = cols.includes(piName) || cols.includes(c.id.toLowerCase()) || (c.id === 'description' && cols.includes('desc'));
    return { ...c, visible };
  });
  const visibleCount = Math.max(1, updated.filter(c => c.visible).length);
  return updated.map(c => ({
    ...c,
    ...(c.visible ? { width: Math.max(60, tableWidth / visibleCount) } : {}),
  }));
}
