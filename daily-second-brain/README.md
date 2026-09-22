# Daily Second Brain · v1.5.0

Uma memória pessoal conectada: capture o que chega, transforme em conhecimento e converse para criar novos resultados. A experiência combina um observatório de ideias com páginas Markdown, fontes rastreáveis, regras próprias e um assistente por texto ou voz.

A versão instalada aparece abaixo do logo Daily no menu lateral. No celular, toque em **Abrir menu** para vê-la. O número acompanha a versão do pacote e também está disponível em `/api/health`.

O menu tem **Início**, **Entrada**, **Biblioteca**, **Conversar** e **Ajustes**. Entrada reúne a caixa de entrada e as coletas; Biblioteca reúne wiki, mapa e artefatos; Ajustes reúne primeiros passos, conexões e regras.

Em **Entrada → Coletas e rotinas**, use **Coletar** para uma instrução nova, **Histórico** para acompanhar execuções e **Rotinas** para gerenciar agendamentos. No Histórico, abra **Ver diagnóstico da coleta** para consultar modelo, ferramentas autorizadas, tentativas de leitura no Zapier, tempos e erros. **Copiar diagnóstico** facilita o suporte sem incluir credenciais. Coletas antigas não têm registros retroativos; repetir a instrução gera um novo diagnóstico.

O ChatGPT usa o executor interno de ferramentas do Codex App Server. Modelos que exigem code mode precisam do host habilitado; terminal, ambientes de execução, navegação e delegação continuam desabilitados. A validação usa o binário instalado com um provedor local simulado, sem credenciais e sem chamadas a contas reais.

**raw → wiki → outputs → raw**

- **Coletas e rotinas:** descreva o que buscar nas ferramentas conectadas. Daily coleta em segundo plano, guarda os originais e organiza a wiki. Acompanhe as etapas e abra as fontes e páginas geradas; repita uma instrução recente ou agende uma recorrência.
- **Caixa de entrada:** recebe as coletas automaticamente. Também permite colar textos ou importar `.md`, `.txt`, `.csv` e `.json` de até 100 KB. A tabela mostra conteúdo, origem, situação e data, com busca, filtros e 15 fontes por página. Coletas Slack abrem mensagens com autor, texto e data; o conteúdo original fica nos detalhes, inclusive em coletas anteriores à v1.4.0. O original permanece imutável enquanto guardado.
- **Wiki:** o assistente organiza cada fonte, conecta ideias com `[[wikilinks]]`, evita títulos duplicados e atualiza páginas relacionadas. Edições e restaurações guardam revisões. Renomear uma página atualiza os links de wiki e outputs.
- **Mapa:** navegue pelas conexões reais entre páginas. Mostra até 28 páginas recentes; a wiki e a busca continuam disponíveis para todo o acervo.
- **Conversas:** recuperação por relevância e recência, com até 12 fontes por interação e histórico recente. A tela mostra o contexto consultado; referências clicáveis permitem conferir o raciocínio.
- **Artefatos:** briefings, planos e reflexões em Markdown, com fontes. “Voltar à memória” cria uma nova fonte para revisar e organizar.
- **Regras:** edite `REGRAS.md` pela interface. As regras acompanham organização, conversa e geração.
- **Portabilidade:** exporte uma página ou um ZIP com raw/wiki/outputs e regras. Abra a pasta como cofre no Obsidian; aliases ligam títulos aos arquivos de identificador estável.

O exemplo é opt-in, com conteúdos fictícios e respostas claramente demonstrativas. Abra `/?exemplo=1` ou use “Explorar com um exemplo”. Quando existem memórias próprias, exemplos ficam fora do contexto da IA. Em Regras da memória, você pode limpar os exemplos; fontes usadas por documentos pessoais são preservadas. Conteúdo próprio exige uma IA conectada; falhas do provedor nunca são substituídas por uma resposta simulada.

## Conexões

| Integração | Uso na v1 | Como conectar |
| --- | --- | --- |
| ChatGPT | Organização, conversa e artefatos pela assinatura | Conexões → ChatGPT → login oficial por código. O uso segue os limites da conta. Não reutiliza a sessão de outra aplicação. |
| OpenRouter | Alternativa explícita de IA, catálogo de modelos | Cole a chave em Conexões. Modelo automático ou escolha no catálogo. Créditos separados da assinatura ChatGPT. |
| Zapier MCP | Coleta e ações em Gmail, Drive, Notion, Slack e ferramentas configuradas pelo usuário | Crie o servidor no Zapier, habilite ferramentas e salve sua URL e token opcional. “Testar e ver ferramentas” consulta o servidor real. |
| ElevenLabs | Falar para escrever e ouvir respostas | Salve a chave e opcionalmente a voz. Transcrição é revisada antes do envio. Até 60 s/15 MB por gravação; leitura de até 2.500 caracteres. |

Zapier centraliza as fontes. Em **Coletas e rotinas**, o pedido autoriza as leituras selecionadas em Conexões, sem pedir confirmação a cada mensagem lida. Os resultados são salvos em raw e organizados automaticamente na wiki conforme o pedido e as regras. Ferramentas de escrita não são fornecidas ao agente de coleta. No chat, ações externas continuam sendo preparadas para confirmação explícita; resultados confirmados entram em raw.

O modo agêntico do Zapier é atendido pelas ferramentas oficiais `inspect_zapier_actions`, `discover_zapier_actions`, `list_zapier_connections` e `execute_zapier_read_action`. No modo gerenciado, ferramentas declaradas como leitura pelo servidor são reconhecidas; ferramentas sem classificação precisam ser selecionadas pelo usuário em **Ferramentas de coleta**. A escolha fica vinculada ao servidor e à definição da ferramenta. Mudanças de conexão ou permissões são verificadas novamente na execução. Habilite as ações desejadas no Zapier; a coleta não habilita novas ações nem executa código externo. [Referência oficial dos modos do Zapier](https://docs.zapier.com/mcp/overview/how-tools-work).

Consultas conhecidas do Slack, incluindo **Find Public Channel**, **Retrieve Thread Messages** e **Get Message by Timestamp**, podem ser selecionadas mesmo quando o Zapier as classifica como ações. Use **Selecionar todas** para marcar todas as ferramentas disponíveis de uma vez, ou **Limpar seleção** para desmarcá-las. Você também pode marcar várias individualmente antes de clicar em **Salvar ferramentas de coleta**. A confirmação aparece junto ao botão, com o total autorizado; uma falha mantém a seleção para tentar novamente. Todas as páginas do catálogo Zapier são carregadas, sem cortar a lista em 50 ferramentas. Ações de envio e edição continuam disponíveis no chat, com confirmação da execução. A exceção usa uma lista de identificadores de consultas, sem liberar ferramentas apenas pelo título ou por palavras como “find” e “get”. [Operações do Slack no Zapier](https://help.zapier.com/hc/en-us/articles/8495993391629-How-to-get-started-with-Slack-on-Zapier).

## Configuração e uma coleta do Slack

1. Crie sua conta. O guia abre automaticamente e pode ser retomado em **Ajustes → Primeiros passos**.
2. Conecte ChatGPT ou OpenRouter e use **Testar IA e continuar**. O teste faz uma chamada real ao provedor escolhido.
3. Use **Inserir meu primeiro texto** para começar sem outro aplicativo. Guarde uma nota e escolha **Organizar** na caixa de entrada. Para várias fontes, marque as caixas e use **Organizar selecionadas**.
4. Para coletar do Slack, abra **Quero coletar de aplicativos · opcional**, conecte o Zapier e selecione suas ferramentas de leitura. Use **Continuar com aplicativos** e peça, por exemplo: **“Obter as 4 últimas mensagens do canal do Slack tech-academy (C04KTMS2GEL) e organizar os pontos na wiki.”** Ajuste o canal para sua conta. Personalizar regras e conectar voz são opcionais.

O pedido entra na fila e a tela mostra leitura das fontes e organização. A aba pode ser fechada. Ao concluir, abra as páginas criadas e confira os originais. **Repetir instrução** busca informações atuais em uma nova execução; **Retomar coleta** após falha reutiliza leituras já salvas e continua a organização.

Em **Agendar**, escolha todos os dias, dias úteis ou um dia da semana, horário e fuso IANA. A próxima execução é exibida ao salvar. Rotinas podem ser editadas, pausadas, retomadas e excluídas sem apagar o histórico. Coletas e chamadas utilizam os limites/créditos dos provedores conectados.

### Organizar memórias em segundo plano

Na **Caixa de entrada**, use **Organizar** na linha de uma fonte ou selecione várias e clique em **Organizar selecionadas** (até 100 por solicitação e na fila). O botão **Organizar na wiki** dentro da fonte também adiciona à fila e permite fechar o modal imediatamente. Fontes que já estão em uma coleta ativa continuam sob responsabilidade dessa coleta.

O painel **Processamento das memórias**, disponível em todas as seções, mostra quantas fontes terminaram, quantas entraram na wiki e quais falharam. Em **Acompanhar fontes**, consulte a etapa atual e use **Abrir na wiki** ao concluir. Avisos confirmam sucesso ou falha sem mudar a tela em que você está. Os filtros **Em processamento** e **Organização com falha** ajudam a localizar pendências.

Pode fechar o modal, navegar, recarregar ou fechar a aba. O servidor continua trabalhando e o resultado permanece salvo. Uma falha preserva o original e libera a próxima fonte; **Tentar novamente** repete apenas a organização daquela fonte. **Limpar concluídas** recolhe os sucessos do painel; erros permanecem visíveis até serem resolvidos ou suas fontes serem excluídas. Se a conexão com o navegador cair, o painel avisa e tenta atualizar novamente.

A organização usa a mesma execução sequencial das coletas para evitar alterações concorrentes na wiki. A fila de organização tem prioridade entre coletas, sem interromper uma coleta que já começou. Cada fonte tem até 8 minutos de execução. Após reinício, o servidor retoma trabalhos com lease expirado (90 segundos), até três tentativas automáticas; a página da wiki, o estado da fonte e a conclusão são salvos na mesma transação. Requer o servidor Node em execução e disco persistente, como as coletas.

### Excluir pendências

Na caixa de entrada, exclua uma fonte ou selecione várias (até 100 por solicitação). No histórico de coletas, use **Excluir coleta** ou **Excluir falhas desta página**. A confirmação mostra o alcance: fontes ainda pendentes, coleta associada, etapas, diagnósticos, revisões e arquivos locais. Excluir uma fonte de coleta também remove suas fontes irmãs pendentes para impedir recriação ao retomar. Coletas na fila ou em execução são interrompidas; respostas tardias não gravam novos itens.

Páginas da wiki, fontes já organizadas ou referenciadas pela memória (inclusive versões anteriores) e rotinas agendadas ficam preservadas. A exclusão não pode ser desfeita e não altera o Slack ou outros aplicativos. Rotinas ativas podem criar novas coletas futuras; pause-as em **Rotinas** quando necessário. O servidor confere o plano novamente na confirmação e recusa a exclusão se os itens mudaram.


### Execução persistente

O worker inicia com o servidor Next.js via `instrumentation.ts`, consulta as filas a cada 3 segundos e executa uma organização de fonte ou coleta por vez. Fila, etapas e recorrências ficam no SQLite do disco persistente. Não depende de visitas à página, cron externo ou uma requisição HTTP longa. Requer o servidor Node/Render em execução; hospedagem que suspende o processo não executa durante a suspensão.

Após reinício, tarefas com lease expirado (90 segundos) são retomadas, até três tentativas automáticas. Cada leitura concluída guarda uma etapa e sua fonte na mesma transação; a organização também grava a página e o progresso juntos. Cancelar interrompe novos resultados e preserva o que já foi salvo. O limite por execução é de 8 minutos e 16 leituras, com até 90 KB de resposta por chamada; pedidos maiores devem ser divididos.

Ocorrências perdidas durante indisponibilidade são consolidadas em uma coleta ao retornar, e execuções da mesma rotina não se sobrepõem. Os horários respeitam o fuso informado: horários inexistentes na entrada do horário de verão são pulados; horários duplicados na saída executam apenas uma vez por dia. Coletas e rotinas têm paginação independente, com 10 registros por página e acesso a todo o histórico. Os filtros de status consultam todos os registros; trocar o filtro volta à primeira página. A atualização automática mantém a página escolhida.

A voz é por turnos (gravar → revisar → enviar → ouvir), sem ligação telefônica ou conversa full duplex. Leitura de PDFs, imagens, áudio anexado, crawling de URLs e embeddings não estão nesta versão; textos desses materiais podem ser colados ou obtidos pelas ferramentas Zapier.

Referências oficiais utilizadas: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [OpenRouter](https://openrouter.ai/docs/quickstart), [Zapier MCP](https://docs.zapier.com/mcp/get-started/quickstart), [ElevenLabs Speech to Text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [discos persistentes do Render](https://render.com/docs/disks).

## Executar

Requer Node 22.18+ (produção Node 22 Alpine) ou Node 24.

```sh
npm ci
npm run dev -- --port 3020
```

Crie a conta em `/conta` e siga o primeiro acesso. Nenhuma variável é obrigatória. Uma conta administrativa e um acervo por instância; não é um serviço multiusuário.

```sh
docker compose up --build
# http://localhost:3020
```

## Render e dados

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-daily-second-brain)

O push em `main` executa o workflow da suíte: constrói `ghcr.io/startse/daily-second-brain`, publica tags `latest` e SHA, captura a interface e atualiza o catálogo público e o branch `deploy-daily-second-brain`. Blueprint gerado a partir de `catalogo.json`: plano Starter, disco de 1 GB em `/app/data`, porta 10000 e `/api/health`. Uma instância instalada no Render é criada a partir desse Blueprint; a publicação do catálogo por si só não cria uma instância na conta de um usuário.

O processo usa usuário não root. `/app/data` contém `app.sqlite` (incluindo fila, agendamentos e progresso do primeiro acesso), chave mestra, sessão ChatGPT isolada e espelho Markdown `vault/`. SQLite é a fonte de verdade. O ZIP é gerado do banco, mesmo se um espelho em disco falhar. Não edite os espelhos esperando importação automática. Para backup completo, pare o serviço e copie todo o volume, incluindo a chave mestra. O ZIP é uma exportação de conhecimento: não contém conta, credenciais, conversas, fila ou agendamentos.

## Configuração alternativa por ambiente

| Variável | Finalidade | Onde obter |
| --- | --- | --- |
| `DATA_DIR` | Diretório persistente; padrão `./data` | Volume da instalação |
| `BRAIN_PROVIDER` | `chatgpt` (padrão) ou `openrouter` | Escolha do usuário |
| `CHATGPT_MODEL` | Modelo opcional da conta conectada | Catálogo da própria conta |
| `OPENROUTER_API_KEY` | Chave do OpenRouter | [OpenRouter Keys](https://openrouter.ai/settings/keys) |
| `OPENROUTER_MODEL` | Modelo, padrão `openrouter/auto` | Catálogo OpenRouter |
| `ZAPIER_MCP_URL` | URL secreta HTTPS do servidor | [Zapier MCP](https://mcp.zapier.com) |
| `ZAPIER_MCP_TOKEN` | Bearer opcional do servidor | Configuração Zapier MCP |
| `ELEVENLABS_API_KEY` | Transcrição e voz | [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) |
| `ELEVENLABS_VOICE_ID` | Voz opcional; padrão Rachel | Biblioteca da conta ElevenLabs |
| `BRAIN_RULES` | Regras editoriais; preferir editar na interface | Usuário |
| `CHAVE_MESTRA` | 32 bytes em base64; sem ela, app gera arquivo local | Gerada pela instalação |
| `PORT` | Porta HTTP; Docker 10000 | Hospedagem |

Variáveis do ambiente prevalecem sobre configurações da interface. `CONTA_DESLIGADA=1` é reservado ao contêiner efêmero de captura do catálogo e nunca deve ser configurado em uma instância real.

Credenciais salvas usam AES-256-GCM. Conta usa scrypt, sessão HttpOnly e proteção de origem nas mutações. O bridge ChatGPT limita o agente às ferramentas fornecidas, sem terminal, navegador ou ambiente da aplicação. Fontes e resultados são tratados como conteúdo não confiável.

## Verificação

```sh
npm test
npm run lint
npm run build
node ../scripts/verificar-jargao.mjs daily-second-brain
```

`tests/browser.mjs` valida conta, captura, organização, edição/restauração, chat, artefatos, reciclagem, regras, exportação, busca e layout móvel em um servidor com banco temporário vazio. Configure `PLAYWRIGHT_MODULE` para o pacote Playwright instalado e `TEST_BASE_URL` para o servidor. Gera capturas em `TEST_ARTIFACTS` (padrão `/tmp/daily-brain-review`). Testes de integração usam respostas controladas dos provedores; acesso real depende das credenciais conectadas pelo usuário.

`tests/captures-browser.mjs`, após o build, inicia o servidor standalone com banco temporário e respostas controladas para os serviços externos. Percorre o primeiro acesso inteiro, fecha a aba antes da conclusão, repete a instrução, cria/edita/pausa uma rotina e reinicia o processo para verificar execução agendada sem navegador. Valida também os layouts em 1440 px e 390 px. Nenhuma chamada real ao Slack é feita pelos testes.

`tests/capture-controls-browser.mjs` valida seleção múltipla e em lote, confirmação e falha ao salvar, persistência após recarregar, histórico com 75 coletas e paginação de 23 rotinas, incluindo edição e exclusão na última página. Usa somente serviços simulados.

Validação da experiência v1.4: `PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node tests/ux-browser.mjs` cobre início por texto, navegação, 10 mensagens Slack antigas, exclusão em cascata/seleção em lote, paginação e celular, com provedores locais simulados.

Validação da experiência v1.5: `PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node tests/organization-browser.mjs` usa o build standalone e provedores locais simulados. Cobre organização individual e em lote, fechamento do modal e da aba durante execução, navegação livre, erro ao enfileirar com seleção preservada, falha por fonte e nova tentativa, desconexão do acompanhamento, layout móvel e reinício do servidor sem navegador. Os testes de contrato cobrem deduplicação, limite de fila, gravação atômica, lease e exclusão concorrente.
