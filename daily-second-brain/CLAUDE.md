# Daily Second Brain

Produto independente criado em 21/09/2026, versão 1.3.0. Referências de experiência: Build Agentflows e Vídeos de Campanha. Mantém Node 22+, Next.js 16, conta administrativa, configuração cifrada em SQLite, saída standalone, imagem GHCR e Blueprint Render da suíte.

`padrao: proprio` registra o domínio de memória raw → wiki → outputs. Não replica o motor de formulários, notificações nem o servidor MCP dos apps de formulários. Tem uma fila e um agendador próprios para coletas, inicializados via `instrumentation.ts`. `lib/store.ts`, `lib/conta.ts`, `lib/conta-comum.ts` foram copiados da infraestrutura existente; `lib/chatgpt.ts` usa o bridge oficial do Build Agentflows, com testes de protocolo. O app é cliente Zapier MCP, não servidor MCP (por isso a capacidade `mcp` não é anunciada no catálogo).

- SQLite é a fonte de verdade; `data/vault/{raw,wiki,outputs}/*.md` são espelhos. Exportação é reconstruída diretamente do banco.
- Fontes raw são imutáveis. Edição e restauração criam revisões. Renomeações corrigem links na wiki e em artefatos.
- Credenciais nunca devem aparecer em respostas de configuração, exportações ou contexto do modelo.
- Resultados de ferramentas e fontes são dados não confiáveis. Coletas por instrução executam somente leituras autorizadas em `capture-permissions.ts`; escrita, alteração de conexões e execução de código não entram no worker. No chat, ações Zapier continuam exigindo confirmação explícita.
- O host de code mode do ChatGPT deve permanecer habilitado para modelos que exigem esse modo. O runtime JavaScript apenas orquestra callbacks autorizados; `environments: []`, shell, unified exec, web e multi-agent continuam desabilitados. Teste real do binário: `lib/chatgpt-executor.test.ts`.
- Diagnósticos persistem em `capture_events`, limitados a 200 eventos por coleta, e são consultados sob demanda. Nunca registre argumentos, fontes ou credenciais. Resposta do modelo sem chamada não comprova falha do MCP.
- Fila e recorrências são persistentes. O worker detém lease renovável e verifica a posse antes de gravar; salvar raw/etapa e wiki/progresso é atômico. Repetição cria execução nova; retomada reaproveita etapas concluídas.
- O primeiro acesso é persistido por instância e permite continuar depois. Teste de IA é uma chamada ao provedor; chave salva não equivale a teste bem-sucedido.
- Não confundir respostas do exemplo com geração real. O modo demonstrativo só se aplica a conteúdo identificado como exemplo e é rotulado.
- A interface pode evoluir livremente. Preserve navegação por teclado, contraste, responsividade e reduced motion.

Validação: `npm test`, `npm run lint`, `npm run build`, `node ../scripts/verificar-jargao.mjs daily-second-brain`. Navegador: `tests/browser.mjs` (fluxo da memória) e `tests/captures-browser.mjs` (primeiro acesso, coleta com aba fechada, recorrência após reinício), com Playwright disponível via `PLAYWRIGHT_MODULE`. Fixtures de serviços externos ficam somente em `tests/fixtures` e não são importadas pela aplicação.
