export type TargetImageFormat = 'webp' | 'png' | 'jpeg';

export interface ImageMeta {
  width: number;
  height: number;
}

export const FORMAT_MIME: Record<TargetImageFormat, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const FORMAT_EXT: Record<TargetImageFormat, string> = {
  webp: 'webp',
  png: 'png',
  jpeg: 'jpg',
};

const SOURCE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
];

const SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

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

/** Aceita pelo MIME informado ou pela extensão (cobre arquivos com tipo vazio). */
export function isSupportedSourceImage(file: File): boolean {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  return SOURCE_MIMES.includes(file.type) || SOURCE_EXTENSIONS.includes(ext);
}

/** Lê apenas as dimensões da imagem sem reter o objeto em memória. */
export async function readImageMeta(file: File): Promise<ImageMeta> {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Gera o nome do arquivo convertido mantendo o nome original e trocando a
 * extensão. Ex.: "foto.PNG" + 'jpeg' → "foto.jpg".
 */
export function getConvertedFileName(
  originalName: string,
  format: TargetImageFormat,
): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}.${FORMAT_EXT[format]}`;
}

/**
 * Estimativa grosseira de bytes por pixel por formato. O tamanho real só é
 * conhecido após a codificação no navegador — use apenas como referência.
 */
function bytesPerPixel(format: TargetImageFormat, q: number): number {
  if (format === 'png') return 1.15;
  // webp costuma ser ~15% menor que jpeg na mesma qualidade
  const jpeg = 0.05 + 0.3 * Math.pow(q, 1.6);
  return format === 'jpeg' ? jpeg : jpeg * 0.85;
}

export function estimateConvertedBytes(
  width: number,
  height: number,
  format: TargetImageFormat,
  qualityPercent: number,
): number {
  if (width <= 0 || height <= 0) return 0;
  const q = format === 'png' ? 1 : Math.min(100, Math.max(0, qualityPercent)) / 100;
  return Math.round(width * height * bytesPerPixel(format, q));
}

/**
 * Converte uma imagem via Canvas API nativa para WEBP, PNG ou JPEG.
 * `quality` deve estar entre 0 e 1 (é ignorado para PNG, que é lossless).
 * Para JPEG, a transparência é preenchida com fundo branco.
 */
export async function convertImage(
  file: File,
  targetFormat: TargetImageFormat,
  quality: number = 0.9,
): Promise<Blob> {
  if (!isSupportedSourceImage(file)) {
    throw new Error(
      `Formato não suportado: "${file.name}". Use JPG, PNG, WEBP, GIF ou BMP.`,
    );
  }

  const img = await loadImage(file);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D não suportado no seu navegador.');

  if (targetFormat === 'jpeg') {
    // JPEG não suporta canal alfa — fundo branco evita áreas pretas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);

  const mime = FORMAT_MIME[targetFormat];
  const q = Math.min(1, Math.max(0, quality));
  const encodeQuality = targetFormat === 'png' ? undefined : q;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new Error(`Falha ao converter "${file.name}" para ${mime}.`),
          );
        }
      },
      mime,
      encodeQuality,
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
