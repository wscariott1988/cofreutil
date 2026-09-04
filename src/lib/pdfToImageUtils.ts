import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface PdfDocumentRef {
  doc: any;
  numPages: number;
  baseName: string;
}

export interface PageThumbnail {
  pageNumber: number;
  dataUrl: string;
}

type PdfJsModule = typeof import('pdfjs-dist');

const FORMAT_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const FORMAT_EXT: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

function getPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Abre o PDF via pdf.js e devolve uma referência com número total de páginas. */
export async function openPdf(file: File): Promise<PdfDocumentRef> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  } catch (err: any) {
    throw new Error(
      `Falha ao abrir o PDF: ${err?.message ?? 'Documento inválido ou corrompido.'}`,
    );
  }
  const baseName = file.name.toLowerCase().endsWith('.pdf')
    ? file.name.slice(0, -4)
    : file.name;
  return { doc, numPages: doc.numPages, baseName };
}

/** Libera a memória interna do documento pdf.js. */
export async function closePdf(ref: PdfDocumentRef | null): Promise<void> {
  try {
    await ref?.doc?.destroy?.();
  } catch {
    // ignora falhas no encerramento
  }
}

/**
 * Interpreta uma seleção textual de páginas ("1, 3, 5-7").
 * Retorna índices 1-based válidos, únicos e ordenados.
 */
export function parsePageSelection(input: string, totalPages: number): number[] {
  const result: number[] = [];
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map(Number);
      if (Number.isFinite(from) && Number.isFinite(to) && from >= 1 && to >= from) {
        for (let p = from; p <= Math.min(to, totalPages); p++) result.push(p);
      }
    } else {
      const n = Number(part);
      if (Number.isInteger(n) && n >= 1 && n <= totalPages) result.push(n);
    }
  }
  return Array.from(new Set(result)).sort((a, b) => a - b);
}

/** Renderiza uma página do PDF em um <canvas> HTML5 (fundo branco). */
export async function renderPageToCanvas(
  doc: any,
  pageNumber: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Seu navegador não suporta Canvas 2D.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** Converte um canvas em Blob nos formatos PNG/JPEG/WEBP com qualidade. */
export function canvasToImageBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const mime = FORMAT_MIME[format];
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new Error(
              format === 'webp'
                ? 'Seu navegador não suporta exportar WEBP. Tente PNG ou JPEG.'
                : 'Falha ao gerar o arquivo de imagem.',
            ),
          );
        }
      },
      mime,
      quality,
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler a imagem gerada.'));
    reader.readAsDataURL(blob);
  });
}

/** Dispara o download de um Blob e revoga o object URL em seguida. */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/**
 * Escala de rasterização conforme o formato e a qualidade (10–100%).
 * PNG é sem perdas e usa escala fixa de 2x; JPEG/WEBP crescem de ~0,65x a 2x.
 */
export function effectiveScale(format: ImageFormat, quality: number): number {
  return format === 'png' ? 2 : 0.5 + (quality / 100) * 1.5;
}

/** Qualidade de encode: PNG ignora (1.0); JPEG/WEBP usam qualidade/100. */
export function effectiveQuality(format: ImageFormat, quality: number): number {
  return format === 'png' ? 1 : quality / 100;
}

/** Renderiza uma página do PDF e devolve um Blob de imagem já codificado. */
export async function renderPageImageBlob(
  doc: any,
  pageNumber: number,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const canvas = await renderPageToCanvas(
    doc,
    pageNumber,
    effectiveScale(format, quality),
  );
  return canvasToImageBlob(canvas, format, effectiveQuality(format, quality));
}

export function imageFileName(
  baseName: string,
  pageNumber: number,
  format: ImageFormat,
): string {
  return `${baseName}_pagina_${String(pageNumber).padStart(2, '0')}.${FORMAT_EXT[format]}`;
}

/** Gera miniaturas (data URLs) de cada página para o grid de pré-visualização. */
export async function renderPageThumbnails(
  doc: any,
  totalPages: number,
  thumbScale: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PageThumbnail[]> {
  const thumbs: PageThumbnail[] = [];
  for (let i = 1; i <= totalPages; i++) {
    const canvas = await renderPageToCanvas(doc, i, thumbScale);
    const blob = await canvasToImageBlob(canvas, 'png', 1);
    const dataUrl = await blobToDataUrl(blob);
    thumbs.push({ pageNumber: i, dataUrl });
    onProgress?.(i, totalPages);
  }
  return thumbs;
}
