# Contexto do Projeto: CofreUtil (cofreutil.com.br)

## 1. Visão Geral
Portal de microutilitários de alta demanda focados em privacidade total (LGPD por design), custo zero de infraestrutura e receita passiva via anúncios programáticos e modelo freemium local.

## 2. Identidade Visual & Branding (Swiss Brutalism / Mono)
- **Nome:** CofreUtil (`cofreutil.com.br`)
- **Slogan:** "Processamento local. Privacidade de cofre."
- **Posicionamento Institucional:** "Utilitários web 100% locais. Seus arquivos nunca saem da sua máquina."
- **Diretriz de Design:** Zero cantos arredondados ( border-radius: 0 ), bordas de 1px bem definidas, estética de terminal técnico sem elementos gráficos complexos ou gerados por IA.
- **Paleta de Cores Monocromática:**
  - Fundo Absoluto (Background): `#000000`
  - Superfícies de Cards/Caixas: `#09090B`
  - Bordas Finas: `#27272A` (1px solid)
  - Texto Principal: `#FFFFFF`
  - Texto Secundário: `#A1A1AA`
- **Tipografia:** 
  - Primária (Leitura): Geist Sans / Inter
  - Secundária (Técnica e Logo): Geist Mono / JetBrains Mono
- **Logo:** Tipografia pura usando colchetes de código e texto: `[C] CofreUtil`

## 3. Diretrizes Técnicas
- **Arquitetura:** 100% Client-Side / WebAssembly / Web Workers / Canvas API.
- **Hospedagem:** Estática (Vercel / Netlify / GitHub Pages) — Custo R$ 0,00.
- **Regra Freemium Local:** Máximo de 3 arquivos por lote no navegador via `BatchLimiter` (`localStorage`).
- **SEO/GEO:** Otimizado para buscas de cauda longa (LGPD / sem servidor) e citação por IAs via Schema.org.