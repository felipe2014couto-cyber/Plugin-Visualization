import React from 'react';
import type { ProgrammingElement } from '../display/createProgramming';
import type { ValueRuntimeState } from '../display/runtime/valueRuntime';
import { ProgrammingPreview } from './ProgrammingPreview';
import type { ProgrammingPiPointContext } from './ProgrammingTypes';

export interface ProgrammingDisplayElementViewProps {
  element: ProgrammingElement;
  runtimeStates: ReadonlyMap<string, ValueRuntimeState>;
  editable: boolean;
}

export function getProgrammingConsumerId(elementId: string, index: number): string {
  return `${elementId}:programming:${index}`;
}

export function ProgrammingDisplayElementView({ element, runtimeStates, editable }: ProgrammingDisplayElementViewProps) {
  const piPoints: ProgrammingPiPointContext[] = element.properties.query.flatMap((item, index) => {
    const state = runtimeStates.get(getProgrammingConsumerId(element.id, index));
    return [{
      name: item.name,
      value: state?.status === 'success' ? state.result.value : null,
      ...(state?.status === 'success' && state.result.timestamp ? { timestamp: state.result.timestamp } : {}),
      unit: state?.status === 'success' ? state.result.unit ?? item.unit : item.unit,
    }];
  });
  return (
    <g data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type}>
      <foreignObject
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        pointerEvents={editable ? 'none' : 'all'}
      >
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <ProgrammingPreview
            document={{
              type: 'programming',
              html: element.properties.html,
              css: element.properties.css,
              javascript: element.properties.javascript,
            }}
            piPoints={piPoints}
          />
        </div>
      </foreignObject>
      {editable && (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="transparent"
          data-element-id={element.id}
          data-element-type={element.type}
          pointerEvents="all"
          style={{ cursor: 'move' }}
        />
      )}
    </g>
  );
}
