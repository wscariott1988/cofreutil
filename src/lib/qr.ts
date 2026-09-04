export interface QrOptions {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

interface QrCodeModule {
  toString(text: string, options?: Record<string, unknown>): Promise<string>;
  toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
}

const DEFAULT_OPTIONS: QrOptions = {
  size: 320,
  margin: 2,
  errorCorrectionLevel: 'H',
};

/**
 * Carrega a biblioteca `qrcode` de forma dinâmica e segura (somente no
 * cliente). Isso impede que o bundler in-line a dependência no chunk do
 * componente, garantindo que o formulário sempre monte antes da renderização
 * do QR Code.
 */
async function loadQrCode(): Promise<QrCodeModule> {
  const mod: unknown = await import('qrcode');
  const defaultExport = (mod as { default?: QrCodeModule }).default;
  return defaultExport ?? (mod as QrCodeModule);
}

/** Gera o QR Code como SVG (monocromático, ideal para exibição). */
export async function generateQrCodeSvg(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  const qr = await loadQrCode();
  return qr.toString(payload, {
    type: 'svg',
    width: options.size ?? DEFAULT_OPTIONS.size,
    margin: options.margin ?? DEFAULT_OPTIONS.margin,
    errorCorrectionLevel:
      options.errorCorrectionLevel ?? DEFAULT_OPTIONS.errorCorrectionLevel,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

/** Gera o QR Code como PNG (data URL, para download). */
export async function generateQrCodePng(
  payload: string,
  options: QrOptions = {},
): Promise<string> {
  const qr = await loadQrCode();
  return qr.toDataURL(payload, {
    width: options.size ?? DEFAULT_OPTIONS.size,
    margin: options.margin ?? DEFAULT_OPTIONS.margin,
    errorCorrectionLevel:
      options.errorCorrectionLevel ?? DEFAULT_OPTIONS.errorCorrectionLevel,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
