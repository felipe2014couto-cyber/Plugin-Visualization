import { calculateAnchoredZoomScroll, calculateViewCenterFromScroll, type FocalZoomIntent } from '../viewportZoom';

describe('calculateAnchoredZoomScroll e calculateViewCenterFromScroll', () => {
  const canvasBounds = { left: 0, top: 0, width: 2000, height: 1200 };

  it('mantém a coordenada física do scroll para ancorar o ponto lógico - central', () => {
    // Zoom 2x. Anchor at {x: 1000, y: 600}. Cursor is at exact center of wrapper (500, 300).
    const intent: FocalZoomIntent = {
      anchor: { x: 1000, y: 600 },
      localX: 500,
      localY: 300,
      zoom: 2,
    };
    
    const scroll = calculateAnchoredZoomScroll(intent, canvasBounds, 4000, 2400, 1000, 600);
    expect(scroll.scrollLeft).toBeCloseTo(1500);
    expect(scroll.scrollTop).toBeCloseTo(900);

    const center = calculateViewCenterFromScroll(scroll.scrollLeft, scroll.scrollTop, 1000, 600, 2, canvasBounds);
    expect(center.x).toBeCloseTo(1000);
    expect(center.y).toBeCloseTo(600);
  });

  it('mantém a coordenada física quando a âncora está no canto', () => {
    // Cursor near top-left: localX=100, localY=100
    // Anchor in logical coords = {x: 100, y: 100}
    // Zoom from 1 -> 2
    const intent: FocalZoomIntent = {
      anchor: { x: 100, y: 100 },
      localX: 100,
      localY: 100,
      zoom: 2,
    };
    
    const scroll = calculateAnchoredZoomScroll(intent, canvasBounds, 4000, 2400, 1000, 600);
    // targetLeft = (100 - 0) * 2 - 100 = 100
    // targetTop = (100 - 0) * 2 - 100 = 100
    expect(scroll.scrollLeft).toBeCloseTo(100);
    expect(scroll.scrollTop).toBeCloseTo(100);
    
    // Reverse math check: if we are at scroll 100, local 100 means pixel 200 of the wrapper content.
    // Pixel 200 / 2 = 100 logical! Correct!
  });

  it('faz clamp no scroll ao atingir as bordas', () => {
    const intent: FocalZoomIntent = {
      anchor: { x: 10, y: 10 },
      localX: 500, // attempting to anchor top-left logic point in center of screen
      localY: 300,
      zoom: 2,
    };
    
    const scroll = calculateAnchoredZoomScroll(intent, canvasBounds, 4000, 2400, 1000, 600);
    // targetLeft = 10 * 2 - 500 = -480 -> Clamped to 0
    // targetTop = 10 * 2 - 300 = -280 -> Clamped to 0
    expect(scroll.scrollLeft).toBe(0);
    expect(scroll.scrollTop).toBe(0);
  });
});

