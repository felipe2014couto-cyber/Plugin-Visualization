import { createDisplayDocument } from '../createDisplayDocument';
import {
  appendValue,
  createValue,
  updateValueVisualOptions,
  VALUE_TYPE,
} from '../createValue';
import { createPiPointBinding } from '../../pi/piPointBinding';

const binding = {
  dataSourceUid: 'resolved-datasource',
  serverPath: 'pims',
  pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
};

describe('ValueElement', () => {
  it('cria somente com binding válido e preserva a identidade mínima', () => {
    const value = createValue({ binding, id: 'value-1', x: 100, y: 80 });

    expect(value).toMatchObject({
      id: 'value-1',
      type: VALUE_TYPE,
      x: 100,
      y: 80,
      properties: { binding },
    });
    expect(() => createValue({ binding: { ...binding, dataSourceUid: '' } })).toThrow();
  });

  it('deriva o binding do resultado selecionado sem hardcodear a Data Source', () => {
    expect(createPiPointBinding({
      dataSourceUid: 'resolved-datasource',
      name: binding.pointName,
      path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE',
    })).toEqual(binding);
    expect(createPiPointBinding({ name: binding.pointName, path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE' }))
      .toBeUndefined();
    expect(createPiPointBinding({
      dataSourceUid: 'resolved-datasource',
      name: 'STATE',
      path: '\\\\pims\\STATE',
      webId: 'state-web-id',
      pointType: 'String',
    })).toEqual({
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'STATE',
      webId: 'state-web-id',
      pointType: 'String',
    });
    expect(createPiPointBinding({
      dataSourceUid: 'resolved-datasource',
      name: 'SINUSOID',
      path: '\\\\pims\\SINUSOID',
    })).toEqual({ dataSourceUid: 'resolved-datasource', serverPath: 'pims', pointName: 'SINUSOID' });
  });

  it('altera somente elements ao adicionar o Value ao documento', () => {
    const document = createDisplayDocument({ id: 'display-1' });
    const value = createValue({ binding, id: 'value-1', surface: document.surface });
    const next = appendValue(document, value);

    expect(next).not.toBe(document);
    expect(next.schemaVersion).toBe(document.schemaVersion);
    expect(next.surface).toEqual(document.surface);
    expect(next.elements).toEqual([value]);
    expect(document.elements).toEqual([]);
  });

  it('cria opções visuais mínimas e altera somente a apresentação', () => {
    const document = createDisplayDocument({ id: 'display-1' });
    const value = createValue({ binding, id: 'value-1', x: 100, y: 80, width: 200, height: 90 });
    const withValue = appendValue(document, value);
    const next = updateValueVisualOptions(withValue, value.id, {
      decimals: 2,
      showTagName: true,
      fontSize: 24,
      color: '#ff0000',
      textAlign: 'right',
    });

    expect(next).not.toBe(withValue);
    expect(next.elements[0]).toMatchObject({ id: value.id, x: 100, y: 80, width: 200, height: 90 });
    expect(next.elements[0].properties).toMatchObject({ binding, visual: {
      decimals: 2,
      showTagName: true,
      fontSize: 24,
      color: '#ff0000',
      textAlign: 'right',
    } });
    expect(next.elements[0].properties.binding).toBe(withValue.elements[0].properties.binding);
  });

  it('normaliza opções inválidas sem ampliar o contrato visual', () => {
    const value = createValue({ binding, visual: { decimals: 11, fontSize: 200, color: 'red' } });
    expect(value.properties.visual).toMatchObject({ decimals: null, fontSize: 96, color: '#ffffff' });
  });
});
