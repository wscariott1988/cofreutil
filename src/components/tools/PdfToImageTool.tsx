import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  openPdf,
  closePdf,
  parsePageSelection,
  renderPageImageBlob,
  renderPageThumbnails,
  imageFileName,
  downloadBlob,
  type ImageFormat,
  type PdfDocumentRef,
  type PageThumbnail,
} from '../../lib/pdfToImageUtils';

const THUMB_SCALE = 0.5;
const MAX_THUMBS = 60;

type PageMode = 'all' | 'custom';

const FORMATS: { id: ImageFormat; label: string; desc: string }[] = [
  { id: 'png', label: 'PNG', desc: 'Sem perdas · maior arquivo' },
  { id: 'jpeg', label: 'JPEG', desc: 'Compacto · sem transparência' },
  { id: 'webp', label: 'WEBP', desc: 'Eficiente · qualidade/ tamanho' },
];

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export default function PdfToImageTool() {
  const [pdf, setPdf] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [thumbs, setThumbs] = useState<PageThumbnail[]>([]);
  const [thumbCapped, setThumbCapped] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<'idle' | 'rendering' | 'done'>('idle');
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 });

  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(80);
  const [pageMode, setPageMode] = useState<PageMode>('all');
  const [pageInput, setPageInput] = useState('');

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [remaining, setRemaining] = useState(() => BatchLimiter.getRemaining());
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const docRef = useRef<PdfDocumentRef | null>(null);
  const versionRef = useRef(0);
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

  const cancelPdfLoad = useCallback(() => {
    versionRef.current += 1;
    closePdf(docRef.current).catch(() => {});
    docRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      versionRef.current += 1;
      closePdf(docRef.current).catch(() => {});
    };
  }, []);

  const selectFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!isPdfFile(file)) {
        setError('Formato inválido. Selecione um arquivo .pdf.');
        return;
      }

      const version = ++versionRef.current;
      await closePdf(docRef.current).catch(() => {});
      docRef.current = null;

      setPdf(file);
      setNumPages(0);
      setThumbs([]);
      setThumbCapped(false);
      setThumbStatus('rendering');
      setThumbProgress({ done: 0, total: 0 });
      setDoneMessage(null);
      setExportProgress(null);
      setError(null);
      setPageInput('');
      setPageMode('all');

      try {
        const ref = await openPdf(file);
        if (versionRef.current !== version) {
          await closePdf(ref).catch(() => {});
          return;
        }
        docRef.current = ref;
        setNumPages(ref.numPages);

        const show = Math.min(ref.numPages, MAX_THUMBS);
        const pageThumbs = await renderPageThumbnails(
          ref.doc,
          show,
          THUMB_SCALE,
          (done, total) => {
            if (versionRef.current !== version) return;
            setThumbProgress({ done, total });
          },
        );
        if (versionRef.current !== version) return;
        setThumbs(pageThumbs);
        setThumbCapped(ref.numPages > MAX_THUMBS);
        setThumbStatus('done');
      } catch (err: any) {
        if (versionRef.current !== version) return;
        setError(err?.message ?? 'Ocorreu um erro ao ler o PDF.');
        setThumbStatus('idle');
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      selectFile(e.dataTransfer.files[0]);
    },
    [selectFile],
  );

  const handleRemovePdf = useCallback(() => {
    versionRef.current += 1;
    closePdf(docRef.current).catch(() => {});
    docRef.current = null;
    setPdf(null);
    setNumPages(0);
    setThumbs([]);
    setThumbCapped(false);
    setThumbStatus('idle');
    setThumbProgress({ done: 0, total: 0 });
    setError(null);
    setDoneMessage(null);
    setExportProgress(null);
  }, []);

  const customPages = useMemo(
    () => (numPages > 0 ? parsePageSelection(pageInput, numPages) : []),
    [pageInput, numPages],
  );

  const allPages = useMemo(() => {
    const pages: number[] = [];
    for (let i = 1; i <= numPages; i++) pages.push(i);
    return pages;
  }, [numPages]);

  const runExport = useCallback(
    async (pages: number[]) => {
      const ref = docRef.current;
      if (!ref || isExporting) return;
      if (pages.length === 0) {
        setError('Nenhuma página válida selecionada. Confira o campo de páginas.');
        return;
      }

      setError(null);
      setDoneMessage(null);
      setExportProgress(null);
      setIsExporting(true);

      // BatchLimiter assíncrono — nunca bloqueia a exportação
      Promise.resolve().then(() => {
        BatchLimiter.incrementUsage(1);
        setRemaining(BatchLimiter.getRemaining());
        triggerSupportIfNeeded();
        if (BatchLimiter.isLimitReached()) setShowSupport(true);
      });

      const fmt = format;
      const q = quality;
      const base = ref.baseName;

      try {
        for (let i = 0; i < pages.length; i++) {
          const pageNumber = pages[i];
          setExportProgress({ done: i + 1, total: pages.length });
          const blob = await renderPageImageBlob(ref.doc, pageNumber, fmt, q);
          const filename = imageFileName(base, pageNumber, fmt);
          setTimeout(() => downloadBlob(blob, filename), i * 500);
        }
        const label = fmt.toUpperCase();
        setDoneMessage(
          `${pages.length} ${pages.length === 1 ? 'imagem' : 'imagens'} ${label} ${pages.length === 1 ? 'gerada' : 'geradas'} — confira seus downloads.`,
        );
      } catch (err: any) {
        setError(err?.message ?? 'Ocorreu um erro ao exportar as imagens.');
      } finally {
        setIsExporting(false);
        setExportProgress(null);
      }
    },
    [isExporting, format, quality, triggerSupportIfNeeded],
  );

  const handleDownloadSingle = useCallback(
    (pageNumber: number) => {
      runExport([pageNumber]);
    },
    [runExport],
  );

  const selectedForDownload = useMemo(() => {
    if (pageMode === 'all') return allPages;
    return customPages;
  }, [pageMode, allPages, customPages]);

  const handlePageInput = useCallback(
    (value: string) => {
      setPageInput(value);
      setDoneMessage(null);
      setError(null);
    },
    [],
  );

  const showQuality = format !== 'png';

  return (
    <div className="w-full max-w-4xl rounded-none">
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-none border border-dashed px-6 py-14 transition-colors ${
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
              Tamanho: {formatFileSize(pdf.size)} · {numPages} página(s)
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemovePdf();
              }}
              className="mt-1 border border-[#27272A] px-2 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
            >
              [Remover PDF]
            </button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-white">Arraste um PDF aqui</span>
            <span className="font-mono text-xs text-[#52525B]">ou clique para selecionar</span>
          </>
        )}
      </div>

      {pdf && (
        <>
          {/* Miniaturas em andamento */}
          {thumbStatus === 'rendering' && (
            <p className="mt-4 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
              Renderizando pré-visualização das páginas ({thumbProgress.done}/
              {thumbProgress.total || '…'})...
            </p>
          )}

          {/* Painel de controles */}
          {thumbStatus === 'done' && (
            <div className="mt-4 flex flex-col gap-6 border border-[#27272A] bg-[#09090B] p-4 md:p-6">
              {/* Formato de saída */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-xs text-[#A1A1AA]">
                  {"// formato de saída"}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {FORMATS.map((f) => {
                    const active = format === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setFormat(f.id);
                          setDoneMessage(null);
                        }}
                        className={`flex flex-col items-start gap-1 rounded-none border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#3F3F46] bg-[#18181B]'
                            : 'border-[#27272A] hover:border-[#3F3F46]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 font-mono text-sm">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                              active ? 'bg-white text-black' : 'text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span className={active ? 'text-white' : 'text-[#A1A1AA]'}>
                            {f.label}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] leading-tight text-[#52525B]">
                          {f.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Qualidade */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#A1A1AA]">
                    {"// qualidade"}
                  </span>
                  <span className="font-mono text-sm text-white">{quality}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  disabled={!showQuality}
                  onChange={(e) => {
                    setQuality(Number(e.target.value));
                    setDoneMessage(null);
                  }}
                  className={`w-full accent-white disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-label="Qualidade de exportação"
                />
                {showQuality ? (
                  <p className="font-mono text-[11px] leading-relaxed text-[#52525B]">
                    10% = menor peso · 100% = qualidade máxima ({format.toUpperCase()}).
                  </p>
                ) : (
                  <p className="font-mono text-[11px] leading-relaxed text-[#52525B]">
                    PNG é sem perdas (lossless) — a qualidade é sempre máxima.
                  </p>
                )}
              </div>

              {/* Seleção de páginas */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-xs text-[#A1A1AA]">
                  {"// seleção de páginas"}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setPageMode('all');
                      setDoneMessage(null);
                    }}
                    className={`flex items-start gap-2 rounded-none border p-3 text-left transition-colors ${
                      pageMode === 'all'
                        ? 'border-[#3F3F46] bg-[#18181B]'
                        : 'border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                        pageMode === 'all' ? 'bg-white text-black' : 'text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`font-mono text-sm ${pageMode === 'all' ? 'text-white' : 'text-[#A1A1AA]'}`}
                    >
                      Todas as Páginas
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setPageMode('custom');
                      setDoneMessage(null);
                    }}
                    className={`flex items-start gap-2 rounded-none border p-3 text-left transition-colors ${
                      pageMode === 'custom'
                        ? 'border-[#3F3F46] bg-[#18181B]'
                        : 'border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                        pageMode === 'custom' ? 'bg-white text-black' : 'text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`font-mono text-sm ${pageMode === 'custom' ? 'text-white' : 'text-[#A1A1AA]'}`}
                    >
                      Páginas Específicas
                    </span>
                  </button>
                </div>

                {pageMode === 'custom' && (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={pageInput}
                      onChange={(e) => handlePageInput(e.target.value)}
                      placeholder="ex: 1, 3, 5-7"
                      className="rounded-none border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#3F3F46] focus:outline-none"
                    />
                    <p className="font-mono text-xs text-[#A1A1AA]">
                      {customPages.length > 0
                        ? `Páginas selecionadas: ${customPages.join(', ')}`
                        : pageInput.trim()
                          ? 'Nenhuma página válida — o documento tem ' +
                            `${numPages} página(s). Use formatos como "1", "1,3" ou "1-5".`
                          : `Documento com ${numPages} página(s). Ex: "1, 3, 5-7".`}
                    </p>
                  </div>
                )}

                <p className="font-mono text-[11px] text-[#52525B]">
                  {pageMode === 'all'
                    ? `→ ${allPages.length} página(s) serão exportadas`
                    : `→ ${customPages.length} página(s) válida(s) serão exportadas`}
                </p>
              </div>

              {/* Ações */}
              <div className="flex flex-col gap-2">
                {isExporting && exportProgress && (
                  <p className="border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-[#A1A1AA]">
                    Renderizando página {exportProgress.done} de {exportProgress.total}...
                  </p>
                )}
                <button
                  onClick={() => runExport(selectedForDownload)}
                  disabled={isExporting || selectedForDownload.length === 0}
                  className="w-full rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
                >
                  {isExporting
                    ? 'Exportando...'
                    : `[Baixar Páginas Selecionadas (${selectedForDownload.length})]`}
                </button>
                <button
                  onClick={() => runExport(allPages)}
                  disabled={isExporting || allPages.length === 0}
                  className="w-full rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
                >
                  {isExporting
                    ? 'Exportando...'
                    : `[Baixar Todas como Imagens (${allPages.length})]`}
                </button>

                {doneMessage && (
                  <p className="border border-green-800 bg-[#09090B] px-4 py-3 font-mono text-sm text-green-400">
                    {doneMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Grid de pré-visualização */}
          {thumbStatus === 'done' && thumbs.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-xs text-[#A1A1AA]">
                  {"// pré-visualização das páginas"}
                </h2>
                {thumbCapped && (
                  <span className="font-mono text-[11px] text-[#52525B]">
                    Documento tem {numPages} páginas — exibindo as {thumbs.length} primeiras.
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {thumbs.map((thumb) => (
                  <div
                    key={thumb.pageNumber}
                    className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-[#52525B]">
                        Página {thumb.pageNumber} / {numPages}
                      </span>
                      <span className="font-mono text-[11px] text-[#52525B]">
                        {format.toUpperCase()}
                      </span>
                    </div>
                    <div className="max-h-56 w-full overflow-hidden border border-[#27272A] bg-black">
                      <img
                        src={thumb.dataUrl}
                        alt={`Pré-visualização da página ${thumb.pageNumber}`}
                        className="h-auto w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <button
                      onClick={() => handleDownloadSingle(thumb.pageNumber)}
                      disabled={isExporting}
                      className="mt-auto w-full rounded-none border border-[#27272A] px-2 py-1.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-40"
                    >
                      [Baixar Imagem]
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 font-mono text-xs text-[#A1A1AA]">
            Seu PDF é convertido 100% no navegador e nunca é enviado a servidores.
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#52525B]">
            {remaining > 0
              ? `${remaining} ${remaining === 1 ? 'conversão' : 'conversões'} sem lembrete de apoio`
              : 'Obrigado pelo seu apoio!'}
          </p>
        </>
      )}

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 rounded-none border border-[#27272A] bg-[#09090B] p-8">
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
              className="rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
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
