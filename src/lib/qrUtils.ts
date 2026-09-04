/* =============================================================================
 * qrUtils.ts — Decodificação local de QR Codes via jsQR + Canvas API
 * -----------------------------------------------------------------------------
 * Suporta leitura a partir de arquivos de imagem (PNG/JPG/WEBP) e de quadros
 * ao vivo de vídeo (câmera/webcam). O jsQR é carregado sob demanda e nenhum
 * byte do arquivo ou frame sai do navegador.
 * ========================================================================== */

export interface QrDecoded {
  data: string;
  version: number;
  isUrl: boolean;
  host: string | null;
}

/** Classifica o texto decodificado (URL ou texto simples) para o alerta de segurança. */
export function classifyQrText(text: string): Pick<QrDecoded, 'isUrl' | 'host'> {
  const isUrl = /^https?:\/\//i.test(text);
  let host: string | null = null;
  if (isUrl) {
    try {
      host = new URL(text).hostname;
    } catch {
      host = null;
    }
  }
  return { isUrl, host };
}

function toDecoded(data: string, version: number): QrDecoded {
  const { isUrl, host } = classifyQrText(data);
  return { data, version, isUrl, host };
}

type JsQrModule = typeof import('jsqr');
let jsQrPromise: Promise<JsQrModule> | null = null;

function getJsQr(): Promise<JsQrModule> {
  if (!jsQrPromise) jsQrPromise = import('jsqr');
  return jsQrPromise;
}

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
      reject(new Error(`Não foi possível ler a imagem "${file.name}".`));
    };
    img.src = url;
  });
}

/**
 * Decodifica um QR Code contido em um arquivo de imagem (PNG/JPG/WEBP).
 * Retorna `null` quando nenhum código é encontrado.
 */
export async function decodeQrFromImageFile(file: File): Promise<QrDecoded | null> {
  const jsQr = (await getJsQr()).default;
  const img = await loadImageElement(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const shortest = Math.min(img.naturalWidth, img.naturalHeight);
  let scale = longest > 1800 ? 1800 / longest : 1;
  if (shortest * scale < 280) scale = Math.min(280 / shortest, 4);

  const cw = Math.max(1, Math.round(img.naturalWidth * scale));
  const ch = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Seu navegador não suporta Canvas 2D.');

  ctx.drawImage(img, 0, 0, cw, ch);
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const code = jsQr(imageData.data, cw, ch, { inversionAttempts: 'attemptBoth' });
  if (!code) return null;
  return toDecoded(code.data, code.version);
}

/**
 * Decodifica o quadro atual de um elemento <video> (câmera/webcam).
 * Leitura síncrona e barata — o componente controla a frequência via rAF.
 * Retorna `null` quando nenhum QR Code está enquadrado neste instante.
 */
export async function decodeQrFromVideoFrame(
  video: HTMLVideoElement,
): Promise<QrDecoded | null> {
  const vw = video.videoWidth || video.width;
  const vh = video.videoHeight || video.height;
  if (!vw || !vh) return null;

  const longest = Math.max(vw, vh);
  const shortest = Math.min(vw, vh);
  let scale = longest > 1280 ? 1280 / longest : 1;
  if (shortest * scale < 240) scale = Math.min(240 / shortest, 2.5);

  const cw = Math.max(1, Math.round(vw * scale));
  const ch = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, cw, ch);
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const jsQr = (await getJsQr()).default;
  const code = jsQr(imageData.data, cw, ch, { inversionAttempts: 'attemptBoth' });
  if (!code) return null;
  return toDecoded(code.data, code.version);
}

/** Métrica auxiliar usada pela UI para exibir as dimensões do vídeo. */
export function videoDimensions(
  video: HTMLVideoElement,
): { width: number; height: number } | null {
  const vw = video.videoWidth || video.width;
  const vh = video.videoHeight || video.height;
  if (!vw || !vh) return null;
  return { width: vw, height: vh };
}
