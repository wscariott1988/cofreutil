import { useState } from 'react';
import {
  type PixKeyType,
  validatePixKey,
  maskPixKey,
  sanitizeText,
  generatePixPayload,
} from '../../lib/pixUtils';
import { generateQrCodeSvg, generateQrCodePng } from '../../lib/qr';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';

interface KeyTypeOption {
  value: PixKeyType;
  label: string;
  placeholder: string;
}

const KEY_TYPES: KeyTypeOption[] = [
  { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { value: 'email', label: 'E-mail', placeholder: 'seu@email.com' },
  { value: 'phone', label: 'Telefone', placeholder: '(11) 99999-9999' },
  {
    value: 'random',
    label: 'Chave Aleatória',
    placeholder: '00000000-0000-4000-8000-000000000000',
  },
];

const inputClass =
  'w-full border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]';

const buttonClass =
  'border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]';

export default function PixQrCodeTool() {
  const [keyType, setKeyType] = useState<PixKeyType>('cpf');
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [amount, setAmount] = useState('');
  const [txId, setTxId] = useState('');
  const [payload, setPayload] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [usagesLeft, setUsagesLeft] = useState<number | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [payloadCopied, setPayloadCopied] = useState(false);

  const clearResult = () => {
    setPayload('');
    setQrSvg('');
    setQrError(null);
  };

  const handleGenerate = async () => {
    const activeKeyType = keyType;
    const rawKey =
      activeKeyType === 'cpf' || activeKeyType === 'cnpj' || activeKeyType === 'phone'
        ? key.replace(/\D/g, '')
        : key.trim();

    if (!validatePixKey(activeKeyType, rawKey)) {
      setFormError('Chave Pix inválida para o tipo selecionado.');
      return;
    }

    const cleanName = sanitizeText(name);
    const cleanCity = sanitizeText(city);

    if (!cleanName) {
      setFormError('Informe o nome do beneficiário.');
      return;
    }
    if (!cleanCity) {
      setFormError('Informe a cidade.');
      return;
    }

    const normalizedAmount = amount.trim().replace(',', '.');
    if (
      normalizedAmount &&
      (Number.isNaN(Number(normalizedAmount)) || Number(normalizedAmount) <= 0)
    ) {
      setFormError('Informe um valor válido em R$.');
      return;
    }

    setFormError(null);
    setQrError(null);
    setPayload('');
    setQrSvg('');
    setIsGenerating(true);

    const nextPayload = generatePixPayload({
      key: rawKey,
      keyType: activeKeyType,
      name,
      city,
      amount: normalizedAmount || undefined,
      txId: txId.trim() || undefined,
    });

    setPayload(nextPayload);

    try {
      const svg = await generateQrCodeSvg(nextPayload, { size: 320, margin: 2 });
      setQrSvg(svg);
    } catch {
      setQrError('Não foi possível renderizar o QR Code neste navegador.');
    } finally {
      setIsGenerating(false);
    }

    try {
      const count = BatchLimiter.incrementUsage(1);
      setUsagesLeft(BatchLimiter.getRemaining());
      if (count >= 5) setShowSupport(true);
    } catch {
      // Armazenamento local indisponível — segue sem bloqueio.
    }
  };

  const handleCopyPayload = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setPayloadCopied(true);
      setTimeout(() => setPayloadCopied(false), 2000);
    } catch {
      setPayloadCopied(false);
    }
  };

  const handleDownload = async () => {
    if (!payload) return;
    try {
      const dataUrl = await generateQrCodePng(payload, { size: 512, margin: 4 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'pix-qrcode.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setQrError('Não foi possível gerar o arquivo PNG neste navegador.');
    }
  };

  const handleCopySupportPix = async () => {
    try {
      await navigator.clipboard.writeText(generatePixCopyPaste());
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    } catch {
      setPixCopied(false);
    }
  };

  const activeType =
    KEY_TYPES.find((t) => t.value === keyType) ?? KEY_TYPES[0];

  return (
    <div className="w-full max-w-2xl">
      {/* Formulário */}
      <div className="flex flex-col gap-5 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs text-[#A1A1AA]">Tipo de Chave</label>
          <select
            value={keyType}
            onChange={(e) => {
              setKeyType(e.target.value as PixKeyType);
              setKey('');
              setFormError(null);
              clearResult();
            }}
            className="w-full border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white outline-none focus:border-[#3F3F46]"
          >
            {KEY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs text-[#A1A1AA]">Chave Pix</label>
          <input
            type="text"
            value={key}
            onChange={(e) => {
              setKey(maskPixKey(keyType, e.target.value));
              setFormError(null);
              clearResult();
            }}
            placeholder={activeType.placeholder}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs text-[#A1A1AA]">Nome do Beneficiário</label>
            <span className="font-mono text-xs text-[#52525B]">{name.length}/25</span>
          </div>
          <input
            type="text"
            value={name}
            maxLength={25}
            onChange={(e) => {
              setName(e.target.value);
              setFormError(null);
              clearResult();
            }}
            placeholder="Sem acentos (ex: MARIA SILVA)"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs text-[#A1A1AA]">Cidade</label>
            <span className="font-mono text-xs text-[#52525B]">{city.length}/15</span>
          </div>
          <input
            type="text"
            value={city}
            maxLength={15}
            onChange={(e) => {
              setCity(e.target.value);
              setFormError(null);
              clearResult();
            }}
            placeholder="Sem acentos (ex: SAO PAULO)"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs text-[#A1A1AA]">Valor em R$ (Opcional)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFormError(null);
              clearResult();
            }}
            placeholder="0.00"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs text-[#A1A1AA]">Identificador / TxID (Opcional)</label>
          <input
            type="text"
            value={txId}
            onChange={(e) => {
              setTxId(e.target.value);
              setFormError(null);
              clearResult();
            }}
            placeholder="***"
            className={inputClass}
          />
        </div>

        {formError && (
          <div className="border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-red-400">
            [ERRO] {formError}
          </div>
        )}

        <button onClick={handleGenerate} disabled={isGenerating} className={buttonClass}>
          {isGenerating ? 'Gerando...' : 'Gerar QR Code Pix'}
        </button>

        {usagesLeft !== null && (
          <p className="font-mono text-xs text-[#52525B]">
            {usagesLeft > 0
              ? `${usagesLeft} ${usagesLeft === 1 ? 'uso' : 'usos'} sem lembrete de apoio`
              : 'Obrigado pelo seu apoio!'}
          </p>
        )}
      </div>

      {/* Painel de resultado */}
      {payload && (
        <div className="mt-6 flex flex-col gap-5 border border-[#27272A] bg-[#09090B] p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex min-h-[328px] w-full items-center justify-center border border-[#27272A] bg-white p-4">
              {qrSvg ? (
                <div
                  className="flex h-[320px] w-[320px] items-center justify-center [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : qrError ? (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <span className="font-mono text-xs text-black">{qrError}</span>
                  <span className="font-mono text-xs text-black">
                    Use o botão [Copiar Payload] para pagar via Pix Copia e Cola.
                  </span>
                </div>
              ) : (
                <div className="flex h-[320px] w-[320px] items-center justify-center font-mono text-xs text-black">
                  Gerando QR Code...
                </div>
              )}
            </div>
            <div className="flex w-full gap-2">
              <button onClick={handleDownload} className={buttonClass}>
                Baixar PNG
              </button>
              <button onClick={handleCopyPayload} className={buttonClass}>
                {payloadCopied ? '[Copiado!]' : 'Copiar Payload'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-mono text-xs text-[#A1A1AA]">Payload EMVCo / BR Code</label>
            <textarea
              readOnly
              value={payload}
              className="h-28 w-full resize-none border border-[#27272A] bg-black px-4 py-3 font-mono text-xs leading-relaxed text-[#A1A1AA] outline-none"
            />
          </div>
        </div>
      )}

      {/* Modal de Apoio Pix */}
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

            <button onClick={handleCopySupportPix} className={buttonClass}>
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
