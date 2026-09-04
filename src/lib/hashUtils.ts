export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

export const HASH_ALGORITHMS: { id: HashAlgorithm; label: string }[] = [
  { id: 'md5', label: 'MD5' },
  { id: 'sha1', label: 'SHA-1' },
  { id: 'sha256', label: 'SHA-256' },
  { id: 'sha512', label: 'SHA-512' },
];

const SUBTLE_NAME: Record<Exclude<HashAlgorithm, 'md5'>, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512',
};

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB por leitura

function readSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}".`));
    reader.readAsArrayBuffer(file.slice(start, end));
  });
}

/**
 * Lê o arquivo em blocos de 4 MiB via FileReader (sem travar a UI) e monta o
 * buffer completo. Um buffer final único é necessário para o
 * `crypto.subtle.digest` (que não é incremental); a leitura em chunks evita
 * picos de I/O e permite exibir progresso em arquivos grandes.
 */
export async function readWholeFile(
  file: File,
  onProgress?: (bytesDone: number, bytesTotal: number) => void,
): Promise<Uint8Array> {
  const total = file.size;
  const out = new Uint8Array(total);
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = new Uint8Array(await readSlice(file, offset, end));
    out.set(chunk, offset);
    offset = end;
    onProgress?.(offset, total);
    // cede à UI entre chunks para manter a página responsiva
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return out;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

const MD5_S = new Uint8Array(64);
{
  const shifts = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
  ];
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 16; i++) MD5_S[round * 16 + i] = shifts[round][i % 4];
  }
}

const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
}

/** MD5 em JS puro (RFC 1321), operando sobre bytes crus. */
export function md5Hex(bytes: Uint8Array): string {
  const n = bytes.length;
  const wordCount = ((n + 8) >> 6) + 1;
  const words = new Uint32Array(wordCount * 16);

  for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << ((i & 3) * 8);
  words[n >> 2] |= 0x80 << ((n & 3) * 8);
  words[wordCount * 16 - 2] = (n * 8) >>> 0;
  words[wordCount * 16 - 1] = Math.floor(n / 536870912) >>> 0;

  const rol = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let off = 0; off < words.length; off += 16) {
    const m = words.subarray(off, off + 16);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rol((a + f + MD5_K[i] + m[g]) >>> 0, MD5_S[i])) >>> 0;
      a = tmp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const state = [a0, b0, c0, d0];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 4; i++) out[s * 4 + i] = (state[s] >>> (i * 8)) & 0xff;
  }
  return toHex(out);
}

/** Calcula o hash de um buffer para o algoritmo informado. */
export async function digestHex(bytes: Uint8Array, algo: HashAlgorithm): Promise<string> {
  if (algo === 'md5') return md5Hex(bytes);
  const digest = await crypto.subtle.digest(SUBTLE_NAME[algo], bytes.buffer as ArrayBuffer);
  return toHex(new Uint8Array(digest));
}

/** Calcula todos os hashes de um arquivo lido em chunks. */
export async function hashFile(
  file: File,
  algorithms: HashAlgorithm[],
  onProgress?: (bytesDone: number, bytesTotal: number) => void,
): Promise<Record<HashAlgorithm, string>> {
  const bytes = await readWholeFile(file, onProgress);
  const results = {} as Record<HashAlgorithm, string>;
  for (const algo of algorithms) results[algo] = await digestHex(bytes, algo);
  return results;
}
