import {
  appendDisplayElement,
  createDisplayDocument,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  RECTANGLE_TYPE,
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
