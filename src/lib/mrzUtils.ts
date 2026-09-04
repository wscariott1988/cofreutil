/* =============================================================================
 * mrzUtils.ts — Leitor de MRZ / Passaportes 100% local
 * -----------------------------------------------------------------------------
 * 1. Parser puro das linhas MRZ (TD1/TD2/TD3) com validação de dígitos de
 *    controle (algoritmo ICAO 9303, pesos 7-3-1).
 * 2. Reconhecimento óptico via Tesseract.js (executa em Web Worker), com
 *    pré-processamento em Canvas (grayscale + binarização + upscale) focado
 *    no alfabeto MRZ [A-Z0-9<].
 * Nenhum byte da imagem/documento sai do navegador.
 * ========================================================================== */

export type MrzFormat = 'TD1' | 'TD2' | 'TD3';

export type MrzSource = File | HTMLCanvasElement;

export interface MrzProgress {
  status: string;
  progress: number; // 0..100
}

export interface MrzCheckResult {
  label: string;
  valid: boolean | null; // null => sem dígito para validar
  stored: string | null;
  expected: string | null;
}

export interface ParsedMrz {
  ok: boolean;
  format: MrzFormat | null;
  formatLabel: string;
  lines: string[];
  fields: MrzFields;
  checks: MrzCheckResult[];
  allChecksValid: boolean | null;
  warnings: string[];
}

export interface MrzFields {
  documentTypeCode: string;
  documentTypeLabel: string;
  issuingCountry: string | null;
  issuingCountryName: string | null;
  nationality: string | null;
  nationalityName: string | null;
  lastName: string;
  givenNames: string;
  fullName: string;
  documentNumber: string | null;
  birthDateRaw: string | null; // YYMMDD
  birthDate: string | null; // DD/MM/YYYY
  sex: string | null; // M | F | X
  sexLabel: string | null;
  expiryDateRaw: string | null; // YYMMDD
  expiryDate: string | null; // DD/MM/YYYY
  personalNumber: string | null;
}

export const MRZ_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
export const MRZ_OCR_WHITELIST =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

const COUNTRY_NAMES: Record<string, string> = {
  ARE: 'Emirados Árabes Unidos', ARG: 'Argentina', AUS: 'Austrália',
  BEL: 'Bélgica', BOL: 'Bolívia', BRA: 'Brasil', CAN: 'Canadá',
  CHE: 'Suíça', CHL: 'Chile', CHN: 'China', COL: 'Colômbia', DEU: 'Alemanha',
  DNK: 'Dinamarca', ESP: 'Espanha', FRA: 'França', GBR: 'Reino Unido',
  GRC: 'Grécia', IND: 'Índia', IRL: 'Irlanda', ISL: 'Islândia', ITA: 'Itália',
  JPN: 'Japão', KOR: 'Coreia do Sul', LUX: 'Luxemburgo', MAR: 'Marrocos',
  MEX: 'México', NLD: 'Holanda', NOR: 'Noruega', NZL: 'Nova Zelândia',
  PER: 'Peru', PRT: 'Portugal', PRY: 'Paraguai', RUS: 'Rússia',
  SWE: 'Suécia', URY: 'Uruguai', USA: 'Estados Unidos', VEN: 'Venezuela',
};

function countryName(code: string): string | null {
  return COUNTRY_NAMES[code] ?? null;
}

/* ---------------------------------------------------------------------------
 * Dígito de controle (ICAO 9303)
 * ------------------------------------------------------------------------- */

export function computeMrzCheckDigit(value: string): number | null {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charAt(i).toUpperCase();
    let v: number;
    if (c >= '0' && c <= '9') v = c.charCodeAt(0) - 48;
    else if (c >= 'A' && c <= 'Z') v = c.charCodeAt(0) - 55;
    else if (c === '<') v = 0;
    else return null;
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

function checkDigitString(value: string): string | null {
  const digit = computeMrzCheckDigit(value);
  return digit === null ? null : String(digit);
}

function isValidCheck(value: string, storedChar: string | undefined): boolean {
  const expected = checkDigitString(value);
  if (expected === null || storedChar === undefined) return false;
  return expected === storedChar;
}

function isEmptyFill(raw: string | null | undefined): boolean {
  if (!raw) return true;
  return /^<+$/.test(raw);
}

function stripFillers(raw: string): string {
  return raw.replace(/^<+/, '').replace(/<+$/, '');
}

/* ---------------------------------------------------------------------------
 * Datas (YYMMDD -> DD/MM/YYYY)
 * ------------------------------------------------------------------------- */

function decodeMrzDate(six: string, isExpiry: boolean): string | null {
  if (!six || six.length < 6 || /[^0-9]/.test(six)) return null;
  const yy = Number.parseInt(six.slice(0, 2), 10);
  const mm = Number.parseInt(six.slice(2, 4), 10);
  const dd = Number.parseInt(six.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  let year: number;
  if (isExpiry) {
    year = 2000 + yy;
  } else {
    const thisCentury = 2000 + yy;
    const currentYear = new Date().getFullYear();
    year = thisCentury > currentYear ? 1900 + yy : thisCentury;
  }

  const date = new Date(year, mm - 1, dd);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/* ---------------------------------------------------------------------------
 * Nomes (primary << secondary < ...)
 * ------------------------------------------------------------------------- */

function parseMrzName(field: string): {
  lastName: string;
  givenNames: string;
  fullName: string;
} {
  const name = field.toUpperCase();
  const separatorIndex = name.indexOf('<<');

  let lastNameRaw: string;
  let givenRaw: string;
  if (separatorIndex >= 0) {
    lastNameRaw = name.slice(0, separatorIndex);
    givenRaw = name.slice(separatorIndex + 2);
  } else {
    lastNameRaw = name;
    givenRaw = '';
  }

  const clean = (s: string) => stripFillers(s).replace(/<+/g, ' ').trim();
  const lastName = clean(lastNameRaw);
  const givenNames = clean(givenRaw);
  const fullName = [lastName, givenNames].filter(Boolean).join(' ');
  return { lastName, givenNames, fullName };
}

/* ---------------------------------------------------------------------------
 * Normalização das linhas lidas (OCR ou manual)
 * ------------------------------------------------------------------------- */

export function normalizeMrzLine(line: string): string {
  const upper = line.toUpperCase();
  let out = '';
  for (let i = 0; i < upper.length; i++) {
    const c = upper.charAt(i);
    if (MRZ_CHARSET.indexOf(c) !== -1) out += c;
  }
  return out;
}

function padTo(line: string, target: number): { line: string; padded: boolean } {
  if (line.length >= target) return { line: line.slice(0, target), padded: false };
  return { line: line.padEnd(target, '<'), padded: true };
}

/* ---------------------------------------------------------------------------
 * Tipos de documento / sexo
 * ------------------------------------------------------------------------- */

function documentTypeInfo(code: string): { code: string; label: string } {
  const first = code.charAt(0) || '?';
  const map: Record<string, string> = {
    P: 'Passaporte',
    I: 'Cartão de identidade',
    A: 'Passaporte de tripulante',
    V: 'Visto',
    C: 'Cartão de residência',
  };
  return { code: first, label: map[first] ?? 'Documento de viagem' };
}

function sexInfo(raw: string): { code: string; label: string } | null {
  const c = raw ? raw.charAt(0).toUpperCase() : '';
  if (c === 'M') return { code: 'M', label: 'Masculino' };
  if (c === 'F') return { code: 'F', label: 'Feminino' };
  if (c === 'X') return { code: 'X', label: 'Não especificado' };
  return null;
}

/* ---------------------------------------------------------------------------
 * Layouts TD1 / TD2 / TD3 (colunas fixas 1-based do ICAO 9303)
 * ------------------------------------------------------------------------- */

interface CheckSpec {
  label: string;
  value: string;
  storedChar: string | null;
}

function parseLines(lines: string[], format: MrzFormat): ParsedMrz {
  const targets: Record<MrzFormat, number> = { TD1: 30, TD2: 36, TD3: 44 };
  const target = targets[format];

  const raw: string[] = [];
  for (const l of lines) {
    const clean = normalizeMrzLine(l);
    if (!clean) continue;
    const { line } = padTo(clean, target);
    raw.push(line);
  }

  const warnings: string[] = [];
  const l0 = raw[0];
  const l1 = raw[1];
  const l2 = raw[2];
  if (!l0) {
    return emptyResult([], ['Nenhuma linha MRZ reconhecida.']);
  }

  const warningsFrom = (cleanLines: string[]) => {
    cleanLines.forEach((clean, i) => {
      if (clean.length !== target) {
        warnings.push(
          `Linha ${i + 1} reconhecida com ${clean.length} caracteres (esperado ${target}). Resultado pode conter erros de OCR.`,
        );
      }
    });
  };

  let fields: MrzFields;
  let checks: MrzCheckResult[] = [];

  if (format === 'TD3') {
    warningsFrom(lines.map((l) => normalizeMrzLine(l)).filter(Boolean));
    const typeCode = l0.slice(0, 2).replace(/<+$/g, '');
    const issuer = stripFillers(l0.slice(2, 5));
    const nameField = l0.slice(5, 44);
    const { lastName, givenNames, fullName } = parseMrzName(nameField);

    const docNumber = stripFillers(l1.slice(0, 9)) || null;
    const nationality = stripFillers(l1.slice(10, 13)) || null;
    const birthRaw = l1.slice(13, 19);
    const sexRaw = l1.slice(20, 21);
    const expRaw = l1.slice(21, 27);
    const personalRaw = l1.slice(28, 42);

    const docStored = l1.charAt(9);
    const dobStored = l1.charAt(19);
    const expStored = l1.charAt(27);
    const personalStored = l1.charAt(42);
    const compositeStored = l1.charAt(43);

    checks = [
      {
        label: 'Nº do documento',
        valid: docNumber ? isValidCheck(docNumber, docStored) : null,
        stored: docStored,
        expected: docNumber ? checkDigitString(docNumber) : null,
      },
      {
        label: 'Data de nascimento',
        valid: isValidCheck(birthRaw, dobStored),
        stored: dobStored,
        expected: checkDigitString(birthRaw),
      },
      {
        label: 'Data de validade',
        valid: isValidCheck(expRaw, expStored),
        stored: expStored,
        expected: checkDigitString(expRaw),
      },
      {
        label: 'Número pessoal',
        valid: isEmptyFill(personalRaw) ? null : isValidCheck(personalRaw, personalStored),
        stored: personalStored,
        expected: isEmptyFill(personalRaw) ? null : checkDigitString(personalRaw),
      },
    ];

    const compositeValue =
      l1.slice(0, 10) + l1.slice(13, 20) + l1.slice(21, 28) + l1.slice(28, 43);
    checks.push({
      label: 'Dígito final (composto)',
      valid: isValidCheck(compositeValue, compositeStored),
      stored: compositeStored,
      expected: checkDigitString(compositeValue),
    });

    const birth = decodeMrzDate(birthRaw, false);
    const expiry = decodeMrzDate(expRaw, true);
    const sex = sexInfo(sexRaw);

    fields = {
      documentTypeCode: documentTypeInfo(typeCode).code,
      documentTypeLabel: documentTypeInfo(typeCode).label,
      issuingCountry: issuer || null,
      issuingCountryName: issuer ? countryName(issuer) : null,
      nationality: nationality || null,
      nationalityName: nationality ? countryName(nationality) : null,
      lastName,
      givenNames,
      fullName: fullName || '(não reconhecido)',
      documentNumber: docNumber,
      birthDateRaw: birthRaw,
      birthDate: birth,
      sex: sex?.code ?? null,
      sexLabel: sex?.label ?? null,
      expiryDateRaw: expRaw,
      expiryDate: expiry,
      personalNumber: isEmptyFill(personalRaw) ? null : stripFillers(personalRaw),
    };
  } else if (format === 'TD2') {
    warningsFrom(lines.map((l) => normalizeMrzLine(l)).filter(Boolean));
    const typeCode = l0.slice(0, 2).replace(/<+$/g, '');
    const issuer = stripFillers(l0.slice(2, 5));
    const nameField = l0.slice(5, 36);
    const { lastName, givenNames, fullName } = parseMrzName(nameField);

    const docNumber = stripFillers(l1.slice(0, 9)) || null;
    const nationality = stripFillers(l1.slice(10, 13)) || null;
    const birthRaw = l1.slice(13, 19);
    const sexRaw = l1.slice(20, 21);
    const expRaw = l1.slice(21, 27);
    const personalRaw = l1.slice(28, 35);

    const docStored = l1.charAt(9);
    const dobStored = l1.charAt(19);
    const expStored = l1.charAt(27);
    const compositeStored = l1.charAt(35);

    checks = [
      {
        label: 'Nº do documento',
        valid: docNumber ? isValidCheck(docNumber, docStored) : null,
        stored: docStored,
        expected: docNumber ? checkDigitString(docNumber) : null,
      },
      {
        label: 'Data de nascimento',
        valid: isValidCheck(birthRaw, dobStored),
        stored: dobStored,
        expected: checkDigitString(birthRaw),
      },
      {
        label: 'Data de validade',
        valid: isValidCheck(expRaw, expStored),
        stored: expStored,
        expected: checkDigitString(expRaw),
      },
    ];

    const compositeValue =
      l1.slice(0, 10) + l1.slice(13, 20) + l1.slice(21, 28) + l1.slice(28, 35);
    checks.push({
      label: 'Dígito final (composto)',
      valid: isValidCheck(compositeValue, compositeStored),
      stored: compositeStored,
      expected: checkDigitString(compositeValue),
    });

    const birth = decodeMrzDate(birthRaw, false);
    const expiry = decodeMrzDate(expRaw, true);
    const sex = sexInfo(sexRaw);

    fields = {
      documentTypeCode: documentTypeInfo(typeCode).code,
      documentTypeLabel: documentTypeInfo(typeCode).label,
      issuingCountry: issuer || null,
      issuingCountryName: issuer ? countryName(issuer) : null,
      nationality: nationality || null,
      nationalityName: nationality ? countryName(nationality) : null,
      lastName,
      givenNames,
      fullName: fullName || '(não reconhecido)',
      documentNumber: docNumber,
      birthDateRaw: birthRaw,
      birthDate: birth,
      sex: sex?.code ?? null,
      sexLabel: sex?.label ?? null,
      expiryDateRaw: expRaw,
      expiryDate: expiry,
      personalNumber: isEmptyFill(personalRaw) ? null : stripFillers(personalRaw),
    };
  } else {
    // TD1 — 3 linhas de 30
    warningsFrom(lines.map((l) => normalizeMrzLine(l)).filter(Boolean));
    const typeCode = l0.slice(0, 2).replace(/<+$/g, '');
    const issuer = stripFillers(l0.slice(2, 5));
    const docNumber = stripFillers(l0.slice(5, 14)) || null;
    const docStored = l0.charAt(14);

    const birthRaw = l1.slice(0, 6);
    const dobStored = l1.charAt(6);
    const sexRaw = l1.slice(7, 8);
    const expRaw = l1.slice(8, 14);
    const expStored = l1.charAt(14);
    const nationality = stripFillers(l1.slice(15, 18)) || null;
    const personalRaw = l1.slice(18, 29);
    const compositeStored = l1.charAt(29);

    const nameField = l2.slice(0, 30);
    const { lastName, givenNames, fullName } = parseMrzName(nameField);

    checks = [
      {
        label: 'Nº do documento',
        valid: docNumber ? isValidCheck(docNumber, docStored) : null,
        stored: docStored,
        expected: docNumber ? checkDigitString(docNumber) : null,
      },
      {
        label: 'Data de nascimento',
        valid: isValidCheck(birthRaw, dobStored),
        stored: dobStored,
        expected: checkDigitString(birthRaw),
      },
      {
        label: 'Data de validade',
        valid: isValidCheck(expRaw, expStored),
        stored: expStored,
        expected: checkDigitString(expRaw),
      },
    ];

    const compositeValue =
      l0.slice(5, 15) + l1.slice(0, 7) + l1.slice(8, 15) + l1.slice(18, 29);
    checks.push({
      label: 'Dígito final (composto)',
      valid: isValidCheck(compositeValue, compositeStored),
      stored: compositeStored,
      expected: checkDigitString(compositeValue),
    });

    const birth = decodeMrzDate(birthRaw, false);
    const expiry = decodeMrzDate(expRaw, true);
    const sex = sexInfo(sexRaw);

    fields = {
      documentTypeCode: documentTypeInfo(typeCode).code,
      documentTypeLabel: documentTypeInfo(typeCode).label,
      issuingCountry: issuer || null,
      issuingCountryName: issuer ? countryName(issuer) : null,
      nationality: nationality || null,
      nationalityName: nationality ? countryName(nationality) : null,
      lastName,
      givenNames,
      fullName: fullName || '(não reconhecido)',
      documentNumber: docNumber,
      birthDateRaw: birthRaw,
      birthDate: birth,
      sex: sex?.code ?? null,
      sexLabel: sex?.label ?? null,
      expiryDateRaw: expRaw,
      expiryDate: expiry,
      personalNumber: isEmptyFill(personalRaw) ? null : stripFillers(personalRaw),
    };
  }

  const present = checks.filter((c) => c.valid !== null);
  const allChecksValid =
    present.length === 0 ? null : present.every((c) => c.valid === true);

  const formatLabel =
    format === 'TD3'
      ? 'Passaporte / documento de viagem (TD3 · 2 linhas × 44)'
      : format === 'TD2'
        ? 'Identidade de cartão (TD2 · 2 linhas × 36)'
        : 'Identidade de cartão (TD1 · 3 linhas × 30)';

  return {
    ok: true,
    format,
    formatLabel,
    lines: raw,
    fields,
    checks,
    allChecksValid,
    warnings,
  };
}

function emptyResult(
  raw: string[],
  messages: string[],
): ParsedMrz {
  return {
    ok: false,
    format: null,
    formatLabel: '',
    lines: raw,
    fields: {
      documentTypeCode: '',
      documentTypeLabel: '',
      issuingCountry: null,
      issuingCountryName: null,
      nationality: null,
      nationalityName: null,
      lastName: '',
      givenNames: '',
      fullName: '',
      documentNumber: null,
      birthDateRaw: null,
      birthDate: null,
      sex: null,
      sexLabel: null,
      expiryDateRaw: null,
      expiryDate: null,
      personalNumber: null,
    },
    checks: [],
    allChecksValid: null,
    warnings: [...messages],
  };
}

/* ---------------------------------------------------------------------------
 * Detecção automática do formato (TD1 / TD2 / TD3)
 * ------------------------------------------------------------------------- */

interface GroupCandidate {
  format: MrzFormat;
  group: string[];
  target: number;
}

function findBestGroup(cleaned: string[]): GroupCandidate | null {
  if (cleaned.length === 0) return null;

  const specs: { format: MrzFormat; target: number; count: number }[] = [
    { format: 'TD1', target: 30, count: 3 },
    { format: 'TD3', target: 44, count: 2 },
    { format: 'TD2', target: 36, count: 2 },
  ];

  let best: GroupCandidate | null = null;
  let bestScore = Infinity;

  for (const spec of specs) {
    for (let i = 0; i + spec.count <= cleaned.length; i++) {
      const group = cleaned.slice(i, i + spec.count);
      let score = 0;
      let valid = true;
      for (const line of group) {
        const diff = Math.abs(line.length - spec.target);
        if (diff > 5) {
          valid = false;
          break;
        }
        score += diff;
      }
      if (!valid) continue;

      const first = group[0];
      const firstChar = first.charAt(0);
      if (!'PIAVC'.includes(firstChar) && firstChar < 'A') {
        // primeira linha de um MRZ sempre começa com uma letra de tipo
        score += 10;
      }

      if (score < bestScore) {
        bestScore = score;
        best = { format: spec.format, group, target: spec.target };
      }
    }
  }

  return best;
}

export function parseMrzLines(inputLines: string[]): ParsedMrz {
  const cleaned = inputLines
    .map((l) => normalizeMrzLine(l))
    .filter((l) => l.length > 0);

  const candidate = findBestGroup(cleaned);
  if (!candidate) {
    const message = cleaned.some((l) => l.length >= 20)
      ? 'Nenhuma sequência MRZ válida (30/36/44 colunas) foi identificada.'
      : 'Nenhuma linha legível foi encontrada. Aproxime a câmera ou use uma imagem com o documento bem iluminado.';
    return emptyResult(cleaned, [message]);
  }

  return parseLines(candidate.group, candidate.format);
}

export function parseMrzText(text: string): ParsedMrz {
  return parseMrzLines(text.split(/\r?\n/));
}

/* ===========================================================================
 * OCR via Tesseract.js (Web Worker)
 * ========================================================================== */

export interface MrzOcrResult {
  parsed: ParsedMrz;
  rawText: string;
  cleanedLines: string[];
}

type ProgressHandler = (p: MrzProgress) => void;

let workerPromise: Promise<any> | null = null;
let activeProgressHandler: ProgressHandler | null = null;

async function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (activeProgressHandler) {
            activeProgressHandler({
              status: m.status,
              progress: Math.max(0, Math.min(100, Math.round((m.progress ?? 0) * 100))),
            });
          }
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: MRZ_OCR_WHITELIST,
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      });
      return worker;
    })();
  }
  return workerPromise;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível decodificar a imagem enviada.'));
    };
    img.src = url;
  });
}

/**
 * Pré-processa a imagem para a OCR: redimensiona para ~1600–2200px no lado
 * maior, converte para tons de cinza e aplica binarização por limiar de Otsu
 * (com auto-inversão para fundo escuro).
 */
export async function prepareMrzCanvas(
  source: MrzSource,
): Promise<HTMLCanvasElement> {
  let width: number;
  let height: number;
  let img: HTMLImageElement | null = null;

  if (source instanceof File) {
    img = await loadImageElement(source);
    width = img.naturalWidth;
    height = img.naturalHeight;
  } else {
    width = source.width;
    height = source.height;
  }

  if (!width || !height) throw new Error('Imagem vazia — nada para analisar.');

  const longest = Math.max(width, height);
  let scale = 1;
  if (longest < 1600) scale = 1600 / longest;
  else if (longest > 2200) scale = 2200 / longest;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Seu navegador não suporta Canvas 2D.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  else ctx.drawImage(source as HTMLCanvasElement, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Histograma de luminância para Otsu
  const hist = new Uint32Array(256);
  let sumGray = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const g = Math.round(lum);
    hist[g]++;
    sumGray += g;
    count++;
  }
  const meanGray = count ? sumGray / count : 128;

  // Otsu
  let total = count;
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumGray - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  // Se a imagem é mais escura que clara, assume texto claro sobre fundo escuro.
  const invert = meanGray < 128;

  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const isDark = lum <= threshold;
    const value = invert === isDark ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Reconhece a zona MRZ de um arquivo de imagem ou de um canvas (câmera) e
 * devolve o resultado já interpretado pelo parser.
 */
export async function ocrAndParseMrz(
  source: MrzSource,
  onProgress?: ProgressHandler,
): Promise<MrzOcrResult> {
  activeProgressHandler = onProgress ?? null;

  const worker = await getWorker();
  try {
    const canvas = await prepareMrzCanvas(source);
    const { data } = await worker.recognize(canvas);
    const rawText: string = typeof data?.text === 'string' ? data.text : '';
    const cleanedLines = rawText
      .split(/\r?\n/)
      .map((l) => normalizeMrzLine(l))
      .filter((l) => l.length > 0);
    const parsed = parseMrzLines(cleanedLines);
    return { parsed, rawText, cleanedLines };
  } finally {
    activeProgressHandler = null;
  }
}

export const MRZ_STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Carregando motor de OCR',
  'initializing tesseract': 'Inicializando OCR',
  'loading language traineddata': 'Baixando modelo de idioma (1ª vez)',
  'recognizing text': 'Reconhecendo caracteres MRZ',
};
