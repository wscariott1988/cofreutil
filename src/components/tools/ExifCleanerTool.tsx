import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import {
  stripExifMetadata,
  downloadBlob,
  getCleanFileName,
  isSupportedExifImage,
} from '../../lib/exifUtils';
import { formatFileSize } from '../../lib/pdfUtils';

interface CleanImage {
  file: File;
  id: string;
  preview: string;
  status: 'waiting' | 'processing' | 'clean' | 'error';
  cleanBlob: Blob | null;
  cleanSize: number;
  error: string | null;
}

const MAX_IMAGES_PER_BATCH = 3;
const ACCEPTED = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

const STATUS_LABEL: Record<CleanImage['status'], string> = {
  waiting: 'AGUARDANDO',
  processing: 'LIMPANDO...',
  clean: 'EXIF REMOVIDO',
  error: 'ERRO',
};

const STATUS_CLASS: Record<CleanImage['status'], string> = {
  waiting: 'text-[#52525B]',
  processing: 'text-[#A1A1AA]',
  clean: 'text-green-400',
  error: 'text-red-400',
};

export default function ExifCleanerTool() {
  const [images, setImages] = useState<CleanImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const interactionCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pixPayload = generatePixCopyPaste();

  const imagesRef = useRef(images);
  imagesRef.current = images;

  const cleanCount = images.filter((img) => img.status === 'clean').length;
  const totalCleanSize = images
    .filter((img) => img.status === 'clean')
    .reduce((acc, img) => acc + img.cleanSize, 0);
  const pendingCount = images.filter((img) => img.status !== 'clean').length;

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const accepted = Array.from(list).filter(isSupportedExifImage);

    if (accepted.length === 0) {
      setLimitMsg('Formato não suportado — envie apenas JPG, PNG ou WEBP.');
      return;
    }

    const current = imagesRef.current.length;
    const slots = Math.max(0, MAX_IMAGES_PER_BATCH - current);
    const fit = accepted.slice(0, slots);
    const overflow = accepted.length - fit.length;

    if (fit.length === 0) {
      setLimitMsg(
        `Limite gratuito de ${MAX_IMAGES_PER_BATCH} imagens por lote atingido. Remova uma imagem ou inicie um novo lote.`,
      );
      return;
    }

    if (overflow > 0) {
      setLimitMsg(
        `${overflow} imagem(ns) ignorada(s) — o lote gratuito aceita até ${MAX_IMAGES_PER_BATCH} imagens por vez.`,
      );
    } else {
      setLimitMsg(null);
    }

    const enriched: CleanImage[] = fit.map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      preview: URL.createObjectURL(file),
      status: 'waiting',
      cleanBlob: null,
      cleanSize: 0,
      error: null,
    }));

    setImages((prev) => [...prev, ...enriched]);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((img) => img.id !== id);
    });
    setLimitMsg(null);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<CleanImage>) => {
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...patch } : img)),
      );
    },
    [],
  );

  const handleClean = useCallback(async () => {
    const targets = imagesRef.current.filter((img) => img.status !== 'clean');
    if (targets.length === 0 || isProcessing) return;

    setError(null);
    setIsProcessing(true);

    // BatchLimiter atualiza de forma assíncrona e nunca bloqueia a limpeza
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      triggerSupportIfNeeded();
    });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      patchItem(item.id, { status: 'processing', error: null });
      setProgress(
        `Limpando ${i + 1} de ${targets.length}: ${item.file.name}...`,
      );
      try {
        const blob = await stripExifMetadata(item.file);
        patchItem(item.id, {
          status: 'clean',
          cleanBlob: blob,
          cleanSize: blob.size,
        });
      } catch (err: any) {
        patchItem(item.id, {
          status: 'error',
          error: err?.message ?? `Falha ao limpar "${item.file.name}".`,
        });
      }
    }

    setProgress(null);
    setIsProcessing(false);
  }, [isProcessing, patchItem, triggerSupportIfNeeded]);

  const handleDownloadOne = useCallback((id: string) => {
    const target = imagesRef.current.find((img) => img.id === id);
    if (!target || !target.cleanBlob) return;
    downloadBlob(target.cleanBlob, getCleanFileName(target.file.name));
  }, []);

  const handleDownloadAll = useCallback(() => {
    const clean = imagesRef.current.filter(
      (img) => img.status === 'clean' && img.cleanBlob,
    );
    clean.forEach((img, i) => {
      setTimeout(() => {
        downloadBlob(img.cleanBlob!, getCleanFileName(img.file.name));
      }, i * 500);
    });
  }, []);

  const handleNewBatch = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setLimitMsg(null);
    setError(null);
  }, []);

  const canAddMore = images.length < MAX_IMAGES_PER_BATCH;

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

      {/* Limit warning banner */}
      {limitMsg && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-yellow-900 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-yellow-300">{limitMsg}</span>
          <button
            onClick={() => setLimitMsg(null)}
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
          accept={ACCEPTED}
          multiple
          className="hidden"
          disabled={!canAddMore}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="font-mono text-sm text-white">Arraste fotos aqui</span>
        <span className="font-mono text-xs text-[#52525B]">
          JPG, PNG ou WEBP — ou clique para selecionar
        </span>
      </div>

      {/* Batch status */}
      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-xs text-[#A1A1AA]">
          {'// Lote gratuito:'}{' '}
          <span className="text-white">
            {images.length}/{MAX_IMAGES_PER_BATCH}
          </span>{' '}
          imagens
        </p>
        {images.length > 0 && (
          <button
            onClick={handleNewBatch}
            className="font-mono text-xs text-[#52525B] transition-colors hover:text-white"
          >
            Limpar tudo [X]
          </button>
        )}
      </div>

      {/* Comparison grid */}
      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              className={`flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3 ${
                img.status === 'clean' ? 'border-green-900' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#52525B]">
                  #{String(index + 1).padStart(2, '0')}
                </span>
                <span className={`font-mono text-[10px] ${STATUS_CLASS[img.status]}`}>
                  [{STATUS_LABEL[img.status]}]
                </span>
              </div>

              <div className="aspect-[4/3] w-full overflow-hidden border border-[#27272A] bg-black">
                <img
                  src={img.preview}
                  alt={img.file.name}
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <span
                  className="truncate font-mono text-xs text-white"
                  title={img.file.name}
                >
                  {img.file.name}
                </span>
                <span className="font-mono text-[11px] text-[#52525B]">
                  Original: {formatFileSize(img.file.size)}
                </span>
                {img.status === 'clean' && img.cleanBlob && (
                  <span className="font-mono text-[11px] text-green-400">
                    Limpa: {formatFileSize(img.cleanSize)}
                  </span>
                )}
              </div>

              {img.status === 'error' && img.error && (
                <div className="border border-red-900 px-2 py-1 font-mono text-[10px] leading-relaxed text-red-400">
                  {img.error}
                </div>
              )}

              {img.status === 'clean' && (
                <div className="border border-green-700 bg-black px-2 py-1.5 font-mono text-[10px] font-medium leading-relaxed text-green-400">
                  [EXIF REMOVIDO: GPS/METADADOS ZERADOS]
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-1">
                <button
                  onClick={() => handleDownloadOne(img.id)}
                  disabled={img.status !== 'clean' || isProcessing}
                  className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                >
                  [Baixar]
                </button>
                <button
                  onClick={() => removeImage(img.id)}
                  disabled={isProcessing}
                  className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                >
                  [X]
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress indicator */}
      {isProcessing && (
        <p className="mt-4 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
          {progress}
        </p>
      )}

      {/* Action */}
      <button
        onClick={handleClean}
        disabled={pendingCount === 0 || isProcessing}
        className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
      >
        {isProcessing
          ? 'Limpando Metadados EXIF...'
          : pendingCount === 0
            ? '[Lote Limpo — Inicie um Novo Lote]'
            : `[Limpar EXIF das ${pendingCount} ${pendingCount === 1 ? 'Imagem' : 'Imagens'}]`}
      </button>

      {/* Results / batch download */}
      {cleanCount > 0 && !isProcessing && (
        <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
          <p className="mb-3 font-mono text-sm text-green-400">
            {cleanCount} imagem(ns) limpa(s) — {formatFileSize(totalCleanSize)} sem
            GPS ou metadados de câmera.
          </p>
          <button
            onClick={handleDownloadAll}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
          >
            [Baixar Todas as Imagens Limpas ({cleanCount})]
          </button>
          <button
            onClick={handleNewBatch}
            className="mt-2 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] hover:text-white"
          >
            [Iniciar Novo Lote]
          </button>
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Suas fotos são reprocessadas 100% no navegador e nunca são enviadas a
        servidores. Coordenadas GPS, modelo da câmera e dados de autor são
        descartados permanentemente.
      </p>

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Ferramenta 100% gratuita e privada (zero servidores). Se te
              economizou tempo, considere apoiar o projeto com qualquer valor
              via Pix.
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
