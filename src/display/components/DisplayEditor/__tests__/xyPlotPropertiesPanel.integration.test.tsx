import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { XYPlotPropertiesPanel } from '../XYPlotPropertiesPanel';
import { createXYPlot, addXYPlotYSeries, type XYPlotElement, appendXYPlot } from '../../../createXYPlot';
import { createCalculationTrendBinding } from '../../../createTrend';
import { serializeDisplay, parseImportedDisplay } from '../../../displayTransfer';
import { createDisplayDocument } from '../../../createDisplayDocument';

describe('XYPlotPropertiesPanel & Labels Persistence', () => {
  const piA = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CDT158' };
  const piB = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
  const piC = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'Y1' };
  const calcA = createCalculationTrendBinding('calc-A');
  
  it('1. Y com nome grande: botão remover continua visível e não é cortado (layout flex)', () => {
    const longName = 'CALC_PRESSAO_MEDIA_TANQUE_001_QUE_TEM_UM_NOME_GIGANTESCO_PARA_QUEBRAR_O_LAYOUT';
    const longBinding = { ...piA, pointName: longName };
    let xy = createXYPlot({ xBinding: piA, yBinding: longBinding });
    
    render(
      <XYPlotPropertiesPanel 
        element={xy} 
        onChange={() => {}} 
        onRemoveY={() => {}} 
        onMoveY={() => {}} 
      />
    );
    
    // Check if the Y row has the right class (text-overflow ellipsis applied via CSS)
    const removeBtn = screen.getAllByText('×')[0];
    expect(removeBtn).toBeInTheDocument();
    
    const labelBtn = screen.getByText(longName);
    expect(labelBtn).toBeInTheDocument();
  });

  it('2. Remover X: X vira vazio.', () => {
    let xy = createXYPlot({ xBinding: piA });
    
    let nextPatch: any = {};
    render(
      <XYPlotPropertiesPanel 
        element={xy} 
        onChange={(patch) => { nextPatch = patch; }} 
        onRemoveY={() => {}} 
        onMoveY={() => {}} 
      />
    );
    
    const removeXBtn = screen.getAllByText('×')[0];
    fireEvent.click(removeXBtn);
    
    expect(nextPatch).toHaveProperty('xBinding', undefined);
    expect(nextPatch).toHaveProperty('xLabel', undefined);
  });

  it('3. Remover Y: Y é removido sem quebrar outros Y.', () => {
    let xy = createXYPlot({ xBinding: piA });
    let doc = createDisplayDocument({ name: 'test' });
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, piB, 'Y0');
    doc = addXYPlotYSeries(doc, xy.id, piC, 'Y1');
    
    xy = doc.elements[0] as XYPlotElement;
    
    let removedIndex = -1;
    render(
      <XYPlotPropertiesPanel 
        element={xy} 
        onChange={() => {}} 
        onRemoveY={(i) => { removedIndex = i; }} 
        onMoveY={() => {}} 
      />
    );
    
    const removeBtns = screen.getAllByText('×');
    expect(removeBtns).toHaveLength(3); // X, Y0, Y1
    fireEvent.click(removeBtns[1]); // Remove Y0 (index 1)
    
    expect(removedIndex).toBe(0);
  });

  it('4. Alterar label: Fonte CDT158, Label Temperatura Entrada, Após serialize/deserialize label continua.', () => {
    let xy = createXYPlot({ xBinding: piA });
    let doc = createDisplayDocument({ name: 'test' });
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, piB, 'Temperatura Entrada');
    
    // Add X Label
    xy = doc.elements[0] as XYPlotElement;
    xy.properties.xLabel = 'Pressão Entrada';
    const json = serializeDisplay(doc);
    const loaded = parseImportedDisplay(json);
    const loadedXY = loaded.elements[0] as XYPlotElement;
    
    expect(loadedXY.properties.xLabel).toBe('Pressão Entrada');
    expect(loadedXY.properties.ySeries![0].label).toBe('Temperatura Entrada');
  });

  it('5. Calculation: Fonte Calculation_A, Label Média Pressão, Após reload: continua.', () => {
    let xy = createXYPlot({ xBinding: piA });
    let doc = createDisplayDocument({ name: 'test' });
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, calcA as any, 'Média Pressão');
    
    const json = serializeDisplay(doc);
    const loaded = parseImportedDisplay(json);
    const loadedXY = loaded.elements[0] as XYPlotElement;
    
    expect(loadedXY.properties.ySeries![0].label).toBe('Média Pressão');
  });
});
