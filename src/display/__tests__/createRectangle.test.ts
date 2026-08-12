import {
  appendDisplayElement,
  createDisplayDocument,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  RECTANGLE_TYPE,
  updateRectangleProperties,
  type DisplayElement,
} from '../index';

describe('createRectangle', () => {
  it('cria um Rectangle completo com geometria e propriedades visuais', () => {
    const document = createDisplayDocument({ name: 'Test' });
    document.surface.width = 800;
    document.surface.height = 600;

    const rectangle = createRectangle({ surface: document.surface });

    expect(rectangle.type).toBe(RECTANGLE_TYPE);
    expect(rectangle.id).toEqual(expect.any(String));
    expect(rectangle.width).toBeGreaterThan(0);
    expect(rectangle.height).toBeGreaterThan(0);
    expect(rectangle.x).toBeGreaterThanOrEqual(0);
    expect(rectangle.y).toBeGreaterThanOrEqual(0);
    expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(document.surface.width);
    expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(document.surface.height);
    expect(rectangle.properties).toEqual(DEFAULT_RECTANGLE_PROPERTIES);
  });

  it('gera IDs distintos para dois Rectangles', () => {
    const first = createRectangle();
    const second = createRectangle();

    expect(first.id).not.toBe(second.id);
  });

  it('evita um ID já utilizado no documento', () => {
    const ids = ['used-id', 'new-id'];
    const rectangle = createRectangle({
      id: 'used-id',
      existingIds: ['used-id'],
      generateId: () => ids.shift() ?? 'fallback-id',
    });

    expect(rectangle.id).toBe('new-id');
  });
});

describe('updateRectangleProperties', () => {
  it('atualiza apenas fill e stroke do Rectangle alvo', () => {
    const document = createDisplayDocument({ name: 'Test' });
    const first = createRectangle({ id: 'first' });
    const second = createRectangle({ id: 'second' });
    document.elements = [first, second];

    const next = updateRectangleProperties(document, 'second', { fill: '#ff0000', stroke: '#00ff00' });

    expect(next.elements[0].properties).toEqual(first.properties);
    expect(next.elements[1].id).toBe('second');
    expect(next.elements[1].properties.fill).toBe('#ff0000');
    expect(next.elements[1].properties.stroke).toBe('#00ff00');
    expect(document.elements[1].properties).toEqual(second.properties);
  });

  it('não altera o documento quando nada corresponde ao alvo', () => {
    const document = createDisplayDocument({ name: 'Test' });
    const rectangle = createRectangle({ id: 'only' });
    document.elements = [rectangle];

    expect(updateRectangleProperties(document, 'missing', { fill: '#ff0000' })).toBe(document);
  });
});

describe('appendDisplayElement', () => {
  it('insere o elemento sem alterar o documento ou elementos existentes', () => {
    const document = createDisplayDocument({ name: 'Test' });
    const existing: DisplayElement = {
      id: 'existing',
      type: 'legacy',
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      properties: { value: 'preserved' },
    };
    document.elements = [existing];
    const rectangle = createRectangle();

    const next = appendDisplayElement(document, rectangle);

    expect(next).not.toBe(document);
    expect(next.surface).toBe(document.surface);
    expect(next.elements).toEqual([existing, rectangle]);
    expect(next.elements[0]).toBe(existing);
    expect(document.elements).toEqual([existing]);
  });
});
