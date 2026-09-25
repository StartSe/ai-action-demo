# Notas de versão

## 0.1.0 — 2026-09-25

- Entrada na suíte IA para Executivos a partir de `StartSe/toolkit-sarah-voice-sdr` (commit `e08c2df`, ver `ORIGEM.md`).
- Publicação por imagem `ghcr.io/startse/voice-sdr`: `Dockerfile` que constrói o workspace `app` e `server.mjs` que serve a tela com `/api/health`, `/api/status`, fallback para o `index.html` nas rotas do app e cache longo nos arquivos com hash.
- Blueprint gerado pelo catálogo da suíte, plano gratuito e sem disco: o banco e as funções continuam no Supabase de cada cliente, instalados pelo painel da StartSe.

Validação: build do workspace `app` só com as dependências dele (como o `Dockerfile` faz), servidor conferido por `curl` e por `testes/estatica/imagem-da-suite.test.ts`. A imagem não foi construída localmente; quem constrói é o GitHub Actions.
