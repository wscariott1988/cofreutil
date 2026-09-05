import { useState, useCallback, useMemo, useRef } from 'react';
import { BatchLimiter } from '../../lib/BatchLimiter';
import { generatePixCopyPaste } from '../../lib/pix';

const STOP_WORDS = new Set([
  'de','do','da','dos','das','em','no','na','nos','nas','um','uma','uns','umas',
  'para','com','por','sem','sob','ate','desde','entre','contra','apos','perante',
  'que','se','ou','mas','e','o','a','os','as','ao','aos','as','me','te','lhe',
  'nos','vos','lhes','meu','minha','teu','tua','seu','sua','nosso','nossa',
  'este','esta','esse','essa','aquele','aquela','isto','isso','aquilo',
  'eu','tu','ele','ela','nos','eles','elas','voce','voces','mim','ti',
  'onde','quando','como','porque','por que','embora','mesmo','muito','bem',
  'ja','ainda','so','tambem','nao','mais','menos','muito','pouco','todo',
  'cada','outro','outra','mesmo','próprio','tal','tudo','nada','algo','alguem',
  'nenhum','nenhuma','algum','alguma','qual','quais','quanto','quanta',
  'que','se','si','caso','desde','conforme','segundo','mediante',
]);

function countSyllables(word: string): number {
  const lower = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const vowels = lower.match(/[aeiou]/g);
  if (!vowels) return 1;
  let count = vowels.length;
  const diphthongs = lower.match(/[aeiou]{2,3}/g);
  if (diphthongs) {
    const triphthongs = lower.match(/[aeiou]{3}/g);
    const diCount = diphthongs.length - (triphthongs ? triphthongs.length : 0);
    count -= Math.max(0, diCount);
    if (triphthongs) count -= triphthongs.length;
  }
  if (lower.endsWith('e') && !lower.endsWith('le') && !lower.endsWith('te') && !lower.endsWith('de') && count > 1) {
    count--;
  }
  return Math.max(1, count);
}

function analyzeWords(text: string): { word: string; count: number; pct: number }[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) return [];

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  const total = words.length;
  const entries: { word: string; count: number; pct: number }[] = [];

  for (const [word, count] of freq) {
    if (STOP_WORDS.has(word)) continue;
    if (countSyllables(word) < 2) continue;
    entries.push({ word, count, pct: parseFloat(((count / total) * 100).toFixed(2)) });
  }

  entries.sort((a, b) => b.count - a.count);
  return entries.slice(0, 20);
}

export default function CharCounterTool() {
  const [text, setText] = useState('');
  const prevPastedRef = useRef(false);

  const [showSupport, setShowSupport] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const pixPayload = generatePixCopyPaste();

  const stats = useMemo(() => {
    if (!text) return null;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;

    const trimmedText = text.trim();
    const words = trimmedText === '' ? 0 : trimmedText.split(/\s+/).length;

    const lines = text === '' ? 0 : text.split('\n').length;
    const paragraphs = trimmedText === '' ? 0 : trimmedText.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;

    const readMin = Math.max(1, Math.ceil(words / 200));

    return { chars, charsNoSpaces, words, lines, paragraphs, readMin };
  }, [text]);

  const density = useMemo(() => analyzeWords(text), [text]);

  const handleClear = useCallback(() => {
    if (text.trim().length > 0) {
      BatchLimiter.incrementUsage(1);
      if (BatchLimiter.isLimitReached()) {
        setShowSupport(true);
      }
    }
    setText('');
  }, [text]);

  const handleChange = useCallback((value: string) => {
    setText(value);
  }, []);

  const handlePaste = useCallback((value: string) => {
    const wordCount = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
    if (wordCount > 500 && !prevPastedRef.current) {
      prevPastedRef.current = true;
      BatchLimiter.incrementUsage(1);
      if (BatchLimiter.isLimitReached()) {
        setShowSupport(true);
      }
    }
    setText(value);
  }, []);

  return (
    <div className="w-full max-w-5xl rounded-none">
      {/* Entrada */}
      <div className="flex flex-col gap-4 border border-[#27272A] bg-[#09090B] p-4 md:p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-[#A1A1AA]">
            {"// digite ou cole seu texto aqui"}
          </span>
          {stats && (
            <span className="font-mono text-xs text-[#52525B]">
              {stats.words} {stats.words === 1 ? 'palavra' : 'palavras'}
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text');
            handlePaste(pasted);
          }}
          placeholder="Cole ou digite seu texto para contar caracteres, palavras e analisar densidade de SEO…"
          spellCheck={false}
          className="h-64 resize-none rounded-none border border-[#27272A] bg-black p-4 font-mono text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#3F3F46] focus:outline-none md:h-80"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleClear}
            disabled={!text}
            className="rounded-none border border-[#27272A] bg-[#09090B] px-6 py-3 font-mono text-sm text-white transition-colors hover:border-[#3F3F46] hover:bg-[#18181B] disabled:opacity-40 disabled:hover:border-[#27272A] disabled:hover:bg-[#09090B]"
          >
            [Limpar Texto]
          </button>
          <span className="font-mono text-[11px] text-[#52525B]">
            Processamento 100% local — nada sai do seu navegador.
          </span>
        </div>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="mt-4 border border-[#27272A] bg-[#09090B]">
          <div className="border-b border-[#27272A] bg-black px-4 py-2 font-mono text-xs text-[#A1A1AA]">
            {"// estatísticas"}
          </div>
          <div className="grid grid-cols-2 gap-0 md:grid-cols-3">
            {[
              { label: 'Caracteres (com espaços)', value: stats.chars },
              { label: 'Caracteres (sem espaços)', value: stats.charsNoSpaces },
              { label: 'Palavras', value: stats.words },
              { label: 'Linhas', value: stats.lines },
              { label: 'Parágrafos', value: stats.paragraphs },
              { label: 'Tempo de leitura', value: `~${stats.readMin} min` },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 border-[#27272A] p-4 ${
                  i % 2 === 0 ? 'max-md:border-r' : ''
                } ${i < 4 ? 'border-b max-md:border-b' : ''} ${
                  i % 3 !== 2 ? 'md:border-r' : ''
                } ${i < 3 ? 'md:border-b' : ''}`}
              >
                <span className="font-mono text-[11px] leading-tight text-[#52525B]">{item.label}</span>
                <span className="font-mono text-lg font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Análise de Densidade SEO */}
      {density.length > 0 && (
        <div className="mt-4 border border-[#27272A] bg-[#09090B]">
          <div className="flex items-center justify-between border-b border-[#27272A] bg-black px-4 py-2">
            <span className="font-mono text-xs text-[#A1A1AA]">
              {"// densidade de palavras (SEO)"}
            </span>
            <span className="font-mono text-[10px] text-[#52525B]">
              palavras com 2+ sílabas · exclui conectivos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="border-b border-[#27272A] text-left">
                  <th className="px-4 py-3 text-[11px] font-normal text-[#52525B]">#</th>
                  <th className="px-4 py-3 text-[11px] font-normal text-[#52525B]">PALAVRA</th>
                  <th className="px-4 py-3 text-[11px] font-normal text-[#52525B]">OCORRÊNCIAS</th>
                  <th className="px-4 py-3 text-[11px] font-normal text-[#52525B]">DENSIDADE</th>
                </tr>
              </thead>
              <tbody>
                {density.map((entry, i) => (
                  <tr key={entry.word} className="border-b border-[#27272A] last:border-b-0">
                    <td className="px-4 py-2.5 text-[#52525B]">{i + 1}</td>
                    <td className="px-4 py-2.5 text-white font-bold">{entry.word}</td>
                    <td className="px-4 py-2.5 text-[#A1A1AA]">{entry.count}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 bg-[#27272A]">
                          <div
                            className="h-full bg-white"
                            style={{ width: `${Math.min(100, entry.pct * 5)}%` }}
                          />
                        </div>
                        <span className="text-[#A1A1AA]">{entry.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#27272A] px-4 py-2">
            <p className="font-mono text-[11px] text-[#52525B]">
              Palavras acima de 2-3% de densidade podem indicar keyword stuffing para motores de busca.
            </p>
          </div>
        </div>
      )}

      {/* Instrução quando vazio */}
      {!text && (
        <div className="mt-4 border border-[#27272A] bg-[#09090B] p-4">
          <p className="font-mono text-[11px] text-[#52525B]">
            Cole ou digite um texto acima para ver estatísticas instantâneas e análise de densidade de palavras para SEO.
          </p>
        </div>
      )}

      {/* Badge Zero Cookies */}
      <div className="mt-6 rounded-none border border-[#27272A] bg-[#09090B] p-4 font-mono text-xs text-[#52525B]">
        <span className="font-bold text-white">[ZERO COOKIES &amp; 100% LOCAL]</span>{' '}
        Este contador nao utiliza cookies de rastreamento e nao coleta seus dados pessoais.
        Todo o processamento de texto acontece estritamente dentro da memoria RAM do seu navegador.
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
              Continuar usando grátis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
