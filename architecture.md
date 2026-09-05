# Arquitetura Técnica — CofreUtil

## 1. Visão Geral da Stack
- **Framework Front-End:** Astro (Static Site Generation - SSG)
- **Estilização:** Tailwind CSS (Modo estrito sem bordas arredondadas)
- **Runtime Client-Side:** WebAssembly (WASM), Web Workers e Canvas API
- **Hospedagem:** Cloudflare Pages / Vercel (Exportação Estática)

## 2. Bibliotecas Client-Side (CDN)
Para manter o repositório leve e o build rápido, os binários pesados são carregados dinamicamente via CDN confiável:
- **Manipulação de PDF:** `pdf-lib` (Client-side PDF merging/compression)
- **Reconhecimento de Texto (OCR):** `tesseract.js` (Engine WASM para OCR)
- **Manipulação de Áudio:** `@ffmpeg/ffmpeg` (FFmpeg compilado em WebAssembly)
- **Código Pix:** `pix-payload-generator` (Algoritmo BR Code em JS puro)

## 3. Componente do Motor de Lote (`BatchLimiter.ts`)
Código TypeScript responsável pelo controle de limite local via `localStorage`:

```typescript
export class BatchLimiter {
  private static STORAGE_KEY = 'cofreutil_usage_count';
  private static MAX_FREE_BATCH = 3;

  static getUsageCount(): number {
    if (typeof window === 'undefined') return 0;
    const count = localStorage.getItem(this.STORAGE_KEY);
    return count ? parseInt(count, 10) : 0;
  }

  static incrementUsage(amount: number = 1): number {
    const current = this.getUsageCount();
    const updated = current + amount;
    localStorage.setItem(this.STORAGE_KEY, updated.toString());
    return updated;
  }

  static isLimitReached(): boolean {
    return this.getUsageCount() >= this.MAX_FREE_BATCH;
  }
}