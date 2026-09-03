import React, { useEffect, useState } from 'react';
import type { PiPointValue } from '../../pi/piDataSource';
import type { PiPointBinding } from '../../pi/piPointBinding';
import {
  getValueVisualOptions,
  type ValueElement,
  type ValueVisualOptions,
} from '../createValue';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { evaluateMultistate, getMultistateColor } from '../multistate';
import { resolveThemeForeground } from '../themeColor';

type ValueLoadState =
  | { status: 'loading' }
  | { status: 'success'; result: PiPointValue }
  | { status: 'error'; result?: PiPointValue };

export interface ValueElementViewProps {
  element: ValueElement;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  runtimeState?: ValueRuntimeState;
  label?: string;
}

export const ValueElementView = React.memo(function ValueElementView({ element, loadValue, runtimeState, label }: ValueElementViewProps) {
  const [state, setState] = useState<ValueLoadState>({ status: 'loading' });
  const { binding } = element.properties;

  useEffect(() => {
    if (runtimeState) {
      return;
    }
    let active = true;
    setState({ status: 'loading' });

    (binding && loadValue ? loadValue(binding) : Promise.reject(new Error('Consulta PI indisponível')))
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
  }, [binding, binding?.dataSourceUid, binding?.serverPath, binding?.pointName, loadValue, runtimeState]);

  const visual = getValueVisualOptions(element.properties);
  const currentState = runtimeState ?? state;
  const isCalculation = !element.properties.binding && !!element.properties.calculationId;
  const lines = getValueLines(currentState, visual, label ?? binding?.pointName ?? '', isCalculation);
  const runtimeVal = getRuntimeValue(runtimeState ?? state);
  const textColor = getMultistateColor(runtimeVal, element.properties.multistate, resolveThemeForeground(visual.color));
  const bgColor = getMultistateColor(runtimeVal, element.properties.backgroundMultistate, visual.backgroundColor || 'transparent');
  const textX = getTextX(element, visual.textAlign);
  const textAnchor = visual.textAlign === 'left' ? 'start' : visual.textAlign === 'right' ? 'end' : 'middle';
  const responsiveFontSize = element.properties._piVisionPreserveFontSize === true
    ? visual.fontSize
    : getResponsiveFontSize(element, visual.fontSize, lines);
  const textBlink = evaluateMultistate(runtimeVal, element.properties.multistate)?.rule.blink === true;
  const bgBlink = evaluateMultistate(runtimeVal, element.properties.backgroundMultistate)?.rule.blink === true;
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
        rx={element.properties._piVisionSquareBackground === true ? 0 : 14}
        fill={bgColor}
        stroke="none"
        strokeWidth={0}
        data-testid={`value-background-${element.id}`}
        data-element-id={element.id}
        data-element-type={element.type}
        pointerEvents="all"
      >
        {bgBlink && <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <text
        x={textX}
        y={element.y + element.height / 2 - ((lines.length - 1) * responsiveFontSize * 0.6)}
        fill={textColor}
        fontSize={responsiveFontSize}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        data-testid={`display-value-${element.id}`}
        data-element-id={element.id}
        data-element-type={element.type}
        pointerEvents="none"
      >
        {textBlink && <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />}
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
  isCalculation = false
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
  if (visual.showTagName) {
    lines.push(label);
  }
  if (visual.showValue) {
    // PI Vision presents the engineering unit alongside the value instead of
    // consuming a separate line. This keeps the reading compact and prevents
    // the value/unit pair from appearing detached in small elements.
    lines.push(visual.showUnit && result?.unit ? `${valueText} ${result.unit}` : valueText);
  } else if (visual.showUnit && result?.unit) {
    lines.push(result.unit);
  }
  if (visual.showTimestamp) {
    if (result?.timestamp) {
      lines.push(formatTimestamp(result.timestamp));
    } else if (isCalculation && state.status !== 'loading') {
      lines.push(formatTimestamp(new Date().toISOString()));
    }
  }
  return lines.length > 0 ? lines : [''];
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}

export function formatValue(value: unknown, visual: ValueVisualOptions = getValueVisualOptions({})): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if ('Name' in rec && rec.Name !== undefined) return String(rec.Name);
    if ('name' in rec && rec.name !== undefined) return String(rec.name);
    if ('text' in rec && rec.text !== undefined) return String(rec.text);
    if ('Text' in rec && rec.Text !== undefined) return String(rec.Text);
    if ('State' in rec && rec.State !== undefined) return String(rec.State);
    if ('state' in rec && rec.state !== undefined) return String(rec.state);
    if ('Value' in rec && rec.Value !== undefined) return formatValue(rec.Value, visual);
    if ('value' in rec && rec.value !== undefined) return formatValue(rec.value, visual);
  }
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

/**
 * PI Vision lets the reading use the available area, but never lets it spill
 * out of the element.  The configured size remains the reference size; the
 * two fit limits only reduce it when the content would not fit.
 */
function getResponsiveFontSize(element: ValueElement, configuredSize: number, lines: readonly string[]): number {
  const horizontalPadding = 16;
  const verticalPadding = 12;
  const longestLineLength = Math.max(1, ...lines.map((line) => line.length));
  const lineCount = Math.max(1, lines.length);
  const areaScale = Math.sqrt((element.width * element.height) / (120 * 40));
  const preferredSize = configuredSize * Math.min(3, Math.max(0.55, areaScale));
  const widthLimit = Math.max(1, element.width - horizontalPadding) / (longestLineLength * 0.6);
  const heightLimit = Math.max(1, element.height - verticalPadding) / (lineCount * 1.2);

  return Math.max(8, Math.min(96, preferredSize, widthLimit, heightLimit));
}
