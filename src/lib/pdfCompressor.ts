import { PDFDocument } from 'pdf-lib';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

export type CompressLevel = 'leve' | 'moderada' | 'alta';

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}

export interface ProgressCallback {
  (pageIndex: number, totalPages: number): void;
}

const PROFILE: Record<
  CompressLevel,
  { scale: number; jpegQuality: number; useCanvas: boolean }
> = {
  leve: { scale: 1, jpegQuality: 1, useCanvas: false },
  moderada: { scale: 0.85, jpegQuality: 0.65, useCanvas: true },
  alta: { scale: 0.7, jpegQuality: 0.45, useCanvas: true },
};

async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  return pdfjs;
}

async function renderPageToBlob(
  pdf: any,
  pageNumber: number,
  scale: number,
  jpegQuality: number,
): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  await page.render({ canvasContext: ctx, viewport }).promise;

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      jpegQuality,
    );
  });
}

export async function compressPDF(
  file: File,
  level: CompressLevel,
  onProgress?: ProgressCallback,
): Promise<CompressResult> {
  const profile = PROFILE[level];

  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // ── PERFIL LEVE: otimização estrutural pura (preserva vetor 100%) ──
  if (profile.useCanvas === false) {
    let doc;
    try {
      doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
    } catch (err: any) {
      throw new Error(
        `Falha ao abrir o PDF: ${err?.message ?? 'Documento inválido ou corrompido.'}`,
      );
    }
    const optimized = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    return {
      bytes: optimized,
      originalSize,
      compressedSize: optimized.length,
      reductionPercent:
        originalSize > 0 ? Math.max(0, ((originalSize - optimized.length) / originalSize) * 100) : 0,
    };
  }

  // ── PERFIS MODERADA / ALTA: render em Canvas + re-encode JPEG ──
  let pdf: any;
  try {
    const pdfjs = await getPdfjs();
    pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  } catch (err: any) {
    await pdf?.destroy?.().catch(() => {});
    throw new Error(
      `Falha ao abrir o PDF: ${err?.name ?? 'Erro'}. ${err?.message ?? 'Documento inválido ou corrompido.'}`,
    );
  }

  const totalPages = pdf.numPages;
  const outDoc = await PDFDocument.create();

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(i, totalPages);
      let blob: Blob;
      try {
        blob = await renderPageToBlob(pdf, i, profile.scale, profile.jpegQuality);
      } catch (err: any) {
        throw new Error(
          `Falha ao processar a página ${i} de ${totalPages}: ${err?.message ?? 'erro de renderização'}`,
        );
      }
      const pageBuffer = new Uint8Array(await blob.arrayBuffer());
      const jpgImage = await outDoc.embedJpg(pageBuffer);

      const existing = await pdf.getPage(i);
      const viewport = existing.getViewport({ scale: 1 });
      const { width, height } = viewport;

      const scaledWidth = width * profile.scale;
      const scaledHeight = height * profile.scale;

      const newPage = outDoc.addPage([scaledWidth, scaledHeight]);
      newPage.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width: scaledWidth,
        height: scaledHeight,
      });
    }
  } finally {
    await pdf.destroy?.().catch(() => {});
  }

  const optimized = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });

  return {
    bytes: optimized,
    originalSize,
    compressedSize: optimized.length,
    reductionPercent:
      originalSize > 0 ? Math.max(0, ((originalSize - optimized.length) / originalSize) * 100) : 0,
  };
}
