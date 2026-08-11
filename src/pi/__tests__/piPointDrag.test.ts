import {
  PI_POINT_DRAG_MIME,
  parsePiPointDragData,
  serializePiPointDragData,
} from '../piPointDrag';

describe('PI Point drag data', () => {
  it('serializa e valida o PI Point arrastado', () => {
    const point = {
      name: 'SINUSOID',
      webId: 'point-webid',
      path: '\\\\pims\\SINUSOID',
      dataSourceUid: 'ds',
      pointType: 'String',
    };

    expect(PI_POINT_DRAG_MIME).toBe('application/x-pims-vision-pi-point');
    expect(parsePiPointDragData(serializePiPointDragData(point))).toEqual(point);
  });

  it('rejeita payload inválido', () => {
    expect(parsePiPointDragData('{')).toBeUndefined();
    expect(parsePiPointDragData('{}')).toBeUndefined();
  });
});
