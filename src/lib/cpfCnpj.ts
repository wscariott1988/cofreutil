function sumDigits(digits: number[], weights: number[]): number {
  return digits.reduce((sum, d, i) => sum + d * weights[i], 0);
}

function remainder(total: number): number {
  const r = total % 11;
  return r < 2 ? 0 : 11 - r;
}

function allSameDigit(digits: number[]): boolean {
  return digits.every((d) => d === digits[0]);
}

function extractDigits(value: string): number[] {
  return value.replace(/\D/g, '').split('').map(Number);
}

// ─── CPF ────────────────────────────────────────────────────────

export function isValidCpf(raw: string): boolean {
  const digits = extractDigits(raw);
  if (digits.length !== 11) return false;
  if (allSameDigit(digits)) return false;

  const d1 = remainder(sumDigits(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]));
  const d2 = remainder(sumDigits(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));

  return digits[9] === d1 && digits[10] === d2;
}

function generateCpfDigits(): number[] {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const d1 = remainder(sumDigits(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(d1);
  const d2 = remainder(sumDigits(base, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(d2);
  return base;
}

export function generateCpf(formatted = true): string {
  const digits = generateCpfDigits();
  const raw = digits.join('');
  if (!formatted) return raw;
  return raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// ─── CNPJ ───────────────────────────────────────────────────────

export function isValidCnpj(raw: string): boolean {
  const digits = extractDigits(raw);
  if (digits.length !== 14) return false;
  if (allSameDigit(digits)) return false;

  const d1 = remainder(sumDigits(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  const d2 = remainder(sumDigits(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));

  return digits[12] === d1 && digits[13] === d2;
}

function generateCnpjDigits(): number[] {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const d1 = remainder(sumDigits(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(d1);
  const d2 = remainder(sumDigits(base, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(d2);
  return base;
}

export function generateCnpj(formatted = true): string {
  const digits = generateCnpjDigits();
  const raw = digits.join('');
  if (!formatted) return raw;
  return raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}
