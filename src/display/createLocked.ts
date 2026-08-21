import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';

import { GROUP_TYPE } from './createGroup';

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

  const updateList = (list: readonly DisplayElement[]): DisplayElement[] => {
    return list.map((element) => {
      let current = element;
      if (targetIds.has(current.id)) {
        changed = true;
        current = {
          ...current,
          properties: {
            ...current.properties,
            locked,
          },
        };
      }
      if (current.type === GROUP_TYPE && Array.isArray((current.properties as { elements?: DisplayElement[] }).elements)) {
        const children = (current.properties as { elements: DisplayElement[] }).elements;
        const nextChildren = updateList(children);
        if (nextChildren !== children) {
          current = {
            ...current,
            properties: {
              ...current.properties,
              elements: nextChildren,
            },
          };
        }
      }
      return current;
    });
  };

  const elements = updateList(document.elements);
  return changed ? { ...document, elements } : document;
}
