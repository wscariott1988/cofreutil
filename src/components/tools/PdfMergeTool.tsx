import { useState, useCallback, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import { mergePDFBuffers, formatFileSize } from '../../lib/pdfUtils';

interface PdfFile {
  file: File;
  id: string;
  pages: number;
}

function countPages(file: File): Promise<number> {
  return file.arrayBuffer().then((buffer) => {
    return import('pdf-lib').then(({ PDFDocument }) =>
      PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true }).then(
        (doc) => doc.getPageCount(),
      ),
    );
  });
}

export default function PdfMergeTool() {
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [resultBlob, setResultBlob] = useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );

    const enriched: PdfFile[] = await Promise.all(
      pdfFiles.map(async (file) => ({
        file,
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        pages: await countPages(file),
      })),
    );

    setPdfs((prev) => [...prev, ...enriched]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removePdf = useCallback((id: string) => {
    setPdfs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setPdfs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const move = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= pdfs.length) return;
      reorder(index, target);
    },
    [pdfs.length, reorder],
  );

  const handleMerge = useCallback(async () => {
    if (pdfs.length === 0 || isMerging) return;

    const count = BatchLimiter.incrementUsage(1);
    triggerSupportIfNeeded();

    setResultBlob(null);
    setIsMerging(true);
    try {
      const result = await mergePDFBuffers(pdfs.map((p) => p.file));
      const blob = new Blob([result.buffer as ArrayBuffer], { type: 'application/pdf' });
      setResultBlob({ blob, name: 'juntado.pdf', size: blob.size });
    } finally {
      setIsMerging(false);
    }

    if (count >= 5) setShowSupport(true);
  }, [pdfs, isMerging, triggerSupportIfNeeded]);

  const handleDownload = useCallback(() => {
    if (!resultBlob) return;
    const objectUrl = URL.createObjectURL(resultBlob.blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resultBlob.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }, [resultBlob]);

  return (
    <div className="w-full max-w-4xl">
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
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="font-mono text-sm text-white">Arraste PDFs aqui</span>
        <span className="font-mono text-xs text-[#52525B]">ou clique para selecionar</span>
      </div>

      {/* File grid */}
      {pdfs.length > 0 && (
        <>
          <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
            {"// Ordene os arquivos arrastando os cards ou usando as setas [←] [→]:"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {pdfs.map((pdf, index) => (
              <div
                key={pdf.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== index) reorder(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`flex cursor-grab flex-col gap-2 border border-[#27272A] bg-[#09090B] p-4 active:cursor-grabbing ${
                  dragIndex === index ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[#52525B]">
                    #{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[11px] text-[#52525B]">[::]</span>
                </div>
                <span className="truncate font-mono text-xs text-white" title={pdf.file.name}>
                  {pdf.file.name}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[11px] text-[#A1A1AA]">{pdf.pages} página(s)</span>
                  <span className="font-mono text-[11px] text-[#52525B]">{formatFileSize(pdf.file.size)}</span>
                </div>
                <div className="mt-auto flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                    >
                      [←]
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === pdfs.length - 1}
                      className="border border-[#27272A] px-2 py-0.5 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-30 disabled:hover:border-[#27272A] disabled:hover:text-[#A1A1AA]"
                    >
                      [→]
                    </button>
                  </div>
                  <button
                    onClick={() => removePdf(pdf.id)}
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

      {/* Action */}
      <button
        onClick={handleMerge}
        disabled={pdfs.length === 0 || isMerging}
        className="mt-4 w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
      >
        {isMerging ? 'Processando...' : '[Juntar PDFs]'}
      </button>

      {/* Success panel */}
      {resultBlob && (
        <div className="mt-4 border border-green-800 bg-[#09090B] p-4">
          <p className="mb-3 font-mono text-sm text-green-400">PDF mesclado com sucesso.</p>
          <button
            onClick={handleDownload}
            className="w-full border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
          >
            [Baixar PDF Mesclado ({formatFileSize(resultBlob.size)})]
          </button>
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        Seus PDFs são processados 100% no seu navegador e nunca são enviados a servidores.
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
