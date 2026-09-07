export interface TechnicalReference {
  institution: string;
  title: string;
  url: string;
  note: string;
}

export const referencesBySlug: Record<string, TechnicalReference[]> = {
  'seguranca-e-arquitetura': [
    {
      institution: 'Planalto — Presidência da República',
      title: 'Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD)',
      url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
      note: 'Texto oficial da LGPD, incluindo os artigos 6º, 46 e 48 citados nesta página.',
    },
    {
      institution: 'Autoridade Nacional de Proteção de Dados (ANPD)',
      title: 'Governança da ANPD e orientações sobre a LGPD',
      url: 'https://www.gov.br/anpd/pt-br',
      note: 'Órgão regulador responsável pela fiscalização da LGPD.',
    },
    {
      institution: 'W3C',
      title: 'WebAssembly Core Specification',
      url: 'https://www.w3.org/TR/wasm-core-1/',
      note: 'Especificação da máquina virtual WebAssembly, incluindo a memória linear isolada usada pelas ferramentas.',
    },
    {
      institution: 'Cloudflare',
      title: 'Cloudflare Web Analytics — detalhes e FAQ oficial',
      url: 'https://developers.cloudflare.com/web-analytics/about/',
      note: 'Documentação oficial do recurso de analytics utilizado, incluindo política de cookies.',
    },
    {
      institution: 'Mozilla',
      title: 'MDN — Web Workers API',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API',
      note: 'Documentação do isolamento de execução das Web Workers utilizadas no processamento local.',
    },
  ],
  'gerador-qr-code-pix': [
    {
      institution: 'Banco Central do Brasil',
      title: 'Pix — Manual de Padrões para Iniciação do Pix (BR Code)',
      url: 'https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf',
      note: 'Define a estrutura de campos do payload Pix (BR Code), incluindo domínio de dados específicos por tipo de chave.',
    },
    {
      institution: 'Banco Central do Brasil',
      title: 'Pix — Visão geral do arranjo',
      url: 'https://www.bcb.gov.br/estabilidadefinanceira/pix',
      note: 'Página oficial do arranjo Pix com referência regulatória e documentação do padrão BR Code.',
    },
    {
      institution: 'EMVCo',
      title: 'EMV QR Code Specification for Payment Systems',
      url: 'https://www.emvco.com/emv-technologies/qrcodes/',
      note: 'Especificação de referência dos QR Codes para pagamento sobre a qual o BR Code é construído.',
    },
  ],
  'gerador-senhas': [
    {
      institution: 'MDN Web Docs (Mozilla)',
      title: 'Crypto — getRandomValues()',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues',
      note: 'Fonte de aleatoriedade criptograficamente segura usada para gerar senhas, conforme a especificação Web Crypto.'
    },
  ],
  'calculadora-hash': [
    {
      institution: 'NIST',
      title: 'Hash Functions (família SHA-2)',
      url: 'https://csrc.nist.gov/projects/hash-functions',
      note: 'Especificação das funções de hash SHA-2 (SHA-256, SHA-512) utilizadas pelo crypto.subtle do navegador.',
    },
    {
      institution: 'MDN Web Docs (Mozilla)',
      title: 'SubtleCrypto.digest()',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest',
      note: 'Documentação da API nativa do navegador responsável pela digestão SHA-1/SHA-256/SHA-384/SHA-512.',
    },
  ],
  'conversor-csv-json': [
    {
      institution: 'RFC Editor',
      title: 'RFC 4180 — Common Format and MIME Type for CSV Files',
      url: 'https://www.rfc-editor.org/rfc/rfc4180',
      note: 'Especificação de referência do formato CSV (delimitadores, aspas e finais de linha) adotada no conversor.',
    },
    {
      institution: 'RFC Editor',
      title: 'RFC 8259 — The JavaScript Object Notation (JSON) Data Interchange Format',
      url: 'https://www.rfc-editor.org/rfc/rfc8259',
      note: 'Especificação padrão do formato JSON usada na conversão para o lado JSON.',
    },
  ],
  'formatador-json': [
    {
      institution: 'RFC Editor',
      title: 'RFC 8259 — The JavaScript Object Notation (JSON) Data Interchange Format',
      url: 'https://www.rfc-editor.org/rfc/rfc8259',
      note: 'Define a sintaxe e as regras de validação do JSON aplicadas pela ferramenta.',
    },
  ],
  'gerador-link-whatsapp': [
    {
      institution: 'WhatsApp Help Center (Meta)',
      title: 'How to use click to chat (formato wa.me)',
      url: 'https://faq.whatsapp.com/5913398998672934',
      note: 'Documentação oficial do formato https://wa.me/<número> e do parâmetro text para mensagem pré-preenchida.',
    },
  ],
  'leitor-qr-code': [
    {
      institution: 'ISO',
      title: 'ISO/IEC 18004 — Information technology: QR Code bar code symbology specification',
      url: 'https://www.iso.org/standard/62021.html',
      note: 'Especificação internacional do símbolo QR Code.',
    },
    {
      institution: 'jsQR (mantenedor)',
      title: 'jsQR — repositório oficial da biblioteca de leitura',
      url: 'https://github.com/cozmo/jsQR',
      note: 'Biblioteca open-source de decodificação de QR Codes executada localmente no navegador.',
    },
  ],
  'leitor-mrz-passaporte': [
    {
      institution: 'ICAO',
      title: 'Doc 9303 — Machine Readable Travel Documents (página oficial)',
      url: 'https://www.icao.int/publications/DocSeries/doc-9303',
      note: 'Especificação oficial da OACI para documentos de viagem legíveis por máquina, incluindo a zona MRZ.',
    },
    {
      institution: 'ICAO',
      title: 'Doc 9303, Parte 3 — Specifications Common to all MRTDs (8ª edição, 2021)',
      url: 'https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf',
      note: 'Define a estrutura das linhas MRZ (TD1, TD2 e TD3) e o cálculo dos dígitos de controle.',
    },
  ],
  'extrair-texto-imagem': [
    {
      institution: 'Tesseract.js (mantenedor)',
      title: 'Tesseract.js — repositório oficial',
      url: 'https://github.com/naptha/tesseract.js',
      note: 'Motor OCR open-source compilado para WebAssembly e executado no navegador.',
    },
    {
      institution: 'Tesseract OCR',
      title: 'Tesseract — repositório oficial do motor',
      url: 'https://github.com/tesseract-ocr/tesseract',
      note: 'Projeto original de OCR open-source que origina o Tesseract.js.',
    },
  ],
  'juntar-pdf': [
    {
      institution: 'pdf-lib (mantenedor)',
      title: 'pdf-lib — documentação oficial',
      url: 'https://pdf-lib.js.org/',
      note: 'Biblioteca utilizada para mesclar PDFs inteiramente no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF publicada pelo desenvolvedor do formato.',
    },
  ],
  'dividir-pdf': [
    {
      institution: 'pdf-lib (mantenedor)',
      title: 'pdf-lib — documentação oficial',
      url: 'https://pdf-lib.js.org/',
      note: 'Biblioteca utilizada para extrair páginas e dividir PDFs no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF publicada pelo desenvolvedor do formato.',
    },
  ],
  'comprimir-pdf': [
    {
      institution: 'pdf-lib (mantenedor)',
      title: 'pdf-lib — documentação oficial',
      url: 'https://pdf-lib.js.org/',
      note: 'Biblioteca utilizada para recondicionar e reduzir o tamanho de PDFs no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF publicada pelo desenvolvedor do formato.',
    },
  ],
  'imagem-para-pdf': [
    {
      institution: 'pdf-lib (mantenedor)',
      title: 'pdf-lib — documentação oficial',
      url: 'https://pdf-lib.js.org/',
      note: 'Biblioteca utilizada para incorporar imagens e gerar o PDF no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF publicada pelo desenvolvedor do formato.',
    },
  ],
  'pdf-para-imagem': [
    {
      institution: 'Mozilla',
      title: 'PDF.js — documentação oficial',
      url: 'https://mozilla.github.io/pdf.js/',
      note: 'Biblioteca oficial da Mozilla usada para renderizar páginas de PDF no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF publicada pelo desenvolvedor do formato.',
    },
  ],
  'sanitizador-pdf': [
    {
      institution: 'pdf-lib (mantenedor)',
      title: 'pdf-lib — documentação oficial',
      url: 'https://pdf-lib.js.org/',
      note: 'Biblioteca utilizada para remover metadados e reescrever o PDF no navegador.',
    },
    {
      institution: 'Adobe',
      title: 'PDF Technology — documentação das normas PDF',
      url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/',
      note: 'Especificação de referência do formato PDF, incluindo a estrutura de metadados (XMP).',
    },
  ],
  'conversor-de-imagem': [
    {
      institution: 'W3C',
      title: 'PNG — Portable Network Graphics specification (3rd edition)',
      url: 'https://www.w3.org/TR/png-3/',
      note: 'Especificação oficial do formato PNG.',
    },
    {
      institution: 'Google',
      title: 'WebP — codec e documentação oficial',
      url: 'https://developers.google.com/speed/webp',
      note: 'Documentação oficial do formato WebP (perdas e lossless).',
    },
    {
      institution: 'JPEG',
      title: 'JPEG — grupo oficial de manutenção do formato',
      url: 'https://jpeg.org/',
      note: 'Informações oficiais do formato JPEG e seus padrões.',
    },
  ],
  'limpador-de-metadados-exif': [
    {
      institution: 'CIPA (Japan Electronics and Information Technology Industries Association)',
      title: 'EXIF 2.32 — Exchangeable image file format for digital still cameras (DC-008)',
      url: 'https://www.cipa.jp/std/documents/e/DC-008-Translation-2019-E.pdf',
      note: 'Especificação oficial dos metadados EXIF, incluindo tags de câmera e GPS removidas pela ferramenta.',
    },
    {
      institution: 'W3C',
      title: 'PNG — Portable Network Graphics specification (3rd edition)',
      url: 'https://www.w3.org/TR/png-3/',
      note: 'Especificação oficial do formato PNG, incluindo os blocos de metadados tratados na limpeza.',
    },
  ],
  'conversor-de-audio': [
    {
      institution: 'FFmpeg',
      title: 'FFmpeg — Documentação oficial',
      url: 'https://ffmpeg.org/documentation.html',
      note: 'Documentação dos filtros e formatos de áudio usados na conversão e no corte.',
    },
    {
      institution: 'ffmpeg.wasm (mantenedor)',
      title: 'ffmpeg.wasm — documentação técnica oficial',
      url: 'https://ffmpegwasm.netlify.app/docs/overview',
      note: 'Port oficial do FFmpeg para WebAssembly usado para executar a conversão no navegador.',
    },
    {
      institution: 'Xiph.Org Foundation',
      title: 'Vorbis I specification',
      url: 'https://xiph.org/vorbis/doc/Vorbis_I_spec.html',
      note: 'Especificação oficial do codec Ogg Vorbis usado na saída para este formato.',
    },
  ],
  'remover-silencio': [
    {
      institution: 'FFmpeg',
      title: 'FFmpeg Filters — filtro silencedetect',
      url: 'https://ffmpeg.org/ffmpeg-filters.html',
      note: 'Documentação do filtro silencedetect usado para detectar os intervalos de silêncio.',
    },
    {
      institution: 'FFmpeg',
      title: 'FFmpeg — Documentação oficial',
      url: 'https://ffmpeg.org/documentation.html',
      note: 'Documentação das opções de corte e concatenação lossless (-c copy).',
    },
    {
      institution: 'ffmpeg.wasm (mantenedor)',
      title: 'ffmpeg.wasm — documentação técnica oficial',
      url: 'https://ffmpegwasm.netlify.app/docs/overview',
      note: 'Port oficial do FFmpeg para WebAssembly usado para executar a detecção e a remoção no navegador.',
    },
  ],
};