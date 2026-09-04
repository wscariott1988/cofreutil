/* =============================================================================
 * pdfSanitizeUtils.ts — Sanitizador de Metadados de PDF 100% local
 * -----------------------------------------------------------------------------
 * Carrega o PDF com pdf-lib e reescreve em memória TODOS os campos de metadados
 * do Info (Author, Creator, Producer, Title, Subject, Keywords, CreationDate e
 * ModificationDate) e remove o stream XMP do catálogo. As páginas, formulários
 * e anotações são preservadas intactas — apenas o "DNA" de autoria é zerado.
 * Nenhum byte do documento sai do navegador.
 * ========================================================================== */

export interface PdfMetadataSnapshot {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modificationDate: string | null;
}

export interface PdfMetadataInspection {
  meta: PdfMetadataSnapshot;
  pages: number;
  fileSize: number;
}

export interface PdfSanitizeResult {
  bytes: Uint8Array;
  size: number;
  pages: number;
  before: PdfMetadataSnapshot;
  after: PdfMetadataSnapshot;
}

const EMPTY_META: PdfMetadataSnapshot = {
  title: null,
  author: null,
  subject: null,
  keywords: null,
  creator: null,
  producer: null,
  creationDate: null,
  modificationDate: null,
};

const metaFromStrings = (v: string | undefined): string | null =>
  v === undefined ? null : v.trim();

async function loadPdfDocument(file: File): Promise<any> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err: any) {
    const name = String(err?.name ?? '');
    const message = String(err?.message ?? '');
    if (name === 'EncryptedPDFError' || /encrypt/i.test(message)) {
      throw new Error(
        'Este PDF é protegido por senha/criptografia. Remova a proteção antes de sanitizar os metadados.',
      );
    }
    throw new Error('Arquivo inválido — não foi possível abrir o PDF.');
  }
}

/** Lê todos os metadados padrão do documento (antes da limpeza). */
export function readMetadataSnapshot(doc: any): PdfMetadataSnapshot {
  const toIso = (d: Date | undefined): string | null => {
    if (!d || isNaN(d.getTime())) return null;
    return d.toISOString();
  };
  return {
    title: metaFromStrings(doc.getTitle?.()),
    author: metaFromStrings(doc.getAuthor?.()),
    subject: metaFromStrings(doc.getSubject?.()),
    keywords: metaFromStrings(doc.getKeywords?.()),
    creator: metaFromStrings(doc.getCreator?.()),
    producer: metaFromStrings(doc.getProducer?.()),
    creationDate: toIso(doc.getCreationDate?.()),
    modificationDate: toIso(doc.getModificationDate?.()),
  };
}

/** Inspeciona os metadados encontrados em um PDF (pré-visualização). */
export async function inspectPdfMetadata(file: File): Promise<PdfMetadataInspection> {
  const doc = await loadPdfDocument(file);
  const meta = readMetadataSnapshot(doc);
  return {
    meta,
    pages: doc.getPageCount(),
    fileSize: file.size,
  };
}

/**
 * Zera em memória todos os metadados do documento.
 *
 * Campos de texto são estritamente reescritos para vazio; as datas são
 * removidas do dicionário Info e o stream de metadados XMP é apagado do
 * catálogo. As páginas não são tocadas.
 */
async function clearDocumentMetadata(doc: any): Promise<void> {
  const { PDFName } = await import('pdf-lib');

  // Remove TODAS as propriedades padrão do Info (Author, Creator, Producer,
  // Title, Subject, Keywords, CreationDate e ModDate). Remover a chave é mais
  // forte do que reescrever para vazio: o leitor de PDF passa a reportar
  // "não definido" em vez de uma string vazia.
  const infoRef = doc.context?.trailerInfo?.Info as any;
  const infoDict = infoRef ? doc.context.lookup(infoRef) : null;
  if (infoDict && typeof infoDict.delete === 'function') {
    const keys = [
      'Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer',
      'CreationDate', 'ModDate',
    ];
    for (const key of keys) {
      try {
        infoDict.delete(PDFName.of(key));
      } catch {
        // segue mesmo se o Info for atípico
      }
    }
  }

  // Apaga o pacote XMP que duplica metadados (Adobe/Word/Google Docs).
  try {
    if (doc.catalog && typeof doc.catalog.delete === 'function') {
      doc.catalog.delete(PDFName.of('Metadata'));
    }
  } catch {
    // catálogo sem Metadata é o caso normal após a limpeza
  }
}

/**
 * Sanitiza o PDF: reescreve/remove os metadados e devolve os bytes do arquivo
 * limpo, mantendo as páginas intactas.
 */
export async function sanitizePdfMetadata(file: File): Promise<PdfSanitizeResult> {
  const doc = await loadPdfDocument(file);
  const before = readMetadataSnapshot(doc);
  const pages = doc.getPageCount();

  await clearDocumentMetadata(doc);

  const after = readMetadataSnapshot(doc);
  const bytes = await doc.save();
  return { bytes, size: bytes.length, pages, before, after };
}

/** Gera o nome do arquivo sanitizado, ex: "contrato.pdf" → "contrato-sem-metadados.pdf". */
export function getSanitizedFileName(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : '';
  return `${base}-sem-metadados${ext}`;
}

/** Indica se ainda restou algum metadado (para o alerta de sucesso). */
export function hasResidualMetadata(meta: PdfMetadataSnapshot): boolean {
  return Object.values(meta).some((v) => v !== null && v !== '');
}

export { EMPTY_META };
