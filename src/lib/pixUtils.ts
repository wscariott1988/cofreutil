export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

/** Valida CPF (11 dígitos, dígitos verificadores). */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split('').map(Number);

  const sum1 = nums.slice(0, 9).reduce((acc, d, i) => acc + d * (10 - i), 0);
  const d1 = (sum1 * 10) % 11;
  const r1 = d1 >= 10 ? 0 : d1;

  const sum2 = nums.slice(0, 10).reduce((acc, d, i) => acc + d * (11 - i), 0);
  const d2 = (sum2 * 10) % 11;
  const r2 = d2 >= 10 ? 0 : d2;

  return r1 === nums[9] && r2 === nums[10];
}

/** Valida CNPJ (14 dígitos, dígitos verificadores). */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const nums = digits.split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const sum1 = nums.slice(0, 12).reduce((acc, d, i) => acc + d * weights1[i], 0);
  const d1 = sum1 % 11;
  const r1 = d1 < 2 ? 0 : 11 - d1;

  const sum2 = nums.slice(0, 13).reduce((acc, d, i) => acc + d * weights2[i], 0);
  const d2 = sum2 % 11;
  const r2 = d2 < 2 ? 0 : 11 - d2;

  return r1 === nums[12] && r2 === nums[13];
}

/** Valida e-mail (RFC 5322 simplificado). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Valida número de telefone brasileiro (10 ou 11 dígitos). */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

/** Valida Chave Aleatória EVP (UUID v4). */
export function isValidRandomKey(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** Valida a Pix Key conforme o tipo selecionado. */
export function validatePixKey(type: PixKeyType, value: string): boolean {
  switch (type) {
    case 'cpf':
      return isValidCpf(value);
    case 'cnpj':
      return isValidCnpj(value);
    case 'email':
      return isValidEmail(value);
    case 'phone':
      return isValidPhone(value);
    case 'random':
      return isValidRandomKey(value);
  }
}

/** Normaliza a Pix Key conforme o tipo (formatação padrão). */
export function formatPixKey(type: PixKeyType, value: string): string {
  const digits = value.replace(/\D/g, '');
  switch (type) {
    case 'cpf':
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    case 'cnpj':
      return digits.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '$1.$2.$3/$4-$5',
      );
    case 'phone':
      if (digits.length === 10) {
        return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
      }
      return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    default:
      return value;
  }
}

/**
 * Aplica máscara progressiva conforme o usuário digita a Pix Key.
 * CPF, CNPJ e Telefone recebem formatação incremental; E-mail e Chave
 * Aleatória são mantidos como texto livre.
 */
export function maskPixKey(type: PixKeyType, value: string): string {
  if (type === 'email' || type === 'random') return value;

  const digits = value.replace(/\D/g, '');

  if (type === 'cpf') {
    return digits
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  if (type === 'cnpj') {
    return digits
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  }

  if (type === 'phone') {
    const d = digits.slice(0, 11);
    if (d.length <= 10) {
      return d
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^\((\d{2})\) (\d{4})(\d)/, '($1) $2-$3');
    }
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^\((\d{2})\) (\d{5})(\d)/, '($1) $2-$3');
  }

  return value;
}

/** Remove acentos e normaliza para os campos de texto do Pix. */
export function sanitizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/** CRC16-CCITT (polinômio 0x1021, init 0xFFFF) conforme EMVCo. */
function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

const formatField = (id: string, value: string): string =>
  `${id}${value.length.toString().padStart(2, '0')}${value}`;

export interface PixPayloadOptions {
  key: string;
  keyType: PixKeyType;
  name: string;
  city: string;
  amount?: string;
  txId?: string;
}

/**
 * Monta o payload Pix (BR Code / EMVCo) a partir dos campos informados.
 * Campos: 00=PayloadFormat, 26=MerchantAccountInfo (GUI + Chave),
 * 52=MCC, 53=Moeda (986=BRL), 54=Valor, 58=País (BR),
 * 59=Nome, 60=Cidade, 62=AdditionalData (TxID), 63=CRC16.
 */
export function generatePixPayload(options: PixPayloadOptions): string {
  const merchantAccountInfo =
    formatField('00', 'br.gov.bcb.pix') + formatField('01', options.key);

  const name = sanitizeText(options.name).substring(0, 25) || 'NOME';
  const city = sanitizeText(options.city).substring(0, 15) || 'CIDADE';
  const txId = (options.txId || '***').trim() || '***';

  let payload =
    formatField('00', '01') +
    formatField('26', merchantAccountInfo) +
    formatField('52', '0000') +
    formatField('53', '986') +
    (options.amount && Number(options.amount) > 0
      ? formatField('54', Number(options.amount).toFixed(2))
      : '') +
    formatField('58', 'BR') +
    formatField('59', name) +
    formatField('60', city) +
    formatField('62', formatField('05', txId)) +
    '6304';

  return `${payload}${calculateCRC16(payload)}`;
}