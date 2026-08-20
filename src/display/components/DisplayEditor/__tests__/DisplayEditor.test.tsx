import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('DisplayEditor', () => {
  it('renderiza o editor a partir de um DisplayDocument valido', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
  });

  it('aplica width e height do documento na superficie SVG', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.width = 800;
    doc.surface.height = 450;

    render(<DisplayEditor document={doc} />);

    const surface = screen.getByTestId('display-surface');
    expect(surface.getAttribute('width')).toBe('800');
    expect(surface.getAttribute('height')).toBe('450');
    expect(surface.getAttribute('viewBox')).toBe('0 0 800 450');
  });

  it('aplica backgroundColor do documento no fundo da superficie', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.backgroundColor = '#abcdef';

    render(<DisplayEditor document={doc} />);

    const background = screen.getByTestId('display-surface-background');
    expect(background.getAttribute('fill')).toBe('#abcdef');
  });

  it('renderiza corretamente um documento com elements vazio', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    expect(doc.elements).toEqual([]);

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface-background')).toBeInTheDocument();
  });

  it('mostra o nome do documento no cabecalho', () => {
    const doc = createDisplayDocument({ name: 'Meu Display Custom' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor-name')).toHaveTextContent('Meu Display Custom');
  });

  it('mantém os controles existentes agrupados na toolbar compacta', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor-toolbar')).toContainElement(screen.getByTestId('display-undo'));
    expect(screen.getByTestId('display-editor-toolbar')).toContainElement(screen.getByLabelText('Arrastar como Gauge'));
    expect(screen.getByTitle('Exportar Display')).toBeInTheDocument();
    expect(screen.getByTitle('Arrastar como Barra')).toBeInTheDocument();
  });

  it('aplica zoom somente com Ctrl + scroll e não altera o documento', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.width = 800;
    doc.surface.height = 450;
    const before = JSON.stringify(doc);
    render(<DisplayEditor document={doc} />);
    const surface = screen.getByTestId('display-surface');
    const originalViewBox = surface.getAttribute('viewBox');

    fireEvent.wheel(surface, { deltaY: -1, clientX: 400, clientY: 225 });
    expect(surface.getAttribute('viewBox')).toBe(originalViewBox);

    const ctrlWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -1, clientX: 400, clientY: 225 });
    fireEvent(surface, ctrlWheel);
    expect(ctrlWheel.defaultPrevented).toBe(true);
    expect(surface.getAttribute('viewBox')).not.toBe(originalViewBox);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
