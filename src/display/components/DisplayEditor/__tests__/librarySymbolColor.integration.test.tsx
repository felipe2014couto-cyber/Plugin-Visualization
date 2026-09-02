import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DisplaySurface } from '../DisplaySurface';
import { appendLibrarySymbol, createDisplayDocument, createLibrarySymbol } from '../../../index';

// ---------------------------------------------------------------------------
// Helpers de luminância (testáveis sem SVG)
// ---------------------------------------------------------------------------

/**
 * Calcula alpha de detalhe para um pixel com luminância L (0–1).
 * Deve retornar 0 para preto e 1 para branco, sem clamp binário.
 */
function detailAlphaFromLuminance(L: number): number {
  // A implementação usa feColorMatrix(luminanceToAlpha) que produz
  // exatamente L como alpha.  L=0 → opacidade 0, L=1 → opacidade 1.
  return Math.max(0, Math.min(1, L));
}

describe('detailAlphaFromLuminance (helper de luminância puro)', () => {
  it('preto → alpha ≈ 0 (corpo escuro some, deixa cor base aparecer)', () => {
    expect(detailAlphaFromLuminance(0)).toBe(0);
  });

  it('branco → alpha ≈ 1 (linha clara fica totalmente branca)', () => {
    expect(detailAlphaFromLuminance(1)).toBe(1);
  });

  it('cinza escuro → alpha baixo', () => {
    expect(detailAlphaFromLuminance(0.1)).toBeCloseTo(0.1, 2);
  });

  it('cinza claro → alpha alto', () => {
    expect(detailAlphaFromLuminance(0.8)).toBeCloseTo(0.8, 2);
  });

  it('pixels intermediários têm alpha gradual (sem threshold binário)', () => {
    const a25 = detailAlphaFromLuminance(0.25);
    const a50 = detailAlphaFromLuminance(0.50);
    const a75 = detailAlphaFromLuminance(0.75);
    expect(a25).toBeLessThan(a50);
    expect(a50).toBeLessThan(a75);
  });
});

// ---------------------------------------------------------------------------
// Verificação estrutural do filtro SVG (detecta polaridade invertida)
// ---------------------------------------------------------------------------

describe('LibrarySymbol – estrutura do filtro SVG', () => {
  function renderSurface(color: string, id: string) {
    let document = createDisplayDocument({ name: 'Test' });
    const symbol = createLibrarySymbol({ id, symbol: 'pims-vision:motores:01', color });
    document = appendLibrarySymbol(document, symbol);
    return render(
      <DisplaySurface
        document={document}
        editable={false}
        selectedElementId={null}
        selectedElementIds={[]}
        onSelect={jest.fn()}
        onSelectMany={jest.fn()}
        onStartDrag={jest.fn()}
        onStartResize={jest.fn()}
        onPointerMove={jest.fn()}
        onPointerEnd={jest.fn()}
      />
    );
  }

  it('o filtro usa luminanceToAlpha (extrai pixels CLAROS, não escuros)', () => {
    const { container } = renderSurface('#FF0000', 'sym-struct');
    const filter = container.querySelector('#pims-vision-detail-extract');
    expect(filter).toBeTruthy();

    // Deve conter um feColorMatrix do tipo luminanceToAlpha
    const lumMatrix = filter!.querySelector('feColorMatrix[type="luminanceToAlpha"]');
    expect(lumMatrix).toBeTruthy();

    // NÃO deve conter feColorMatrix com coeficientes negativos no alpha
    // (coeficientes negativos = seleção de pixels ESCUROS = polaridade invertida)
    const allColorMatrices = filter!.querySelectorAll('feColorMatrix[type="matrix"]');
    allColorMatrices.forEach((cm) => {
      const values = cm.getAttribute('values') ?? '';
      const nums = values.split(/\s+/).map(Number);
      // linha do alpha = índices 15..19
      const alphaR = nums[15] ?? 0;
      const alphaG = nums[16] ?? 0;
      const alphaB = nums[17] ?? 0;
      const allNegative = alphaR < 0 && alphaG < 0 && alphaB < 0;
      // Se todos os coeficientes RGB do alpha são negativos → polaridade invertida
      expect(allNegative).toBe(false);
    });
  });

  it('deve conter feFlood branco para colorir os detalhes de branco', () => {
    const { container } = renderSurface('#00FF00', 'sym-flood');
    const filter = container.querySelector('#pims-vision-detail-extract');
    const flood = filter!.querySelector('feFlood[flood-color="white"], feFlood[floodColor="white"]');
    expect(flood).toBeTruthy();
  });

  it('o filtro é clampado pela SourceAlpha (sem extrapolar silhueta)', () => {
    const { container } = renderSurface('#0000FF', 'sym-clip');
    const filter = container.querySelector('#pims-vision-detail-extract');
    // O último feComposite deve usar in2="SourceAlpha" operator="in"
    const composites = Array.from(filter!.querySelectorAll('feComposite'));
    const hasSourceAlphaClip = composites.some(
      (c) => c.getAttribute('in2') === 'SourceAlpha' && c.getAttribute('operator') === 'in'
    );
    expect(hasSourceAlphaClip).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Testes de integração DOM
// ---------------------------------------------------------------------------

describe('LibrarySymbol Coloring – DOM', () => {
  it('renderiza camada base com fill exato e aplica o filtro de detalhes na imagem', () => {
    let document = createDisplayDocument({ name: 'Test' });
    const symbol = createLibrarySymbol({ id: 'sym-1', symbol: 'pims-vision:motores:01', color: '#FF0000' });
    document = appendLibrarySymbol(document, symbol);

    const { getByTestId } = render(
      <DisplaySurface
        document={document}
        editable={false}
        selectedElementId={null}
        selectedElementIds={[]}
        onSelect={jest.fn()}
        onSelectMany={jest.fn()}
        onStartDrag={jest.fn()}
        onStartResize={jest.fn()}
        onPointerMove={jest.fn()}
        onPointerEnd={jest.fn()}
      />
    );

    // Camada base: fill exato
    const colorLayer = getByTestId('library-symbol-color-layer-sym-1');
    expect(colorLayer).toHaveAttribute('fill', '#FF0000');
    const maskId = colorLayer.getAttribute('mask')?.replace('url(#', '').replace(')', '');
    expect(maskId).toBeDefined();

    // Imagem: sem blend mode, sem opacity, mas com o filtro de detalhe
    const image = getByTestId('display-element-sym-1');
    expect(image.style.mixBlendMode).toBe('');
    expect(image.style.opacity).toBe('');
    expect(image).toHaveAttribute('filter', 'url(#pims-vision-detail-extract)');
    expect(image).toHaveAttribute('preserveAspectRatio', 'none');
  });

  it('sem cor personalizada: não renderiza camada base nem filtro', () => {
    let document = createDisplayDocument({ name: 'Test' });
    const symbol = createLibrarySymbol({
      id: 'sym-2',
      symbol: 'pims-vision:motores:01',
      color: 'transparent',
    });
    document = appendLibrarySymbol(document, symbol);

    const { getByTestId, queryByTestId } = render(
      <DisplaySurface
        document={document}
        editable={false}
        selectedElementId={null}
        selectedElementIds={[]}
        onSelect={jest.fn()}
        onSelectMany={jest.fn()}
        onStartDrag={jest.fn()}
        onStartResize={jest.fn()}
        onPointerMove={jest.fn()}
        onPointerEnd={jest.fn()}
      />
    );

    expect(queryByTestId('library-symbol-color-layer-sym-2')).toBeNull();

    const image = getByTestId('display-element-sym-2');
    expect(image.style.mixBlendMode).not.toBe('multiply');
    expect(image).not.toHaveAttribute('filter');
    expect(image).toHaveAttribute('preserveAspectRatio', 'none');
  });
});
