import { calculateAreaZoomViewport, normalizeAreaZoomRect } from '../areaZoom';

describe('Zoom por área', () => {
  it.each([
    [{ x: 10, y: 20 }, { x: 110, y: 120 }],
    [{ x: 110, y: 120 }, { x: 10, y: 20 }],
    [{ x: 110, y: 20 }, { x: 10, y: 120 }],
    [{ x: 10, y: 120 }, { x: 110, y: 20 }],
  ])('normaliza o retângulo independentemente da direção do arrasto', (start, end) => {
    expect(normalizeAreaZoomRect(start, end)).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('mantém a proporção usando o menor fator de escala', () => {
    const horizontal = calculateAreaZoomViewport({ x: 0, y: 0, width: 800, height: 100 }, 1000, 500, 0.1, 5, 1);
    const vertical = calculateAreaZoomViewport({ x: 0, y: 0, width: 100, height: 400 }, 1000, 500, 0.1, 5, 1);
    expect(horizontal?.zoom).toBeCloseTo(1.25);
    expect(vertical?.zoom).toBeCloseTo(1.25);
  });

  it('centraliza a viewport no centro da área escolhida', () => {
    const result = calculateAreaZoomViewport({ x: 700, y: 400, width: 100, height: 100 }, 1000, 500, 0.1, 5, 1);
    expect(result).toEqual({ zoom: 5, center: { x: 750, y: 450 } });
  });

  it('respeita o zoom máximo e rejeita áreas inválidas', () => {
    expect(calculateAreaZoomViewport({ x: 0, y: 0, width: 1, height: 1 }, 1000, 500, 0.1, 5, 1)?.zoom).toBe(5);
    expect(calculateAreaZoomViewport({ x: 0, y: 0, width: 0, height: 10 }, 1000, 500, 0.1, 5)).toBeNull();
  });
});
