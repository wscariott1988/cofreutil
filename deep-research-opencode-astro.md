# Integração: NotebookLM + OpenCode/Antigravity + Astro/WASM

## 1. Diretrizes de Comunicação para a IDE (OpenCode / Antigravity)
- **Modularização Extrema:** O OpenCode trabalha melhor com arquivos pequenos e focados. Ao planejar o código, divida a interface em micro-componentes lógicos. Nunca gere um arquivo `.astro` ou `.tsx` com mais de 300 linhas.
- **Instruções Step-by-Step:** Ao sugerir código, forneça o caminho exato do arquivo (ex: `src/components/ui/Button.astro`) e o bloco de código exato para substituir ou criar.
- **Contexto Blindado:** O OpenCode lerá o `.opencoderules` raiz. Garanta que qualquer código gerado respeite a regra do "border-radius: 0" e paleta monocromática.

## 2. Lidando com WebAssembly (WASM) no Astro / Vite
- **Desafio Comum:** Importar `.wasm` diretamente no código frequentemente causa erro no build estático do Vite/Astro, pois ele tenta resolver o binário no backend.
- **A Solução (Arquitetura CofreUtil):** 
  1. Para bibliotecas como `pdf-lib` (que são em JS puro), a importação padrão via NPM funciona perfeitamente.
  2. Para binários pesados (Tesseract, FFmpeg), a melhor prática em Astro estático é carregar os scripts via `<script src="CDN">` no cabeçalho ou usar carregamento dinâmico em um Web Worker apontando para uma URL pública (`/public/wasm/arquivo.wasm`), fugindo do *bundler* do Vite.
- **Exclusão de SSR:** Todo o processamento dos arquivos ocorre *após* a página carregar. No Astro, qualquer componente React/Solid que interaja com o DOM do navegador ou execute o WASM deve usar a diretiva `client:load` ou `client:only="react"`.