# Pesquisa estratégica do Radar de Sinais

Pesquisa técnica realizada em 18/09/2026. Referência da last30days: commit `beb7ed1868f034f198842174bfe2694e44b78363`, skill 3.25.0. Código consultado localmente a partir do repositório oficial; nenhuma credencial de navegador foi lida e a skill não foi instalada nem executada como serviço.

## O que torna a last30days recente

A [skill](https://github.com/mvanhorn/last30days-skill/blob/beb7ed1868f034f198842174bfe2694e44b78363/skills/last30days/SKILL.md) coordena pesquisa em serviços externos. A atualidade vem dos coletores, filtros temporais e metadados, não do conhecimento do modelo.

- Reddit: ScrapeCreators é uma opção autenticada; há adaptadores públicos/RSS e estratégias alternativas no código. Limites e bloqueios tornam importante reportar a cobertura real.
- X: `env.py` escolhe um backend disponível. A cadeia padrão inclui Bird, xAI, xurl e Xquik; hosts específicos podem restringir a APIs oficiais. Bird depende de credenciais de sessão. Este projeto escolheu exclusivamente a ferramenta oficial X Search da xAI para essa cobertura.
- YouTube, redes sociais e outras fontes: adaptadores específicos, com yt-dlp e/ou ScrapeCreators conforme a fonte. HN, GitHub, pesquisa científica e outras comunidades ampliam o tipo de evidência. Essas fontes não são todas implementadas neste radar.
- Bright Data: a versão inspecionada possui adaptador CLI de pipelines, com autenticação gerida pelo CLI. O radar já usava MCP HTTP Search Engine e Scraper as Markdown e mantém esse caminho.
- `dates.py` calcula intervalos relativos à data de consulta (ou `--as-of`), normaliza datas e atribui confiança baixa quando a data está ausente. Recência sem data vale zero. `normalize.py` preserva metadados e engajamento; `cluster.py`, `dedupe.py` e `fusion.py` sustentam agrupamento e fusão entre fontes.

[Árvore dos coletores e processamento](https://github.com/mvanhorn/last30days-skill/tree/beb7ed1868f034f198842174bfe2694e44b78363/skills/last30days/scripts/lib). O motor web da versão inspecionada aceita backends como Brave, Exa, Serper, Parallel e busca sem chave (`--web-provider` no script). Exa também existe na last30days; Tavily é uma integração própria deste app. Estes provedores não são apresentados como um serviço last30days. A interface diz explicitamente que se inspira na abordagem e não executa a skill.

## Comportamento implementado

`/` apresenta o ecossistema e os indicadores derivados do cadastro e do último radar real. Sem pesquisa real, somente mapa e insights ilustrativos aparecem, com identificação de demonstração. Nenhum crescimento percentual ou sentimento é inventado.

`/termos` permite cadastrar, editar, categorizar, pausar e remover até 12 termos. Os termos ficam no SQLite do app, independentemente de ter IA ou notificações conectadas. A busca manual carrega os termos ativos. O monitoramento permite salvar uma seleção de termos com horários e fuso; a seleção é uma fotografia própria da rotina e sua edição continua explícita. Fontes e buscadores seguem a configuração atual do app ao executar uma rotina.

`/setup` permite escolher quais buscadores participam, cadastrar até seis sites públicos (incluindo caminhos como `/artigos`), selecionar período e setor, configurar chaves e um modelo OpenRouter dedicado à ontologia. Cadastro de sites cria consultas adicionais com `site:`, via Exa, Tavily ou Bright Data. O retorno passa por conferência de domínio e caminho; os sites complementam a busca ampla. Site sem retorno ou sem buscador apto produz aviso no relatório. Isso não equivale a crawling completo ou leitura de páginas privadas.

`/radar` executa a coleta, apresenta o grafo navegável, ações sugeridas e evidências com datas. O relatório registra início da rodada, número de consultas, fontes priorizadas, achados sem data e uso do cache. URLs geradas pela síntese que não existam na coleta são descartadas. Citações duplicadas não aumentam a força do sinal. Arestas órfãs são removidas. Conteúdo coletado é tratado como dado não confiável no prompt.

Fontes sem data continuam como contexto identificado. Datas conhecidas fora da janela ou futuras são descartadas. IDs em querystrings são preservados na deduplicação; apenas parâmetros de rastreamento são removidos. No X, o JSON gerado só pode citar URLs de posts presentes nas citações estruturadas da ferramenta, e a data é derivada do ID snowflake do post.

## Modelos e assinatura ChatGPT

O servidor usa OpenRouter, incluindo o fluxo OAuth existente. `OPENROUTER_MODEL_ONTOLOGIA` permite um modelo específico com boa síntese e saída JSON. Deixar vazio mantém o modelo principal. A síntese da ontologia não troca silenciosamente para outro modelo se ele falhar. A qualidade deve ser avaliada pela fidelidade das citações e das relações; nenhum ID de modelo pago é imposto como requisito.

A [documentação oficial de autenticação](https://developers.openai.com/codex/auth) distingue login ChatGPT no Codex e autenticação por chave API. Não foi implementada reutilização de tokens da assinatura como credenciais do servidor. O MCP existente continua disponível para conectar o radar a assistentes. Ele não transforma a assinatura em créditos para a síntese OpenRouter. Uma ponte local Codex seria outro modo de execução, com requisitos operacionais e autenticação próprios.

Grok no OpenRouter é uma escolha de modelo; [X Search](https://docs.x.ai/developers/tools/x-search) é uma ferramenta da API xAI com créditos e chave próprios. A integração usa Responses com `x_search`, limites de data, timeout e verificação de [citações](https://docs.x.ai/developers/tools/citations). O teste de conexão valida acesso ao catálogo, não promete cota ou acesso a toda ferramenta/modelo.

## Redis e implantação

Redis é opcional, usado como cache de buscas bem-sucedidas e não vazias, com TTL de 300 segundos. Configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, ou use Configurações. O adaptador segue a [API REST oficial Upstash](https://upstash.com/docs/redis/features/restapi), aceita somente endpoints HTTPS Upstash e usa timeout de dois segundos. Falha de cache provoca busca normal. Chaves são hashes da consulta, período, provedor, credencial e modelo de busca; credenciais não são gravadas em texto no Redis. O payload contém achados públicos e horário original de coleta, validado ao reutilizar.

SQLite permanece responsável por termos, histórico, configurações cifradas e locks das rotinas. Redis não torna essa implantação multi-instância: para múltiplos servidores, também seria necessário migrar a persistência e o agendamento. Um servidor persistente com volume SQLite é o desenho atual. O cache não substitui coleta agendada nem concede acesso aos provedores.

## Contratos externos consultados

- [Exa Search](https://exa.ai/docs/reference/search): query, conteúdos e filtro de publicação.
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search): notícias, período e trechos.
- [xAI X Search](https://docs.x.ai/developers/tools/x-search) e [citações](https://docs.x.ai/developers/tools/citations).
- [OpenAI: autenticação Codex](https://developers.openai.com/codex/auth).
- [Upstash Redis REST](https://upstash.com/docs/redis/features/restapi).

## Validação

Os testes em `tests/pesquisa.test.ts` cobrem cadastro, limites, filtros de domínio/caminho, datas, IDs de URL, falhas parciais, seleção de coletores, citações X, cache, modelo dedicado e normalização da ontologia. São contratos simulados: não comprovam cota ou acesso de uma conta paga. Os testes existentes cobrem monitoramento → MCP → síntese → histórico → notificação e o lock de execução.

A revisão de navegador usa um servidor local com SQLite descartável e conta desabilitada apenas nesse processo de validação. São verificados cadastro persistente, fontes, carregamento dos termos, demonstração, impressão, navegação e larguras desktop/mobile. Chamadas pagas dependem das chaves que forem conectadas pelo usuário; nenhuma é necessária para a demonstração.
