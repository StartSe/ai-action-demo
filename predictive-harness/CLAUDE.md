# Predictive Harness — decisões

Produto independente da suíte (`independente: true`, `padrao: "proprio"` no catálogo), criado em 21/09/2026 a partir da infraestrutura do `mapify` (conta, `lib/store.ts`, `lib/chatgpt.ts`, `proxy.ts`) e das conexões do `build-agentflows` (OAuth PKCE do OpenRouter em `app/api/conexoes/openrouter`, cartões em Configurações). A proposta, o pivô e as rodadas estão em `PLANO.md`; esta é a rodada 2 (v0.2.0), que transformou o app em **agente de FP&A**.

Regra central da rodada 2: **o motor calcula, o LLM escreve, o Jev decide**. Nenhuma conta passa pelo modelo de linguagem. O LLM tem duas tarefas fechadas — traduzir a pergunta em uma especificação (`normalizarEspecificacao`, validada campo a campo por faixa em `FAIXAS`) e narrar o resultado a partir de `numerosDoMotor()`. Se a especificação não valida, o campo é descartado com aviso e nunca assumido em silêncio. Toda decisão do sistema continua passando por `lib/jev.ts` (`decidir`) e é registrada na mensagem para a coluna "Como cheguei aqui". Confiança abaixo de `CONFIANCA_MINIMA` (0,6) leva ao caminho conservador. Sem OpenRouter o harness não roda.

A unidade econômica é a **turma** (cohort). `lib/fpa.ts` é determinístico e não importa nada de IA: seis premissas (`CHAVES_PREMISSA`), contribuição por turma, ponto de equilíbrio, cenário de novas turmas com impacto na margem do período, sensibilidade (variação adversa de 10%, ranqueada pelo impacto) e meta reversa. O teste `lib/fpa.test.ts` fixa os números do caso do PLANO (28 alunos, ticket 4.900, desconto 8%, fixo 38 mil, variável 750, marketing 620 → contribuição 49.864 e equilíbrio em 13 alunos). Sensibilidade: ticket pesa mais que alunos, porque menos alunos também poupam custo variável e marketing.

Papéis de FP&A por coluna (`lib/papeis.ts`): heurística local pelo nome e tipo, mais uma pergunta `choice` por coluna na mesma chamada do Jev que já classificava o tipo semântico (quatro perguntas por coluna). Papéis únicos (receita, produto, turma, …) não se repetem numa planilha: `garantirPapeisUnicos` mantém o de maior confiança, e um papel confirmado pela pessoa vence Jev e heurística. O papel da planilha (matrículas, custos, marketing) é derivado dos papéis das colunas. Planilhas da v0.1.0 recebem a heurística ao serem lidas (`normalizar` em `lib/planilhas.ts`); planilhas de exemplo recusam mudança de papel.

Premissas têm três origens visíveis e uma ordem de precedência fixa (`premissasEfetivas`): informada na pergunta > livro (informada) > da base. **Sugerida nunca entra numa conta sem confirmação** — o cartão "Faltam premissas" mostra o valor proposto pelo LLM com a plausibilidade pontuada pelo Jev, e só o botão da pessoa o transforma em informada. O livro fica em SQLite (tabela `premissas`, por produto e chave).

A conversa é da **base inteira**, não de uma planilha: `lib/conversa.ts` grava as mensagens com `planilha_id = "base"` e as rotas ficam em `app/api/base/*`. O recálculo local (`recalcularMensagem`) troca premissas, roda só o motor e regrava a mensagem: sem custo e sem chamada ao modelo; a leitura em texto continua a dos números anteriores, e isso é dito num aviso do harness.

Gráficos são SVG desenhados do resultado do motor, nunca imagem gerada, com a tabela equivalente recolhida ao lado (leitura sem cor). Azul entra, terracota (`--sai`) sai: par validado para daltonismo. No celular o gráfico rola na horizontal a partir de 430 px em vez de encolher o texto.

Demonstração: `lib/demo.ts` gera três planilhas de uma escola de negócios fictícia e responde quatro perguntas roteirizadas (uma por categoria) pelo próprio motor, com decisões marcadas `exemplo: true`. Perguntas livres em demonstração devolvem 409. O cenário de exemplo mostra a margem do trimestre **caindo** 0,9 p.p. ao abrir a turma: é a conta correta (a turma rende menos que a média da base) e é bom que o agente não diga só "sim".

Verificar: `npm test` (30 provas), `npm run lint`, `npm run build`, servidor standalone com `curl` em `/api/health`, `/api/status`, `/api/base`, `/api/base/conversa` (pergunta sugerida em demo e 409 em pergunta livre), `/api/base/premissas`, `/api/base/recalcular`, `/api/planilhas` (upload multipart) e `/api/planilhas/<id>/papeis`. `scripts/verificar-padrao.sh`, `verificar-jargao.mjs` e `verificar-paleta.mjs` pulam apps com `padrao: "proprio"`. Sem chave real do OpenRouter, o endpoint do Jev, a calibração em português e a qualidade da tradução pergunta → especificação continuam por confirmar (risco registrado no PLANO.md).


## Rodada 3 — Cowork Jev (v0.3.0)

A interface agora tem abas no header: Conversa, Conectores, Livro de premissas e Configurações. `lib/sessoes.ts` mantém histórico e seleção explícita de fontes por conversa; `lib/contexto.ts` usa AsyncLocalStorage para propagar essa seleção e o ID às operações do motor e de mensagens. Os registros antigos em `planilha_id = "base"` ficam na primeira conversa. O livro continua por produto e sua aplicação entre conversas está explícita na UI.

Conectores importa XLSX com escolha da aba (SheetJS 0.20.3 oficial; diretório ZIP validado via yauzl), CSV, JSON e TSV. O limite continua em 20 MB, inclusive para multipart sem Content-Length; uma aba convertida também fica limitada. Importação usa heurística local; classificação externa é solicitada no botão Mapear com o Jev. OneDrive e Google Sheets são informativos de em breve.

`lib/voz.ts` e `/api/voz` integram ElevenLabs: chave cifrada em `lib/store.ts`, catálogo de vozes em português com brasileiras primeiro, transcrição `scribe_v2` e síntese `eleven_multilingual_v2`. `useVoz.ts` gerencia MediaRecorder, permissões, descarte, limite de 60s e limpeza de tracks/URLs; transcrição passa pelo compositor antes do envio, leitura automática é opcional. O app não persiste áudio; o provedor recebe áudio e texto conforme detalhado nas configurações. Testes de contrato usam fetch simulado; voz real exige credencial e créditos do usuário.

Os testes `experiencia.test.ts` e `voz.test.ts` cobrem importação, limites, isolamento, histórico e contratos da ElevenLabs. Continuam obrigatórios `npm test`, `npm run lint` e `npm run build`.

## Rodada 4 — Espaço de conversa (v0.4.0)

O header mantém Conversa, Fontes de dados e Configurações. `Historico.tsx` mostra busca local, fixadas e recentes no painel esquerdo retrátil; em telas menores usa dialog com foco contido. `lib/sessoes.ts` migra `fixada` e `atualizado_em` sem perder mensagens/fontes. `PATCH /api/conversas` persiste fixação. Popovers nativos permitem Escape e clique fora. O botão de fontes resume a seleção por conversa. `PremissasPanel.tsx` é a leitura lateral retrátil; a gestão abre `Base` em modal e continua global por produto. O compositor usa seta circular e não explica atalhos de teclado.

`VozAoVivo.tsx` substitui MediaRecorder/upload pelo Scribe Realtime (`@elevenlabs/client`), VAD e token efêmero obtido por POST `/api/voz` `{tempoReal:true,conversaId}`. Cada pergunta chama a mesma rota do harness; a resposta calculada é sintetizada. Parcial de fala interrompe reprodução, turnos são serializados e encerramento cancela requests, áudio e captura. Multipart de voz é recusado. Credenciais e números continuam no servidor; os testes de contrato e navegador não substituem avaliação acústica com credencial real.

Verificar também busca com acentos, fixação após reload, exclusão de conversa inativa, recolher/abrir laterais no celular, modal de premissas, popovers pelo teclado e ciclo de voz com WebSocket simulado, áudio de microfone real do navegador, pausa, interrupção, encerramento e erros.


## Rodada 5 — Navegação compacta e IA por voz (v0.5.0)

O header global sai; o menu lateral reúne logo, navegação, busca, títulos sem datas, ações de fixar/renomear/excluir e Configurações/Sair no rodapé. Sugestões iniciais e follow-ups são compactos. `PATCH /api/conversas` renomeia títulos de 1 a 100 caracteres; a migração `titulo_manual` impede o primeiro turno de sobrescrever um nome escolhido. Configurações compartilha o mesmo Workspace.

Voz usa ElevenLabs Agents via WebSocket autenticado por URL assinada. `lib/voz.ts` provisiona e reutiliza um agente privado com ferramentas cliente, idioma português, voz escolhida, gravação desativada e prompt que exige o motor para números. `analisar_dados` chama a rota existente; `mostrar_analise` aceita somente mensagens desta conversa. Contexto contém fontes selecionadas, agregados e as últimas mensagens com cartões, nunca arquivos brutos. A tela substitui o chat por gráficos e controles de voz, sem modal bloqueando os dados. Premissas continuam editáveis por ação explícita da pessoa, com recálculo local e atualização de contexto do agente.

`SessaoVoz.ts` possui o ciclo completo de microfone, Web Audio, worklet PCM16, WebSocket, cancelamento, interrupção e ferramentas serializadas. Encerrar libera também microfone concedido depois do cancelamento. Contratos do provedor são simulados nos testes; a validação acústica e de latência real exige credencial e créditos. Rodar os testes, lint, build e validar desktop/celular, renomeação persistida, sidebar, configurações/logout, áudio e ferramentas com WebSocket de teste antes de publicar.


## Correção 0.5.1 — Verificação de acesso à voz

Listar vozes validava somente o catálogo, mas a UI rotulava toda a integração como conectada. `verificarVoz` agora executa a preparação real de ferramentas/agente e a emissão da URL de sessão, sem WebSocket ou geração de áudio. Salvar a voz executa essa verificação; a ação explícita `POST /api/voz {verificar:true}` permite repetir depois de ajustar permissões. O resultado cifrado é vinculado à credencial e à voz; troca de configuração invalida o resultado anterior. A URL assinada não é devolvida no teste.

`voz-erros.ts` interpreta códigos conhecidos e nomes de permissões permitidos, sem expor a mensagem bruta do provedor. Falhas apontam a etapa (vozes, síntese, ferramentas, agente, autorização), distinguindo permissões, credencial e cota. IDs de ferramentas concluídas são reutilizados se a criação do agente falhar. `SessaoVoz` autoriza a sessão antes de pedir microfone; o estado encerrado oferece retorno ao chat e link direto à conexão. Testes simulam vozes liberadas com Agents negado, recuperação sem desconectar e falhas em cada etapa; não comprovam as permissões da conta real.
