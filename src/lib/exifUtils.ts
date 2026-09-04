export type SupportedExifMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const SUPPORTED_EXIF_MIMES: SupportedExifMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const RE_ENCODE_QUALITY = 0.92;

export function isSupportedExifImage(file: File): boolean {
  return (SUPPORTED_EXIF_MIMES as string[]).includes(file.type);
}

/** Gera o nome do arquivo limpo, ex: "foto.jpg" → "foto-sem-exif.jpg". */
export function getCleanFileName(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : '';
  return `${base}-sem-exif${ext}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível ler a imagem "${file.name}".`));
    };
    img.src = url;
  });
}

/**
 * Remove todos os metadados EXIF (GPS, modelo da câmera, autor, data/hora,
 * copyright etc.) re-renderizando a imagem via Canvas API e re-exportando
 * como um novo Blob. O cabeçalho original nunca é copiado para o resultado.
 */
export async function stripExifMetadata(imageFile: File): Promise<Blob> {
  if (!isSupportedExifImage(imageFile)) {
    throw new Error(
      `Formato não suportado: "${imageFile.name}". Use JPG, PNG ou WEBP.`,
    );
  }

  const img = await loadImage(imageFile);

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não suportado no seu navegador.');
    ctx.drawImage(img, 0, 0);
  } catch (err: unknown) {
    throw err instanceof Error
      ? err
      : new Error(`Falha ao renderizar "${imageFile.name}".`);
  }

  const mime = imageFile.type as SupportedExifMime;
  const quality = mime === 'image/png' ? undefined : RE_ENCODE_QUALITY;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new Error(
              `Falha ao re-encodificar "${imageFile.name}" sem metadados.`,
            ),
          );
        }
      },
      mime,
      quality,
    );
  });
}

/** Dispara o download e revoga a URL de objeto imediatamente (liberação de RAM). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}
