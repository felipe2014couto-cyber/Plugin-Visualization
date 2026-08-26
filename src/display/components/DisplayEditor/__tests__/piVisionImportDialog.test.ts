import { parsePiVisionUrl } from '../PiVisionImportDialog';

describe('parsePiVisionUrl', () => {
  it('parseia URL padrao do PI Vision', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/48494/RB3-FORNO---GABRIEL');
    expect(result).not.toBeUndefined();
    expect(result!.displayId).toBe('48494');
    expect(result!.baseUrl).toBe('http://pimsweb/PIVision');
  });

  it('parseia URL com HTTPS', () => {
    const result = parsePiVisionUrl('https://pimsweb/PIVision/#/Displays/12345/Minha-Tela');
    expect(result!.displayId).toBe('12345');
    expect(result!.baseUrl).toBe('https://pimsweb/PIVision');
  });

  it('parseia URL sem nome da tela', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/99');
    expect(result!.displayId).toBe('99');
  });

  it('parseia URL com porta', () => {
    const result = parsePiVisionUrl('http://pimsweb:8080/PIVision/#/Displays/1001/Tela');
    expect(result!.displayId).toBe('1001');
    expect(result!.baseUrl).toBe('http://pimsweb:8080/PIVision');
  });

  it('remove trailing slash da baseUrl', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/500/Tela');
    expect(result!.baseUrl).not.toMatch(/\/$/);
  });

  it('retorna undefined para URL sem hash de display', () => {
    expect(parsePiVisionUrl('http://pimsweb/PIVision/')).toBeUndefined();
  });

  it('retorna undefined para string vazia', () => {
    expect(parsePiVisionUrl('')).toBeUndefined();
  });

  it('retorna undefined para URL sem ID numerico', () => {
    expect(parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/abc/Tela')).toBeUndefined();
  });

  it('nao e case-sensitive no segmento Displays', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/displays/77/Tela');
    expect(result!.displayId).toBe('77');
  });
});
