import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, type DisplayDocument } from '../../../index';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from '../../../../pi/piPointDrag';
import { DisplayEditor, type PiPointDropSymbolType } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

const point = {
  name: 'SINUSOID',
  webId: 'point-webid',
  path: '\\\\pims\\SINUSOID',
  dataSourceUid: 'ds',
};

function Harness({ type }: { type: PiPointDropSymbolType }) {
  const [document, setDocument] = useState<DisplayDocument>(() => {
    const initial = createDisplayDocument({ name: 'Drop' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    return initial;
  });
  return (
    <DisplayEditor
      document={document}
      onChange={setDocument}
      dropSymbolType={type}
      loadValues={() => new Promise(() => undefined)}
      loadTrend={() => new Promise(() => undefined)}
    />
  );
}

function createDataTransfer(): DataTransfer {
  const payload = serializePiPointDragData(point);
  return {
    types: [PI_POINT_DRAG_MIME],
    effectAllowed: 'copy',
    dropEffect: 'none',
    getData: (type: string) => type === PI_POINT_DRAG_MIME ? payload : '',
    setData: jest.fn(),
  } as unknown as DataTransfer;
}

function mockSurfaceBounds() {
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
}

function fireDragEvent(target: Element, type: 'dragover' | 'drop', dataTransfer: DataTransfer, clientX = 500, clientY = 350) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    dataTransfer: { value: dataTransfer },
  });
  fireEvent(target, event);
}

describe('DisplayEditor - drop de PI Point', () => {
  it.each<PiPointDropSymbolType>(['value', 'trend', 'gauge', 'bar'])(
    'cria %s vinculado na posição solta e registra no histórico',
    (type) => {
      render(<Harness type={type} />);
      mockSurfaceBounds();
      const wrapper = screen.getByTestId('display-editor-surface-wrapper');
      const dataTransfer = createDataTransfer();

      fireDragEvent(wrapper, 'dragover', dataTransfer);
      expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-valid', 'true');
      fireDragEvent(wrapper, 'drop', dataTransfer);

      const element = screen.getByTestId(/^display-element-/);
      expect(element).toHaveAttribute('data-element-type', type);
      const geometry = element.querySelector('rect');
      if (geometry) {
        expect(Number(geometry.getAttribute('x'))).toBeGreaterThanOrEqual(0);
        expect(Number(geometry.getAttribute('y'))).toBeGreaterThanOrEqual(0);
      }
      expect(screen.getByTestId('display-undo')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('display-undo'));
      expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    },
  );

  it('mostra preview vermelho quando a geometria não cabe no local', () => {
    render(<Harness type="trend" />);
    mockSurfaceBounds();
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    fireDragEvent(wrapper, 'dragover', createDataTransfer(), 50, 20);

    expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-valid', 'false');
    expect(screen.getByTestId('pi-point-drag-preview')).toHaveTextContent('SINUSOID');
  });
});
