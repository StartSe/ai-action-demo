# PRD: Prospecção com IA, de gerador de lista a workspace de prospecção

Data: 18/09/2026. Escopo: o app `prospeccao-ia/` (Vendas, porta 3005, acento `#0b5789`). Não toca nos outros 17 apps da suíte, exceto pela nota de exceção no `PADRAO.md` (US-041).

## Introduction

Hoje o `prospeccao-ia` responde a uma pergunta só: **"quem eu posso abordar e o que escrevo para essa pessoa?"**. A tela é um formulário permanente (segmento, cargo, localização, porte, proposta, quantidade) à esquerda e uma tabela de leads à direita; cada linha oferece "Escrever abordagem", e a abordagem devolve três textos (e-mail, LinkedIn, WhatsApp). Funciona como demonstração, mas o vendedor recomeça do zero a cada busca, a lista não guarda estado, e a IA atua como redatora, não como assistente de prospecção.

Esta PRD transforma o app em um **workspace de prospecção** que responde a três perguntas mais valiosas: **quem vale a pena abordar, por quê, e qual a melhor maneira de iniciar a conversa.** O fluxo passa a ser:

**Produto/Serviço → ICP → Prospecção → Descoberta → Qualificação → Pessoas-chave → Abordagem → Acompanhamento**

Duas mudanças estruturais sustentam isso:

1. **Contexto persistente.** Produto, proposta de valor, personas, dores e sinais de intenção deixam de ser campos de formulário reescritos a cada busca e passam a ser entidades salvas (Produtos & ICPs). A prospecção herda esse contexto.
2. **Pesquisa antes da escrita.** Entre o lead e a mensagem entram três etapas que hoje não existem: pesquisa (dados públicos), qualificação (aderência com evidências e hipótese de dor) e estratégia (objetivo, gancho, tom, CTA). A mensagem passa a ser consequência da estratégia, não o produto principal.

A arquitetura de agentes por trás (Pesquisa → Inteligência de empresa → Descoberta de pessoas → Qualificação → Mensagem) e as capacidades da Bright Data **nunca aparecem na tela**. O executivo vê etapas em linguagem de negócio ("Procurando empresas compatíveis", "Analisando sinais públicos") e decide o que fazer com o resultado.

### Premissas

- P1. Público executivo sem perfil técnico. Nenhum nome de fornecedor de dados, endpoint, agente ou modelo aparece na tela principal. Vale o `verificar-jargao.mjs`.
- P2. Stack inalterada: Next.js 16, Tailwind 4, React 19, sem biblioteca de UI, SQLite via `node:sqlite`. Nenhuma dependência nova.
- P3. Tudo funciona sem nenhuma chave: em modo demonstração o workspace inteiro (produto de exemplo, empresas, pessoas, sinais, qualificação, abordagem, pipeline) opera com dados plausíveis em português.
- P4. **Exceção deliberada ao `PADRAO.md`.** A premissa de "uma promessa, uma tela, nada de menus" continua valendo para os outros 17 apps; o `prospeccao-ia` passa a ter cinco destinos porque o produto é um fluxo com estado, não uma geração única. A exceção é registrada no `PADRAO.md` e no `CLAUDE.md` do app, com o motivo.
- P5. A navegação usa o **header já existente** da fundação visual de 15/09 (`Topbar` com `navegacao={[...]}`, extensão prevista em `lib/navegacao.ts`), não uma barra lateral. Nenhum arquivo compartilhado verificado por `scripts/verificar-padrao.sh` é alterado.
- P6. A Bright Data é o motor de descoberta, sinais e enriquecimento; a Apollo continua opcional, como fonte alternativa de contatos. Nenhuma das duas é obrigatória.
- P7. Dados de pessoas vêm só de fontes públicas, entram no app com origem e data registradas, e expiram. O app nunca infere nem guarda dado sensível (saúde, religião, orientação, opinião política, origem racial).
- P8. O app não envia mensagem por conta própria. Ele escreve, salva e entrega (copiar, exportar, mandar ao CRM). Envio dentro do LinkedIn continua sendo assunto do `prospeccao-linkedin`.

### Diagnóstico do app hoje (18/09/2026)

| # | Achado | Severidade |
|---|---|---|
| D1 | O contexto do negócio (proposta, segmento, cargo, porte) é redigitado a cada busca e some ao terminar | Alta |
| D2 | A coluna de entrada ocupa cerca de metade da tela permanentemente, inclusive depois de o resultado existir | Alta |
| D3 | Nada explica **por que** um lead entrou na lista: o "sinal" é uma frase montada com campos da Apollo (`fundada em 1998, atua em X, cerca de 120 funcionários`), não um sinal de intenção | Alta |
| D4 | Não há noção de empresa: em B2B a unidade de decisão é a conta, e o app só conhece pessoas soltas | Alta |
| D5 | Não existe pipeline: o lead não tem estado (novo, pesquisado, abordado, respondeu) e a lista não sobrevive à aba | Alta |
| D6 | A abordagem nasce direto do lead, sem estratégia explícita; o vendedor não sabe o que a IA assumiu nem consegue redirecionar sem reescrever tudo | Média |
| D7 | Botões repetidos por linha ("Escrever abordagem", "Enviar para o CRM") multiplicam o ruído visual na tabela | Média |
| D8 | A Bright Data só é usada para ler o site do lead na hora de escrever; nenhuma capacidade de busca, sinal ou perfil é aproveitada | Média |
| D9 | Só existe jornada B2B implícita; não há como prospectar pessoa física | Média |
| D10 | "Histórico" guarda buscas como resultados avulsos, sem relação entre elas | Média |

### Conceito: cinco áreas e um fluxo

**Início · Produtos · Prospecções · Leads · Configurações**

- **Início**: a promessa do app, o botão "Nova prospecção" e quatro números do trabalho em andamento (prospecções, leads encontrados, qualificados, respostas).
- **Produtos**: o que a empresa vende e para quem. Cada produto tem um ou mais perfis ideais (ICP), com personas, dores e sinais de intenção.
- **Prospecções**: cada prospecção é uma busca com estado e funil próprio (encontrados → qualificados → abordados → responderam). Substitui a aba Histórico.
- **Leads**: todas as pessoas e empresas descobertas, de todas as prospecções, com filtro por fit, sinal, papel e status.
- **Configurações**: `/setup` como já é hoje.

O fluxo de "Nova prospecção" tem quatro passos curtos: **produto/ICP → quem encontrar → como encontrar → critérios**. Depois disso o trabalho é da IA, e a tela mostra o andamento em linguagem de negócio.

## Goals

- G1. O contexto do negócio é informado **uma vez** e reaproveitado: criar a segunda prospecção leva menos de 30 segundos e nenhum campo de texto longo.
- G2. Todo lead na lista responde "por que ele está aqui" com evidências verificáveis (critério atendido + sinal com data e fonte), antes de qualquer mensagem.
- G3. A jornada B2B tem a **empresa** como unidade principal e a pessoa como consequência; a jornada B2C tem a **pessoa** como unidade, com critérios próprios.
- G4. A abordagem nasce de uma estratégia visível (objetivo, gancho, dor provável, tom, CTA) que o vendedor pode redirecionar em um clique, sem editar prompt.
- G5. O vendedor sabe, a qualquer momento, onde está cada oportunidade, sem que o app vire um CRM.
- G6. Nenhum nome de fornecedor de dados, agente ou capacidade técnica aparece na tela principal; o executivo só descreve o que quer encontrar.
- G7. Tudo acima funciona em modo demonstração, sem nenhuma chave, com dados plausíveis.

## User Stories

Ordem de implementação. Fases 1 a 3 entregam o workspace funcionando de ponta a ponta em demonstração; a fase 4 liga o motor de dados reais; as fases 5 a 7 completam qualificação, abordagem, acompanhamento e capacidades.

### Fase 1, fundação de dados e navegação

### US-001: Modelo de dados do workspace
**Description:** As a desenvolvedor, I want tabelas próprias para produto, ICP, prospecção, conta, lead e abordagem so that o trabalho do vendedor sobreviva ao fechar a aba.

**Acceptance Criteria:**
- [ ] Novo `lib/workspace.ts` cria, na primeira chamada (mesmo padrão de `lib/historico.ts`), as tabelas `produtos`, `icps`, `prospeccoes`, `contas`, `leads` e `abordagens` no SQLite já existente (`DATA_DIR/app.sqlite`)
- [ ] `produtos`: `id`, `nome`, `descricao`, `site`, `proposta_valor`, `criado_em`
- [ ] `icps`: `id`, `produto_id`, `nome`, `jornada` (`b2b` | `b2c`), `criterios` (JSON), `personas` (JSON), `dores` (JSON), `sinais` (JSON), `criado_em`
- [ ] `prospeccoes`: `id`, `produto_id`, `icp_id`, `modo` (`empresas` | `pessoas` | `empresa_unica` | `oportunidades`), `criterios` (JSON), `estado` (`rascunho` | `executando` | `pronta` | `falhou` | `cancelada`), `etapa`, `erro`, `criado_em`, `concluido_em`
- [ ] `contas` (empresas): `id`, `prospeccao_id`, `nome`, `site`, `setor`, `porte`, `cidade`, `fit`, `evidencias` (JSON), `sinais` (JSON), `resumo`, `criado_em`
- [ ] `leads` (pessoas): `id`, `prospeccao_id`, `conta_id` (nulo em B2C), `nome`, `cargo`, `empresa`, `cidade`, `linkedin`, `fonte`, `papel` (`decisor` | `influenciador` | `champion` | `desconhecido`), `fit`, `evidencias` (JSON), `sinais` (JSON), `hipotese`, `status` (`novo` | `pesquisado` | `qualificado` | `selecionado` | `abordado` | `respondeu` | `descartado`), `no_crm`, `criado_em`
- [ ] `abordagens`: `id`, `lead_id`, `estrategia` (JSON), `email` (JSON), `linkedin`, `whatsapp`, `variacao`, `criado_em`
- [ ] Funções exportadas por entidade (`criar`, `listar`, `obter`, `atualizar`, `apagar`) tipadas em `lib/types.ts`, sem SQL espalhado por rotas
- [ ] `limparExpirados()` do app apaga contas e leads com mais de 180 dias sem atualização, e a retenção está escrita no README
- [ ] Os tipos antigos (`DadosBusca`, `Lead`, `ResultadoBusca`, `Abordagem`) continuam exportados enquanto as rotas antigas existirem
- [ ] Lint e build passam

### US-002: Cinco destinos no header
**Description:** As a vendedor, I want navegar entre Início, Produtos, Prospecções, Leads e Configurações so that eu volte ao trabalho em andamento sem refazer a busca.

**Acceptance Criteria:**
- [ ] `app/page.tsx` e as páginas novas passam `navegacao={NAVEGACAO_PROSPECCAO}` ao `Topbar`, com `Início` (`/`), `Produtos` (`/produtos`), `Prospecções` (`/prospeccoes`), `Leads` (`/leads`) e `Configurações` (`/setup`)
- [ ] `lib/navegacao.ts`, `components/ui.tsx` e qualquer outro arquivo comparado por `scripts/verificar-padrao.sh` continuam idênticos ao `pdi-time`
- [ ] `/historico` passa a redirecionar para `/prospeccoes` (301 permanente não; `redirect()` do Next basta), e nenhum link do app aponta mais para `/historico`
- [ ] O item ativo é destacado em todas as cinco rotas, inclusive nas subrotas (`/prospeccoes/abc`)
- [ ] No celular (390 px) os cinco destinos entram na folha de menu já existente, sem rolagem horizontal
- [ ] `scripts/verificar-padrao.sh` passa; lint e build passam; verificar no navegador (desktop 1400x900 e celular 390 px)

### US-003: Tela de início com o trabalho em andamento
**Description:** As a vendedor, I want abrir o app e ver o que já está rodando e um botão para começar so that eu não precise lembrar onde parei.

**Acceptance Criteria:**
- [ ] `/` mostra o `Hero` com título de até 8 palavras ("Encontre as pessoas certas para o seu negócio" cabe), frase de apoio de até 20 palavras e o botão primário "Nova prospecção"
- [ ] Abaixo, quatro números em uma linha: prospecções, leads encontrados, qualificados, respostas, calculados das tabelas (não fixos)
- [ ] Lista das três prospecções mais recentes com nome, produto, data e o funil resumido (`42 encontrados · 18 qualificados · 7 abordagens`)
- [ ] Estado vazio (nenhuma prospecção) convida à ação e oferece "Ver uma prospecção de exemplo", que abre a prospecção de demonstração da US-008
- [ ] O botão primário está visível sem rolagem em 1400x900, medido por `getBoundingClientRect`
- [ ] Lint e build passam; verificar no navegador (vazio e preenchido, desktop e celular)

### US-004: Área Produtos com lista e estado vazio
**Description:** As a vendedor, I want ver os produtos que já cadastrei e seus perfis ideais so that eu escolha rápido o contexto da próxima prospecção.

**Acceptance Criteria:**
- [ ] `/produtos` lista cada produto em um `.card` com nome, uma linha de descrição, os ICPs vinculados (nome e jornada) e as ações "Editar" e "Nova prospecção com este produto"
- [ ] Estado vazio com dois caminhos: "Criar produto" e "Criar com IA a partir do meu site"
- [ ] Apagar um produto pede confirmação (`useConfirmacao`) e explica o que acontece com as prospecções existentes (elas ficam, com o nome do produto preservado)
- [ ] Lint e build passam; verificar no navegador

### US-005: Cadastro de produto e proposta de valor
**Description:** As a vendedor, I want descrever uma vez o que vendo so that toda prospecção e toda mensagem já saiam com esse contexto.

**Acceptance Criteria:**
- [ ] `/produtos/novo` e `/produtos/[id]` usam o mesmo formulário: nome, uma linha de descrição, site (opcional) e proposta de valor (textarea)
- [ ] No máximo uma linha de ajuda por campo
- [ ] `POST`/`PUT /api/produtos` valida nome e proposta obrigatórios e devolve erro em português, no formato de erro do app (código + ação)
- [ ] Salvar leva de volta para `/produtos` com o produto no topo
- [ ] Lint e build passam; verificar no navegador

### US-006: Perfil ideal de cliente (ICP) com personas, dores e sinais
**Description:** As a vendedor, I want registrar o perfil ideal do cliente so that a IA saiba filtrar contas e pessoas sem eu repetir critérios.

**Acceptance Criteria:**
- [ ] O ICP pertence a um produto e tem: nome, jornada (`Empresas e decisores` | `Pessoas/consumidores`), critérios, personas, problemas que resolvemos e sinais de intenção
- [ ] Em B2B os critérios são setor, porte (faixa de funcionários), localização e, opcional, "outros critérios" em texto; em B2C são localização, faixa etária (opcional), profissão/ocupação, interesses e contexto relevante
- [ ] Personas, dores e sinais são listas de itens curtos, adicionados e removidos um a um (chips), não textarea livre
- [ ] Um produto pode ter mais de um ICP; a lista mostra qual é o padrão
- [ ] A tela avisa, em uma linha, que em B2C só entram dados públicos e nenhum dado sensível
- [ ] Lint e build passam; verificar no navegador

### US-007: Criar produto e ICP com IA a partir do site
**Description:** As a vendedor, I want colar o endereço do meu site e receber produto, personas, dores e sinais sugeridos so that eu não comece de uma folha em branco.

**Acceptance Criteria:**
- [ ] Em `/produtos/novo`, a opção "Criar com IA" pede só o endereço do site (ou um parágrafo colado) e roda a análise
- [ ] Com a leitura de páginas conectada, o app lê a página pública e usa o texto como insumo; sem ela, usa só o que a pessoa escreveu
- [ ] A IA devolve nome, descrição, proposta de valor, um ICP com critérios, até 4 personas, até 5 dores e até 6 sinais de intenção
- [ ] O resultado abre **no formulário de edição**, editável campo a campo, nunca salvo direto
- [ ] A tela mostra `Origem` ("Sugerido pela IA a partir do seu site, em dd/mm/aaaa às hh:mm") e, em demonstração, o texto de exemplo correspondente
- [ ] Falha de leitura do site não trava o fluxo: o app avisa em uma frase e segue com a descrição escrita
- [ ] Lint e build passam; verificar no navegador

### US-008: Demonstração completa do workspace
**Description:** As a executivo testando o app em dois minutos, I want ver produto, prospecção, leads qualificados e abordagem já prontos so that eu entenda o valor sem configurar nada.

**Acceptance Criteria:**
- [ ] Sem nenhuma chave, o app oferece "Ver uma prospecção de exemplo" e cria, no banco, um produto (o CMMS da Zetta Manutenção Industrial, mesmo exemplo de hoje), um ICP B2B, uma prospecção concluída, 3 contas, 6 pessoas com fit, evidências, sinais, papéis e 1 abordagem escrita
- [ ] Os dados de exemplo ficam em `lib/demo.ts`, em português correto, com nomes e empresas fictícios plausíveis, e são marcados com `demo: true` em todas as telas onde aparecem
- [ ] "Limpar exemplo" remove tudo que foi criado pelo exemplo, sem tocar no que a pessoa criou
- [ ] `?exemplo=1` na raiz executa esse mesmo caminho (respeitando a regra de Strict Mode do `PADRAO.md`) e `?captura=1` desliga a rolagem automática
- [ ] Lint e build passam; verificar no navegador

### Fase 2, o fluxo de nova prospecção

### US-009: Passo 1, escolher produto e perfil ideal
**Description:** As a vendedor, I want escolher o produto e o perfil em dois cliques so that a prospecção já nasça com contexto.

**Acceptance Criteria:**
- [ ] `/prospeccoes/nova` mostra um seletor de produto (com a descrição em uma linha) e, abaixo, o ICP vinculado com resumo dos critérios e link "Ver detalhes"
- [ ] Ações secundárias: "Usar perfil existente" (seletor, quando há mais de um) e "Criar novo com IA" (leva à US-007 e volta para o fluxo)
- [ ] Sem nenhum produto cadastrado, o passo 1 é o cadastro de produto, e o fluxo continua de onde parou
- [ ] "Continuar" só habilita com produto e ICP escolhidos
- [ ] Lint e build passam; verificar no navegador

### US-010: Passo 2, quem você quer encontrar
**Description:** As a vendedor, I want dizer se procuro empresas ou pessoas so that o app me leve à jornada certa em vez de um filtro genérico.

**Acceptance Criteria:**
- [ ] Duas opções grandes: "Empresas e decisores" e "Pessoas/consumidores", com uma linha de explicação cada
- [ ] A jornada do ICP escolhido vem pré-selecionada; mudar aqui avisa em uma linha que os critérios do ICP não se aplicam e oferece escolher outro perfil
- [ ] A escolha é gravada na prospecção (`jornada`) e determina os modos do passo 3 e o modelo de dados dos resultados
- [ ] Lint e build passam; verificar no navegador

### US-011: Passo 3, como encontrar oportunidades
**Description:** As a vendedor, I want escolher o tipo de busca em cartões so that eu não precise entender qual fonte de dados será usada.

**Acceptance Criteria:**
- [ ] Em B2B, quatro cartões: "Encontrar empresas", "Encontrar pessoas", "Explorar uma empresa" e "Encontrar oportunidades", cada um com título e uma linha de descrição, no desenho da referência enviada
- [ ] Em B2C, dois cartões: "Encontrar pessoas" e "Encontrar oportunidades", com textos próprios da jornada
- [ ] O cartão selecionado fica destacado com o acento do app; a seleção é obrigatória para continuar
- [ ] Nenhum cartão cita fonte de dados, agente ou capacidade técnica
- [ ] Lint e build passam; verificar no navegador

### US-012: Passo 4, critérios já preenchidos pelo perfil
**Description:** As a vendedor, I want ver os critérios vindos do ICP e ajustar o que for diferente desta vez so that eu não redigite o que já cadastrei.

**Acceptance Criteria:**
- [ ] Os campos mudam conforme o modo: empresas (segmento, localização, porte, sinais de intenção), pessoas B2B (cargo, empresa ou segmento, localização), empresa única (só o nome da empresa), oportunidades (sinais a procurar + recorte), pessoas B2C (localização, ocupação, interesses, contexto)
- [ ] Todos os campos chegam preenchidos com os valores do ICP; alterar aqui não altera o ICP salvo
- [ ] Sinais de intenção aparecem como chips selecionáveis vindos do ICP, com "+ Adicionar"
- [ ] Uma chave "Incluir apenas quem tem sinais recentes (90 dias)", ligada por padrão no modo oportunidades
- [ ] O botão primário diz o que faz ("Buscar empresas", "Buscar pessoas", "Explorar empresa") e fica visível sem rolagem em 1400x900
- [ ] Lint e build passam; verificar no navegador

### US-013: Execução com etapas em linguagem de negócio
**Description:** As a vendedor, I want acompanhar a pesquisa por etapas enquanto ela roda so that eu confie no que está acontecendo e possa sair da tela.

**Acceptance Criteria:**
- [ ] `POST /api/prospeccoes` cria a prospecção com `estado: "executando"` e devolve o id **imediatamente**; o trabalho continua no servidor
- [ ] O progresso é gravado na tabela `prospeccoes` (`etapa`) e lido por `GET /api/prospeccoes/[id]/andamento`, consultado pela tela a cada 2 segundos
- [ ] A tela mostra as etapas concluídas com marca, a atual com indicador e as futuras apagadas: "Entendendo seu produto", "Procurando empresas compatíveis", "Analisando sinais públicos", "Encontrando pessoas-chave", "Qualificando oportunidades"
- [ ] Sair da tela e voltar depois mostra o andamento correto, inclusive já concluído
- [ ] Resultados parciais já aparecem na lista enquanto a qualificação continua
- [ ] Falha em uma etapa não perde as anteriores: a prospecção fica `pronta` com o que deu certo e uma linha explica o que não foi possível
- [ ] Lint e build passam; verificar no navegador

### US-014: Cancelar, repetir e apagar prospecção
**Description:** As a vendedor, I want cancelar uma busca demorada e repetir uma que deu certo so that eu não fique preso a uma execução.

**Acceptance Criteria:**
- [ ] "Cancelar" na tela de andamento marca `estado: "cancelada"`, interrompe as próximas etapas e mantém o que já foi encontrado
- [ ] "Repetir prospecção" cria uma nova com os mesmos critérios, sem duplicar leads já existentes (mesmo LinkedIn ou mesmo nome + empresa é reconhecido como já visto, reaproveitando a ideia de `lib/leads-vistos.ts`)
- [ ] Apagar pede confirmação e remove contas, leads e abordagens daquela prospecção
- [ ] Lint e build passam; verificar no navegador

### Fase 3, motor de descoberta e sinais

### US-015: Camada de descoberta com fallback de demonstração
**Description:** As a desenvolvedor, I want uma única camada que decide como buscar, ler e enriquecer so that as rotas e os agentes nunca falem com o fornecedor direto.

**Acceptance Criteria:**
- [ ] Novo `lib/descoberta.ts` expõe quatro capacidades internas: `buscarNaWeb(consulta)`, `lerPagina(url)` (texto limpo em markdown), `perfilDePessoa(url)` e `descobrirEmLote(criterios)`
- [ ] Cada capacidade tem implementação real (Bright Data) e fallback de demonstração, escolhido por `descobertaAtiva()`; nenhuma rota chama `api.brightdata.com` diretamente
- [ ] Falhas viram `ErroDescoberta` no mesmo formato de `ErroApollo` (código, mensagem de negócio, ação): `chave_recusada`, `limite_do_plano`, `servico_fora`, `sem_resultado`
- [ ] Detalhe técnico (status, corpo, endpoint) só em `console.error`
- [ ] Toda resposta traz `origem` (endereço da página consultada) e `consultadoEm`, gravados junto com o dado
- [ ] `lib/abordagem.ts` passa a usar `lerPagina` em vez do `fetch` próprio, sem mudar o comportamento atual
- [ ] Lint e build passam

### US-016: Um cartão só de dados no `/setup`
**Description:** As a executivo, I want conectar a pesquisa de mercado em um cartão so that eu não precise entender zonas e produtos do fornecedor.

**Acceptance Criteria:**
- [ ] O cartão da Bright Data passa a se chamar "Pesquisa de mercado e sinais" com o benefício "Encontra empresas, pessoas e sinais públicos de verdade"
- [ ] Campos: chave da API (obrigatória do cartão) e, em "Opções avançadas", as zonas de busca e de leitura, com valor padrão preenchido
- [ ] `testar(config)` verifica as duas zonas e devolve uma mensagem por zona, em linguagem de negócio
- [ ] A Apollo continua como cartão próprio, com a descrição ajustada para "fonte alternativa de contatos"
- [ ] `GET /api/status` reflete `descoberta: boolean` e a tela principal mostra o aviso de demonstração uma única vez, na barra superior
- [ ] Lint e build passam; verificar no navegador

### US-017: Encontrar empresas aderentes ao ICP
**Description:** As a vendedor B2B, I want receber contas que combinam com meu perfil ideal so that eu trabalhe a conta antes de procurar pessoas.

**Acceptance Criteria:**
- [ ] O modo "Encontrar empresas" monta consultas a partir de segmento, localização, porte e sinais, busca na web, lê a página institucional de cada candidata e consolida uma `conta` por empresa
- [ ] Cada conta traz nome, site, setor, porte estimado, cidade, um resumo de até 2 linhas e a lista de evidências que justificam o fit
- [ ] Empresas repetidas entre consultas são unificadas pelo domínio do site
- [ ] A lista de resultados mostra, por empresa, nome, cidade e porte, o chip de aderência (Alta, Média, Baixa) e até 3 chips de sinal, com a ação "Ver pessoas"
- [ ] Quantidade alvo configurável (10, 25 ou 50 empresas), com teto de gasto da US-023 respeitado
- [ ] Em demonstração, 3 empresas de exemplo com o mesmo formato
- [ ] Lint e build passam; verificar no navegador

### US-018: Explorar uma empresa e achar as pessoas-chave
**Description:** As a vendedor, I want escrever o nome de uma empresa e descobrir quem procurar lá dentro so that eu pare de garimpar perfis manualmente.

**Acceptance Criteria:**
- [ ] O modo "Explorar uma empresa" pede só o nome (ou o site) da empresa
- [ ] O resultado abre com o nome da empresa, o chip de aderência ao ICP e o bloco "Por que pode fazer sentido", com 3 a 5 marcadores curtos e verificáveis
- [ ] Abaixo, "Pessoas que vale conhecer": nome, cargo, chip de papel (Decisor provável, Influenciadora, Champion potencial) e o link do perfil
- [ ] Cada pessoa tem caixa de seleção; a ação primária é "Adicionar à prospecção" e a secundária, por pessoa, "Entender por que essa pessoa"
- [ ] "Entender por que essa pessoa" abre um painel lateral com os critérios atendidos e os sinais, sem sair da lista
- [ ] Nenhuma pessoa é adicionada sem seleção explícita
- [ ] Lint e build passam; verificar no navegador

### US-019: Encontrar pessoas por cargo e perfil (B2B)
**Description:** As a vendedor, I want buscar diretamente profissionais por cargo, empresa ou perfil so that eu use o caminho curto quando já sei quem procuro.

**Acceptance Criteria:**
- [ ] O modo "Encontrar pessoas" aceita cargo, segmento ou empresa e localização, e devolve pessoas com nome, cargo, empresa, cidade e perfil público
- [ ] Cada pessoa é vinculada a uma `conta` (criada se ainda não existir), para a jornada B2B continuar tendo a empresa como unidade
- [ ] Quando a Apollo está conectada, ela é usada como fonte de contato e o resultado é combinado com os sinais públicos; sem ela, só as fontes públicas
- [ ] A origem de cada pessoa aparece na ficha ("encontrado em <domínio>, em dd/mm/aaaa")
- [ ] Lint e build passam; verificar no navegador

### US-020: Encontrar oportunidades por sinal de intenção
**Description:** As a vendedor, I want procurar quem está dando sinal de necessidade agora so that eu aborde no momento certo.

**Acceptance Criteria:**
- [ ] O modo "Encontrar oportunidades" recebe os sinais do ICP (ex.: contratação de analistas, expansão, abertura de unidade, novo sistema) e procura empresas ou pessoas que os apresentem
- [ ] Cada sinal encontrado guarda descrição curta, data, tipo e endereço da fonte, e aparece como chip na lista e como item datado na ficha
- [ ] Sinais com mais de 90 dias são marcados como antigos e, com a chave da US-012 ligada, não entram
- [ ] O app nunca apresenta sinal sem fonte: um sinal sem endereço de origem é descartado
- [ ] Em demonstração, sinais de exemplo com datas relativas ao dia atual (nunca datas passadas fixas)
- [ ] Lint e build passam; verificar no navegador

### US-021: Jornada B2C, encontrar pessoas por contexto público
**Description:** As a vendedor de produto para consumidor, I want encontrar pessoas por localização, ocupação, interesses e sinais públicos so that eu prospecte sem tentar encaixar minha operação num modelo de empresa.

**Acceptance Criteria:**
- [ ] A jornada B2C usa a pessoa como unidade: não há `conta` obrigatória, e a lista mostra Pessoa | Fit | Sinal | Contexto | Status
- [ ] Os critérios são os da US-006 (localização, ocupação, interesses, contexto), e a qualificação usa esses critérios como evidências
- [ ] Só entram dados publicados pela própria pessoa em perfil ou página pública; o app não compra lista, não infere e não grava dado sensível (P7), e isso está escrito em uma linha na tela e no README
- [ ] Cada pessoa tem "Como este dado chegou aqui": critério, fonte e data
- [ ] Um lead B2C pode ser removido de vez ("Apagar dados desta pessoa"), o que apaga também as abordagens dela
- [ ] Retenção de leads B2C: 90 dias sem atualização, contra 180 do B2B, aplicada por `limparExpirados()`
- [ ] Lint e build passam; verificar no navegador

### US-022: Apollo como fonte alternativa de contatos
**Description:** As a vendedor que já paga uma base de contatos, I want continuar usando a minha so that eu não perca o que já funciona.

**Acceptance Criteria:**
- [ ] Com a Apollo conectada, ela entra como fonte no modo "Encontrar pessoas" e no preenchimento de cargo e empresa em "Explorar uma empresa"
- [ ] O `sinal` montado a partir dos campos da Apollo deixa de ser chamado de sinal e vira "Sobre a empresa" na ficha; sinal passa a ser só o que tem data e fonte (US-020)
- [ ] Sem Apollo, nada na tela some nem menciona que ela existe, além do cartão do `/setup`
- [ ] A ferramenta MCP `buscar_leads` continua funcionando com o comportamento atual
- [ ] Lint e build passam

### US-023: Teto de consumo e cache por prospecção
**Description:** As a responsável pela conta de dados, I want um limite por prospecção so that uma busca ampla não consuma a cota inteira.

**Acceptance Criteria:**
- [ ] `lib/descoberta.ts` conta as chamadas por prospecção e para ao atingir o teto (padrão 60 consultas), marcando a prospecção como `pronta` com o aviso "Paramos em X empresas para não consumir sua cota"
- [ ] Páginas já lidas nas últimas 24 horas são reaproveitadas de uma tabela `cache_paginas` (`url`, `conteudo`, `lido_em`), sem nova chamada
- [ ] O teto é configurável em "Opções avançadas" do `/setup`
- [ ] Lint e build passam

### Fase 4, qualificação antes da abordagem

### US-024: Aderência ao ICP com evidências item a item
**Description:** As a vendedor, I want ver por que cada lead entrou na lista so that eu decida em quem investir tempo.

**Acceptance Criteria:**
- [ ] Cada conta e cada lead recebem `fit` (`alta` | `media` | `baixa`) e uma lista de evidências, uma por critério do ICP, com o valor encontrado e o resultado (atende, não atende, não foi possível verificar)
- [ ] A regra é determinística onde o dado é objetivo (porte, localização, setor, cargo) e só usa IA para o que é interpretativo, sempre citando o trecho que embasou
- [ ] Critério sem dado nunca conta como atendido; aparece como "não foi possível verificar"
- [ ] O chip de fit usa `.chip-alta|media|baixa` e rótulo em sentence case ("Alta aderência")
- [ ] Um lead sem nenhuma evidência verificável não entra na lista
- [ ] Lint e build passam; verificar no navegador

### US-025: Hipótese de dor, apresentada como hipótese
**Description:** As a vendedor, I want uma hipótese explícita sobre o problema do lead so that eu tenha um ângulo de conversa sem afirmar o que não sei.

**Acceptance Criteria:**
- [ ] A hipótese é gerada a partir dos sinais encontrados e das dores do ICP, em 1 a 2 frases
- [ ] O texto é sempre condicional ("pode estar", "provavelmente", "talvez"), e o bloco tem o rótulo "Hipótese de dor" com ícone; o `SYSTEM` da IA proíbe afirmar fato não presente nos sinais
- [ ] A hipótese cita ao menos um sinal com data; sem sinal, o bloco mostra "Ainda sem sinais públicos suficientes para uma hipótese" e não inventa
- [ ] A ficha nunca mistura hipótese e evidência no mesmo bloco
- [ ] Lint e build passam; verificar no navegador

### US-026: Papel de cada pessoa no processo de decisão
**Description:** As a vendedor, I want saber se a pessoa decide, influencia ou pode virar aliada so that eu escolha por quem começar.

**Acceptance Criteria:**
- [ ] Cada lead B2B recebe `papel` (`decisor`, `influenciador`, `champion`, `desconhecido`), derivado do cargo e do que o ICP define como persona
- [ ] O chip mostra "Decisor provável", "Influenciador", "Champion potencial" ou nada, e o `title` explica a inferência em uma frase
- [ ] O papel é editável pelo vendedor na ficha, e a edição é preservada em nova execução da prospecção
- [ ] Em B2C o campo não aparece
- [ ] Lint e build passam; verificar no navegador

### US-027: Ficha do lead com visão geral, sinais e empresa
**Description:** As a vendedor, I want uma ficha que responda "por que essa pessoa" antes de eu escrever qualquer coisa so that a mensagem saia de uma decisão, não de um impulso.

**Acceptance Criteria:**
- [ ] `/leads/[id]` abre com nome, cargo, empresa, chip de fit e link do perfil público
- [ ] Três abas: "Visão geral" (por que essa pessoa + hipótese de dor), "Sinais" (lista datada com fonte) e "Sobre a empresa" (resumo, porte, setor, site)
- [ ] Ações no rodapé: "Adicionar à lista" (secundária) e "Criar abordagem" (primária)
- [ ] A ficha abre como painel lateral quando aberta a partir de uma lista, e como página quando acessada por link direto
- [ ] Lint e build passam; verificar no navegador (desktop e celular)

### US-028: Qualificação da jornada B2C
**Description:** As a vendedor B2C, I want a mesma qualificação adaptada à pessoa física so that a lista também me diga em quem focar.

**Acceptance Criteria:**
- [ ] As evidências B2C usam os critérios da US-006 e o contexto público encontrado
- [ ] A hipótese de dor em B2C fala de necessidade ou momento ("mudou de cidade recentemente", "publica sobre preparação para prova"), nunca de característica pessoal protegida
- [ ] Uma verificação automática recusa qualificação baseada em termo de categoria sensível (lista fechada em `lib/sensivel.ts`, estendida), registrando no console e omitindo a evidência
- [ ] Lint e build passam; verificar no navegador

### Fase 5, estratégia e abordagem

### US-029: Estratégia antes das mensagens
**Description:** As a vendedor, I want ver a estratégia da abordagem antes do texto so that eu possa concordar ou mudar o rumo em um clique.

**Acceptance Criteria:**
- [ ] A tela de abordagem abre com o bloco "Estratégia para <primeiro nome>" contendo objetivo, gancho, dor provável, tom e CTA, um por linha, com rótulo à esquerda
- [ ] A estratégia é gerada a partir da qualificação (fit, evidências, sinais, hipótese, papel) e do produto, e é salva com a abordagem
- [ ] Cada item da estratégia é editável (clique no valor, edição inline) e a edição regera as mensagens
- [ ] Lint e build passam; verificar no navegador

### US-030: Mensagens dos três canais a partir da estratégia
**Description:** As a vendedor, I want e-mail, LinkedIn e WhatsApp coerentes com a estratégia so that eu escolha o canal sem reescrever nada.

**Acceptance Criteria:**
- [ ] Três abas (LinkedIn, E-mail, WhatsApp), com LinkedIn como padrão, cada uma com o texto e um botão "Copiar"
- [ ] As regras de tamanho e tom de hoje continuam (LinkedIn até 300 caracteres, e-mail em até 2 parágrafos, WhatsApp em 2 a 4 frases, sem clichê, sem marcador `[seu nome]`)
- [ ] Os três canais usam o mesmo gancho da estratégia com texto diferente em cada um, nunca a mesma frase repetida
- [ ] A abordagem é salva na tabela `abordagens` e o lead passa a `status: "selecionado"`; "Marcar como abordado" leva a `abordado`
- [ ] A linha `Origem` aparece acima das abas
- [ ] Lint e build passam; verificar no navegador

### US-031: Regenerar com direção, sem editar prompt
**Description:** As a vendedor, I want pedir outra versão com uma direção clara so that eu ajuste o texto sem virar engenheiro de prompt.

**Acceptance Criteria:**
- [ ] Botão "Regenerar" com menu: Mais curto, Mais executivo, Mais consultivo, Sem pitch, Usar outro sinal, Outra abordagem
- [ ] "Usar outro sinal" lista os sinais do lead e regera com o escolhido
- [ ] Cada regeneração substitui o texto da aba atual e guarda a `variacao` usada; a versão anterior fica acessível por "Voltar à versão anterior" (uma única vez)
- [ ] Sem IA conectada, o menu funciona sobre os textos de demonstração, com variações reais de tamanho e tom
- [ ] Lint e build passam; verificar no navegador

### US-032: Entregar a abordagem
**Description:** As a vendedor, I want levar a abordagem para onde eu trabalho so that o resultado não fique preso no app.

**Acceptance Criteria:**
- [ ] O bloco `Entregar` da suíte aparece na abordagem com: copiar, abrir no e-mail (`mailto:` com assunto e corpo), link permanente do resultado e "Enviar para o CRM"
- [ ] O link permanente (`/r/[id]`) e a impressão (`/imprimir/[id]`) passam a renderizar a ficha do lead + estratégia + três canais
- [ ] "Enviar para o CRM" mantém o comportamento atual (MCP de CRM) e marca `no_crm`
- [ ] Lint e build passam; verificar no navegador

### Fase 6, acompanhamento

### US-033: Lista de leads com fit, sinal, papel e status
**Description:** As a vendedor, I want uma lista que mostre o que importa para priorizar so that eu pare de olhar nome e número de funcionários.

**Acceptance Criteria:**
- [ ] A `DataTable` da prospecção passa a ter as colunas Lead, Empresa, Fit, Sinal, Papel e Status (em B2C: Pessoa, Fit, Sinal, Contexto, Status)
- [ ] A coluna Sinal mostra o sinal mais recente em até 5 palavras, com o restante no `title`
- [ ] As ações por linha saem da tabela e viram um menu `•••` com Ver ficha, Criar abordagem, Mudar status, Enviar para o CRM e Descartar
- [ ] Ordenação padrão: fit alta primeiro, depois sinal mais recente
- [ ] No celular (390 px) cada lead vira um bloco com no máximo 4 rótulos
- [ ] Lint e build passam; verificar no navegador (desktop e celular)

### US-034: Estados do lead e mudança de status
**Description:** As a vendedor, I want marcar em que ponto está cada oportunidade so that eu saiba o que fazer amanhã.

**Acceptance Criteria:**
- [ ] Estados: Novo, Pesquisado, Qualificado, Selecionado, Abordado, Respondeu, Descartado
- [ ] A mudança acontece pelo menu `•••` e por um seletor na ficha; "Respondeu" pede nada além do clique
- [ ] Ações do app mudam o estado sozinhas: qualificação → Qualificado; abordagem criada → Selecionado; "Marcar como abordado" → Abordado
- [ ] Descartar pede o motivo em uma lista curta (fora do perfil, sem sinal, já é cliente, outro) e o motivo aparece na ficha
- [ ] Lint e build passam; verificar no navegador

### US-035: Página da prospecção com funil
**Description:** As a vendedor, I want ver o funil de cada prospecção so that eu saiba se ela vale continuar.

**Acceptance Criteria:**
- [ ] `/prospeccoes/[id]` mostra o nome (produto + recorte, ex.: "Indústrias SP — DecisionOS"), a data, o modo e o funil `42 encontrados → 18 qualificados → 7 abordagens → 3 respostas`
- [ ] Abaixo, as abas do funil filtram a lista (Descobertos, Qualificados, Selecionados, Contatados, Responderam)
- [ ] O contexto (produto, ICP, critérios) aparece em uma linha com "Editar estratégia", ocupando no máximo duas linhas de altura — nunca a coluna permanente de hoje
- [ ] `/prospeccoes` lista todas as prospecções com o mesmo resumo de funil
- [ ] Lint e build passam; verificar no navegador

### US-036: Área Leads com filtros
**Description:** As a vendedor, I want ver todos os leads de todas as prospecções so that eu trabalhe por prioridade, não por busca.

**Acceptance Criteria:**
- [ ] `/leads` lista todos os leads com os filtros Todos, Novos, Abordados, Responderam (contadores no rótulo, como na referência)
- [ ] Filtros adicionais por prospecção e por fit, em um seletor único
- [ ] O estado do filtro vai para a URL (`?estado=novos`), para o link ser compartilhável
- [ ] Estado vazio explica o caminho ("Crie uma prospecção para começar") com o botão primário
- [ ] Lint e build passam; verificar no navegador

### US-037: Exportar a lista
**Description:** As a vendedor, I want exportar a lista trabalhada so that eu leve para a planilha e o CRM do time.

**Acceptance Criteria:**
- [ ] "Exportar CSV" na prospecção e em `/leads` exporta as colunas visíveis mais LinkedIn, site, sinais (com data) e status, respeitando o filtro aplicado
- [ ] O arquivo tem BOM UTF-8 e separador `;` (abre direto no Excel em pt-BR)
- [ ] "Enviar selecionados para o CRM" age sobre a seleção, informa quantos foram e o que falhou
- [ ] Lint e build passam; verificar no navegador

### Fase 7, diferencial e capacidades da suíte

### US-038: Campo único "O que você quer encontrar?"
**Description:** As a vendedor, I want descrever em uma frase o que procuro so that o app monte a prospecção sozinho.

**Acceptance Criteria:**
- [ ] O Início ganha um campo de texto largo com a pergunta "O que você quer encontrar?" e quatro exemplos clicáveis, entre eles "Quem devo procurar dentro da <empresa> para vender <produto>?" e "Empresas parecidas com meus melhores clientes"
- [ ] A frase é interpretada com o produto e o ICP escolhidos (ou o padrão, quando só há um) e resulta em modo + critérios preenchidos
- [ ] O resultado da interpretação é mostrado para confirmação em uma linha ("Vou procurar empresas de logística em expansão no Sul, usando o perfil Indústrias — Operações"), com "Ajustar critérios" antes de executar
- [ ] Frase que não dá para interpretar leva ao fluxo de 4 passos com o que foi entendido já preenchido, nunca a um erro seco
- [ ] Sem IA conectada, os exemplos clicáveis funcionam (mapeamento fixo) e o texto livre avisa que precisa da IA
- [ ] Lint e build passam; verificar no navegador

### US-039: Ferramentas MCP do workspace
**Description:** As a executivo que usa um assistente, I want operar a prospecção de dentro do meu assistente so that eu não precise abrir o app para perguntas simples.

**Acceptance Criteria:**
- [ ] `lib/ferramentas.ts` passa a expor, além das duas atuais: `listar_produtos`, `criar_prospeccao`, `andamento_prospeccao`, `listar_leads` (com filtros de fit e status), `qualificar_lead` e `criar_abordagem`
- [ ] Cada ferramenta chama a mesma função de `lib/` usada pela rota HTTP, sem duplicar prompt nem regra
- [ ] `buscar_leads` e `escrever_abordagem` continuam existindo com a assinatura atual
- [ ] Descrições em português, sem citar fornecedor de dados
- [ ] Testado com o MCP Inspector (`initialize`, `tools/list`, uma chamada de cada ferramenta nova)
- [ ] Lint e build passam

### US-040: Rotina de oportunidades novas
**Description:** As a vendedor, I want receber sozinho as oportunidades novas de uma prospecção so that o app trabalhe enquanto eu vendo.

**Acceptance Criteria:**
- [ ] A rotina passa a ser configurada **sobre uma prospecção salva** (seletor), não sobre um formulário de busca
- [ ] Frequência semanal ou diária; a execução roda a mesma descoberta, ignora leads já vistos e grava os novos com status Novo
- [ ] O aviso (e-mail ou Slack) traz os 5 melhores por fit, com nome, empresa, sinal e o link do lead no app
- [ ] Sem nenhuma oportunidade nova, a rotina não envia nada e registra isso no histórico da rotina
- [ ] Lint e build passam; verificar no navegador

### US-041: Documentar a exceção e atualizar o catálogo
**Description:** As a mantenedor da suíte, I want a exceção deste app registrada so that ninguém replique o workspace nos outros 17 por engano.

**Acceptance Criteria:**
- [ ] `PADRAO.md` ganha uma nota curta na seção de visual: o `prospeccao-ia` é o único app com mais de um destino além de `/setup`, porque o produto é um fluxo com estado; a regra de tela única continua para os demais
- [ ] `prospeccao-ia/CLAUDE.md` descreve as cinco áreas, o modelo de dados e o que **não** foi replicado dos compartilhados
- [ ] `catalogo.json` atualiza `problema`, `ia` e `integracoes` do app para a promessa nova, e o `render.yaml` é regerado por `scripts/gerar-deploy.mjs`
- [ ] `README.md` do app reescrito: o que resolve, as cinco áreas, retenção de dados (180 dias B2B, 90 dias B2C), variáveis e onde obter cada chave
- [ ] `scripts/verificar-padrao.sh` e `scripts/verificar-jargao.mjs` passam

### US-042: Verificação visual e de linguagem do app inteiro
**Description:** As a responsável pela demonstração, I want conferir as telas novas no desktop e no celular so that nada entre torto na frente de um executivo.

**Acceptance Criteria:**
- [ ] Capturas com Chrome headless de todas as telas novas em 1400x900, 1400x1800 (`?exemplo=1&captura=1`) e 390 px, abertas com a ferramenta Read e corrigidas até ficarem limpas
- [ ] Botão primário acima da dobra em todas as telas com ação principal
- [ ] Nenhum salto de layout ao carregar (`/api/status` não empurra conteúdo)
- [ ] `verificar-jargao.mjs` sem achados em todas as rotas novas
- [ ] Limites de texto do `PADRAO.md` conferidos e registrados no `CLAUDE.md` do app
- [ ] Lint e build passam

## Functional Requirements

**Estrutura e navegação**

- FR-1: O app tem cinco destinos: `/` (Início), `/produtos`, `/prospeccoes`, `/leads` e `/setup`, todos no header compartilhado, via `navegacao` do `Topbar`.
- FR-2: Nenhum arquivo comparado por `scripts/verificar-padrao.sh` pode ser alterado; toda diferença vive em arquivos próprios do app.
- FR-3: `/historico` redireciona para `/prospeccoes`; nenhum link novo aponta para o histórico genérico.

**Contexto do negócio**

- FR-4: Um produto tem nome, descrição, site opcional e proposta de valor; um ICP pertence a um produto e tem jornada (B2B ou B2C), critérios, personas, dores e sinais.
- FR-5: Toda prospecção guarda o produto e o ICP usados; alterar o ICP depois não altera prospecções já executadas.
- FR-6: A criação de produto por IA devolve sugestão editável, nunca salva direto.

**Prospecção e descoberta**

- FR-7: O fluxo de nova prospecção tem exatamente quatro passos e nenhum campo de texto longo obrigatório.
- FR-8: Os modos são `empresas`, `pessoas`, `empresa_unica` e `oportunidades`; em B2C só `pessoas` e `oportunidades`.
- FR-9: A execução é assíncrona: a rota devolve o id imediatamente e o cliente acompanha por `GET /api/prospeccoes/[id]/andamento`.
- FR-10: As etapas exibidas são de negócio; nenhum nome de fornecedor, agente, modelo ou endpoint aparece na tela.
- FR-11: Toda chamada externa passa por `lib/descoberta.ts`, que cai para demonstração quando não há chave e traduz falha em erro de negócio com código e ação.
- FR-12: Todo dado externo é gravado com origem (endereço) e data de consulta.
- FR-13: Há um teto de consultas por prospecção e cache de página de 24 horas.

**Qualificação**

- FR-14: Todo lead e toda conta têm `fit` e lista de evidências por critério, com um dos três resultados: atende, não atende, não foi possível verificar.
- FR-15: Critério sem dado nunca conta como atendido.
- FR-16: A hipótese de dor é sempre condicional, cita ao menos um sinal datado e fica em bloco separado das evidências.
- FR-17: Sinal sem fonte é descartado; sinal com mais de 90 dias é marcado como antigo.
- FR-18: Em B2B cada pessoa tem papel (decisor, influenciador, champion, desconhecido), editável pelo vendedor.

**Abordagem**

- FR-19: A estratégia (objetivo, gancho, dor provável, tom, CTA) é gerada e exibida antes das mensagens, e é editável item a item.
- FR-20: As mensagens dos três canais derivam da estratégia, com gancho único por canal e as regras de tamanho atuais.
- FR-21: "Regenerar" oferece seis direções fixas e guarda a variação usada, com uma volta à versão anterior.
- FR-22: A abordagem é salva no lead e exposta no link permanente e na impressão.

**Acompanhamento**

- FR-23: Os estados do lead são Novo, Pesquisado, Qualificado, Selecionado, Abordado, Respondeu e Descartado, alterados por menu `•••` ou pela ficha, e alguns automaticamente por ação do app.
- FR-24: A lista mostra Lead, Empresa, Fit, Sinal, Papel e Status (B2B) ou Pessoa, Fit, Sinal, Contexto e Status (B2C); as ações ficam em menu, não em botões repetidos por linha.
- FR-25: Cada prospecção exibe o funil encontrados → qualificados → abordagens → respostas.
- FR-26: A exportação em CSV respeita o filtro aplicado e abre no Excel em pt-BR.

**Dados pessoais**

- FR-27: Só entram dados publicados pela própria pessoa ou pela empresa em fonte pública.
- FR-28: O app não grava nem infere categoria sensível; a verificação automática omite a evidência e registra no console.
- FR-29: Retenção: 180 dias para B2B e 90 para B2C, sem atualização, aplicada na inicialização; "Apagar dados desta pessoa" remove o lead e suas abordagens.
- FR-30: Toda ficha mostra "como este dado chegou aqui" (critério, fonte, data).

## Non-Goals

- Não vira CRM: sem negócios, valores, previsão, funil de vendas por etapa comercial, tarefas ou agenda. O pipeline é só "onde está cada oportunidade".
- Não envia mensagem: nem e-mail, nem convite ou mensagem de LinkedIn, nem WhatsApp. Escreve, salva e entrega. Envio no LinkedIn continua no `prospeccao-linkedin`, que não muda nesta PRD.
- Não faz cadência multi-toque com espera entre etapas nem acompanhamento de resposta por caixa de entrada.
- Não expõe a arquitetura de agentes, o nome do fornecedor de dados, o modelo de IA nem consumo de crédito na tela principal.
- Não importa base de contatos comprada nem faz upload de lista de terceiros.
- Não infere dado sensível, não faz enriquecimento de telefone pessoal nem descoberta de e-mail por padrão de domínio.
- Não vira padrão da suíte: os outros 17 apps continuam com uma tela e nenhum menu.
- Não muda `lib/ai.ts`, `components/ui.tsx`, `lib/store.ts` nem qualquer arquivo compartilhado; melhorias transversais, se aparecerem, nascem no `pdi-time` em outra PRD.
- Não tem colaboração: continua uma conta de administrador por instância, sem times, permissões ou atribuição de lead.

## Design Considerations

- **Navegação no header, não em barra lateral.** A referência enviada mostra uma barra lateral, mas a fundação visual de 15/09 já definiu o header com navegação real, chip de status e conta, e `lib/navegacao.ts` prevê destinos extras por app. Duas navegações na mesma tela seria ruído; a lateral fica de fora, e os cinco destinos entram no header. No celular eles usam a folha de menu que já existe.
- **O contexto sai da coluna permanente.** Onde hoje há um formulário fixo ocupando metade da tela, fica uma linha: nome da prospecção, produto, recorte e "Editar estratégia". A área de trabalho é a lista.
- **Cartões de escolha** (passos 2 e 3) seguem o desenho da referência: ícone à esquerda, título em uma linha, descrição em uma linha, seleção com borda no acento `#0b5789`. Nada de rádio nu.
- **Chips com significado fixo**: fit usa `.chip-alta|media|baixa`; papel usa `.chip-neutral`; sinal usa `.chip-positivo`; status usa rótulos em sentence case. Nunca o valor bruto do banco.
- **Uma ação primária por tela.** Na lista, "Criar abordagem" não se repete por linha: vai para o menu `•••` e para a ficha.
- **Progresso honesto.** As etapas exibidas correspondem a trabalho real gravado em `prospeccoes.etapa`; nenhuma etapa decorativa com `setTimeout`.
- **Hipótese parece hipótese.** Bloco com rótulo próprio, ícone de lâmpada, fundo neutro, e texto condicional — nunca no mesmo bloco das evidências, que usam marca de conferido.
- Limites de texto do `PADRAO.md` valem em todas as telas novas: título de hero até 8 palavras, apoio até 20, listas de até 5 itens com até 6 palavras, uma linha de ajuda por campo.

## Technical Considerations

- **Execução longa.** Descoberta + qualificação passam de qualquer limite razoável de requisição. O trabalho roda em uma função disparada pela rota (sem `await` no caminho da resposta), gravando estado em SQLite a cada etapa; o cliente faz polling de 2 em 2 segundos. Sem fila, sem worker, sem dependência nova. Reinício do contêiner deixa prospecções `executando` órfãs: na inicialização, toda prospecção `executando` com mais de 30 minutos vira `falhou` com mensagem clara e botão "Repetir".
- **Capacidades da Bright Data usadas internamente** (nenhuma aparece na tela): busca na web para descobrir empresas, notícias e sinais; leitura de página em markdown para transformar site público em contexto; perfil profissional para enriquecer pessoa; descoberta em lote para listas maiores. Todas atrás de `lib/descoberta.ts`, com uma zona para busca e outra para leitura, ambas em "Opções avançadas" do `/setup`, com padrão preenchido.
- **Chamadas assíncronas do fornecedor** (descoberta em lote devolve um identificador e exige consulta de andamento) não podem travar a etapa: a camada faz no máximo N consultas espaçadas e, esgotado o tempo, segue com o que já tem.
- **Custo.** Cada empresa examinada custa pelo menos uma busca e uma leitura. Daí o teto por prospecção (US-023), o cache de 24 horas e as quantidades alvo fixas (10, 25, 50).
- **Estado em memória não serve mais.** Tudo que hoje vive em `Map` de módulo (última busca, leads vistos) passa para as tabelas novas; o disco efêmero do plano gratuito continua sendo avisado no `/setup`, como já é hoje.
- **Erros** seguem o padrão da suíte: `ErroIA` e `ErroDescoberta` com código, mensagem de negócio e ação ("Conectar a pesquisa de mercado", indo para `/setup`). Detalhe técnico só no console.
- **Rotas novas nascem privadas** (regra do `proxy.ts`); nenhuma entra na lista pública.
- **Migração.** Não há base instalada com dados a preservar; as tabelas novas são criadas na primeira execução e as rotas antigas (`POST /api/leads`, `POST /api/abordagem`) continuam existindo até a US-039, para o MCP e a rotina não quebrarem no meio do caminho.
- **Ordem de implementação.** Fases 1 e 2 já dão um workspace usável em demonstração; a fase 3 é a que depende de chave e de verba. Se a fase 3 atrasar, o app continua demonstrável de ponta a ponta.

## Success Metrics

| Métrica | Hoje | Meta |
|---|---|---|
| Campos preenchidos para criar a segunda prospecção | 6 (todos, incluindo 1 textarea longo) | 0 a 2 |
| Leads com justificativa verificável ("por que está aqui") | 0% | 100% |
| Sinais com fonte e data | 0 (o "sinal" é montado de campos cadastrais) | 100% |
| Trabalho que sobrevive ao fechar a aba | só o histórico da busca | produtos, prospecções, leads, status e abordagens |
| Ações repetidas por linha na lista | 2 botões por lead | 0 (menu `•••`) |
| Jornadas suportadas | 1 implícita (B2B) | 2 explícitas (B2B e B2C) |
| Tempo até a primeira lista qualificada, em demonstração | não aplicável | menos de 60 segundos |
| Teste com 5 vendedores | não medido | 5 de 5 explicam por que um lead entrou na lista; 4 de 5 criam a segunda prospecção sem ajuda |

## Open Questions

1. **Nome do app no catálogo.** "Prospecção com IA" continua? A promessa muda de "monta a lista e escreve a abordagem" para "descobre, qualifica e prepara a abordagem". Proposta: manter o nome, reescrever `problema` e `ia`.
2. **Sobreposição com o `prospeccao-linkedin`.** Com o workspace, os dois ficam próximos. Vale reposicionar o `prospeccao-linkedin` como "executar a prospecção dentro do LinkedIn" (envio e sequência) e deixar a descoberta e a qualificação aqui? Isso não muda código nesta PRD, só texto de catálogo.
3. **Quantidade alvo e teto de consultas.** 10/25/50 empresas e 60 consultas por prospecção são chutes calibrados por custo. Confirmar com uma execução real antes de fixar.
4. **Descoberta em lote.** Os conjuntos de dados prontos do fornecedor (perfis profissionais, empresas) valem o custo e o tempo de execução assíncrona, ou a busca na web + leitura de página já resolve a v1? Proposta: v1 sem lote, com a interface de `descobrirEmLote` já definida.
5. **B2C, alcance real.** Com fontes públicas e sem base comprada, a descoberta B2C depende muito do nicho. Vale limitar a v1 a "profissionais e pequenos empreendedores" (onde há perfil público) e dizer isso na tela, em vez de prometer consumidor final?
6. **"Empresas parecidas com meus melhores clientes"** (exemplo do campo único) exige o vendedor informar os melhores clientes. Entra como campo do produto ("clientes de referência") ou fica fora da v1?
7. **Retenção.** 180 dias (B2B) e 90 (B2C) são razoáveis para o uso comercial, ou o vendedor vai reclamar de perder lista trabalhada? Alternativa: só leads sem interação expiram.
8. **Aviso de LGPD.** Uma linha na tela e um parágrafo no README bastam, ou o app deve ter uma página de "como usamos dados públicos" acessível pelo rodapé?
