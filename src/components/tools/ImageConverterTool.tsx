import { useCallback, useRef, useState } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  convertImage,
  downloadBlob,
  estimateConvertedBytes,
  FORMAT_EXT,
  getConvertedFileName,
  isSupportedSourceImage,
  readImageMeta,
  type TargetImageFormat,
} from '../../lib/imageConverterUtils';
import PixSupportModal from './PixSupportModal';

interface ConvertItem {
  file: File;
  id: string;
  preview: string;
  width: number;
  height: number;
  status: 'waiting' | 'processing' | 'done' | 'error';
  outBlob: Blob | null;
  outSize: number;
  error: string | null;
}

const MAX_IMAGES_PER_BATCH = 3;
const ACCEPTED =
  'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';

const FORMATS: { value: TargetImageFormat; label: string; hint: string }[] = [
  { value: 'webp', label: 'WEBP', hint: 'Compacto' },
  { value: 'png', label: 'PNG', hint: 'Lossless' },
  { value: 'jpeg', label: 'JPG', hint: 'Universal' },
];

const FORMAT_LABEL: Record<TargetImageFormat, string> = {
  webp: 'WEBP',
  png: 'PNG',
  jpeg: 'JPG',
};

const STATUS_LABEL: Record<ConvertItem['status'], string> = {
  waiting: 'AGUARDANDO',
  processing: 'CONVERTENDO...',
  done: 'PRONTO',
  error: 'ERRO',
};

const STATUS_CLASS: Record<ConvertItem['status'], string> = {
  waiting: 'text-[#52525B]',
  processing: 'text-[#A1A1AA]',
  done: 'text-green-400',
  error: 'text-red-400',
};

export default function ImageConverterTool() {
  const [items, setItems] = useState<ConvertItem[]>([]);
  const [format, setFormat] = useState<TargetImageFormat>('webp');
  const [quality, setQuality] = useState(85);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const doneCount = items.filter((i) => i.status === 'done').length;
  const pendingCount = items.filter((i) => i.status !== 'done').length;

  const addFiles = useCallback((list: FileList | File[]) => {
    const accepted = Array.from(list).filter(isSupportedSourceImage);

    if (accepted.length === 0) {
      setLimitMsg(
        'Formato não suportado — envie apenas JPG, PNG, WEBP, GIF ou BMP.',
      );
      return;
    }

    const current = itemsRef.current.length;
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

    const hydrate = fit.map(async (file) => {
      const meta = await readImageMeta(file);
      return {
        file,
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        preview: URL.createObjectURL(file),
        width: meta.width,
        height: meta.height,
        status: 'waiting' as const,
        outBlob: null,
        outSize: 0,
        error: null,
      };
    });

    Promise.all(hydrate).then((enriched) => {
      setItems((prev) => [...prev, ...enriched]);
    });
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

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((img) => img.id !== id);
    });
    setLimitMsg(null);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<ConvertItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const handleConvert = useCallback(async () => {
    const targets = itemsRef.current.filter((i) => i.status !== 'done');
    if (targets.length === 0 || isProcessing) return;

    const chosenFormat = format;
    const chosenQuality = quality / 100;

    setError(null);
    setIsProcessing(true);

    // BatchLimiter atualiza de forma assíncrona e nunca bloqueia a conversão
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      if (BatchLimiter.isLimitReached()) {
        setShowSupport(true);
      }
    });

    const produced: { blob: Blob; fileName: string }[] = [];

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      patchItem(item.id, { status: 'processing', error: null });
      setProgress(
        `Convertendo ${i + 1} de ${targets.length}: ${item.file.name} → ${FORMAT_LABEL[chosenFormat]}...`,
      );
      try {
        const blob = await convertImage(item.file, chosenFormat, chosenQuality);
        produced.push({ blob, fileName: getConvertedFileName(item.file.name, chosenFormat) });
        patchItem(item.id, {
          status: 'done',
          outBlob: blob,
          outSize: blob.size,
        });
      } catch (err: any) {
        patchItem(item.id, {
          status: 'error',
          error: err?.message ?? `Falha ao converter "${item.file.name}".`,
        });
      }
    }

    setProgress(null);
    setIsProcessing(false);

    // Download do lote em sequência (pequeno intervalo evita bloqueio do browser)
    produced.forEach((entry, i) => {
      setTimeout(() => {
        downloadBlob(entry.blob, entry.fileName);
      }, i * 500);
    });
  }, [format, isProcessing, patchItem, quality]);

  const handleDownloadOne = useCallback((id: string) => {
    const target = itemsRef.current.find((item) => item.id === id);
    if (!target || !target.outBlob) return;
    downloadBlob(target.outBlob, getConvertedFileName(target.file.name, format));
  }, [format]);

  const handleDownloadDone = useCallback(() => {
    const done = itemsRef.current.filter((i) => i.status === 'done' && i.outBlob);
    done.forEach((item, i) => {
      setTimeout(() => {
        downloadBlob(item.outBlob!, getConvertedFileName(item.file.name, format));
      }, i * 500);
    });
  }, [format]);

  const handleNewBatch = useCallback(() => {
    setItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
    setLimitMsg(null);
    setError(null);
  }, []);

  const canAddMore = items.length < MAX_IMAGES_PER_BATCH;
  const lossless = format === 'png';

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

      {/* Output settings */}
      <div className="flex flex-col gap-6 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
            // FORMATO DE SAÍDA
          </span>
          <div role="radiogroup" aria-label="Formato de saída" className="flex gap-3">
            {FORMATS.map((opt) => {
              const selected = format === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFormat(opt.value)}
                  className={`flex flex-1 flex-col items-center gap-1 border px-4 py-3 font-mono text-sm transition-colors ${
                    selected
                      ? 'border-[#3F3F46] bg-[#18181B] text-white'
                      : 'border-[#27272A] bg-black text-[#A1A1AA] hover:border-[#3F3F46] hover:text-white'
                  }`}
                >
                  <span>[{opt.label}]</span>
                  <span className="font-mono text-[10px] text-[#52525B]">
                    {opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
              // QUALIDADE
            </span>
            <span className="font-mono text-[11px] text-[#A1A1AA]">
              {lossless ? '— (PNG sem perdas)' : `[ ${quality}% ]`}
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={quality}
            disabled={lossless}
            onChange={(e) => setQuality(Number(e.target.value))}
            aria-label="Qualidade de compressão"
            className="w-full accent-[#A1A1AA] disabled:opacity-30"
          />
          <p className="font-mono text-[10px] leading-relaxed text-[#52525B]">
            A qualidade vale para JPG e WEBP. PNG é sempre lossless e mantém
            transparência.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-14 transition-colors ${
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
        <span className="font-mono text-sm text-white">Arraste imagens aqui</span>
        <span className="font-mono text-xs text-[#52525B]">
          JPG, PNG, WEBP, GIF ou BMP — ou clique para selecionar
        </span>
      </div>

      {/* Batch status */}
      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-xs text-[#A1A1AA]">
          {'// Lote gratuito:'}{' '}
          <span className="text-white">
            {items.length}/{MAX_IMAGES_PER_BATCH}
          </span>{' '}
          imagens
        </p>
        {items.length > 0 && (
          <button
            onClick={handleNewBatch}
            className="font-mono text-xs text-[#52525B] transition-colors hover:text-white"
          >
            Limpar tudo [X]
          </button>
        )}
      </div>

      {/* Files list */}
      {items.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {items.map((item, index) => {
            const estimated =
              item.width > 0 && item.height > 0
                ? estimateConvertedBytes(item.width, item.height, format, quality)
                : 0;
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3 ${
                  item.status === 'done' ? 'border-green-900' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[#52525B]">
                    #{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={`font-mono text-[10px] ${STATUS_CLASS[item.status]}`}>
                    [{STATUS_LABEL[item.status]}]
                  </span>
                </div>

                <div className="aspect-[4/3] w-full overflow-hidden border border-[#27272A] bg-black">
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="flex flex-col gap-0.5">
                  <span
                    className="truncate font-mono text-xs text-white"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </span>
                  {item.width > 0 && item.height > 0 && (
                    <span className="font-mono text-[11px] text-[#52525B]">
                      {item.width}×{item.height}px
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-[#52525B]">
                    Original: {formatFileSize(item.file.size)}
                  </span>
                  {item.status === 'waiting' && estimated > 0 && (
                    <span className="font-mono text-[11px] text-[#A1A1AA]">
                      → {FORMAT_LABEL[format]}: ~{formatFileSize(estimated)}{' '}
                      <span className="text-[#52525B]">(estimativa)</span>
                    </span>
                  )}
                  {item.status === 'done' && item.outBlob && (
                    <span className="font-mono text-[11px] text-green-400">
                      Convertido: {formatFileSize(item.outSize)} (.{FORMAT_EXT[format]})
                    </span>
                  )}
                </div>

                {item.status === 'error' && item.error && (
                  <div className="border border-red-900 px-2 py-1 font-mono text-[10px] leading-relaxed text-red-400">
                    {item.error}
                  </div>
                )}

                {item.status === 'done' && (
                  <div className="border border-green-700 bg-black px-2 py-1.5 font-mono text-[10px] font-medium leading-relaxed text-green-400">
                    [CONVERSÃO LOCAL CONCLUÍDA]
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-1">
                  <button
                    onClick={() => handleDownloadOne(item.id)}
                    disabled={item.status !== 'done' || isProcessing}
                    className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                  >
                    [Baixar]
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={isProcessing}
                    className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                  >
                    [X]
                  </button>
                </div>
              </div>
            );
          })}
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
        onClick={handleConvert}
        disabled={pendingCount === 0 || isProcessing}
        className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
      >
        {isProcessing
          ? `Convertendo para ${FORMAT_LABEL[format]}...`
          : pendingCount === 0
            ? '[Lote Concluído — Inicie um Novo Lote]'
            : `[Converter & Baixar Lote para ${FORMAT_LABEL[format]} (${pendingCount})]`}
      </button>

      {/* Results / re-download */}
      {doneCount > 0 && !isProcessing && (
        <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
          <p className="mb-3 font-mono text-sm text-green-400">
            {doneCount} imagem(ns) convertida(s) localmente para{' '}
            {FORMAT_LABEL[format]} e baixada(s). Nada foi enviado a servidores.
          </p>
          <button
            onClick={handleDownloadDone}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
          >
            [Baixar Novamente ({doneCount})]
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
        Suas imagens são convertidas 100% no navegador via Canvas API e nunca são
        enviadas a servidores. O tamanho exibido como "estimativa" é um valor
        aproximado — o tamanho real aparece após a conversão.
      </p>

      {/* Support Modal */}
      <PixSupportModal open={showSupport} onClose={() => setShowSupport(false)} />
    </div>
  );
}
