import { BAR_TYPE } from './createBar';
import { DEFAULT_RECTANGLE_PROPERTIES, RECTANGLE_TYPE } from './createRectangle';
import { GAUGE_TYPE, normalizeGaugeOptions } from './createGauge';
import { normalizeMultistateConfig, type MultistateConfig, type MultistateRule } from './multistate';
import { normalizeScaleOptions } from './scaleOptions';
import { DISPLAY_SCHEMA_VERSION } from './schemaVersion';
import { TREND_TYPE, trendSeriesColor, type TrendSeries } from './createTrend';
import {
  DEFAULT_VALUE_VISUAL_OPTIONS,
  normalizeValueVisualOptions,
  VALUE_TYPE,
  type ValueVisualOptions,
} from './createValue';
import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { PiPointBinding } from '../pi/piPointBinding';
import { DEFAULT_TEXT_PROPERTIES, TEXT_TYPE } from './createText';
import { IMAGE_TYPE } from './createImage';
import { getLibrarySymbolColor, LIBRARY_SYMBOL_TYPE } from './createLibrarySymbol';
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl } from '../library';
import type { CalculationDefinition } from '../calculations/calculationEngine';
import { CALCULATION_TYPE } from './createCalculation';
import { defaultTableColumns, TABLE_COLUMNS, TABLE_TYPE, type TableColumnAlign, type TableColumnConfig, type TableDataItem } from './createTable';
import { SQL_TABLE_TYPE } from './createSqlTable';

export const DISPLAY_EXPORT_FORMAT = 'pims-vision-display';
export const DISPLAY_EXPORT_VERSION = 1;

export interface DisplayExportEnvelope {
  format: typeof DISPLAY_EXPORT_FORMAT;
  version: typeof DISPLAY_EXPORT_VERSION;
  document: DisplayDocument;
}

export class DisplayImportError extends Error {}

export function serializeDisplay(document: DisplayDocument): string {
  const envelope: DisplayExportEnvelope = {
    format: DISPLAY_EXPORT_FORMAT,
    version: DISPLAY_EXPORT_VERSION,
    document: portableDocument(document),
  };
  return JSON.stringify(envelope, null, 2);
}

export function serializeDisplayCsv(document: DisplayDocument): string {
  const portable = portableDocument(document);
  const headers = ['schemaVersion', 'displayId', 'displayName', 'surfaceWidth', 'surfaceHeight', 'backgroundColor', 'elementOrder', 'elementId', 'elementType', 'x', 'y', 'width', 'height', 'properties'];
  const rows = portable.elements.length === 0
    ? [[portable.schemaVersion, portable.id, portable.name, portable.surface.width, portable.surface.height, portable.surface.backgroundColor, '', '', '', '', '', '', '', '']]
    : portable.elements.map((element, index) => [
      portable.schemaVersion,
      portable.id,
      portable.name,
      portable.surface.width,
      portable.surface.height,
      portable.surface.backgroundColor,
      index,
      element.id,
      element.type,
      element.x,
      element.y,
      element.width,
      element.height,
      JSON.stringify(element.properties),
    ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n') + '\r\n';
}

export function serializeDisplayXml(document: DisplayDocument): string {
  const portable = portableDocument(document);
  const elements = portable.elements.map((element, index) => [
    `      <element order="${index}" type="${escapeXml(element.type)}">`,
    `        <id>${escapeXml(element.id)}</id>`,
    '        <geometry>',
    `          <x>${element.x}</x>`,
    `          <y>${element.y}</y>`,
    `          <width>${element.width}</width>`,
    `          <height>${element.height}</height>`,
    '        </geometry>',
    serializeXmlValue('properties', element.properties, 8),
    '      </element>',
  ].join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<displayExport format="pims-vision-display" version="1">',
    '  <document>',
    `    <schemaVersion>${portable.schemaVersion}</schemaVersion>`,
    `    <id>${escapeXml(portable.id)}</id>`,
    `    <name>${escapeXml(portable.name)}</name>`,
    '    <surface>',
    `      <width>${portable.surface.width}</width>`,
    `      <height>${portable.surface.height}</height>`,
    `      <backgroundColor>${escapeXml(portable.surface.backgroundColor)}</backgroundColor>`,
    '    </surface>',
    '    <elements>',
    elements,
    '    </elements>',
    '  </document>',
    '</displayExport>',
  ].join('\n') + '\n';
}

export function parseImportedDisplay(input: string): DisplayDocument {
  if (input.trim() === '') {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  if (!isRecord(parsed) || parsed.format !== DISPLAY_EXPORT_FORMAT) {
    throw new DisplayImportError('Este arquivo não é um Display Visualization compatível.');
  }
  if (parsed.version !== DISPLAY_EXPORT_VERSION) {
    throw new DisplayImportError('Versão do arquivo não suportada.');
  }
  return portableDocument(parsed.document);
}

export type DisplayExportFileFormat = 'json' | 'csv' | 'xml';

export function getDisplayExportFileName(name: string, format: DisplayExportFileFormat = 'json'): string {
  const safe = name.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return `${safe || 'display'}.pims-vision.${format}`;
}

function escapeCsvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeXml(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function serializeXmlValue(name: string, value: unknown, indent: number): string {
  const padding = ' '.repeat(indent);
  const tag = toXmlName(name);
  if (Array.isArray(value)) {
    return value.map((item) => serializeXmlValue(tag, item, indent)).join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const children = Object.entries(value as Record<string, unknown>).map(([key, item]) => serializeXmlValue(key, item, indent + 2)).join('\n');
    return children ? `${padding}<${tag}>\n${children}\n${padding}</${tag}>` : `${padding}<${tag}/>`;
  }
  return `${padding}<${tag}>${escapeXml(value ?? '')}</${tag}>`;
}

function toXmlName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(safe) ? safe : `item_${safe}`;
}

function portableDocument(input: unknown): DisplayDocument {
  if (!isRecord(input) || input.schemaVersion !== DISPLAY_SCHEMA_VERSION || !isNonEmptyString(input.id) || !isNonEmptyString(input.name)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  const surface = input.surface;
  if (!isRecord(surface) || !isPositiveFinite(surface.width) || !isPositiveFinite(surface.height) || typeof surface.backgroundColor !== 'string') {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  if (!Array.isArray(input.elements)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  const ids = new Set<string>();
  const elements = input.elements.map((element) => {
    const parsedElement = portableElement(element);
    if (ids.has(parsedElement.id)) {
      throw new DisplayImportError('Arquivo de Display inválido.');
    }
    ids.add(parsedElement.id);
    return parsedElement;
  });
  return {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    surface: { width: surface.width, height: surface.height, backgroundColor: surface.backgroundColor },
    elements,
    calculations: portableCalculations(input.calculations),
  };
}

function portableCalculations(input: unknown): CalculationDefinition[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new DisplayImportError('Cálculos de Display inválidos.');
  }
  return input.map((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.id) || !isNonEmptyString(item.name) || !isNonEmptyString(item.expression) || !Array.isArray(item.inputs)) {
      throw new DisplayImportError('Cálculo de Display inválido.');
    }
    const inputs = item.inputs.map((inputItem) => {
      if (!isRecord(inputItem) || !isNonEmptyString(inputItem.name)) {
        throw new DisplayImportError('Entrada de cálculo inválida.');
      }
      return { name: inputItem.name, binding: portableBinding(inputItem.binding) };
    });
    return {
      id: item.id,
      name: item.name,
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      expression: item.expression,
      inputs,
    };
  });
}

function portableElement(input: unknown): DisplayElement {
  if (!isRecord(input) || !isNonEmptyString(input.id) || !isGeometry(input) || !isRecord(input.properties)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  const base = {
    id: input.id,
    type: input.type,
    x: input.x as number,
    y: input.y as number,
    width: input.width as number,
    height: input.height as number,
  };
  switch (input.type) {
    case IMAGE_TYPE:
      if (typeof input.properties.src !== 'string' || !input.properties.src.startsWith('data:image/')) {
        throw new DisplayImportError('Imagem de Display inválida.');
      }
      return { ...base, type: IMAGE_TYPE, properties: { src: input.properties.src, alt: typeof input.properties.alt === 'string' ? input.properties.alt : 'Imagem', rotation: normalizeRotation(input.properties.rotation), ...portableLink(input.properties) } };
    case LIBRARY_SYMBOL_TYPE: {
      const symbol = typeof input.properties.symbolId === 'string' ? findIndustrialSymbol(input.properties.symbolId) : undefined;
      if (!symbol) {
        throw new DisplayImportError('Símbolo da Library inválido.');
      }
      return {
        ...base,
        type: LIBRARY_SYMBOL_TYPE,
        properties: {
          symbolId: symbol.id,
          name: symbol.name,
          src: getIndustrialSymbolAssetUrl(symbol),
          viewBox: symbol.viewBox,
          color: getLibrarySymbolColor(input.properties),
          ...portableLink(input.properties),
          rotation: normalizeRotation(input.properties.rotation),
          ...portableOptionalBinding(input.properties.binding),
          ...portableMultistate(input.properties.multistate),
        },
      };
    }
    case TEXT_TYPE:
      return { ...base, type: TEXT_TYPE, properties: {
        text: typeof input.properties.text === 'string' ? input.properties.text : DEFAULT_TEXT_PROPERTIES.text,
        color: typeof input.properties.color === 'string' ? input.properties.color : DEFAULT_TEXT_PROPERTIES.color,
        fontSize: isFiniteNumber(input.properties.fontSize) ? Math.max(8, Math.min(120, input.properties.fontSize)) : DEFAULT_TEXT_PROPERTIES.fontSize,
        textAlign: input.properties.textAlign === 'left' || input.properties.textAlign === 'right' ? input.properties.textAlign : 'center',
        rotation: normalizeRotation(input.properties.rotation),
        ...portableLink(input.properties),
      } };
    case RECTANGLE_TYPE:
      return {
        ...base,
        type: RECTANGLE_TYPE,
        properties: {
          fill: typeof input.properties.fill === 'string' ? input.properties.fill : DEFAULT_RECTANGLE_PROPERTIES.fill,
          stroke: typeof input.properties.stroke === 'string' ? input.properties.stroke : DEFAULT_RECTANGLE_PROPERTIES.stroke,
          shape: input.properties.shape === 'ellipse' || input.properties.shape === 'triangle'
            ? input.properties.shape
            : 'rectangle',
          rotation: normalizeRotation(input.properties.rotation),
          ...portableLink(input.properties),
          ...portableOptionalBinding(input.properties.binding),
          ...portableMultistate(input.properties.multistate),
        },
      };
    case VALUE_TYPE:
      return { ...base, type: VALUE_TYPE, properties: {
        ...(isNonEmptyString(input.properties.calculationId)
          ? { calculationId: input.properties.calculationId }
          : { binding: portableBinding(input.properties.binding) }),
        visual: portableVisual(input.properties.visual),
        ...portableMultistate(input.properties.multistate),
        ...portableLink(input.properties),
      } };
    case CALCULATION_TYPE:
      if (!isNonEmptyString(input.properties.calculationId)) {
        throw new DisplayImportError('Elemento de cálculo inválido.');
      }
      return { ...base, type: CALCULATION_TYPE, properties: {
        calculationId: input.properties.calculationId,
        visual: portableVisual(input.properties.visual),
        ...portableLink(input.properties),
      } };
    case TREND_TYPE:
      return { ...base, type: TREND_TYPE, properties: { series: portableTrendSeries(input.properties) } };
    case TABLE_TYPE:
      return { ...base, type: TABLE_TYPE, properties: portableTable(input.properties) };
    case SQL_TABLE_TYPE:
      if (typeof input.properties.sql !== 'string') {
        throw new DisplayImportError('Tabela SQL inválida.');
      }
      return { ...base, type: SQL_TABLE_TYPE, properties: { sql: input.properties.sql, result: isRecord(input.properties.result) ? (input.properties.result as any) : undefined } };
    case GAUGE_TYPE:
      return { ...base, type: GAUGE_TYPE, properties: {
        ...portableOptionalBinding(input.properties.binding),
        ...(isNonEmptyString(input.properties.calculationId) ? { calculationId: input.properties.calculationId } : {}),
        ...portableGauge(input.properties),
        ...portableMultistate(input.properties.multistate),
        ...portableLink(input.properties),
      } };
    case BAR_TYPE:
      return { ...base, type: BAR_TYPE, properties: {
        ...portableOptionalBinding(input.properties.binding),
        ...(isNonEmptyString(input.properties.calculationId) ? { calculationId: input.properties.calculationId } : {}),
        ...portableScale(input.properties),
        orientation: input.properties.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        ...portableMultistate(input.properties.multistate),
        ...portableLink(input.properties),
      } };
    default:
      throw new DisplayImportError('Tipo de elemento não suportado.');
  }
}

function portableTable(properties: Record<string, unknown>): { items: TableDataItem[]; columns: TableColumnConfig[]; decimals: number | null; style: 'dark' | 'light' | 'striped' } {
  if (!Array.isArray(properties.items) || properties.items.length === 0) throw new DisplayImportError('Tabela de Display inválida.');
  const seen = new Set<string>();
  const items = properties.items.map((input) => {
    if (!isRecord(input)) throw new DisplayImportError('Tabela de Display inválida.');
    const binding = portableBinding(input.binding);
    const key = `${binding.dataSourceUid}\u0000${binding.webId ?? binding.serverPath}\u0000${binding.pointName}`;
    if (seen.has(key)) throw new DisplayImportError('Tabela de Display inválida.');
    seen.add(key);
    return { binding, ...(typeof input.path === 'string' ? { path: input.path } : {}), ...(typeof input.description === 'string' ? { description: input.description } : {}), ...(typeof input.engineeringUnit === 'string' ? { engineeringUnit: input.engineeringUnit } : {}), ...(typeof input.pointType === 'string' ? { pointType: input.pointType } : {}), ...(input.nameMode === 'custom' ? { nameMode: 'custom' as const, customName: typeof input.customName === 'string' && input.customName.trim() ? input.customName : binding.pointName } : {}) };
  });
  const fallback = defaultTableColumns();
  const columns = Array.isArray(properties.columns) ? properties.columns.flatMap((input): TableColumnConfig[] => {
    if (!isRecord(input) || typeof input.id !== 'string' || !TABLE_COLUMNS.includes(input.id as typeof TABLE_COLUMNS[number])) return [];
    return [{ id: input.id as typeof TABLE_COLUMNS[number], visible: input.visible !== false, ...(isFiniteNumber(input.width) ? { width: Math.max(60, input.width) } : {}), align: input.align === 'center' || input.align === 'right' ? input.align as TableColumnAlign : 'left', wrapText: input.wrapText !== false }];
  }) : fallback;
  return { items, columns: columns.length > 0 && columns.some((column) => column.visible) ? columns : fallback, decimals: isFiniteNumber(properties.decimals) ? Math.max(0, Math.min(10, properties.decimals)) : null, style: properties.style === 'light' || properties.style === 'striped' ? properties.style : 'dark' };
}

function normalizeRotation(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value % 360 : 0;
}

function portableLink(properties: Record<string, unknown>): { linkUrl?: string; openInNewTab?: boolean } {
  return typeof properties.linkUrl === 'string' && properties.linkUrl.trim().length > 0
    ? { linkUrl: properties.linkUrl.trim(), ...(properties.openInNewTab === false ? { openInNewTab: false } : {}) }
    : {};
}

function portableBinding(input: unknown): PiPointBinding {
  if (!isRecord(input) || !isNonEmptyString(input.dataSourceUid) || !isNonEmptyString(input.serverPath) || !isNonEmptyString(input.pointName)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  return {
    dataSourceUid: input.dataSourceUid,
    serverPath: input.serverPath,
    pointName: input.pointName,
    ...(isNonEmptyString(input.webId) ? { webId: input.webId } : {}),
    ...(isNonEmptyString(input.pointType) ? { pointType: input.pointType } : {}),
  };
}

function portableOptionalBinding(input: unknown): { binding?: PiPointBinding } {
  return input === undefined ? {} : { binding: portableBinding(input) };
}

function portableTrendSeries(properties: Record<string, unknown>): TrendSeries[] {
  const inputs = Array.isArray(properties.series)
    ? properties.series
    : properties.binding === undefined
      ? []
      : [{ binding: properties.binding }];
  if (inputs.length === 0) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  const unique = new Map<string, TrendSeries>();
  inputs.forEach((input, index) => {
    if (!isRecord(input)) {
      throw new DisplayImportError('Arquivo de Display inválido.');
    }
    const binding = portableBinding(input.binding);
    const key = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
    if (!unique.has(key)) {
      unique.set(key, {
        binding,
        color: typeof input.color === 'string' && input.color.trim().length > 0
          ? input.color
          : trendSeriesColor(index),
        ...(isNonEmptyString(input.calculationId) ? { calculationId: input.calculationId } : {}),
        ...(typeof input.legendLabel === 'string' && input.legendLabel.trim() ? { legendLabel: input.legendLabel } : {}),
        ...(input.primaryScale === true ? { primaryScale: true } : {}),
      });
    }
  });
  return [...unique.values()];
}

function portableVisual(input: unknown): ValueVisualOptions {
  if (input !== undefined && !isRecord(input)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  return normalizeValueVisualOptions((input ?? DEFAULT_VALUE_VISUAL_OPTIONS) as Partial<ValueVisualOptions>);
}

function portableScale(input: Record<string, unknown>) {
  for (const key of ['minimum', 'maximum']) {
    if (input[key] !== undefined && !isFiniteNumber(input[key])) {
      throw new DisplayImportError('Arquivo de Display inválido.');
    }
  }
  if (input.decimals !== undefined && input.decimals !== null && !isFiniteNumber(input.decimals)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  return {
    ...normalizeScaleOptions(input),
    ...(input.scaleMode === 'custom' || input.scaleMode === 'database' ? { scaleMode: input.scaleMode } : {}),
  };
}

function portableGauge(input: Record<string, unknown>) {
  return normalizeGaugeOptions({
    ...portableScale(input),
    gaugeStyle: input.gaugeStyle as 'arc' | 'triangle' | 'pointer' | 'line',
    scaleMode: input.scaleMode === 'custom' ? 'custom' : 'database',
    title: typeof input.title === 'string' ? input.title : '',
    labelPosition: input.labelPosition === 'below' ? 'below' : 'above',
    scaleDisplay: input.scaleDisplay === 'endpoints' ? 'endpoints' : 'all',
    gaugeAngle: typeof input.gaugeAngle === 'number' ? input.gaugeAngle : 270,
    gaugeBorderColor: typeof input.gaugeBorderColor === 'string' ? input.gaugeBorderColor : undefined,
    gaugeScaleColor: typeof input.gaugeScaleColor === 'string' ? input.gaugeScaleColor : undefined,
    showUnit: input.showUnit === true,
    showTimestamp: input.showTimestamp === true,
  });
}

function portableMultistate(input: unknown): { multistate?: MultistateConfig } {
  if (input === undefined) {
    return {};
  }
  if (!isRecord(input) || typeof input.enabled !== 'boolean' || !Array.isArray(input.rules)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  const rules = input.rules.map((rule) => portableMultistateRule(rule));
  const config = normalizeMultistateConfig({ enabled: input.enabled, rules });
  return config ? { multistate: config } : {};
}

function portableMultistateRule(input: unknown): MultistateRule {
  if (!isRecord(input) || !isNonEmptyString(input.id) || !['lt', 'lte', 'gt', 'gte', 'eq', 'between'].includes(String(input.operator)) || !(isFiniteNumber(input.value) || isNonEmptyString(input.value)) || typeof input.color !== 'string' || (input.color !== 'transparent' && !/^#[0-9a-f]{6}$/i.test(input.color))) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  if (input.operator === 'between' && !isFiniteNumber(input.value2)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  return {
    id: input.id,
    operator: input.operator as MultistateRule['operator'],
    value: input.value as number | string,
    ...(input.operator === 'between' ? { value2: input.value2 as number } : {}),
    color: input.color,
    ...(isFiniteNumber(input.digitalStateValue) || isNonEmptyString(input.digitalStateValue)
      ? { digitalStateValue: input.digitalStateValue as number | string }
      : {}),
    ...(isNonEmptyString(input.digitalStateName) ? { digitalStateName: input.digitalStateName } : {}),
  };
}

function isGeometry(input: Record<string, unknown>): boolean {
  return isFiniteNumber(input.x) && isFiniteNumber(input.y) && isPositiveFinite(input.width) && isPositiveFinite(input.height);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
