# CofreUtil — [C] cofreutil.com.br

> Processamento local. Privacidade de cofre.

Portal web de alta performance com microutilitários de alta demanda que rodam 100% no navegador do cliente (Client-Side). Zero upload para servidores, custo de infraestrutura de R$ 0,00 e conformidade nativa com a LGPD.

## 🛠️ Stack Tecnológica
- **Framework:** Next.js (Exportação Estática `output: 'export'`) / Astro
- **Estilização:** Tailwind CSS (Estética Swiss Brutalism / Mono)
- **Componentes:** Shadcn/UI (Customizado com `border-radius: 0`)
- **Processamento Local:** WebAssembly, Web Workers, Canvas API, Web Crypto API, Tesseract.js, FFmpeg.wasm, pdf-lib.

## 📂 Documentação do Projeto
A documentação completa para suporte à IDE e NotebookLM encontra-se na pasta `/docs`:
- `PRD.md`: Documento de Requisitos de Produto e Metas do Negócio.
- `architecture.md`: Arquitetura estática e Motor de Controle de Lote Local (`BatchLimiter`).
- `PROJECT-CONTEXT.md`: Identidade visual, diretrizes de marca e posicionamento.
- `tools/`: Especificação técnica individual de cada uma das 10 ferramentas do MVP.

## 🚀 Como Executar Localmente
```bash
# Instalar dependências
npm install

# Executar ambiente de desenvolvimento
npm run dev

# Gerar build estática para produção
npm run build