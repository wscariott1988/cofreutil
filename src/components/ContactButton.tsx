import { useRef, useState } from 'react';

const CONTACT_EMAIL = 'contato@grupows.com';
const MAILTO_SUBJECT = encodeURIComponent('Contato Comercial — CofreUtil');
const MAILTO_URL = `mailto:${CONTACT_EMAIL}?subject=${MAILTO_SUBJECT}`;

export default function ContactButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = CONTACT_EMAIL;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  const openMail = () => {
    window.location.href = MAILTO_URL;
  };

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="border border-[#27272A] bg-[#09090B] px-4 py-2 font-mono text-xs text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
      >
        [Contato Comercial]
      </button>

      {open && (
        <div className="absolute bottom-full z-50 mb-2 flex w-72 flex-col gap-3 border border-[#27272A] bg-[#09090B] p-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#52525B]">
              [E-mail Corporativo]
            </span>
            <span className="break-all font-mono text-sm text-white">{CONTACT_EMAIL}</span>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="border border-[#27272A] bg-black px-4 py-2 font-mono text-xs text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              {copied ? '[Copiado!]' : '[Copiar E-mail]'}
            </button>
            <button
              type="button"
              onClick={openMail}
              className="border border-[#27272A] bg-black px-4 py-2 font-mono text-xs text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              [Abrir Cliente de E-mail]
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="self-end font-mono text-[10px] text-[#52525B] transition-colors hover:text-white"
          >
            fechar →
          </button>
        </div>
      )}
    </div>
  );
}