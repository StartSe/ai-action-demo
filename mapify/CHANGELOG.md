# Changelog

## 1.4.1 — 2026-09-22

- Ação **Excluir** nos cartões da biblioteca, nas visualizações em grade e lista, inclusive no celular. A lista e os contadores são atualizados após a exclusão.
- Exclusão do editor movida para o cabeçalho, acessível sem abrir a estrutura lateral.
- Confirmação compartilhada com nome do mapa, aviso de remoção das edições e da conversa, opção de manter o mapa e estado de envio que impede cliques repetidos. Erros permanecem no diálogo para permitir nova tentativa.

## 1.4.0 — 2026-09-22

- Nível aprofundado organiza os temas e detalha cada ramo em uma chamada dedicada, sempre consultando a fonte integral, sem resumos intermediários que eliminem exemplos. Até 120 tópicos e 4 níveis abaixo do centro, conforme a riqueza da fonte.
- Instruções priorizam nomes específicos, ações, exemplos, mecanismos, resultados e ressalvas nos tópicos visíveis. A análise do vídeo preserva cada demonstração e distingue o que foi mostrado do que foi apenas afirmado.
- Cada folha aprofundada exige referência válida. Respostas excessivas, sem detalhes, interrompidas ou com erro não salvam mapas incompletos. Fontes curtas não precisam preencher uma quantidade mínima de tópicos.
- Feedback de leitura animado desde o envio até os primeiros ramos, com respeito a movimento reduzido. Progresso do aprofundamento mostra a quantidade real de ramos concluídos. A interface avisa sobre o tempo e as chamadas adicionais desse nível.
- Testes de contrato cobrem fonte longa integral, detalhes visíveis, referências, persistência, cancelamento e falha durante o aprofundamento. Validação visual em desktop e celular usa respostas simuladas.

## 1.3.0 — 2026-09-21

- Geração em canvas desde o envio, com thumbnail do YouTube no centro e ramificações surgindo conforme ChatGPT ou OpenRouter transmite a resposta. A thumbnail permanece no editor.
- Etapas reais de análise, organização, construção e revisão, com tempo decorrido, trechos recebidos, tópicos e histórico de atividade; removida a porcentagem estimada da interface.
- Leitura incremental da análise Gemini, sem expor etapas de raciocínio. Respostas incompletas ou interrompidas nunca são salvas como mapas concluídos.
- Prévia persistida, acompanhamento pela biblioteca, retomada após fechar/recarregar a página e cancelamento. Falhas preservam a prévia e oferecem ajuste da fonte.
- Ramos mantêm lado e cor durante a construção; enquadramento automático pode ser retomado após navegar no canvas. Layout responsivo e respeito à preferência por movimento reduzido.

## 1.2.1 — 2026-09-21

- Configuração do YouTube simplificada para vídeos públicos com Gemini; removidos o formulário OAuth e a seleção de modos. Configurações antigas de canal não alteram a importação.
- Aceita o formato Auth de chaves do AI Studio, incluindo ponto e credenciais maiores, sem truncamento.
- Valida chave e acesso ao modelo diretamente no Google antes de salvar, sem gerar conteúdo; preserva a chave anterior em caso de falha.
- Erro HTTP 402 passa a informar pagamento/créditos pendentes, sem confundir com chave inválida ou repetir a chamada.

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
