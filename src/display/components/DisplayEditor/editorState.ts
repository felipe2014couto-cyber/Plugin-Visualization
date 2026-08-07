import type { ElementGeometry, Point, ResizeHandle } from './editorGeometry';

export type EditorInteraction =
  | { kind: 'idle' }
  | {
      kind: 'dragging';
      elementId: string;
      startPointer: Point;
      originalGeometry: ElementGeometry;
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
  interaction: EditorInteraction;
}

export const initialEditorState: EditorState = {
  selectedElementId: null,
  interaction: { kind: 'idle' },
};

export type EditorAction =
  | { type: 'SELECT'; elementId: string | null }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'START_DRAG'; elementId: string; pointer: Point; originalGeometry: ElementGeometry }
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
      return { selectedElementId: null, interaction: { kind: 'idle' } };
    case 'SELECT':
      if (state.interaction.kind !== 'idle') {
        return state;
      }
      return { ...state, selectedElementId: action.elementId };
    case 'START_DRAG':
      return {
        selectedElementId: action.elementId,
        interaction: {
          kind: 'dragging',
          elementId: action.elementId,
          startPointer: action.pointer,
          originalGeometry: action.originalGeometry,
        },
      };
    case 'START_RESIZE':
      return {
        selectedElementId: action.elementId,
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
