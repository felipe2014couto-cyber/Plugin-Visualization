import type { PiPointSearchResult } from './piDataSource';

export const PI_POINT_DRAG_MIME = 'application/x-pims-vision-pi-point';

export function serializePiPointDragData(result: PiPointSearchResult): string {
  return JSON.stringify(result);
}

export function parsePiPointDragData(value: string): PiPointSearchResult | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    const candidate = parsed as Partial<PiPointSearchResult>;
    if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
      return undefined;
    }
    return {
      name: candidate.name,
      ...(typeof candidate.webId === 'string' ? { webId: candidate.webId } : {}),
      ...(typeof candidate.path === 'string' ? { path: candidate.path } : {}),
      ...(typeof candidate.dataSourceUid === 'string' ? { dataSourceUid: candidate.dataSourceUid } : {}),
    };
  } catch {
    return undefined;
  }
}
