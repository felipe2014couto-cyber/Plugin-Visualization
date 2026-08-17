import React, { useEffect, useState } from 'react';
import type { PiPointValue } from '../../pi/piDataSource';
import type { PiPointBinding } from '../../pi/piPointBinding';
import {
  getValueVisualOptions,
  type ValueElement,
  type ValueVisualOptions,
} from '../createValue';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { getMultistateColor } from '../multistate';

type ValueLoadState =
  | { status: 'loading' }
  | { status: 'success'; result: PiPointValue }
  | { status: 'error'; result?: PiPointValue };

export interface ValueElementViewProps {
  element: ValueElement;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  runtimeState?: ValueRuntimeState;
}

export const ValueElementView = React.memo(function ValueElementView({ element, loadValue, runtimeState }: ValueElementViewProps) {
  const [state, setState] = useState<ValueLoadState>({ status: 'loading' });
  const { binding } = element.properties;

  useEffect(() => {
    if (runtimeState) {
      return;
    }
    let active = true;
    setState({ status: 'loading' });

    (loadValue ? loadValue(binding) : Promise.reject(new Error('Consulta PI indisponível')))
      .then((result) => {
        if (active) {
          setState({ status: 'success', result });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [binding, binding.dataSourceUid, binding.serverPath, binding.pointName, loadValue, runtimeState]);

  const visual = getValueVisualOptions(element.properties);
  const currentState = runtimeState ?? state;
  const lines = getValueLines(currentState, visual, binding.pointName);
  const color = getMultistateColor(getRuntimeValue(runtimeState ?? state), element.properties.multistate, visual.color);
  const textX = getTextX(element, visual.textAlign);
  const textAnchor = visual.textAlign === 'left' ? 'start' : visual.textAlign === 'right' ? 'end' : 'middle';
  const responsiveFontSize = getResponsiveFontSize(element, visual.fontSize);
  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: 'move' }}
    >
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={14}
        fill="var(--element-bg, rgba(255, 255, 255, 0.06))"
        stroke="var(--element-border, rgba(255, 255, 255, 0.35))"
        strokeWidth={1}
        data-element-id={element.id}
        data-element-type={element.type}
        pointerEvents="all"
      />
      <text
        x={textX}
        y={element.y + element.height / 2 - ((lines.length - 1) * responsiveFontSize * 0.6)}
        fill={color}
        fontSize={responsiveFontSize}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        data-testid={`display-value-${element.id}`}
        data-element-id={element.id}
        data-element-type={element.type}
        pointerEvents="none"
      >
        {lines.map((line, index) => <tspan key={`${line}-${index}`} x={textX} dy={index === 0 ? 0 : responsiveFontSize * 1.2}>{line}</tspan>)}
      </text>
    </g>
  );
});

function getRuntimeValue(state: ValueLoadState | ValueRuntimeState): unknown {
  return state.status === 'loading' ? undefined : state.result?.value;
}

function getValueLines(
  state: ValueLoadState | ValueRuntimeState,
  visual: ValueVisualOptions,
  pointName: string,
): string[] {
  let valueText: string;
  const result = state.status === 'loading' ? undefined : state.result;
  switch (state.status) {
    case 'loading':
      valueText = '...';
      break;
    case 'error':
      valueText = state.result ? formatValue(state.result.value, visual) : 'BAD';
      break;
    case 'success':
      valueText = formatValue(state.result.value, visual);
      break;
  }
  const lines: string[] = [];
  const label = visual.labelMode === 'custom' && visual.customLabel.trim() ? visual.customLabel : pointName;
  if (visual.showTagName && visual.showValue && !visual.showUnit && !visual.showTimestamp) {
    lines.push(`${label}: ${valueText}`);
    return lines;
  }
  if (visual.showTagName) {
    lines.push(label);
  }
  if (visual.showUnit && result?.unit) {
    lines.push(result.unit);
  }
  if (visual.showTimestamp && result?.timestamp) {
    lines.push(formatTimestamp(result.timestamp));
  }
  if (visual.showValue) {
    lines.push(valueText);
  }
  return lines.length > 0 ? lines : [''];
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}

export function formatValue(value: unknown, visual: ValueVisualOptions = getValueVisualOptions({})): string {
  return typeof value === 'number' && Number.isFinite(value) && visual.decimals !== null
    ? value.toFixed(visual.decimals)
    : String(value);
}

function getTextX(element: ValueElement, textAlign: ValueVisualOptions['textAlign']): number {
  switch (textAlign) {
    case 'left':
      return element.x + 8;
    case 'right':
      return element.x + element.width - 8;
    case 'center':
      return element.x + element.width / 2;
  }
}

function getResponsiveFontSize(element: ValueElement, configuredSize: number): number {
  const areaScale = Math.sqrt((element.width * element.height) / (240 * 100));
  return Math.max(8, Math.min(96, configuredSize * Math.min(1.5, Math.max(0.7, areaScale))));
}
