import { useCallback, useEffect, useRef, useState } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  ACCEPTED_VIDEO_ATTR,
  MAX_VIDEO_BYTES,
  QUALITY_PRESETS,
  RESOLUTION_BOXES,
  compressVideo,
  downloadBlob,
  estimateCompressedBytes,
  getCompressedFileName,
  isSupportedVideo,
  loadFfmpegEngine,
  onFfmpegLog,
  readVideoMeta,
  terminateFfmpegEngine,
  type CompressionQuality,
  type FfmpegEngineInfo,
  type TargetResolution,
  type VideoMeta,
} from '../../lib/videoCompressorUtils';
import ReferenceSources from '../ReferenceSources';
import PixSupportModal from './PixSupportModal';

const QUALITY_OPTIONS: CompressionQuality[] = ['high', 'medium', 'low'];
const RESOLUTION_OPTIONS: TargetResolution[] = ['original', '720p', '480p'];

const QUALITY_LABEL: Record<CompressionQuality, string> = {
  low: 'Máxima',
  medium: 'Equilibrada',
  high: 'Rápida',
};

const RESOLUTION_LABEL: Record<TargetResolution, string> = {
  original: 'Manter Original',
  '720p': RESOLUTION_BOXES['720p'].label,
  '480p': RESOLUTION_BOXES['480p'].label,
};

const SLOW_FILE_THRESHOLD_BYTES = 100 * 1024 * 1024;

export default function VideoCompressorTool() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [quality, setQuality] = useState<CompressionQuality>('medium');
  const [resolution, setResolution] = useState<TargetResolution>('original');

  const [dragOver, setDragOver] = useState(false);
  const [isLoadingEngine, setIsLoadingEngine] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [engineInfo, setEngineInfo] = useState<FfmpegEngineInfo | null>(null);

  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [log, setLog] = useState<string[]>([]);
  const [showSupport, setShowSupport] = useState(false);

  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logLinesRef = useRef<string[]>([]);

  const estimatedBytes = computeEstimate(file, quality, resolution, meta);
  const savedBytes = file && resultBlob ? file.size - resultBlob.size : 0;
  const savedPercent =
    file && file.size > 0 && resultBlob ? Math.round((savedBytes / file.size) * 100) : 0;

  const pushLog = useCallback((line: string) => {
    logLinesRef.current.push(line);
    setLog((prev) => [...prev.slice(-40), line]);
  }, []);

  const releaseResult = useCallback(() => {
    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setResultBlob(null);
  }, []);

  const resetWorkspace = useCallback(() => {
    releaseResult();
    setMeta(null);
    setProgress(0);
    setElapsedSeconds(0);
    setError(null);
    setNotice(null);
    logLinesRef.current = [];
    setLog([]);
  }, [releaseResult]);

  useEffect(() => {
    onFfmpegLog((line) => {
      if (line && line.trim()) pushLog(line.trim());
    });
    return () => {
      onFfmpegLog(null);
    };
  }, [pushLog]);

  useEffect(() => releaseResult, [releaseResult]);

  const selectFile = useCallback(
    async (selected: File | undefined) => {
      if (!selected) return;

      if (!isSupportedVideo(selected)) {
        setError('Formato não suportado — envie MP4, WEBM, MOV, AVI, M4V ou MKV.');
        return;
      }

      if (selected.size > MAX_VIDEO_BYTES) {
        setError('Arquivo acima de 200MB. Reduza o tamanho antes de processar.');
        return;
      }

      fileRef.current = selected;
      setFile(selected);
      setError(null);
      resetWorkspace();

      const readMeta = await readVideoMeta(selected);
      if (fileRef.current !== selected) return;
      setMeta(readMeta);

      if (selected.size > SLOW_FILE_THRESHOLD_BYTES) {
        setNotice(
          'Arquivo grande: a re-codificação roda em WebAssembly de thread única e pode levar vários minutos. Aguarde sem fechar a aba.',
        );
      }
    },
    [resetWorkspace],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      void selectFile(event.dataTransfer.files[0]);
    },
    [selectFile],
  );

  const ensureEngine = useCallback(async (): Promise<FfmpegEngineInfo> => {
    setIsLoadingEngine(true);
    setError(null);
    pushLog('carregando motor FFmpeg local (WebAssembly)...');
    try {
      const { info } = await loadFfmpegEngine();
      setEngineInfo(info);
      pushLog(`motor pronto (instância ${info.source})`);
      return info;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o motor FFmpeg. Tente novamente ou use outro navegador.';
      setError(message);
      pushLog(message);
      throw cause;
    } finally {
      setIsLoadingEngine(false);
    }
  }, [pushLog]);

  const handleCompress = useCallback(async () => {
    const current = fileRef.current;
    if (!current || isProcessing || isLoadingEngine) return;

    setError(null);
    setNotice(null);
    releaseResult();
    setProgress(0);
    setElapsedSeconds(0);
    logLinesRef.current = [];
    setLog([]);
    setIsProcessing(true);

    const startedAt = Date.now();

    try {
      await ensureEngine();

      const blob = await compressVideo(current, quality, resolution, (ratio) => {
        setProgress(Math.round(Math.min(1, Math.max(0, ratio)) * 100));
      });

      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setResultName(getCompressedFileName(current.name));

      BatchLimiter.incrementUsage(1);
      if (BatchLimiter.isLimitReached()) {
        setShowSupport(true);
      }

      if (blob.size >= current.size) {
        setNotice(
          'O arquivo final ficou igual ou maior que o original. Tente um nível de compressão maior ou reduza a resolução.',
        );
      }

      pushLog(`concluído: ${formatFileSize(blob.size)} (original ${formatFileSize(current.size)})`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao comprimir o vídeo.');
    } finally {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
      setIsProcessing(false);
    }
  }, [ensureEngine, isLoadingEngine, isProcessing, quality, releaseResult, resolution]);

  const handleDownload = useCallback(() => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, resultName);
  }, [resultBlob, resultName]);

  const clearSelection = useCallback(() => {
    fileRef.current = null;
    setFile(null);
    resetWorkspace();
  }, [resetWorkspace]);

  const startOver = useCallback(() => {
    clearSelection();
    void terminateFfmpegEngine().then(() => setEngineInfo(null));
  }, [clearSelection]);

  const sourceLabel = meta && meta.width > 0 ? `${meta.width}x${meta.height}` : 'indisponível';
  const isBusy = isProcessing || isLoadingEngine;

  return (
    <div className="w-full max-w-3xl">
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-red-800 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm leading-relaxed text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-[#27272A] bg-[#09090B] px-4 py-3">
          <span className="font-mono text-xs leading-relaxed text-[#A1A1AA]">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
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
          accept={ACCEPTED_VIDEO_ATTR}
          className="hidden"
          onChange={(event) => {
            void selectFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {file ? (
          <>
            <span className="truncate font-mono text-sm text-white">{file.name}</span>
            <span className="font-mono text-xs text-[#52525B]">
              {formatFileSize(file.size)} • {sourceLabel} •{' '}
              {engineInfo ? `motor ${engineInfo.source}` : 'motor sob demanda'}
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-white">Arraste um vídeo aqui</span>
            <span className="font-mono text-xs text-[#52525B]">
              ou clique para selecionar (MP4, WEBM, MOV, AVI, M4V, MKV)
            </span>
          </>
        )}
      </div>

      {file && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={clearSelection}
            className="font-mono text-xs text-[#52525B] transition-colors hover:text-white"
          >
            [Trocar arquivo]
          </button>
        </div>
      )}

      {file && (
        <div className="mt-4 flex flex-col gap-6 border border-[#27272A] bg-[#09090B] p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="font-mono text-xs text-[#A1A1AA]">Nível de Compressão</legend>
            <div className="grid grid-cols-1 gap-px border border-[#27272A] bg-[#27272A] sm:grid-cols-3">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setQuality(option)}
                  disabled={isBusy}
                  className={`flex flex-col gap-1 px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    quality === option ? 'bg-white text-black' : 'bg-[#09090B] text-white hover:bg-[#18181B]'
                  }`}
                >
                  <span className="font-mono text-sm">{QUALITY_LABEL[option]}</span>
                  <span
                    className={`font-mono text-[10px] leading-relaxed ${
                      quality === option ? 'text-black/70' : 'text-[#52525B]'
                    }`}
                  >
                    {QUALITY_PRESETS[option].label} • CRF {QUALITY_PRESETS[option].crf}
                  </span>
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] leading-relaxed text-[#52525B]">
              {QUALITY_PRESETS[quality].hint}
            </span>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-mono text-xs text-[#A1A1AA]">Resolução</legend>
            <div className="grid grid-cols-1 gap-px border border-[#27272A] bg-[#27272A] sm:grid-cols-3">
              {RESOLUTION_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setResolution(option)}
                  disabled={isBusy}
                  className={`flex flex-col gap-1 px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    resolution === option
                      ? 'bg-white text-black'
                      : 'bg-[#09090B] text-white hover:bg-[#18181B]'
                  }`}
                >
                  <span className="font-mono text-sm">{RESOLUTION_LABEL[option]}</span>
                  <span
                    className={`font-mono text-[10px] leading-relaxed ${
                      resolution === option ? 'text-black/70' : 'text-[#52525B]'
                    }`}
                  >
                    {option === 'original'
                      ? `Original (${sourceLabel})`
                      : RESOLUTION_BOXES[option].hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-px border border-[#27272A] bg-[#27272A] sm:grid sm:grid-cols-3">
            <div className="flex flex-col gap-1 bg-black px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase text-[#52525B]">Tamanho Original</span>
              <span className="font-mono text-sm text-white">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex flex-col gap-1 bg-black px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase text-[#52525B]">
                {resultBlob ? 'Tamanho Final' : 'Tamanho Estimado'}
              </span>
              <span className="font-mono text-sm text-white">
                {resultBlob ? formatFileSize(resultBlob.size) : `~ ${formatFileSize(estimatedBytes)}`}
              </span>
            </div>
            <div className="flex flex-col gap-1 bg-black px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase text-[#52525B]">
                {resultBlob ? 'Economizado' : 'Economia Prevista'}
              </span>
              <span
                className={`font-mono text-sm ${
                  (resultBlob ? savedPercent : estimatedPercent(file, estimatedBytes)) > 0
                    ? 'text-green-400'
                    : 'text-[#A1A1AA]'
                }`}
              >
                {resultBlob
                  ? `${savedPercent >= 0 ? '-' : '+'}${formatFileSize(Math.abs(savedBytes))} (${Math.abs(savedPercent)}%)`
                  : `${estimatedPercent(file, estimatedBytes)}%`}
              </span>
            </div>
          </div>

          {isProcessing && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-white">[PROCESSANDO {progress}%]</span>
                <span className="text-[#52525B]">
                  {QUALITY_LABEL[quality]} • {RESOLUTION_LABEL[resolution]}
                </span>
              </div>
              <div className="h-1 w-full bg-[#27272A]">
                <div className="h-1 bg-white transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <span className="font-mono text-[10px] leading-relaxed text-[#52525B]">
                Re-codificação H.264 em WebAssembly. Não feche a aba nem cancele o processo.
              </span>
            </div>
          )}

          <button
            onClick={handleCompress}
            disabled={isBusy}
            className="w-full border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
          >
            {isLoadingEngine
              ? 'Carregando motor FFmpeg local...'
              : isProcessing
                ? `Comprimindo ${progress}%...`
                : '[Comprimir Vídeo]'}
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-4 border border-[#27272A] bg-black p-3 font-mono text-[10px] leading-relaxed text-[#52525B]">
          <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {log.map((line, index) => (
              <div key={index} className="truncate">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {resultUrl && resultBlob && (
        <div className="mt-4 flex flex-col gap-3 border border-[#27272A] bg-[#09090B] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-white">[VÍDEO COMPACTADO]</span>
            <span className="truncate font-mono text-xs text-[#52525B]">{resultName}</span>
          </div>
          <video
            src={resultUrl}
            controls
            preload="metadata"
            className="max-h-72 w-full border border-[#27272A] bg-black"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownload}
              className="border border-[#27272A] bg-black px-4 py-2 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              [Baixar MP4 Compactado]
            </button>
            <span className="font-mono text-xs text-[#A1A1AA]">
              {formatFileSize(file?.size ?? 0)} → {formatFileSize(resultBlob.size)}
              {savedBytes > 0 ? ` • -${savedPercent}%` : ''}
            </span>
            <button
              onClick={startOver}
              className="font-mono text-xs text-[#52525B] transition-colors hover:text-white"
            >
              [Compactar outro vídeo]
            </button>
          </div>
          {elapsedSeconds > 0 && (
            <span className="font-mono text-[10px] text-[#52525B]">
              Tempo de processamento: {elapsedSeconds.toFixed(1)}s
            </span>
          )}
        </div>
      )}

      <p className="mt-4 font-mono text-xs leading-relaxed text-[#A1A1AA]">
        A compressão acontece 100% no seu navegador via FFmpeg WebAssembly local. O vídeo nunca
        é enviado a servidores, não há upload, cadastro ou fila. [Limite: 200MB]
      </p>

      {showSupport && (
        <PixSupportModal open={showSupport} onClose={() => setShowSupport(false)} />
      )}

      <ReferenceSources
        sources={[
          {
            label: 'FFmpeg — documentação oficial de codificação',
            href: 'https://ffmpeg.org/documentation.html',
          },
          {
            label: 'ffmpeg.wasm — documentação técnica',
            href: 'https://ffmpegwasm.netlify.app/docs/overview',
          },
        ]}
      />
    </div>
  );
}

function estimatedPercent(file: File, estimatedBytes: number): number {
  if (!file || file.size <= 0) return 0;
  return Math.max(0, Math.round((1 - estimatedBytes / file.size) * 100));
}

function computeEstimate(
  file: File | null,
  quality: CompressionQuality,
  resolution: TargetResolution,
  meta: VideoMeta | null,
): number {
  return file ? estimateCompressedBytes(file.size, quality, resolution, meta) : 0;
}
