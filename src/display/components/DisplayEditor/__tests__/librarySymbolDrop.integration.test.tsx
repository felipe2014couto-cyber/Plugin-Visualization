import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, type DisplayDocument } from '../../../index';
import { LIBRARY_SYMBOL_DRAG_MIME, serializeLibrarySymbolDragData } from '../../../../library';
import { INDUSTRIAL_SYMBOL_CATALOG } from '../../../../library/catalog';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

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
});
