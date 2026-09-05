import { useState, useCallback, useMemo, useEffect } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';
import {
  computeDiff,
  type DiffResult,
  type DiffLevel,
  type InlineSegment,
} from '../../lib/textDiff';

const LEVELS: { id: DiffLevel; label: string; desc: string }[] = [
  { id: 'lines', label: 'Linhas', desc: 'Compara cada linha' },
  { id: 'words', label: 'Palavras', desc: 'Destaque fino dentro das linhas' },
  { id: 'chars', label: 'Caracteres', desc: 'Destaque máximo, letra a letra' },
];

type InlineProps = { type: InlineSegment['type']; text: string };

function InlineRun({ type, text }: InlineProps) {
  if (type === 'equal') {
    return <span>{text}</span>;
  }
  return (
    <span
      className={
        type === 'remove'
          ? 'bg-[#1A0505] text-red-300 underline decoration-red-800'
          : 'bg-[#04140A] text-green-300'
      }
    >
      {text}
    </span>
  );
}

function LineCell({
  text,
  inline,
  number,
  kind,
  alignTop,
}: {
  text: string;
  inline: InlineSegment[] | null;
  number: number | null;
  kind: 'equal' | 'remove' | 'add' | 'empty' | 'gap';
  alignTop?: boolean;
}) {
  if (kind === 'gap') {
    return (
      <div className="flex items-center border-l border-[#27272A] bg-black px-2 py-0.5 font-mono text-xs text-[#27272A]">
        <span className="mr-3 w-6 shrink-0 text-right" />
        <span>··</span>
      </div>
    );
  }
  return (
    <div
      className={`flex items-stretch border-l font-mono text-xs ${
        alignTop ? 'items-start' : 'items-center'
      } ${
        kind === 'equal'
          ? 'border-[#27272A] bg-[#09090B] text-[#D4D4D8]'
          : kind === 'remove'
            ? 'border-[#450A0A] bg-[#120303] text-red-400'
            : kind === 'add'
              ? 'border-[#14532D] bg-[#031309] text-green-400'
              : 'border-[#27272A] bg-black text-transparent'
      }`}
    >
      <span className="mr-3 w-6 shrink-0 select-none text-right text-[#52525B]">
        {number ?? ''}
      </span>
      <span className="whitespace-pre-wrap break-words py-0.5 pr-2">
        {inline ? (
          inline.map((s, idx) => <InlineRun key={idx} type={s.type} text={s.text} />)
        ) : (
          <span>{text === '' ? ' ' : text}</span>
        )}
      </span>
    </div>
  );
}

export default function DiffCheckerTool() {
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');
  const [level, setLevel] = useState<DiffLevel>('lines');
  const [viewMode, setViewMode] = useState<'side' | 'unified'>('side');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [locked, setLocked] = useState(() => BatchLimiter.isLimitReached());
  const [remaining, setRemaining] = useState(() => BatchLimiter.getRemaining());
  const [showSupport, setShowSupport] = useState(locked);
  const [pixCopied, setPixCopied] = useState(false);
  const pixPayload = generatePixCopyPaste();

  useEffect(() => {
    if (BatchLimiter.isLimitReached()) {
      setLocked(true);
      setRemaining(0);
      setShowSupport(true);
    }
  }, []);

  const bothEmpty = original.trim() === '' && modified.trim() === '';
  const canCompare = !bothEmpty;

  const bump = useCallback(() => {
    BatchLimiter.incrementUsage(1);
    const left = BatchLimiter.getRemaining();
    setRemaining(left);
    if (BatchLimiter.isLimitReached()) {
      setLocked(true);
    }
  }, []);

  const handleCompare = useCallback(() => {
    setError(null);
    if (bothEmpty) return;
    const diffResult = computeDiff(original, modified, level);
    setResult(diffResult);
    bump();
    if (locked || BatchLimiter.isLimitReached()) {
      setShowSupport(true);
    }
  }, [original, modified, level, locked, bothEmpty, bump]);

  const handleSwap = useCallback(() => {
    setOriginal(modified);
    setModified(original);
    setResult(null);
    setError(null);
  }, [original, modified]);

  const handleClear = useCallback(() => {
    setOriginal('');
    setModified('');
    setResult(null);
    setError(null);
  }, []);

  const handleInput = useCallback((field: 'original' | 'modified', value: string) => {
    if (field === 'original') setOriginal(value);
    else setModified(value);
    setResult(null);
    setError(null);
  }, []);

  const stats = useMemo(() => {
    if (!result) return null;
    let equalLines = 0;
    for (const b of result.blocks) {
      if (b.kind === 'equal') equalLines += b.lines.length;
    }
    return {
      added: result.added,
      removed: result.removed,
      equal: equalLines,
    };
  }, [result]);

  const sideRows = useMemo(() => {
    if (!result) return [];
    type Row = {
      left: { text: string; inline: InlineSegment[] | null; number: number | null; kind: 'equal' | 'remove' | 'add' | 'empty' };
      right: { text: string; inline: InlineSegment[] | null; number: number | null; kind: 'equal' | 'remove' | 'add' | 'empty' };
      isChange: boolean;
    };
    const rows: Row[] = [];
    let li = 1;
    let ri = 1;
    for (const b of result.blocks) {
      if (b.kind === 'equal') {
        for (const line of b.lines) {
          rows.push({
            left: { text: line, inline: null, number: li, kind: 'equal' },
            right: { text: line, inline: null, number: ri, kind: 'equal' },
            isChange: false,
          });
          li++;
          ri++;
        }
        continue;
      }
      const removed = b.removed;
      const added = b.added;
      const count = Math.max(removed.length, added.length);
      for (let i = 0; i < count; i++) {
        rows.push({
          left: {
            text: removed[i]?.text ?? '',
            inline: removed[i]?.inline ?? null,
            number: removed[i] ? li : null,
            kind: removed[i] ? 'remove' : 'empty',
          },
          right: {
            text: added[i]?.text ?? '',
            inline: added[i]?.inline ?? null,
            number: added[i] ? ri : null,
            kind: added[i] ? 'add' : 'empty',
          },
          isChange: true,
        });
        if (removed[i]) li++;
        if (added[i]) ri++;
      }
    }
    if (rows.length === 0) {
      rows.push({
        left: { text: '—', inline: null, number: null, kind: 'equal' },
        right: { text: '—', inline: null, number: null, kind: 'equal' },
        isChange: false,
      });
    }
    return rows;
  }, [result, level]);

  const unifiedRows = useMemo(() => {
    if (!result) return [];
    type URow = {
      text: string;
      inline: InlineSegment[] | null;
      number: number | null;
      kind: 'equal' | 'remove' | 'add';
    };
    const rows: URow[] = [];
    let li = 1;
    let ri = 1;
    for (const b of result.blocks) {
      if (b.kind === 'equal') {
        for (const line of b.lines) {
          rows.push({ text: line, inline: null, number: li, kind: 'equal' });
          li++;
          ri++;
        }
      } else {
        for (const r of b.removed) {
          rows.push({ text: r.text, inline: r.inline, number: li, kind: 'remove' });
          li++;
        }
        for (const a of b.added) {
          rows.push({ text: a.text, inline: a.inline, number: ri, kind: 'add' });
          ri++;
        }
      }
    }
    if (rows.length === 0) {
      rows.push({ text: '—', inline: null, number: null, kind: 'equal' });
    }
    return rows;
  }, [result]);

  const changeCount = result
    ? result.blocks.filter((b) => b.kind === 'change').length
    : 0;

  return (
    <div className="w-full max-w-5xl rounded-none">
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-red-800 bg-[#09090B] px-4 py-3">
          <span className="font-mono text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 font-mono text-xs text-[#A1A1AA] transition-colors hover:text-white"
          >
            [X]
          </button>
        </div>
      )}

      {/* Entrada */}
      <div className="flex flex-col gap-6 border border-[#27272A] bg-[#09090B] p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-[#A1A1AA]">
              {"// texto original"}
            </span>
            <textarea
              value={original}
              onChange={(e) => handleInput('original', e.target.value)}
              placeholder="Cole aqui o texto/contrato original…"
              spellCheck={false}
              className="h-56 resize-none rounded-none border border-[#27272A] bg-black p-3 font-mono text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#3F3F46] focus:outline-none md:h-72"
            />
            <p className="font-mono text-[11px] text-[#52525B]">
              {original.length > 0
                ? `${original.length} caractere(s) · ${original.split('\n').length} linha(s)`
                : 'vazio'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-[#A1A1AA]">
              {"// texto modificado"}
            </span>
            <textarea
              value={modified}
              onChange={(e) => handleInput('modified', e.target.value)}
              placeholder="Cole aqui a versão novo/alterada…"
              spellCheck={false}
              className="h-56 resize-none rounded-none border border-[#27272A] bg-black p-3 font-mono text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#3F3F46] focus:outline-none md:h-72"
            />
            <p className="font-mono text-[11px] text-[#52525B]">
              {modified.length > 0
                ? `${modified.length} caractere(s) · ${modified.split('\n').length} linha(s)`
                : 'vazio'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleCompare}
            disabled={!canCompare}
            className="rounded-none border border-[#27272A] bg-[#09090B] px-6 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
          >
            [Comparar]
          </button>
          <button
            onClick={handleSwap}
            disabled={bothEmpty}
            className="rounded-none border border-[#27272A] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-40"
          >
            [Trocar]
          </button>
          <button
            onClick={handleClear}
            disabled={bothEmpty && !result}
            className="rounded-none border border-[#27272A] px-4 py-3 font-mono text-sm text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-white disabled:opacity-40"
          >
            [Limpar]
          </button>
          {locked && (
            <span className="font-mono text-xs text-[#52525B]">
              {remaining > 0
                ? `${remaining} ${remaining === 1 ? 'comparação' : 'comparações'} restante(s)`
                : 'Apoio voluntário solicitado — obrigado!'}
            </span>
          )}
        </div>

        {original.trim() !== '' || modified.trim() !== '' ? (
          <p className="font-mono text-[11px] text-[#52525B]">
            Os textos são comparados 100% no seu navegador — nada é enviado a servidores.
          </p>
        ) : (
          <p className="font-mono text-[11px] text-[#52525B]">
            Comparação 100% local e privada (zero servidores). Útil para conferir
            alterações em contratos antes de assinar.
          </p>
        )}
      </div>

      {/* Opções de diff */}
      {result && (
        <div className="mt-4 flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-4 md:p-6">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-[#A1A1AA]">
              {"// granularidade"}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((l) => {
                const active = level === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLevel(l.id)}
                    className={`flex flex-col items-start gap-1 rounded-none border p-3 text-left transition-colors ${
                      active
                        ? 'border-[#3F3F46] bg-[#18181B]'
                        : 'border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <span className="font-mono text-sm text-white">{l.label}</span>
                    <span className="font-mono text-[11px] leading-tight text-[#52525B]">
                      {l.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-[#A1A1AA]">
              {"// visualização"}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setViewMode('side')}
                className={`flex items-center gap-2 rounded-none border p-3 text-left transition-colors ${
                  viewMode === 'side'
                    ? 'border-[#3F3F46] bg-[#18181B]'
                    : 'border-[#27272A] hover:border-[#3F3F46]'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                    viewMode === 'side' ? 'bg-white text-black' : 'text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`font-mono text-sm ${viewMode === 'side' ? 'text-white' : 'text-[#A1A1AA]'}`}
                >
                  Lado a Lado
                </span>
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`flex items-center gap-2 rounded-none border p-3 text-left transition-colors ${
                  viewMode === 'unified'
                    ? 'border-[#3F3F46] bg-[#18181B]'
                    : 'border-[#27272A] hover:border-[#3F3F46]'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border border-[#27272A] font-mono text-[10px] ${
                    viewMode === 'unified' ? 'bg-white text-black' : 'text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`font-mono text-sm ${viewMode === 'unified' ? 'text-white' : 'text-[#A1A1AA]'}`}
                >
                  Unificado
                </span>
              </button>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-[#27272A] bg-black px-4 py-3">
              <span className="font-mono text-sm text-green-400">
                +{stats.added} adicionada{stats.added === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-sm text-red-400">
                −{stats.removed} removida{stats.removed === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-sm text-[#A1A1AA]">
                {stats.equal} linha{stats.equal === 1 ? '' : 's'} igual{stats.equal === 1 ? '' : 'is'}
              </span>
              <span className="ml-auto font-mono text-xs text-[#52525B]">
                {changeCount} bloco{changeCount === 1 ? '' : 's'} de alteração
              </span>
            </div>
          )}

          {level === 'words' || level === 'chars' ? (
            <p className="font-mono text-[11px] text-[#52525B]">
              Nas linhas alteradas em par, o destaque fino (inline) mostra exatamente
              o que mudou.
            </p>
          ) : null}

          {/* Visualização */}
          {viewMode === 'side' ? (
            <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
              <div className="border border-[#27272A] bg-[#09090B]">
                <div className="border-b border-[#27272A] bg-black px-3 py-2 font-mono text-xs text-[#A1A1AA]">
                  [original]
                </div>
                <div className="max-h-[480px] overflow-auto">
                  {sideRows.map((row, idx) => (
                    <LineCell key={idx} {...row.left} kind={row.left.kind} />
                  ))}
                </div>
              </div>
              <div className="mt-2 border border-[#27272A] bg-[#09090B] md:mt-0">
                <div className="border-b border-[#27272A] bg-black px-3 py-2 font-mono text-xs text-[#A1A1AA]">
                  [modificado]
                </div>
                <div className="max-h-[480px] overflow-auto">
                  {sideRows.map((row, idx) => (
                    <LineCell key={idx} {...row.right} kind={row.right.kind} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-[#27272A] bg-[#09090B]">
              <div className="border-b border-[#27272A] bg-black px-3 py-2 font-mono text-xs text-[#A1A1AA]">
                [unificado]
              </div>
              <div className="max-h-[480px] overflow-auto">
                {unifiedRows.map((row, idx) => (
                  <LineCell
                    key={idx}
                    text={row.text}
                    inline={row.inline}
                    number={row.number}
                    kind={row.kind}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 font-mono text-xs text-[#A1A1AA]">
        Comparação de textos 100% offline: seu documento nunca sai do dispositivo.
      </p>
      <p className="mt-1 font-mono text-[11px] text-[#52525B]">
        {locked
          ? 'Obrigado pelo seu apoio!'
          : remaining > 0
            ? `${remaining} ${remaining === 1 ? 'comparação' : 'comparações'} sem lembrete de apoio`
            : 'Obrigado pelo seu apoio!'}
      </p>

      {/* Badge Zero Cookies */}
      <div className="mt-6 rounded-none border border-[#27272A] bg-[#09090B] p-4 font-mono text-xs text-[#52525B]">
        <span className="font-bold text-white">[ZERO COOKIES & 100% LOCAL]</span>{' '}
        Este comparador nao utiliza cookies de rastreamento e nao coleta seus dados pessoais.
        Todo o processamento de textos acontece estritamente dentro da memoria RAM do seu navegador.
      </div>

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 flex w-full max-w-md flex-col gap-5 rounded-none border border-[#27272A] bg-[#09090B] p-8">
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
              className="rounded-none border border-[#27272A] bg-[#09090B] px-4 py-3 text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B]"
            >
              {pixCopied ? '[Copiado com Sucesso!]' : '[Copiar Pix Copia e Cola]'}
            </button>
            <button
              onClick={() => setShowSupport(false)}
              className="self-center text-xs text-[#52525B] transition-colors hover:text-white"
            >
              Continuar Usando Gratis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
