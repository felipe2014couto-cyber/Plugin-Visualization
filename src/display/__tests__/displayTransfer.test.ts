import {
  appendBar,
  appendDisplayElement,
  appendGauge,
  appendTrend,
  appendValue,
  createBar,
  createDisplayDocument,
  createGauge,
  createRectangle,
  createTrend,
  createValue,
  DISPLAY_EXPORT_FORMAT,
  DISPLAY_EXPORT_VERSION,
  getDisplayExportFileName,
  parseImportedDisplay,
  serializeDisplay,
} from '../index';

const binding = { dataSourceUid: 'datasource-uid', serverPath: 'pims', pointName: 'SINUSOID' };

function makeDocument() {
  const base = createDisplayDocument({ id: 'display-id', name: 'Display / produção' });
  const multistate = {
    enabled: true,
    rules: [
      { id: 'rule-low', operator: 'lt' as const, value: 20, color: '#d32f2f' },
      { id: 'rule-normal', operator: 'between' as const, value: 20, value2: 80, color: '#2e7d32' },
    ],
  };
  return appendBar(
    appendGauge(
      appendTrend(
        appendValue(
          appendDisplayElement(base, createRectangle({ id: 'rectangle', x: 10, y: 20 })),
          createValue({ id: 'value', binding, visual: { decimals: 2 }, multistate }),
        ),
        createTrend({ id: 'trend', binding }),
      ),
      createGauge({ id: 'gauge', binding, options: { minimum: -10, maximum: 150 }, multistate }),
    ),
    createBar({ id: 'bar', binding, orientation: 'horizontal', options: { minimum: 0, maximum: 200 }, multistate }),
  );
}

describe('displayTransfer', () => {
  it('serializa envelope versionado sem estado runtime e não altera o documento', () => {
    const document = makeDocument();
    (document.elements[1].properties as Record<string, unknown>).currentValue = 42;
    (document.elements[1].properties as Record<string, unknown>).activeRule = 'rule-low';
    const before = JSON.stringify(document);
    const exported = serializeDisplay(document);
    const envelope = JSON.parse(exported);

    expect(envelope.format).toBe(DISPLAY_EXPORT_FORMAT);
    expect(envelope.version).toBe(DISPLAY_EXPORT_VERSION);
    expect(envelope.document.id).toBe('display-id');
    expect(envelope.document.elements).toHaveLength(5);
    expect(exported).not.toContain('currentValue');
    expect(exported).not.toContain('activeRule');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('faz round-trip preservando IDs, bindings, escala, orientação, Trend e Multistate', () => {
    const document = makeDocument();
    const imported = parseImportedDisplay(serializeDisplay(document));
    expect(imported).toEqual(document);
    expect(imported.elements.map((element) => element.id)).toEqual(['rectangle', 'value', 'trend', 'gauge', 'bar']);
    expect(imported.elements[1].properties.binding).toEqual(binding);
    expect(imported.elements[3].properties.multistate).toEqual(document.elements[3].properties.multistate);
    expect(imported.elements[4].properties).toMatchObject({ orientation: 'horizontal', minimum: 0, maximum: 200 });
  });

  it('aceita documentos antigos sem Multistate', () => {
    const document = createDisplayDocument({ id: 'old', name: 'Old' });
    const imported = parseImportedDisplay(serializeDisplay(appendValue(document, createValue({ id: 'value', binding }))));
    expect(imported.elements[0].properties.multistate).toBeUndefined();
  });

  it.each(['', '{', '{}', 'null', '[]', JSON.stringify({ format: 'other', version: 1, document: {} }), JSON.stringify({ format: DISPLAY_EXPORT_FORMAT, version: 2, document: {} }), JSON.stringify({ format: DISPLAY_EXPORT_FORMAT, version: 1 })])(
    'rejeita entrada inválida atomicamente: %p',
    (input) => expect(() => parseImportedDisplay(input)).toThrow(),
  );

  it('rejeita tipos desconhecidos e propriedades críticas inválidas', () => {
    const envelope = JSON.parse(serializeDisplay(makeDocument()));
    envelope.document.elements[0].type = 'unknown';
    expect(() => parseImportedDisplay(JSON.stringify(envelope))).toThrow('Tipo de elemento não suportado');
    envelope.document.elements[0].type = 'rectangle';
    envelope.document.elements[1].x = '10';
    expect(() => parseImportedDisplay(JSON.stringify(envelope))).toThrow();
  });

  it('cria nome de download portátil', () => {
    expect(getDisplayExportFileName(' Display / produção ')).toBe('Display - produção.pims-vision.json');
    expect(getDisplayExportFileName('')).toBe('display.pims-vision.json');
  });
});
