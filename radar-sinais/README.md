# Radar de Sinais

Versão **0.3.0** — [notas de versão](CHANGELOG.md).

O Radar reúne evidências do mercado, organiza sinais e mostra suas relações em um grafo. Cada radar tem nome, temas, contexto, fontes, páginas monitoradas e histórico próprios.

## Fluxo de uso

1. Crie sua conta no primeiro acesso. Em **Configurações**, conecte OpenRouter ou ChatGPT.
2. Em **Meus radares**, crie um radar com um nome como “IA na educação”. Use o seletor para alternar entre cadastros e **Renomear** para mudar um nome.
3. Abra **Temas, fontes e páginas**. Cadastre até 12 temas, o setor e o período (7, 30 ou 90 dias). Escolha buscadores e até seis sites de referência. Os artigos da StartSe já estão incluídos.
4. Adicione até oito **Páginas para monitorar**, escolhendo Bright Data ou Firecrawl para cada uma. O endereço completo, inclusive parâmetros que identificam o conteúdo, é preservado.
5. Salve as configurações e clique em **Atualizar radar**. Cada execução salva uma análise; **Análises deste radar** reúne as rodadas anteriores desse cadastro.
6. Explore o grafo com zoom, arraste, filtros e seleção de pontos. Em **Tela cheia**, leituras e sinais ficam em um painel translúcido sobre o mapa; **Ocultar/Exibir leituras e sinais** controla sua visibilidade.
7. Use **Conversar com a analista** para interpretar os sinais e relações da análise aberta. As respostas podem apontar fontes e destacar nós no mapa.

A seleção do radar é mantida no navegador e pode ser compartilhada pelo parâmetro `radarId` da URL. Análises salvas continuam acessíveis em `/r/[id]` e podem ser impressas em `/imprimir/[id]`.

## Fontes e leitura de páginas

- **Sem chave:** StartSe · Artigos (consulta pública direcionada pelo Google Notícias), Google Notícias, Hacker News, Reddit e GitHub. A disponibilidade depende de cada fonte; falhas isoladas não interrompem as demais. Reddit bloqueado pausa novas tentativas por 15 minutos.
- **SearchAPI:** pesquisa Google com idioma português, região Brasil, recorte temporal e filtro de site. A chave é enviada no cabeçalho de autorização. A API não fornece sempre uma data absoluta de publicação; nesses casos a análise registra “data não informada”.
- **Exa, Tavily e Bright Data:** buscas adicionais na web. Bright Data usa MCP Streamable HTTP com `search_engine` e `scrape_as_markdown`.
- **Grok · X Search:** conversas recentes no X, usando credenciais próprias da xAI.
- **Páginas cadastradas:** leitura direta em cada rodada, independente de aparecerem na busca. Bright Data usa `scrape_as_markdown`; Firecrawl usa `/v2/scrape`, formato Markdown e `maxAge: 0`. Páginas desativadas não são lidas. Falhas e chaves ausentes aparecem em **Sobre esta pesquisa**. Não há troca automática de ferramenta para a página.

Uma página monitorada representa o conteúdo observado na coleta. A data de coleta não é apresentada como publicação, nem como prova de mudança entre rodadas. A IA recebe esse limite explicitamente. Resultados de busca usam cache opcional de cinco minutos; páginas monitoradas são solicitadas novamente em cada execução.

A síntese cita somente URLs recebidas da coleta; referências inventadas são descartadas. A força deriva da quantidade e diversidade de fontes. O conteúdo externo é tratado como dado, sem autoridade para instruir o agente.

## Analista do Radar

O chat usa a mesma conexão de IA escolhida em Configurações. O servidor recupera a análise pelo identificador salvo: temas, setor, sinais, fontes, nós, arestas, leituras e ponto selecionado. Cada análise tem sua própria conversa na sessão da tela; trocar de análise ou radar reinicia a conversa. Mensagens não são persistidas no banco.

A agente distingue evidências de hipóteses e não consulta novas páginas durante a conversa. Links de fontes e botões de nós são validados contra o resultado salvo. O chat exige uma análise real, conta autenticada e IA conectada; dados de demonstração não são usados como evidência real.

## Monitoramento automático

Em **Temas, fontes e páginas → Acompanhamento automático**, escolha horários e fuso. O padrão é 08:00, 16:00 e 20:00 em `America/Sao_Paulo`. Há uma agenda diária por radar. Salve as configurações antes de ativá-la; cada execução usa os temas, fontes e páginas atuais desse radar.

**Notificações foram removidas.** Nenhum e-mail ou mensagem Slack é enviado, inclusive por agendas antigas. O resultado fica no histórico do radar. É possível editar horários, pausar, retomar, executar agora ou excluir a agenda.

O servidor precisa permanecer ativo. O agendador verifica a cada minuto; após interrupção executa apenas a rodada pendente mais recente. O lock no SQLite evita execução simultânea e expira após 30 minutos em caso de queda. Três falhas seguidas pausam a agenda. O gatilho autenticado `POST /api/rotinas/executar` permanece disponível.

## Migração e persistência

Na primeira execução da versão 0.3.0, temas e fontes existentes viram o cadastro **Meu radar**. Análises e agendas antigas são vinculadas por temas e setor; perfis diferentes ganham cadastros próprios. Os identificadores e links das análises permanecem iguais. A migração é transacional e roda antes do agendador. Conta, chaves e configurações legadas são preservadas.

SQLite, chave mestra e sessão ChatGPT ficam em `DATA_DIR` (padrão `./data`). Preserve esse volume entre publicações. Chaves ficam cifradas em repouso. Variáveis de ambiente têm prioridade sobre valores salvos na interface; veja [.env.example](.env.example).

**Dados de teste:** em Configurações ou no fim do histórico, **Remover dados de teste** exclui exclusivamente análises com `meta.demo: true` e oculta a demonstração após recarregar. Cadastros, resultados reais, conta e integrações são preservados. Ao conectar IA, o app mostra resultados reais ou o convite para gerar a primeira análise.

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

A suíte cobre migração e isolamento de radares, busca StartSe/SearchAPI, leitura de páginas, validação de fontes, conversa contextual, agendas sem notificações, autenticação de IA, limpeza de exemplos e grafo. Serviços externos são simulados nos testes. A validação visual de produção cobre desktop e celular; detalhes em [tasks/radar-sinais-0.3.0.md](../tasks/radar-sinais-0.3.0.md).

Referências: [SearchAPI Google](https://www.searchapi.io/docs/google), [Firecrawl Scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape), [Bright Data MCP](https://docs.brightdata.com/ai/mcp-server/overview), [Codex App Server](https://developers.openai.com/codex/app-server).
