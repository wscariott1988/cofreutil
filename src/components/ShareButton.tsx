import { useCallback, useEffect, useRef, useState } from 'react';

interface ShareButtonProps {
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export default function ShareButton({
  label = 'Compartilhar',
  copiedLabel = 'Link Copiado!',
  className = '',
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [supportsShare, setSupportsShare] = useState(true);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      setSupportsShare(false);
    }
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const resetFeedback = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2500);
  }, []);

  const copyToClipboard = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      resetFeedback();
    },
    [resetFeedback],
  );

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = document.title;

    if (supportsShare && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setCopied(true);
        resetFeedback();
        return;
      }
    }

    await copyToClipboard(url);
  }, [supportsShare, copyToClipboard, resetFeedback]);

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className={`inline-flex items-center gap-2 border px-4 py-2 font-mono text-sm font-bold transition-colors ${
        copied
          ? 'border-white bg-white text-black'
          : 'border-[#27272A] bg-[#09090B] text-white hover:border-[#3F3F46] hover:bg-[#18181B]'
      } ${className}`}
    >
      {copied ? (
        <>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 6H4.5A1.5 1.5 0 003 7.5v5A1.5 1.5 0 004.5 14h7A1.5 1.5 0 0013 12.5v-5A1.5 1.5 0 0011.5 6H10M8 9V2M8 2L5.5 4.5M8 2l2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
