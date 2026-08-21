import { zoomViewportAtPoint } from '../viewportZoom';

function projectX(viewCenterX: number, zoom: number, pointX: number, surfaceWidth = 1000): number {
  const viewBoxX = viewCenterX - surfaceWidth / zoom / 2;
  return (pointX - viewBoxX) * zoom;
}

function projectY(viewCenterY: number, zoom: number, pointY: number, surfaceHeight = 600): number {
  const viewBoxY = viewCenterY - surfaceHeight / zoom / 2;
  return (pointY - viewBoxY) * zoom;
}

describe('zoomViewportAtPoint', () => {
  it('mantém o ponto sob o cursor como âncora do zoom', () => {
    const next = zoomViewportAtPoint({ zoom: 1, viewCenter: { x: 500, y: 300 } }, { x: 400, y: 300 }, 'in', 0.1, 5, 2);
    expect(next.zoom).toBe(2);
    expect(projectX(next.viewCenter.x, next.zoom, 400)).toBeCloseTo(400);
    expect(projectY(next.viewCenter.y, next.zoom, 300)).toBeCloseTo(300);
  });

  it('preserva a âncora quando a viewport já possui offset', () => {
    // zoom 2 e offset X=-200/Y=-100 equivalem ao centro 350/200 nesse surface.
    const next = zoomViewportAtPoint({ zoom: 2, viewCenter: { x: 350, y: 200 } }, { x: 300, y: 250 }, 'in', 0.1, 5, 2);
    expect(projectX(next.viewCenter.x, next.zoom, 300)).toBeCloseTo(400);
    expect(projectY(next.viewCenter.y, next.zoom, 250)).toBeCloseTo(400);
  });

  it('mantém a âncora fora do centro da viewport', () => {
    const next = zoomViewportAtPoint({ zoom: 1, viewCenter: { x: 500, y: 300 } }, { x: 900, y: 100 }, 'in', 0.1, 5, 1.1);
    expect(projectX(next.viewCenter.x, next.zoom, 900)).toBeCloseTo(900);
    expect(projectY(next.viewCenter.y, next.zoom, 100)).toBeCloseTo(100);
  });

  it('respeita os limites sem gerar valores inválidos', () => {
    expect(zoomViewportAtPoint({ zoom: 5, viewCenter: { x: 1, y: 2 } }, { x: 3, y: 4 }, 'in', 0.1, 5, 1.1).zoom).toBe(5);
    expect(zoomViewportAtPoint({ zoom: 0.1, viewCenter: { x: 1, y: 2 } }, { x: 3, y: 4 }, 'out', 0.1, 5, 1.1).zoom).toBe(0.1);
    expect(zoomViewportAtPoint({ zoom: NaN, viewCenter: { x: 1, y: 2 } }, { x: 3, y: 4 }, 'in', 0.1, 5, 1.1).zoom).toBeCloseTo(0.11);
  });

  it('usa o viewport atualizado a cada wheel sucessivo', () => {
    const first = zoomViewportAtPoint({ zoom: 1, viewCenter: { x: 500, y: 300 } }, { x: 400, y: 300 }, 'in', 0.1, 5, 1.1);
    const second = zoomViewportAtPoint(first, { x: 400, y: 300 }, 'in', 0.1, 5, 1.1);
    const third = zoomViewportAtPoint(second, { x: 400, y: 300 }, 'in', 0.1, 5, 1.1);
    expect(third.zoom).toBeCloseTo(1.331);
  });
});
