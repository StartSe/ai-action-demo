# Changelog

## 1.2.0 — 2026-09-21

- O aplicativo passa a se chamar **Mapia**, com nova marca na navegação, login, título da página, versão, mensagens e exportações. Identificadores técnicos e dados existentes são preservados.
- Análise de vídeos públicos de qualquer canal pela API Gemini, recebendo o link como entrada de vídeo e produzindo notas com referências de tempo aproximadas.
- Configuração cifrada da chave em Configurações → YouTube, modelo ajustável, teste de vídeo com prévia e seleção explícita entre Gemini, OAuth e legendas públicas experimentais.
- Gemini passa a ser o modo selecionado ao salvar a chave, mesmo com OAuth conectado. Erros não causam troca silenciosa de provedor.
- Fonte, exportação e contexto da IA distinguem análise gerada de transcrição literal. Validação de tempos e respostas incompletas, limites de tamanho, cancelamento e erros específicos de chave, cota e modelo.

## 1.1.0 — 2026-09-21

- Configurações com seção YouTube: cadastro do cliente Google, URL de retorno copiável, autorização OAuth, verificação do canal e desconexão.
- Importação de legendas pela API oficial para vídeos que a conta conectada pode editar, com timestamps e mensagens específicas de cota, autorização e permissão.
- Renovação de tokens, armazenamento cifrado, PKCE e proteção de retorno por estado de uso único vinculado ao navegador. A leitura pública permanece disponível sem conexão Google.

## 1.0.3 — 2026-09-21

- Versão do app visível no header da biblioteca e do editor de mapas, inclusive no celular.
- O indicador da interface e `/api/health` leem a versão de `package.json`, evitando divergências entre a tela e o diagnóstico da instalação.

## 1.0.2 — 2026-09-21

- Registrada a validação do vídeo `1QNsdr-Qx_I` com a biblioteca não oficial `youtube-transcript-api`: extração local bem-sucedida, com 1.949 caracteres agrupados em três trechos; consulta pelo Render bloqueada pelo YouTube.
- Esclarecido no README que a API oficial de legendas exige uma conta autorizada a editar o vídeo e não substitui o extrator para vídeos de outros canais.
- Atualizados versão do pacote, endpoint de saúde e catálogo. Esta versão mantém o diagnóstico da 1.0.1; não remove o bloqueio do YouTube ao servidor.

## 1.0.1 — 2026-09-21

- A importação do YouTube informa a causa da falha: bloqueio do servidor, legendas ausentes, vídeo restrito, verificação adicional, timeout, proxy ou instalação incompleta. Erros internos deixam de aparecer como ausência de transcrição.
- O ambiente Python local `.venv` é detectado automaticamente. `npm run setup:youtube` instala a dependência e `npm run check:youtube -- URL` verifica a extração sem consumir IA.
- A consulta tem limites de tempo por requisição, valida a resposta e preserva o cancelamento. Mensagens não expõem credenciais do proxy nem detalhes do subprocesso.
- Documentado que legendas públicas podem ser bloqueadas em servidores como o Render. A configuração `YOUTUBE_PROXY_URL` continua necessária quando o IP do serviço é bloqueado; esta versão não remove bloqueios do YouTube.

## 1.0.0 — 2026-09-21

- Primeira versão: mapas mentais editáveis com ChatGPT ou OpenRouter, fontes YouTube/PDF/web/texto, conversa com referências e exportação.
