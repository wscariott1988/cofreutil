import { useCallback, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';

const MAX_BYTES = 200 * 1024 * 1024;
const LOCAL_CORE = '/wasm/ffmpeg/ffmpeg-core.js';
const LOCAL_WASM = '/wasm/ffmpeg/ffmpeg-core.wasm';
const CDN_CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
const CDN_WASM = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm';

interface Segment {
  start: number;
  end: number;
}

interface Silence {
  start: number;
  end: number;
}

function parseTime(value: string | undefined): number {
  const t = parseFloat(value ?? '0');
  return Number.isFinite(t) ? t : 0;
}

function formatSeconds(total: number): string {
  const t = Math.max(0, total);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export default function SilenceRemoverTool() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoadingFfmpeg, setIsLoadingFfmpeg] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [engineSource, setEngineSource] = useState<'local' | 'cdn' | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [noiseDb, setNoiseDb] = useState(-30);
  const [minSilence, setMinSilence] = useState(0.5);

  const [totalDuration, setTotalDuration] = useState(0);
  const [detectedSegments, setDetectedSegments] = useState<Segment[]>([]);
  const [removedSilences, setRemovedSilences] = useState<Silence[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string>('');
  const [savedSeconds, setSavedSeconds] = useState(0);

  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supportPromptedRef = useRef(false);
  const logLinesRef = useRef<string[]>([]);
  const detectedSegmentsRef = useRef<Segment[]>([]);
  const totalDurationRef = useRef(0);
  detectedSegmentsRef.current = detectedSegments;
  totalDurationRef.current = totalDuration;
  const pixPayload = generatePixCopyPaste();

  const pushLog = useCallback((line: string) => {
    logLinesRef.current.push(line);
    setLog((prev) => [...prev.slice(-40), line]);
  }, []);

  const ensureFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current && ffmpegReady) return ffmpegRef.current;

    setIsLoadingFfmpeg(true);
    setError(null);
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      pushLog(message);
    });
    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(`${Math.round(p * 100)}%`);
    });

    const sources: Array<{ coreURL: string; wasmURL: string; label: 'local' | 'cdn' }> = [
      { coreURL: LOCAL_CORE, wasmURL: LOCAL_WASM, label: 'local' },
    ];

    for (const src of sources) {
      try {
        const coreURL = await toBlobURL(src.coreURL, 'text/javascript');
        const wasmURL = await toBlobURL(src.wasmURL, 'application/wasm');
        await ffmpeg.load({ coreURL, wasmURL });
        ffmpegRef.current = ffmpeg;
        setEngineSource(src.label);
        setFfmpegReady(true);
        pushLog(`ffmpeg.wasm carregado (instância ${src.label})`);
        return ffmpeg;
      } catch (cause) {
        pushLog(`falha ao carregar ${src.label}: ${(cause as Error)?.message ?? String(cause)}`);
        try {
          ffmpeg.terminate();
        } catch {
          /* ignore */
        }
      }
    }

    try {
      const coreURL = await toBlobURL(CDN_CORE, 'text/javascript');
      const wasmURL = await toBlobURL(CDN_WASM, 'application/wasm');
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegRef.current = ffmpeg;
      setEngineSource('cdn');
      setFfmpegReady(true);
      pushLog('ffmpeg.wasm carregado (instância CDN de contingência)');
      return ffmpeg;
    } catch (cause) {
      pushLog(`falha no carregamento CDN: ${(cause as Error)?.message ?? String(cause)}`);
      setError('Não foi possível carregar o motor FFmpeg. Tente novamente ou use outro navegador.');
      setFfmpegReady(false);
      throw new Error('ffmpeg load failed');
    } finally {
      setIsLoadingFfmpeg(false);
    }
  }, [ffmpegReady, pushLog]);

  const selectFile = useCallback(
    async (selected: File | undefined) => {
      if (!selected) return;
      if (selected.size > MAX_BYTES) {
        setError('Arquivo acima de 200MB. Reduza o tamanho antes de processar.');
        return;
      }
      setFile(selected);
      fileRef.current = selected;
      setError(null);
      setResultUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
      setDetectedSegments([]);
      setRemovedSilences([]);
      setTotalDuration(0);
      setSavedSeconds(0);
      logLinesRef.current = [];
      setLog([]);
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

  const handleDetect = useCallback(async () => {
    const current = fileRef.current;
    if (!current || isDetecting || isProcessing || isLoadingFfmpeg) return;

    setError(null);
    setResultUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setDetectedSegments([]);
    setRemovedSilences([]);
    logLinesRef.current = [];
    setLog([]);
    setIsDetecting(true);

    try {
      const ffmpeg = await ensureFFmpeg();
      const ext = current.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'mp4';
      const inputName = `entrada.${ext}`;
      await ffmpeg.writeFile(inputName, new Uint8Array(await current.arrayBuffer()));

      await ffmpeg.exec([
        '-hide_banner',
        '-i',
        inputName,
        '-af',
        `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
        '-f',
        'null',
        '-',
      ]);

      let total = 0;
      const durationLine = logLinesRef.current
        .map((l) => l.match(/Duration:\s*(\d+):(\d+):([\d.]+)/))
        .find((m) => m !== undefined);
      if (durationLine) {
        const [, h, m, s] = durationLine;
        total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
        setTotalDuration(total);
      }

      const silences: Silence[] = [];
      let lastStart: number | null = null;
      for (const line of logLinesRef.current) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) lastStart = parseTime(startMatch[1]);
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (endMatch && lastStart !== null) {
          silences.push({ start: lastStart, end: parseTime(endMatch[1]) });
          lastStart = null;
        }
      }

      const segments: Segment[] = [];
      let cursor = 0;
      for (const s of silences) {
        const gapStart = Math.max(0, s.start);
        const gapEnd = Math.min(total, s.end);
        if (gapEnd <= cursor) continue;
        if (gapStart > cursor + 0.001) segments.push({ start: cursor, end: gapStart });
        cursor = gapEnd;
      }
      if (total - cursor > 0.001) segments.push({ start: cursor, end: total });

      const kept = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
      setDetectedSegments(segments);
      setRemovedSilences(silences);
      setSavedSeconds(Math.max(0, total - kept));
      pushLog(`análise concluída: ${segments.length} trecho(s) de som ativo`);
    } catch (cause) {
      setError((cause as Error)?.message ?? 'Falha na detecção de silêncio.');
    } finally {
      setIsDetecting(false);
    }
  }, [ensureFFmpeg, noiseDb, minSilence, isDetecting, isProcessing, isLoadingFfmpeg, pushLog]);

  const handleRemove = useCallback(async () => {
    const current = fileRef.current;
    if (!current || !detectedSegmentsRef.current.length || isProcessing || isDetecting) return;

    if (BatchLimiter.isLimitReached()) {
      setError(
        'Você atingiu o limite gratuito de 3 exportações por dia. Tente novamente amanhã ou considere apoiar o projeto.',
      );
      setShowSupport(true);
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProgress('');
    setResultUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });

    try {
      const ffmpeg = await ensureFFmpeg();
      const ext = current.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'mp4';
      const inputName = `entrada.${ext}`;
      const outputName = `saida.${ext}`;
      const listName = 'concat_list.txt';
      const total = totalDurationRef.current;

      await ffmpeg.writeFile(inputName, new Uint8Array(await current.arrayBuffer()));

      const pad = 0.02;
      const lines = detectedSegmentsRef.current
        .map((seg) => {
          const start = Math.max(0, seg.start - pad);
          const end = Math.min(total, seg.end + pad);
          return `file '${inputName}'\nstart_time ${start.toFixed(3)}\nend_time ${end.toFixed(3)}\ninpoint 0\noutpoint ${(end - start).toFixed(3)}`;
        })
        .join('\n');
      await ffmpeg.writeFile(listName, new TextEncoder().encode(lines));

      try {
        await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outputName]);
      } catch (cause) {
        pushLog(`concat demuxer indisponível, usando filtro concat: ${(cause as Error)?.message ?? ''}`);
        const segments = detectedSegmentsRef.current;
        const chain = segments
          .map((seg, i) => {
            const start = (Math.max(0, seg.start - pad)).toFixed(3);
            const end = (Math.min(total, seg.end + pad)).toFixed(3);
            return `[${i}:v]trim=${start}:${end},setpts=PTS-STARTPTS[v${i}];[${i}:a]atrim=${start}:${end},asetpts=PTS-STARTPTS[a${i}]`;
          })
          .join(';');
        const streams = segments.map((_, i) => `[v${i}][a${i}]`).join('');
        const filterGraph = `${chain};${streams}concat=n=${segments.length}:v=1:a=1[outv][outa]`;
        await ffmpeg.exec([
          '-i',
          inputName,
          '-filter_complex',
          filterGraph,
          '-map',
          '[outv]',
          '-map',
          '[outa]',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-c:a',
          'aac',
          outputName,
        ]);
      }

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data as BlobPart]);
      const objectUrl = URL.createObjectURL(blob);
      setResultUrl(objectUrl);
      setResultName(current.name.replace(/\.[^.]+$/, '') + '_sem_silencio.' + ext);

      const kept = detectedSegmentsRef.current.reduce((acc, s) => acc + (s.end - s.start), 0);
      setSavedSeconds(Math.max(0, total - kept));

      ffmpeg.deleteFile(inputName);
      ffmpeg.deleteFile(listName);
      ffmpeg.deleteFile(outputName);

      BatchLimiter.incrementUsage(1);
      if (!supportPromptedRef.current) {
        supportPromptedRef.current = true;
        setShowSupport(true);
      }
      pushLog('processamento lossless concluído');
    } catch (cause) {
      setError((cause as Error)?.message ?? 'Falha ao remover o silêncio do arquivo.');
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  }, [ensureFFmpeg, isProcessing, isDetecting, pushLog]);

  const clearSelection = useCallback(() => {
    setFile(null);
    fileRef.current = null;
    setResultUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setDetectedSegments([]);
    setRemovedSilences([]);
    setTotalDuration(0);
    setSavedSeconds(0);
    logLinesRef.current = [];
    setLog([]);
    setError(null);
  }, []);

  const hasDetected = detectedSegments.length > 0;

  return (
    <div className="w-full max-w-2xl">
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-red-800 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

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
          accept=".mp4,.webm,.mov,.mkv,.avi,.m4v,.mp3,.wav,.ogg,.m4a,.flac,.aac,.wma,.opus"
          className="hidden"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {file ? (
          <>
            <span className="truncate font-mono text-sm text-white">{file.name}</span>
            <span className="font-mono text-xs text-[#52525B]">
              {(file.size / 1024 / 1024).toFixed(1)} MB •{' '}
              {engineSource ? `motor ${engineSource}` : 'aguardando análise'}
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-white">
              Arraste um áudio ou vídeo aqui
            </span>
            <span className="font-mono text-xs text-[#52525B]">
              ou clique para selecionar (MP4, WebM, MOV, MP3, WAV, OGG e outros)
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
          <div className="flex flex-col gap-6 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-xs text-[#A1A1AA]">
                Sensibilidade de Ruído (dB): <span className="text-white">{noiseDb} dB</span>
              </span>
              <input
                type="range"
                min={-60}
                max={-10}
                step={1}
                value={noiseDb}
                onChange={(e) => setNoiseDb(Number(e.target.value))}
                className="accent-white"
              />
              <span className="font-mono text-[10px] leading-relaxed text-[#52525B]">
                mais negativo = mais sensível
              </span>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-xs text-[#A1A1AA]">
                Duração Mínima de Silêncio (s):{' '}
                <span className="text-white">{minSilence.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={minSilence}
                onChange={(e) => setMinSilence(Number(e.target.value))}
                className="accent-white"
              />
              <span className="font-mono text-[10px] leading-relaxed text-[#52525B]">
                silêncios menores são mantidos
              </span>
            </label>
          </div>

          <button
            onClick={handleDetect}
            disabled={isDetecting || isLoadingFfmpeg || isProcessing}
            className="w-full border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
          >
            {isLoadingFfmpeg
              ? 'Carregando motor FFmpeg local...'
              : isDetecting
                ? 'Analisando silêncio...'
                : '[Detectar Silêncio]'}
          </button>

          {hasDetected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-white">[LINHA DO TEMPO]</span>
                <span className="text-[#52525B]">
                  {formatSeconds(totalDuration)} • {detectedSegments.length} trecho(s)
                </span>
              </div>
              <div className="flex h-8 w-full overflow-hidden border border-[#27272A] bg-black">
                {(() => {
                  const width = totalDuration > 0 ? 100 / totalDuration : 0;
                  const parts: React.ReactNode[] = [];
                  let cursor = 0;
                  for (const seg of detectedSegments) {
                    const gap = Math.max(0, seg.start - cursor);
                    if (gap > 0.001) {
                      parts.push(
                        <div
                          key={`gap-${cursor.toFixed(3)}`}
                          className="h-full shrink-0 bg-[#27272A]"
                          style={{ width: `${Math.max(0.6, gap * width)}%` }}
                          title={`Silêncio removido (${gap.toFixed(2)}s)`}
                        />,
                      );
                    }
                    const active = seg.end - seg.start;
                    parts.push(
                      <div
                        key={`seg-${seg.start.toFixed(3)}`}
                        className="h-full shrink-0 bg-[#A1A1AA]"
                        style={{ width: `${Math.max(0.6, active * width)}%` }}
                        title={`Som ativo (${formatSeconds(active)})`}
                      />,
                    );
                    cursor = seg.end;
                  }
                  return parts;
                })()}
              </div>
              <div className="flex items-center gap-4 font-mono text-[10px] text-[#A1A1AA]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 bg-[#A1A1AA]" /> Som mantido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 bg-[#27272A]" /> Silêncio removido
                </span>
              </div>
              <div className="font-mono text-xs text-[#A1A1AA]">
                {savedSeconds > 0.001
                  ? `Serão removidos cerca de ${formatSeconds(savedSeconds)} de silêncio.`
                  : 'Nenhum silêncio removível encontrado com estes parâmetros.'}
              </div>
            </div>
          )}

          {hasDetected && (
            <button
              onClick={handleRemove}
              disabled={isProcessing || isDetecting}
              className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40"
            >
              {isProcessing
                ? progress
                  ? `Processando ${progress}...`
                  : 'Removendo silêncio (lossless)...'
                : '[Remover Silêncio e Baixar]'}
            </button>
          )}
        </div>
      )}

      {(log.length > 0 || progress) && (
        <div className="mt-4 border border-[#27272A] bg-black p-3 font-mono text-[10px] leading-relaxed text-[#52525B]">
          {progress && <div className="mb-1 text-[#A1A1AA]">progresso: {progress}</div>}
          <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {log.map((line, i) => (
              <div key={i} className="truncate">
                {line.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {resultUrl && (
        <div className="mt-4 flex flex-col gap-3 border border-[#27272A] bg-[#09090B] p-4">
          <span className="font-mono text-sm text-white">[ARQUIVO PRONTO]</span>
          <video src={resultUrl} controls className="max-h-72 w-full border border-[#27272A] bg-black" />
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={resultUrl}
              download={resultName}
              className="border border-[#27272A] bg-black px-4 py-2 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              [Baixar {resultName}]
            </a>
            <span className="font-mono text-xs text-[#A1A1AA]">
              {savedSeconds > 0.001
                ? `Cerca de ${formatSeconds(savedSeconds)} de silêncio removidos.`
                : 'Qualidade original preservada.'}
            </span>
          </div>
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Detecção e remoção de silêncio acontecem 100% no seu navegador via FFmpeg local
        (WebAssembly). Nada é enviado a servidores. [Limite: 200MB]
      </p>

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