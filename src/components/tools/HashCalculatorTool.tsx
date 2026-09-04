import { useCallback, useRef, useState } from 'react';
import { formatFileSize } from '../../lib/pdfUtils';
import {
  HASH_ALGORITHMS,
  hashFile,
  type HashAlgorithm,
} from '../../lib/hashUtils';

interface HashItem {
  file: File;
  id: string;
  status: 'waiting' | 'hashing' | 'done' | 'error';
  hashes: Partial<Record<HashAlgorithm, string>>;
  error: string | null;
}

export default function HashCalculatorTool() {
  const [items, setItems] = useState<HashItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patchItem = useCallback((id: string, patch: Partial<HashItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      if (busy) return;
      const files = Array.from(list);
      if (files.length === 0) return;

      const created: HashItem[] = files.map((file) => ({
        file,
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        status: 'waiting' as const,
        hashes: {},
        error: null,
      }));

      setItems((prev) => [...prev, ...created]);
      setBusy(true);

      for (const item of created) {
        patchItem(item.id, { status: 'hashing', error: null });
        try {
          const hashes = await hashFile(item.file, HASH_ALGORITHMS.map((a) => a.id), (done, total) => {
            const percent = total === 0 ? 100 : Math.round((done / total) * 100);
            setProgress(`Lendo ${item.file.name}… ${percent}%`);
          });
          patchItem(item.id, { status: 'done', hashes });
        } catch (err: any) {
          patchItem(item.id, {
            status: 'error',
            error: err?.message ?? `Falha ao calcular hashes de "${item.file.name}".`,
          });
        }
      }

      setProgress(null);
      setBusy(false);
    },
    [busy, patchItem],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const copyText = useCallback(async (text: string, key: string) => {
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
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

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
          busy
            ? 'cursor-wait border-[#27272A] bg-[#09090B] opacity-60'
            : dragOver
              ? 'border-[#3F3F46] bg-[#18181B]'
              : 'border-[#27272A] bg-[#09090B]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="font-mono text-sm text-white">
          {busy ? 'Calculando hashes…' : 'Arraste arquivos aqui'}
        </span>
        <span className="font-mono text-xs text-[#52525B]">
          Qualquer arquivo — ou clique para selecionar (leitura em chunks)
        </span>
      </div>

      {/* Progress */}
      {busy && progress && (
        <p className="mt-4 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-[#A1A1AA]">
          {progress}
        </p>
      )}

      {/* Batch status */}
      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-xs text-[#A1A1AA]">
          {'// arquivos:'} <span className="text-white">{items.length}</span>
        </p>
        {items.length > 0 && (
          <button
            onClick={clearAll}
            disabled={busy}
            className="font-mono text-xs text-[#52525B] transition-colors hover:text-white disabled:opacity-40"
          >
            Limpar tudo [X]
          </button>
        )}
      </div>

      {/* Results */}
      {items.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col border border-[#27272A] bg-[#09090B] ${
                item.status === 'done' ? 'border-[#27272A]' : ''
              }`}
            >
              {/* File header */}
              <div className="flex items-center justify-between gap-3 border-b border-[#27272A] px-4 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-xs text-white" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="font-mono text-[10px] text-[#52525B]">
                    {formatFileSize(item.file.size)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.status === 'done' && (
                    <span className="font-mono text-[10px] text-green-400">[CONCLUÍDO]</span>
                  )}
                  {item.status === 'hashing' && (
                    <span className="font-mono text-[10px] text-[#A1A1AA]">[CALCULANDO…]</span>
                  )}
                  {item.status === 'error' && (
                    <span className="font-mono text-[10px] text-red-400">[ERRO]</span>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={busy}
                    className="font-mono text-xs text-[#52525B] transition-colors hover:text-white disabled:opacity-40"
                  >
                    [X]
                  </button>
                </div>
              </div>

              {item.status === 'error' && item.error && (
                <div className="border-b border-red-900 px-4 py-2 font-mono text-xs text-red-400">
                  {item.error}
                </div>
              )}

              {/* Hash rows */}
              <div className="flex flex-col">
                {HASH_ALGORITHMS.map((algo, index) => {
                  const value = item.hashes[algo.id];
                  return (
                    <div
                      key={algo.id}
                      className={`flex items-start gap-3 px-4 py-2.5 ${
                        index > 0 ? 'border-t border-[#27272A]' : ''
                      }`}
                    >
                      <span className="w-20 shrink-0 pt-0.5 font-mono text-[11px] text-[#A1A1AA]">
                        [{algo.label}]
                      </span>
                      <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-white">
                        {value ?? (item.status === 'hashing' ? '—' : 'aguardando…')}
                      </code>
                      {value && (
                        <button
                          onClick={() => void copyText(value, `${item.id}-${algo.id}`)}
                          className="shrink-0 border border-[#27272A] px-2 py-0.5 font-mono text-[10px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                        >
                          {copied === `${item.id}-${algo.id}` ? '[Copiado!]' : '[Copiar]'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 font-mono text-xs text-[#A1A1AA]">
        SHA-1, SHA-256 e SHA-512 usam <span className="text-white">crypto.subtle.digest</span>{' '}
        nativo do navegador. MD5 roda em JS puro e é útil para conferir downloads legados —
        não use MD5/SHA-1 como garantia criptográfica. Os arquivos nunca saem da sua máquina.
      </p>
    </div>
  );
}
