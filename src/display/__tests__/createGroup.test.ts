import { createDisplayDocument } from '../createDisplayDocument';
import { createRectangle } from '../createRectangle';
import { createText } from '../createText';
import { createValue } from '../createValue';
import {
  createGroup,
  extractAllGroupBindingsAndElements,
  GROUP_TYPE,
  groupElements,
  resizeGroup,
  scaleGroupChildren,
  ungroupElements,
  updateGroupProperties,
} from '../createGroup';

describe('createGroup and grouping utilities', () => {
  it('cria um elemento de grupo com bounding box calculada a partir dos filhos', () => {
    const el1 = createRectangle({ x: 10, y: 20, width: 100, height: 50 });
    const el2 = createText({ x: 50, y: 40, width: 80, height: 60 });

    const group = createGroup({ elements: [el1, el2] });

    expect(group.type).toBe(GROUP_TYPE);
    expect(group.x).toBe(10);
    expect(group.y).toBe(20);
    expect(group.width).toBe(120); // max X = 50 + 80 = 130; 130 - 10 = 120
    expect(group.height).toBe(80); // max Y = 40 + 60 = 100; 100 - 20 = 80
    expect(group.properties.elements).toHaveLength(2);
  });

  it('agrupa elementos selecionados de um documento convertendo posições para relativas', () => {
    const doc = createDisplayDocument({ name: 'Doc Teste' });
    const el1 = createRectangle({ id: 'r1', x: 100, y: 100, width: 50, height: 50 });
    const el2 = createText({ id: 't1', x: 200, y: 150, width: 60, height: 40 });
    const el3 = createValue({
      id: 'v1',
      x: 400,
      y: 400,
      width: 100,
      height: 80,
      binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' },
    });

    const docWithElements = {
      ...doc,
      elements: [el1, el2, el3],
    };

    const result = groupElements(docWithElements, ['r1', 't1']);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.document.elements).toHaveLength(2); // Group + el3
    const group = result.group;
    expect(group.type).toBe(GROUP_TYPE);
    expect(group.x).toBe(100);
    expect(group.y).toBe(100);
    expect(group.width).toBe(160); // 260 - 100 = 160
    expect(group.height).toBe(90); // 190 - 100 = 90

    expect(group.properties.elements[0].id).toBe('r1');
    expect(group.properties.elements[0].x).toBe(0); // relative
    expect(group.properties.elements[0].y).toBe(0);

    expect(group.properties.elements[1].id).toBe('t1');
    expect(group.properties.elements[1].x).toBe(100); // 200 - 100
    expect(group.properties.elements[1].y).toBe(50); // 150 - 100
  });

  it('desagrupa elementos de volta para coordenadas absolutas', () => {
    const doc = createDisplayDocument({ name: 'Doc Teste' });
    const el1 = createRectangle({ id: 'r1', x: 100, y: 100, width: 50, height: 50 });
    const el2 = createText({ id: 't1', x: 200, y: 150, width: 60, height: 40 });

    const grouped = groupElements({ ...doc, elements: [el1, el2] }, ['r1', 't1']);
    expect(grouped).not.toBeNull();
    if (!grouped) return;

    const ungrouped = ungroupElements(grouped.document, grouped.group.id);
    expect(ungrouped).not.toBeNull();
    if (!ungrouped) return;

    expect(ungrouped.document.elements).toHaveLength(2);
    expect(ungrouped.unpackedIds).toEqual(['r1', 't1']);

    const unpackedR1 = ungrouped.document.elements.find((el) => el.id === 'r1');
    const unpackedT1 = ungrouped.document.elements.find((el) => el.id === 't1');

    expect(unpackedR1?.x).toBe(100);
    expect(unpackedR1?.y).toBe(100);
    expect(unpackedT1?.x).toBe(200);
    expect(unpackedT1?.y).toBe(150);
  });

  it('redimensiona proporcionalmente os elementos filhos do grupo e escala fontes', () => {
    const el1 = createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 50 });
    const el2 = createText({ id: 't1', x: 50, y: 25, width: 50, height: 25, properties: { fontSize: 20 } });

    const group = createGroup({ elements: [el1, el2], x: 0, y: 0, width: 100, height: 50 });

    const resized = resizeGroup(
      group,
      { x: 10, y: 10, width: 200, height: 100 }, // 2x scale
      { x: 0, y: 0, width: 100, height: 50 },
    );

    expect(resized.width).toBe(200);
    expect(resized.height).toBe(100);

    const scaledR1 = resized.properties.elements.find((el) => el.id === 'r1');
    const scaledT1 = resized.properties.elements.find((el) => el.id === 't1');

    expect(scaledR1?.width).toBe(200);
    expect(scaledR1?.height).toBe(100);

    expect(scaledT1?.x).toBe(100);
    expect(scaledT1?.y).toBe(50);
    expect(scaledT1?.width).toBe(100);
    expect(scaledT1?.height).toBe(50);
    expect((scaledT1?.properties as { fontSize?: number }).fontSize).toBe(40);
  });

  it('extrai recursivamente todos os bindings e elementos contidos em grupos', () => {
    const el1 = createRectangle({ id: 'r1', x: 0, y: 0, width: 50, height: 50 });
    const el2 = createText({ id: 't1', x: 10, y: 10, width: 40, height: 20 });
    const nestedGroup = createGroup({ id: 'g2', elements: [el2] });
    const mainGroup = createGroup({ id: 'g1', elements: [el1, nestedGroup] });

    const all = extractAllGroupBindingsAndElements([mainGroup]);
    const ids = all.map((el) => el.id);

    expect(ids).toContain('g1');
    expect(ids).toContain('r1');
    expect(ids).toContain('g2');
    expect(ids).toContain('t1');
  });
});
