import { PLUGIN_ASSET_BASE_URL } from '../constants';

export const INDUSTRIAL_SYMBOL_CATEGORIES = [
  'Motores e acionamentos',
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

export interface IndustrialSymbolDefinition {
  id: string;
  name: string;
  category: IndustrialSymbolCategory;
  keywords: readonly string[];
  source: 'equinor-engineering-symbols';
  license: 'MIT';
  svg: string;
  viewBox: string;
  defaultSize: { width: number; height: number };
  capabilities: { fill: boolean; stroke: boolean; multistateReady: boolean };
}

const SOURCE = 'equinor-engineering-symbols' as const;
const LICENSE = 'MIT' as const;

export const INDUSTRIAL_SYMBOL_CATALOG: readonly IndustrialSymbolDefinition[] = [
  {
    id: 'PT002A_Option1',
    name: 'PT002A (instrumentação)',
    category: 'Instrumentação',
    keywords: ['pt002a', 'instrumentação', 'instrumento', 'pressão'],
    source: SOURCE,
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
    source: SOURCE,
    license: LICENSE,
    svg: 'img/library-PV003B.svg',
    viewBox: '0 0 48 48',
    defaultSize: { width: 96, height: 96 },
    capabilities: { fill: false, stroke: false, multistateReady: false },
  },
] as const;

export function getIndustrialSymbolAssetUrl(symbol: IndustrialSymbolDefinition): string {
  return `${PLUGIN_ASSET_BASE_URL}/${symbol.svg}`;
}

export function findIndustrialSymbol(id: string): IndustrialSymbolDefinition | undefined {
  return INDUSTRIAL_SYMBOL_CATALOG.find((symbol) => symbol.id === id);
}

export function filterIndustrialSymbols(term: string): IndustrialSymbolDefinition[] {
  const normalized = term.trim().toLocaleLowerCase();
  if (!normalized) {
    return [...INDUSTRIAL_SYMBOL_CATALOG];
  }
  return INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => [symbol.name, symbol.category, ...symbol.keywords]
    .some((value) => value.toLocaleLowerCase().includes(normalized)));
}
