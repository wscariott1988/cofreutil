export type CompressionQuality = 'low' | 'medium' | 'high';
export type TargetResolution = 'original' | '720p' | '480p';

export interface VideoMeta {
  width: number;
  height: number;
  duration: number;
}

export interface FfmpegEngineInfo {
  source: 'local' | 'cdn';
  coreURL: string;
}

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export const ACCEPTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'm4v', 'mkv'];

const LOCAL_CORE_URL = '/wasm/ffmpeg/ffmpeg-core.js';
const LOCAL_WASM_URL = '/wasm/ffmpeg/ffmpeg-core.wasm';

const CORE_VERSION = '0.12.10';
const CDN_BASES = [
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
];

export const ACCEPTED_VIDEO_ATTR =
  'video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-m4v,video/x-matroska,.mp4,.webm,.mov,.avi,.m4v,.mkv';

interface QualityPreset {
  crf: number;
  preset: string;
  audioBitrate: string;
  sizeFactor: number;
  label: string;
  hint: string;
}

export const QUALITY_PRESETS: Record<CompressionQuality, QualityPreset> = {
  high: {
    crf: 26,
    preset: 'ultrafast',
    audioBitrate: '128k',
    sizeFactor: 0.58,
    label: 'Rápida',
    hint: 'Menor compressão, mantém mais detalhe. Processa antes.',
  },
  medium: {
    crf: 29,
    preset: 'veryfast',
    audioBitrate: '96k',
    sizeFactor: 0.4,
    label: 'Equilibrada',
    hint: 'Melhor custo-benefício entre tamanho e nitidez.',
  },
  low: {
    crf: 33,
    preset: 'faster',
    audioBitrate: '64k',
    sizeFactor: 0.24,
    label: 'Máxima',
    hint: 'Arquivo muito menor. Leve perda de detalhe em motion blur.',
  },
};

export const RESOLUTION_BOXES: Record<
  Exclude<TargetResolution, 'original'>,
  { width: number; height: number; label: string; hint: string }
> = {
  '720p': { width: 1280, height: 720, label: '720p (HD)', hint: '1280x720 máximo, sem ampliar.' },
  '480p': { width: 854, height: 480, label: '480p (SD)', hint: '854x480 máximo, sem ampliar.' },
};

const MIN_RESOLUTION_FACTOR = 0.12;
const MIN_ESTIMATE_BYTES = 64 * 1024;

let enginePromise: Promise<{ ffmpeg: FFmpegInstance; info: FfmpegEngineInfo }> | null = null;
let progressListener: ((ratio: number) => void) | null = null;
let logListener: ((line: string) => void) | null = null;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

function reasonOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function onFfmpegLog(listener: ((line: string) => void) | null): void {
  logListener = listener;
}

async function bootEngine(): Promise<{ ffmpeg: FFmpegInstance; info: FfmpegEngineInfo }> {
  // Import dinâmico: mantém o runtime do FFmpeg fora do bundle inicial da página.
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ]);

  const attempts: { coreURL: string; wasmURL: string; source: 'local' | 'cdn' }[] = [
    { coreURL: LOCAL_CORE_URL, wasmURL: LOCAL_WASM_URL, source: 'local' },
    ...CDN_BASES.map((base) => ({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      source: 'cdn' as const,
    })),
  ];

  const failures: string[] = [];

  for (const attempt of attempts) {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      logListener?.(message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      progressListener?.(clamp01(progress));
    });

    try {
      const coreURL = await toBlobURL(attempt.coreURL, 'text/javascript');
      const wasmURL = await toBlobURL(attempt.wasmURL, 'application/wasm');
      await ffmpeg.load({ coreURL, wasmURL });
      return { ffmpeg, info: { source: attempt.source, coreURL: attempt.coreURL } };
    } catch (cause) {
      failures.push(`${attempt.source} (${attempt.coreURL}): ${reasonOf(cause)}`);
      try {
        ffmpeg.terminate();
      } catch {
        /* core nunca subiu — nada a encerrar */
      }
    }
  }

  throw new Error(`Falha ao carregar o motor FFmpeg. Tentativas: ${failures.join(' | ')}`);
}

export function loadFfmpegEngine(): Promise<{ ffmpeg: FFmpegInstance; info: FfmpegEngineInfo }> {
  if (!enginePromise) {
    enginePromise = bootEngine().catch((cause) => {
      enginePromise = null;
      throw cause;
    });
  }
  return enginePromise;
}

/** Libera o núcleo do FFmpeg (worker + ~30MB de WASM) da memória. */
export async function terminateFfmpegEngine(): Promise<void> {
  const pending = enginePromise;
  enginePromise = null;
  progressListener = null;
  if (!pending) return;
  try {
    const { ffmpeg } = await pending;
    ffmpeg.terminate();
  } catch {
    /* engine nunca carregou */
  }
}

export function extractExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'mp4';
}

export function isSupportedVideo(file: File): boolean {
  const ext = extractExtension(file.name);
  if (ACCEPTED_VIDEO_EXTENSIONS.includes(ext)) return true;
  return typeof file.type === 'string' && file.type.startsWith('video/');
}

export function getCompressedFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'video';
  return `${base}_compactado.mp4`;
}

function buildVideoFilter(resolution: TargetResolution): string {
  if (resolution === 'original') {
    return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  }
  const box = RESOLUTION_BOXES[resolution];
  return `scale=${box.width}:${box.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
}

export function buildCompressionArgs(
  inputName: string,
  outputName: string,
  quality: CompressionQuality,
  resolution: TargetResolution,
): string[] {
  const preset = QUALITY_PRESETS[quality];
  return [
    '-hide_banner',
    '-i',
    inputName,
    '-vf',
    buildVideoFilter(resolution),
    '-c:v',
    'libx264',
    '-preset',
    preset.preset,
    '-crf',
    String(preset.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    preset.audioBitrate,
    '-movflags',
    '+faststart',
    outputName,
  ];
}

export async function readVideoMeta(file: File): Promise<VideoMeta | null> {
  if (typeof document === 'undefined') return null;

  const url = URL.createObjectURL(file);

  try {
    const meta = await new Promise<VideoMeta | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      const finish = (value: VideoMeta | null) => {
        video.removeAttribute('src');
        video.load();
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), 8000);

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        finish({
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
        });
      };

      video.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };

      video.src = url;
    });

    return meta;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function resolutionSizeFactor(resolution: TargetResolution, meta: VideoMeta | null): number {
  if (resolution === 'original') return 1;
  if (!meta || meta.width <= 0 || meta.height <= 0) return 0.45;

  const box = RESOLUTION_BOXES[resolution];
  const sourceArea = meta.width * meta.height;
  const targetArea = box.width * box.height;

  if (sourceArea <= targetArea) return 1;

  return Math.max(MIN_RESOLUTION_FACTOR, targetArea / sourceArea);
}

export function estimateCompressedBytes(
  originalBytes: number,
  quality: CompressionQuality,
  resolution: TargetResolution,
  meta: VideoMeta | null,
): number {
  const factor = QUALITY_PRESETS[quality].sizeFactor * resolutionSizeFactor(resolution, meta);
  return Math.max(MIN_ESTIMATE_BYTES, Math.round(originalBytes * factor));
}

export async function compressVideo(
  file: File,
  quality: CompressionQuality,
  resolution: TargetResolution,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  const { ffmpeg } = await loadFfmpegEngine();

  const inputName = `entrada.${extractExtension(file.name)}`;
  const outputName = 'saida.mp4';

  progressListener = onProgress;
  onProgress(0);

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    onProgress(0.02);

    await ffmpeg.exec(buildCompressionArgs(inputName, outputName, quality, resolution));

    const data = await ffmpeg.readFile(outputName);
    onProgress(1);

    if (typeof data === 'string' || data.byteLength === 0) {
      throw new Error('O FFmpeg gerou um arquivo vazio. Tente um nível de compressão menor.');
    }

    return new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
  } finally {
    progressListener = null;
    for (const name of [inputName, outputName]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* arquivo já removido do VFS */
      }
    }
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
