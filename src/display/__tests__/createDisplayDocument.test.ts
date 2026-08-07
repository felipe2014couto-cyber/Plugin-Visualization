import { createDisplayDocument, DEFAULT_DISPLAY_SURFACE, DISPLAY_SCHEMA_VERSION, type CreateDisplayDocumentOptions } from '../index';

describe('createDisplayDocument', () => {
  it('cria um novo Display com schemaVersion 1, elements vazio e surface com dimensoes validas', () => {
    const doc = createDisplayDocument();

    expect(doc.schemaVersion).toBe(1);
    expect(doc.schemaVersion).toBe(DISPLAY_SCHEMA_VERSION);
    expect(doc.elements).toEqual([]);
    expect(doc.surface.width).toBeGreaterThan(0);
    expect(doc.surface.height).toBeGreaterThan(0);
    expect(typeof doc.surface.backgroundColor).toBe('string');
    expect(doc.surface.backgroundColor.length).toBeGreaterThan(0);
  });

  it('utiliza os defaults oficiais de surface', () => {
    const doc = createDisplayDocument();

    expect(doc.surface).toEqual(DEFAULT_DISPLAY_SURFACE);
    expect(doc.surface.width).toBe(DEFAULT_DISPLAY_SURFACE.width);
    expect(doc.surface.height).toBe(DEFAULT_DISPLAY_SURFACE.height);
    expect(doc.surface.backgroundColor).toBe(DEFAULT_DISPLAY_SURFACE.backgroundColor);
  });

  it('aplica id e name fornecidos via opcoes', () => {
    const options: CreateDisplayDocumentOptions = {
      id: 'display-custom-id',
      name: 'Display Customizado',
    };

    const doc = createDisplayDocument(options);

    expect(doc.id).toBe('display-custom-id');
    expect(doc.name).toBe('Display Customizado');
  });

  it('utiliza o gerador de id injetado quando fornecido', () => {
    let counter = 0;
    const doc = createDisplayDocument({
      generateId: () => `injected-id-${++counter}`,
    });

    expect(doc.id).toBe('injected-id-1');
    expect(typeof doc.id).toBe('string');
    expect(doc.id.length).toBeGreaterThan(0);
  });
});
