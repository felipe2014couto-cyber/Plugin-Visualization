import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendLibrarySymbol, createDisplayDocument, createLibrarySymbol, type DisplayDocument } from '../../../index';
import { LIBRARY_SYMBOL_DRAG_MIME, serializeLibrarySymbolDragData } from '../../../../library';
import { INDUSTRIAL_SYMBOL_CATALOG } from '../../../../library/catalog';
import { DisplayEditor } from '../DisplayEditor';
import { createPiPointBinding } from '../../../../pi/piPointBinding';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from '../../../../pi/piPointDrag';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

function Harness() {
  const [document, setDocument] = useState<DisplayDocument>(() => {
    const initial = createDisplayDocument({ name: 'Library drop' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    return initial;
  });
  return <DisplayEditor document={document} onChange={setDocument} />;
}

function createDataTransfer(): DataTransfer {
  const symbol = INDUSTRIAL_SYMBOL_CATALOG[0];
  const payload = serializeLibrarySymbolDragData(symbol);
  return {
    types: [LIBRARY_SYMBOL_DRAG_MIME],
    effectAllowed: 'copy',
    dropEffect: 'none',
    getData: (type: string) => type === LIBRARY_SYMBOL_DRAG_MIME ? payload : '',
  } as unknown as DataTransfer;
}

const point: PiPointSearchResult = {
  name: 'MOTOR_01',
  path: '\\\\pims\\MOTOR_01',
  webId: 'motor-webid',
  dataSourceUid: 'pims-datasource',
};

describe('DisplayEditor - drop da Library', () => {
  it('aceita o dragover mesmo quando o navegador protege o payload', () => {
    render(<Harness />);
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    const dataTransfer = {
      types: [LIBRARY_SYMBOL_DRAG_MIME],
      effectAllowed: 'copy',
      dropEffect: 'none',
      getData: () => '',
    } as unknown as DataTransfer;
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

    fireEvent(wrapper, event);

    expect(event.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('insere o símbolo SVG local no canvas e registra no histórico', () => {
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
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    const dataTransfer = createDataTransfer();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: 500 },
      clientY: { value: 350 },
      dataTransfer: { value: dataTransfer },
    });

    fireEvent(wrapper, event);

    const element = screen.getByTestId(/^display-element-/);
    expect(element).toHaveAttribute('data-element-type', 'library-symbol');
    expect(element).toHaveAttribute('href', '/public/plugins/pims-vision-app/img/library-PT002A_Option1.svg');
    expect(screen.getByTestId('display-undo')).not.toBeDisabled();
  });

  it('abre propriedades pelo botão direito e aplica cor e Multistate ao símbolo', () => {
    const initial = createDisplayDocument({ name: 'Library properties' });
    const symbol = createLibrarySymbol({
      symbol: 'pims-vision:motores:01',
      id: 'library-symbol-01',
      binding: createPiPointBinding(point),
    });
    const document = appendLibrarySymbol(initial, symbol);
    function PropertiesHarness() {
      const [current, setCurrent] = useState(document);
      return <DisplayEditor document={current} onChange={setCurrent} />;
    }

    render(<PropertiesHarness />);
    fireEvent.contextMenu(screen.getByTestId('display-element-library-symbol-01'));

    expect(screen.getByTestId('library-symbol-properties-panel')).toBeInTheDocument();
    expect(screen.getByTestId('display-element-library-symbol-01')).toHaveAttribute('href', expect.stringContaining('?v=transparent-symbols-20260817'));
    fireEvent.click(screen.getByTestId('library-symbol-color'));
    fireEvent.change(screen.getByLabelText('Código hexadecimal'), { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByTestId('library-symbol-color'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));

    expect(screen.getByTestId('library-symbol-color-layer-library-symbol-01')).toHaveAttribute('fill', '#00ff00');
    expect(screen.getByTestId('multistate-properties')).toBeInTheDocument();
    expect(screen.getByTestId(/^multistate-rule-/)).toBeInTheDocument();
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') ?? '';
    fireEvent.click(screen.getByTestId(`multistate-color-${ruleId}`));
    fireEvent.click(screen.getByTestId(`multistate-color-${ruleId}-transparent`));
    expect(screen.getByTestId(`multistate-color-${ruleId}-transparent`)).toBeChecked();
    fireEvent.click(screen.getByTestId('library-symbol-color'));
    fireEvent.click(screen.getByTestId('library-symbol-color-transparent'));
    expect(screen.getByTestId('library-symbol-color-transparent')).toBeChecked();
    expect(screen.getByTestId('library-symbol-color-layer-library-symbol-01')).toHaveAttribute('fill', 'transparent');
  });

  it('vincula uma Tag solta sobre o motor e habilita o Multistate', () => {
    const initial = createDisplayDocument({ name: 'Library PI Point drop' });
    const symbol = createLibrarySymbol({ symbol: 'pims-vision:motores:01', id: 'library-symbol-drop', x: 100, y: 100 });
    const document = appendLibrarySymbol(initial, symbol);
    function BindingHarness() {
      const [current, setCurrent] = useState(document);
      return <DisplayEditor document={current} onChange={setCurrent} />;
    }

    render(<BindingHarness />);
    const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
    jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 1300,
      bottom: 750,
      width: 1200,
      height: 700,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    const dataTransfer = {
      types: [PI_POINT_DRAG_MIME],
      effectAllowed: 'copy',
      dropEffect: 'none',
      getData: (type: string) => type === PI_POINT_DRAG_MIME ? serializePiPointDragData(point) : '',
    } as unknown as DataTransfer;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: 210 },
      clientY: { value: 173 },
      dataTransfer: { value: dataTransfer },
    });

    fireEvent(wrapper, event);

    expect(screen.getByTestId('library-symbol-properties-panel')).toBeInTheDocument();
    expect(screen.getByText('PI Point: MOTOR_01')).toBeInTheDocument();
    expect(screen.getByTestId('multistate-enabled')).toBeChecked();
  });
});
