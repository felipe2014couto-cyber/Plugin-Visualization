/**
 * piVisionConverter.ts
 *
 * Converte a definicao JSON de um Display do PI Vision (AVEVA)
 * para o formato nativo DisplayDocument do PIMS Vision / Aperam Visualization.
 *
 * LIMITACOES CONHECIDAS:
 * - dataSourceUid: o JSON do PI Vision nao contem o UID do datasource do Grafana.
 *   O campo e preenchido com PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER e deve
 *   ser corrigido manualmente pelo usuario no editor apos a importacao.
 * - Formulas PI Performance Equations sao preservadas como texto em
 *   `_piVisionExpression` nas propriedades do elemento.
 * - Imagens de fundo (BackgroundImage) sao ignoradas nesta versao.
 * - Simbolos industriais sem equivalente na biblioteca local sao representados
 *   como RectangleElement com uma legenda de texto.
 */

import { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
import { generateId } from './ids';
import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { PiPointBinding } from '../pi/piPointBinding';
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
  Symbols?: PiVisionSymbol[];
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
  Configuration?: PiVisionSymbolConfiguration;
  Multistate?: PiVisionMultistateConfig;
}

export interface PiVisionSymbolConfiguration {
  // DataSources: lista de paths pi:\\ ou af:\\ dos tags vinculados
  DataSources?: string[];
  DataItems?: PiVisionDataItem[];
  // Aparencia
  ForeColor?: string;
  BackColor?: string;
  BackgroundColor?: string;
  TextSize?: number;
  FontSize?: number;
  Decimals?: number;
  // Visibilidade de campos
  ShowLabel?: boolean;
  ShowTagName?: boolean;
  ShowUnit?: boolean;
  ShowTimestamp?: boolean;
  ShowValue?: boolean;
  TextAlignment?: string;
  // Escala (Gauge / Bar)
  MinValue?: number;
  MaxValue?: number;
  // Trend
  Traces?: PiVisionTrace[];
  // Forma geometrica (Shape)
  ShapeType?: string;
  // Texto estatico
  Content?: string;
  Text?: string;
  // Orientacao (Bar)
  Orientation?: string;
}

export interface PiVisionDataItem {
  Path?: string;
  DataSource?: string;
  Color?: string;
  Label?: string;
  LegendLabel?: string;
  MinValue?: number;
  MaxValue?: number;
}

export interface PiVisionTrace {
  Path?: string;
  DataSource?: string;
  Color?: string;
  Label?: string;
  LegendLabel?: string;
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
export function convertPiVisionDisplay(
  json: unknown,
  dataSourceUid?: string,
): DisplayDocument {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new PiVisionConvertError('JSON do PI Vision invalido: esperado um objeto.');
  }

  const display = json as PiVisionDisplay;
  const uid = dataSourceUid?.trim() || PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER;

  const width = typeof display.Width === 'number' && display.Width > 0 ? display.Width : 1920;
  const height = typeof display.Height === 'number' && display.Height > 0 ? display.Height : 1080;
  const backgroundColor = normalizeColor(display.BackgroundColor) ?? '#1f1f1f';

  const existingIds = new Set<string>();
  const elements: DisplayElement[] = [];

  const symbols: PiVisionSymbol[] = Array.isArray(display.Symbols) ? display.Symbols : [];

  for (const symbol of symbols) {
    const element = convertSymbol(symbol, uid, existingIds);
    if (element !== undefined) {
      existingIds.add(element.id);
      elements.push(element);
    }
  }

  return {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    id: generateId(),
    name: typeof display.Name === 'string' && display.Name.trim() ? display.Name.trim() : 'Display Importado',
    surface: { width, height, backgroundColor },
    elements,
    calculations: [],
  };
}

// ---------------------------------------------------------------------------
// Conversao por tipo de simbolo
// ---------------------------------------------------------------------------

function convertSymbol(
  symbol: PiVisionSymbol,
  dataSourceUid: string,
  existingIds: Set<string>,
): DisplayElement | undefined {
  const type = (symbol.SymbolType ?? '').trim().toLowerCase();
  const geo = extractGeometry(symbol);

  switch (type) {
    case 'value':
    case 'currentvalue':
      return convertValue(symbol, geo, dataSourceUid, existingIds);

    case 'trend':
    case 'multitrend':
      return convertTrend(symbol, geo, dataSourceUid, existingIds);

    case 'gauge':
    case 'radialgauge':
    case 'lineargauge':
      return convertGauge(symbol, geo, dataSourceUid, existingIds);

    case 'verticalbar':
    case 'horizontalbar':
    case 'bar':
      return convertBar(symbol, geo, dataSourceUid, existingIds);

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
      return convertShape(symbol, geo, existingIds);

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
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const binding = firstBinding(cfg, dataSourceUid);
  if (!binding) {
    return undefined;
  }

  const color = normalizeColor(cfg.ForeColor) ?? DEFAULT_VALUE_VISUAL_OPTIONS.color;
  const backgroundColor = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor) ?? DEFAULT_VALUE_VISUAL_OPTIONS.backgroundColor;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? DEFAULT_VALUE_VISUAL_OPTIONS.fontSize;
  const textAlign = normalizeTextAlign(cfg.TextAlignment);

  const properties: ValueProperties = {
    binding,
    visual: {
      ...DEFAULT_VALUE_VISUAL_OPTIONS,
      color,
      backgroundColor,
      fontSize,
      textAlign,
      showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTagName,
      showUnit: cfg.ShowUnit ?? DEFAULT_VALUE_VISUAL_OPTIONS.showUnit,
      showTimestamp: cfg.ShowTimestamp ?? DEFAULT_VALUE_VISUAL_OPTIONS.showTimestamp,
      showValue: cfg.ShowValue ?? DEFAULT_VALUE_VISUAL_OPTIONS.showValue,
      decimals: normalizeDecimals(cfg.Decimals),
    },
    ...convertMultistateIfPresent(symbol.Multistate),
  };

  return makeElement(VALUE_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

function convertTrend(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  dataSourceUid: string,
  existingIds: Set<string>,
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const rawTraces: Array<PiVisionTrace | PiVisionDataItem> = [
    ...(Array.isArray(cfg.Traces) ? cfg.Traces : []),
    ...(Array.isArray(cfg.DataItems) ? cfg.DataItems : []),
  ];

  // Se nao ha traces, tenta extrair da lista generica de DataSources
  const paths = Array.isArray(cfg.DataSources) ? cfg.DataSources : [];
  const tracePaths = rawTraces
    .map((t) => t.Path ?? t.DataSource ?? '')
    .filter(Boolean);
  const allPaths = tracePaths.length > 0 ? tracePaths : paths;

  if (allPaths.length === 0) {
    return undefined;
  }

  const series: TrendSeries[] = [];
  for (let i = 0; i < allPaths.length; i++) {
    const binding = parseDataSourcePath(allPaths[i], dataSourceUid);
    if (!binding) {
      continue;
    }
    const traceInfo = rawTraces[i];
    const rawColor = traceInfo?.Color;
    const color = normalizeColor(rawColor) ?? TREND_SERIES_COLORS[i % TREND_SERIES_COLORS.length];
    const legendLabel = traceInfo?.Label ?? traceInfo?.LegendLabel ?? undefined;
    const scaleMin = typeof traceInfo?.MinValue === 'number' ? traceInfo.MinValue : undefined;
    const scaleMax = typeof traceInfo?.MaxValue === 'number' ? traceInfo.MaxValue : undefined;
    series.push({
      binding,
      color,
      ...(legendLabel ? { legendLabel } : {}),
      ...(scaleMin !== undefined ? { scaleMin } : {}),
      ...(scaleMax !== undefined ? { scaleMax } : {}),
    });
  }

  if (series.length === 0) {
    return undefined;
  }

  const properties: TrendProperties = { series };
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
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const binding = firstBinding(cfg, dataSourceUid);
  if (!binding) {
    return undefined;
  }

  const minimum = typeof cfg.MinValue === 'number' ? cfg.MinValue : 0;
  const maximum = typeof cfg.MaxValue === 'number' ? cfg.MaxValue : 100;
  const color = normalizeColor(cfg.ForeColor) ?? '#00a2e8';
  const multistate = convertMultistateIfPresent(symbol.Multistate);

  const properties: GaugeProperties = {
    binding,
    minimum,
    maximum,
    showValue: cfg.ShowValue !== false,
    showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? true,
    decimals: normalizeDecimals(cfg.Decimals),
    gaugeStyle: 'pointer',
    scaleMode: 'custom',
    title: '',
    labelPosition: 'above',
    scaleDisplay: 'all',
    gaugeAngle: 270,
    gaugeBorderColor: '#ffffff',
    gaugeScaleColor: '#ffffff',
    showUnit: cfg.ShowUnit === true,
    showTimestamp: cfg.ShowTimestamp === true,
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
): DisplayElement | undefined {
  const cfg = symbol.Configuration ?? {};
  const binding = firstBinding(cfg, dataSourceUid);
  if (!binding) {
    return undefined;
  }

  const minimum = typeof cfg.MinValue === 'number' ? cfg.MinValue : 0;
  const maximum = typeof cfg.MaxValue === 'number' ? cfg.MaxValue : 100;
  const symType = (symbol.SymbolType ?? '').toLowerCase();
  const cfgOrientation = (cfg.Orientation ?? '').toLowerCase();
  const orientation = (symType === 'horizontalbar' || cfgOrientation === 'horizontal')
    ? 'horizontal'
    : 'vertical';
  const color = normalizeColor(cfg.ForeColor) ?? '#6e9fff';
  const multistate = convertMultistateIfPresent(symbol.Multistate);

  const properties: BarProperties = {
    binding,
    minimum,
    maximum,
    showValue: cfg.ShowValue !== false,
    showTagName: cfg.ShowLabel ?? cfg.ShowTagName ?? true,
    decimals: normalizeDecimals(cfg.Decimals),
    orientation,
    color,
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
  const paths = Array.isArray(cfg.DataSources) ? cfg.DataSources : [];
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
  const text = cfg.Content ?? cfg.Text ?? '';
  const color = normalizeColor(cfg.ForeColor) ?? DEFAULT_TEXT_PROPERTIES.color;
  const backgroundColor = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor) ?? DEFAULT_TEXT_PROPERTIES.backgroundColor;
  const fontSize = normalizeFontSize(cfg.TextSize ?? cfg.FontSize) ?? DEFAULT_TEXT_PROPERTIES.fontSize;
  const textAlign = normalizeTextAlign(cfg.TextAlignment) as TextAlign;

  const properties: TextProperties = {
    ...DEFAULT_TEXT_PROPERTIES,
    text,
    color,
    backgroundColor: backgroundColor ?? 'transparent',
    fontSize,
    textAlign,
  };

  return makeElement(TEXT_TYPE, geo, properties, existingIds);
}

// ---------------------------------------------------------------------------
// Formas geometricas
// ---------------------------------------------------------------------------

function convertShape(
  symbol: PiVisionSymbol,
  geo: ElementGeometry,
  existingIds: Set<string>,
): DisplayElement {
  const cfg = symbol.Configuration ?? {};
  const symType = (symbol.SymbolType ?? cfg.ShapeType ?? 'rectangle').toLowerCase();
  const shape = normalizeGeometricShape(symType);
  const fill = normalizeColor(cfg.BackColor ?? cfg.BackgroundColor) ?? DEFAULT_RECTANGLE_PROPERTIES.fill;
  const stroke = normalizeColor(cfg.ForeColor) ?? DEFAULT_RECTANGLE_PROPERTIES.stroke;
  const multistate = convertMultistateIfPresent(symbol.Multistate);

  const properties: RectangleProperties = {
    ...DEFAULT_RECTANGLE_PROPERTIES,
    fill,
    stroke,
    shape,
    ...multistate,
  };

  return makeElement(RECTANGLE_TYPE, geo, properties, existingIds);
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
  normalized = normalized.replace(/^[a-z]+:\\\\/i, '');
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

  const serverPath = normalized.slice(0, firstSep);
  const remainder = normalized.slice(firstSep + 1);

  if (!remainder) {
    return undefined;
  }

  // Para paths AF com subestrutura (DB\Element|Attribute), o "pointName"
  // e a ultima parte apos o ultimo separador ou pipe
  const lastSep = Math.max(remainder.lastIndexOf('\\'), remainder.lastIndexOf('|'));
  const pointName = lastSep >= 0 ? remainder.slice(lastSep + 1) : remainder;

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
  return {
    x: typeof symbol.Left === 'number' ? Math.max(0, symbol.Left) : 0,
    y: typeof symbol.Top === 'number' ? Math.max(0, symbol.Top) : 0,
    width: typeof symbol.Width === 'number' && symbol.Width > 0 ? symbol.Width : 200,
    height: typeof symbol.Height === 'number' && symbol.Height > 0 ? symbol.Height : 100,
  };
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
  cfg: PiVisionSymbolConfiguration,
  dataSourceUid: string,
): PiPointBinding | undefined {
  const paths = Array.isArray(cfg.DataSources) ? cfg.DataSources : [];
  if (paths.length === 0 && Array.isArray(cfg.DataItems) && cfg.DataItems.length > 0) {
    const first = cfg.DataItems[0];
    return parseDataSourcePath(first.Path ?? first.DataSource ?? '', dataSourceUid);
  }
  return paths.length > 0 ? parseDataSourcePath(paths[0], dataSourceUid) : undefined;
}

function normalizeColor(value: unknown): string | undefined {
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
  return undefined;
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
