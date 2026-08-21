import React, { useState } from 'react';

export interface TrendLegendResizeHandleProps {
  x: number;
  y: number;
  height: number;
  testId?: string;
  isResizing?: boolean;
  onPointerDown: (event: React.PointerEvent<SVGLineElement>) => void;
  onPointerMove?: (event: React.PointerEvent<SVGLineElement>) => void;
  onPointerUp?: (event: React.PointerEvent<SVGLineElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<SVGLineElement>) => void;
}

export function TrendLegendResizeHandle({
  x,
  y,
  height,
  testId,
  isResizing = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: TrendLegendResizeHandleProps) {
  const [isHovered, setIsHovered] = useState(false);

  const strokeColor = isResizing || isHovered
    ? 'var(--accent, #6e9fff)'
    : 'var(--border-subtle, rgba(255, 255, 255, 0.18))';
  const strokeWidth = isResizing || isHovered ? 2 : 1;

  return (
    <g data-testid={testId ? `${testId}-group` : undefined}>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + height}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + height}
        stroke="transparent"
        strokeWidth={10}
        style={{ cursor: 'col-resize' }}
        data-testid={testId}
        aria-label="Redimensionar legenda"
        pointerEvents="all"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      />
    </g>
  );
}
