import { useCallback, useRef, useState } from 'react';
import { formatFileSize } from '../../lib/pdfUtils';

interface DecodeResult {
  data: string;
  version: number;
  isUrl: boolean;
  host: string | null;
}

interface QrImage {
  file: File;
  preview: string;
  width: number;
  height: number;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'ok'; result: DecodeResult }
  | { kind: 'notfound'; message: string }
  | { kind: 'error'; message: string };

const ACCEPTED = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

function loadImage(file: File): Promise<HTMLImageElement> {
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

function decodeResultFrom(text: string, version: number): DecodeResult {
  const isUrl = /^https?:\/\//i.test(text);
  let host: string | null = null;
  if (isUrl) {
    try {
      host = new URL(text).hostname;
    } catch {
      host = null;
    }
  }
  return { data: text, version, isUrl, host };
}

async function readQrFromImage(file: File): Promise<{ text: string; version: number }> {
  const img = await loadImage(file);

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
  if (!ctx) throw new Error('Canvas 2D não suportado no seu navegador.');
  ctx.drawImage(img, 0, 0, cw, ch);

  const imageData = ctx.getImageData(0, 0, cw, ch);

  const { default: jsQR } = await import('jsqr');
  const code = jsQR(imageData.data, cw, ch, { inversionAttempts: 'attemptBoth' });

  if (!code) return { text: '', version: 0 };
  return { text: code.data, version: code.version };
}

export default function QrReaderTool() {
  const [image, setImage] = useState<QrImage | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const decode = useCallback(async (file: File) => {
    setStatus({ kind: 'reading' });
    const objectUrl = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const meta = { width: probe.naturalWidth, height: probe.naturalHeight };
      const next: QrImage = { file, preview: URL.createObjectURL(file), ...meta };
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.preview);
        return next;
      });
      void performRead(file);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImage(null);
      setStatus({
        kind: 'error',
        message: `Não foi possível ler a imagem "${file.name}".`,
      });
    };
    probe.src = objectUrl;
  }, []);

  const performRead = useCallback(async (file: File) => {
    try {
      const { text, version } = await readQrFromImage(file);
      if (!text) {
        setStatus({
          kind: 'notfound',
          message:
            'Nenhum QR Code foi encontrado. Aumente o contraste, aproxime a câmera do código e tente novamente.',
        });
        return;
      }
      setStatus({ kind: 'ok', result: decodeResultFrom(text, version) });
    } catch (err: any) {
      setStatus({
        kind: 'error',
        message: err?.message ?? 'Falha ao decodificar o QR Code.',
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void decode(file);
    },
    [decode],
  );

  const handleCopy = useCallback(async () => {
    const result = status.kind === 'ok' ? status.result.data : '';
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [status]);

  const result = status.kind === 'ok' ? status.result : null;

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
      {/* Coluna da imagem */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void decode(file);
              e.target.value = '';
            }}
          />
          <span className="font-mono text-sm text-white">
            {image ? 'Trocar imagem' : 'Arraste uma imagem com QR Code'}
          </span>
          <span className="font-mono text-xs text-[#52525B]">
            PNG, JPG ou WEBP — ou clique para selecionar
          </span>
        </div>

        {image && (
          <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3">
            <div className="flex max-h-80 items-center justify-center overflow-hidden border border-[#27272A] bg-black">
              <img
                src={image.preview}
                alt={image.file.name}
                className="max-h-80 object-contain"
              />
            </div>
            <span className="truncate font-mono text-xs text-white" title={image.file.name}>
              {image.file.name}
            </span>
            <span className="font-mono text-[11px] text-[#52525B]">
              {image.width}×{image.height}px · {formatFileSize(image.file.size)}
            </span>
          </div>
        )}
      </div>

      {/* Coluna do resultado */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
            // RESULTADO DA LEITURA
          </span>
          {status.kind === 'reading' && (
            <span className="font-mono text-[11px] text-[#A1A1AA]">[DECODIFICANDO…]</span>
          )}
        </div>

        {status.kind === 'idle' && (
          <div className="border border-[#27272A] bg-[#09090B] px-5 py-10 text-center">
            <p className="font-mono text-xs text-[#52525B]">
              O conteúdo do QR Code aparecerá aqui.
            </p>
          </div>
        )}

        {status.kind === 'reading' && (
          <div className="flex flex-col items-center justify-center gap-2 border border-[#27272A] bg-[#09090B] px-5 py-10">
            <span className="font-mono text-xs text-[#A1A1AA]">
              Lendo imagem e decodificando (100% local)…
            </span>
          </div>
        )}

        {status.kind === 'notfound' && (
          <div className="flex items-center gap-3 border border-yellow-900 bg-[#09090B] px-4 py-3">
            <span className="font-mono text-sm text-yellow-300">[QR NÃO DETECTADO]</span>
            <span className="font-mono text-xs text-[#A1A1AA]">{status.message}</span>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="flex items-center gap-3 border border-red-900 bg-[#09090B] px-4 py-3">
            <span className="font-mono text-sm text-red-400">[ERRO]</span>
            <span className="font-mono text-xs text-red-300">{status.message}</span>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3 border border-green-900 bg-[#09090B] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-green-400">
                [QR CODE LIDO · VERSÃO {result.version}]
              </span>
              <button
                onClick={handleCopy}
                className="border border-[#27272A] px-2.5 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
              >
                {copied ? '[Copiado!]' : '[Copiar]'}
              </button>
            </div>
            <p className="break-all border border-[#27272A] bg-black px-4 py-3 font-mono text-sm leading-relaxed text-white">
              {result.data}
            </p>

            {result.isUrl && (
              <div className="flex flex-col gap-1 border border-yellow-900 bg-black px-3 py-2.5">
                <span className="font-mono text-[11px] font-medium text-yellow-300">
                  [ATENÇÃO — LINK DETECTADO{result.host ? `: ${result.host}` : ''}]
                </span>
                <p className="text-xs leading-relaxed text-[#A1A1AA]">
                  QR Codes podem esconder links de phishing. Confira se o endereço
                  pertence ao serviço esperado antes de abrir — principalmente se o
                  código veio de uma fonte desconhecida.
                </p>
              </div>
            )}

            {!result.isUrl && (
              <div className="border border-[#27272A] bg-black px-3 py-2.5">
                <p className="text-xs leading-relaxed text-[#A1A1AA]">
                  Conteúdo de texto simples — não é um link clicável.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="font-mono text-xs text-[#A1A1AA]">
          A leitura usa a biblioteca jsQR (carregada sob demanda) sobre os pixels
          da imagem via Canvas API. Nada é enviado a servidores — o código decodificado
          nunca deixa a sua máquina.
        </p>
      </div>
    </div>
  );
}
