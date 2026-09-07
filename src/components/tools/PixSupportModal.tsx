import { useState } from 'react';
import { generatePixCopyPaste, PIX_KEY } from '../../lib/pix';

const AMOUNTS = [
  { label: 'R$ 2', value: '2' },
  { label: 'R$ 5', value: '5' },
];

interface PixSupportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PixSupportModal({ open, onClose }: PixSupportModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  const copy = async (amount?: string) => {
    const payload = generatePixCopyPaste(amount);
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(amount ?? 'free');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Me pague um café"
    >
      <div className="mx-4 flex w-full max-w-md flex-col gap-5 rounded-none border border-[#27272A] bg-[#09090B] p-8">
        <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
          ☕ ME PAGUE UM CAFÉ?
        </h3>
        <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
          O CofreUtil é gratuito, sem anúncios, seguro e mantido de forma
          independente pelo Willian Scariott. Se esta ferramenta te ajudou e
          economizou seu tempo, considere apoiar o projeto pagando um cafézinho
          de R$ 2 ou R$ 5 reais via Pix para ajudar a manter o portal ativo!
        </p>
        <div className="border border-[#27272A] bg-black px-4 py-3 text-center">
          <span className="font-mono text-sm text-white">Chave Pix: {PIX_KEY}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {AMOUNTS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => void copy(value)}
              className="rounded-none border border-[#FFD54A]/40 bg-[#1A1700] px-4 py-3 font-mono text-sm font-bold text-[#FFD54A] transition-colors hover:border-[#FFD54A] hover:bg-[#2A2400]"
            >
              {copied === value ? `[☕ ${label} copiado!]` : `[Pagar ${label} via Pix]`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
        >
          {copied === 'free' ? '[Copiado com Sucesso!]' : '[Copiar Pix (valor livre)]'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="self-center rounded-none border border-white bg-white px-6 py-3 font-mono text-xs font-bold tracking-tight text-black transition-colors hover:bg-black hover:text-white"
        >
          Continuar usando gratuitamente
        </button>
      </div>
    </div>
  );
}