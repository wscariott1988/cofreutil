import { PDFDocument } from 'pdf-lib';

/**
 * Extrai as páginas indicadas (índices 1-based) do PDF original e
 * retorna um novo buffer Uint8Array com apenas essas páginas.
 */
export async function extractPdfPages(
  file: File,
  pageIndexes: number[],
): Promise<Uint8Array> {
  if (pageIndexes.length === 0) {
    throw new Error('Nenhuma página foi selecionada para extração.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  let doc;
  try {
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch (err: any) {
    throw new Error(
      `Falha ao abrir o PDF: ${err?.message ?? 'Documento inválido ou corrompido.'}`,
    );
  }

  const total = doc.getPageCount();
  const unique = Array.from(new Set(pageIndexes))
    .filter((i) => i >= 1 && i <= total)
    .sort((a, b) => a - b);

  if (unique.length === 0) {
    throw new Error(`Nenhum índice de página válido. O documento tem ${total} página(s).`);
  }

  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(doc, unique.map((i) => i - 1));
  copied.forEach((page) => outDoc.addPage(page));

  return await outDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

/**
 * Extrai cada página do PDF original como um PDF individual de 1 página.
 * Retorna um array de { bytes, name } para download múltiplo.
 */
export async function splitEveryPage(
  file: File,
): Promise<{ bytes: Uint8Array; name: string }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  let doc;
  try {
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch (err: any) {
    throw new Error(
      `Falha ao abrir o PDF: ${err?.message ?? 'Documento inválido ou corrompido.'}`,
    );
  }

  const total = doc.getPageCount();
  const baseName = file.name.toLowerCase().endsWith('.pdf')
    ? file.name.slice(0, -4)
    : file.name;

  const results: { bytes: Uint8Array; name: string }[] = [];

  for (let i = 1; i <= total; i++) {
    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(doc, [i - 1]);
    copied.forEach((page) => outDoc.addPage(page));
    const bytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });
    results.push({ bytes, name: `${baseName}_pagina_${i}.pdf` });
  }

  return results;
}

/** Conta o total de páginas de um PDF sem carregá-lo completamente em memória pesada. */
export async function countPdfPages(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return doc.getPageCount();
}
