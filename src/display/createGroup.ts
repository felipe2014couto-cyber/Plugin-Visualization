import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { ElementGeometry } from './components/DisplayEditor/editorGeometry';
import { generateId } from './ids';
import { TEXT_TYPE, type TextElement } from './createText';

export const GROUP_TYPE = 'group' as const;

export interface GroupProperties extends Record<string, unknown> {
  elements: DisplayElement[];
  rotation?: number;
  name?: string;
}

export type GroupElement = DisplayElement<typeof GROUP_TYPE, GroupProperties>;

export interface CreateGroupOptions {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  elements: DisplayElement[];
  rotation?: number;
  name?: string;
}

export function createGroup(options: CreateGroupOptions): GroupElement {
  const children = options.elements;
  let minX = options.x ?? (children.length > 0 ? Math.min(...children.map((c) => c.x)) : 0);
  let minY = options.y ?? (children.length > 0 ? Math.min(...children.map((c) => c.y)) : 0);
  let maxX = options.width !== undefined ? minX + options.width : (children.length > 0 ? Math.max(...children.map((c) => c.x + c.width)) : 100);
  let maxY = options.height !== undefined ? minY + options.height : (children.length > 0 ? Math.max(...children.map((c) => c.y + c.height)) : 100);

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    id: options.id ?? generateId(),
    type: GROUP_TYPE,
    x: minX,
    y: minY,
    width,
    height,
    properties: {
      elements: children,
      rotation: options.rotation ?? 0,
      ...(options.name ? { name: options.name } : {}),
    },
  };
}

export function groupElements(
  document: DisplayDocument,
  elementIds: string[],
): { document: DisplayDocument; group: GroupElement } | null {
  if (elementIds.length < 2) {
    return null;
  }

  const idSet = new Set(elementIds);
  const selectedElements = document.elements.filter((el) => idSet.has(el.id));
  if (selectedElements.length < 2) {
    return null;
  }

  const minX = Math.min(...selectedElements.map((el) => el.x));
  const minY = Math.min(...selectedElements.map((el) => el.y));
  const maxX = Math.max(...selectedElements.map((el) => el.x + el.width));
  const maxY = Math.max(...selectedElements.map((el) => el.y + el.height));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  // Positions relative to group bounding box
  const relativeChildren: DisplayElement[] = selectedElements.map((el) => ({
    ...el,
    x: el.x - minX,
    y: el.y - minY,
  }));

  const existingIds = new Set(document.elements.map((el) => el.id));
  let groupId = generateId();
  while (existingIds.has(groupId)) {
    groupId = generateId();
  }

  const group: GroupElement = {
    id: groupId,
    type: GROUP_TYPE,
    x: minX,
    y: minY,
    width,
    height,
    properties: {
      elements: relativeChildren,
      rotation: 0,
    },
  };

  // Find index of first selected element to place group at the same z-order position
  const firstIndex = document.elements.findIndex((el) => idSet.has(el.id));
  const newElements: DisplayElement[] = [];

  for (let i = 0; i < document.elements.length; i++) {
    const el = document.elements[i];
    if (i === firstIndex) {
      newElements.push(group);
    }
    if (!idSet.has(el.id)) {
      newElements.push(el);
    }
  }

  return {
    document: {
      ...document,
      elements: newElements,
    },
    group,
  };
}

export function ungroupElements(
  document: DisplayDocument,
  groupId: string,
): { document: DisplayDocument; unpackedIds: string[] } | null {
  const groupIndex = document.elements.findIndex((el) => el.id === groupId && el.type === GROUP_TYPE);
  if (groupIndex === -1) {
    return null;
  }

  const group = document.elements[groupIndex] as GroupElement;
  const children = group.properties.elements ?? [];
  if (children.length === 0) {
    return {
      document: {
        ...document,
        elements: document.elements.filter((el) => el.id !== groupId),
      },
      unpackedIds: [],
    };
  }

  // Restore absolute coordinates
  const absoluteChildren: DisplayElement[] = children.map((child) => ({
    ...child,
    x: group.x + child.x,
    y: group.y + child.y,
  }));

  const newElements = [
    ...document.elements.slice(0, groupIndex),
    ...absoluteChildren,
    ...document.elements.slice(groupIndex + 1),
  ];

  return {
    document: {
      ...document,
      elements: newElements,
    },
    unpackedIds: absoluteChildren.map((child) => child.id),
  };
}

export function scaleGroupChildren(
  elements: DisplayElement[],
  scaleX: number,
  scaleY: number,
): DisplayElement[] {
  return elements.map((child) => {
    const nextX = Math.round(child.x * scaleX);
    const nextY = Math.round(child.y * scaleY);
    const nextWidth = Math.max(1, Math.round(child.width * scaleX));
    const nextHeight = Math.max(1, Math.round(child.height * scaleY));

    if (child.type === TEXT_TYPE) {
      const textChild = child as TextElement;
      const baseFontSize = textChild.properties.fontSize ?? 24;
      const fontScale = Math.min(scaleX, scaleY);
      const nextFontSize = Math.max(6, Math.min(240, Math.round(baseFontSize * fontScale)));
      return {
        ...textChild,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        properties: {
          ...textChild.properties,
          fontSize: nextFontSize,
        },
      };
    }

    if (child.type === GROUP_TYPE) {
      const groupChild = child as GroupElement;
      return {
        ...groupChild,
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        properties: {
          ...groupChild.properties,
          elements: scaleGroupChildren(groupChild.properties.elements ?? [], scaleX, scaleY),
        },
      };
    }

    return {
      ...child,
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    };
  });
}

export function resizeGroup(
  group: GroupElement,
  newGeometry: ElementGeometry,
  originalGeometry: ElementGeometry,
  originalProperties?: GroupProperties,
): GroupElement {
  const baseElements = originalProperties?.elements ?? group.properties.elements ?? [];
  const scaleX = newGeometry.width / Math.max(1, originalGeometry.width);
  const scaleY = newGeometry.height / Math.max(1, originalGeometry.height);

  const scaledElements = scaleGroupChildren(baseElements, scaleX, scaleY);

  return {
    ...group,
    x: newGeometry.x,
    y: newGeometry.y,
    width: newGeometry.width,
    height: newGeometry.height,
    properties: {
      ...group.properties,
      elements: scaledElements,
    },
  };
}

export function updateGroupProperties(
  document: DisplayDocument,
  groupId: string,
  patch: Partial<GroupProperties>,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((el) => {
    if (el.id === groupId && el.type === GROUP_TYPE) {
      changed = true;
      return {
        ...el,
        properties: {
          ...el.properties,
          ...patch,
        },
      } as GroupElement;
    }
    return el;
  });

  return changed ? { ...document, elements } : document;
}

export function extractAllGroupBindingsAndElements(
  elements: readonly DisplayElement[],
): DisplayElement[] {
  const result: DisplayElement[] = [];
  for (const el of elements) {
    result.push(el);
    if (el.type === GROUP_TYPE) {
      const group = el as GroupElement;
      result.push(...extractAllGroupBindingsAndElements(group.properties.elements ?? []));
    }
  }
  return result;
}

export function findTopLevelElementId(
  elements: readonly DisplayElement[],
  elementId: string,
): string | undefined {
  for (const element of elements) {
    if (element.id === elementId) {
      return element.id;
    }
    if (element.type === GROUP_TYPE) {
      const group = element as GroupElement;
      if (containsElementId(group.properties.elements ?? [], elementId)) {
        return group.id;
      }
    }
  }
  return undefined;
}

function containsElementId(elements: readonly DisplayElement[], id: string): boolean {
  for (const el of elements) {
    if (el.id === id) return true;
    if (el.type === GROUP_TYPE) {
      if (containsElementId((el as GroupElement).properties.elements ?? [], id)) return true;
    }
  }
  return false;
}
