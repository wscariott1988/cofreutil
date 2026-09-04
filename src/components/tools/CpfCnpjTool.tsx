import { useState, useCallback, useRef } from 'react';
import { isValidCpf, isValidCnpj, generateCpf, generateCnpj } from '../../lib/cpfCnpj';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';

type Tab = 'validar' | 'gerar';

export default function CpfCnpjTool() {
  const [tab, setTab] = useState<Tab>('validar');
  const [input, setInput] = useState('');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; type: string } | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [remaining, setRemaining] = useState(() => BatchLimiter.getRemaining());
  const interactionCount = useRef(0);
  const pixPayload = generatePixCopyPaste();

  const triggerSupportIfNeeded = useCallback(() => {
    interactionCount.current += 1;
    if (interactionCount.current >= 2) {
      interactionCount.current = 0;
      setShowSupport(true);
    }
  }, []);

  const handleValidate = useCallback(() => {
    const digits = input.replace(/\D/g, '');
    if (digits.length === 11) {
      setValidationResult({ valid: isValidCpf(input), type: 'CPF' });
      triggerSupportIfNeeded();
    } else if (digits.length === 14) {
      setValidationResult({ valid: isValidCnpj(input), type: 'CNPJ' });
      triggerSupportIfNeeded();
    } else {
      setValidationResult(null);
    }
  }, [input, triggerSupportIfNeeded]);

  const handleGenerate = useCallback((type: 'cpf' | 'cnpj', formatted: boolean) => {
    const fn = type === 'cpf' ? generateCpf : generateCnpj;
    const results = Array.from({ length: 3 }, () => fn(formatted));
    setGenerated(results);

    const count = BatchLimiter.incrementUsage(1);
    setRemaining(BatchLimiter.getRemaining());
    triggerSupportIfNeeded();
    if (count >= 5) setShowSupport(true);
  }, [triggerSupportIfNeeded]);

  const handleCopy = useCallback(async (index: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  return (
    <div className="w-full max-w-2xl">
      {/* Tabs */}
      <div className="mb-6 flex border border-[#27272A]">
        <button
          onClick={() => setTab('validar')}
          className={`flex-1 px-4 py-3 text-sm font-mono transition-colors ${
            tab === 'validar'
              ? 'bg-[#09090B] text-white'
              : 'bg-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Validar
        </button>
        <button
          onClick={() => setTab('gerar')}
          className={`flex-1 border-l border-[#27272A] px-4 py-3 text-sm font-mono transition-colors ${
            tab === 'gerar'
              ? 'bg-[#09090B] text-white'
              : 'bg-transparent text-[#A1A1AA] hover:text-white'
          }`}
        >
          Gerar
        </button>
      </div>

      {/* Tab: Validar */}
      {tab === 'validar' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="flex-1 border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]"
            />
            <button
              onClick={handleValidate}
              className="border border-[#27272A] bg-[#09090B] px-6 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              Validar
            </button>
          </div>

          {validationResult && (
            <div className="border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm">
              {validationResult.valid ? (
                <span className="text-green-400">
                  [OK] {validationResult.type} válido
                </span>
              ) : (
                <span className="text-red-400">
                  [ERRO] {validationResult.type} inválido
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Gerar */}
      {tab === 'gerar' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerate('cpf', true)}
              className="flex-1 border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              Gerar CPF
            </button>
            <button
              onClick={() => handleGenerate('cnpj', true)}
              className="flex-1 border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              Gerar CNPJ
            </button>
          </div>

          {generated.length > 0 && (
            <div className="flex flex-col gap-1 border border-[#27272A] bg-[#09090B]">
              {generated.map((value, i) => (
                <div key={i} className="flex items-center justify-between border-b border-[#27272A] px-4 py-2.5 last:border-b-0">
                  <span className="font-mono text-sm text-white">{value}</span>
                  <button
                    onClick={() => handleCopy(i, value)}
                    className="ml-4 text-xs text-[#A1A1AA] transition-colors hover:text-white"
                  >
                    {copiedIndex === i ? '[Copiado!]' : 'Copiar'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="font-mono text-xs text-[#A1A1AA]">
            Aviso: Os CPFs e CNPJs gerados são válidos apenas matematicamente para fins
            de testes de software e desenvolvimento (QA). Por utilizarem o algoritmo
            oficial, podem coincidir estatisticamente com documentos reais. O uso
            indevido de dados de terceiros é de inteira responsabilidade do usuário.
          </p>

          <p className="font-mono text-xs text-[#52525B]">
            {remaining > 0
              ? `${remaining} ${remaining === 1 ? 'uso' : 'usos'} sem lembrete de apoio`
              : 'Obrigado pelo seu apoio!'}
          </p>
        </div>
      )}

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
