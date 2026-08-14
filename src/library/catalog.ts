import openclipartMotorCatalog from './assets/openclipartMotorCatalog.json';
import { PLUGIN_ASSET_BASE_URL } from '../constants';

export const INDUSTRIAL_SYMBOL_CATEGORIES = [
  'Motores',
  'Bombas e válvulas',
  'Ventilação e exaustão',
  'Desempoeiramento',
  'Fornos e caldeiras',
  'Elétrica',
  'Componentes mecânicos',
  'Transporte de materiais',
  'Instrumentação',
  'Utilidades industriais',
] as const;

export type IndustrialSymbolCategory = typeof INDUSTRIAL_SYMBOL_CATEGORIES[number];
export type IndustrialSymbolSource = 'equinor-engineering-symbols' | 'openclipart';

export interface IndustrialSymbolDefinition {
  id: string;
  name: string;
  category: IndustrialSymbolCategory;
  keywords: readonly string[];
  source: IndustrialSymbolSource;
  license: 'MIT' | 'Public Domain';
  svg: string;
  viewBox: string;
  defaultSize: { width: number; height: number };
  capabilities: {
    fill: boolean;
    stroke: boolean;
    opacity?: boolean;
    rotate?: boolean;
    blink?: boolean;
    multistateReady: boolean;
    animatedParts?: readonly string[];
  };
  originalName?: string;
  synonyms?: readonly string[];
  library?: string;
  sourceUrl?: string;
  downloadUrl?: string;
  sourceFile?: string;
  author?: string;
  sanitized?: boolean;
  modified?: boolean;
  originalAspectRatio?: number;
  dimensions?: { width: number; height: number };
}

const EQUINOR_SOURCE = 'equinor-engineering-symbols' as const;
const OPENCLIPART_SOURCE = 'openclipart' as const;
const LICENSE = 'MIT' as const;

const EXISTING_SYMBOL_CATALOG: readonly IndustrialSymbolDefinition[] = [
  {
    id: 'PT002A_Option1',
    name: 'PT002A (instrumentação)',
    category: 'Instrumentação',
    keywords: ['pt002a', 'instrumentação', 'instrumento', 'pressão'],
    source: EQUINOR_SOURCE,
    license: LICENSE,
    svg: 'img/library-PT002A_Option1.svg',
    viewBox: '0 0 96 216',
    defaultSize: { width: 72, height: 162 },
    capabilities: { fill: false, stroke: false, multistateReady: false },
  },
  {
    id: 'PV003B',
    name: 'PV003B (processo)',
    category: 'Instrumentação',
    keywords: ['pv003b', 'processo', 'válvula', 'símbolo'],
    source: EQUINOR_SOURCE,
    license: LICENSE,
    svg: 'img/library-PV003B.svg',
    viewBox: '0 0 48 48',
    defaultSize: { width: 96, height: 96 },
    capabilities: { fill: false, stroke: false, multistateReady: false },
  },
] as const;

const OPENCLIPART_MOTOR_CATALOG: readonly IndustrialSymbolDefinition[] = openclipartMotorCatalog.entries.map((entry) => ({
  id: entry.id,
  name: entry.name,
  category: 'Motores',
  keywords: entry.keywords,
  source: OPENCLIPART_SOURCE,
  license: entry.license,
  svg: entry.svg,
  viewBox: entry.viewBox,
  defaultSize: entry.defaultSize,
  capabilities: entry.capabilities,
  originalName: entry.originalName,
  synonyms: entry.synonyms,
  library: entry.library,
  sourceUrl: entry.sourceUrl,
  downloadUrl: entry.downloadUrl,
  sourceFile: entry.sourceFile,
  author: entry.author,
  sanitized: entry.sanitized,
  modified: entry.modified,
  originalAspectRatio: entry.originalAspectRatio,
  dimensions: entry.dimensions,
})) as readonly IndustrialSymbolDefinition[];

export const INDUSTRIAL_SYMBOL_CATALOG: readonly IndustrialSymbolDefinition[] = [
  ...EXISTING_SYMBOL_CATALOG,
  ...OPENCLIPART_MOTOR_CATALOG,
];

export function getIndustrialSymbolAssetUrl(symbol: IndustrialSymbolDefinition): string {
  return `${PLUGIN_ASSET_BASE_URL}/${symbol.svg}`;
}

export function findIndustrialSymbol(id: string): IndustrialSymbolDefinition | undefined {
  return INDUSTRIAL_SYMBOL_CATALOG.find((symbol) => symbol.id === id);
}

export function filterIndustrialSymbols(term: string): IndustrialSymbolDefinition[] {
  const normalized = normalizeSearchText(term);
  if (!normalized) {
    return [...INDUSTRIAL_SYMBOL_CATALOG];
  }
  return INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => [
    symbol.name,
    symbol.originalName || '',
    symbol.category,
    symbol.source,
    symbol.library || '',
    ...symbol.keywords,
    ...(symbol.synonyms || []),
  ].some((value) => normalizeSearchText(value).includes(normalized)));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}
