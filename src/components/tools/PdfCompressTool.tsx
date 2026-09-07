import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import ReferenceSources from '../ReferenceSources';
import { compressPDF, type CompressResult } from '../../lib/pdfCompressor';
import { formatFileSize } from '../../lib/pdfUtils';

type Level = 'leve' | 'moderada' | 'alta';

const LEVELS: { id: Level; label: string; desc: string; badge?: string }[] = [
  {
    id: 'leve',
    label: 'LEVE',
    desc: 'Mantém texto vetorial. Ideal para documentos gerados no Word/Docs.',
  },
  {
    id: 'moderada',
    label: 'MODERADA',
    desc: 'Equilíbrio ideal. Reduz imagens e escaneados com boa qualidade.',
    badge: 'PADRÃO',
  },
  {
    id: 'alta',
    label: 'ALTA',
    desc: 'Máxima compactação. Ideal para PDFs pesados ou fotos de documentos.',
  },
];

export default function PdfCompressTool() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>('moderada');
  const [isCompressing, setIsCompressing] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const selectFile = useCallback((file: File | undefined) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return;
    setPdf(file);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      selectFile(e.dataTransfer.files[0]);
    },
    [selectFile],
  );

  const handleCompress = useCallback(async () => {
    if (!pdf || isCompressing) return;

    setResult(null);
    setProgress(null);
    setError(null);
    setIsCompressing(true);

    // BatchLimiter atualiza de forma assíncrona e NUNCA bloqueia a compressão
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      triggerSupportIfNeeded();
    });

    try {
      const res = await compressPDF(pdf, level, (page, total) => {
        setProgress({ page, total });
      });
      // O resultado do PDF comprimido é salvo primeiro
      setResult(res);
    } catch (err: any) {
      // Qualquer erro exibe o banner vermelho em vez do modal
      setError(err?.message ?? 'Ocorreu um erro ao processar o PDF.');
      setResult(null);
    } finally {
      setProgress(null);
      setIsCompressing(false);
    }
  }, [pdf, isCompressing, level, triggerSupportIfNeeded]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const objectUrl = URL.createObjectURL(
      new Blob([result.bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = pdf ? `comprimido_${pdf.name}` : 'comprimido.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }, [result, pdf]);

  return (
    <div className="w-full max-w-2xl">
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
            <span className="truncate font-mono text-sm text-white">{pdf.name}</span>
            <span className="font-mono text-xs text-[#52525B]">
              Tamanho original: {formatFileSize(pdf.size)}
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-white">Arraste um PDF aqui</span>
            <span className="font-mono text-xs text-[#52525B]">ou clique para selecionar</span>
          </>
        )}
      </div>

      {/* Level selection */}
      <div className="mt-4 flex flex-col gap-2">
        {LEVELS.map((lvl) => (
          <button
            key={lvl.id}
            onClick={() => setLevel(lvl.id)}
            className={`flex items-start gap-3 border border-[#27272A] bg-[#09090B] p-4 text-left transition-colors ${
              level === lvl.id ? 'border-[#3F3F46] bg-[#18181B]' : 'hover:border-[#3F3F46]'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                level === lvl.id ? 'bg-white text-black' : 'text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-mono text-sm text-white">
                {lvl.label}
                {lvl.badge && (
                  <span className="border border-[#27272A] bg-black px-1.5 py-0.5 font-mono text-[10px] text-[#A1A1AA]">
                    {lvl.badge}
                  </span>
                )}
              </span>
              <span className="text-xs leading-relaxed text-[#A1A1AA]">{lvl.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Progress indicator */}
      {progress && (
        <p className="mt-4 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
          Processando página {progress.page} de {progress.total}...
        </p>
      )}

      {/* Action */}
      <button
        onClick={handleCompress}
        disabled={!pdf || isCompressing}
        className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
      >
        {isCompressing ? 'Comprimindo...' : '[Comprimir PDF]'}
      </button>

      {/* Result panel */}
      {result && (
        <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
          <div className="mb-3 flex flex-col gap-1">
            <span className="font-mono text-sm text-green-400">
              Novo tamanho: {formatFileSize(result.compressedSize)}
            </span>
            <span className="font-mono text-xs text-[#A1A1AA]">
              Economia de {result.reductionPercent.toFixed(1)}%
            </span>
          </div>
          <button
            onClick={handleDownload}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
          >
            [Baixar PDF Otimizado]
          </button>
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Seu PDF é comprimido 100% no navegador e nunca é enviado a servidores.
      </p>

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

      <ReferenceSources
        sources={[
          {
            label: 'ISO 32000 — PDF (Portable Document Format) Specification',
            href: 'https://www.iso.org/standard/75839.html',
          },
        ]}
      />
    </div>
  );
}
