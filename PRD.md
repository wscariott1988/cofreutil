# Product Requirements Document (PRD) — CofreUtil

## 1. Visão Geral do Produto
- **Nome do Produto:** CofreUtil (`cofreutil.com.br`)
- **Proposta de Valor:** Microutilitários web de alta performance rodando 100% no navegador do cliente (Zero-Server / Client-Side).
- **Slogan:** "Processamento local. Privacidade de cofre."
- **Público-Alvo:** Profissionais B2B (advogados, contadores, médicos, devs) e usuários gerais que demandam velocidade e privacidade sob a LGPD.

## 2. Objetivos do Negócio & Monetização
- **Meta Financeira:** Alcançar de R$ 500,00 a US$ 500,00/mês em receita passiva.
- **Custo Operacional:** R$ 0,00 de infraestrutura (Hospedagem estática via Astro no Cloudflare Pages/Vercel).
- **Modelo de Receita:**
  - *Fase 1 (Lançamento):* Apoio voluntário via Pix e captação de tráfego orgânico (SEO de cauda longa).
  - *Fase 2 (Escala):* Anúncios programáticos (Google AdSense / Ezoic) e modal de bloqueio por lote (`BatchLimiter`) com chave freemium local.

## 3. Requisitos Funcionais
- **Processamento 100% Local:** Nenhum arquivo enviado para servidor remoto.
- **Grade do MVP (10 Ferramentas):**
  1. Juntar PDF
  2. Comprimir PDF
  3. Extrator de Texto de Imagem (OCR Local)
  4. Gerador de CPF / Validador de CNPJ
  5. Conversor de Imagem (PNG/JPG para WEBP)
  6. Conversor de Áudio (MP3/WAV)
  7. Gerador de QR Code Pix Seguro
  8. Gerador de Senhas Fortes
  9. Limpador de Metadados EXIF
  10. Formatador e Validador JSON

## 4. Requisitos Não-Funcionais
- **Design System:** Swiss Brutalism / Monocromático (Preto `#000000`, Zinc `#09090B`, Branco `#FFFFFF`). Zero cantos arredondados (`border-radius: 0`).
- **Performance:** Tempo de carregamento inicial (LCP) < 1.2s.
- **SEO/GEO:** Estrutura estática indexável com marcação `Schema.org` otimizada para buscadores e motores de IA.