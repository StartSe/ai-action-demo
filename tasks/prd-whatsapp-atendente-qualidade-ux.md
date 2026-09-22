# PRD: Atendente no WhatsApp — qualidade, resiliência, personalização do assistente e painel de atendimento (versão 0.3.0)

Data: 22/09/2026. Escopo: só `whatsapp-atendente/` (mais `catalogo.json` e, se necessário, `scripts/padrao-excecoes.json` e `scripts/jargao-excecoes.json` na raiz). Continua `tasks/prd-whatsapp-atendente-telas.md` (17/09/2026, 20 histórias concluídas, arquivada em `archive/2026-09-18-whatsapp-atendente-telas/`), que deu ao app as cinco telas de hoje. Inspirações analisadas em 22/09/2026: o modo simplificado de criação de agente do **Dify** (`dify-main/web/app/components/app/configuration/**`) e o painel de atendimento do **Chatwoot** com o fluxo IA ↔ humano do Captain (`chatwoot-develop/app/**`, `enterprise/**`).

## Introduction

O Atendente no WhatsApp já funciona: uma pessoa não técnica cria o atendente em três passos, conecta o número por QR Code, acompanha as conversas e intervém quando a IA passa a bola. O que falta agora é o que separa uma demonstração convincente de um produto que uma clínica, uma loja ou um escritório deixa ligado o dia inteiro sem medo:

1. **Resiliência no caminho crítico.** Hoje um cliente que manda áudio, foto ou documento fica sem resposta (a rota só registra no log); duas mensagens seguidas geram duas respostas desencontradas; um aviso reenviado pela z-api pode virar resposta duplicada; a pessoa pode assumir a conversa enquanto a IA ainda está escrevendo e a IA responde por cima; uma falha da IA deixa o cliente no vácuo; e a bolha mostra um tique só porque o app não sabe se a mensagem chegou.
2. **Personalização com apoio, não com formulário.** O passo 1 do Assistente é um formulário bem organizado, mas começa com marcadores `[ENTRE COLCHETES]` para preencher. O Dify mostra o caminho: a pessoa descreve o negócio em duas frases e a IA propõe a persona inteira (nome, tom, saudação, base estruturada, perguntas de exemplo), com "o que foi decidido" explicado em três linhas, versões para comparar e "Aplicar" explícito. As ferramentas do atendente (agenda, sistemas da empresa, pedir ajuda humana, coletar contato) não aparecem em lugar nenhum do Assistente: vivem em Configurações, longe de quem monta o atendente.
3. **Teste que explica.** O simulador mostra a resposta, mas não por quê: quais trechos da base ou de documentos foram usados, se alguma ferramenta foi chamada, por que transferiu, quanto demorou. Sem isso a pessoa corrige no escuro.
4. **Memória.** A IA lembra as últimas 20 mensagens da conversa e nada mais. Um cliente que volta na semana seguinte é um estranho; uma conversa longa perde o começo.
5. **Painel de gestão com o mínimo do Chatwoot.** O que o Chatwoot faz de melhor no fluxo bot ↔ humano cabe em poucas peças: um dono explícito por conversa que troca com um clique (e implicitamente quando a pessoa responde), motivo categorizado de transferência visível na conversa e nos relatórios, notas internas e eventos na própria linha do tempo, respostas rápidas, etiquetas, alerta de quem está esperando há muito tempo, status de entrega com transição só para a frente e atualização em tempo real. Tudo o que pressupõe equipe (times, SLA, snooze, prioridade, menções, macros, multi-caixa) fica de fora.

O app continua com as mesmas cinco telas e o mesmo público. Nenhuma tela nova; cada história melhora uma tela que já existe.

### Decisões tomadas em 22/09/2026 (Rafael)

- **D1. Memória:** memória por contato **e** refinamento da janela. Além das 20 mensagens, o atendente guarda por cliente um texto curto de fatos úteis (nome informado, preferências, último assunto, pendências) e o reaproveita quando o cliente volta; conversas longas ganham um resumo do começo. O que a IA lembra é visível e editável no painel do contato ("O que o atendente lembra"). Nenhum parâmetro técnico de memória (janela, tokens) é exposto, como no Dify simplificado.
- **D2. Persona:** gerar com IA a partir de um brief. A pessoa escreve duas ou três frases sobre o negócio (ou cola o endereço do site) e a IA propõe nome do atendente, objetivo, tom, saudação, base de conhecimento estruturada e perguntas de teste. Ela revisa e aplica. Sem questionário guiado nesta rodada.
- **D3. Teste:** o simulador continua e cada resposta ganha "Por que respondeu assim" (fontes usadas, ferramenta chamada, motivo da transferência, tempo e modelo), mais cenários de teste sugeridos por objetivo. Sem conjunto de testes salvo e sem comparação lado a lado de versões ou modelos nesta rodada.
- **D4. Painel:** entram notas internas e respostas rápidas; mensagens de áudio, imagem e documento; etiquetas e avisos de espera; atualização em tempo real por eventos do servidor (SSE), com o polling atual como reserva.
- **D5. Ferramentas do atendente** aparecem no Assistente como cartões com interruptor (Pedir ajuda de uma pessoa, sempre ligado; Coletar contato; Consultar agenda; Consultar sistemas da empresa), no espírito da seção "Tools" do Dify. Quem precisa de conexão aponta para Configurações. A transferência para humano ganha **motivo categorizado**, como a ferramenta `handoff` do Captain, mas implementada por marcador no texto (`[TRANSFERIR:motivo]`) para continuar funcionando nos modelos gratuitos sem suporte a chamada de ferramentas.
- **D6. Dono da conversa.** Copiamos a mecânica do Chatwoot, não a ergonomia: a conversa tem um dono (IA ou Você), trocado por um seletor visível no cabeçalho da conversa e, implicitamente, quando a pessoa envia uma mensagem. O modelo de quatro status (`ia`, `atencao`, `humano`, `resolvida`) continua; o seletor é uma leitura dele.

### Premissas

- P1. `PADRAO.md` continua valendo: Next.js 16, Tailwind 4, React 19, `node:sqlite`, IA via OpenRouter, português sem jargão na tela (`scripts/verificar-jargao.mjs`), acento `#0e7c6a`, limites de "Menos texto na tela". O app é independente (camada de produto própria); a camada `INFRA` (`lib/ai.ts`, `lib/store.ts`, `lib/modelos.ts`, `lib/setup-comum.ts`, `proxy.ts`…) **não muda** nesta rodada. Tudo o que precisar de IA para áudio, geração de persona ou memória nasce em módulos próprios do app (`lib/midia.ts`, `lib/persona.ts`, `lib/memoria.ts`), chamando o OpenRouter diretamente quando `lib/ai.ts` não cobrir (mesmo padrão de `lib/documentos.ts` com embeddings).
- P2. Nenhuma dependência nova. Áudio, imagem e documento usam `fetch`, `unpdf` (já presente) e os modelos do OpenRouter. Sem biblioteca de SSE, de gráfico ou de player.
- P3. Tudo funciona em **modo demonstração** (sem IA e sem número): a geração de persona cai em cinco exemplos prontos por segmento; a transcrição de áudio e a leitura de imagem caem em mensagens honestas ("não consegui ouvir"); as conversas de exemplo ganham eventos, uma nota interna, uma etiqueta, um áudio e uma imagem para as telas mostrarem tudo.
- P4. Formatos da z-api conferidos em 22/09/2026 em https://developer.z-api.io (índice `_llms/pt-br/api-reference.md`): `ReceivedCallback` traz `messageId`, `referenceMessageId`, `momment`, `isEdit`, `waitingMessage`, e um objeto por tipo (`image { imageUrl, thumbnailUrl, caption, mimeType, width, height, viewOnce }`, `audio { audioUrl, mimeType, seconds, ptt, viewOnce }`, `video { videoUrl, caption, mimeType, seconds }`, `document { documentUrl, fileName, mimeType, pageCount, title }`, `sticker { stickerUrl }`, `location { latitude, longitude, address }`, `contact { displayName, vCard, phones }`, `reaction { value, referencedMessage }`); `MessageStatusCallback { instanceId, ids, phone, status: SENT|RECEIVED|READ|READ_BY_ME|PLAYED, momment }`; `send-text` devolve `{ zaapId, messageId, id }` e aceita `delayTyping`; existem `send-audio`, `send-image`, `send-document/{extensão}` e `read-message`. **Os caminhos exatos dos endpoints de cadastro de webhook de status (e se `update-every-webhooks` cobre todos) são confirmados na documentação na hora de implementar (US-003)**, nunca assumidos daqui.
- P5. Entrada de áudio no OpenRouter (conferido em 22/09/2026 em https://openrouter.ai/docs/features/multimodal/audio): parte de conteúdo `{ type: "input_audio", input_audio: { data: <base64>, format: "ogg" | "mp3" | "wav" | ... } }`, sem URL direta; o modelo precisa aceitar áudio (exemplo da documentação: `google/gemini-2.5-flash`). A lista de modelos com áudio é conferida em openrouter.ai/models (filtro de modalidade de entrada) na US-006.
- P6. Textos de tela seguem os limites do `PADRAO.md` (título até 8 palavras, apoio até 20, uma linha de ajuda por campo) e nenhum usa webhook, token, API, instância, SSE, JSON, embedding, prompt ou modelo fora de "Opções avançadas"/"Para a equipe técnica".
- P7. Capturas de verificação em desktop 1400x1000 e celular 390, revisadas e corrigidas, em toda história com tela.
- P8. Um processo só por instância (Next standalone no Render com disco). Eventos em tempo real usam um emissor em memória; não há fila externa nem Redis. Se um dia houver mais de um processo, o polling de reserva continua funcionando.

## Goals

- Nenhuma mensagem de cliente fica sem resposta nem sem registro: áudio, imagem e documento aparecem na conversa e, com IA conectada, são entendidos; falha da IA vira transferência educada, não silêncio.
- Uma rajada de mensagens do cliente gera uma resposta só; um aviso reenviado nunca gera resposta duplicada; a IA nunca responde por cima de uma pessoa que acabou de assumir.
- Criar o atendente a partir de duas frases leva menos de dois minutos até o primeiro teste, e a pessoa entende o que a IA decidiu antes de aplicar.
- Cada resposta do simulador e da conversa aberta explica de onde veio, em uma frase expandível.
- O atendente reconhece um cliente que volta e não perde o começo de uma conversa longa; a pessoa vê e edita o que ele lembra.
- Quem opera o painel vê em tempo real quem está esperando, há quanto tempo e por quê a IA transferiu; assume, anota, responde com um atalho e devolve sem sair da conversa.
- Relatórios respondem "por que a IA precisou de gente?" com os motivos de transferência do período.

## User Stories

As histórias estão em ordem de implementação, agrupadas em fases. Cada uma cabe em uma sessão e termina com `npm run lint`, `npm run build` e, quando há tela, verificação no navegador (desktop 1400x1000 e celular 390, capturas abertas e corrigidas). Toda mudança de esquema segue o padrão de `lib/conversas.ts` (`CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` dentro de `try` para colunas novas).

### Fase 0: fundação de resiliência

### US-001: Mensagens únicas, rajadas agrupadas e guarda contra corrida
**Description:** As a cliente da empresa, I want que minhas mensagens seguidas recebam uma resposta só, e nunca duas iguais so that a conversa pareça com uma pessoa atenta, não com um robô que responde cada linha.

**Acceptance Criteria:**
- [ ] `mensagens` ganha a coluna `id_externo TEXT NULL` com índice único parcial (`WHERE id_externo IS NOT NULL`); `registrarMensagemCliente` aceita `idExterno` e **ignora silenciosamente** (devolve o registro atual, sem gravar nem responder) uma mensagem cujo `id_externo` já exista; a rota `app/webhook/zapi/route.ts` passa `aviso.messageId` e descarta avisos com `isEdit: true` ou `waitingMessage: true` (registrando no log)
- [ ] Novo `lib/rajada.ts`: `agendarResposta(numero, origem)` espera `JANELA_RAJADA_MS = 3000` desde a última mensagem do cliente daquele número antes de chamar a IA; uma mensagem nova dentro da janela reinicia a espera; quando a janela fecha, a IA responde à **sequência inteira** (o histórico já tem todas). A espera é por número, em memória (`Map` de temporizadores), e o webhook grava a mensagem na hora e devolve 200 antes da espera. O simulador (`POST /api/simular`) e o MCP **não** usam rajada (a resposta síncrona é o contrato deles)
- [ ] `responder()` ganha `lib/atendente.ts:podeResponder(numero, ultimaMensagemId)`: conferido **duas vezes**, antes de chamar a IA e imediatamente antes de gravar/enviar a resposta; devolve falso quando a conversa deixou de ser `ia`/`atencao` (alguém assumiu) ou quando chegou mensagem do cliente com id maior que a que originou a resposta (nesse caso a resposta é descartada e a rajada agenda de novo). O que foi descartado vai para o log com o motivo, nunca para o cliente
- [ ] `enviarTexto` (`lib/zapi.ts`) passa `delayTyping` proporcional ao tamanho da resposta (1 s a 3 s), para o cliente ver "digitando..." antes da resposta; `README.md` registra o comportamento em uma linha
- [ ] Teste com a z-api falsa (`http.createServer` local, técnica das US-005/006 da PRD anterior) e `curl` no standalone: três avisos em 1 s para o mesmo número geram **um** `send-text`; o mesmo aviso enviado duas vezes gera **uma** mensagem no banco; `POST /assumir` durante a janela de rajada impede a resposta da IA
- [ ] `CLAUDE.md` do app registra a janela de 3 s, o motivo (padrão do Captain de agrupar anexos e mensagens antes de responder) e por que simulador e MCP ficam de fora
- [ ] Lint e build passam

### US-002: Transferência com motivo, falha da IA sem silêncio e linha do tempo da conversa
**Description:** As a operador do atendimento, I want saber por que a IA me passou a conversa e ver na própria conversa quem fez o quê so that eu entenda a situação em dois segundos, sem procurar em outro lugar.

**Acceptance Criteria:**
- [ ] `lib/transferencia.ts` (arquivo folha, client-safe) define `MotivoTransferencia = "cliente_pediu" | "sem_informacao" | "fora_do_escopo" | "reclamacao" | "falha"` com `rotuloMotivo()` (Record completo: "O cliente pediu uma pessoa", "A base não tinha a informação", "Fora do que o atendente faz", "Reclamação ou insatisfação", "Falha ao responder") e `lerMotivo(texto)` que reconhece `[TRANSFERIR]` (sem motivo → `sem_informacao`) e `[TRANSFERIR:motivo]`
- [ ] `montarSystemPrompt()` troca a regra do marcador por: "termine a resposta com `[TRANSFERIR:motivo]` sozinho na última linha, escolhendo o motivo entre …", com uma linha explicando cada motivo; `responder()` lê o motivo com `lerMotivo`, remove o marcador da resposta e grava
- [ ] `conversas` ganha `motivo_transferencia TEXT NULL` e `esperando_desde TEXT NULL`: `registrarResposta({ transferir, motivo })` grava os dois ao mudar para `atencao`; `registrarMensagemCliente` grava `esperando_desde` quando a conversa está em `humano` e o campo está vazio; `registrarMensagemHumana`, `devolver` e `resolver` zeram `esperando_desde`; `devolver` também zera `motivo_transferencia`. `Conversa`/`ConversaCompleta` (`lib/types.ts`) expõem `motivoTransferencia` e `esperandoDesde`
- [ ] **Falha da IA não deixa o cliente no vácuo:** quando `perguntarComFerramentas` lança `ErroIA` (ou qualquer erro) numa conversa de `origem: "whatsapp"`, `responder()` grava e envia a frase de reserva `config.fraseFalha` (padrão "Um momento, vou chamar uma pessoa da equipe para te ajudar.") e transfere com motivo `falha`; o erro original vai para o log e para `registrarFalhaEnvio`. No simulador o erro continua aparecendo na bolha vermelha como hoje
- [ ] `PapelMensagem` ganha `"nota"` (nota interna, US-014) e `"evento"` (linha do tempo). `lib/conversas.ts:registrarEvento(numero, texto)` grava mensagens `evento`, chamadas por `assumir` ("Você assumiu a conversa"), `devolver` ("Conversa devolvida para {atendente}"), `resolver` ("Marcada como resolvida"), pela transferência ("{atendente} pediu ajuda de uma pessoa · {rótulo do motivo}") e pela reabertura automática de uma conversa resolvida ("Conversa reaberta pelo cliente"). Eventos e notas **nunca** entram em `historicoRecente()` (a IA não os vê), não contam em `nao_lidas`, não mudam `ultima_mensagem` e não são enviados a ninguém
- [ ] `components/ConversaAberta.tsx` desenha `evento` como uma linha centralizada, discreta (texto cinza pequeno com a hora), entre as bolhas; a faixa âmbar "Intervir na conversa" passa a dizer o motivo ("{atendente} passou esta conversa para uma pessoa · A base não tinha a informação")
- [ ] `lib/metricas.ts` mantém as definições atuais; `linhasParaExportar` ganha a coluna "Motivo da transferência"
- [ ] Testado por `curl` no standalone com IA falsa (`global.fetch` para `openrouter.ai`, técnica da US-074): resposta terminada em `[TRANSFERIR:cliente_pediu]` grava `atencao`, motivo e evento; IA devolvendo 500 grava a frase de reserva, `atencao` e motivo `falha`
- [ ] Lint e build passam; verificar no navegador (conversa com eventos e a faixa âmbar com motivo, desktop e celular)

### US-003: Status de entrega das mensagens enviadas
**Description:** As a operador do atendimento, I want ver se a mensagem que saiu pelo número da empresa foi entregue e lida so that eu não fique sem saber se o cliente recebeu.

**Acceptance Criteria:**
- [ ] `mensagens` ganha `status_entrega TEXT NULL` (`enviando` | `enviada` | `entregue` | `lida` | `falhou`) e `erro_envio TEXT NULL`; `MensagemDaConversa` expõe `statusEntrega` e `erroEnvio`
- [ ] `lib/whatsapp.ts:enviarMensagem` devolve `{ idExterno?: string }` (o `messageId` da z-api; `undefined` na Meta); quem envia (webhook, `POST /api/conversas/[numero]/mensagens`, rajada) grava `id_externo` e `status_entrega = "enviada"` na mensagem correspondente; falha de envio grava `falhou` e `erro_envio` com a frase de `ErroWhatsApp` (a marcação visual da bolha, hoje só em estado do React, passa a vir do banco)
- [ ] `app/webhook/zapi/route.ts` trata `MessageStatusCallback`: para cada id em `ids`, `lib/conversas.ts:atualizarEntrega(idExterno, status)` mapeia `SENT → enviada`, `RECEIVED → entregue`, `READ`/`PLAYED` → `lida` e só avança (**nunca** volta de `lida` para `entregue`, padrão `Messages::StatusUpdateService` do Chatwoot); `READ_BY_ME` é ignorado. Ids desconhecidos vão para o log em nível baixo
- [ ] `lib/zapi.ts:configurarWebhooks` passa a cadastrar também o aviso de status de mensagem; o caminho exato é conferido na documentação (P4) e registrado no `CLAUDE.md` com a data; `garantirWebhooks` recadastra quando a lista de avisos mudar (a chave `ZAPI_AVISOS_CADASTRADOS` passa a incluir a versão da lista)
- [ ] `components/ConversaAberta.tsx:MarcaEnvio` passa a desenhar: relógio (`enviando`), um tique (`enviada`), dois tiques cinza (`entregue`), dois tiques no acento (`lida`), e a bolha com borda vermelha + "Esta mensagem não chegou ao cliente" + botão "Tentar de novo" (`POST /api/conversas/[numero]/mensagens/[id]/reenviar`, que reenvia o mesmo texto e atualiza o status) para `falhou`. Mensagens antigas sem status continuam com um tique. Na Meta e nas conversas de teste, um tique sempre (o app não sabe mais que isso)
- [ ] Testado com a z-api falsa: `send-text` devolve `messageId`; um `MessageStatusCallback` com `READ` seguido de outro com `RECEIVED` deixa a mensagem em `lida`; falha de envio + "Tentar de novo" com a z-api voltando a responder deixa a mensagem `enviada`
- [ ] Lint e build passam; verificar no navegador (os cinco estados na bolha, desktop e celular)

### US-004: Atualização em tempo real
**Description:** As a operador do atendimento, I want que uma mensagem nova apareça na hora, sem esperar 10 segundos so that eu responda um cliente ansioso antes de ele mandar a segunda mensagem.

**Acceptance Criteria:**
- [ ] Novo `lib/eventos.ts`: emissor em memória (`EventEmitter` do Node) com `publicar(evento)` e `assinar(fn)`; eventos `{ tipo: "conversa", numero }` (mensagem nova, status, entrega, etiqueta, nota), `{ tipo: "conexao" }` (número conectou/desconectou) e `{ tipo: "atencao", numero }` (conversa acabou de precisar de uma pessoa). `lib/conversas.ts`, `lib/zapi.ts:gravarConexao` e a rajada publicam nos pontos de escrita; nenhuma tela publica nada
- [ ] Nova rota `GET /api/eventos` (privada, exige sessão como toda rota nova): `text/event-stream` com `ReadableStream`, um `: ping` a cada 25 s para atravessar o proxy do Render, encerramento limpo no `abort` da requisição, e sem cabeçalho de cache. `next.config.ts` não muda; a rota exporta `dynamic = "force-dynamic"`
- [ ] Novo `components/useEventos.ts`: hook `useEventos(onEvento)` com `EventSource`, reconexão com espera crescente (1 s, 2 s, 5 s, 10 s), e **reserva**: depois de três falhas seguidas, avisa o chamador para voltar ao polling (o intervalo de reserva sobe de 10 s para 30 s, para não somar carga); enquanto o fluxo está de pé, os temporizadores de 10 s de `ConversaAberta` e da lista **param**. Só conecta com a aba visível (`visibilitychange` fecha e reabre)
- [ ] `Conversas`, `ConversaAberta`, `Inicio` e `ConexaoWhatsApp` passam a recarregar no evento (a lista e a conversa aberta só quando o `numero` bate ou o evento é da lista); a conversa aberta recebe a mensagem nova rolando até o fim como hoje
- [ ] Indicador discreto no rodapé da lista de Conversas: "Atualizando em tempo real" (ponto verde) ou "Atualizando a cada 30 segundos" (ponto cinza) conforme o estado do fluxo; nenhum outro texto técnico
- [ ] Testado no standalone: `curl -N /api/eventos` recebe `: ping` e um `event: conversa` quando um aviso da z-api falsa chega; duas abas abertas recebem o mesmo evento; matar o servidor e subir de novo faz a tela reconectar sozinha (log do navegador sem erro não tratado)
- [ ] `CLAUDE.md` registra: por que SSE e não WebSocket (uma direção basta, sem dependência, atravessa o proxy), o `ping` de 25 s, a reserva de polling e a premissa P8
- [ ] Lint e build passam; verificar no navegador (mensagem nova aparecendo sem recarga, indicador nos dois estados)

### Fase 1: mensagens que não são texto

### US-005: Receber e mostrar áudio, imagem, documento e os demais tipos
**Description:** As a operador do atendimento, I want ver na conversa exatamente o que o cliente mandou, inclusive um áudio ou uma foto so that o painel nunca minta sobre a conversa.

**Acceptance Criteria:**
- [ ] Nova tabela `anexos` em `lib/anexos.ts` (mesmo `app.sqlite`): `id` (hex aleatório), `mensagem_id`, `tipo` (`audio` | `imagem` | `video` | `documento` | `figurinha` | `localizacao` | `contato` | `outro`), `url_original`, `caminho_local TEXT NULL`, `mime`, `nome_arquivo`, `tamanho`, `segundos INTEGER NULL`, `legenda TEXT NULL`, `transcricao TEXT NULL` (US-006), `criado_em`. `MensagemDaConversa` ganha `anexos?: Anexo[]` (sem `caminho_local`)
- [ ] `app/webhook/zapi/route.ts` deixa de descartar mensagens sem `text.message`: para cada tipo de P4, grava uma mensagem `cliente` com texto derivado (`legenda` da imagem/vídeo/documento quando houver; "[Áudio de 12 s]", "[Imagem]", "[Documento: contrato.pdf]", "[Figurinha]", "[Localização: endereço]", "[Contato: nome]" quando não) e o anexo; `reaction` **não** vira mensagem (só log); `viewOnce` grava o anexo sem baixar e com texto "[Imagem de visualização única]"
- [ ] `lib/anexos.ts:baixar(anexo)` copia o arquivo para `DATA_DIR/anexos/<id>` em segundo plano (limite 16 MB por arquivo, 30 s de tempo, `mime` conferido pelo cabeçalho da resposta); falhou → fica só `url_original`. `GET /api/anexos/[id]` (privada) serve o arquivo local com `Content-Type`, `Content-Disposition: inline` e `Cache-Control: private, max-age=86400`, e redireciona para `url_original` quando não há cópia local. `apagarConversa` apaga os anexos e os arquivos; `README.md` explica que os anexos moram no disco de 1 GB e que o app não guarda nada além de 90 dias (limpeza em `instrumentation.ts`, no laço já existente)
- [ ] `components/ConversaAberta.tsx:Bolha` desenha: **áudio** com `<audio controls preload="none">` e a duração; **imagem** com miniatura (máximo 260 px, clicável para abrir em nova aba) e a legenda; **vídeo** com `<video controls preload="none">` e a legenda; **documento** como cartão com ícone, nome, páginas e "Abrir"; **figurinha** como imagem de 96 px; **localização** como cartão com o endereço e link para o mapa (`https://maps.google.com/?q=lat,long`); **contato** como cartão com nome e telefone formatado. O texto derivado entre colchetes **não** é desenhado quando o anexo é desenhado. A lista de Conversas mostra "🎤 Áudio (0:12)", "📷 Imagem", "📄 Documento" como prévia da última mensagem (função `previaMensagem` em `lib/rotulos.ts`)
- [ ] `lib/demo.ts:conversasExemplo()` ganha um áudio e uma imagem em duas conversas (arquivos pequenos em `public/exemplos/`, sem baixar nada): as telas mostram os dois tipos em modo demonstração
- [ ] Testado com a z-api falsa servindo um `.ogg` e um `.jpg`: os anexos aparecem na conversa, o arquivo é copiado para `DATA_DIR/anexos`, `GET /api/anexos/[id]` responde 200 com o `Content-Type` certo e 401 sem sessão; apagar a conversa apaga o arquivo
- [ ] Lint e build passam; verificar no navegador (uma conversa com os sete tipos, desktop e celular; `npm run lint` sem aviso novo de `img`)

### US-006: A IA entende áudio, imagem e documento
**Description:** As a cliente da empresa, I want mandar um áudio ou uma foto e ser respondido normalmente so that eu não precise digitar tudo para ser atendido.

**Acceptance Criteria:**
- [ ] Novo `lib/midia.ts` com `transcreverAudio(anexo)` (OpenRouter, parte `input_audio` em base64 no formato do `mime`, P5; modelo de `getConfig("MODELO_AUDIO")` com padrão definido em `lib/midia.ts` e conferido em openrouter.ai/models na implementação; 30 s de tempo; devolve texto ou `null`), `descreverImagem(anexo)` (usa `askVision` de `lib/ai.ts`, já existente, com um prompt que pede descrição objetiva do que interessa a um atendimento: produto, documento fotografado, texto legível) e `lerDocumento(anexo)` (`unpdf` para PDF e leitura direta para `text/*`, cortado em 6.000 caracteres; outros tipos devolvem `null`). O resultado é gravado em `anexos.transcricao`
- [ ] `Config` ganha `midia: { audio: boolean; imagem: boolean; documento: boolean }` (padrão tudo ligado; `migrarConfig` preenche) e `fraseSemMidia` (padrão "Ainda não consigo ouvir áudios nem abrir arquivos por aqui. Pode me escrever?"). A rajada, antes de chamar a IA, processa os anexos ligados das mensagens da sequência (em paralelo, com `Promise.allSettled`); a transcrição/descrição entra no histórico no lugar do texto derivado ("[Áudio transcrito] Oi, queria saber o preço da limpeza"). Anexo cujo processamento falhou ou está desligado: a IA recebe o texto derivado e a instrução de responder com `fraseSemMidia` **só se a sequência não tiver mais nada respondível**
- [ ] Sem IA conectada (`aiEnabled()` falso): nada é processado, `respostaLocal` recebe o texto derivado e uma mensagem de anexo puro recebe `fraseSemMidia`
- [ ] Cartão "Áudios, fotos e arquivos" no passo 1 do Assistente (seção Ferramentas, US-009) com os três interruptores e uma linha de ajuda ("Ouvir áudios usa o modelo de áudio e gasta créditos por minuto."); o campo "Modelo que ouve áudios" fica em "Opções avançadas" do cartão do OpenRouter **deste app** (`lib/integracoes.ts`, campo `MODELO_AUDIO`, `select` com as opções de `lib/midia.ts`; a integração `OPENROUTER` compartilhada não muda — o campo entra numa integração própria `MIDIA` listada em `SECUNDARIAS`, se `openrouter()` não aceitar campos extras)
- [ ] `ConversaAberta` mostra, abaixo de um áudio, "Transcrição: …" em texto pequeno (expansível quando maior que duas linhas) e, abaixo de uma imagem, "O atendente viu: …"; o "Por que respondeu assim" (US-010) referencia a transcrição
- [ ] Testado com IA falsa devolvendo uma transcrição e uma descrição: a resposta da IA usa o conteúdo; com o processamento desligado, o cliente recebe `fraseSemMidia`; sem chave, idem
- [ ] `CLAUDE.md` registra o formato `input_audio`, o modelo padrão escolhido e a data da conferência
- [ ] Lint e build passam; verificar no navegador (transcrição e descrição na bolha; interruptores no Assistente)

### Fase 2: Assistente com apoio da IA

### US-007: Gerar a persona a partir de um brief
**Description:** As a dona do negócio, I want descrever meu negócio em duas frases e receber o atendente pronto para revisar so that eu não comece com um formulário de marcadores para preencher.

**Acceptance Criteria:**
- [ ] Novo `lib/persona.ts:gerarPersona({ brief, site? })` → `PersonaGerada = { atendente, negocio, objetivo, objetivoTexto?, tom, tomTexto?, saudacao, baseConhecimento, perguntasSugeridas: string[3], decisoes: string[3] }` via `askJSON` com um prompt que: escreve tudo em português do Brasil; estrutura a base no formato de `lib/base-modelo.ts` do objetivo escolhido, **preenchendo o que o brief permite e mantendo `[MARCADORES]` só onde faltar dado** (nunca inventa preço, prazo ou endereço); escolhe o tom pelo brief; escreve a saudação em uma frase; propõe três perguntas que um cliente de verdade faria; e resume em três frases curtas o que decidiu e por quê (as `decisoes`, o "Optimization Note" do Dify traduzido para negócio: "Tom amigável porque você atende famílias", "Objetivo Agendamentos porque a clínica marca consultas", "Deixei o preço da limpeza em aberto: não estava no texto")
- [ ] `site` opcional: `lib/persona.ts:lerSite(url)` busca a página (10 s, 1 MB, só `http(s)`, recusa endereços internos/privados — `localhost`, `127.*`, `10.*`, `192.168.*`, `169.254.*`, `.local`), remove `script`/`style`/tags, corta em 20.000 caracteres e soma ao brief como "Texto do site"; falha vira aviso ("Não consegui ler o site. Gerei só com a sua descrição.") e a geração segue
- [ ] Sem IA conectada: `lib/persona-exemplos.ts` traz cinco personas completas (clínica odontológica, loja de roupas, imobiliária, escola de cursos, restaurante), e `gerarPersona` devolve a que melhor casa com o brief por palavras (padrão `classificarLocal`), com `decisoes` fixas dizendo que é um exemplo
- [ ] `POST /api/assistente/persona` `{ brief, site? }` valida (brief 20 a 1.000 caracteres, senão 400 com frase), chama `gerarPersona`, **não salva nada** e devolve a persona; erros de IA passam por `responderErro`
- [ ] Passo 1 do Assistente: acima do formulário, o cartão **"Comece descrevendo seu negócio"** com um `textarea` de três linhas (placeholder "Clínica odontológica em Curitiba, 3 dentistas, atendemos convênios e particular, agendamos por WhatsApp"), um campo opcional "Endereço do site", cinco chips de exemplo que preenchem o brief em um clique (os cinco segmentos de `persona-exemplos.ts`, padrão "Try it" do Dify) e o botão primário "Gerar meu atendente". Enquanto gera: `Loading` com etapas ("Lendo a descrição", "Escolhendo tom e objetivo", "Montando a base"). O cartão só aparece **recolhido** ("Gerar de novo com uma descrição") quando já existe configuração salva
- [ ] Resultado num painel lateral (`aside` no desktop, folha de baixo no celular): as três `decisoes` como lista, a prévia do `Celular` com a saudação gerada, os campos gerados em resumo (nome, objetivo, tom) e a base em `MaisDetalhes`; botões "Aplicar" (preenche o formulário; pede confirmação "Substituir o que já está preenchido?" quando a base atual não é um modelo intocado, `ehModeloDeBase`) e "Gerar de novo". Cada geração vira uma versão numerada guardada em `sessionStorage` (`persona-versoes`), com um seletor "Versão 2 · mais recente" para voltar às anteriores. **Aplicar não salva**: a pessoa revisa e clica em "Salvar e testar o atendente" como hoje
- [ ] Testado por `curl`: brief curto dá 400; brief válido sem chave devolve uma persona de exemplo; com IA falsa devolve o JSON aplicado no formulário
- [ ] Lint e build passam; verificar no navegador (cartão, geração, painel de resultado, versões, aplicar com confirmação; desktop e celular)

### US-008: Saudação, perguntas de teste e o passo 1 em seções
**Description:** As a dona do negócio, I want ver o passo Configurar organizado em blocos claros e definir como o atendente se apresenta so that eu encontre cada ajuste sem rolar um formulário comprido.

**Acceptance Criteria:**
- [ ] `Config` ganha `saudacao?: string` (até 240 caracteres) e `perguntasSugeridas?: string[]` (até 5, cada uma até 120 caracteres); `migrarConfig` deixa ausentes; `PUT /api/config` valida tamanhos (400 com frase). `saudacaoPadrao()` continua sendo a reserva quando `saudacao` está vazia
- [ ] A saudação entra no prompt como "Quando o cliente inicia a conversa (primeira mensagem dele ou primeira depois de resolvida), apresente-se assim: …" e é o que o `Celular` mostra em prévia e no passo 2 como primeira bolha
- [ ] `SUGESTOES` fixas saem: o passo 2 usa `config.perguntasSugeridas` quando existem e, senão, os cenários por objetivo (US-010); `configExemplo` ganha saudação e três perguntas
- [ ] O formulário do passo 1 passa a ser cinco seções em cartões separados, com título e uma frase de apoio cada, nesta ordem: **Quem é** (nome do atendente, nome da empresa, saudação com contador `n/240`), **O que ele faz** (os quatro cartões de objetivo, campo "Em uma linha…" quando Outro), **O que ele sabe** (base com contador, documentos com lista e `Dropzone`, e as "Respostas aprovadas pela equipe" que hoje moram no passo 2, com contagem no título), **Como ele fala** (os três cartões de tom, campo quando Personalizado), **Ferramentas** (US-009) e, por último, `MaisDetalhes titulo="Quando ele não souber responder"` com `naoSei`, horário, `fraseFalha` (US-002) e o limite de espera (US-017). A coluna direita mantém a prévia e a `Dica`, e ganha um índice fixo (`lg:sticky`) com as cinco seções como âncoras
- [ ] Barra inferior fixa "Alterações não salvas" **volta**, no padrão desta tela (não o `configRef` antigo): aparece quando o formulário difere do salvo, com "Descartar" (recarrega o salvo) e "Salvar e testar o atendente"; sair da página com alterações pede confirmação (`beforeunload`). O passo 2 continua testando só o que está salvo
- [ ] A prévia da coluna direita mostra a saudação digitada e, abaixo dela, a primeira pergunta sugerida como bolha do cliente
- [ ] Lint e build passam; verificar no navegador (cinco seções, índice, barra de alterações, prévia; desktop e celular; `/assistente#conhecimento` continua rolando até a base)

### US-009: Ferramentas do atendente
**Description:** As a dona do negócio, I want ligar e desligar o que o atendente pode fazer além de responder so that eu veja num lugar só do que ele é capaz e o que falta conectar.

**Acceptance Criteria:**
- [ ] `Config` ganha `ferramentas: { coletarContato: boolean; agenda: boolean; sistemas: boolean }` (padrão `coletarContato: false`, `agenda: true`, `sistemas: true`; `migrarConfig` preenche). "Pedir ajuda de uma pessoa" não tem interruptor: é sempre ligado
- [ ] Seção **Ferramentas** do passo 1: lista de cartões no padrão `FeatureCard` do Dify (ícone no acento suave, título, interruptor à direita, uma frase de apoio de altura fixa e, quando ligado, uma linha de estado): **Pedir ajuda de uma pessoa** (sem interruptor; estado "Sempre ligado · transfere com o motivo"), **Coletar contato** ("Pede nome e, se for transferir, e-mail ou telefone"; estado "Guardado em O que o atendente lembra"), **Consultar a agenda** (estado "Conectada" / "Falta conectar" com link "Conectar em Configurações" para `/setup#mcp-agenda`, lido de `GET /api/status` `integrations`), **Consultar sistemas da empresa** (idem, `/setup#mcp-empresa`), e **Áudios, fotos e arquivos** (US-006, três interruptores menores dentro do cartão). O interruptor de agenda/sistemas **desligado** faz `perguntarComFerramentas` não oferecer aquelas ferramentas, mesmo conectadas
- [ ] `coletarContato` ligado soma ao prompt: "No começo da conversa, se o cliente ainda não se apresentou, pergunte o nome dele de forma natural. Ao transferir para uma pessoa, peça um e-mail ou telefone para retorno." Os dados coletados são extraídos pela memória do contato (US-012); nenhuma ferramenta de chamada é necessária
- [ ] A regra de agenda do prompt (hoje fixa em `perguntarComFerramentas`) passa a depender do interruptor: desligado, a frase é "A agenda não está disponível…"
- [ ] O `Aviso` "Para consultar horários e marcar, conecte sua agenda" do objetivo Agendamentos sai do topo do formulário e vira a linha de estado do cartão da agenda
- [ ] Verificado por `curl`: com `agenda: false` e a agenda conectada, o `system` enviado à IA falsa não lista ferramentas de agenda
- [ ] Lint e build passam; verificar no navegador (cartões nos dois estados de conexão; desktop e celular)

### US-010: "Por que respondeu assim" e cenários de teste
**Description:** As a dona do negócio, I want entender de onde veio cada resposta do atendente so that eu corrija a base no lugar certo em vez de adivinhar.

**Acceptance Criteria:**
- [ ] `mensagens` ganha `detalhes TEXT NULL` (JSON) e `MensagemDaConversa` expõe `detalhes?: DetalhesResposta`, com `DetalhesResposta = { modelo: string; tempoMs: number; fontes: { tipo: "base" | "aprovada" | "documento" | "memoria" | "resumo"; nome: string; trecho: string }[]; ferramentas: { nome: string; ok: boolean; resumo: string }[]; transferencia?: { motivo: MotivoTransferencia }; midia?: ("transcricao" | "imagem" | "documento")[]; rajada: number }` em `lib/types.ts`
- [ ] `lib/documentos.ts` ganha `buscarTrechos(pergunta)` devolvendo os trechos estruturados (`{ nome, numero, texto, score }`); `buscarDocumentos` vira um invólucro dela. `responder()` monta `detalhes`: os trechos de documentos usados (texto cortado em 200 caracteres), "Base de conhecimento do Assistente" quando a base foi enviada (sempre), "Respostas aprovadas" quando alguma pergunta aprovada casou por palavras com a pergunta (`baseAprovadaRelevante`), memória e resumo quando entraram (US-011/012), as ferramentas chamadas com `ok` e um resumo de 80 caracteres do argumento, o modelo (`modelName()`), o tempo e quantas mensagens a rajada juntou. `perguntarComFerramentas` passa a devolver a lista de ferramentas usadas com sucesso/erro, não só a primeira. No caminho sem IA, `detalhes` registra `modelo: "sem IA (busca local)"` e o trecho da base escolhido por `respostaLocal`
- [ ] `Celular` (passo 2) e `ConversaAberta` mostram, abaixo de cada bolha da IA, o link "Por que respondeu assim" que expande um bloco compacto: uma linha por fonte (ícone, nome, trecho em itálico), uma por ferramenta ("Consultou a agenda · ok"), a transferência com o motivo, e uma linha final discreta "{tempo}s · {modelo}". Nada disso aparece em bolhas de cliente ou de pessoa. O "Consultado em {ferramenta}" atual é absorvido por este bloco
- [ ] Quando a fonte é um documento, o nome vem com um link "Ver documento" que abre `/assistente#conhecimento`; quando é "Base de conhecimento", o link "Editar base" faz o mesmo
- [ ] Novo `lib/cenarios.ts` (folha): seis cenários por objetivo, cada um `{ titulo, mensagem }` e cobrindo sempre um caso **fora do escopo** ("Vocês fazem entrega em Manaus?"), um **pedido de pessoa** ("Quero falar com alguém da equipe") e um **dado que costuma faltar** (preço, prazo, endereço). O cartão "O que testar" do passo 2 mostra as `perguntasSugeridas` da configuração (US-008) e, abaixo, "Cenários que valem testar" com os seis, agrupados por rótulo; o cenário fora do escopo e o de pedido de pessoa vêm marcados "deve transferir" e, depois de enviados, o cartão mostra "Transferiu com o motivo certo" ou "Não transferiu" conforme `detalhes.transferencia`
- [ ] Lint e build passam; verificar no navegador (bloco expandido no simulador e na conversa, cenários com a marcação; desktop e celular)

### Fase 3: memória

### US-011: Conversa longa sem perder o começo
**Description:** As a cliente da empresa, I want que o atendente lembre o que combinamos no começo de uma conversa longa so that eu não precise repetir o que já disse.

**Acceptance Criteria:**
- [ ] `conversas` ganha `resumo TEXT NULL` e `resumo_ate_id INTEGER NULL`. Novo `lib/memoria.ts:atualizarResumo(numero)`: quando a conversa tem mais de `MAX_HISTORICO` (20) mensagens de cliente/atendente/humano e há pelo menos 8 mensagens não resumidas, pede à IA (`askJSON`, `maxTokens: 300`) um resumo de até 600 caracteres em português das mensagens **anteriores** às últimas 12, mesclando com o resumo anterior; grava `resumo` e `resumo_ate_id`. Roda em segundo plano depois da resposta (padrão `classificarEmSegundoPlano`), nunca antes; falha só vai para o log. Sem IA, nada é resumido
- [ ] `responder()` monta o prompt com "Resumo do começo desta conversa: …" quando `resumo` existe, seguido das últimas 12 mensagens (em vez de 20) quando há resumo; `detalhes.fontes` registra `tipo: "resumo"`. Sem resumo, tudo como hoje
- [ ] `resolver()` e a reabertura de uma conversa resolvida **não** apagam o resumo; `apagarConversa` apaga
- [ ] `PainelContato` ganha, em `MaisDetalhes titulo="Resumo da conversa"`, o texto do resumo quando existe (leitura, sem edição)
- [ ] Testado por `curl` com IA falsa: 30 mensagens simuladas produzem `resumo` e `resumo_ate_id`; o `prompt` seguinte enviado à IA falsa contém o resumo e 12 mensagens
- [ ] Lint e build passam; verificar no navegador (bloco do resumo no painel)

### US-012: O que o atendente lembra de cada cliente
**Description:** As a dona do negócio, I want que o atendente reconheça um cliente que volta e que eu possa ver e corrigir o que ele lembra so that o atendimento pareça de alguém que conhece o cliente, sem guardar nada que não deveria.

**Acceptance Criteria:**
- [ ] Nova tabela `contatos` em `lib/memoria.ts`: `numero` (chave), `nome_informado TEXT NULL`, `email TEXT NULL`, `telefone_retorno TEXT NULL`, `memoria TEXT NOT NULL DEFAULT ''` (até 1.200 caracteres), `atualizado_em`, `atualizado_por` (`ia` | `pessoa`). `ConversaCompleta` ganha `contato: { nomeInformado, email, telefoneRetorno, memoria, atualizadoEm, atualizadoPor } | null`
- [ ] `atualizarMemoria(numero)`: em segundo plano, depois de cada resposta da IA numa conversa com pelo menos 4 mensagens do cliente desde a última atualização (ou quando a conversa é resolvida), pede à IA (`askJSON`, `maxTokens: 300`) até cinco fatos úteis para o próximo atendimento (nome como o cliente se apresentou, preferências, o que já comprou ou agendou, pendências, e-mail/telefone de retorno quando informados), **mesclados** com a memória atual; a instrução proíbe dados de saúde, documentos, senhas, cartão e opiniões sobre o cliente. Se `atualizado_por = "pessoa"` nos últimos 7 dias, a IA só **acrescenta**, nunca reescreve. Conversas `simulador`, `assistente-ia` e de exemplo ficam de fora. Sem IA, nada é gravado
- [ ] `responder()` soma ao prompt "O que você já sabe sobre este cliente (de conversas anteriores): …" quando a memória existe, e `detalhes.fontes` registra `tipo: "memoria"`. A saudação para um cliente com `nome_informado` usa o nome
- [ ] `PainelContato`: novo bloco **"O que o atendente lembra"** com o texto da memória (ou "Nada ainda. O atendente vai anotar o que for útil para o próximo atendimento."), a linha "Atualizado {há quanto tempo} pela IA / por você", o botão "Editar" que abre um `textarea` com contador `n/1200`, "Salvar" (`PUT /api/conversas/[numero]/contato` `{ memoria, nomeInformado?, email?, telefoneRetorno? }`, grava `atualizado_por = "pessoa"`) e o link "Apagar memória" com confirmação. As linhas Nome, E-mail e Telefone de retorno do painel passam a mostrar os dados do contato quando existem (Nome informado tem prioridade sobre o `senderName` do canal)
- [ ] `DELETE /api/conversas/[numero]` apaga o contato junto (o número é a chave dos dois)
- [ ] `lib/metricas.ts:linhasParaExportar` ganha as colunas "Nome informado", "E-mail" e "Telefone de retorno"
- [ ] `README.md` ganha a seção "O que o atendente guarda sobre cada cliente" (o que entra, o que nunca entra, como editar e apagar, onde fica)
- [ ] Testado por `curl` com IA falsa devolvendo fatos: a memória é gravada e aparece no `system` da chamada seguinte; editar pela rota marca `pessoa`; apagar zera
- [ ] Lint e build passam; verificar no navegador (bloco vazio, cheio, em edição; desktop e celular)

### Fase 4: painel de atendimento

### US-013: Quem atende: seletor no cabeçalho e assumir ao responder
**Description:** As a operador do atendimento, I want ver e trocar quem está cuidando da conversa em um clique, e assumir só de responder so that intervir seja tão natural quanto responder no celular.

**Acceptance Criteria:**
- [ ] Cabeçalho da conversa aberta ganha o seletor **"Quem atende"** com duas opções, `role="radiogroup"`: **{atendente}** (ícone do atendente; selecionada em `ia` e `atencao`, com o chip âmbar "precisa de você" em `atencao`) e **Você** (selecionada em `humano`). Clicar em Você chama `assumir`; clicar em {atendente} chama `devolver` (com confirmação de uma frase quando há rascunho digitado). Em `resolvida` o seletor aparece desligado com o chip "Resolvida" e o botão "Reabrir" (que chama `devolver`, isto é, volta para a IA)
- [ ] O campo de resposta passa a aparecer **sempre** que a conversa não está resolvida. Quando quem atende é a IA, uma linha acima do campo diz "Ao enviar, você assume a conversa e {atendente} para de responder até você devolver." e o botão diz "Assumir e enviar"; `POST /api/conversas/[numero]/mensagens` já grava `humano` (`registrarMensagemHumana`), então o servidor não muda — a tela só deixa de esconder o campo. A faixa âmbar "Intervir na conversa" continua em `atencao`, agora só com o motivo (o botão "Assumir atendimento" sai dela, porque o seletor e o campo já resolvem)
- [ ] "Devolver para a IA" e "Marcar como resolvida" continuam como links abaixo do campo em `humano`; "Devolver" some quando o seletor já resolve (fica só "Marcar como resolvida")
- [ ] As abas "Responder como IA / Responder manualmente" viram um único botão "Escrever com a IA" ao lado do campo (o rascunho continua caindo no campo, nada é enviado sozinho) e o campo aceita "/" para respostas rápidas (US-015)
- [ ] Verificado por `curl`: mensagem humana numa conversa `ia` grava `humano`, evento "Você assumiu a conversa" e zera `esperando_desde`
- [ ] Lint e build passam; verificar no navegador (seletor nos quatro status, campo sempre visível, "Assumir e enviar"; desktop e celular)

### US-014: Notas internas
**Description:** As a operador do atendimento, I want deixar uma anotação na conversa que o cliente não vê so that eu registre o combinado e o contexto para mim mesmo ou para quem olhar depois.

**Acceptance Criteria:**
- [ ] `POST /api/conversas/[numero]/notas` `{ texto }` grava uma mensagem `papel: "nota"` (1 a 2.000 caracteres, 400 fora disso), sem enviar nada, sem mudar status, `nao_lidas` ou `ultima_mensagem`, publicando o evento `conversa`; `DELETE /api/conversas/[numero]/notas/[id]` apaga uma nota (com confirmação na tela)
- [ ] `ConversaAberta`: o botão "Nota interna" ao lado do campo troca o campo para o modo nota (fundo amarelo claro, rótulo "Nota interna · só a equipe vê", botão "Salvar nota", Esc volta ao modo resposta). Notas aparecem como bolhas amarelas alinhadas à direita, com "Nota interna" e a hora, e o link "Apagar" no hover/foco. O modo nota funciona em qualquer status, inclusive `ia` e `resolvida`, e **não** assume a conversa
- [ ] A lista de Conversas mostra um ícone de nota na linha quando a conversa tem nota (campo `temNotas` em `Conversa`, contado na consulta)
- [ ] A transferência da US-002 grava, além do evento, uma nota automática com o motivo e a última pergunta do cliente ("Pedi ajuda porque a base não tinha a informação. Pergunta: 'Fazem cirurgia cardíaca?'"), assinada "{atendente}" — o padrão da `HandoffTool` do Captain
- [ ] `lib/demo.ts` ganha uma nota interna numa conversa de exemplo
- [ ] Lint e build passam; verificar no navegador (modo nota, bolha amarela, apagar; desktop e celular)

### US-015: Respostas rápidas
**Description:** As a operador do atendimento, I want responder as perguntas de sempre com um atalho so that eu não digite a mesma frase dez vezes por dia.

**Acceptance Criteria:**
- [ ] Nova tabela `respostas_rapidas` em `lib/respostas-rapidas.ts`: `id`, `atalho` (2 a 30 caracteres, letras, números e hífen, único, minúsculas), `texto` (até 1.000), `criado_em`. Rotas `GET/POST /api/respostas-rapidas`, `PUT/DELETE /api/respostas-rapidas/[id]`, com 400 e frase para atalho inválido ou repetido. Variáveis `{nome}` (nome do contato ou "você") e `{atendente}` são trocadas na inserção
- [ ] No campo de resposta, digitar "/" **no começo do campo vazio** abre um painel acima do campo com as respostas filtradas pelo que vem depois da barra (atalho e texto), navegável por setas, Enter insere e Esc fecha; sem nenhuma resposta cadastrada, o painel mostra "Nenhuma resposta rápida ainda" e o botão "Criar a primeira"
- [ ] O menu do campo ("…") ganha "Respostas rápidas": um diálogo com a lista (atalho, texto cortado, editar, apagar) e o formulário de nova resposta; o mesmo diálogo abre de "Criar a primeira"
- [ ] Em modo demonstração, três respostas rápidas nascem com as conversas de exemplo (`horario`, `endereco`, `obrigado`) e somem com elas
- [ ] Lint e build passam; verificar no navegador (painel com "/", inserção com variável, diálogo de gestão; desktop e celular)

### US-016: Etiquetas
**Description:** As a operador do atendimento, I want marcar conversas com uma palavra minha e filtrar por ela so that eu separe "orçamento", "reclamação" ou "VIP" do meu jeito.

**Acceptance Criteria:**
- [ ] `conversas` ganha `etiquetas TEXT NOT NULL DEFAULT '[]'` (JSON de até 5 nomes); nova chave de configuração `ETIQUETAS` com a lista da instância (`{ nome, cor }`, até 20, cores de uma paleta fixa de seis tons já derivados de `globals.css`). `PUT /api/conversas/[numero]/etiquetas` `{ etiquetas: string[] }` cria na lista da instância o que não existir (cor seguinte da paleta) e grava na conversa; `GET /api/etiquetas` lista; `DELETE /api/etiquetas/[nome]` remove da instância e de todas as conversas (com confirmação e contagem na tela)
- [ ] `PainelContato` ganha o bloco **"Etiquetas"**: chips coloridos com "×", um campo "Adicionar etiqueta" com sugestões das existentes enquanto digita e Enter para criar; máximo 5 por conversa (o campo desliga com a frase "Até 5 etiquetas por conversa")
- [ ] A lista de Conversas mostra até dois chips de etiqueta por linha (o resto vira "+2"); abaixo das abas, uma linha de chips com as etiquetas da instância filtra a lista (`?etiqueta=`, uma por vez; `GET /api/conversas` aceita `etiqueta`); o filtro ativo aparece com "×" para limpar
- [ ] `lib/metricas.ts:linhasParaExportar` ganha a coluna "Etiquetas"; `lib/demo.ts` marca duas conversas de exemplo ("orçamento", "retorno")
- [ ] Lint e build passam; verificar no navegador (bloco do painel, chips na lista, filtro; desktop e celular)

### US-017: Quem está esperando há muito tempo
**Description:** As a operador do atendimento, I want ser avisado quando um cliente está esperando uma pessoa há mais tempo do que eu aceito so that ninguém fique sem resposta porque eu estava em outra aba.

**Acceptance Criteria:**
- [ ] `Config` ganha `avisoEsperaMin: 5 | 10 | 30 | 60` (padrão 10; `migrarConfig` preenche), editável em "Quando ele não souber responder" como `select` "Avisar quando alguém espera mais de"
- [ ] `Conversa` (lista) e `ConversaCompleta` expõem `esperandoDesde` (US-002). Na lista, uma conversa em `atencao` (ou `humano` com `nao_lidas > 0`) mostra "Esperando há {tempo}" no lugar da hora; passado o limite, o texto fica vermelho e a linha ganha uma borda esquerda vermelha. O cabeçalho da conversa aberta mostra o mesmo texto ao lado do status
- [ ] O item Conversas do cabeçalho (contador de `atencao`, já existente) passa a usar vermelho quando alguma conversa passou do limite; `document.title` vira "({n}) Conversas · Atendente no WhatsApp" enquanto `n > 0` em qualquer tela (efeito em `Topbar`, arquivo próprio do app), voltando ao normal em zero
- [ ] Som opcional: um botão de alto-falante ao lado das abas de Conversas (estado em `localStorage`, desligado por padrão) toca um toque curto gerado por `AudioContext` (sem arquivo) quando chega o evento `atencao` (US-004) ou quando uma conversa cruza o limite (conferido a cada minuto na tela). Nunca toca com a aba oculta se o navegador bloquear; nenhum pedido de permissão de notificação nesta rodada
- [ ] Início: o cartão de situação diz "{n} conversas precisam de você · {m} esperando há mais de {limite} min" quando `m > 0`
- [ ] Testado no navegador com uma conversa de exemplo forçada para `esperando_desde` de 20 minutos atrás: texto vermelho, título da aba e som (com o botão ligado)
- [ ] Lint e build passam; verificar no navegador (lista, cabeçalho, botão de som; desktop e celular)

### US-018: Painel do contato revisado
**Description:** As a operador do atendimento, I want o painel do contato organizado em blocos, com o que importa primeiro so that eu leia quem é, o que a IA lembra e o que já foi feito sem rolar.

**Acceptance Criteria:**
- [ ] `PainelContato` passa a ter, nesta ordem: identidade (avatar, nome, número, chips de status/origem), **Etiquetas** (US-016), **O que o atendente lembra** (US-012), **Dados do contato** (`dl` com Nome informado, E-mail, Telefone de retorno, Assunto, Motivo da transferência quando houver, Primeiro contato, Última mensagem, Total de mensagens), **Resumo da conversa** (US-011, recolhido) e as ações ("Marcar como resolvida", "Apagar conversa"). Cada bloco é um `MaisDetalhes` aberto por padrão no desktop e recolhido no celular, com o estado lembrado em `localStorage` por bloco
- [ ] No celular (`ContatoRecolhido`) o bloco de cima mostra só identidade + etiquetas + a primeira linha da memória, e "Ver tudo" abre o resto
- [ ] Nenhum outro campo editável além de memória, dados do contato e etiquetas (Non-Goals continuam: sem observações livres do contato, sem atributos personalizados)
- [ ] Lint e build passam; verificar no navegador (desktop 1400 e 1100, celular)

### US-019: Relatórios: por que a IA precisou de gente
**Description:** As a dona do negócio, I want ver por que o atendente transferiu conversas no período so that eu saiba se preciso completar a base, mudar o escopo ou treinar a equipe.

**Acceptance Criteria:**
- [ ] `Metricas` ganha `motivos: { motivo: MotivoTransferencia; total: number }[]` (conversas do período com `motivo_transferencia` preenchido, agrupadas), calculado em `lib/metricas.ts` com a definição documentada no topo do arquivo, e `naoEntregues: number` (mensagens `falhou` no período)
- [ ] Relatórios ganha o cartão **"Por que o atendente pediu ajuda"**: barras horizontais (mesmo componente de "Principais assuntos") com o rótulo de `rotuloMotivo`, ordenadas, e uma frase de leitura sob o gráfico escolhida por regra: motivo dominante `sem_informacao` → "A maior parte veio de perguntas que a base não cobre. Vale completar em O que ele sabe." (link para `/assistente#conhecimento`); `fora_do_escopo` → "Muitos clientes pedem algo fora do que o atendente faz. Revise o objetivo."; `cliente_pediu` → "Clientes preferem falar com uma pessoa. Está tudo certo com o atendente."; `falha` → "Houve falhas ao responder. Confira a IA em Configurações." (link para `/setup#openrouter`); vazio → "Nenhuma transferência no período."
- [ ] Os quatro indicadores continuam; abaixo deles, quando `naoEntregues > 0`, um `Aviso` "{n} mensagens não chegaram ao cliente no período" com link para `/conversas`
- [ ] O CSV (`linhasParaExportar`) já ganhou as colunas novas nas histórias anteriores; o "Copiar resumo" (`numerosEmTexto`) inclui uma linha com os motivos
- [ ] `lib/demo.ts` distribui motivos nas duas conversas de exemplo em `atencao`
- [ ] Lint e build passam; verificar no navegador (cartão nos três períodos e vazio; desktop e celular)

### Fase 5: encerramento

### US-020: Documentação, catálogo, versão 0.3.0 e verificação final
**Description:** As a mantenedor, I want que tudo o que descreve o app reflita esta rodada so that quem publicar ou evoluir o app leia o que ele faz agora.

**Acceptance Criteria:**
- [ ] `package.json` e `package-lock.json` em `0.3.0`; `CHANGELOG.md` com a entrada 0.3.0 em linguagem de negócio (uma linha por capacidade: mídia, geração da persona, por que respondeu assim, memória, dono da conversa, notas, respostas rápidas, etiquetas, avisos de espera, tempo real, status de entrega, motivos de transferência, rajadas)
- [ ] `README.md`: seções novas ou revisadas para áudios/fotos/arquivos (o que o app faz, o modelo de áudio e o custo), "O que o atendente guarda sobre cada cliente", "Tempo real", tabela de variáveis com `MODELO_AUDIO`, "Estrutura" com as rotas e tabelas novas (`anexos`, `contatos`, `respostas_rapidas`, colunas novas de `conversas`/`mensagens`)
- [ ] `catalogo.json`: `ia` revisado ("Responde texto, áudio e fotos com o conhecimento da empresa, lembra cada cliente, explica cada resposta e avisa quando precisa de uma pessoa."), `problema` mantido; `node scripts/gerar-deploy.mjs` sem alteração inesperada no `render.yaml`
- [ ] `CLAUDE.md` do app: notas desta rodada sobre o que não se lê do código (janela de rajada, guarda dupla contra corrida, transição só para a frente do status de entrega, marcador `[TRANSFERIR:motivo]` em vez de ferramenta, SSE com reserva de polling, regras da memória do contato e o que ela nunca guarda, formato `input_audio`, política de anexos no disco e limpeza em 90 dias, por que o painel não tem observações livres nem atributos); notas antigas que deixaram de valer (abas "Responder como IA/manualmente", campo escondido até assumir, `SUGESTOES` fixas, tique único) são reescritas
- [ ] `node scripts/verificar-jargao.mjs whatsapp-atendente` passa sem exceção nova (ou com exceção registrada em `scripts/jargao-excecoes.json` **só** para o campo "Modelo que ouve áudios" em Opções avançadas); `scripts/verificar-paleta.mjs` passa; `scripts/verificar-padrao.sh` sai 0 para os 18 apps (nenhum arquivo `INFRA` deste app mudou)
- [ ] `tests/` ganha testes com `node --test` (padrão `tests/conhecimento-agenda.test.mts`) para `lerMotivo`, a transição de `atualizarEntrega`, a janela de rajada (com temporizadores falsos), `dividir`/mesclar da memória e a validação de atalho das respostas rápidas; `npm test` passa
- [ ] Verificação completa do `PADRAO.md` no standalone (`/api/health`, `/api/status`, `/api/setup`, rotas novas com entradas inválidas devolvendo 400, rotas novas sem sessão devolvendo 401); capturas finais de `/`, `/conversas` (com anexos, nota, evento, etiquetas, espera), `/assistente` (gerador, seções, ferramentas, passo 2 com "por que respondeu assim"), `/relatorios` e `/setup` em desktop e celular, revisadas e corrigidas
- [ ] A prévia do catálogo (`/?exemplo=1&captura=1`) continua mostrando o Início cheio com as conversas de exemplo

## Functional Requirements

- FR-1: Toda mensagem recebida da z-api deve ser gravada uma única vez (dedupe por `messageId`), inclusive as que não são texto; nenhuma mensagem de cliente pode ser descartada sem registro no banco.
- FR-2: Mensagens seguidas do mesmo cliente dentro de 3 s devem receber uma única resposta da IA; a IA não deve gravar nem enviar uma resposta quando a conversa mudou de dono ou recebeu mensagem nova durante a geração.
- FR-3: Toda transferência para uma pessoa deve ter um motivo entre cinco categorias fixas, visível na conversa (faixa, evento e nota automática), no painel do contato, no CSV e em Relatórios.
- FR-4: Uma falha da IA numa conversa real deve produzir a frase de reserva configurada e uma transferência com motivo "falha", nunca silêncio.
- FR-5: Cada mensagem enviada pelo número da empresa deve ter um status de entrega (enviando, enviada, entregue, lida, falhou) que só avança, com "Tentar de novo" quando falhou.
- FR-6: As telas devem receber atualizações por eventos do servidor enquanto o fluxo estiver de pé e voltar ao polling (30 s) quando ele cair, com indicação discreta do estado.
- FR-7: Áudio, imagem, vídeo, documento, figurinha, localização e contato recebidos devem aparecer na conversa no formato próprio de cada um; com IA conectada e o tipo ligado, áudio é transcrito, imagem é descrita e PDF/texto é lido antes de a IA responder; desligado ou sem IA, o cliente recebe a frase configurada para mídia.
- FR-8: A persona do atendente deve poder ser gerada a partir de um brief (e opcionalmente do site), com três decisões explicadas, versões comparáveis e aplicação explícita que não salva sozinha.
- FR-9: A configuração deve incluir saudação, perguntas de teste, ferramentas (coletar contato, agenda, sistemas, mídia), frase de falha, frase para mídia e limite de espera, todos migráveis a partir de configurações antigas.
- FR-10: Cada resposta da IA deve guardar de onde veio (fontes, ferramentas, transferência, mídia, modelo, tempo, rajada) e exibi-lo sob demanda no simulador e na conversa aberta.
- FR-11: Conversas com mais de 20 mensagens devem ter um resumo do começo, usado no prompt junto com as últimas 12 mensagens; cada contato deve ter uma memória de até 1.200 caracteres, atualizada pela IA em segundo plano, visível e editável no painel, sem dados sensíveis.
- FR-12: A conversa aberta deve mostrar quem atende (o atendente ou Você) num seletor de um clique; enviar uma mensagem com a IA no comando deve assumir a conversa automaticamente.
- FR-13: Notas internas e eventos de linha do tempo devem ficar na conversa, nunca ir ao cliente, nunca entrar no histórico visto pela IA e nunca contar como não lidas.
- FR-14: Respostas rápidas devem ser inseridas por "/" no campo vazio, com variáveis de nome, e geridas num diálogo da própria tela.
- FR-15: Etiquetas devem ser criadas no painel do contato (até 5 por conversa, 20 por instância), aparecer na lista e filtrar a lista.
- FR-16: Uma conversa esperando uma pessoa além do limite configurado deve ficar em destaque na lista, no cabeçalho, no título da aba e, se ligado, tocar um som.
- FR-17: Relatórios deve mostrar os motivos de transferência do período com uma frase de leitura e um link para a ação correspondente.
- FR-18: Nenhuma tela fora de "Opções avançadas"/"Para a equipe técnica" deve usar termos técnicos; `scripts/verificar-jargao.mjs` passa; nenhum arquivo da camada `INFRA` muda.

## Non-Goals (Out of Scope)

- Múltiplos atendentes humanos, times, atribuição, permissões, políticas de SLA, prioridade, snooze/adiar, menções `@`, participantes, macros, ações em lote, filtros salvos e pastas (tudo pressupõe equipe e volume; uma conta por instância).
- Conjunto de testes salvo com resposta esperada e comparação lado a lado de versões ou modelos (D3).
- Questionário guiado de persona (D2); parâmetros de memória expostos (janela, tokens) (D1).
- Envio de mídia pela pessoa ou pela IA (áudio, imagem, documento saindo pelo número); modelos de mensagem, campanhas, envio ativo para quem não escreveu; janela de 24 h da Meta (a z-api por QR Code não a impõe; a Meta continua como opção avançada só com texto).
- Mídia recebida pelo caminho da Meta (só texto continua, como hoje; registrado no `README.md`).
- Chat livre com um "copiloto" sobre a conversa; sugestões de resposta automáticas sem clique (o "Escrever com a IA" continua sob demanda).
- Pesquisa de satisfação (CSAT), avaliação de respostas pelo cliente.
- Notificações do navegador (permissão), push, e-mail por conversa; o relatório diário existente continua como está.
- Guardar a foto do contato; observações livres e atributos personalizados do contato; editar o nome do canal.
- Outros canais (Instagram, Telegram, site): ficam para uma rodada futura; ver Technical Considerations sobre o que já nasce neutro de canal.
- Leitura de DOCX; player de áudio com forma de onda; transcrição ao vivo.
- Fila externa, Redis, WebSocket, mais de um processo.

## Design Considerations

- **Referências:** Dify para a área de personalização (cartão gerador com chips "experimente", painel de resultado com decisões explicadas, versões e Aplicar com confirmação; `FeatureCard` com ícone + título + interruptor + apoio de altura fixa e linha de estado; contador de caracteres em badge; "por que respondeu assim" como o `More`/`ToolDetail` recolhidos por padrão). Chatwoot para o painel (dono explícito da conversa, motivo de transferência como nota automática, eventos na linha do tempo, notas em amarelo, respostas rápidas com "/", etiquetas coloridas no cartão, tempo de espera em vermelho, tiques de entrega ✓ / ✓✓ / ✓✓ no acento).
- **O que não copiar da ergonomia:** o "devolver para a IA" escondido no dropdown de responsável (vira seletor visível), os oito acordeões arrastáveis do painel (viram blocos fixos), os quatro status com snooze e prioridade, os 10 "opening questions" (ficam 5, com 3 sugeridas).
- **Componentes reaproveitados:** `Topbar`, `Passos`, `Field`, `Row`, `MaisDetalhes`, `Aviso`, `ErrorBox`, `Loading` (com etapas), `Dica`, `Dropzone`, `CopyButton`, `useConfirmacao`, `useMenuSuspenso`, `Celular`/`AcoesResposta`, `Indicadores`, `GraficoLinhas`, o componente de barras de "Principais assuntos", `DataTable`. Novos, próprios do app: `CartaoFerramenta` (o `FeatureCard`), `PorQueRespondeu`, `SeletorQuemAtende`, `Anexo` (um componente por tipo), `PainelRespostasRapidas`, `Etiquetas`, `useEventos`.
- **Cores:** acento `#0e7c6a` e derivados; notas internas em amarelo claro (`#fff7d6` / texto `#5c4a00`, contraste conferido); eventos em `text-muted`; espera vencida em `text-danger`; etiquetas em seis tons suaves definidos em `globals.css` após `/* Específico deste app */`; tiques "lida" no acento (não o azul do WhatsApp, para não confundir com "Em atendimento humano").
- **Textos:** sentence case, botões dizem o que fazem ("Assumir e enviar", "Gerar meu atendente", "Salvar nota"), sem setas; as três `decisoes` da persona são frases de negócio, nunca "temperatura", "prompt" ou "modelo".
- **Celular:** o painel do contato recolhido mostra identidade, etiquetas e a primeira linha da memória; o painel de resultado da persona vira folha de baixo; o gerador ocupa a largura toda; o seletor "Quem atende" cabe em uma linha de 390 px.

## Technical Considerations

- **Camada `INFRA` intocada.** `lib/ai.ts`, `lib/modelos.ts`, `lib/setup-comum.ts`, `lib/store.ts`, `proxy.ts` e as rotas compartilhadas não mudam. Áudio (`input_audio`) vai direto ao OpenRouter em `lib/midia.ts`; a persona e a memória usam `askJSON`; a imagem usa `askVision`. Se alguma história precisar de algo na infraestrutura, ela nasce no `pdi-time` em outra rodada e esta usa uma solução própria enquanto isso.
- **Esquema:** colunas novas em `conversas` (`motivo_transferencia`, `esperando_desde`, `resumo`, `resumo_ate_id`, `etiquetas`) e `mensagens` (`id_externo`, `status_entrega`, `erro_envio`, `detalhes`), tabelas novas `anexos`, `contatos`, `respostas_rapidas`, todas em `lib/*.ts` próprios com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` em `try`. `lib/conversas.ts` continua o único que escreve em `conversas`/`mensagens`; `lib/anexos.ts`, `lib/memoria.ts` e `lib/respostas-rapidas.ts` são donos das suas tabelas e só leem as outras.
- **Rajada e corrida:** temporizadores em memória por número (`lib/rajada.ts`); a guarda `podeResponder` consulta o banco nas duas pontas. Reiniciar o processo no meio de uma janela perde a resposta pendente: `instrumentation.ts`, na subida, procura conversas `ia` cuja última mensagem é do cliente há menos de 2 min e reagenda.
- **SSE:** `ReadableStream` na rota, `EventEmitter` em módulo (`lib/eventos.ts`); o bundle do proxy e o das rotas são módulos separados no Next (aprendizado do `clone-site`), mas o emissor só é usado por rotas, então não há esse problema. Heartbeat de 25 s para o proxy do Render não fechar a conexão; a tela trata `error` do `EventSource` com espera crescente e cai para polling. Um `Map` de conexões abertas no módulo, para fechar tudo no `SIGTERM`.
- **Anexos:** download em segundo plano para `DATA_DIR/anexos/<id>` com limites (16 MB, 30 s), `mime` conferido, rota privada de leitura, limpeza em 90 dias no laço de `instrumentation.ts`, `README.md` avisando do disco. As URLs da z-api podem expirar; a cópia local existe para isso. Base64 de áudio para o OpenRouter é lido do arquivo local (ou baixado na hora se a cópia falhou), com teto de 16 MB.
- **Neutralidade de canal (preparação para integrações futuras):** `anexos`, `status_entrega`, `eventos`, `contatos` e `respostas_rapidas` não sabem o que é z-api; a tradução do formato do canal para o do app mora só em `app/webhook/zapi/route.ts` (e na rota da Meta, para texto). Um canal novo entra como uma rota de recebimento + uma função de envio em `lib/whatsapp.ts` (que pode ser renomeado para `lib/canais.ts` numa rodada futura) + um valor em `CanalOrigem` e `rotuloOrigem`.
- **Memória e privacidade:** a extração roda em segundo plano, nunca segura a resposta; o prompt proíbe categorias sensíveis; a pessoa vê, edita e apaga; apagar a conversa apaga o contato; o `README.md` documenta. Memória editada por pessoa protege contra reescrita por 7 dias.
- **Persona:** `lerSite` recusa endereços internos (proteção contra requisições ao próprio servidor ou à rede privada) e limita tamanho e tempo; a geração não salva nada, a tela aplica no formulário e o salvamento continua sendo o `PUT /api/config` de sempre. Versões em `sessionStorage`, como no Dify.
- **Modelos gratuitos:** a transferência por marcador `[TRANSFERIR:motivo]` e a coleta de contato por regra de prompt existem para o app continuar funcionando sem chamada de ferramentas; `limparSaida()` continua a segunda linha de defesa contra raciocínio vazado.
- **Compatibilidade:** mensagens antigas sem `status_entrega`, `detalhes` ou anexos continuam desenhadas como hoje; configurações antigas passam por `migrarConfig`; conversas de exemplo ganham os campos novos ao nascer, mas as já semeadas continuam válidas.

## Success Metrics

- Zero mensagens de cliente sem registro: em teste com a z-api falsa mandando os sete tipos e um aviso duplicado, o banco tem exatamente uma mensagem por aviso único.
- Três mensagens em rajada geram uma resposta; assumir durante a geração impede a resposta da IA em 100% das tentativas do teste.
- Do brief ao primeiro teste no simulador: menos de dois minutos com IA conectada (medido em teste com alguém fora do time), sem editar nenhum marcador à mão.
- Cada resposta da IA no simulador e na conversa tem "Por que respondeu assim" com pelo menos uma fonte.
- Mensagem nova aparece na conversa aberta em menos de 2 s com o fluxo de eventos de pé; com o fluxo derrubado, em até 30 s.
- Um cliente que volta depois de uma conversa resolvida é saudado pelo nome informado quando a memória o tem.
- Relatórios mostra os motivos de transferência do período com a frase de leitura certa para o motivo dominante.
- Lint, build, testes, jargão, paleta e padrão passam; capturas desktop e celular revisadas em cada história com tela.

## Open Questions

1. **Modelo de áudio e custo:** qual modelo do OpenRouter com entrada de áudio fica como padrão (a documentação cita `google/gemini-2.5-flash`, pago)? Se não houver opção gratuita, a transcrição nasce ligada (com o aviso de custo na linha de ajuda) ou desligada?
2. **Retenção de anexos:** 90 dias é um bom prazo para o disco de 1 GB, ou o app deve calcular pelo espaço (apagar os mais antigos ao passar de 700 MB)?
3. **Respostas rápidas x "Escrever com a IA":** o Chatwoot sugere que, com IA no meio, respostas rápidas viram retrabalho. Mantemos as duas (decisão D4) e medimos o uso; se as respostas rápidas não forem usadas, saem na rodada seguinte?
4. **Cadastro do aviso de status na z-api:** confirmar na documentação se `update-every-webhooks` cobre o aviso de status de mensagem ou se há um `update-webhook-*` específico (P4); e se o aviso de presença (`COMPOSING`/`RECORDING`) vale ser recebido para mostrar "cliente digitando…" na conversa aberta (barato depois do SSE; fora desta rodada por padrão).
5. **Marcar como lida no WhatsApp:** quando a pessoa abre a conversa no painel, o app deve chamar `read-message` para o cliente ver os dois tiques azuis? Hoje ninguém marca. Fica de fora até decidir.
6. **Persona a partir do site em modo demonstração:** sem IA, o site é ignorado (só os exemplos por segmento). Aceitável, ou vale ao menos extrair nome e telefone do HTML por regra?
7. **Multi-processo:** se algum dia o app rodar em mais de uma instância, rajada, eventos e guarda contra corrida precisam de um lugar comum (SQLite com polling ou fila). Registrar como limite conhecido no `README.md` basta por agora?
