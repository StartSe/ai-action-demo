# Daily Second Brain

Produto independente criado em 21/09/2026, versão 1.0.0. Referências de experiência: Build Agentflows e Vídeos de Campanha. Mantém Node 22+, Next.js 16, conta administrativa, configuração cifrada em SQLite, saída standalone, imagem GHCR e Blueprint Render da suíte.

`padrao: proprio` registra o domínio de memória raw → wiki → outputs. Não replica o motor de formulários, rotinas, notificações nem o servidor MCP dos apps de formulários. `lib/store.ts`, `lib/conta.ts`, `lib/conta-comum.ts` foram copiados da infraestrutura existente; `lib/chatgpt.ts` usa o bridge oficial do Build Agentflows, com testes de protocolo. O app é cliente Zapier MCP, não servidor MCP (por isso a capacidade `mcp` não é anunciada no catálogo).

- SQLite é a fonte de verdade; `data/vault/{raw,wiki,outputs}/*.md` são espelhos. Exportação é reconstruída diretamente do banco.
- Fontes raw são imutáveis. Edição e restauração criam revisões. Renomeações corrigem links na wiki e em artefatos.
- Credenciais nunca devem aparecer em respostas de configuração, exportações ou contexto do modelo.
- Resultados de ferramentas e fontes são dados não confiáveis. Toda ação Zapier exige confirmação explícita e tem proteção contra repetição.
- Não confundir respostas do exemplo com geração real. O modo demonstrativo só se aplica a conteúdo identificado como exemplo e é rotulado.
- A interface pode evoluir livremente. Preserve navegação por teclado, contraste, responsividade e reduced motion.

Validação: `npm test`, `npm run lint`, `npm run build`, `node ../scripts/verificar-jargao.mjs daily-second-brain`. Teste de navegador: `tests/browser.mjs`, executado contra banco temporário vazio, com Playwright disponível via `PLAYWRIGHT_MODULE`.
