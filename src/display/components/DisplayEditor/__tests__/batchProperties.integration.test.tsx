import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createValue, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

beforeAll(() => {
  const w = window as unknown as { PointerEvent?: typeof MouseEvent; MouseEvent: typeof MouseEvent };
  if (typeof w.PointerEvent !== 'function') {
    w.PointerEvent = class FakePointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    } as unknown as typeof MouseEvent;
  }
});

const bindingA = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CDT158' };
const bindingB = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('DisplayEditor - propriedades em lote', () => {
  it('aplica uma propriedade visual a todos os Values selecionados pelo menu de contexto', () => {
    const initial = createDisplayDocument({ name: 'Lote' });
    initial.elements = [
      createValue({ id: 'value-a', binding: bindingA, x: 20, y: 20 }),
      createValue({ id: 'value-b', binding: bindingB, x: 180, y: 20 }),
    ];

    function Harness() {
      const [document, setDocument] = useState<DisplayDocument>(initial);
      return <><DisplayEditor document={document} onChange={setDocument} /><pre data-testid="document">{JSON.stringify(document)}</pre></>;
    }

    render(<Harness />);
    const valueA = screen.getByTestId('display-element-value-a');
    const valueB = screen.getByTestId('display-element-value-b');

    act(() => {
      fireEvent.pointerDown(valueA, { clientX: 30, clientY: 30, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 30, clientY: 30, pointerId: 1, button: 0 });
      fireEvent.pointerDown(valueB, { clientX: 190, clientY: 30, pointerId: 2, button: 0, ctrlKey: true });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 190, clientY: 30, pointerId: 2, button: 0, ctrlKey: true });
      fireEvent.contextMenu(valueA, { clientX: 30, clientY: 30 });
    });

    fireEvent.click(screen.getByText('Configurar elemento'));
    expect(screen.getByTestId('value-properties-panel')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('value-color'), { target: { value: '#000000' } });
    fireEvent.change(screen.getByTestId('value-link-url'), { target: { value: 'https://example.com/display' } });

    const updated = JSON.parse(screen.getByTestId('document').textContent ?? '{}') as DisplayDocument;
    expect(updated.elements.map((element) => (element.properties as { visual?: { color?: string } }).visual?.color)).toEqual(['#000000', '#000000']);
    expect(updated.elements.map((element) => (element.properties as { linkUrl?: string }).linkUrl)).toEqual([
      'https://example.com/display',
      'https://example.com/display',
    ]);
  });
});
