import { readFileSync } from 'fs';
import { join } from 'path';
import { INDUSTRIAL_SYMBOL_CATALOG } from '../catalog';

describe('Openclipart motor SVG assets', () => {
  it('mantém os SVGs locais, sanitizados e monocromáticos', () => {
    const motors = INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => symbol.source === 'openclipart');
    expect(motors).toHaveLength(2);

    motors.forEach((symbol) => {
      const svg = readFileSync(join(process.cwd(), 'src', symbol.svg), 'utf8');
      expect(svg).toMatch(/<svg[\s>]/i);
      expect(svg).toMatch(/viewBox=/i);
      expect(svg).toMatch(/data-style="monochrome"/i);
      expect(svg).not.toMatch(/#(?:2E6386|7AA8BF|D98732)/i);
      expect(svg).toMatch(/data-license="public-domain"/i);
      expect(svg).not.toMatch(/<(script|foreignObject|iframe|object|embed|image)\b/i);
      expect(svg).not.toMatch(/\bon[a-z]+\s*=/i);
      expect(svg).not.toMatch(/(?:javascript:|vbscript:|@import|postMessage|postValue|putValue|dangerouslySetInnerHTML|eval\s*\()/i);
      expect(svg).not.toMatch(/(?:href|xlink:href|src)\s*=\s*["'][^"']*(?:https?:|data:|\/\/)/i);
      expect(svg).not.toMatch(/url\(\s*(?:https?:|data:|\/\/)/i);
      expect(svg).not.toMatch(/<style\b/i);
      expect([...svg.matchAll(/\bid="([^"]+)"/gi)].every((match) => match[1].startsWith('sym_'))).toBe(true);
      expect(symbol.modified).toBe(true);
      expect(symbol.sanitized).toBe(true);
      expect(symbol.license).toBe('Public Domain');
      expect(symbol.capabilities.fill).toBe(true);
      expect(symbol.capabilities.stroke).toBe(true);
      expect(symbol.capabilities.multistateReady).toBe(true);
      expect(symbol.sourceUrl).toMatch(/^https:\/\/openclipart\.org\/detail\//);
      expect(symbol.author).toBeTruthy();
    });
  });
});
