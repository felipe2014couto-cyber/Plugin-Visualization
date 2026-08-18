import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendDisplayElement, createDisplayDocument, createRectangle, serializeDisplay, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

class MockFileReader {
  result: string | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(file: File) {
    this.result = (file as unknown as { content?: string }).content ?? '';
    this.onload?.({} as ProgressEvent<FileReader>);
  }
}

const originalFileReader = global.FileReader;

beforeAll(() => {
  global.FileReader = MockFileReader as unknown as typeof FileReader;
});

afterAll(() => {
  global.FileReader = originalFileReader;
});

function Harness({ initial }: { initial: DisplayDocument }) {
  const [document, setDocument] = useState(initial);
  return <DisplayEditor document={document} onChange={setDocument} />;
}

function fileWithContent(content: string): File {
  return { name: 'display.pims-vision.json', type: 'application/json', content } as unknown as File;
}

describe('DisplayEditor - Exportar e Importar', () => {
  it('importa documento válido de forma substitutiva e reinicializa histórico', async () => {
    const current = appendDisplayElement(createDisplayDocument({ id: 'current', name: 'Atual' }), createRectangle({ id: 'current-rectangle' }));
    const imported = appendDisplayElement(createDisplayDocument({ id: 'imported', name: 'Importado' }), createRectangle({ id: 'imported-rectangle', x: 30 }));
    render(<Harness initial={current} />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    expect(screen.getByTestId('display-undo')).not.toBeDisabled();
    fireEvent.change(screen.getByTestId('display-import-input'), { target: { files: [fileWithContent(serializeDisplay(imported))] } });

    await waitFor(() => expect(screen.getByTestId('display-editor-name')).toHaveTextContent('Importado'));
    expect(screen.getByTestId('display-element-imported-rectangle')).toBeInTheDocument();
    expect(screen.queryByTestId('display-element-current-rectangle')).toBeNull();
    expect(screen.getByTestId('display-undo')).toBeDisabled();
  });

  it('mantém o documento atual quando o arquivo é inválido', async () => {
    const current = appendDisplayElement(createDisplayDocument({ id: 'current', name: 'Atual' }), createRectangle({ id: 'current-rectangle' }));
    render(<Harness initial={current} />);
    fireEvent.change(screen.getByTestId('display-import-input'), { target: { files: [fileWithContent('{')] } });

    await waitFor(() => expect(screen.getByTestId('display-import-error')).toHaveTextContent('Arquivo de Display inválido.'));
    expect(screen.getByTestId('display-editor-name')).toHaveTextContent('Atual');
    expect(screen.getByTestId('display-element-current-rectangle')).toBeInTheDocument();
  });

  it('exporta sem chamar onChange nem alterar o documento', () => {
    const document = createDisplayDocument({ id: 'export', name: 'Exportável' });
    const onChange = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:display');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<DisplayEditor document={document} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('display-export'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:display');
    expect(onChange).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('exporta CSV quando o formato é selecionado', () => {
    const document = appendDisplayElement(createDisplayDocument({ id: 'csv-export', name: 'Exportável' }), createRectangle({ id: 'rectangle' }));
    const createObjectURL = jest.fn(() => 'blob:csv');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const downloads: string[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    render(<DisplayEditor document={document} onChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId('display-export-format'), { target: { value: 'csv' } });
    fireEvent.click(screen.getByTestId('display-export'));

    const blob = (createObjectURL.mock.calls as unknown as Array<[Blob]>)[0][0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(downloads).toEqual(['Exportável.pims-vision.csv']);
    click.mockRestore();
  });
});
