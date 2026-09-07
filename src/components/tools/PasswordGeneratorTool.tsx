import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PASSWORD_OPTIONS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  generatePassword,
  getActivePools,
  estimateStrength,
  type PasswordOptions,
} from '../../lib/passwordUtils';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import ReferenceSources from '../ReferenceSources';

const buttonClass =
  'border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:cursor-not-allowed disabled:opacity-50';

const SCORE_BAR_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-green-400',
  'bg-green-400',
];

const SCORE_TEXT_COLORS = [
  'text-red-400',
  'text-orange-400',
  'text-yellow-300',
  'text-green-400',
  'text-green-400',
];

interface OptionRowProps {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function OptionRow({ label, detail, checked, onChange }: OptionRowProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border border-[#27272A] bg-black px-4 py-3 transition-colors hover:border-[#3F3F46]">
      <span className="flex flex-col gap-0.5">
        <span className="font-mono text-sm text-white">{label}</span>
        <span className="text-xs text-[#52525B]">{detail}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors peer-checked:border-white ${
          checked ? 'bg-white' : 'border-[#3F3F46] bg-transparent'
        }`}
      >
        {checked && <span className="block h-2 w-2 bg-black" />}
      </span>
    </label>
  );
}

export default function PasswordGeneratorTool() {
  const [length, setLength] = useState(DEFAULT_PASSWORD_OPTIONS.length);
  const [lowercase, setLowercase] = useState(DEFAULT_PASSWORD_OPTIONS.lowercase);
  const [uppercase, setUppercase] = useState(DEFAULT_PASSWORD_OPTIONS.uppercase);
  const [digits, setDigits] = useState(DEFAULT_PASSWORD_OPTIONS.digits);
  const [symbols, setSymbols] = useState(DEFAULT_PASSWORD_OPTIONS.symbols);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(
    DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous,
  );
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [usagesLeft, setUsagesLeft] = useState(() => BatchLimiter.getRemaining());
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const lastGeneratedRef = useRef<string | null>(null);
  const pixPayload = generatePixCopyPaste();

  const options: PasswordOptions = useMemo(
    () => ({ length, lowercase, uppercase, digits, symbols, excludeAmbiguous }),
    [length, lowercase, uppercase, digits, symbols, excludeAmbiguous],
  );

  const generate = useCallback(() => {
    const next = generatePassword(options);
    setPassword(next);
    return next;
  }, [options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleRegenerate = useCallback(() => {
    const next = generate();
    if (lastGeneratedRef.current !== next) {
      lastGeneratedRef.current = next;
      try {
        const count = BatchLimiter.incrementUsage(1);
        setUsagesLeft(BatchLimiter.getRemaining());
        if (count >= 3) setShowSupport(true);
      } catch {
        // Sem bloqueio quando o armazenamento local está indisponível.
      }
    }
  }, [generate]);

  const pools = useMemo(() => getActivePools(options), [options]);
  const strength = useMemo(() => estimateStrength(length, options), [length, options]);

  const handleCopy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = password;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
      } catch {
        setCopied(false);
        return;
      }
    }
    setTimeout(() => setCopied(false), 2000);
  }, [password]);

  const entropyFraction = strength.entropyBits > 0 ? Math.min(1, strength.entropyBits / 128) : 0;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {/* Badge de privacidade local */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="border border-[#27272A] bg-[#09090B] px-2 py-1 font-mono text-xs text-[#A1A1AA]">
          [100% Local]
        </span>
        <span className="border border-[#27272A] bg-[#09090B] px-2 py-1 font-mono text-xs text-[#A1A1AA]">
          [Zero Upload]
        </span>
        <span className="border border-[#27272A] bg-[#09090B] px-2 py-1 font-mono text-xs text-[#A1A1AA]">
          [Web Crypto API]
        </span>
      </div>

      {/* Visor da senha gerada */}
      <div className="flex flex-col gap-3 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex items-center justify-between">
          <label className="font-mono text-xs text-[#A1A1AA]">SENHA GERADA</label>
          <span className="font-mono text-xs text-[#52525B]">{password.length} chars</span>
        </div>

        <div className="flex min-h-[64px] items-center border border-[#27272A] bg-black px-4 py-3">
          <span className="break-all font-mono text-xl leading-relaxed tracking-wide text-white md:text-2xl">
            {password || 'Selecione ao menos uma categoria de caracteres'}
          </span>
        </div>

        <div className="flex gap-2">
          <button onClick={handleCopy} disabled={!password} className={`flex-1 ${buttonClass}`}>
            {copied ? '[Copiado!]' : '[Copiar Senha]'}
          </button>
          <button onClick={handleRegenerate} className={`flex-1 ${buttonClass}`}>
            [Gerar Nova]
          </button>
        </div>
      </div>

      {/* Customização */}
      <div className="flex flex-col gap-5 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password-length" className="font-mono text-xs text-[#A1A1AA]">
              Tamanho ({PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH})
            </label>
            <span className="font-mono text-sm text-white">{length}</span>
          </div>
          <input
            id="password-length"
            type="range"
            min={PASSWORD_MIN_LENGTH}
            max={PASSWORD_MAX_LENGTH}
            step={1}
            value={length}
            onChange={(event) => setLength(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none bg-[#27272A] accent-white"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs text-[#A1A1AA]">Composição</span>
          <div className="flex flex-col gap-2">
            <OptionRow
              label="Letras Maiúsculas (A-Z)"
              detail="Adiciona letras maiúsculas ao conjunto"
              checked={uppercase}
              onChange={setUppercase}
            />
            <OptionRow
              label="Letras Minúsculas (a-z)"
              detail="Adiciona letras minúsculas ao conjunto"
              checked={lowercase}
              onChange={setLowercase}
            />
            <OptionRow
              label="Números (0-9)"
              detail="Adiciona dígitos numéricos ao conjunto"
              checked={digits}
              onChange={setDigits}
            />
            <OptionRow
              label="Símbolos (!@#$...)"
              detail="Adiciona símbolos especiais ao conjunto"
              checked={symbols}
              onChange={setSymbols}
            />
            <OptionRow
              label="Evitar caracteres ambíguos"
              detail="Remove 0/O, 1/l/I e aspas que causam confusão"
              checked={excludeAmbiguous}
              onChange={setExcludeAmbiguous}
            />
          </div>
        </div>

        {pools.length > 0 && (
          <p className="font-mono text-xs text-[#52525B]">
            Pool de caracteres: {strength.poolSize} ({pools.map((pool) => pool.label).join(', ')})
          </p>
        )}
      </div>

      {/* Indicador de força */}
      <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-[#A1A1AA]">FORÇA DA SENHA</span>
          <span className={`font-mono text-sm ${SCORE_TEXT_COLORS[strength.score]}`}>
            [{strength.label.toUpperCase()}]
          </span>
        </div>

        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((segment) => (
            <div
              key={segment}
              className={`h-2 flex-1 transition-colors ${
                entropyFraction >= (segment + 1) / 4
                  ? SCORE_BAR_COLORS[strength.score]
                  : 'bg-[#27272A]'
              }`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-1 font-mono text-xs leading-relaxed">
          <p className="text-[#A1A1AA]">
            Entropia: <span className="text-white">{strength.entropyBits.toFixed(0)} bits</span>
          </p>
          <p className="text-[#A1A1AA]">
            Tempo estimado de quebra (brute force offline, ~10 bi tentativas/s):{' '}
            <span className="text-white">{strength.timeLabel}</span>
          </p>
        </div>

        <p className="text-xs leading-relaxed text-[#52525B]">
          A força considera apenas ataque de força bruta sobre o espaço total de caracteres. Senhas
          reutilizadas, baseadas em palavras do dicionário ou em dados pessoais são sempre inseguras,
          independentemente da entropia.
        </p>
      </div>

      <p className="font-mono text-[11px] text-[#52525B]">
        {usagesLeft > 0
          ? `${usagesLeft} ${usagesLeft === 1 ? 'geração' : 'gerações'} sem lembrete de apoio`
          : 'Obrigado pelo seu apoio!'}
      </p>

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 rounded-none border border-[#27272A] bg-[#09090B] p-8">
            <h3 className="text-center font-mono text-lg font-bold tracking-tight text-white">
              Mantenha o CofreUtil no Ar
            </h3>
            <p className="text-center text-sm leading-relaxed text-[#A1A1AA]">
              Ferramenta 100% gratuita e privada (zero servidores). Se te economizou tempo,
              considere apoiar o projeto com qualquer valor via Pix.
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
              className="rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
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

      <ReferenceSources
        sources={[
          {
            label: 'W3C — Web Crypto API (Specification)',
            href: 'https://www.w3.org/TR/WebCryptoAPI/',
          },
          {
            label: 'OWASP ASVS — Application Security Verification Standard',
            href: 'https://owasp.org/www-project-application-security-verification-standard/',
          },
        ]}
      />
    </div>
  );
}
