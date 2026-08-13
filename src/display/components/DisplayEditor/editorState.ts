import type { ElementGeometry, Point, ResizeHandle } from './editorGeometry';

export type EditorInteraction =
  | { kind: 'idle' }
  | {
      kind: 'dragging';
      elementId: string;
      startPointer: Point;
      originalGeometry: ElementGeometry;
      originalGeometries: Record<string, ElementGeometry>;
    }
  | {
      kind: 'resizing';
      elementId: string;
      handle: ResizeHandle;
      startPointer: Point;
      originalGeometry: ElementGeometry;
    };

export interface EditorState {
  selectedElementId: string | null;
  selectedElementIds: string[];
  interaction: EditorInteraction;
}

export const initialEditorState: EditorState = {
  selectedElementId: null,
  selectedElementIds: [],
  interaction: { kind: 'idle' },
};

export type EditorAction =
  | { type: 'SELECT'; elementId: string | null }
  | { type: 'SELECT_MANY'; elementIds: string[]; additive?: boolean }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'START_DRAG'; elementId: string; pointer: Point; originalGeometry: ElementGeometry; originalGeometries?: Record<string, ElementGeometry> }
  | {
      type: 'START_RESIZE';
      elementId: string;
      handle: ResizeHandle;
      pointer: Point;
      originalGeometry: ElementGeometry;
    }
  | { type: 'END_INTERACTION' };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'CLEAR_SELECTION':
      return { selectedElementId: null, selectedElementIds: [], interaction: { kind: 'idle' } };
    case 'SELECT':
      if (state.interaction.kind !== 'idle') {
        return state;
      }
      return { ...state, selectedElementId: action.elementId, selectedElementIds: action.elementId ? [action.elementId] : [] };
    case 'SELECT_MANY': {
      const ids = action.additive
        ? [...new Set([...state.selectedElementIds, ...action.elementIds])]
        : action.elementIds;
      return { ...state, selectedElementIds: ids, selectedElementId: ids[ids.length - 1] ?? null };
    }
    case 'START_DRAG':
      return {
        selectedElementId: action.elementId,
        selectedElementIds: state.selectedElementIds.includes(action.elementId) ? state.selectedElementIds : [action.elementId],
        interaction: {
          kind: 'dragging',
          elementId: action.elementId,
          startPointer: action.pointer,
          originalGeometry: action.originalGeometry,
          originalGeometries: action.originalGeometries ?? { [action.elementId]: action.originalGeometry },
        },
      };
    case 'START_RESIZE':
      return {
        selectedElementId: action.elementId,
        selectedElementIds: [action.elementId],
        interaction: {
          kind: 'resizing',
          elementId: action.elementId,
          handle: action.handle,
          startPointer: action.pointer,
          originalGeometry: action.originalGeometry,
        },
      };
    case 'END_INTERACTION':
      if (state.interaction.kind === 'idle') {
        return state;
      }
      return { ...state, interaction: { kind: 'idle' } };
  }
}
