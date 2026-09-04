import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeQrFromImageFile,
  decodeQrFromVideoFrame,
  type QrDecoded,
} from '../../lib/qrUtils';
import { formatFileSize } from '../../lib/pdfUtils';

type Mode = 'upload' | 'camera';

type Phase = 'idle' | 'busy' | 'ok' | 'empty' | 'error';

interface UiState {
  phase: Phase;
  result: QrDecoded | null;
  message: string | null;
}

const IDLE: UiState = { phase: 'idle', result: null, message: null };

const ACCEPTED = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

function loadImageProbe(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível ler a imagem "${file.name}".`));
    };
    img.src = url;
  });
}

export default function QrScannerTool() {
  const [mode, setMode] = useState<Mode>('upload');
  const [ui, setUi] = useState<UiState>(IDLE);
  const [image, setImage] = useState<{
    file: File;
    preview: string;
    width: number;
    height: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastScanRef = useRef(0);
  const inFlightRef = useRef(false);

  const stopCamera = useCallback(() => {
    setScanning(false);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (mode === 'upload') stopCamera();
  }, [mode, stopCamera]);

  const setResultOk = useCallback((result: QrDecoded) => {
    setUi({ phase: 'ok', result, message: null });
  }, []);

  const decodeVideoLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    const now = performance.now();
    if (now - lastScanRef.current < 140 || inFlightRef.current) return;
    lastScanRef.current = now;
    inFlightRef.current = true;

    void decodeQrFromVideoFrame(video)
      .then((found) => {
        if (found) {
          setScanning(false);
          setResultOk(found);
        }
      })
      .catch(() => {
        setUi({
          phase: 'error',
          result: null,
          message: 'Falha ao decodificar o quadro da câmera.',
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [setResultOk]);

  const rafTick = useCallback(() => {
    rafRef.current = requestAnimationFrame(rafTick);
    if (scanning) decodeVideoLoop();
  }, [scanning, decodeVideoLoop]);

  const enableCamera = useCallback(async () => {
    if (cameraOn) return;
    setCameraError(null);
    setUi(IDLE);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setScanning(true);
    } catch {
      setCameraError(
        'Não foi possível acessar a câmera. Verifique as permissões ou use o modo upload de imagem.',
      );
    }
  }, [cameraOn]);

  useEffect(() => {
    if (cameraOn && scanning) {
      rafRef.current = requestAnimationFrame(rafTick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [cameraOn, scanning, rafTick]);

  const stopScan = useCallback(() => {
    setScanning(false);
  }, []);

  const rescan = useCallback(() => {
    setUi(IDLE);
    setScanning(true);
  }, []);

  const decodeFile = useCallback(async (file: File) => {
    setUi({ phase: 'busy', result: null, message: 'Decodificando imagem (100% local)…' });
    try {
      const found = await decodeQrFromImageFile(file);
      if (found) {
        setResultOk(found);
      } else {
        setUi({
          phase: 'empty',
          result: null,
          message:
            'Nenhum QR Code foi encontrado. Aumente o contraste, aproxime o código e tente novamente.',
        });
      }
    } catch (err: any) {
      setUi({
        phase: 'error',
        result: null,
        message: err?.message ?? 'Falha ao decodificar o QR Code.',
      });
    }
  }, [setResultOk]);

  const handleFilePicked = useCallback(
    async (file: File) => {
      setUi({ phase: 'busy', result: null, message: 'Lendo a imagem…' });
      try {
        const meta = await loadImageProbe(file);
        setImage((prev) => {
          if (prev) URL.revokeObjectURL(prev.preview);
          return { file, preview: URL.createObjectURL(file), ...meta };
        });
      } catch (err: any) {
        setUi({ phase: 'error', result: null, message: err?.message ?? 'Falha ao ler a imagem.' });
        return;
      }
      await decodeFile(file);
    },
    [decodeFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFilePicked(file);
    },
    [handleFilePicked],
  );

  const handleCopy = useCallback(async () => {
    const text = ui.result?.data;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [ui.result]);

  const result = ui.result;

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Mode toggle */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={() => setMode('upload')}
          className={`border border-[#27272A] px-4 py-3 font-mono text-sm transition-colors ${
            mode === 'upload'
              ? 'bg-[#18181B] text-white'
              : 'bg-[#09090B] text-[#A1A1AA] hover:text-white'
          }`}
        >
          [Upload de Imagem]
        </button>
        <button
          onClick={() => setMode('camera')}
          className={`border border-[#27272A] px-4 py-3 font-mono text-sm transition-colors ${
            mode === 'camera'
              ? 'bg-[#18181B] text-white'
              : 'bg-[#09090B] text-[#A1A1AA] hover:text-white'
          }`}
        >
          [Scanner via Câmera/Webcam]
        </button>
      </div>

      {/* Camera area */}
      {mode === 'camera' && (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden border border-[#27272A] bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`aspect-[4/3] w-full object-cover ${cameraOn ? '' : 'hidden'}`}
            />
            {!cameraOn && (
              <div className="flex aspect-[4/3] w-full items-center justify-center">
                <span className="font-mono text-xs text-[#52525B]">
                  {cameraError ?? 'A câmera fica ativa apenas neste site — o vídeo nunca sai da sua máquina.'}
                </span>
              </div>
            )}
            {cameraOn && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`h-56 w-56 border-2 ${
                    scanning
                      ? 'border-dashed border-[#A1A1AA]'
                      : 'border-solid border-green-400'
                  }`}
                />
              </div>
            )}
            {cameraOn && scanning && (
              <span className="absolute left-3 top-3 border border-[#27272A] bg-black px-2 py-1 font-mono text-[10px] text-[#A1A1AA]">
                [PROCURANDO QR CODE…]
              </span>
            )}
            {cameraOn && !scanning && result && (
              <span className="absolute left-3 top-3 border border-green-900 bg-black px-2 py-1 font-mono text-[10px] text-green-400">
                [QR CODE DETECTADO]
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {!cameraOn ? (
              <button
                onClick={() => void enableCamera()}
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                [Ativar Câmera]
              </button>
            ) : scanning ? (
              <button
                onClick={stopScan}
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
              >
                [Pausar]
              </button>
            ) : (
              <button
                onClick={rescan}
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
              >
                [Escanear Outro Código]
              </button>
            )}
            {cameraOn && (
              <button
                onClick={stopCamera}
                className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
              >
                [Desligar Câmera]
              </button>
            )}
          </div>

          {ui.phase === 'error' && (
            <div className="flex items-center gap-3 border border-red-900 bg-[#09090B] px-4 py-3">
              <span className="font-mono text-sm text-red-400">[ERRO]</span>
              <span className="font-mono text-xs text-red-300">{ui.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Upload area */}
      {mode === 'upload' && (
        <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
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
                dragOver
                  ? 'border-[#3F3F46] bg-[#18181B]'
                  : 'border-[#27272A] bg-[#09090B]'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFilePicked(file);
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
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-white" title={image.file.name}>
                    {image.file.name}
                  </span>
                  <button
                    onClick={() => {
                      setImage((prev) => {
                        if (prev) URL.revokeObjectURL(prev.preview);
                        return null;
                      });
                      setUi(IDLE);
                    }}
                    className="shrink-0 font-mono text-[11px] text-[#52525B] transition-colors hover:text-white"
                  >
                    [X]
                  </button>
                </div>
                <span className="font-mono text-[11px] text-[#52525B]">
                  {image.width}×{image.height}px · {formatFileSize(image.file.size)}
                </span>
              </div>
            )}

            {ui.phase === 'busy' && (
              <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] px-4 py-3">
                <span className="font-mono text-sm text-[#A1A1AA]">{ui.message}</span>
                <div className="h-1 w-full animate-pulse bg-[#A1A1AA]" />
              </div>
            )}
          </div>

          {/* Result column */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
                // CONTEÚDO DECODIFICADO
              </span>
              {ui.phase === 'busy' && (
                <span className="font-mono text-[11px] text-[#A1A1AA]">[DECODIFICANDO…]</span>
              )}
            </div>

            {ui.phase === 'idle' && (
              <div className="border border-[#27272A] bg-[#09090B] px-5 py-10 text-center">
                <p className="font-mono text-xs text-[#52525B]">
                  O conteúdo do QR Code aparecerá aqui.
                </p>
              </div>
            )}

            {ui.phase === 'empty' && (
              <div className="flex flex-col gap-1 border border-yellow-900 bg-[#09090B] px-4 py-3">
                <span className="font-mono text-sm text-yellow-300">[QR NÃO DETECTADO]</span>
                <span className="font-mono text-xs text-[#A1A1AA]">{ui.message}</span>
              </div>
            )}

            {ui.phase === 'error' && mode === 'upload' && (
              <div className="flex flex-col gap-1 border border-red-900 bg-[#09090B] px-4 py-3">
                <span className="font-mono text-sm text-red-400">[ERRO]</span>
                <span className="font-mono text-xs text-red-300">{ui.message}</span>
              </div>
            )}

            {result && (
              <div className="flex flex-col gap-3 border border-green-900 bg-[#09090B] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-green-400">
                    [QR CODE LIDO · VERSÃO {result.version}]
                  </span>
                  <button
                    onClick={() => void handleCopy()}
                    className="border border-[#27272A] px-2.5 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                  >
                    {copied ? '[Copiado!]' : '[Copiar Conteúdo]'}
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
                      QR Codes podem esconder links de phishing. Confira se o endereço pertence ao
                      serviço esperado antes de abrir — principalmente se o código veio de uma fonte
                      desconhecida.
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
              A leitura usa a biblioteca jsQR (carregada sob demanda) sobre os pixels via Canvas
              API. Nada é enviado a servidores — o código decodificado nunca deixa a sua máquina.
            </p>
          </div>
        </div>
      )}

      {/* Shared result when camera found below the video */}
      {mode === 'camera' && result && (
        <div className="flex flex-col gap-3 border border-green-900 bg-[#09090B] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-green-400">
              [QR CODE LIDO · VERSÃO {result.version}]
            </span>
            <button
              onClick={() => void handleCopy()}
              className="border border-[#27272A] px-2.5 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
            >
              {copied ? '[Copiado!]' : '[Copiar Conteúdo]'}
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
                QR Codes podem esconder links de phishing. Confira se o endereço pertence ao serviço
                esperado antes de abrir — principalmente se o código veio de uma fonte desconhecida.
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
    </div>
  );
}
