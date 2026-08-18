import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';

export const TABLE_TYPE = 'table' as const;
export const TABLE_COLUMNS = ['path', 'name', 'description', 'value', 'units', 'time', 'trend', 'average', 'minimum', 'maximum', 'stdDev', 'range', 'pStdDev'] as const;
export type TableColumnId = typeof TABLE_COLUMNS[number];
export type TableColumnAlign = 'left' | 'center' | 'right';
export type TableStyle = 'dark' | 'light' | 'striped';
export interface TableColumnConfig { id: TableColumnId; visible: boolean; width?: number; align: TableColumnAlign; wrapText: boolean; }
export interface TableDataItem { binding: PiPointBinding; path?: string; description?: string; engineeringUnit?: string; pointType?: string; nameMode?: 'tag' | 'custom'; customName?: string; }
export interface TableProperties extends Record<string, unknown> { items: TableDataItem[]; columns: TableColumnConfig[]; decimals: number | null; style: TableStyle; }
export type TableElement = DisplayElement<typeof TABLE_TYPE, TableProperties>;
export interface CreateTableOptions { item: TableDataItem; id?: string; x?: number; y?: number; width?: number; height?: number; surface?: DisplaySurface; existingIds?: readonly string[]; generateId?: () => string; }

const DEFAULT_WIDTH = 520; const DEFAULT_HEIGHT = 260;
export const TABLE_COLUMN_LABELS: Record<TableColumnId, string> = { path: 'Caminho', name: 'Nome', description: 'Descrição', value: 'Valor', units: 'Unidades', time: 'Tempo', trend: 'Tendência', average: 'Média', minimum: 'Mínimo', maximum: 'Máximo', stdDev: 'StdDev', range: 'Intervalo', pStdDev: 'pStdDev' };
export function defaultTableColumns(tableWidth = DEFAULT_WIDTH): TableColumnConfig[] {
  const visibleCount = 3;
  return TABLE_COLUMNS.map((id) => ({
    id,
    visible: id === 'name' || id === 'value' || id === 'units',
    ...(id === 'name' || id === 'value' || id === 'units' ? { width: tableWidth / visibleCount } : {}),
    align: id === 'value' ? 'right' : 'left',
    wrapText: ['path', 'name', 'description', 'value', 'units', 'time'].includes(id),
  }));
}
export function createTable(options: CreateTableOptions): TableElement {
  if (!isPiPointBinding(options.item.binding)) throw new Error('Table requer um binding de PI Point válido');
  const width = Math.max(1, Math.min(options.width ?? DEFAULT_WIDTH, options.surface?.width ?? DEFAULT_WIDTH));
  const height = Math.max(1, Math.min(options.height ?? DEFAULT_HEIGHT, options.surface?.height ?? DEFAULT_HEIGHT));
  const ids = new Set(options.existingIds ?? []); const make = options.generateId ?? generateId; let id = options.id ?? make(); while (ids.has(id)) id = make();
  return { id, type: TABLE_TYPE, x: options.x ?? Math.max(0, ((options.surface?.width ?? width) - width) / 2), y: options.y ?? Math.max(0, ((options.surface?.height ?? height) - height) / 2), width, height, properties: { items: [copyItem(options.item)], columns: defaultTableColumns(width), decimals: null, style: 'dark' } };
}
export function appendTable(document: DisplayDocument, element: TableElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function tableBindingKey(binding: PiPointBinding): string { return `${binding.dataSourceUid}\u0000${binding.webId ?? `${binding.serverPath}\u0000${binding.pointName}`}`; }
export function addTableItem(document: DisplayDocument, elementId: string, item: TableDataItem): DisplayDocument {
  if (!isPiPointBinding(item.binding)) return document; let changed = false;
  const elements = document.elements.map((element) => { if (element.id !== elementId || element.type !== TABLE_TYPE) return element; const table = element as TableElement; if (table.properties.items.some((current) => tableBindingKey(current.binding) === tableBindingKey(item.binding))) return element; changed = true; return { ...table, properties: { ...table.properties, items: [...table.properties.items, copyItem(item)] } }; });
  return changed ? { ...document, elements } : document;
}
export function updateTableProperties(document: DisplayDocument, elementId: string, patch: Partial<TableProperties>): DisplayDocument { let changed = false; const elements = document.elements.map((element) => { if (element.id !== elementId || element.type !== TABLE_TYPE) return element; changed = true; return { ...element, properties: { ...(element as TableElement).properties, ...patch } } as TableElement; }); return changed ? { ...document, elements } : document; }
export function removeTableItem(document: DisplayDocument, elementId: string, index: number): DisplayDocument {
  const table = document.elements.find((element) => element.id === elementId && element.type === TABLE_TYPE) as TableElement | undefined;
  if (!table || index < 0 || index >= table.properties.items.length || table.properties.items.length <= 1) return document;
  return updateTableProperties(document, elementId, { items: table.properties.items.filter((_, itemIndex) => itemIndex !== index) });
}
export function moveTableItem(document: DisplayDocument, elementId: string, index: number, offset: -1 | 1): DisplayDocument {
  const table = document.elements.find((element) => element.id === elementId && element.type === TABLE_TYPE) as TableElement | undefined;
  const nextIndex = index + offset;
  if (!table || index < 0 || nextIndex < 0 || nextIndex >= table.properties.items.length) return document;
  const items = [...table.properties.items]; [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  return updateTableProperties(document, elementId, { items });
}
function copyItem(item: TableDataItem): TableDataItem { return { binding: { ...item.binding }, ...(item.path ? { path: item.path } : {}), ...(item.description ? { description: item.description } : {}), ...(item.engineeringUnit ? { engineeringUnit: item.engineeringUnit } : {}), ...(item.pointType ? { pointType: item.pointType } : {}), ...(item.nameMode === 'custom' ? { nameMode: 'custom', customName: item.customName?.trim() || item.binding.pointName } : {}) }; }
