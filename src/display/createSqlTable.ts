import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import type { OracleQueryResponse } from '../components/SqlQuery/oracleApi';

export const SQL_TABLE_TYPE = 'sql-table' as const;

export interface SqlTableProperties extends Record<string, unknown> {
  sql: string;
  result?: OracleQueryResponse | null;
  style?: 'dark' | 'light' | 'striped' | 'custom';
  viewMode?: 'table' | 'xy' | 'timeseries';
  xAxis?: string;
  yAxes?: string[];
  fontSize?: number;
  customHeaderColor?: string;
  customRowColor?: string;
  customTextColor?: string;
  customBorderColor?: string;
  showTitle?: boolean;
  title?: string;
  titleTransparent?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
  titleFontSize?: number;
  dotSize?: number;
  showTrendMarker?: boolean;
  paginationSize?: number;
}

export type SqlTableElement = DisplayElement<typeof SQL_TABLE_TYPE, SqlTableProperties>;

export interface CreateSqlTableOptions {
  sql: string;
  result?: OracleQueryResponse | null;
  style?: 'dark' | 'light' | 'striped' | 'custom';
  viewMode?: 'table' | 'xy' | 'timeseries';
  xAxis?: string;
  yAxes?: string[];
  fontSize?: number;
  customHeaderColor?: string;
  customRowColor?: string;
  customTextColor?: string;
  customBorderColor?: string;
  showTitle?: boolean;
  title?: string;
  titleTransparent?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
  titleFontSize?: number;
  dotSize?: number;
  showTrendMarker?: boolean;
  paginationSize?: number;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 480;

export function createSqlTable(options: CreateSqlTableOptions): SqlTableElement {
  const width = Math.max(1, Math.min(options.width ?? DEFAULT_WIDTH, options.surface?.width ?? DEFAULT_WIDTH));
  const height = Math.max(1, Math.min(options.height ?? DEFAULT_HEIGHT, options.surface?.height ?? DEFAULT_HEIGHT));
  const ids = new Set(options.existingIds ?? []);
  const make = options.generateId ?? generateId;
  let id = options.id ?? make();
  
  while (ids.has(id)) {
    id = make();
  }

  return {
    id,
    type: SQL_TABLE_TYPE,
    x: options.x ?? Math.max(0, ((options.surface?.width ?? width) - width) / 2),
    y: options.y ?? Math.max(0, ((options.surface?.height ?? height) - height) / 2),
    width,
    height,
    properties: {
      sql: options.sql,
      result: options.result,
      style: options.style ?? 'dark',
      viewMode: options.viewMode ?? 'table',
      xAxis: options.xAxis,
      yAxes: options.yAxes,
      fontSize: options.fontSize ?? 20,
      customHeaderColor: options.customHeaderColor,
      customRowColor: options.customRowColor,
      customTextColor: options.customTextColor,
      customBorderColor: options.customBorderColor,
      showTitle: options.showTitle ?? true,
      title: options.title,
      titleTransparent: options.titleTransparent ?? false,
      titleAlign: options.titleAlign ?? 'left',
      titleFontSize: options.titleFontSize ?? 20,
      dotSize: options.dotSize ?? 3,
      showTrendMarker: options.showTrendMarker ?? false,
      paginationSize: options.paginationSize,
    },
  };
}

export function appendSqlTable(document: DisplayDocument, element: SqlTableElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}
