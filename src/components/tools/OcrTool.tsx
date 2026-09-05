import { useCallback, useEffect, useRef, useState } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  OCR_LANGS,
  OCR_STATUS_LABELS,
  ocrGeneralImage,
  type OcrLang,
  type OcrProgress,
} from '../../lib/ocrUtils';

const ACCEPTED = 'image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp';

const isImageFile = (file: File) =>
  /image\/(png|jpe?g|webp|bmp)/i.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

function statusLabelOf(status: string): string {
  return OCR_STATUS_LABELS[status] ?? 'Processando imagem…';
}

export default function OcrTool() {
  const [lang, setLang] = useState<OcrLang>('por');
  const [selected, setSelected] = useState<{ file: File | null; preview: string | null; width: number; height: number }>({
    file: null,
    preview: null,
    width: 0,
    height: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress>({ status: '', progress: 0 });
  const [result, setResult] = useState<string>('');
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const interactionCount = useRef(0);
  const pixPayload = generatePixCopyPaste();

  useEffect(() => {
    return () => {
      setSelected((prev) => {
        if (prev.preview) URL.revokeObjectURL(prev.preview);
        return prev;
      });
    };
  }, []);

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const runOcr = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setResult('');
      setProgress({ status: 'loading tesseract core', progress: 0 });

      try {
        const text = await ocrGeneralImage(file, lang, (p: OcrProgress) => setProgress(p));
        setResult(text);
        setSourceLabel(file.name);

        Promise.resolve().then(() => {
          BatchLimiter.incrementUsage(1);
          triggerSupportIfNeeded();
        });
      } catch (err: any) {
        setError(
          err?.message ??
            'Falha ao processar a imagem. Tente novamente com uma imagem mais nítida.',
        );
      } finally {
        setBusy(false);
        setProgress({ status: '', progress: 0 });
      }
    },
    [lang, triggerSupportIfNeeded],
  );

  const pickFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        setSelected((prev) => {
          if (prev.preview) URL.revokeObjectURL(prev.preview);
          return { file, preview: url, width: probe.naturalWidth, height: probe.naturalHeight };
        });
        void runOcr(file);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setError(`Não foi possível ler a imagem "${file.name}".`);
      };
      probe.src = url;
    },
    [runOcr],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const file = Array.from(list)[0];
      if (!file) return;
      if (!isImageFile(file)) {
        setError('Formato não suportado. Envie uma imagem em PNG, JPG, WEBP ou BMP.');
        return;
      }
      setError(null);
      pickFile(file);
    },
    [pickFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const clearSelection = useCallback(() => {
    setSelected((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return { file: null, preview: null, width: 0, height: 0 };
    });
    setResult('');
    setError(null);
    setSourceLabel(null);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!result.trim()) return;
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
  }, [result]);

  const resultLines = result ? result.trim().split(/\r?\n/).filter((l) => l.length > 0) : [];
  const percent = progress.status ? Math.min(100, progress.progress) : 0;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Seleção de idioma */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs text-[#A1A1AA]">{'// idioma do documento'}</span>
        <div className="grid grid-cols-2 border border-[#27272A]">
          {OCR_LANGS.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                disabled={busy}
                className={`px-4 py-3 font-mono text-sm transition-colors disabled:opacity-40 ${
                  active
                    ? 'bg-[#18181B] text-white'
                    : 'bg-[#09090B] text-[#A1A1AA] hover:text-white'
                }`}
              >
                {l.label}
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[11px] text-[#52525B]">
          O modelo de idioma ({lang === 'por' ? 'por' : 'eng'}.traineddata.gz) é carregado do
          armazenamento local do site na primeira leitura e fica em cache no seu dispositivo.
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-center justify-between gap-3 border border-red-900 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      {/* Painel de upload */}
      {!selected.preview && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-6 py-16 text-center transition-colors ${
            dragOver ? 'border-[#3F3F46] bg-[#18181B]' : 'border-[#27272A] bg-[#09090B]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <span className="font-mono text-base text-white">
            {dragOver ? 'Solte a imagem aqui' : 'Arraste a imagem aqui'}
          </span>
          <span className="font-mono text-xs text-[#52525B]">
            PNG, JPG, WEBP ou BMP — ou clique para selecionar
          </span>
          <span className="border border-[#27272A] bg-black px-3 py-1.5 font-mono text-xs text-[#A1A1AA]">
            [Selecionar Imagem]
          </span>
        </div>
      )}

      {/* Imagem selecionada */}
      {selected.preview && (
        <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-mono text-xs text-white" title={selected.file?.name}>
              {selected.file?.name}
            </span>
            <button
              onClick={clearSelection}
              disabled={busy}
              className="shrink-0 font-mono text-[11px] text-[#52525B] transition-colors hover:text-white disabled:opacity-40"
            >
              [Remover X]
            </button>
          </div>
          <div className="flex max-h-80 items-center justify-center overflow-hidden border border-[#27272A] bg-black">
            <img
              src={selected.preview}
              alt={selected.file?.name ?? 'imagem selecionada'}
              className="max-h-80 object-contain"
            />
          </div>
          <span className="font-mono text-[11px] text-[#52525B]">
            {selected.width}×{selected.height}px · {formatFileSize(selected.file?.size ?? 0)} ·{' '}
            {lang === 'por' ? 'Português' : 'Inglês'}
          </span>
          <button
            onClick={() => selected.file && void runOcr(selected.file)}
            disabled={busy}
            className="border border-[#27272A] px-4 py-2 font-mono text-xs text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-40"
          >
            [Ler texto novamente]
          </button>
        </div>
      )}

      {/* Progresso em tempo real */}
      {busy && (
        <div className="flex flex-col gap-2 border border-[#27272A] bg-[#09090B] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-[#A1A1AA]">{statusLabelOf(progress.status)}</span>
            <span className="font-mono text-xs text-[#52525B]">
              {percent > 0 ? `${percent}%` : ''}
            </span>
          </div>
          <div className="h-1 w-full bg-[#27272A]">
            <div
              className="h-1 bg-[#A1A1AA] transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Resultado */}
      {!busy && result.trim().length > 0 && (
        <div className="flex flex-col gap-3 border border-green-900 bg-[#09090B] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm text-green-400">[TEXTO EXTRAÍDO]</span>
              {sourceLabel && (
                <span className="font-mono text-[10px] text-[#52525B]">fonte: {sourceLabel}</span>
              )}
            </div>
            <button
              onClick={() => void handleCopy()}
              className="border border-[#27272A] px-4 py-2 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              {copied ? '[Copiado!]' : '[Copiar Texto]'}
            </button>
          </div>
          <textarea
            readOnly
            value={result}
            spellCheck={false}
            rows={Math.max(6, Math.min(18, resultLines.length + 1))}
            className="min-h-[144px] w-full resize-y border border-[#27272A] bg-black px-3 py-2 font-mono text-xs leading-relaxed text-white outline-none placeholder:text-[#52525B] focus:border-[#3F3F46]"
          />
          {resultLines.length === 0 && (
            <p className="font-mono text-[11px] text-[#52525B]">
              Nenhum texto reconhecido. Tente uma imagem com maior contraste, bem iluminada e com
              foco nítido.
            </p>
          )}
        </div>
      )}

      {/* Badge de privacidade */}
      <div className="flex items-start gap-2 border border-[#27272A] bg-[#09090B] px-4 py-3">
        <span className="shrink-0 font-mono text-xs text-white">[🔒 PROCESSAMENTO LOCAL]</span>
        <p className="text-xs leading-relaxed text-[#A1A1AA]">
          Suas fotos não são enviadas para nossos servidores. O reconhecimento de texto ocorre na
          memória do seu navegador.
        </p>
      </div>

      {/* Modal de apoio voluntário */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Ferramenta 100% gratuita e privada (zero servidores). Se te economizou tempo,
              considere apoiar o projeto com qualquer valor via Pix.
            </p>
            <div className="border border-[#27272A] bg-black px-4 py-3 text-center">
              <span className="font-mono text-sm text-white">Chave Pix: apoio@grupows.com</span>
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
              Continuar usando grátis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}