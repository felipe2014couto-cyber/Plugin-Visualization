import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, type DisplayDocument } from '../../../index';
import { CALCULATION_DRAG_MIME, serializeCalculationDragData } from '../../../../calculations/calculationDrag';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

function Harness() {
  const [document, setDocument] = useState<DisplayDocument>(() => {
    const initial = createDisplayDocument({ name: 'Calculation drop' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    initial.calculations = [{ id: 'calculation-1', name: 'Teste', expression: '1 + 1', inputs: [] }];
    return initial;
  });
  return <>
    <DisplayEditor document={document} onChange={setDocument} />
    <output data-testid="display-document-json">{JSON.stringify(document)}</output>
  </>;
}

describe('DisplayEditor - drop de cálculo', () => {
  it('cria o elemento de cálculo na posição solta', () => {
    render(<Harness />);
    const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
    jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    const dataTransfer = {
      types: [CALCULATION_DRAG_MIME],
      effectAllowed: 'copy',
      dropEffect: 'none',
      getData: (type: string) => type === CALCULATION_DRAG_MIME ? serializeCalculationDragData('calculation-1') : '',
    } as unknown as DataTransfer;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: 500 },
      clientY: { value: 350 },
      dataTransfer: { value: dataTransfer },
    });

    fireEvent(screen.getByTestId('display-editor-surface-wrapper'), event);

    const document = JSON.parse(screen.getByTestId('display-document-json').textContent ?? '{}');
    expect(document.elements).toHaveLength(1);
    expect(document.elements[0].type).toBe('value');
    expect(document.elements[0].properties.calculationId).toBe('calculation-1');
  });
});
