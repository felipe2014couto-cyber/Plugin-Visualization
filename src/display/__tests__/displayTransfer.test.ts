import {
  addTrendSeries,
  appendBar,
  appendDisplayElement,
  appendGauge,
  appendTrend,
  appendValue,
  createBar,
  createDisplayDocument,
  createGauge,
  createRectangle,
  createTable,
  createTrend,
  createValue,
  DISPLAY_EXPORT_FORMAT,
  DISPLAY_EXPORT_VERSION,
  getDisplayExportFileName,
  parseImportedDisplay,
  serializeDisplayCsv,
  serializeDisplay,
  serializeDisplayXml,
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

  it('preserva linhas, metadados e colunas da Tabela', () => {
    const document = createDisplayDocument({ id: 'table-display', name: 'Tabela' });
    const table = createTable({ id: 'table', item: { binding, path: '\\\\pims\\TAG', description: 'Temperatura', engineeringUnit: '°C', pointType: 'Float32' } });
    table.properties.style = 'striped';
    table.properties.columns.find((column) => column.id === 'description')!.visible = true;
    document.elements = [table];
    expect(parseImportedDisplay(serializeDisplay(document))).toEqual(document);
  });

  it('carrega binding único legado e salva várias séries no contrato canônico', () => {
    const envelope = JSON.parse(serializeDisplay(makeDocument()));
    const trend = envelope.document.elements.find((element: { type: string }) => element.type === 'trend');
    trend.properties = { binding };

    const importedLegacy = parseImportedDisplay(JSON.stringify(envelope));
    expect(importedLegacy.elements[2].properties).toEqual({
      series: [{ binding, color: '#6e9fff' }],
    });

    const withSecond = addTrendSeries(importedLegacy, 'trend', { ...binding, pointName: 'OTHER' });
    const reopened = parseImportedDisplay(serializeDisplay(withSecond));
    expect(reopened.elements[2].properties.series).toEqual([
      { binding, color: '#6e9fff' },
      { binding: { ...binding, pointName: 'OTHER' }, color: '#ff9830' },
    ]);
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
    expect(getDisplayExportFileName('Display', 'csv')).toBe('Display.pims-vision.csv');
    expect(getDisplayExportFileName('Display', 'xml')).toBe('Display.pims-vision.xml');
  });

  it('serializa CSV com metadados, ordem visual e propriedades portáteis', () => {
    const document = createDisplayDocument({ id: 'csv-display', name: 'Display, produção' });
    const first = createRectangle({ id: 'first', x: 10, y: 20, properties: { fill: '#123456', linkUrl: 'https://example.test/a?x=1,2' } });
    const second = createRectangle({ id: 'second', x: 30, y: 40 });
    document.elements = [first, second];
    const csv = serializeDisplayCsv(document);
    expect(csv.split('\r\n')[0]).toContain('schemaVersion,displayId,displayName');
    expect(csv).toContain('"Display, produção"');
    expect(csv).toContain('""fill"":""#123456""');
    expect(csv.indexOf('first')).toBeLessThan(csv.indexOf('second'));
  });

  it('serializa XML real e escapa valores especiais', () => {
    const document = createDisplayDocument({ id: 'xml-display', name: 'Display & produção' });
    document.elements = [createRectangle({ id: 'xml-rectangle', properties: { fill: '#123456', stroke: '<white>' } })];
    const xml = serializeDisplayXml(document);
    expect(xml).toContain('<displayExport format="pims-vision-display" version="1">');
    expect(xml).toContain('<name>Display &amp; produção</name>');
    expect(xml).toContain('<stroke>&lt;white&gt;</stroke>');
    expect(xml).not.toContain('<![CDATA[');
  });
});
