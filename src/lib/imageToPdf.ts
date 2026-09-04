import { PDFDocument } from 'pdf-lib';

export type PageOrientation = 'a4-portrait' | 'a4-landscape' | 'fit';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function needsCanvas(file: File): boolean {
  return file.type === 'image/png' || file.type === 'image/webp';
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

/** Re-renderiza PNG/WEBP transparentes sobre fundo branco, retornando bytes JPEG. */
async function encodeToOpaqueJpeg(file: File): Promise<Uint8Array> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado no seu navegador.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Falha ao codificar "${file.name}".`))),
      'image/jpeg',
      0.95,
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}

interface PlacedImage {
  width: number;
  height: number;
}

/** Define o retângulo da imagem desenhada dentro da página, conforme a orientação. */
function computePlacement(
  orientation: PageOrientation,
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
): PlacedImage {
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { width, height };
}

/**
 * Converte arquivos de imagem (JPG/PNG/WEBP) em um único PDF Uint8Array.
 * PNG/WEBP transparentes são renderizados via Canvas sobre fundo branco,
 * garantindo compatibilidade total com o pdf-lib.
 */
export async function convertImagesToPdf(
  files: File[],
  options: { orientation: PageOrientation },
): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('Nenhuma imagem para converter.');
  }

  const doc = await PDFDocument.create();

  for (const file of files) {
    const mime = file.type || '';
    if (!MIME_TO_EXT[mime]) {
      throw new Error(`Formato não suportado: "${file.name}". Use JPG, PNG ou WEBP.`);
    }

    let jpgBytes: Uint8Array;
    if (needsCanvas(file)) {
      // PNG/WEBP sempre passam pelo Canvas → fundo branco + exif descartado
      jpgBytes = await encodeToOpaqueJpeg(file);
    } else {
      jpgBytes = new Uint8Array(await file.arrayBuffer());
    }

    const jpgImage = await doc.embedJpg(jpgBytes);

    if (options.orientation === 'fit') {
      // Página A4 retrato com a imagem centralizada, redimensionada para caber
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const { width, height } = computePlacement(
        'fit',
        pageWidth,
        pageHeight,
        jpgImage.width,
        jpgImage.height,
      );
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawImage(jpgImage, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height,
      });
    } else {
      const landscape = options.orientation === 'a4-landscape';
      const pageWidth = landscape ? 841.89 : 595.28;
      const pageHeight = landscape ? 595.28 : 841.89;
      const { width, height } = computePlacement(
        options.orientation,
        pageWidth,
        pageHeight,
        jpgImage.width,
        jpgImage.height,
      );
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }
  }

  return await doc.save({ useObjectStreams: true, addDefaultPage: false });
}
