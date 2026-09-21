# Prospecção com IA 0.3.0: conta de IA (OpenRouter ou ChatGPT), modelos e jornada revisada

Implementação e verificação em 20/09/2026, no worktree `ai-action-demo-prospeccao-release` (branch `release/prospeccao-ia-0.3.0`, criado a partir de `origin/main`).

## O que mudou

- **Conta de IA em Configurações.** O cartão "Inteligência artificial" abre com a escolha entre OpenRouter (cartão compartilhado da suíte, agora embutido) e ChatGPT (login por código de dispositivo no Codex App Server 0.155.1, o mesmo conector do Radar de Sinais e do Build Agentflows, com sessão isolada em `DATA_DIR/chatgpt`). A escolha fica em `AI_PROVIDER` e governa toda a camada de IA: leitura de produto pelo site, qualificação com evidências, hipótese de dor, estratégia e mensagens, busca livre e ferramentas MCP. Não há troca automática entre contas em caso de erro; `aiEnabled()` passou a ser assíncrona e todos os chamadores usam `await`.
- **Modelos do OpenRouter.** O menu passou a ter o grupo "Mais usados" (GPT-5.4 Mini, GPT-5.4, GPT-5.6 Luna, Gemini 3.8 Flash, Gemini 3.1 Pro, Claude Sonnet 5, Claude Haiku 4.5, DeepSeek V4.1 Flash, Grok, Llama, Mistral e Qwen), sempre conferidos no catálogo vivo; variantes de lote, imagem, áudio, moderação e código ficam de fora. A rede de segurança sem chave traz os mesmos pagos. Ids conferidos em `openrouter.ai/api/v1/models` em 20/09/2026.
- **Jornada Produto › Prospecção › Leads.** Nova prospecção com indicador numerado dos quatro passos (componente compartilhado `Passos`) e uma orientação por passo. Página da prospecção com tipo de busca, data e "Exemplo" em chips, funil em cinco números que viram abas quando há lista de pessoas, evidências dos cartões de empresa resumidas e abertas ao clicar, e "Editar perfil ideal" no lugar de "Editar estratégia". Ficha do lead em duas colunas quando aberta como página (o painel lateral continua em uma coluna). Lista de Leads com a coluna "Abordagem".
- **Infraestrutura.** `/api/status` e `/api/setup` devolvem `ai`/`pronto` pela conta escolhida e não sugerem mais o cartão de Notificações (escondido neste app). `/api/health` expõe a versão. `next.config.ts` inclui o conector no standalone. Exceções registradas em `scripts/padrao-excecoes.json` e `scripts/jargao-excecoes.json`.

## Validação

- `npm test`: 65 testes aprovados (eram 51). Novos: protocolo do conector com fixture simulado (login, modelos, resposta incremental, ferramenta dinâmica, erro sem resposta simulada, cancelamento), conta escolhida governando status, setup, geração e leitura de produto sem fallback (inclui 400 para modelo inexistente e 409 com `AI_PROVIDER` no ambiente) e curadoria do catálogo de modelos.
- `npm run lint`: zero erros; um aviso pré-existente (`<img>` em `components/setup.tsx`). `npx next typegen` seguido de `tsc --noEmit`: sem erros. `npm run build`: aprovado.
- `scripts/verificar-padrao.sh prospeccao-ia`: seis divergências aceitas e registradas com motivo; paleta aprovada. `node scripts/verificar-jargao.mjs prospeccao-ia`: nenhum jargão. `git diff --check`: limpo.
- Standalone com dados isolados (`CONTA_DESLIGADA=1`, porta 3105): `/api/health` com a versão; `/api/status` com "Inteligência artificial" como primeiro próximo passo sem conta; `PUT /api/ia` para ChatGPT subiu o conector oficial real (`/api/chatgpt` respondeu conta nula, sem erro) e o status passou a `provedor: chatgpt`, modelo "ChatGPT · automático" e visão desligada; modelo inexistente devolveu 400; voltar ao OpenRouter com uma chave falsa ligou a IA e o teste de conexão devolveu "A chave da IA foi recusada"; exemplo semeado e páginas respondendo 200.
- Capturas por CDP (Chrome headless) em 1400 px e 390 px: `/setup` com OpenRouter e com ChatGPT, `/prospeccoes/nova`, `/prospeccoes/[id]` nos modos pessoas e empresas, `/leads` e `/leads/[id]`. Zero erros de console e `scrollWidth === clientWidth` em todas.

## Limites

- Não houve login em uma conta ChatGPT real nem geração com ela: o protocolo foi testado com o fixture simulado e a subida do binário real foi observada só até a leitura da conta.
- Nenhuma chamada real ao OpenRouter, à Bright Data ou às demais fontes; as telas de resultado com IA real não foram exercitadas neste ambiente.
- A imagem Docker não foi construída localmente; o GitHub Actions constrói e publica no push para `main`.
- A curadoria de modelos depende dos ids do catálogo do OpenRouter; um id que sair do catálogo some sozinho do menu, e o valor salvo passa a aparecer como "modelo indisponível" com a ação de trocar.

Referência: [Codex App Server oficial](https://developers.openai.com/codex/app-server).
