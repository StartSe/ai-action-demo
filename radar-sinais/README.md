# Radar de Sinais

Versão **0.4.0** — [notas de versão](CHANGELOG.md).

O Radar reúne evidências do mercado, organiza sinais e mostra suas relações em um grafo. Cada radar tem nome, temas, contexto, fontes, páginas monitoradas e histórico próprios.

## Fluxo de uso

1. Crie sua conta e conecte OpenRouter ou ChatGPT em **Configurações**.
2. Em **+ Novo radar**, preencha nome, palavras-chave e contexto no modal. **Fontes e páginas** permite escolher buscadores, sites e URLs para leitura direta. **Editar radar** abre o mesmo formulário com o cadastro completo.
3. Com **Acompanhar diariamente** marcado, temas salvos e IA conectada, a agenda é criada automaticamente para 08:00 em `America/Sao_Paulo`. A sincronização roda no servidor mesmo com o navegador fechado. Agendas existentes mantêm seus horários e pausas.
4. A analista desdobra as palavras-chave em buscas de adoção, resultados e riscos, consulta as fontes habilitadas, lê páginas e condensa as evidências. **Sobre esta pesquisa** mostra as consultas e eventuais limitações.
5. Use **Radar ativo** para alternar entre cadastros. Na tela inicial, os cartões selecionam o radar exibido; mapa, leituras, destaques e acompanhamento usam esse cadastro.
6. Marque sinais **Em foco** ou **Possível hype** e sinalize artigos importantes com a estrela. Essas escolhas orientam as próximas buscas, a síntese e o chat. Hype é uma hipótese para investigar, nunca uma conclusão automática.
7. Abra o balão **Conversar com o radar** para conversar por texto ou voz. O nome do radar aparece discretamente e sua memória permanece ao recarregar ou abrir outra análise desse mesmo radar.

Os resultados continuam disponíveis em `/r/[id]` e podem ser impressos em `/imprimir/[id]`. A seleção no explorador é mantida no navegador e compartilhada por `radarId` na URL.

## Fontes e leitura de páginas

- **Sem chave:** StartSe · Artigos (consulta pública direcionada pelo Google Notícias), Google Notícias, Hacker News, Reddit e GitHub. A disponibilidade depende de cada fonte; falhas isoladas não interrompem as demais. Reddit bloqueado pausa novas tentativas por 15 minutos.
- **SearchAPI:** pesquisa Google com idioma português, região Brasil, recorte temporal e filtro de site. A chave é enviada no cabeçalho de autorização. A API não fornece sempre uma data absoluta de publicação; nesses casos a análise registra “data não informada”.
- **Exa, Tavily e Bright Data:** buscas adicionais na web. Bright Data usa MCP Streamable HTTP com `search_engine` e `scrape_as_markdown`.
- **Grok · X Search:** conversas recentes no X, usando credenciais próprias da xAI.
- **Páginas cadastradas:** leitura direta em cada rodada, independente de aparecerem na busca. Bright Data usa `scrape_as_markdown`; Firecrawl usa `/v2/scrape`, formato Markdown e `maxAge: 0`. Páginas desativadas não são lidas. Falhas e chaves ausentes aparecem em **Sobre esta pesquisa**. Não há troca automática de ferramenta para a página.

Uma página monitorada representa o conteúdo observado na coleta. A data de coleta não é apresentada como publicação, nem como prova de mudança entre rodadas. A IA recebe esse limite explicitamente. Resultados de busca usam cache opcional de cinco minutos; páginas monitoradas são solicitadas novamente em cada execução.

A síntese cita somente URLs recebidas da coleta; referências inventadas são descartadas. A força deriva da quantidade e diversidade de fontes. O conteúdo externo é tratado como dado, sem autoridade para instruir o agente.

## Analista do Radar

O chat usa a mesma conexão de IA escolhida em Configurações. A conversa fica no SQLite por cadastro de radar, com fontes, referências ao mapa, data e canal (texto/voz). Abrir outra análise do mesmo cadastro recupera a memória. Outros radares têm conversas separadas. A tela recupera as últimas 100 mensagens; a IA recebe as últimas 24, a análise aberta e até cinco análises recentes, com sinais e leituras datados, além dos destaques da pessoa. Não há memória ilimitada no contexto do modelo.

O servidor resolve todos os dados pelos identificadores salvos. Referências e links retornados pela IA são filtrados contra o contexto; nós antigos apontam para a análise de origem. Uma trava por radar evita respostas concorrentes misturadas. Perguntas e respostas são gravadas juntas somente após uma resposta válida.

**Voz em tempo real:** conecte a ElevenLabs, selecione uma voz em português e verifique o acesso a Agents em **Configurações → Conversa por voz**. A chave precisa de leitura de vozes e leitura/escrita de Agents. A verificação prepara um agente privado e testa a autorização de sessão. O navegador recebe somente uma URL assinada temporária. O protocolo WebSocket e a captura PCM via AudioWorklet seguem a experiência do predictive-harness, dentro do balão. Perguntas sobre o radar chamam o mesmo motor do chat; resultados e fontes ficam salvos. Fechar, trocar de radar ou encerrar libera microfone, áudio e conexão. HTTPS ou localhost são necessários para o microfone.

Ao usar voz, áudio e contexto são enviados à ElevenLabs; o provedor de IA escolhido analisa as perguntas. A gravação de áudio do agente é desativada na configuração criada pelo app. As condições de retenção do serviço dependem da conta.

## Monitoramento automático

**Acompanhamento diário**, no início e no explorador, mostra horários, estado, pausa/retomada e **Histórico de atualizações**. Cada tentativa registra origem, início, término, status, falha e link da análise concluída. O histórico mostra as últimas 50 execuções, sem apagar as anteriores. **Pesquisar agora** enfileira a pesquisa, responde imediatamente e continua em segundo plano; os registros são consultados a cada cinco segundos. O explorador recebe a nova análise ao terminar uma rodada.

O servidor verifica a agenda a cada minuto e também na inicialização. Após uma interrupção executa apenas a rodada pendente mais recente. A fila manual é persistente; o lock SQLite impede concorrência da mesma agenda e é renovado enquanto o trabalho roda. Um lease sem renovação expira após 30 minutos; a execução interrompida permanece no histórico. Três falhas seguidas pausam a agenda. O gatilho autenticado `POST /api/rotinas/executar` também permanece disponível.

Não há notificações externas. O servidor e o volume de dados precisam permanecer ativos; a agenda não depende da aba do navegador. A instalação é um servidor Node/Docker persistente, não uma função serverless de curta duração.

## Migração e persistência

Na primeira execução da versão 0.3.0, temas e fontes existentes viram o cadastro **Meu radar**. Análises e agendas antigas são vinculadas por temas e setor; perfis diferentes ganham cadastros próprios. Os identificadores e links das análises permanecem iguais. A migração é transacional e roda antes do agendador. Conta, chaves e configurações legadas são preservadas.

SQLite, chave mestra e sessão ChatGPT ficam em `DATA_DIR` (padrão `./data`). Preserve esse volume entre publicações. Chaves ficam cifradas em repouso. Variáveis de ambiente têm prioridade sobre valores salvos na interface; veja [.env.example](.env.example).

**Dados de teste:** no fim do histórico, **Remover dados de teste** exclui exclusivamente análises com `meta.demo: true` e oculta a demonstração após recarregar. Cadastros, resultados reais, conta e integrações são preservados. Ao conectar IA, o app mostra resultados reais ou o convite para gerar a primeira análise.

## Conexão de IA

- **OpenRouter:** OAuth ou chave, escolha do modelo e teste de conexão.
- **ChatGPT:** login por código de dispositivo via Codex App Server oficial (`@openai/codex` 0.155.1), sessão isolada em `DATA_DIR/chatgpt`. O uso depende do acesso e dos limites da conta.

O provedor escolhido atende à síntese, ao chat e às rotinas. Uma falha não troca automaticamente de conta nem produz demonstrações como resultado real.

## Desenvolvimento e publicação

Next.js 16, React 19, TypeScript, Tailwind 4 e SQLite do Node. Use Node 22 ou superior.

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

`npm run build -- --webpack` é a alternativa quando o ambiente restringe a abertura de processos/portas do Turbopack. Os testes rodam em sequência para que a medição de desempenho do layout não dispute CPU com outros testes.

```bash
docker compose up --build
# Imagem publicada pela suíte:
docker run --rm -p 3011:10000 -v radar-sinais-dados:/app/data ghcr.io/startse/radar-sinais:latest
```

O GitHub Actions constrói e publica a imagem ao receber alterações na `main`. O catálogo identifica a versão; `/api/health` também a informa. O Blueprint do Render é gerado a partir do `catalogo.json`, usa disco persistente e está disponível no [repositório de deploy](https://github.com/StartSe/ai-action-app-deploy/tree/deploy-radar-sinais).

## Validação

A suíte cobre migração, isolamento, memória entre análises, planejamento das buscas, destaques, fila e recuperação de execuções, permissões de voz, captura de áudio, fontes e grafo. Serviços externos são simulados. `tests/browser.mjs` exercita desktop/celular, persistência, trabalho em segundo plano, conversa por voz via WebSocket simulado e liberação do microfone. Use `PLAYWRIGHT_MODULE` para indicar uma instalação de Playwright e `RADAR_BASE_URL` para apontar ao servidor de teste. O preload `tests/fixtures/services.mjs` deve ser usado somente em testes. Detalhes em [tasks/radar-sinais-0.4.0.md](../tasks/radar-sinais-0.4.0.md).

Referências: [SearchAPI Google](https://www.searchapi.io/docs/google), [Firecrawl Scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape), [Bright Data MCP](https://docs.brightdata.com/ai/mcp-server/overview), [Codex App Server](https://developers.openai.com/codex/app-server).

Referência de voz: [ElevenLabs WebSocket](https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets).
