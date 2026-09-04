import { useCallback, useMemo, useState } from 'react';
import {
  CSV_DELIMITERS,
  csvToJson,
  detectDelimiter,
  jsonToCsv,
  type CsvDelimiter,
} from '../../lib/csvJsonUtils';

type Direction = 'csv-json' | 'json-csv';
type DelimiterMode = 'auto' | CsvDelimiter;

const buttonClass =
  'border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:cursor-not-allowed disabled:opacity-50';

const inputClass =
  'w-full resize-y border border-[#27272A] bg-black px-4 py-3 font-mono text-sm leading-relaxed text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]';

const PANE_HEIGHT = 'h-[420px]';

const DIRECTION_LABEL: Record<Direction, string> = {
  'csv-json': 'CSV para JSON',
  'json-csv': 'JSON para CSV',
};

export default function CsvJsonTool() {
  const [direction, setDirection] = useState<Direction>('csv-json');
  const [delimiterMode, setDelimiterMode] = useState<DelimiterMode>('auto');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const delimiterLabel = useMemo(() => {
    if (delimiterMode === 'auto') return 'auto';
    if (delimiterMode === ',') return 'vírgula';
    if (delimiterMode === ';') return 'ponto e vírgula';
    return 'tab';
  }, [delimiterMode]);

  const handleConvert = useCallback(() => {
    setError(null);
    if (!input.trim()) {
      setError('Cole os dados de entrada antes de converter.');
      return;
    }
    try {
      if (direction === 'csv-json') {
        const delimiter =
          delimiterMode === 'auto' ? detectDelimiter(input) : delimiterMode;
        const parsed = csvToJson(input, delimiter);
        const json = JSON.stringify(parsed, null, 2);
        setOutput(json);
        setMessage(
          `OK · ${parsed.length} ${parsed.length === 1 ? 'registro' : 'registros'} convertidos (delimitador: ${delimiter === '\t' ? 'tab' : delimiter === ',' ? 'vírgula' : 'ponto e vírgula'})`,
        );
      } else {
        const parsedJson: unknown = JSON.parse(input);
        const csv = jsonToCsv(parsedJson, delimiterMode === 'auto' ? ',' : delimiterMode);
        setOutput(csv);
        const rowCount = csv.split('\n').length - 1;
        setMessage(`OK · ${rowCount} ${rowCount === 1 ? 'linha' : 'linhas'} geradas`);
      }
    } catch (err: any) {
      setOutput('');
      setMessage(null);
      setError(err?.message ?? 'Não foi possível converter os dados.');
    }
  }, [direction, delimiterMode, input]);

  const handleClear = useCallback(() => {
    setInput('');
    setOutput('');
    setMessage(null);
    setError(null);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = output;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleDownload = useCallback(() => {
    if (!output) return;
    const isJson = direction === 'csv-json';
    const blob = new Blob([output], { type: isJson ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isJson ? 'dados.json' : 'dados.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [output, direction]);

  const inputPlaceholder =
    direction === 'csv-json'
      ? 'Cole seu CSV aqui… Ex.:\n"nome";idade;cidade\nMaria;29;São Paulo\nJoão;34;Curitiba'
      : 'Cole seu JSON aqui… Ex.:\n[{"nome":"Maria","idade":29},{"nome":"João","idade":34}]';

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Controles superiores */}
      <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center border border-[#27272A]">
          {(['csv-json', 'json-csv'] as Direction[]).map((dir, index) => (
            <button
              key={dir}
              onClick={() => {
                setDirection(dir);
                setOutput('');
                setMessage(null);
                setError(null);
              }}
              className={`px-4 py-2.5 font-mono text-xs transition-colors ${
                index > 0 ? 'border-l border-[#27272A]' : ''
              } ${
                direction === dir
                  ? 'bg-[#18181B] text-white'
                  : 'bg-black text-[#A1A1AA] hover:text-white'
              }`}
            >
              {DIRECTION_LABEL[dir]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-widest text-[#52525B]">
            // DELIMITADOR
          </span>
          <div className="flex items-center border border-[#27272A]">
            {(['auto', ',', ';', '\t'] as DelimiterMode[]).map((mode, index) => (
              <button
                key={mode}
                onClick={() => setDelimiterMode(mode)}
                title={
                  mode === 'auto'
                    ? 'Detectar automaticamente'
                    : mode === ','
                      ? 'Vírgula'
                      : mode === ';'
                        ? 'Ponto e vírgula'
                        : 'Tabulação'
                }
                className={`px-3 py-2 font-mono text-xs transition-colors ${
                  index > 0 ? 'border-l border-[#27272A]' : ''
                } ${
                  delimiterMode === mode
                    ? 'bg-[#18181B] text-white'
                    : 'bg-black text-[#A1A1AA] hover:text-white'
                }`}
              >
                {mode === 'auto' ? 'Auto' : mode === '\t' ? 'Tab' : mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleConvert} className={buttonClass}>
          [Converter]
        </button>
        <button onClick={handleDownload} disabled={!output} className={buttonClass}>
          [Baixar Arquivo]
        </button>
        <button onClick={handleCopy} disabled={!output} className={buttonClass}>
          {copied ? '[Copiado!]' : '[Copiar]'}
        </button>
        <button onClick={handleClear} className={buttonClass}>
          [Limpar]
        </button>
        <span className="ml-auto font-mono text-xs text-[#52525B]">
          {direction === 'csv-json' ? 'CSV → JSON' : 'JSON → CSV'} · {delimiterLabel.toUpperCase()}
        </span>
      </div>

      {/* Status */}
      {(message || error) && (
        <div
          className={`flex items-center gap-3 border px-4 py-3 ${
            error ? 'border-red-900' : 'border-green-900'
          }`}
        >
          <span
            className={`font-mono text-sm ${error ? 'text-red-400' : 'text-green-400'}`}
          >
            {error ? '[ERRO]' : '[OK]'}
          </span>
          <span className={`font-mono text-xs ${error ? 'text-red-300' : 'text-[#A1A1AA]'}`}>
            {error ?? message}
          </span>
        </div>
      )}

      {/* Entrada / Saída */}
      <div className="grid w-full gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs text-[#A1A1AA]">
              ENTRADA · {direction === 'csv-json' ? 'CSV' : 'JSON'}
            </label>
            <span className="font-mono text-xs text-[#52525B]">
              {input.length === 0 ? '' : `${input.split('\n').length} linhas`}
            </span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            placeholder={inputPlaceholder}
            className={`${inputClass} ${PANE_HEIGHT} font-mono text-xs`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[#A1A1AA]">
              SAÍDA · {direction === 'csv-json' ? 'JSON' : 'CSV'}
            </span>
            {output !== '' && (
              <span className="font-mono text-xs text-[#52525B]">
                {output.split('\n').length} linhas
              </span>
            )}
          </div>
          <textarea
            value={output}
            readOnly
            spellCheck={false}
            placeholder="O resultado da conversão aparecerá aqui."
            className={`${inputClass} ${PANE_HEIGHT} font-mono text-xs text-green-300/90`}
          />
        </div>
      </div>

      <p className="font-mono text-xs text-[#A1A1AA]">
        Processamento 100% local: seus dados nunca saem do navegador. No sentido
        CSV → JSON, a primeira linha é usada como cabeçalho das colunas. Valores
        com quebras de linha ou delimitadores são tratados com aspas (RFC 4180).
      </p>
    </div>
  );
}
