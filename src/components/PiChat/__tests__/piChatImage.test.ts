import { validateImage, fileToBase64, normalizeClipboardFile } from '../piChatImage';

describe('piChatImage', () => {
  describe('validateImage', () => {
    it('deve aceitar imagens PNG válidas dentro do limite de tamanho', () => {
      const file = new File(['dummy-content'], 'test.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1 MB
      const result = validateImage(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('deve aceitar imagens JPEG válidas dentro do limite de tamanho', () => {
      const file = new File(['dummy-content'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 }); // 2 MB
      const result = validateImage(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('deve aceitar imagens WEBP válidas dentro do limite de tamanho', () => {
      const file = new File(['dummy-content'], 'graphic.webp', { type: 'image/webp' });
      Object.defineProperty(file, 'size', { value: 500 * 1024 }); // 500 KB
      const result = validateImage(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('deve rejeitar arquivo com tipo MIME não suportado (ex: application/pdf)', () => {
      const file = new File(['dummy-content'], 'document.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 });
      const result = validateImage(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Formato de imagem não suportado');
    });

    it('deve rejeitar arquivo com tipo MIME de texto (text/plain)', () => {
      const file = new File(['dummy-content'], 'notes.txt', { type: 'text/plain' });
      Object.defineProperty(file, 'size', { value: 100 });
      const result = validateImage(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Formato de imagem não suportado');
    });

    it('deve rejeitar imagens maiores que 5 MB', () => {
      const file = new File(['dummy-content'], 'large.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 }); // 6 MB
      const result = validateImage(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('excede o limite máximo permitido de 5 MB');
    });

    it('deve rejeitar quando nenhum arquivo for passado', () => {
      const result = validateImage(null as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Nenhum arquivo');
    });
  });

  describe('normalizeClipboardFile', () => {
    it('deve normalizar arquivo com nome genérico "image.png"', () => {
      const file = new File(['mock-bytes'], 'image.png', { type: 'image/png' });
      const normalized = normalizeClipboardFile(file);
      expect(normalized.name).toMatch(/^clipboard-image-\d{8}-\d{6}\.png$/);
      expect(normalized.type).toBe('image/png');
    });

    it('deve normalizar arquivo com nome "blob" e extensão jpg para image/jpeg', () => {
      const file = new File(['mock-bytes'], 'blob', { type: 'image/jpeg' });
      const normalized = normalizeClipboardFile(file);
      expect(normalized.name).toMatch(/^clipboard-image-\d{8}-\d{6}\.jpg$/);
      expect(normalized.type).toBe('image/jpeg');
    });

    it('deve normalizar arquivo com nome vazio e tipo image/webp', () => {
      const file = new File(['mock-bytes'], '', { type: 'image/webp' });
      const normalized = normalizeClipboardFile(file);
      expect(normalized.name).toMatch(/^clipboard-image-\d{8}-\d{6}\.webp$/);
      expect(normalized.type).toBe('image/webp');
    });

    it('deve preservar arquivos que já possuem nomes descritivos', () => {
      const file = new File(['mock-bytes'], 'meu-diagrama-industrial.png', { type: 'image/png' });
      const normalized = normalizeClipboardFile(file);
      expect(normalized.name).toBe('meu-diagrama-industrial.png');
      expect(normalized.type).toBe('image/png');
    });

    it('deve retornar o próprio valor quando o arquivo for nulo ou indefinido', () => {
      expect(normalizeClipboardFile(null as any)).toBeNull();
      expect(normalizeClipboardFile(undefined as any)).toBeUndefined();
    });
  });

  describe('fileToBase64', () => {
    it('deve converter File para string Base64 limpa sem prefixo data URL', async () => {
      const file = new File(['imagem-fake-bytes'], 'test.png', { type: 'image/png' });
      const base64 = await fileToBase64(file);
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
      expect(base64.startsWith('data:')).toBe(false);
    });
  });
});

