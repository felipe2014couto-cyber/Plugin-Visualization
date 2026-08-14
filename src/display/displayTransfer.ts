import { BAR_TYPE } from './createBar';
import { DEFAULT_RECTANGLE_PROPERTIES, RECTANGLE_TYPE } from './createRectangle';
import { GAUGE_TYPE } from './createGauge';
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
import { LIBRARY_SYMBOL_TYPE } from './createLibrarySymbol';
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl } from '../library';

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

export function getDisplayExportFileName(name: string): string {
  const safe = name.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return `${safe || 'display'}.pims-vision.json`;
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
  };
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
      return { ...base, type: IMAGE_TYPE, properties: { src: input.properties.src, alt: typeof input.properties.alt === 'string' ? input.properties.alt : 'Imagem' } };
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
        },
      };
    }
    case TEXT_TYPE:
      return { ...base, type: TEXT_TYPE, properties: {
        text: typeof input.properties.text === 'string' ? input.properties.text : DEFAULT_TEXT_PROPERTIES.text,
        color: typeof input.properties.color === 'string' ? input.properties.color : DEFAULT_TEXT_PROPERTIES.color,
        fontSize: isFiniteNumber(input.properties.fontSize) ? Math.max(8, Math.min(120, input.properties.fontSize)) : DEFAULT_TEXT_PROPERTIES.fontSize,
        textAlign: input.properties.textAlign === 'left' || input.properties.textAlign === 'right' ? input.properties.textAlign : 'center',
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
          ...portableOptionalBinding(input.properties.binding),
          ...portableMultistate(input.properties.multistate),
        },
      };
    case VALUE_TYPE:
      return { ...base, type: VALUE_TYPE, properties: {
        binding: portableBinding(input.properties.binding),
        visual: portableVisual(input.properties.visual),
        ...portableMultistate(input.properties.multistate),
      } };
    case TREND_TYPE:
      return { ...base, type: TREND_TYPE, properties: { series: portableTrendSeries(input.properties) } };
    case GAUGE_TYPE:
      return { ...base, type: GAUGE_TYPE, properties: {
        ...portableOptionalBinding(input.properties.binding),
        ...portableScale(input.properties),
        ...portableMultistate(input.properties.multistate),
      } };
    case BAR_TYPE:
      return { ...base, type: BAR_TYPE, properties: {
        ...portableOptionalBinding(input.properties.binding),
        ...portableScale(input.properties),
        orientation: input.properties.orientation === 'horizontal' ? 'horizontal' : 'vertical',
        ...portableMultistate(input.properties.multistate),
      } };
    default:
      throw new DisplayImportError('Tipo de elemento não suportado.');
  }
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
  return normalizeScaleOptions(input);
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
  if (!isRecord(input) || !isNonEmptyString(input.id) || !['lt', 'lte', 'gt', 'gte', 'eq', 'between'].includes(String(input.operator)) || !isFiniteNumber(input.value) || typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  if (input.operator === 'between' && !isFiniteNumber(input.value2)) {
    throw new DisplayImportError('Arquivo de Display inválido.');
  }
  return {
    id: input.id,
    operator: input.operator as MultistateRule['operator'],
    value: input.value,
    ...(input.operator === 'between' ? { value2: input.value2 as number } : {}),
    color: input.color,
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
