import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import { convertImagesToPdf, type PageOrientation } from '../../lib/imageToPdf';
import { formatFileSize } from '../../lib/pdfUtils';

interface ImageItem {
  file: File;
  id: string;
  preview: string;
}

const ORIENTATIONS: {
  id: PageOrientation;
  label: string;
  desc: string;
}[] = [
  { id: 'a4-portrait', label: 'A4 Retrato', desc: 'Páginas verticais (padrão de documentos).' },
  { id: 'a4-landscape', label: 'A4 Paisagem', desc: 'Páginas horizontais (slides e larguras).' },
  { id: 'fit', label: 'Ajustar ao Tamanho', desc: 'Redimensiona a imagem para caber na página.' },
];

const ACCEPTED = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function isImage(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export default function ImageToPdfTool() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [orientation, setOrientation] = useState<PageOrientation>('a4-portrait');
  const [isConverting, setIsConverting] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const interactionCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pixPayload = generatePixCopyPaste();

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const accepted = Array.from(list).filter(isImage);
    if (accepted.length === 0) return;

    const enriched: ImageItem[] = accepted.map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      preview: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...enriched]);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeImage = useCallback(
    (id: string) => {
      setImages((prev) => {
        const target = prev.find((img) => img.id === id);
        if (target) URL.revokeObjectURL(target.preview);
        return prev.filter((img) => img.id !== id);
      });
      setResult(null);
    },
    [],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      setImages((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
      setResult(null);
    },
    [],
  );

  const move = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= images.length) return;
      reorder(index, target);
    },
    [images.length, reorder],
  );

  const handleConvert = useCallback(async () => {
    if (images.length === 0 || isConverting) return;

    setResult(null);
    setError(null);
    setIsConverting(true);

    // BatchLimiter atualiza de forma assíncrona e nunca bloqueia a conversão
    Promise.resolve().then(() => {
      BatchLimiter.incrementUsage(1);
      triggerSupportIfNeeded();
    });

    try {
      const bytes = await convertImagesToPdf(
        images.map((img) => img.file),
        { orientation },
      );
      setResult({ bytes, size: bytes.length });
    } catch (err: any) {
      setError(err?.message ?? 'Ocorreu um erro ao gerar o PDF.');
      setResult(null);
    } finally {
      setIsConverting(false);
    }
  }, [images, isConverting, orientation, triggerSupportIfNeeded]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const objectUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'imagens-convertidas.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }, [result]);

  return (
    <div className="w-full max-w-4xl">
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
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="font-mono text-sm text-white">Arraste imagens aqui</span>
        <span className="font-mono text-xs text-[#52525B]">
          JPG, PNG ou WEBP — ou clique para selecionar
        </span>
      </div>

      {/* Thumbnail grid */}
      {images.length > 0 && (
        <>
          <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
            {"// Ordene as imagens arrastando os cards ou usando as setas [←] [→]:"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {images.map((img, index) => (
              <div
                key={img.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) reorder(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`flex cursor-grab flex-col gap-2 border border-[#27272A] bg-[#09090B] p-3 active:cursor-grabbing ${
                  dragIndex === index ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[#52525B]">
                    #{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[11px] text-[#52525B]">[::]</span>
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden border border-[#27272A] bg-black">
                  <img
                    src={img.preview}
                    alt={img.file.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="truncate font-mono text-xs text-white" title={img.file.name}>
                  {img.file.name}
                </span>
                <span className="font-mono text-[11px] text-[#52525B]">
                  {formatFileSize(img.file.size)}
                </span>
                <div className="mt-auto flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30"
                    >
                      [←]
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === images.length - 1}
                      className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30"
                    >
                      [→]
                    </button>
                  </div>
                  <button
                    onClick={() => removeImage(img.id)}
                    className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                  >
                    [X]
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Page format options */}
      <div className="mt-4 flex flex-col gap-2">
        {ORIENTATIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setOrientation(opt.id)}
            className={`flex items-start gap-3 border border-[#27272A] bg-[#09090B] p-4 text-left transition-colors ${
              orientation === opt.id ? 'border-[#3F3F46] bg-[#18181B]' : 'hover:border-[#3F3F46]'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                orientation === opt.id ? 'bg-white text-black' : 'text-transparent'
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

      {/* Progress indicator */}
      {isConverting && (
        <p className="mt-4 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
          Gerando PDF a partir das imagens...
        </p>
      )}

      {/* Action */}
      <button
        onClick={handleConvert}
        disabled={images.length === 0 || isConverting}
        className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
      >
        {isConverting ? 'Gerando...' : '[Gerar PDF a partir das Imagens]'}
      </button>

      {/* Result panel */}
      {result && (
        <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
          <p className="mb-3 font-mono text-sm text-green-400">
            PDF gerado com sucesso — {images.length} imagem(ns), {formatFileSize(result.size)}.
          </p>
          <button
            onClick={handleDownload}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
          >
            [Baixar PDF Gerado]
          </button>
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Suas imagens são convertidas 100% no navegador e nunca são enviadas a servidores.
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
