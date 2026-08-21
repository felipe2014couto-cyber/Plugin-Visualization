import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createGauge, createBar, appendGauge, appendBar, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

const selectedPiPoint: PiPointSearchResult = {
  name: 'SINUSOID',
  path: '\\\\pims\\SINUSOID',
  webId: 'point-webid',
  dataSourceUid: 'ds',
};

function Harness({ initial }: { initial?: DisplayDocument }) {
  const [document, setDocument] = useState<DisplayDocument>(() => initial ?? createDisplayDocument({ name: 'Scale' }));
  return <DisplayEditor document={document} onChange={setDocument} selectedPiPoint={selectedPiPoint} />;
}

describe('DisplayEditor - Gauge e Bar', () => {
  it('alterna o modo de símbolo para Gauge ao clicar no botão da barra de ferramentas', () => {
    let currentType: string | undefined;
    render(<DisplayEditor document={createDisplayDocument()} onDropSymbolTypeChange={(t) => { currentType = t; }} />);
    fireEvent.click(screen.getByTestId('display-insert-gauge'));
    expect(currentType).toBe('gauge');
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
  });

  it('edita escala de Gauge ligado e restaura com Undo/Redo', () => {
    const initial = appendGauge(createDisplayDocument({ name: 'Scale' }), createGauge({
      id: 'gauge-1',
      binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' },
    }));
    render(<Harness initial={initial} />);
    fireEvent.pointerDown(screen.getByTestId('display-element-gauge-1'));
    expect(screen.getByTestId('gauge-properties-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('gauge-maximum'), { target: { value: '200' } });
    expect(screen.getByTestId('gauge-value-gauge-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-undo'));
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId('display-element-gauge-1')).toBeInTheDocument();
  });

  it('persiste orientação de Bar e mantém seleção, movimento e remoção genéricos', () => {
    const initial = appendBar(createDisplayDocument({ name: 'Scale' }), createBar({
      id: 'bar-1',
      binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' },
    }));
    render(<Harness initial={initial} />);
    fireEvent.pointerDown(screen.getByTestId('display-element-bar-1'));
    expect(screen.getByTestId('bar-properties-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('bar-orientation'), { target: { value: 'horizontal' } });
    expect(screen.getByTestId('display-element-bar-1')).toHaveAttribute('data-element-type', 'bar');
    fireEvent.keyDown(screen.getByTestId('display-surface'), { key: 'Delete' });
    expect(screen.queryByTestId('display-element-bar-1')).toBeNull();
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId('display-element-bar-1')).toBeInTheDocument();
  });

  it('renderiza Gauge e Bar sem binding como placeholders e sem loader', () => {
    const base = createDisplayDocument();
    const document = appendBar(appendGauge(base, createGauge({ id: 'empty-gauge' })), createBar({ id: 'empty-bar' }));
    const loadValues = jest.fn(async () => ({}));
    render(<DisplayEditor document={document} loadValues={loadValues} />);
    expect(screen.getByTestId('gauge-value-empty-gauge')).toHaveTextContent('Sem tag');
    expect(screen.getByTestId('bar-value-empty-bar')).toHaveTextContent('Sem tag');
    expect(loadValues).not.toHaveBeenCalled();
  });
});
