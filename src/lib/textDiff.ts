/* =============================================================================
 * textDiff.ts — Comparador de Textos e Contratos 100% local
 * -----------------------------------------------------------------------------
 * Implementa o algoritmo O(ND) de Myers (1986) para diff mínimo, escrito em
 * TypeScript puro — nenhum byte do texto sai do navegador.
 *
 * Níveis de granularidade:
 *   - 'lines': comparação linha a linha (ideal para contratos).
 *   - 'words'/'chars': pré-compara linhas e, dentro de pares alterados com a
 *     mesma contagem, refina o diff em palavras ou caracteres (PDE / inline).
 * Nenhuma dependência externa é adicionada ao bundle.
 * ========================================================================== */

export type DiffLevel = 'lines' | 'words' | 'chars';

export interface InlineSegment {
  type: 'equal' | 'remove' | 'add';
  text: string;
}

export interface ChangeLine {
  text: string;
  inline: InlineSegment[] | null;
}

export type DiffBlock =
  | { kind: 'equal'; lines: string[] }
  | { kind: 'change'; removed: ChangeLine[]; added: ChangeLine[] };

export interface DiffResult {
  blocks: DiffBlock[];
  added: number;
  removed: number;
}

type Op = { type: 'equal' | 'remove' | 'add'; token: string };

/* ---------------------------------------------------------------------------
 * Núcleo: diff O(ND) de Myers sobre vetores de tokens
 * ------------------------------------------------------------------------- */

function buildDiffTokens(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;

  if (n === 0) return b.map((token) => ({ type: 'add' as const, token }));
  if (m === 0) return a.map((token) => ({ type: 'remove' as const, token }));

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];
  v[offset + 1] = 0;

  let foundD = -1;

  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        foundD = d;
        break outer;
      }
    }
  }

  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = foundD; d > 0; d--) {
    const k = x - y;
    const prevRow = trace[d];
    let prevK: number;
    if (k === -d || (k !== d && prevRow[offset + k - 1] < prevRow[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = prevRow[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', token: a[x - 1] });
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push({ type: 'add', token: b[y - 1] });
      y--;
    } else {
      ops.push({ type: 'remove', token: a[x - 1] });
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', token: a[x - 1] });
    x--;
    y--;
  }

  return ops.reverse();
}

/* ---------------------------------------------------------------------------
 * Diff refinado (palavras / caracteres) dentro de pares de linhas alteradas
 * ------------------------------------------------------------------------- */

function tokenizeInline(text: string, level: 'words' | 'chars'): string[] {
  if (level === 'chars') return Array.from(text);
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}

function mergeInline(segs: InlineSegment[]): InlineSegment[] {
  const out: InlineSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.type === s.type) {
      last.text += s.text;
    } else {
      out.push({ type: s.type, text: s.text });
    }
  }
  return out;
}

function diffInlinePair(
  original: string,
  modified: string,
  level: 'words' | 'chars',
): { original: InlineSegment[]; modified: InlineSegment[] } {
  const toksA = tokenizeInline(original, level);
  const toksB = tokenizeInline(modified, level);
  const ops = buildDiffTokens(toksA, toksB);
  const origSegs: InlineSegment[] = [];
  const modSegs: InlineSegment[] = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      origSegs.push({ type: 'equal', text: op.token });
      modSegs.push({ type: 'equal', text: op.token });
    } else if (op.type === 'remove') {
      origSegs.push({ type: 'remove', text: op.token });
    } else {
      modSegs.push({ type: 'add', text: op.token });
    }
  }
  return { original: mergeInline(origSegs), modified: mergeInline(modSegs) };
}

function alignLines(
  removed: string[],
  added: string[],
  level: Exclude<DiffLevel, 'lines'>,
): { removed: ChangeLine[]; added: ChangeLine[] } {
  if (removed.length > 0 && removed.length === added.length) {
    const outR: ChangeLine[] = [];
    const outA: ChangeLine[] = [];
    for (let i = 0; i < removed.length; i++) {
      const { original, modified } = diffInlinePair(removed[i], added[i], level);
      outR.push({ text: removed[i], inline: original });
      outA.push({ text: added[i], inline: modified });
    }
    return { removed: outR, added: outA };
  }
  return {
    removed: removed.map((t) => ({ text: t, inline: null })),
    added: added.map((t) => ({ text: t, inline: null })),
  };
}

/* ---------------------------------------------------------------------------
 * API pública
 * ------------------------------------------------------------------------- */

export function computeDiff(
  original: string,
  modified: string,
  level: DiffLevel = 'lines',
): DiffResult {
  const originalLines = original === '' ? [] : original.split('\n');
  const modifiedLines = modified === '' ? [] : modified.split('\n');
  const ops = buildDiffTokens(originalLines, modifiedLines);

  const blocks: DiffBlock[] = [];
  let equalRun: string[] = [];
  let removed: string[] = [];
  let added: string[] = [];

  const flushEqual = () => {
    if (equalRun.length > 0) {
      blocks.push({ kind: 'equal', lines: equalRun });
      equalRun = [];
    }
  };

  const flushChange = () => {
    if (removed.length === 0 && added.length === 0) return;
    let removedLines: ChangeLine[];
    let addedLines: ChangeLine[];
    if (level === 'lines') {
      removedLines = removed.map((t) => ({ text: t, inline: null }));
      addedLines = added.map((t) => ({ text: t, inline: null }));
    } else {
      const aligned = alignLines(removed, added, level);
      removedLines = aligned.removed;
      addedLines = aligned.added;
    }
    blocks.push({ kind: 'change', removed: removedLines, added: addedLines });
    removed = [];
    added = [];
  };

  for (const op of ops) {
    if (op.type === 'equal') {
      flushChange();
      equalRun.push(op.token);
    } else if (op.type === 'remove') {
      flushEqual();
      removed.push(op.token);
    } else {
      flushEqual();
      added.push(op.token);
    }
  }
  flushChange();
  flushEqual();

  let addedCount = 0;
  let removedCount = 0;
  for (const b of blocks) {
    if (b.kind === 'change') {
      addedCount += b.added.length;
      removedCount += b.removed.length;
    }
  }

  return { blocks, added: addedCount, removed: removedCount };
}