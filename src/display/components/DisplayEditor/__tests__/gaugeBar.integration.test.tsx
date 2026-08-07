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
  it('insere Gauge ligado, edita escala e restaura com Undo/Redo', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-gauge'));
    const gauge = screen.getByTestId(/^display-element-/);
    const id = gauge.getAttribute('data-element-id') as string;
    expect(screen.getByTestId('gauge-properties-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('gauge-maximum'), { target: { value: '200' } });
    expect(screen.getByTestId(`gauge-value-${id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-undo'));
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
  });

  it('insere Bar, persiste orientação e mantém seleção, movimento e remoção genéricos', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-bar'));
    const bar = screen.getByTestId(/^display-element-/);
    const id = bar.getAttribute('data-element-id') as string;
    expect(screen.getByTestId('bar-properties-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('bar-orientation'), { target: { value: 'horizontal' } });
    expect(screen.getByTestId(`display-element-${id}`)).toHaveAttribute('data-element-type', 'bar');
    fireEvent.keyDown(screen.getByTestId('display-surface'), { key: 'Delete' });
    expect(screen.queryByTestId(`display-element-${id}`)).toBeNull();
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
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
