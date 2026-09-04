// ─── Conjuntos de caracteres ─────────────────────────────────────
// Senha forte, criptograficamente aleatória, 100% no navegador.

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/<>|~';

// Caracteres removidos quando "evitar ambíguos" está ativo (ex: 0/O, 1/l/I).
const AMBIGUOUS_LOWERCASE = new Set(['l', 'o']);
const AMBIGUOUS_UPPERCASE = new Set(['I', 'O']);
const AMBIGUOUS_DIGITS = new Set(['0', '1']);
const AMBIGUOUS_SYMBOLS = new Set(['`', "'", '"', '\\', '|']);

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function filterAmbiguous(chars: string, exclude: Set<string>): string {
  if (chars.length === 0) return '';
  return [...chars].filter((c) => !exclude.has(c)).join('');
}

export interface CharacterPool {
  id: 'lowercase' | 'uppercase' | 'digits' | 'symbols';
  label: string;
  chars: string;
}

/** Retorna os conjuntos de caracteres ativos conforme as opções. */
export function getActivePools(options: PasswordOptions): CharacterPool[] {
  const exclude = options.excludeAmbiguous;
  const pools: Array<Pick<CharacterPool, 'id' | 'label'> & { base: string; ambiguous: Set<string> }> = [
    { id: 'lowercase', label: 'Minúsculas (a-z)', base: LOWERCASE, ambiguous: AMBIGUOUS_LOWERCASE },
    { id: 'uppercase', label: 'Maiúsculas (A-Z)', base: UPPERCASE, ambiguous: AMBIGUOUS_UPPERCASE },
    { id: 'digits', label: 'Números (0-9)', base: DIGITS, ambiguous: AMBIGUOUS_DIGITS },
    { id: 'symbols', label: 'Símbolos', base: SYMBOLS, ambiguous: AMBIGUOUS_SYMBOLS },
  ];

  const enabled = {
    lowercase: options.lowercase,
    uppercase: options.uppercase,
    digits: options.digits,
    symbols: options.symbols,
  };

  return pools
    .filter((p) => enabled[p.id])
    .map((p) => ({
      id: p.id,
      label: p.label,
      chars: exclude ? filterAmbiguous(p.base, p.ambiguous) : p.base,
    }));
}

/** Tamanho total do "alfabeto" (pool de caracteres) usado pela senha. */
export function getPoolSize(options: PasswordOptions): number {
  return getActivePools(options).reduce((sum, pool) => sum + pool.chars.length, 0);
}

// ─── Geração criptograficamente segura ───────────────────────────
// Usa window.crypto.getRandomValues (CSPRNG) com rejeição de amostra
// para evitar viés de módulo — nenhuma chamada a Math.random().

function secureRandomIndex(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const values = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % maxExclusive);
  let value: number;
  do {
    window.crypto.getRandomValues(values);
    value = values[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function randomCharFrom(pool: string): string {
  return pool[secureRandomIndex(pool.length)];
}

function shuffleInPlace(items: string[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * Gera uma senha aleatória com pelo menos um caractere de cada categoria
 * habilitada. Retorna string vazia quando nenhuma categoria está ativa.
 */
export function generatePassword(options: PasswordOptions): string {
  const pools = getActivePools(options);
  if (pools.length === 0) return '';

  const length = clampInt(options.length, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH);
  const allChars = pools.map((pool) => pool.chars).join('');
  const chars: string[] = [];

  pools.forEach((pool) => chars.push(randomCharFrom(pool.chars)));

  while (chars.length < length) {
    chars.push(randomCharFrom(allChars));
  }

  shuffleInPlace(chars);
  return chars.join('');
}

// ─── Cálculo de força (entropia + tempo estimado de quebra) ──────
// Suposição de ataque offline: 10 bilhões de tentativas por segundo,
// cenário pessimista que cobre clusters GPU na nuvem.

export const GUESSES_PER_SECOND = 1e10;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthReport {
  entropyBits: number;
  poolSize: number;
  crackTimeSeconds: number;
  timeLabel: string;
  score: PasswordScore;
  label: string;
}

export function estimateStrength(length: number, options: PasswordOptions): StrengthReport {
  const poolSize = getPoolSize(options);
  const safeLength = clampInt(length, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH);

  let entropyBits = 0;
  let crackTimeSeconds = 0;
  if (poolSize > 0 && safeLength > 0) {
    entropyBits = safeLength * Math.log2(poolSize);
    crackTimeSeconds = Math.pow(2, entropyBits) / GUESSES_PER_SECOND;
  }

  const score = scoreFromEntropy(entropyBits);
  return {
    entropyBits,
    poolSize,
    crackTimeSeconds,
    timeLabel: formatCrackTime(crackTimeSeconds),
    score,
    label: scoreLabel(score),
  };
}

function scoreFromEntropy(bits: number): PasswordScore {
  if (bits >= 100) return 4;
  if (bits >= 70) return 3;
  if (bits >= 45) return 2;
  if (bits >= 28) return 1;
  return 0;
}

function scoreLabel(score: PasswordScore): string {
  switch (score) {
    case 4:
      return 'Muito Forte';
    case 3:
      return 'Forte';
    case 2:
      return 'Média';
    case 1:
      return 'Fraca';
    default:
      return 'Muito Fraca';
  }
}

function pluralize(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds >= Number.MAX_SAFE_INTEGER) return '∞ (impraticável)';
  if (seconds < 1) return 'menos de 1 segundo';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} ${pluralize(Math.round(seconds), 'segundo', 'segundos')}`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} ${pluralize(Math.round(seconds / 60), 'minuto', 'minutos')}`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ${pluralize(Math.round(seconds / 3600), 'hora', 'horas')}`;
  if (seconds < 31557600) return `${Math.round(seconds / 86400)} ${pluralize(Math.round(seconds / 86400), 'dia', 'dias')}`;
  if (seconds < 31557600 * 1000) {
    const years = Math.round(seconds / 31557600);
    return `${years} ${pluralize(years, 'ano', 'anos')}`;
  }
  return formatHugeYears(seconds / 31557600);
}

// Escala longa em português para períodos muito grandes.
const YEAR_SUFFIXES = ['', ' mil', ' milhões de', ' bilhões de', ' trilhões de', ' quatrilhões de', ' quintilhões de'];

function formatHugeYears(years: number): string {
  let value = years;
  let index = 0;
  while (value >= 1000 && index < YEAR_SUFFIXES.length - 1) {
    value /= 1000;
    index++;
  }
  const formatted = value >= 100 ? Math.round(value).toLocaleString('pt-BR') : value.toFixed(value < 10 ? 1 : 0).replace('.', ',');
  return `≈ ${formatted}${YEAR_SUFFIXES[index]} anos`;
}
