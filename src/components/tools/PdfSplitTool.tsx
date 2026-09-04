import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import {
  extractPdfPages,
  splitEveryPage,
  countPdfPages,
} from '../../lib/pdfSplitter';
import { formatFileSize } from '../../lib/pdfUtils';

type SplitMode = 'interval' | 'every-page';

const MODES: { id: SplitMode; label: string; desc: string }[] = [
  {
    id: 'interval',
    label: 'Intervalo Personalizado',
    desc: 'Digite intervalos como "1-3, 5, 8-10" para extrair páginas específicas.',
  },
  {
    id: 'every-page',
    label: 'Todas as Páginas Separadas',
    desc: 'Extrai cada página como um PDF individual de 1 página.',
  },
];

function parseInterval(input: string): number[] {
  const result: number[] = [];
  const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map(Number);
      if (!isNaN(from) && !isNaN(to) && from >= 1 && to >= from) {
        for (let i = from; i <= to; i++) result.push(i);
      }
    } else {
      const n = Number(part);
      if (!isNaN(n) && n >= 1) result.push(n);
    }
  }
  return Array.from(new Set(result)).sort((a, b) => a - b);
}

function formatInterval(input: string): string {
  const pages = parseInterval(input);
  return pages.length > 0 ? `→ ${pages.length} página(s)` : '';
}

export default function PdfSplitTool() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [mode, setMode] = useState<SplitMode>('interval');
  const [intervalInput, setIntervalInput] = useState('');
  const [parsedPages, setParsedPages] = useState<number[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [result, setResult] = useState<{
    type: 'single';
    bytes: Uint8Array;
    name: string;
  } | {
    type: 'multi';
    files: { bytes: Uint8Array; name: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const interactionCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pixPayload = generatePixCopyPaste();

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const selectFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return;
    setPdf(file);
    try {
      const count = await countPdfPages(file);
      setTotalPages(count);
    } catch {
      setTotalPages(0);
    }
    setResult(null);
    setError(null);
    setIntervalInput('');
    setParsedPages([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      selectFile(e.dataTransfer.files[0]);
    },
    [selectFile],
  );

  const handleIntervalChange = useCallback(
    (value: string) => {
      setIntervalInput(value);
      setParsedPages(parseInterval(value));
    },
    [],
  );

  const handleSplit = useCallback(async () => {
    if (!pdf || isSplitting) return;

    setResult(null);
    setError(null);
    setIsSplitting(true);

    // BatchLimiter assíncrono — nunca bloqueia a divisão
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      triggerSupportIfNeeded();
    });

    try {
      if (mode === 'every-page') {
        const files = await splitEveryPage(pdf);
        setResult({ type: 'multi', files });
      } else {
        if (parsedPages.length === 0) {
          throw new Error(
            'Nenhuma página válida. Digite intervalos como "1-3, 5, 8-10".',
          );
        }
        const bytes = await extractPdfPages(pdf, parsedPages);
        const baseName = pdf.name.toLowerCase().endsWith('.pdf')
          ? pdf.name.slice(0, -4)
          : pdf.name;
        const suffix =
          parsedPages.length === 1
            ? `_pagina_${parsedPages[0]}`
            : `_paginas_${parsedPages[0]}-${parsedPages[parsedPages.length - 1]}`;
        setResult({ type: 'single', bytes, name: `${baseName}${suffix}.pdf` });
      }
    } catch (err: any) {
      setError(err?.message ?? 'Ocorreu um erro ao dividir o PDF.');
      setResult(null);
    } finally {
      setIsSplitting(false);
    }
  }, [pdf, isSplitting, mode, parsedPages, triggerSupportIfNeeded]);

  const handleDownloadSingle = useCallback(() => {
    if (!result || result.type !== 'single') return;
    const objectUrl = URL.createObjectURL(
      new Blob([result.bytes], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = result.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }, [result]);

  const handleDownloadMulti = useCallback(
    (index: number) => {
      if (!result || result.type !== 'multi') return;
      const file = result.files[index];
      const objectUrl = URL.createObjectURL(
        new Blob([file.bytes], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    },
    [result],
  );

  const handleDownloadAll = useCallback(() => {
    if (!result || result.type !== 'multi') return;
    result.files.forEach((file, i) => {
      setTimeout(() => handleDownloadMulti(i), i * 500);
    });
  }, [result, handleDownloadMulti]);

  return (
    <div className="w-full max-w-4xl">
      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-red-800 bg-[#09090B] px-4 py-3">
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
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 transition-colors ${
          dragOver ? 'border-[#3F3F46] bg-[#18181B]' : 'border-[#27272A] bg-[#09090B]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {pdf ? (
          <>
            <span className="truncate font-mono text-sm text-white">
              {pdf.name}
            </span>
            <span className="font-mono text-xs text-[#52525B]">
              Tamanho: {formatFileSize(pdf.size)} · {totalPages} página(s)
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-white">Arraste um PDF aqui</span>
            <span className="font-mono text-xs text-[#52525B]">ou clique para selecionar</span>
          </>
        )}
      </div>

      {/* Mode selection */}
      {pdf && (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  setResult(null);
                  setError(null);
                }}
                className={`flex items-start gap-3 border border-[#27272A] bg-[#09090B] p-4 text-left transition-colors ${
                  mode === m.id ? 'border-[#3F3F46] bg-[#18181B]' : 'hover:border-[#3F3F46]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                    mode === m.id ? 'bg-white text-black' : 'text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm text-white">{m.label}</span>
                  <span className="text-xs leading-relaxed text-[#A1A1AA]">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Interval input */}
          {mode === 'interval' && (
            <div className="mt-4 flex flex-col gap-2">
              <label className="font-mono text-xs text-[#A1A1AA]">
                Páginas (ex: 1-3, 5, 8-10)
              </label>
              <input
                type="text"
                value={intervalInput}
                onChange={(e) => handleIntervalChange(e.target.value)}
                placeholder="1-3, 5, 8-10"
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#3F3F46] focus:outline-none"
              />
              {parsedPages.length > 0 && (
                <p className="font-mono text-xs text-[#A1A1AA]">
                  Selecionadas: {parsedPages.length} página(s)
                  {parsedPages.length > 0 && parsedPages.length <= totalPages
                    ? ` (intervalos válidos)`
                    : parsedPages.length > totalPages
                    ? ` — atenção: o documento tem ${totalPages} página(s)`
                    : ''}
                </p>
              )}
            </div>
          )}

          {/* Action */}
          <button
            onClick={handleSplit}
            disabled={isSplitting}
            className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
          >
            {isSplitting ? 'Dividindo...' : '[Dividir PDF]'}
          </button>

          {/* Result: single PDF */}
          {result && result.type === 'single' && (
            <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
              <p className="mb-3 font-mono text-sm text-green-400">
                PDF dividido com sucesso — {parsedPages.length} página(s).
              </p>
              <button
                onClick={handleDownloadSingle}
                className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                [Baixar PDF Dividido]
              </button>
            </div>
          )}

          {/* Result: multi-page PDFs */}
          {result && result.type === 'multi' && (
            <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
              <p className="mb-3 font-mono text-sm text-green-400">
                {result.files.length} PDFs gerados com sucesso.
              </p>
              <div className="mb-3 flex flex-col gap-1">
                {result.files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                  >
                    <span className="font-mono text-xs text-[#A1A1AA]">
                      {file.name}
                    </span>
                    <button
                      onClick={() => handleDownloadMulti(i)}
                      className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                    >
                      [Baixar]
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={handleDownloadAll}
                className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                [Baixar Todos os PDFs]
              </button>
            </div>
          )}

          <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
            Seu PDF é dividido 100% no navegador e nunca é enviado a servidores.
          </p>
        </>
      )}

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Ferramenta 100% gratuita e privada (zero servidores). Se te economizou
              tempo, considere apoiar o projeto com qualquer valor via Pix.
            </p>
            <div className="border border-[#27272A] bg-black px-4 py-3 text-center">
              <span className="font-mono text-sm text-white">
                Chave Pix: apoio@grupows.com
              </span>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(pixPayload);
                setPixCopied(true);
                setTimeout(() => setPixCopied(false), 2000);
              }}
              className="border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              {pixCopied ? '[Copiado com Sucesso!]' : '[Copiar Pix Copia e Cola]'}
            </button>
            <button
              onClick={() => setShowSupport(false)}
              className="self-center text-xs text-[#52525B] transition-colors hover:text-white"
            >
              Continuar sem apoiar →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
