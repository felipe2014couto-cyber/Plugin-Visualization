import { createDisplayDocument, type DisplayElement } from '../../../index';
import { updateElementGeometry } from '../editorGeometry';

describe('escala do DisplayEditor', () => {
  it.each([10, 100, 250, 500])('atualiza um alvo sem recriar os demais elementos em um Display de %i elementos', (count) => {
    const document = createDisplayDocument({ id: 'large-display' });
    document.elements = Array.from({ length: count }, (_, index): DisplayElement => ({
      id: `rectangle-${index}`,
      type: 'rectangle',
      x: index,
      y: index,
      width: 20,
      height: 20,
      properties: { fill: '#000000', stroke: '#ffffff' },
    }));

    const targetIndex = Math.floor(count / 2);
    const next = updateElementGeometry(document, `rectangle-${targetIndex}`, { x: 300, y: 400, width: 30, height: 40 });

    expect(next).not.toBe(document);
    expect(next.elements).toHaveLength(count);
    expect(next.elements[targetIndex]).toMatchObject({ id: `rectangle-${targetIndex}`, x: 300, y: 400, width: 30, height: 40 });
    expect(next.elements[0]).toBe(document.elements[0]);
    expect(next.elements[count - 1]).toBe(document.elements[count - 1]);
  });
});
