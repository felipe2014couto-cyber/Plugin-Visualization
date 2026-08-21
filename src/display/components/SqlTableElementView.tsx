import React, { useState } from 'react';
import { Modal } from '@grafana/ui';
import { SqlTableElement } from '../createSqlTable';
import { SqlResultTable, getDynamicStyles } from '../../components/SqlQuery/SqlResultTable';

interface SqlTableElementViewProps {
  element: SqlTableElement;
  selected?: boolean;
  editable?: boolean;
}

export function SqlTableElementView({ element, selected, editable }: SqlTableElementViewProps) {
  const styleObj = getDynamicStyles(element.properties);
  const [showPopup, setShowPopup] = useState(false);

  const handleDoubleClick = () => {
    if (!editable) {
      setShowPopup(true);
    }
  };

  return (
    <g data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }} transform={`translate(${element.x}, ${element.y})`}>
      <foreignObject x={0} y={0} width={element.width} height={element.height} onDoubleClick={handleDoubleClick}>
        <div style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          border: selected ? '2px solid var(--focus-ring)' : '1px solid var(--accent)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--sql-row-bg, var(--surface-primary))',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          ...styleObj
        }}>
          {(element.properties.showTitle ?? true) && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 12px',
              background: element.properties.titleTransparent ? 'transparent' : 'var(--sql-header-bg, var(--surface-elevated))',
              borderBottom: element.properties.titleTransparent ? 'none' : '1px solid var(--sql-border-color, var(--border-color))',
              color: 'var(--sql-text-color, var(--text-primary))',
              fontSize: `${element.properties.titleFontSize ?? 20}px`,
              fontWeight: 500,
              textAlign: element.properties.titleAlign ?? 'left',
              cursor: 'move',
            }}>
              <span>{element.properties.title || 'Resultado da consulta SIP'}</span>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <SqlResultTable result={element.properties.result ?? null} isLoading={false} properties={element.properties} />
          </div>
        </div>
      </foreignObject>
      {editable && (
        <rect x={0} y={0} width={element.width} height={element.height} fill="transparent" pointerEvents="all" data-element-id={element.id} data-element-type={element.type} />
      )}
      
      {showPopup && (
        <Modal 
          isOpen={true} 
          title={element.properties.title || 'Visualização Gráfica'} 
          onDismiss={() => setShowPopup(false)}
        >
          <div style={{ height: '70vh', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SqlResultTable result={element.properties.result ?? null} isLoading={false} properties={element.properties} />
          </div>
        </Modal>
      )}
    </g>
  );
}
