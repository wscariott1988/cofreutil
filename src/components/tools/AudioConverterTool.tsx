import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import {
  MAX_AUDIO_BYTES,
  decodeAudio,
  cropBuffer,
  wavFromBuffer,
  encodeMp3,
  encodeOgg,
  formatSeconds,
} from '../../lib/audioCodecs';

type OutputFormat = 'wav' | 'mp3' | 'ogg';

const MP3_BITRATES = [128, 192, 320];

export default function AudioConverterTool() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [format, setFormat] = useState<OutputFormat>('mp3');
  const [bitrate, setBitrate] = useState(192);
  const [oggQuality, setOggQuality] = useState(0.5);
  const [isConverting, setIsConverting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const interactionCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const pixPayload = generatePixCopyPaste();

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const selectFile = useCallback(
    async (selected: File | undefined) => {
      if (!selected) return;
      if (selected.size > MAX_AUDIO_BYTES) {
        setError('Arquivo acima de 100MB. Reduza o tamanho antes de converter.');
        return;
      }
      setFile(selected);
      setError(null);
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
      setIsDecoding(true);
      try {
        const decoded = await decodeAudio(await selected.arrayBuffer());
        bufferRef.current = decoded;
        setBuffer(decoded);
        setStartSec(0);
        setEndSec(decoded.duration);
      } catch {
        setError('Não foi possível decodificar este áudio. Use WAV, MP3 ou OGG compatível.');
        setBuffer(null);
      } finally {
        setIsDecoding(false);
      }
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

  const handlePreview = useCallback(() => {
    if (!bufferRef.current) return;
    const start = Math.min(startSec, Math.max(0, bufferRef.current.duration));
    const end = Math.min(endSec, bufferRef.current.duration);
    const trimmed = cropBuffer(bufferRef.current, start, end);
    const url = URL.createObjectURL(wavFromBuffer(trimmed));
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, [startSec, endSec]);

  const handleConvert = useCallback(async () => {
    if (!bufferRef.current || isConverting) return;
    const start = Math.min(startSec, Math.max(0, bufferRef.current.duration));
    const end = Math.min(endSec, bufferRef.current.duration);
    if (end - start < 0.05) {
      setError('Selecione um trecho com pelo menos 50ms.');
      return;
    }
    setError(null);
    setIsConverting(true);
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      triggerSupportIfNeeded();
    });
    try {
      const trimmed = cropBuffer(bufferRef.current, start, end);
      let blob: Blob;
      let ext: string;
      if (format === 'wav') {
        blob = wavFromBuffer(trimmed);
        ext = 'wav';
      } else if (format === 'mp3') {
        blob = await encodeMp3(trimmed, bitrate);
        ext = 'mp3';
      } else {
        blob = await encodeOgg(trimmed, oggQuality);
        ext = 'ogg';
      }
      const baseName = file ? file.name.replace(/\.[^.]+$/, '') : 'audio';
      const trimmedLabel = end - start < bufferRef.current.duration - 0.05 ? '_cortado' : '';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${baseName}${trimmedLabel}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError('Ocorreu um erro ao converter o áudio. Tente outro formato.');
    } finally {
      setIsConverting(false);
    }
  }, [file, format, bitrate, oggQuality, startSec, endSec, isConverting, triggerSupportIfNeeded]);

  const clearSelection = useCallback(() => {
    setFile(null);
    setBuffer(null);
    bufferRef.current = null;
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setError(null);
  }, []);

  const duration = buffer?.duration ?? 0;
  const clampedStart = Math.min(startSec, Math.max(0, duration));
  const clampedEnd = Math.min(endSec, Math.max(0, duration));

  return (
    <div className="w-full max-w-2xl">
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
          accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.webm,.flac"
          className="hidden"
          onChange={(e) => {
            selectFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {file ? (
          isDecoding ? (
            <span className="font-mono text-sm text-[#A1A1AA]">Decodificando áudio...</span>
          ) : (
            <>
              <span className="truncate font-mono text-sm text-white">{file.name}</span>
              <span className="font-mono text-xs text-[#52525B]">
                Duração {formatSeconds(duration)} • {buffer?.sampleRate ?? '-'} Hz •{' '}
                {buffer ? (buffer.numberOfChannels > 1 ? 'estéreo' : 'mono') : '-'}
              </span>
            </>
          )
        ) : (
          <>
            <span className="font-mono text-sm text-white">Arraste um áudio aqui</span>
            <span className="font-mono text-xs text-[#52525B]">
              ou clique para selecionar (WAV, MP3, OGG, M4A, WebM)
            </span>
          </>
        )}
      </div>

      {/* Loaded actions */}
      {buffer && file && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={clearSelection}
            className="font-mono text-xs text-[#52525B] transition-colors hover:text-white"
          >
            [Trocar arquivo]
          </button>
        </div>
      )}

      {/* Trim controls */}
      {buffer && (
        <div className="mt-4 flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-white">[CORTAR]</span>
            <span className="font-mono text-xs text-[#52525B]">
              Duração total: {formatSeconds(duration)}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs text-[#A1A1AA]">Início (s)</span>
              <input
                type="number"
                min={0}
                max={duration.toFixed(0)}
                step={0.1}
                value={clampedStart}
                onChange={(e) => setStartSec(Number(e.target.value))}
                className="border border-[#27272A] bg-black px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#3F3F46]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs text-[#A1A1AA]">Fim (s)</span>
              <input
                type="number"
                min={0}
                max={duration.toFixed(0)}
                step={0.1}
                value={clampedEnd}
                onChange={(e) => setEndSec(Number(e.target.value))}
                className="border border-[#27272A] bg-black px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#3F3F46]"
              />
            </label>
            <button
              onClick={handlePreview}
              className="self-end border border-[#27272A] bg-black px-4 py-2 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              [Ouvir Trecho]
            </button>
          </div>
          {previewUrl && (
            <audio
              ref={previewRef}
              controls
              src={previewUrl}
              className="w-full border border-[#27272A] bg-black"
            />
          )}
        </div>
      )}

      {/* Output format */}
      {buffer && (
        <div className="mt-4 flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-4">
          <span className="font-mono text-sm text-white">[SAÍDA]</span>
          <div className="flex flex-col gap-2">
            {(
              [
                { id: 'wav', label: 'WAV', desc: 'Sem perdas (PCM). Ideal para edição.' },
                { id: 'mp3', label: 'MP3', desc: 'Compacto e universal. Padrão de mercado.' },
                { id: 'ogg', label: 'OGG', desc: 'Vorbis de alta eficiência (open source).' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFormat(opt.id)}
                className={`flex items-start gap-3 border border-[#27272A] bg-[#09090B] p-4 text-left transition-colors ${
                  format === opt.id ? 'border-[#3F3F46] bg-[#18181B]' : 'hover:border-[#3F3F46]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                    format === opt.id ? 'bg-white text-black' : 'text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm text-white">{opt.label}</span>
                  <span className="text-xs leading-relaxed text-[#A1A1AA]">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
          {format === 'mp3' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-[#A1A1AA]">Bitrate:</span>
              {MP3_BITRATES.map((kbps) => (
                <button
                  key={kbps}
                  onClick={() => setBitrate(kbps)}
                  className={`border border-[#27272A] px-3 py-1 font-mono text-xs transition-colors ${
                    bitrate === kbps ? 'bg-white text-black' : 'bg-black text-[#A1A1AA] hover:border-[#3F3F46]'
                  }`}
                >
                  {kbps}kbps
                </button>
              ))}
            </div>
          )}
          {format === 'ogg' && (
            <div className="mt-2 flex flex-col gap-1">
              <span className="font-mono text-xs text-[#A1A1AA]">
                Qualidade Vorbis: {oggQuality.toFixed(1)}
              </span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={oggQuality}
                onChange={(e) => setOggQuality(Number(e.target.value))}
                className="accent-white"
              />
            </div>
          )}
        </div>
      )}

      {/* Action */}
      {buffer && (
        <button
          onClick={handleConvert}
          disabled={isConverting}
          className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
        >
          {isConverting ? 'Convertendo...' : '[Converter e Baixar]'}
        </button>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Conversão e corte acontecem 100% no seu navegador. O áudio nunca é enviado a
        servidores. [Limite: 100MB]
      </p>

      {/* Support Modal */}
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