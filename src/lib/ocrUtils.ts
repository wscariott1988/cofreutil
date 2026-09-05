/* ===========================================================================
 * OCR Geral via Tesseract.js 100% local (Web Worker + WASM sem CDN)
 * ===========================================================================
 * Toda a infraestrutura roda no navegador do usuário:
 *  - workerPath  -> /wasm/tesseract-worker.min.js (worker compilado do tesseract.js)
 *  - corePath    -> /wasm/tesseract-core-*.wasm.js (motor WASM com detecção SIMD)
 *  - langPath    -> /wasm/lang/ (por.traineddata.gz e eng.traineddata.gz locais)
 *
 * Nenhuma imagem é enviada para servidores — LGPD-compliant por arquitetura.
 */

export type OcrLang = 'por' | 'eng';

export interface OcrLangMeta {
  code: OcrLang;
  label: string;
  native: string;
}

export const OCR_LANGS: OcrLangMeta[] = [
  { code: 'por', label: 'Português', native: 'Português (Brasil)' },
  { code: 'eng', label: 'Inglês', native: 'English' },
];

export const OCR_STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Carregando motor de OCR (WASM)…',
  'initializing tesseract': 'Inicializando motor de OCR…',
  'loading language traineddata': 'Carregando modelo de idioma…',
  'initializing api': 'Preparando API de reconhecimento…',
  'recognizing text': 'Reconhecendo texto da imagem…',
};

export interface OcrProgress {
  status: string;
  progress: number;
}

/* ---------------------------------------------------------------------------
 * Detecção de SIMD (síncrona, sem dependências)
 *
 * As sequências de bytes abaixo são módulos WebAssembly mínimos e válidos que
 * declaram um único opcode SIMD. `WebAssembly.validate` retorna true apenas se
 * o navegador suporta a feature — o mesmo mecanismo usado pelo pacote
 * wasm-feature-detect. Isso permite escolher o core WASM ideal e cair para o
 * build sem SIMD em dispositivos antigos (fallback automático).
 * ------------------------------------------------------------------------- */

const SIMD_BYTES = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 5, 1, 96, 0, 1, 123,
  3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

const RELAXED_SIMD_BYTES = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 5, 1, 96, 0, 1, 123,
  3, 2, 1, 0,
  10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11,
]);

function supportsSimd(kind: 'simd' | 'relaxed'): boolean {
  if (!('WebAssembly' in globalThis)) return false;
  try {
    return WebAssembly.validate(kind === 'relaxed' ? RELAXED_SIMD_BYTES : SIMD_BYTES);
  } catch {
    return false;
  }
}

/**
 * Resolve o arquivo de core WASM ideal para o dispositivo atual, priorizando o
 * build SIMD (e o relaxedsimd nos navegadores mais novos), com fallback
 * automático para o core sem SIMD em dispositivos antigos.
 */
export function resolveCorePath(): string {
  if (supportsSimd('relaxed')) return '/wasm/tesseract-core-relaxedsimd.wasm.js';
  if (supportsSimd('simd')) return '/wasm/tesseract-core-simd.wasm.js';
  return '/wasm/tesseract-core.wasm.js';
}

/* ---------------------------------------------------------------------------
 * Worker — instância única por idioma (reutilizada entre leituras)
 * ------------------------------------------------------------------------- */

interface TesseractWorkerLike {
  recognize(image: CanvasImageSource, options?: Record<string, unknown>, output?: Record<string, boolean>): Promise<{ data: { text?: string } }>;
  setParameters(params: Record<string, string | number>): Promise<void>;
  terminate(): Promise<void>;
}

let workerCache = new Map<OcrLang, Promise<TesseractWorkerLike>>();
let activeProgressHandler: ((p: OcrProgress) => void) | null = null;

async function getWorker(lang: OcrLang): Promise<TesseractWorkerLike> {
  if (!workerCache.has(lang)) {
    workerCache.set(
      lang,
      (async () => {
        const Tesseract = await import('tesseract.js');
        const worker = await Tesseract.createWorker(lang, 1, {
          workerPath: '/wasm/tesseract-worker.min.js',
          corePath: resolveCorePath(),
          langPath: '/wasm/lang',
          logger: (m: { status: string; progress: number }) => {
            if (activeProgressHandler) {
              activeProgressHandler({
                status: m.status,
                progress: Math.max(0, Math.min(100, Math.round((m.progress ?? 0) * 100))),
              });
            }
          },
        });
        await worker.setParameters({
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: '3',
        });
        return worker;
      })(),
    );
  }
  return workerCache.get(lang)!;
}

/* ---------------------------------------------------------------------------
 * Pré-processamento da imagem
 * ------------------------------------------------------------------------- */

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível decodificar a imagem enviada.'));
    };
    img.src = url;
  });
}

/**
 * Pré-processa a imagem para OCR: redimensiona o lado maior para ~2200px,
 * converte para tons de cinza e aplica esticamento de contraste. Retorna um
 * canvas que é entregue diretamente ao worker (zero cópia extra para disco).
 */
export async function prepareOcrCanvas(file: File): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  if (!width || !height) throw new Error('Imagem vazia — nada para processar.');

  const longest = Math.max(width, height);
  let scale = 1;
  if (longest > 2200) scale = 2200 / longest;
  else if (longest < 900) scale = Math.min(2, 900 / longest);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Seu navegador não suporta Canvas 2D.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Tons de cinza (Rec. 601) + esticamento de contraste por percentis
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  let low = 255;
  let high = 0;
  for (let p = 0; p < gray.length; p += 1) {
    if (gray[p] < low) low = gray[p];
    if (gray[p] > high) high = gray[p];
  }
  const range = high - low;
  const inv = range > 0 ? 255 / range : 1;

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const v = Math.max(0, Math.min(255, Math.round((gray[p] - low) * inv)));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------------------
 * OCR
 * ------------------------------------------------------------------------- */

export async function ocrGeneralImage(
  file: File,
  lang: OcrLang,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  activeProgressHandler = onProgress ?? null;
  const worker = await getWorker(lang);
  try {
    const canvas = await prepareOcrCanvas(file);
    const { data } = await worker.recognize(canvas);
    const text = typeof data?.text === 'string' ? data.text : '';
    return text;
  } finally {
    activeProgressHandler = null;
  }
}