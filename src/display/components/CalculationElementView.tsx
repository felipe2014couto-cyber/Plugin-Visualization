import React from 'react';
import { getValueVisualOptions, type ValueVisualOptions } from '../createValue';
import type { CalculationElement } from '../createCalculation';
import type { CalculationEvaluation } from '../../calculations/calculationEngine';
import { formatValue } from './ValueElementView';

export interface CalculationElementViewProps {
  element: CalculationElement;
  calculationName: string;
  evaluation: CalculationEvaluation;
}

export function CalculationElementView({ element, calculationName, evaluation }: CalculationElementViewProps) {
  const visual = getValueVisualOptions(element.properties);
  const lines = getLines(evaluation, visual, calculationName);
  const textX = visual.textAlign === 'left' ? element.x + 8 : visual.textAlign === 'right' ? element.x + element.width - 8 : element.x + element.width / 2;
  const textAnchor = visual.textAlign === 'left' ? 'start' : visual.textAlign === 'right' ? 'end' : 'middle';
  const fontSize = Math.max(8, Math.min(96, visual.fontSize * Math.min(1.5, Math.max(0.7, Math.sqrt((element.width * element.height) / (240 * 100))))));
  return (
    <g data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }}>
      <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={14} fill="var(--element-bg, rgba(255, 255, 255, 0.06))" stroke="var(--element-border, rgba(255, 255, 255, 0.35))" strokeWidth={1} pointerEvents="all" />
      <text x={textX} y={element.y + element.height / 2 - ((lines.length - 1) * fontSize * 0.6)} fill={visual.color} fontSize={fontSize} textAnchor={textAnchor} dominantBaseline="middle" data-testid={`display-calculation-${element.id}`} pointerEvents="none">
        {lines.map((line, index) => <tspan key={`${line}-${index}`} x={textX} dy={index === 0 ? 0 : fontSize * 1.2}>{line}</tspan>)}
      </text>
    </g>
  );
}

function getLines(evaluation: CalculationEvaluation, visual: ValueVisualOptions, name: string): string[] {
  const value = evaluation.status === 'loading' ? '...' : evaluation.status === 'error' ? 'BAD' : formatValue(evaluation.value, visual);
  const lines: string[] = [];
  if (visual.showTagName) {
    lines.push(visual.labelMode === 'custom' && visual.customLabel.trim() ? visual.customLabel : name);
  }
  if (visual.showValue) {
    lines.push(value);
  }
  return lines.length > 0 ? lines : [''];
}
