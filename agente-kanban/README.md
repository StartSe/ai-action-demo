# Orbit — Kanban gerenciado por agentes

Versão **0.2.0**. Veja as novidades no [histórico de versões](CHANGELOG.md).

Workspace para cruzar conversas, atividades e objetivos do ciclo. Os agentes mantêm um quadro local persistente, seguindo a skill do time e rotinas com prompts, ferramentas e horários configuráveis. Correções humanas entram no contexto dos agentes e podem virar novas regras da skill.

## Rodar

Requer Node.js 22.13+ (SQLite nativo) e npm.

```sh
npm install
npm run dev
```

Abra http://localhost:3000, crie a conta administrativa e entre. A primeira visita cria **dados de exemplo explicitamente identificados**, com todas as rotinas pausadas. **Começar meu quadro** remove apenas cartões de exemplo que ainda não foram editados. Atividades criadas e correções do usuário são preservadas.

O app persiste os dados em `DATA_DIR/app.sqlite` (padrão `./data`). As credenciais de API são cifradas com AES-256-GCM; a chave mestra fica em `DATA_DIR/chave-mestra`, com permissão 0600. Preserve o diretório inteiro nos backups. Uma instalação corresponde a um workspace e uma conta administrativa.

## Fluxo principal

1. **Conexões:** configure OpenRouter ou ChatGPT e conecte seu servidor Zapier MCP.
2. Habilite as ferramentas que consultam o quadro e as conversas. Escolha separadamente ferramentas que podem enviar perguntas de prazo.
3. **Skill do time → Construir com o agente:** descreva o processo, incluindo canais, reuniões, horários e restrições. Com IA conectada, o modelo gera a skill e as rotinas usando as ferramentas habilitadas. Sem IA, o app oferece um modelo inicial explicitamente identificado, com horários sugeridos para editar.
4. Revise os prompts, a recorrência, o fuso e as ferramentas. A publicação salva uma versão da skill e cria ou atualiza as rotinas propostas, pausadas para revisão. O agente pode ajustar rotinas existentes sem duplicá-las; rotinas não incluídas na proposta permanecem como estavam.
5. Ative as rotinas. **Executar agora** permite conferir o resultado antes de ativar o agendamento.
6. **Quadro:** acompanhe To do, Doing, Done e Archived. Clique para editar, altere a coluna no formulário ou arraste um cartão. Busca e filtros de prioridade/atraso ajudam na revisão.
7. **Histórico:** consulte as 100 execuções mais recentes, filtre por rotina/status e abra as etapas, resultados e falhas. O banco preserva as execuções anteriores.
8. **Skill do time:** revise correções manuais e incorpore aprendizados à skill. O objetivo, as datas e o nome do ciclo são editáveis ali.

## Zapier MCP e fontes

Crie um servidor em https://mcp.zapier.com, conecte as contas desejadas e adicione as ferramentas. Cole a URL secreta de conexão na tela **Conexões**. O cliente usa o SDK MCP oficial, com inicialização do protocolo, Streamable HTTP, negociação de sessão, paginação de ferramentas e tratamento de erros.

Cada ferramenta começa desabilitada. Habilite como **Leitura de informações** apenas ferramentas que consultam dados. Inclua nas rotinas a ferramenta de leitura do board e a de leitura/busca das conversas. As ferramentas do Zapier têm descrições e schemas próprios; os agentes constroem os argumentos a partir deles.

Quando o Zapier declara que uma ação altera dados, o Orbit impede habilitá-la como leitura. Consultas com campos dinâmicos incluem automaticamente os auxiliares de leitura indicados pelo provedor, como a lista de quadros disponíveis. A tela identifica essas dependências; o agente só pode usá-las para consultar campos de ferramentas autorizadas na própria rotina. Desabilitar a consulta principal também remove o acesso herdado pelo auxiliar.

Para **Perguntas de prazo**, mapeie os campos da mensagem e do destinatário da ferramenta. A atividade precisa ter responsável e contato (por exemplo, ID do Slack). O servidor constrói uma pergunta objetiva de prazo e fixa o destinatário; o modelo não escolhe o texto final nem substitui o contato. A rotina deve incluir explicitamente essa ferramenta. Cartões concluídos, arquivados ou com prazo ainda vigente não recebem perguntas. Há no máximo uma tentativa por atividade/dia, inclusive se uma falha de rede deixar o resultado do envio incerto. Ferramentas que não expõem campos separados de mensagem/destinatário não podem enviar perguntas por esse fluxo.

Um Trello configurado em `/setup` também aparece como fonte de leitura nas rotinas. O quadro Orbit é a visão consolidada local; alterações nele **não são replicadas automaticamente aos boards de origem**. Os IDs de origem evitam duplicação e cada alteração do agente exige referência a evidências consultadas na execução ou a um pedido explícito do usuário.

Documentação do provedor: https://docs.zapier.com/mcp/get-started/quickstart

## Modelos

### OpenRouter

Na tela **Conexões**, selecione OpenRouter e salve uma chave ou use a autorização OAuth existente. O modelo é configurável por seu ID no OpenRouter. A chave salva não volta ao navegador. As variáveis `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`, quando definidas, têm prioridade sobre a configuração da tela.

A rotina e o construtor de processos fazem chamadas JSON reais ao modelo escolhido. Sem credencial, executar uma rotina registra uma falha explicativa; não simula uma execução bem-sucedida.

### Assinatura do ChatGPT via Codex

O conector usa o SDK oficial do Codex e um login dedicado à aplicação, separado da configuração pessoal do desenvolvedor. Em **Conexões → ChatGPT → Conectar com ChatGPT**, copie o código, abra a página de autorização da OpenAI e conclua o login. A tela acompanha o resultado automaticamente. O código pode ser retomado ao recarregar a página ou cancelado; o Orbit encerra a espera após dez minutos. Reiniciar o servidor interrompe uma autorização pendente, mas preserva um login já salvo.

O login pela tela usa o protocolo de contas do Codex App Server por stdio. Esse protocolo é experimental; o teste local verifica a inicialização com a versão instalada, sem iniciar login nem chamar modelos. Se o login por dispositivo estiver indisponível, confira sua habilitação nas configurações de segurança do ChatGPT e as políticas do workspace. Como alternativa, no mesmo servidor e usuário que executa o app:

```sh
npm run connect:chatgpt
```

Siga o login por dispositivo no navegador. Tanto a tela quanto o helper guardam a autenticação em `DATA_DIR/codex/auth.json`. Se estiver usando um `DATA_DIR` personalizado, use o mesmo diretório no app e no comando. Depois do login pelo terminal, selecione **ChatGPT** em Conexões e clique em **Verificar conexão**. A disponibilidade do login é mostrada separadamente do sucesso de uma chamada; execute uma rotina para validar o acesso ao modelo. O fluxo pendente fica na memória de uma única instância do servidor; use afinidade de sessão se houver múltiplos processos web.

O SDK respeita os modelos e limites da assinatura. `KANBAN_CODEX_MODEL` permite selecionar um modelo disponível. O processo do Codex roda em um diretório dedicado, somente leitura, sem shell, busca web, apps, plugins ou subagentes habilitados. As ferramentas de negócio são executadas pelo próprio servidor Orbit, após as verificações da rotina.

Não é uma chave da API OpenAI nem uma conversão da assinatura para créditos de API. Referências oficiais: [autenticação](https://learn.chatgpt.com/docs/auth), [SDK do Codex](https://learn.chatgpt.com/docs/codex-sdk) e [protocolo do App Server](https://learn.chatgpt.com/docs/app-server).

## Agendamentos e operação

- Frequências diária, dias úteis e semanal; horário `HH:MM` e fuso IANA por rotina, como `America/Sao_Paulo`.
- O servidor verifica as rotinas a cada minuto enquanto está ativo. Se estiver fora do ar no horário, executa ao voltar **no mesmo dia**, quando elegível. Não repõe dias anteriores.
- Não executa slots anteriores à criação da rotina. Uma chave única no SQLite impede duplicação de um slot e execução simultânea da mesma rotina, inclusive em processos diferentes.
- Limite de 12 passos por execução, até 90 segundos por chamada de IA e orçamento total de aproximadamente 4 minutos entre passos. Execuções interrompidas são sinalizadas como falha quando uma nova execução é solicitada após 10 minutos.
- Edições de cartões, skills e rotinas verificam a revisão: uma tela desatualizada não sobrescreve silenciosamente mudanças mais recentes.
- O histórico preserva resultados parciais quando uma chamada falha. Uma rotina com ação malsucedida não termina com status de sucesso.
- Para instalações que hibernam, o gatilho autenticado `POST /api/rotinas/executar` também executa as rotinas Orbit elegíveis. Gere o código em `/setup` e envie `Authorization: Bearer <codigo>`. Configure o agendador externo para chamar a cada minuto.
- O mesmo arquivo SQLite precisa ser compartilhado pelo processo web e pelo agendador. Para múltiplas réplicas em hosts separados, migre a persistência/claims para um banco compartilhado antes de escalar.

## Produção

```sh
npm run build
npm start
# ou
docker compose up --build
```

O Docker mantém `DATA_DIR=/app/data`; use o volume persistente do compose. O login pela tela também funciona no contêiner. Para usar a alternativa pelo terminal, execute como o usuário da aplicação:

```sh
docker compose exec agente-kanban node scripts/connect-chatgpt.mjs
```

Instalações sem disco persistente perdem dados, configuração e login a cada deploy.

Use `npm run build`: o passo `postbuild` remove dados de execução dos arquivos de rastreamento e da cópia standalone. Isso também cobre os rastreamentos de proxy e instrumentation desta versão do Next, que podem incluir o diretório local mesmo com exclusões configuradas. O banco e o login originais permanecem em `DATA_DIR`; não são distribuídos junto do código.

## Verificação

```sh
npm test                 # domínio, persistência, concorrência, agendamentos e agente com provedores simulados
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e         # build de produção + servidor isolado na porta 3211 + navegador
```

Os testes usam bancos temporários, credenciais fictícias e nenhum envio externo. O teste de navegador cobre autenticação, edição e persistência, arrastar cartões, aprendizado da skill, criação/edição de rotinas, histórico de falhas, navegação móvel e estados do login ChatGPT com respostas simuladas. Os testes do gerenciador cobrem conclusão, cancelamento concorrente, expiração e falhas; uma consulta local de conta vazia verifica o protocolo instalado sem abrir uma autorização real.

O teste `tests/scheduled-process.test.mts` percorre a geração e publicação do processo, ativação da rotina, agendamento, consulta ao board e às conversas, criação do cartão e inclusão do aprendizado humano na execução seguinte. Usa o código de produção dos gateways OpenRouter/MCP, motor e persistência, simulando apenas as respostas HTTP externas. Também verifica a deduplicação do horário e o registro de falha quando uma fonte fica indisponível. Ele comprova a ligação entre os componentes; não avalia a qualidade das decisões de um modelo real.

Para apontar a uma instância de teste já isolada, defina `ORBIT_E2E_BASE_URL`; não use uma instância com dados de trabalho. Testes locais não validam credenciais, permissões ou quotas de contas externas reais.

## Estrutura e compatibilidade

- `components/OrbitWorkspace.tsx`, `app/orbit.css`: interface responsiva do workspace.
- `lib/workspace-store.ts`: cartões, versões, correções, rotinas e histórico em SQLite.
- `lib/workspace-agent.ts`: construtor de processos, execução com evidências e ferramentas autorizadas.
- `lib/workspace-ai.ts`: OpenRouter e SDK do Codex.
- `lib/chatgpt-login.ts`, `lib/codex-auth-client.ts`: autorização ChatGPT por dispositivo e ciclo de vida do processo de login.
- `lib/workspace-mcp.ts`: conexão, descoberta e chamadas ao Zapier MCP; leitura do Trello direto.
- `lib/workspace-schedule.ts`: calendário por fuso e identificação dos slots.
- `app/api/workspace/route.ts`: operações autenticadas, com validação de entrada.
- `instrumentation.ts`: agendador local; `/api/rotinas/executar`: gatilho externo autenticado.

A conversa anterior com Trello/MCP permanece em `/conversa`. `/setup`, histórico anterior, páginas de resultados, impressão, formulários públicos e MCP de entrada continuam disponíveis. Os resultados e o quadro legado permanecem separados da visão consolidada Orbit. Nenhum dado anterior é apagado pela nova interface.
