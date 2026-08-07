import { DEFAULT_DISPLAY_SURFACE, DISPLAY_SCHEMA_VERSION, type DisplayDocument, type DisplayElement } from '../index';

describe('DisplayDocument com DisplayElement', () => {
  it('aceita um DisplayDocument valido contendo um DisplayElement valido', () => {
    const element: DisplayElement = {
      id: 'el-1',
      type: 'value',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      properties: {},
    };

    const doc: DisplayDocument = {
      schemaVersion: DISPLAY_SCHEMA_VERSION,
      id: 'doc-1',
      name: 'Documento de Teste',
      surface: { ...DEFAULT_DISPLAY_SURFACE },
      elements: [element],
    };

    expect(doc.schemaVersion).toBe(1);
    expect(doc.id).toBe('doc-1');
    expect(doc.name).toBe('Documento de Teste');
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0]).toEqual(element);
  });

  it('permite multiplos elementos com ids independentes', () => {
    const element1: DisplayElement = {
      id: 'el-1',
      type: 'value',
      x: 0,
      y: 0,
      width: 50,
      height: 25,
      properties: {},
    };

    const element2: DisplayElement = {
      id: 'el-2',
      type: 'text',
      x: 100,
      y: 200,
      width: 200,
      height: 40,
      properties: { text: 'Hello' },
    };

    const doc: DisplayDocument = {
      schemaVersion: DISPLAY_SCHEMA_VERSION,
      id: 'doc-1',
      name: 'Documento de Teste',
      surface: { ...DEFAULT_DISPLAY_SURFACE },
      elements: [element1, element2],
    };

    const ids = doc.elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.elements[0].id).not.toBe(doc.elements[1].id);
  });
});
