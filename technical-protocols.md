# Protocolos Técnicos de Baixo Nível — CofreUtil

## 1. Manipulação de Buffers (`pdf-lib`)
Operações com arquivos usam estritamente `Uint8Array` e `ArrayBuffer` nativos. É proibido converter PDFs para strings temporárias (Base64/UTF-8) para evitar vazamento em memória RAM.

```typescript
export async function mergePDFBuffers(files: File[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const mergedDoc = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((page) => mergedDoc.addPage(page));
  }

  return await mergedDoc.save();
}

2. Derivação de Chave Local Criptográfica (PBKDF2)
Validação de licenças ou chaves sem enviar dados a servidores via Web Crypto API nativa:

TypeScript
export async function deriveLocalKey(passphrase: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
3. Gerador Offline de PIX BR Code (Padrão BACEN / EMVCo)
Algoritmo estático e determinístico com cálculo de CRC16-CCITT local:

TypeScript
function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixPayload(key: string, name: string, city: string, amount?: string): string {
  const formatField = (id: string, value: string) => 
    `${id}${value.length.toString().padStart(2, '0')}${value}`;

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
4. Sanitização de Metadados EXIF via Canvas API
A reconstrução da imagem descarta o cabeçalho original com geolocalização e metadados de câmera:

TypeScript
export async function stripExifMetadata(imageFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas Context Error');
      
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('Blob Creation Failed');
      }, imageFile.type, 0.95);
    };

    img.src = url;
  });
}
5. Protocolo de Descarte de Memória RAM (URL.revokeObjectURL)  
Padrão obrigatório para liberação de memória após o acionamento do download:  

TypeScript
export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Liberação imediata da memória RAM do navegador
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}