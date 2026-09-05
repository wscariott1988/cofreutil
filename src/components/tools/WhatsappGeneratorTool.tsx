import { useEffect, useRef, useState } from 'react';
import { generateQrCodeSvg, generateQrCodePng } from '../../lib/qr';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';

interface WaHistoryItem {
  id: string;
  phone: string;
  message: string;
  link: string;
  createdAt: number;
}

const HISTORY_KEY = 'cofreutil_wa_link_history';
const HISTORY_MAX = 5;
const MESSAGE_MAX = 4096;
const placeholderMessage = 'Digite sua mensagem personalizada e veja o balão atualizar em tempo real…';

const inputClass =
  'w-full rounded-none border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]';

const ddiClass =
  'flex shrink-0 items-center rounded-none border border-[#27272A] border-r-0 bg-[#09090B] px-3 py-3 font-mono text-sm text-white select-none';

const buttonClass =
  'rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]';

const badgeClass =
  'rounded-none border border-[#27272A] bg-[#09090B] px-2 py-1 font-mono text-xs text-[#A1A1AA]';

function normalizeBraDial(phone: string): string {
  let digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function maskBraPhone(phone: string): string {
  const d = normalizeBraDial(phone);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function buildWaLink(digits: string, message: string): string {
  const clean = normalizeBraDial(digits);
  const text = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/55${clean}${text}`;
}

function buildHtmlSnippet(link: string): string {
  return `<!-- Botão WhatsApp gerado no CofreUtil (100% local) -->
<a
  href="${link}"
  target="_blank"
  rel="noopener"
  aria-label="Falar no WhatsApp"
  style="box-sizing:border-box;display:inline-block;background:#000000;color:#ffffff;border:1px solid #3F3F46;border-radius:0;padding:14px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;line-height:1;text-decoration:none;transition:background-color .15s ease;"
  onmouseover="this.style.backgroundColor='#18181B'"
  onmouseout="this.style.backgroundColor='#000000'"
>[ FALAR NO WHATSAPP ] →</a>`;
}

function loadHistory(): WaHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: WaHistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // Armazenamento local indisponível — o histórico não persiste, mas a ferramenta segue.
  }
}

export default function WhatsappGeneratorTool() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<WaHistoryItem[]>([]);
  const [usagesLeft, setUsagesLeft] = useState<number | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const lastGeneratedRef = useRef<{ phone: string; message: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHistory(loadHistory());
    try {
      setUsagesLeft(BatchLimiter.getRemaining());
    } catch {
      setUsagesLeft(null);
    }
  }, []);

  const digits = normalizeBraDial(phone);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D+/g, '').slice(0, 11));
    setFormError(null);
    clearResult();
  };

  const clearResult = () => {
    setLink('');
    setQrSvg('');
    setQrError(null);
  };

  const handleGenerate = async () => {
    if (digits.length !== 11) {
      setFormError('Informe um celular brasileiro completo com DDD (11 dígitos).');
      return;
    }
    if (digits[2] !== '9') {
      setFormError('O número parece não ser um celular — o 4º dígito deve iniciar com 9.');
      return;
    }

    setFormError(null);
    setIsGenerating(true);

    const nextLink = buildWaLink(digits, message);
    setLink(nextLink);
    setQrError(null);
    setQrSvg('');

    try {
      const svg = await generateQrCodeSvg(nextLink, { size: 360, margin: 2 });
      setQrSvg(svg);
    } catch {
      setQrError('Não foi possível renderizar o QR Code neste navegador.');
    } finally {
      setIsGenerating(false);
    }

    const candidate = { phone: digits, message: message.trim() };
    const isNew =
      lastGeneratedRef.current === null ||
      lastGeneratedRef.current.phone !== candidate.phone ||
      lastGeneratedRef.current.message !== candidate.message;
    lastGeneratedRef.current = candidate;

    if (isNew) {
      try {
        const count = BatchLimiter.incrementUsage(1);
        setUsagesLeft(BatchLimiter.getRemaining());
        if (count >= 3) setShowSupport(true);
      } catch {
        // Sem bloqueio quando o armazenamento local está indisponível.
      }

      const item: WaHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        phone: maskBraPhone(digits),
        message: message.trim(),
        link: nextLink,
        createdAt: Date.now(),
      };
      setHistory((prev) => {
        const deduped = prev.filter(
          (h) => !(h.phone === item.phone && h.message === item.message),
        );
        const next = [item, ...deduped].slice(0, HISTORY_MAX);
        saveHistory(next);
        return next;
      });
    }
  };

  const handleCopyLink = async () => {
    await copyText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDownloadQr = async () => {
    if (!link) return;
    try {
      const dataUrl = await generateQrCodePng(link, { size: 1024, margin: 4 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'whatsapp-qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setQrError('Não foi possível gerar o arquivo PNG neste navegador.');
    }
  };

  const handleCopyHtml = async () => {
    await copyText(buildHtmlSnippet(link));
    setHtmlCopied(true);
    setTimeout(() => setHtmlCopied(false), 2000);
  };

  const handleCopyHistory = async (item: WaHistoryItem) => {
    await copyText(item.link);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  const handleCopySupportPix = async () => {
    await copyText(generatePixCopyPaste());
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* BADGE DE PRIVACIDADE (LGPD / ZERO COOKIES) */}
      <div className="flex flex-col gap-2 border border-[#27272A] bg-black px-4 py-3">
        <span className="font-mono text-[11px] font-medium tracking-wider text-green-400">
          [🔒 ZERO COOKIES &amp; 100% LOCAL]
        </span>
        <p className="text-xs leading-relaxed text-[#A1A1AA]">
          Seus números e mensagens nunca saem do seu navegador. Não guardamos nenhum
          registro de contato.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* FORMULÁRIO */}
        <div className="flex flex-col gap-5 border border-[#27272A] bg-[#09090B] p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-xs text-[#A1A1AA]">
                Número de Celular (WhatsApp)
              </label>
              <span className="font-mono text-xs text-[#52525B]">BR · DDD</span>
            </div>
            <div className="flex w-full">
              <span className={ddiClass}>+55</span>
              <input
                type="tel"
                inputMode="tel"
                value={maskBraPhone(phone)}
                onChange={handlePhoneChange}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className={`${inputClass} border-l-0 px-3`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-xs text-[#A1A1AA]">
                Mensagem Personalizada
              </label>
              <span className="font-mono text-xs text-[#52525B]">
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <textarea
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => {
                setMessage(e.target.value);
                setFormError(null);
                clearResult();
              }}
              rows={6}
              placeholder={placeholderMessage}
              className="w-full resize-y rounded-none border border-[#27272A] bg-black px-4 py-3 font-mono text-sm leading-relaxed text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]"
            />
            <span className="font-mono text-[11px] text-[#52525B]">
              O link inclui o texto codificado — quem abrir já chega com a mensagem pronta (limite 4096 caracteres).
            </span>
          </div>

          {formError && (
            <div className="rounded-none border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-red-400">
              [ERRO] {formError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            className={`${buttonClass} disabled:opacity-50`}
          >
            {isGenerating ? '[GERANDO…]' : '[ GERAR LINK & QR CODE ]'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass}>[Zero-Server]</span>
            <span className={badgeClass}>[QR dinâmico]</span>
            <span className={badgeClass}>[Histórico local]</span>
            <span className={badgeClass}>[LGPD]</span>
          </div>

          {usagesLeft !== null && (
            <p className="font-mono text-xs text-[#52525B]">
              {usagesLeft > 0
                ? `Este lote ainda tem ${usagesLeft} ${usagesLeft === 1 ? 'operação' : 'operações'} gratuitas`
                : 'Obrigado pelo seu apoio! O lote é ilimitado, sem cadastro.'}
            </p>
          )}
        </div>

        {/* SIMULADOR DE CHAT (LIVE PREVIEW) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
              // LIVE PREVIEW
            </span>
            <span className="animate-pulse font-mono text-[11px] text-green-400">[AO VIVO]</span>
          </div>

          <div className="mx-auto w-full max-w-[340px] rounded-none border border-[#27272A] bg-[#09090B]">
            {/* Barra do WhatsApp */}
            <div className="flex items-center justify-between border-b border-[#27272A] bg-black px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-none border border-[#27272A] bg-[#005C4B] font-mono text-[10px] text-white">
                  W
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-medium text-white">
                    WhatsApp
                  </span>
                  <span className="font-mono text-[10px] text-[#52525B]">online</span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-[#52525B]">
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Área do chat */}
            <div className="flex min-h-[300px] flex-col justify-end gap-2 bg-black p-4">
              <div className="mx-auto border border-[#27272A] bg-[#09090B] px-3 py-1 font-mono text-[10px] text-[#52525B]">
                {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </div>
              <div className="max-w-[85%] self-end rounded-none border border-[#134E4A] bg-[#005C4B] px-4 py-2.5">
                <p className="whitespace-pre-wrap break-words font-mono text-sm leading-snug text-white">
                  {message.trim() || placeholderMessage}
                </p>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span className="font-mono text-[9px] text-[#99E6CA]">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[9px] text-[#99E6CA]">✓✓</span>
                </div>
              </div>
            </div>

            {/* Input simulado */}
            <div className="flex items-center gap-2 border-t border-[#27272A] bg-[#09090B] px-3 py-3">
              <div className="w-full border border-[#27272A] bg-black px-3 py-2 font-mono text-[11px] text-[#52525B]">
                {message ? 'Conversa pronta para envio' : 'Digite aqui…'}
              </div>
            </div>
          </div>

          <p className="font-mono text-[11px] text-[#52525B]">
            Prévia local do balão — nada é enviado; apenas simula o resultado do seu link.
          </p>
        </div>
      </div>

      {/* LINK GERADO + QR CODE + EXPORTAÇÃO HTML */}
      {link && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Link gerado */}
          <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-6">
            <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
              // LINK GERADO
            </span>
            <p className="break-all border border-[#27272A] bg-black px-4 py-3 font-mono text-xs leading-relaxed text-white">
              {link}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleCopyLink()} className={buttonClass}>
                {linkCopied ? '[COPIADO!]' : '[Copiar Link]'}
              </button>
              <a
                href={link}
                target="_blank"
                rel="noopener"
                className={`${buttonClass} no-underline`}
              >
                [Abrir no WhatsApp]
              </a>
            </div>
            <p className="font-mono text-xs text-[#52525B]">
              Domínio curto wa.me — sem login, pronto para enviar no grupo ou imprimir.
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-6">
            <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
              // QR CODE
            </span>
            <div className="flex min-h-[250px] items-center justify-center rounded-none border border-[#27272A] bg-white p-4">
              {qrSvg ? (
                <div
                  className="flex h-[240px] w-[240px] items-center justify-center [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : qrError ? (
                <span className="max-w-[260px] text-center font-mono text-xs text-black">
                  {qrError}
                </span>
              ) : (
                <span className="max-w-[260px] text-center font-mono text-xs text-black">
                  Renderizando QR Code…
                </span>
              )}
            </div>
            <button type="button" onClick={() => void handleDownloadQr()} className={buttonClass}>
              [Baixar QR Code em PNG · 1024px]
            </button>
          </div>
        </div>
      )}

      {/* EXPORTAÇÃO HTML */}
      {link && (
        <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-6">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
              // EXPORTAR BOTÃO HTML (BASTA COPIAR E COLAR NO SEU SITE)
            </span>
            <button type="button" onClick={() => void handleCopyHtml()} className={buttonClass}>
              {htmlCopied ? '[COPIADO!]' : '[Copiar HTML]'}
            </button>
          </div>
          <textarea
            readOnly
            value={buildHtmlSnippet(link)}
            rows={10}
            className="w-full resize-none rounded-none border border-[#27272A] bg-black px-4 py-3 font-mono text-[10px] leading-relaxed text-[#A1A1AA] outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="font-mono text-[11px] text-[#52525B]">
            Snippet autossuficiente em estilo brutalista (preto + borda cinza, sem arredondamento).
            Sem dependência de CSS externo — funcional em qualquer site ou blog.
          </p>
        </div>
      )}

      {/* HISTÓRICO LOCAL */}
      <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-widest text-[#52525B]">
            // HISTÓRICO LOCAL (ÚLTIMOS {HISTORY_MAX} LINKS — APENAS NO SEU NAVEGADOR)
          </span>
          <span className="font-mono text-[11px] text-[#3F3F46]">[esc]</span>
        </div>

        {history.length === 0 ? (
          <div className="border border-[#27272A] bg-black px-4 py-8 text-center">
            <p className="font-mono text-xs text-[#52525B]">
              Nenhum link ainda. Gere um link para salvá-lo aqui com 1 clique de cópia.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#27272A] bg-black">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#27272A]">
                  <th className="px-4 py-2.5 font-mono text-[10px] font-normal tracking-widest text-[#52525B]">
                    DATA
                  </th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-normal tracking-widest text-[#52525B]">
                    NÚMERO
                  </th>
                  <th className="px-4 py-2.5 font-mono text-[10px] font-normal tracking-widest text-[#52525B]">
                    MENSAGEM
                  </th>
                  <th className="px-4 py-2.5 text-right font-mono text-[10px] font-normal tracking-widest text-[#52525B]">
                    AÇÃO
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-[#27272A] last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#52525B]">
                      {new Date(item.createdAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-white">
                      {item.phone}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 font-mono text-[11px] text-[#A1A1AA]">
                      <span className="block truncate" title={item.message}>
                        {item.message || '(sem mensagem)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleCopyHistory(item)}
                        className="rounded-none border border-[#27272A] bg-[#09090B] px-2.5 py-1 font-mono text-[11px] text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white"
                      >
                        {copiedId === item.id ? '[Copiado!]' : '[Copiar Link]'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-[#52525B]">
            {history.length} de {HISTORY_MAX} links salvos — armazenados somente no localStorage, removidos com limpeza de dados do navegador.
          </p>
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="rounded-none border border-[#27272A] bg-black px-2.5 py-1 font-mono text-[11px] text-[#52525B] transition-colors hover:border-red-900 hover:text-red-400"
            >
              [Limpar histórico]
            </button>
          )}
        </div>
      </div>

      {/* MODAL DE APOIO VOLUNTÁRIO (soft-block) */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 rounded-none border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Este lote terminou (3 operações grátis). A ferramenta segue funcionando
              normalmente — mas se ela te ajudou, considere apoiar o projeto com
              qualquer valor via Pix.
            </p>
            <div className="border border-[#27272A] bg-black px-4 py-3 text-center">
              <span className="font-mono text-sm text-white">
                Chave Pix: apoio@grupows.com
              </span>
            </div>
            <button type="button" onClick={() => void handleCopySupportPix()} className={buttonClass}>
              {pixCopied ? '[Copiado com Sucesso!]' : '[Copiar Pix Copia e Cola]'}
            </button>
            <button
              type="button"
              onClick={() => setShowSupport(false)}
              className="self-center text-xs text-[#A1A1AA] transition-colors hover:text-white"
            >
              Continuar usando grátis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}