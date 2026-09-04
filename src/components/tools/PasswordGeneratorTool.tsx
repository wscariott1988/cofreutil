import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PASSWORD_OPTIONS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  generatePassword,
  getActivePools,
  estimateStrength,
  type PasswordOptions,
} from '../../lib/passwordUtils';

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

  const options: PasswordOptions = useMemo(
    () => ({ length, lowercase, uppercase, digits, symbols, excludeAmbiguous }),
    [length, lowercase, uppercase, digits, symbols, excludeAmbiguous],
  );

  const regenerate = useCallback(() => {
    setPassword(generatePassword(options));
  }, [options]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

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
          <button onClick={regenerate} className={`flex-1 ${buttonClass}`}>
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
    </div>
  );
}
