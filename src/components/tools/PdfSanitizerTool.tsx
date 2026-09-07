import { useCallback, useRef, useState } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { formatFileSize } from '../../lib/pdfUtils';
import { downloadBlob } from '../../lib/exifUtils';
import {
  inspectPdfMetadata,
  sanitizePdfMetadata,
  getSanitizedFileName,
  type PdfMetadataSnapshot,
  type PdfSanitizeResult,
} from '../../lib/pdfSanitizeUtils';
import PixSupportModal from './PixSupportModal';

interface SelectedPdf {
  file: File;
  pages: number;
  meta: PdfMetadataSnapshot;
}

const ROW_DEFS: { key: keyof PdfMetadataSnapshot; label: string }[] = [
  { key: 'title', label: 'Título (Title)' },
  { key: 'author', label: 'Autor (Author)' },
  { key: 'subject', label: 'Assunto (Subject)' },
  { key: 'keywords', label: 'Palavras-chave (Keywords)' },
  { key: 'creator', label: 'Criador (Creator)' },
  { key: 'producer', label: 'Produtor (Producer)' },
  { key: 'creationDate', label: 'Data de criação' },
  { key: 'modificationDate', label: 'Data de modificação' },
];

function prettyValue(key: keyof PdfMetadataSnapshot, value: string | null): string {
  if (value === null) return '';
  if (key === 'creationDate' || key === 'modificationDate') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleString('pt-BR');
  }
  return value;
}

function formatDetection(meta: PdfMetadataSnapshot): string {
  const found = ROW_DEFS.filter((r) => meta[r.key]);
  if (found.length === 0) return 'Nenhum metadado detectado — arquivo já está limpo.';
  return `${found.length} campo(s) com dados ocultos encontrados.`;
}

export default function PdfSanitizerTool() {
  const [pdf, setPdf] = useState<SelectedPdf | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfSanitizeResult | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFile = useCallback(async (file: File) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Formato não suportado — envie um arquivo PDF.');
      return;
    }
    setError(null);
    setResult(null);
    setDownloaded(false);
    try {
      const inspection = await inspectPdfMetadata(file);
      setPdf({
        file,
        pages: inspection.pages,
        meta: inspection.meta,
      });
    } catch (err: any) {
      setPdf(null);
      setError(err?.message ?? 'Não foi possível ler o PDF.');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void addFile(file);
    },
    [addFile],
  );

  const removeFile = useCallback(() => {
    setPdf(null);
    setResult(null);
    setError(null);
    setDownloaded(false);
  }, []);

  const handleSanitize = useCallback(async () => {
    if (!pdf || isWorking) return;

    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      if (BatchLimiter.isLimitReached()) {
        setShowSupport(true);
      }
    });

    setError(null);
    setDownloaded(false);
    setIsWorking(true);
    try {
      const res = await sanitizePdfMetadata(pdf.file);
      setResult(res);
      const blob = new Blob([res.bytes.buffer as ArrayBuffer], {
        type: 'application/pdf',
      });
      downloadBlob(blob, getSanitizedFileName(pdf.file.name));
      setDownloaded(true);
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao sanitizar o PDF.');
    } finally {
      setIsWorking(false);
    }
  }, [pdf, isWorking]);

  const handleDownloadAgain = useCallback(() => {
    if (!result || !pdf) return;
    const blob = new Blob([result.bytes.buffer as ArrayBuffer], {
      type: 'application/pdf',
    });
    downloadBlob(blob, getSanitizedFileName(pdf.file.name));
    setDownloaded(true);
  }, [result, pdf]);

  const foundCount = pdf ? ROW_DEFS.filter((r) => pdf.meta[r.key]).length : 0;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 border border-red-900 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      {/* Drop zone */}
      {!pdf && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 transition-colors ${
            dragOver
              ? 'border-[#3F3F46] bg-[#18181B]'
              : 'border-[#27272A] bg-[#09090B]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addFile(file);
              e.target.value = '';
            }}
          />
          <span className="font-mono text-sm text-white">Arraste o PDF aqui</span>
          <span className="font-mono text-xs text-[#52525B]">
            ou clique para selecionar um arquivo .pdf
          </span>
        </div>
      )}

      {pdf && (
        <>
          {/* File header */}
          <div className="flex items-center justify-between gap-3 border border-[#27272A] bg-[#09090B] px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-mono text-sm text-white" title={pdf.file.name}>
                {pdf.file.name}
              </span>
              <span className="font-mono text-[11px] text-[#52525B]">
                {pdf.pages} página(s) · {formatFileSize(pdf.file.size)}
              </span>
            </div>
            <button
              onClick={removeFile}
              className="shrink-0 font-mono text-xs text-[#52525B] transition-colors hover:text-white"
            >
              [Remover X]
            </button>
          </div>

          {/* Inspection */}
          <div className="border border-[#27272A] bg-[#09090B]">
            <div className="flex items-center justify-between border-b border-[#27272A] px-4 py-3">
              <span className="font-mono text-sm text-white">
                // Metadados encontrados no documento
              </span>
              <span
                className={`font-mono text-[10px] ${
                  foundCount > 0 ? 'text-yellow-300' : 'text-green-400'
                }`}
              >
                {foundCount > 0 ? `[${foundCount} OCULTO(S)]` : '[LIMPO]'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <tbody>
                  {ROW_DEFS.map((r, i) => {
                    const raw = pdf.meta[r.key];
                    const value = prettyValue(r.key, raw);
                    return (
                      <tr key={r.key} className={i % 2 ? 'bg-black' : 'bg-[#09090B]'}>
                        <th className="w-1/3 border border-[#27272A] px-4 py-2 align-top font-mono text-[11px] font-normal text-[#52525B] sm:w-1/4">
                          {r.label}
                        </th>
                        <td className="border border-[#27272A] px-4 py-2">
                          {value ? (
                            <span className="break-all font-mono text-xs text-yellow-200">
                              {value}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-[#52525B]">
                              não definido
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="border-t border-[#27272A] px-4 py-3 font-mono text-[11px] text-[#A1A1AA]">
              {formatDetection(pdf.meta)} O nome do software (ex.: Microsoft Word, Adobe) e o autor
              ficam gravados no Info/XMP do PDF — é isso que será zerado.
            </p>
          </div>

          {/* Action */}
          <button
            onClick={() => void handleSanitize()}
            disabled={isWorking}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
          >
            {isWorking
              ? 'Sanitizando & removendo metadados…'
              : '[Sanitizar & Baixar PDF Limpo]'}
          </button>

          {isWorking && (
            <p className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
              Reconstruindo o PDF em memória e apagando histórico de autor/software…
            </p>
          )}

          {/* Success / zeroed alert */}
          {result && (
            <div className="flex flex-col gap-3 border border-green-800 bg-[#09090B] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-medium text-green-400">
                  [DADOS OCULTOS ZERADOS]
                </span>
                <span className="font-mono text-[10px] text-[#52525B]">
                  {result.pages} página(s) preservada(s) · {formatFileSize(result.size)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ROW_DEFS.map((r) => {
                  const before = prettyValue(r.key, result.before[r.key]);
                  return (
                    <div
                      key={r.key}
                      className="border border-[#27272A] bg-black px-3 py-2"
                    >
                      <span className="block font-mono text-[10px] text-[#52525B]">
                        {r.label}
                      </span>
                      <span className="block truncate font-mono text-xs" title={before}>
                        {before ? (
                          <span className="text-red-400">{before} →</span>
                        ) : (
                          <span className="text-[#52525B]">— →</span>
                        )}{' '}
                        <span className="text-green-400">removido</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleDownloadAgain}
                className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                {downloaded
                  ? '[Baixar PDF Limpo Novamente]'
                  : '[Baixar PDF Limpo]'}
              </button>
            </div>
          )}
        </>
      )}

      <p className="font-mono text-xs text-[#A1A1AA]">
        As páginas do documento são preservadas intactas; apenas o Info e o XMP (autor, software,
        datas, palavras-chave) são apagados. Tudo roda no seu navegador — o PDF nunca é enviado a
        servidores.
      </p>

      {/* Support Modal */}
      <PixSupportModal open={showSupport} onClose={() => setShowSupport(false)} />
    </div>
  );
}
