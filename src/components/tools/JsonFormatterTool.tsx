import { useCallback, useMemo, useState } from 'react';
import {
  validateJson,
  formatJson,
  minifyJson,
  JsonSyntaxError,
  type JsonErrorReport,
} from '../../lib/jsonUtils';

type Indent = 2 | 4;

type ToolStatus =
  | { kind: 'idle' }
  | { kind: 'valid'; message: string }
  | { kind: 'error'; message: string; report: JsonErrorReport | null };

const buttonClass =
  'border border-[#27272A] bg-[#09090B] px-4 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:cursor-not-allowed disabled:opacity-50';

const inputClass =
  'w-full border border-[#27272A] bg-black px-4 py-3 font-mono text-sm text-white placeholder-[#52525B] outline-none focus:border-[#3F3F46]';

const PANE_HEIGHT = 'h-[520px]';

interface JsonToken {
  text: string;
  className: string | null;
}

type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'ws';

const TOKEN_CLASSES: Record<TokenKind, string | null> = {
  key: 'text-white',
  string: 'text-[#E4E4E7]',
  number: 'text-green-400',
  literal: 'text-[#A1A1AA]',
  punct: 'text-[#71717A]',
  ws: null,
};

function tokenizeJson(text: string): JsonToken[] {
  const pattern =
    /("(?:\\.|[^"\\])*")|(true|false|null)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\s+)|(.)/g;
  const raw: { kind: TokenKind; text: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) raw.push({ kind: 'string', text: match[1] });
    else if (match[2]) raw.push({ kind: 'literal', text: match[2] });
    else if (match[3]) raw.push({ kind: 'number', text: match[3] });
    else if (match[4]) raw.push({ kind: 'ws', text: match[4] });
    else raw.push({ kind: 'punct', text: match[0] });
  }

  const tokens: JsonToken[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    let kind: TokenKind = item.kind;

    if (item.kind === 'string') {
      let j = i + 1;
      while (j < raw.length && raw[j].kind === 'ws') j++;
      kind = raw[j] && raw[j].kind === 'punct' && raw[j].text === ':' ? 'key' : 'string';
    }

    tokens.push({ text: item.text, className: TOKEN_CLASSES[kind] });
  }
  return tokens;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export default function JsonFormatterTool() {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState<Indent>(2);
  const [output, setOutput] = useState('');
  const [outputFor, setOutputFor] = useState('');
  const [outputAction, setOutputAction] = useState('');
  const [status, setStatus] = useState<ToolStatus>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  const tokens = useMemo(() => tokenizeJson(output), [output]);

  const stale = output !== '' && outputFor !== input;

  const setValidStatus = (actionLabel: string, resultText: string, source: string) => {
    const bytes = new TextEncoder().encode(resultText).length;
    setOutput(resultText);
    setOutputFor(source);
    setOutputAction(actionLabel);
    setStatus({ kind: 'valid', message: `JSON válido · ${formatBytes(bytes)}` });
  };

  const setErrorStatus = (message: string, report: JsonErrorReport | null) => {
    setOutput('');
    setOutputFor('');
    setOutputAction('');
    setStatus({ kind: 'error', message, report });
  };

  const handleValidate = useCallback(() => {
    if (!input.trim()) {
      setErrorStatus('Cole um JSON para validar.', null);
      return;
    }
    const result = validateJson(input);
    if (result.ok) {
      setStatus({ kind: 'valid', message: 'Sintaxe JSON válida.' });
    } else {
      setErrorStatus(result.error.message, result.error);
    }
  }, [input]);

  const handleFormat = useCallback(() => {
    if (!input.trim()) {
      setErrorStatus('Cole um JSON para formatar.', null);
      return;
    }
    try {
      const formatted = formatJson(input, indent);
      setValidStatus(`formatado (${indent} espaços)`, formatted, input);
    } catch (error) {
      if (error instanceof JsonSyntaxError) {
        setErrorStatus(error.message, error.report);
      } else {
        setErrorStatus('Não foi possível formatar o JSON.', null);
      }
    }
  }, [input, indent]);

  const handleMinify = useCallback(() => {
    if (!input.trim()) {
      setErrorStatus('Cole um JSON para minificar.', null);
      return;
    }
    try {
      const minified = minifyJson(input);
      setValidStatus('minificado', minified, input);
    } catch (error) {
      if (error instanceof JsonSyntaxError) {
        setErrorStatus(error.message, error.report);
      } else {
        setErrorStatus('Não foi possível minificar o JSON.', null);
      }
    }
  }, [input]);

  const handleClear = useCallback(() => {
    setInput('');
    setOutput('');
    setOutputFor('');
    setOutputAction('');
    setStatus({ kind: 'idle' });
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = output;
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
  }, [output]);

  const statusLabel =
    status.kind === 'valid'
      ? '[VÁLIDO]'
      : status.kind === 'error'
        ? '[ERRO SINTÁTICO]'
        : '[AGUARDANDO]';

  const statusClass =
    status.kind === 'valid'
      ? 'border-green-900 bg-[#09090B]'
      : status.kind === 'error'
        ? 'border-red-900 bg-[#09090B]'
        : 'border-[#27272A] bg-[#09090B]';

  const outputLines = output === '' ? 0 : output.split('\n').length;
  const outputBytes = output === '' ? 0 : new TextEncoder().encode(output).length;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2 border border-[#27272A] bg-[#09090B] p-4">
        <button onClick={handleFormat} className={buttonClass}>
          [Formatar]
        </button>
        <button onClick={handleMinify} className={buttonClass}>
          [Minificar]
        </button>
        <button onClick={handleValidate} className={buttonClass}>
          [Validar]
        </button>
        <button onClick={handleClear} className={buttonClass}>
          [Limpar]
        </button>
        <button onClick={handleCopy} disabled={!output} className={buttonClass}>
          {copied ? '[Copiado!]' : '[Copiar]'}
        </button>

        <span className="ml-auto flex items-center border border-[#27272A]">
          <button
            onClick={() => setIndent(2)}
            className={`px-3 py-2 font-mono text-xs transition-colors ${
              indent === 2 ? 'bg-[#18181B] text-white' : 'bg-black text-[#A1A1AA] hover:text-white'
            }`}
          >
            2 espaços
          </button>
          <button
            onClick={() => setIndent(4)}
            className={`border-l border-[#27272A] px-3 py-2 font-mono text-xs transition-colors ${
              indent === 4 ? 'bg-[#18181B] text-white' : 'bg-black text-[#A1A1AA] hover:text-white'
            }`}
          >
            4 espaços
          </button>
        </span>
      </div>

      {/* Indicador de status */}
      <div className={`flex flex-col gap-1 border px-4 py-3 ${statusClass}`}>
        <span
          className={`font-mono text-sm ${
            status.kind === 'valid'
              ? 'text-green-400'
              : status.kind === 'error'
                ? 'text-red-400'
                : 'text-[#52525B]'
          }`}
        >
          {statusLabel}
        </span>
        {status.kind === 'valid' && (
          <p className="text-xs text-[#A1A1AA]">{status.message}</p>
        )}
        {status.kind === 'error' && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-red-300">{status.message}</p>
            {status.report && (
              <p className="font-mono text-xs text-red-400/80">
                Linha {status.report.line}, coluna {status.report.column}
              </p>
            )}
            {status.report && (
              <pre className="mt-1 whitespace-pre-wrap break-all border border-red-900 bg-black px-3 py-2 font-mono text-xs leading-relaxed text-red-200">
                {status.report.snippet}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Entrada / Saída */}
      <div className="grid w-full gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs text-[#A1A1AA]">ENTRADA · JSON BRUTO</label>
            <span className="font-mono text-xs text-[#52525B]">
              {input.length === 0 ? '' : `${input.split('\n').length} linhas`}
            </span>
          </div>
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setStatus({ kind: 'idle' });
            }}
            spellCheck={false}
            placeholder='Cole aqui seu JSON... Ex.: {"nome":"CofreUtil","tipo":"tools"}'
            className={`${inputClass} ${PANE_HEIGHT} resize-y font-mono text-sm leading-relaxed`}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[#A1A1AA]">
              SAÍDA{outputAction ? ` · ${outputAction.toUpperCase()}` : ''}
            </span>
            {output !== '' && (
              <span className="font-mono text-xs text-[#52525B]">
                {outputLines} {outputLines === 1 ? 'linha' : 'linhas'} · {formatBytes(outputBytes)}
              </span>
            )}
          </div>
          <div className={`${PANE_HEIGHT} min-w-0 overflow-auto border border-[#27272A] bg-black`}>
            {output === '' ? (
              <p className="flex h-full items-start px-4 py-3 font-mono text-sm leading-relaxed text-[#52525B]">
                {status.kind === 'idle'
                  ? 'O resultado formatado aparecerá aqui com destaque numérico.'
                  : '—'}
              </p>
            ) : (
              <pre className="whitespace-pre px-4 py-3 font-mono text-sm leading-relaxed">
                {stale && (
                  <span className="block pb-2 text-xs text-yellow-300/80">
                    [Saída desatualizada — clique em [Formatar] ou [Minificar] novamente]
                  </span>
                )}
                {tokens.map((token, index) =>
                  token.className ? (
                    <span key={index} className={token.className}>
                      {token.text}
                    </span>
                  ) : (
                    <span key={index}>{token.text}</span>
                  ),
                )}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
