import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';

export function isElementLocked(element?: DisplayElement | null): boolean {
  if (!element) {
    return false;
  }
  return Boolean((element.properties as { locked?: boolean })?.locked);
}

export function updateElementLocked(
  document: DisplayDocument,
  elementIds: string | string[],
  locked: boolean,
): DisplayDocument {
  const targetIds = Array.isArray(elementIds) ? new Set(elementIds) : new Set([elementIds]);
  let changed = false;
  const elements = document.elements.map((element) => {
    if (targetIds.has(element.id)) {
      changed = true;
      return {
        ...element,
        properties: {
          ...element.properties,
          locked,
        },
      };
    }
    return element;
  });
  return changed ? { ...document, elements } : document;
}
