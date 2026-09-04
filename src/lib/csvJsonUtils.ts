export type CsvDelimiter = ',' | ';' | '\t';

export const CSV_DELIMITERS: { id: CsvDelimiter; label: string }[] = [
  { id: ',', label: 'Vírgula' },
  { id: ';', label: 'Ponto e vírgula' },
  { id: '\t', label: 'Tab' },
];

export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best: CsvDelimiter = ',';
  let bestCount = -1;
  for (const candidate of CSV_DELIMITERS.map((d) => d.id)) {
    let count = 0;
    for (let i = 0; i < firstLine.length; i++) if (firstLine[i] === candidate) count++;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parser CSV ciente de aspas duplas (RFC 4180): campos entre aspas podem
 * conter delimitador, quebras de linha e aspas escapadas como `""`.
 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        i++;
        continue;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isEmptyRow(row: string[]): boolean {
  return row.length === 0 || row.every((cell) => cell.trim() === '');
}

/** Converte texto CSV (com cabeçalho na primeira linha) em um array de objetos. */
export function csvToJson(text: string, delimiter?: CsvDelimiter): object[] {
  const d = delimiter ?? detectDelimiter(text);
  const rows = parseCsvRows(text, d);
  if (rows.length === 0) throw new Error('O CSV está vazio.');
  const header = rows[0].map((h) => h.trim());
  if (header.length === 0 || header.every((h) => h === '')) {
    throw new Error('A primeira linha precisa conter os cabeçalhos das colunas.');
  }

  const result: object[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) continue;
    const record: Record<string, unknown> = {};
    header.forEach((column, index) => {
      if (column !== '') record[column] = row[index] ?? '';
    });
    result.push(record);
  }
  return result;
}

function escapeField(value: string, delimiter: string): string {
  if (
    value.includes('"') ||
    value.includes(delimiter) ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error('O JSON está vazio.');
    const rows = data.map((item, index) => {
      if (!isPlainObject(item)) {
        throw new Error(
          `Cada item do array precisa ser um objeto (item na posição ${index} não é).`,
        );
      }
      return item;
    });
    return rows;
  }
  if (isPlainObject(data)) return [data];
  throw new Error('O JSON precisa ser um objeto ou um array de objetos.');
}

/** Converte JSON (objeto único ou array de objetos) em texto CSV. */
export function jsonToCsv(data: unknown, delimiter: CsvDelimiter): string {
  const rows = normalizeRows(data);

  const header: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }

  const stringifyValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const lines = [header.map((h) => escapeField(h, delimiter)).join(delimiter)];
  for (const row of rows) {
    const cells = header.map((key) => escapeField(stringifyValue(row[key]), delimiter));
    lines.push(cells.join(delimiter));
  }
  return lines.join('\n');
}
