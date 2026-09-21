# Changelog

## 1.0.1 — 2026-09-21

- A importação do YouTube informa a causa da falha: bloqueio do servidor, legendas ausentes, vídeo restrito, verificação adicional, timeout, proxy ou instalação incompleta. Erros internos deixam de aparecer como ausência de transcrição.
- O ambiente Python local `.venv` é detectado automaticamente. `npm run setup:youtube` instala a dependência e `npm run check:youtube -- URL` verifica a extração sem consumir IA.
- A consulta tem limites de tempo por requisição, valida a resposta e preserva o cancelamento. Mensagens não expõem credenciais do proxy nem detalhes do subprocesso.
- Documentado que legendas públicas podem ser bloqueadas em servidores como o Render. A configuração `YOUTUBE_PROXY_URL` continua necessária quando o IP do serviço é bloqueado; esta versão não remove bloqueios do YouTube.

## 1.0.0 — 2026-09-21

- Primeira versão: mapas mentais editáveis com ChatGPT ou OpenRouter, fontes YouTube/PDF/web/texto, conversa com referências e exportação.
