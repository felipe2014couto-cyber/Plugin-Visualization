export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImage(file: File): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado.' };
  }

  // Verifica tipo MIME
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Formato de imagem não suportado. Utilize PNG, JPEG ou WEBP.',
    };
  }

  // Verifica tamanho máximo
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `A imagem selecionada (${sizeMb} MB) excede o limite máximo permitido de 5 MB.`,
    };
  }

  return { valid: true };
}

export function normalizeClipboardFile(file: File): File {
  if (!file) {
    return file;
  }

  const genericNames = ['image.png', 'blob', ''];
  const isGeneric =
    !file.name ||
    genericNames.includes(file.name.toLowerCase()) ||
    file.name.toLowerCase().startsWith('blob:');

  if (!isGeneric) {
    return file;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  let ext = 'png';
  if (file.type === 'image/jpeg') {
    ext = 'jpg';
  } else if (file.type === 'image/webp') {
    ext = 'webp';
  }

  const normalizedName = `clipboard-image-${year}${month}${day}-${hours}${minutes}${seconds}.${ext}`;

  try {
    return new File([file], normalizedName, {
      type: file.type,
      lastModified: file.lastModified || Date.now(),
    });
  } catch (err) {
    return file;
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove o prefixo data:image/...;base64,
        const base64Index = reader.result.indexOf(';base64,');
        if (base64Index !== -1) {
          resolve(reader.result.slice(base64Index + ';base64,'.length));
        } else {
          // Caso não tenha o formato padrão data URL
          const commaIndex = reader.result.indexOf(',');
          resolve(commaIndex !== -1 ? reader.result.slice(commaIndex + 1) : reader.result);
        }
      } else {
        reject(new Error('Falha ao converter arquivo para string Base64.'));
      }
    };

    reader.onerror = () => {
      reject(reader.error || new Error('Erro na leitura do arquivo de imagem.'));
    };

    reader.readAsDataURL(file);
  });
}

