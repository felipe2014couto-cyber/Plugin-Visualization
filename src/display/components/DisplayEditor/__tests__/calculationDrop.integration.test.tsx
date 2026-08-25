import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  appendLibrarySymbol,
  appendDisplayElement,
  createDisplayDocument,
  createLibrarySymbol,
  createRectangle,
  createTrend,
  type DisplayDocument,
} from '../../../index';
import { CALCULATION_DRAG_MIME, serializeCalculationDragData } from '../../../../calculations/calculationDrag';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

function Harness({
  type = 'value',
  withExistingTrend = false,
  withExistingMotor = false,
  withExistingShape = false,
}: {
  type?: 'value' | 'trend';
  withExistingTrend?: boolean;
  withExistingMotor?: boolean;
  withExistingShape?: boolean;
}) {
  const [document, setDocument] = useState<DisplayDocument>(() => {
    let initial = createDisplayDocument({ name: 'Calculation drop' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    initial.calculations = [{ id: 'calculation-1', name: 'Teste Calc', expression: '1 + 1', inputs: [] }];
    if (withExistingTrend) {
      initial.elements = [createTrend({
        id: 'trend-1',
        surface: initial.surface,
        binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'SINUSOID' },
      })];
    }
    if (withExistingMotor) {
      initial = appendLibrarySymbol(initial, createLibrarySymbol({
        symbol: 'pims-vision:motores:01',
        id: 'library-symbol-drop',
        x: 100,
        y: 100,
      }));
    }
    if (withExistingShape) {
      initial = appendDisplayElement(initial, createRectangle({
        id: 'rectangle-drop',
        x: 100,
        y: 100,
      }));
    }
    return initial;
  });
  return <>
    <DisplayEditor document={document} onChange={setDocument} dropSymbolType={type} />
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

  it('adiciona cálculo a uma Trend que já possui uma PI Point', () => {
    render(<Harness type="trend" withExistingTrend />);
    const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
    jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
    });
    const dataTransfer = {
      types: [CALCULATION_DRAG_MIME], effectAllowed: 'copy', dropEffect: 'none',
      getData: (type: string) => type === CALCULATION_DRAG_MIME ? serializeCalculationDragData('calculation-1') : '',
    } as unknown as DataTransfer;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: 500 }, clientY: { value: 350 }, dataTransfer: { value: dataTransfer } });

    fireEvent(screen.getByTestId('display-editor-surface-wrapper'), event);

    const document = JSON.parse(screen.getByTestId('display-document-json').textContent ?? '{}');
    expect(document.elements).toHaveLength(1);
    expect(document.elements[0].properties.series).toHaveLength(2);
    expect(document.elements[0].properties.series[1]).toMatchObject({ calculationId: 'calculation-1', legendLabel: 'Teste Calc' });
  });

  it('vincula uma Tag de Cálculo solta sobre o motor e habilita o Multistate', () => {
    render(<Harness withExistingMotor />);
    const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
    jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
    });
    const dataTransfer = {
      types: [CALCULATION_DRAG_MIME], effectAllowed: 'copy', dropEffect: 'none',
      getData: (type: string) => type === CALCULATION_DRAG_MIME ? serializeCalculationDragData('calculation-1') : '',
    } as unknown as DataTransfer;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: 210 }, clientY: { value: 173 }, dataTransfer: { value: dataTransfer } });

    fireEvent(screen.getByTestId('display-editor-surface-wrapper'), event);

    expect(screen.getByTestId('library-symbol-properties-panel')).toBeInTheDocument();
    expect(screen.getByText('Cálculo: Teste Calc')).toBeInTheDocument();
    expect(screen.getByTestId('multistate-enabled')).toBeChecked();

    const document = JSON.parse(screen.getByTestId('display-document-json').textContent ?? '{}');
    expect(document.elements[0].properties.calculationId).toBe('calculation-1');
    expect(document.elements[0].properties.multistate.enabled).toBe(true);
  });

  it('vincula uma Tag de Cálculo solta sobre uma forma geométrica e habilita o Multistate', () => {
    render(<Harness withExistingShape />);
    const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
    jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
    });
    const dataTransfer = {
      types: [CALCULATION_DRAG_MIME], effectAllowed: 'copy', dropEffect: 'none',
      getData: (type: string) => type === CALCULATION_DRAG_MIME ? serializeCalculationDragData('calculation-1') : '',
    } as unknown as DataTransfer;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: 210 }, clientY: { value: 173 }, dataTransfer: { value: dataTransfer } });

    fireEvent(screen.getByTestId('display-editor-surface-wrapper'), event);

    expect(screen.getByTestId('rectangle-properties-panel')).toBeInTheDocument();
    expect(screen.getByText('Cálculo: Teste Calc')).toBeInTheDocument();
    expect(screen.getByTestId('multistate-enabled')).toBeChecked();

    const document = JSON.parse(screen.getByTestId('display-document-json').textContent ?? '{}');
    expect(document.elements[0].properties.calculationId).toBe('calculation-1');
    expect(document.elements[0].properties.multistate.enabled).toBe(true);
  });
});
