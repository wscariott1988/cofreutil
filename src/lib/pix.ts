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

const formatField = (id: string, value: string) =>
  `${id}${value.length.toString().padStart(2, '0')}${value}`;

export const PIX_KEY = 'apoio@grupows.com';
export const PIX_NAME = 'Grupo WS';
export const PIX_CITY = 'DOIS IRMAOS';

export function generatePixPayload(
  key: string,
  name: string,
  city: string,
  amount?: string,
): string {
  const merchantAccountInfo = formatField('00', 'br.gov.bcb.pix') + formatField('01', key);

  let payload =
    formatField('00', '01') +
    formatField('26', merchantAccountInfo) +
    formatField('52', '0000') +
    formatField('53', '986') +
    (amount ? formatField('54', Number(amount).toFixed(2)) : '') +
    formatField('58', 'BR') +
    formatField('59', name.substring(0, 25)) +
    formatField('60', city.substring(0, 15)) +
    formatField('62', formatField('05', '***')) +
    '6304';

  return `${payload}${calculateCRC16(payload)}`;
}

export function generatePixCopyPaste(amount?: string): string {
  return generatePixPayload(PIX_KEY, PIX_NAME, PIX_CITY, amount);
}
