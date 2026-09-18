# PRD: Simulador de Vendas — Produto → Simulação → Sessões, treino por voz no navegador e painel do gestor

Data: 17/09/2026. Escopo: só `simulador-vendas/` (mais a entrada dele em `catalogo.json` e uma história de infraestrutura que nasce no `pdi-time` e é replicada, US-021). Referência visual: mockup da Home enviado por Rafael em 17/09/2026 (sidebar, hero com foto, quatro indicadores, "Simulações ativas", "Comece em 3 passos"). Continua `tasks/prd-revisao-onboarding-erros-conta.md` (US-032/US-033, que deixaram este app na fundação visual nova, com conta, erros orientados e a sala de treino por link). Segue o modelo de app independente inaugurado por `tasks/prd-whatsapp-atendente-telas.md` (17/09/2026).

## Introduction

Hoje o Simulador de Vendas faz duas coisas: analisa uma conversa **já acontecida** (o gestor cola o texto ou envia `.txt`/`.vtt`/`.srt`) e, desde a US-016, abre uma **sala de treino** por link (`/simular/<código>`) onde o vendedor conversa com um cliente simulado — por texto, ou pelo widget de voz da ElevenLabs quando a integração está conectada. O cliente simulado vem de um **cenário** (3 prontos: lead frio, pedido de desconto, renovação em risco), que é uma mistura de "quem é o cliente" com "sobre o que é a conversa", e o link é um cenário fixo para um vendedor escolhido de antemão.

Isso prova a ideia, mas não sustenta o uso real. Faltam três coisas:

1. **O produto que está sendo vendido.** Hoje a IA não sabe o que a empresa vende: o cliente simulado improvisa e a avaliação julga técnica de venda no vácuo. Quem treina um time precisa treinar a venda **daquele** produto — a proposta de valor, os diferenciais, as objeções que aparecem de verdade.
2. **Um link para o time inteiro.** Hoje cada link é praticamente de uma pessoa. O gestor precisa criar uma simulação uma vez, mandar **um** link para 30 vendedores e receber 30 resultados comparáveis, com clientes diferentes entre si de propósito.
3. **Treino por voz de verdade.** Vender é falar. Hoje a voz só existe quando alguém configura um agente conversacional na ElevenLabs — e sem isso o vendedor "treina" digitando, que não treina o que importa. A simulação precisa **abrir falando** em qualquer navegador, com ou sem chave de voz configurada.

Este PRD reorganiza o app em torno de **três entidades: Produto → Simulação → Sessão**. O gestor cadastra um produto uma vez (landing page, documentos, texto), a IA gera a ficha do produto, e a partir dela o gestor cria simulações — cada uma com metodologia, dificuldade, personas e um link único. Cada vendedor que abre esse link gera uma **sessão** própria, recebe uma persona atribuída na hora, conversa por voz e sai com um feedback que ensina. O gestor vê o time por vendedor, por persona e por competência, ao longo do tempo.

O app passa a ter seis lugares: **Início | Produtos | Simulações | Equipe | Resultados | Configurações**.

### Decisões tomadas em 17/09/2026 (Rafael)

- **D1. Três entidades, inclusive no banco.** `Produto` (biblioteca reutilizável), `Simulacao` (o desafio + o link) e `Sessao` (uma conversa de um vendedor). Uma simulação pertence a um produto; uma sessão pertence a uma simulação e a um participante. O link pertence à **simulação**, nunca à sessão. `Avaliacao` é filha da sessão. Nada disso é opcional para o MVP: é o que evita reescrever tudo na primeira feature nova.
- **D2. Persona é catálogo fixo em código, não CRUD.** As 7 personas (Amigável, Apressado, Direto, Cético, Sensível a preço, Especialista, Resistente) moram em `lib/personas.ts` como `CRITERIOS_PADRAO` mora em `lib/criterios.ts` — sem tela de gestão, sem menu próprio, sem semeadura em banco. Internamente cada persona já tem atributos compostos (comportamento principal, característica secundária, conhecimento, paciência, abertura); a tela mostra só o nome e o emoji. Criar persona própria fica fora do MVP.
- **D3. Os 3 cenários atuais viram dado de exemplo, não conceito.** `lib/cenarios.ts` sai do caminho principal: na migração, os 3 cenários prontos são convertidos em um produto de exemplo ("Produto de demonstração") com uma simulação de exemplo cada, e o conceito "cenário" desaparece das telas. O contexto da conversa (por que o cliente aceitou falar) passa a ser gerado a partir do produto + persona + dificuldade, não escrito à mão.
- **D4. A simulação abre por voz, em qualquer navegador.** Três níveis, escolhidos pelo servidor na abertura da sala, nesta ordem: (1) agente conversacional da ElevenLabs, quando conectado; (2) **voz do navegador** — o navegador escuta (Web Speech API), a IA do OpenRouter responde como cliente e a fala sai pela ElevenLabs (quando só a chave existe) ou pela voz do próprio navegador; (3) texto. O nível 2 é o que cumpre "experiência por voz mesmo pelo link do navegador" sem exigir nenhuma configuração de voz do gestor. Texto nunca some: é a alternativa explícita ("Prefiro digitar") e o caminho de quem está num navegador sem suporte.
- **D5. OAuth onde existe OAuth.** A IA continua conectando em um clique (OpenRouter, PKCE, já implementado). O **vendedor** se identifica no link com "Entrar com Google" / "Entrar com Microsoft" (escopo `openid email profile`, reaproveitando `GOOGLE_CLIENT_ID_APP`/`MICROSOFT_CLIENT_ID_APP` que o app já usa para o envio de e-mail), com nome e e-mail manuais como alternativa sempre visível. A ElevenLabs **não oferece OAuth** para chave de conta (`tasks/oauth-integracoes.md`): continua no passo a passo de três passos, agora opcional de verdade, porque o nível 2 de voz funciona sem ela.
- **D6. Metodologia decide a rubrica.** MVP com três opções: SPIN Selling (9 critérios), Venda consultiva (os 7 critérios que o app já tem, em `lib/criterios.ts`) e Personalizada (o gestor escreve os critérios). A rubrica da metodologia é o que o agente avaliador recebe; o vendedor vê no máximo 4 grupos e uma nota geral.
- **D7. Dificuldade é um parâmetro do cliente, não um texto.** Fácil / Realista / Difícil viram três conjuntos de atributos internos (quantidade de objeções, disposição a dar informação, resistência, paciência) somados aos da persona — nunca uma frase solta no prompt.
- **D8. Persona aleatória é distribuição, não sorteio.** A atribuição acontece **quando a sessão começa** e escolhe a persona menos usada na simulação até ali (desempate aleatório), para o painel do gestor não ficar enviesado.
- **D9. Navegação no cabeçalho, não em barra lateral.** O mockup tem sidebar; a suíte tem `Topbar` e a fundação visual de 15/09 (`tasks/prd-ui-ux-executivos.md`) foi desenhada em torno dela. Os seis destinos vão para o cabeçalho compartilhado. O resto do mockup (hero com foto e cartões flutuantes, quatro indicadores com variação, cartões grandes de simulação, "Comece em 3 passos", "Dica da semana") é seguido de perto. A citação motivacional do rodapé do mockup fica de fora.
- **D10. O app vira independente** (`"independente": true` em `catalogo.json`), como o `whatsapp-atendente`: seis telas próprias não cabem no molde de tela única do `pdi-time`. A camada `INFRA` continua idêntica e conferida.
- **D11. Analisar conversa real continua existindo.** A tela de hoje (colar/enviar conversa) não é apagada: vira uma ação dentro de **Equipe** ("Analisar uma conversa real"), com a mesma rota, o mesmo MCP e o mesmo resultado. É o único caminho para avaliar uma conversa que aconteceu com um cliente de verdade, e já é a ferramenta exposta por `/mcp`.
- **D12. Sem RAG no MVP.** O conhecimento do produto é uma ficha estruturada (campos curtos, limite de tamanho) que entra inteira no prompt. Busca vetorial só quando o volume justificar.
- **D13. Os endereços públicos não mudam.** A sala continua em `/simular/<código>` e as rotas públicas dela sob `/api/salas/<código>/*`, porque `proxy.ts` é infraestrutura comparada byte a byte e essas duas regras já existem nos 17 apps. A entidade se chama Simulação no banco e nas telas; o prefixo público continua `salas` e o motivo fica documentado no topo de cada rota.

### Premissas

- P1. `PADRAO.md` continua valendo no que não é camada de produto: Next.js 16, Tailwind 4, React 19, `node:sqlite`, IA via OpenRouter, português sem jargão na tela (`scripts/verificar-jargao.mjs`), acento do segmento Vendas (`#3e68cc`, `scripts/verificar-paleta.mjs`), nenhuma dependência nova além das nomeadas em Open Questions.
- P2. Tudo funciona em **modo demonstração**, sem nenhuma chave: um produto de exemplo com ficha pronta, uma simulação de exemplo com link válido, seis sessões de exemplo com avaliações plausíveis (três vendedores, personas diferentes, notas entre 6,4 e 9,1) e a sala abrindo por voz do navegador com um roteiro fixo. Todo dado de exemplo leva o chip "Exemplo" e some quando o primeiro dado real do mesmo tipo aparece.
- P3. Uma conta de administrador por instância (modelo da suíte). "Equipe" é a lista de participantes que já treinaram mais quem o gestor cadastrar — não é gestão de usuários com senha. Vendedor nunca cria conta.
- P4. Gráficos são SVG desenhado à mão no próprio componente (barras horizontais e uma linha de evolução), sem biblioteca — mesmo caminho de `components/GraficoCriteriosFracos.tsx`, que já existe aqui.
- P5. A Web Speech API (`SpeechRecognition`) exige HTTPS e existe em Chrome, Edge e Safari; **não existe no Firefox**. Onde não existir, a sala cai para texto com uma frase explicando e o convite a abrir no Chrome — nunca uma tela quebrada.
- P6. Textos seguem os limites de "Menos texto na tela" do `PADRAO.md`: título de painel até 8 palavras, apoio até 20, uma linha de ajuda por campo.
- P7. Toda verificação de tela é feita em desktop (1400x1000) e celular (390 de largura). A sala do vendedor é verificada primeiro no celular: é onde ela vai ser usada.
- P8. Nenhum endpoint da ElevenLabs é assumido a partir deste PRD: os caminhos de texto-para-voz e de vozes são conferidos na documentação oficial na hora de implementar, como foi feito em US-015.

## Goals

- Um gestor cadastra um produto (landing page ou documentos), cria uma simulação e tem um link para o time em **menos de 10 minutos**, sem nenhuma configuração técnica.
- Um vendedor abre o link no celular, se identifica em um toque e **está falando com o cliente simulado em menos de 30 segundos**, sem instalar nada.
- A simulação é por voz em qualquer instalação do app, inclusive sem nenhuma chave de voz configurada.
- Trinta vendedores no mesmo link geram trinta sessões independentes, com personas distribuídas de forma equilibrada.
- O vendedor sai da conversa com um feedback que ensina (o que fez bem, a principal oportunidade e uma frase para experimentar), não com uma nota.
- O gestor responde, em uma tela, "como meu time vende para cada tipo de cliente?" e "quem evoluiu?".

## User Stories

As histórias estão em ordem de implementação. Cada uma cabe em uma sessão de trabalho e termina com lint, build e (quando tem tela) verificação no navegador em desktop 1400x1000 e celular 390.

### Fase 0: fundação (independência, navegação e modelo de dados)

### US-001: O app vira independente e ganha os seis destinos
**Description:** As a gestor comercial, I want ver no cabeçalho os seis lugares do app so that eu saiba onde cadastrar produto, criar simulação e ver resultado, mesmo antes das telas ficarem prontas.

**Acceptance Criteria:**
- [ ] `catalogo.json`: a entrada de `simulador-vendas` ganha `"independente": true`; `scripts/verificar-padrao.sh` passa a conferir só `INFRA` e `ESTRUTURA` para este app (o modelo já existe desde o `whatsapp-atendente`, nenhuma mudança no script)
- [ ] `simulador-vendas/CLAUDE.md` registra a data (17/09/2026) e o commit a partir do qual `components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts` e `app/globals.css` passam a ser próprios do app
- [ ] `lib/navegacao.ts` (agora próprio) exporta Início `/`, Produtos `/produtos`, Simulações `/simulacoes`, Equipe `/equipe`, Resultados `/resultados`, Configurações `/setup`; "Histórico" sai do cabeçalho e passa a ser linkado só de Resultados
- [ ] `app/produtos/page.tsx`, `app/simulacoes/page.tsx`, `app/equipe/page.tsx`, `app/resultados/page.tsx` existem, usam o mesmo `Topbar` e mostram um `Empty` com a ação que leva ao que já funciona enquanto a história de cada uma não chega — nenhuma rota devolve 404
- [ ] `proxy.ts` não muda: as quatro páginas nascem privadas; `/simular/*` e `/api/salas/*` continuam públicas (D13)
- [ ] O item ativo do cabeçalho reflete a rota atual nas seis páginas; lint e build passam; verificar no navegador

### US-002: Produto, Simulação, Sessão e Participante no banco
**Description:** As a app, I want guardar produto, simulação, sessão, participante e avaliação em tabelas próprias so that trinta vendedores no mesmo link gerem trinta históricos independentes sem nada se misturar.

**Acceptance Criteria:**
- [ ] `lib/produtos.ts`: tabela `produtos` (`id`, `nome`, `descricao`, `categoria`, `conhecimento` JSON — a ficha da US-006 —, `status` `rascunho|pronto`, `exemplo` 0/1, `criadoEm`, `atualizadoEm`) e `fontes_produto` (`id`, `produtoId`, `tipo` `landing|documento|texto`, `origem` (URL ou nome do arquivo), `conteudo` texto normalizado, `criadoEm`), com `criar`/`listar`/`obter`/`atualizar`/`apagar`/`adicionarFonte`/`listarFontes`/`removerFonte`
- [ ] `lib/simulacoes.ts`: tabela `simulacoes` (`codigo` chave — o mesmo formato base64url de 12 bytes de `lib/salas.ts` —, `produtoId`, `nome`, `objetivo`, `metodologia` `spin|consultiva|personalizada`, `criteriosPersonalizados` JSON nulo, `dificuldade` `facil|realista|dificil`, `modoPersona` `aleatoria|escolhidas`, `personas` JSON (lista de ids), `maxTentativas`, `mostrarFeedback` 0/1, `permiteTexto` 0/1, `permiteVoz` 0/1, `duracaoMin`, `status` `ativa|pausada|encerrada`, `exemplo` 0/1, `criadoEm`), com `criar`/`listar`/`obter`/`atualizar`/`mudarStatus`/`apagar`
- [ ] `lib/participantes.ts`: tabela `participantes` (`id`, `nome`, `email` único e normalizado em minúsculas, `origem` `link|cadastro|google|microsoft`, `criadoEm`), com `garantir({nome,email,origem})` (cria ou devolve o existente pelo e-mail, atualizando o nome só quando o salvo estiver vazio)
- [ ] `lib/sessoes.ts`: tabela `sessoes` (`id`, `simulacaoCodigo`, `participanteId`, `personaId`, `modo` `voz-agente|voz-navegador|texto`, `status` `preparando|em_andamento|encerrada|avaliada|abandonada`, `iniciadaEm`, `encerradaEm`, `duracaoSeg`, `resultadoId` do histórico, `criadoEm`) e `mensagens_sessao` (`id`, `sessaoId`, `papel` `vendedor|cliente`, `texto`, `segundo`, `criadoEm`), com `abrir`, `registrarMensagem`, `transcricao(sessaoId)`, `encerrar`, `listarPorSimulacao`, `listarPorParticipante`, `contarPorPersona(simulacaoCodigo)`, `tentativasDe(simulacaoCodigo, participanteId)`
- [ ] `lib/vendedores.ts` é **substituído** por `lib/participantes.ts`: a migração copia cada vendedor existente (nome, e-mail, `origem: "cadastro"`) e a tabela antiga deixa de ser lida (nenhum `DROP TABLE` — o padrão da suíte é nunca apagar dado de banco existente)
- [ ] Migração das salas e cenários (D3): na primeira leitura após a atualização, cada `sala` vira uma `simulacao` do produto de exemplo, preservando o `codigo` (links já enviados continuam abrindo), e cada resultado de tipo `conversa` já salvo em `lib/historico.ts` continua acessível em `/r/<id>` sem mudança
- [ ] Todo `id` novo usa `crypto.randomBytes(9).toString("base64url")`, mesmo gerador do resto do app; toda tabela nova mora no mesmo `app.sqlite` de `lib/store.ts`
- [ ] Teste com servidor standalone e `DATA_DIR` em `/tmp`: criar produto, simulação e três sessões de participantes diferentes, reiniciar o servidor, conferir que tudo volta e que `contarPorPersona` soma certo
- [ ] Lint e build passam

### Fase 1: Produtos

### US-003: Biblioteca de produtos
**Description:** As a gestor, I want ver e organizar os produtos que minha empresa vende so that eu crie vários treinos do mesmo produto sem recarregar material nenhuma vez.

**Acceptance Criteria:**
- [ ] `/produtos` lista cartões grandes (nome, categoria, "N materiais", "N simulações", ações "Editar" e "Criar treino"), com `+ Novo produto` como ação primária no topo
- [ ] `Empty` quando não há produto: título, uma frase e a ação "Cadastrar meu primeiro produto"
- [ ] `GET/POST /api/produtos` e `GET/PUT/DELETE /api/produtos/[id]`; apagar pede confirmação (`useConfirmacao`) e avisa quantas simulações dependem do produto; um produto com simulação ativa **não** é apagado (a mensagem diz o que fazer)
- [ ] O produto de exemplo aparece com o chip "Exemplo" e some quando o primeiro produto real é criado
- [ ] Lint e build passam; verificar no navegador

### US-004: Ensinar o produto pela landing page
**Description:** As a gestor, I want colar o endereço da página do meu produto so that a IA aprenda o que vendemos sem eu digitar nada.

**Acceptance Criteria:**
- [ ] Campo "Endereço da página" + botão "Importar conteúdo" no cadastro do produto; `POST /api/produtos/[id]/fontes` com `{ tipo: "landing", url }`
- [ ] Extração no servidor, sem dependência nova: `fetch` com `User-Agent` próprio, limite de 2 MB e 15 s, `Content-Type` precisa ser `text/html` ou `text/plain`; o HTML é normalizado removendo `<script>`, `<style>`, `<nav>`, `<footer>`, comentários e atributos, convertendo `<h1>`–`<h3>`, `<li>` e `<p>` em linhas, colapsando espaços em branco e cortando em 40.000 caracteres
- [ ] Endereço inválido, página que não responde, resposta não-HTML, conteúdo com menos de 200 caracteres úteis: cada caso tem sua frase de negócio ("Não conseguimos ler essa página. Cole o texto principal em 'Texto' que funciona igual."), nunca o erro técnico — o código vai para o `console.error`
- [ ] Bloqueio de endereços internos (`localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, esquemas fora de `http`/`https`) antes do `fetch` e de novo a cada redirecionamento (máximo 3), com o motivo só no log
- [ ] A fonte importada aparece na lista de materiais do produto com o endereço, a data e "Remover"
- [ ] Lint e build passam; verificar no navegador

### US-005: Ensinar o produto por documentos e por texto
**Description:** As a gestor, I want enviar a apresentação comercial e colar informações extras so that o cliente simulado conheça o produto como um cliente real conheceria.

**Acceptance Criteria:**
- [ ] `Dropzone` (componente que já existe) aceitando `.txt`, `.md`, `.vtt` e `.srt` até 2 MB por arquivo, até 10 materiais por produto; conversão no servidor reaproveitando `lib/legendas.ts` para os dois formatos de legenda
- [ ] `.pdf`, `.docx` e `.pptx` aparecem na área de envio como **aceitos ou não** conforme a resposta da Q1 (Open Questions); enquanto a resposta não vier, a área diz em uma linha quais formatos aceita hoje e o campo "Texto" fica ao lado como caminho garantido — a história é dada como pronta sem eles
- [ ] Campo "Texto" (área livre, até 20.000 caracteres) grava uma fonte `tipo: "texto"`
- [ ] Cada material da lista mostra nome, tipo, tamanho do texto extraído ("~3.200 palavras") e "Remover"; remover material marca o produto como `rascunho` de novo se a ficha tiver sido gerada a partir dele
- [ ] Nenhum arquivo é guardado em disco: só o texto normalizado vai para `fontes_produto` (o app não tem storage e não precisa de um)
- [ ] Lint e build passam; verificar no navegador (envio no celular também)

### US-006: A ficha do produto ("Entendemos seu produto")
**Description:** As a gestor, I want ver o que a IA entendeu do meu produto e corrigir so that o cliente simulado e a avaliação usem a verdade da minha empresa, não uma invenção.

**Acceptance Criteria:**
- [ ] `lib/conhecimento.ts` (server-only): `gerarConhecimento(fontes)` chama `askJSON` e devolve `{ resumo, publico, beneficios[], diferenciais[], objecoes[], precoFaixa?, concorrentes[] }`, com limites por campo (resumo ≤ 600 caracteres, listas com 3 a 6 itens de ≤ 120 caracteres) aplicados **no código** depois da resposta, nunca só pedidos no prompt
- [ ] O prompt recebe as fontes concatenadas com um corte de 40.000 caracteres no total (as mais recentes primeiro) e a instrução de **não inventar**: o que não estiver no material volta como lista vazia
- [ ] A tela mostra a ficha em blocos editáveis (o mesmo desenho do mockup: Público, Principais benefícios, Diferenciais, Objeções prováveis), com "Gerar de novo" e salvamento explícito; editar a ficha marca o produto como `pronto`
- [ ] Sem IA conectada, a ficha de exemplo (produto de demonstração) aparece com `SeloIA demo` e o aviso de uma frase com link para `/setup`
- [ ] A ficha é a **única** coisa que o cliente simulado e o avaliador recebem sobre o produto (D12); as fontes brutas nunca entram em prompt de simulação
- [ ] `ErroIA` da geração vira `ErrorBox` com código e ação, como no resto do app
- [ ] Lint e build passam; verificar no navegador

### Fase 2: Personas

### US-007: Catálogo de personas com atributos compostos
**Description:** As a gestor, I want escolher que tipos de cliente meu time vai encontrar so that o treino cubra o cliente fácil e o difícil, sem eu descrever ninguém.

**Acceptance Criteria:**
- [ ] `lib/personas.ts` (puro, sem `node:*`, importável do cliente e do servidor) exporta `PERSONAS: Persona[]` com sete entradas: `amigavel` 🙂, `apressado` ⚡, `direto` 🎯, `cetico` 🤨, `preco` 💰, `especialista` 🧠, `resistente` 🧱
- [ ] Cada persona tem `{ id, nome, emoji, comportamento, secundaria?, conhecimento: 0..2, paciencia: 0..2, abertura: 0..2, precoSensivel: 0..2, frasesTipicas[] }` — a tela mostra só emoji + nome (D2)
- [ ] `lib/cliente-simulado.ts`: `montarPersonagem({ persona, dificuldade, produto })` devolve `{ nome, cargo, empresa, contexto, instrucoes }` — nome, cargo e empresa sorteados de listas fixas por segmento, contexto escrito a partir do produto e da persona, `instrucoes` é o system prompt
- [ ] A dificuldade soma ao personagem (D7): `facil` (+1 abertura, +1 paciência, no máximo 1 objeção), `realista` (atributos da persona), `dificil` (−1 abertura, −1 paciência, 3 a 4 objeções, exige prova antes de aceitar argumento) — os deltas são aplicados com `clamp(0,2)` no código
- [ ] O system prompt sempre contém: nunca sair do personagem, nunca dar dica de vendas, nunca revelar a persona, falas de 1 a 3 frases em português do Brasil, quem encerra é o vendedor
- [ ] Teste de unidade por `node --test` ou script equivalente: os sete personagens geram prompt não vazio nas três dificuldades e nenhum vazamento do nome da persona no texto do contexto
- [ ] Lint e build passam

### US-008: Atribuição equilibrada da persona
**Description:** As a gestor, I want que meus vendedores peguem clientes diferentes so that o painel mostre como o time vende para cada perfil, e não 70% do mesmo perfil.

**Acceptance Criteria:**
- [ ] `lib/atribuicao.ts`: `escolherPersona({ simulacao, contagem })` devolve a persona menos usada entre as habilitadas na simulação; empate é desfeito aleatoriamente
- [ ] A atribuição acontece **na abertura da sessão** (`sessoes.abrir`), nunca na criação do link (D8)
- [ ] Quando o mesmo participante repete a simulação, a persona que ele já pegou é evitada enquanto houver outra disponível (ele treina perfis diferentes; o equilíbrio geral continua valendo)
- [ ] Modo `escolhidas` com uma única persona: todo mundo pega aquela, sem erro
- [ ] Teste: 50 sessões numa simulação com 5 personas distribuem 10 ± 2 por persona
- [ ] Lint e build passam

### Fase 3: Simulações

### US-009: Criar simulação em três passos
**Description:** As a gestor, I want criar um treino em três passos so that eu saia da tela com o link pronto para mandar no grupo do time.

**Acceptance Criteria:**
- [ ] `/simulacoes/nova` com o componente `Passos` (que já existe): **1 Produto → 2 Desafio → 3 Compartilhar**
- [ ] Passo 1: select de produto mostrando o estado do conhecimento ("3 materiais", "página importada", "ficha pronta"); produto em rascunho avisa e oferece "Terminar o cadastro" sem bloquear
- [ ] Passo 2: nome (sugerido automaticamente como "<metodologia> — <produto>"), objetivo (área livre, opcional), metodologia (3 opções, US-010), dificuldade (3 opções), personas (aleatórias ou escolhidas, US-007) e as regras da US-011
- [ ] Passo 3: tela de confirmação com o link, "Copiar link" e o passo a passo de seis linhas ("vendedor acessa → informa seus dados → recebe um cliente virtual → realiza a venda → recebe feedback → resultado aparece para você")
- [ ] Voltar entre passos preserva o que já foi preenchido; nada é salvo até o passo 3 (uma única chamada `POST /api/simulacoes`)
- [ ] Sem nenhum produto cadastrado, o passo 1 leva para `/produtos` com a frase "Primeiro cadastre o que seu time vende"
- [ ] Lint e build passam; verificar no navegador (desktop e celular)

### US-010: Metodologias e rubricas
**Description:** As a gestor, I want escolher o método de venda que meu time usa so that a avaliação cobre o que eu ensino, não uma régua genérica.

**Acceptance Criteria:**
- [ ] `lib/metodologias.ts` (puro): `spin` (Perguntas de situação, Perguntas de problema, Perguntas de implicação, Need-payoff, Escuta ativa, Proposta de valor, Tratamento de objeções, Descoberta, Próximo passo), `consultiva` (os 7 de `lib/criterios.ts`, reaproveitados sem redigitar) e `personalizada` (critérios escritos pelo gestor, mínimo 3, máximo 10)
- [ ] Cada critério tem `{ id, nome, descricao, grupo }`, com `grupo` em Descoberta / Proposta de valor / Objeções / Fechamento — é o agrupamento que o vendedor vê (4 números, US-020)
- [ ] `lib/criterios.ts` continua existindo e exportando `CRITERIOS_PADRAO` (usado pela análise de conversa real, D11), agora derivado de `metodologias.consultiva` para não haver duas listas
- [ ] A tela mostra as três opções com uma linha cada; "Personalizada" abre os campos de critério inline (sem modal)
- [ ] Lint e build passam; verificar no navegador

### US-011: Regras da simulação e o link
**Description:** As a gestor, I want definir quantas tentativas cada vendedor tem e se ele vê o feedback so that o treino sirva tanto para praticar quanto para avaliar.

**Acceptance Criteria:**
- [ ] Regras no passo 2: "Tentativas por vendedor" (1, 3, 5, sem limite; padrão 3), "Mostrar feedback ao finalizar" (padrão sim), "Permitir voz" (padrão sim), "Permitir texto" (padrão sim), "Tempo da conversa" (5, 10, 15 minutos; padrão 10)
- [ ] Desmarcar voz e texto ao mesmo tempo é impedido na tela com uma frase, não com erro de servidor
- [ ] `POST /api/simulacoes` gera o `codigo` e devolve o link absoluto (`baseUrl(req)` + `/simular/<código>`); o link não expira enquanto a simulação estiver `ativa` (diferente das salas de hoje, que expiram em 30 dias — a migração da US-002 converte `expiraEm` em `status: "encerrada"` quando já passou)
- [ ] Botão "Copiar link" com confirmação visível, e um `<details>` "Como funciona" com os seis passos
- [ ] Lint e build passam; verificar no navegador

### US-012: Lista de simulações
**Description:** As a gestor, I want ver minhas simulações e o que cada uma está rendendo so that eu saiba qual continuar, pausar ou encerrar.

**Acceptance Criteria:**
- [ ] `/simulacoes` lista cartões (nome, produto, chips de metodologia e dificuldade, "N participantes · N sessões", nota média, status) com "Ver resultados" e um menu com "Copiar link", "Pausar"/"Reativar", "Duplicar" e "Encerrar"
- [ ] "Duplicar" copia tudo menos o código e as sessões, abrindo o passo 2 preenchido
- [ ] Simulação pausada: o link abre uma tela amigável ("Este treino está pausado. Fale com quem enviou o link."), sem 404 — mesmo padrão de `app/f/[token]`
- [ ] Filtro por status (Todas / Ativas / Encerradas) e busca por nome, ambos sem recarregar a página
- [ ] Lint e build passam; verificar no navegador

### Fase 4: a sessão do vendedor (voz)

### US-013: Identificação do vendedor em um toque
**Description:** As a vendedor, I want entrar no treino com a conta que já uso no trabalho so that eu comece a conversa sem preencher formulário nem criar senha.

**Acceptance Criteria:**
- [ ] `/simular/<código>` abre a tela de identificação: nome da simulação, produto, uma frase de contexto e os dois botões "Entrar com Google" e "Entrar com Microsoft" quando as credenciais do app existirem (`GOOGLE_CLIENT_ID_APP` / `MICROSOFT_CLIENT_ID_APP`), sempre com "ou informe seu nome e e-mail" logo abaixo (D5)
- [ ] `GET /api/salas/[token]/entrar/google` e `.../microsoft`: mesmo molde PKCE de `app/api/setup/oauth/google/route.ts`, escopo `openid email profile` (nunca `gmail.send`), `state` com o código da simulação, cookie `HttpOnly` de 10 minutos; o callback lê nome e e-mail do `id_token` (verificando `aud`, `iss` e `exp`), chama `participantes.garantir` e redireciona para a preparação
- [ ] Nenhum token do vendedor é guardado: o app usa a identificação e descarta o acesso — o cookie de sessão do vendedor é próprio do app (`sv_sessao`, `HttpOnly`, `SameSite=Lax`, 12 h, só o id da sessão e o do participante)
- [ ] Caminho manual: nome (obrigatório) e e-mail (obrigatório, validado), `participantes.garantir({ origem: "link" })`
- [ ] O vendedor que já treinou nesse navegador vê "Continuar como Ana Souza" com a opção "Não sou eu"
- [ ] Limite de tentativas da simulação: quando o participante já usou todas, a tela diz quantas fez e mostra o feedback da melhor sessão em vez de abrir outra
- [ ] A tela **nunca** mostra menu do app, cabeçalho de gestor nem link para `/setup`
- [ ] Lint e build passam; verificar no navegador (celular primeiro)

### US-014: Preparação — "Seu cliente"
**Description:** As a vendedor, I want saber com quem vou falar e qual é meu objetivo so that eu entre na conversa como entraria numa reunião de verdade.

**Acceptance Criteria:**
- [ ] Depois da identificação, `POST /api/salas/[token]/sessao` abre a sessão (`status: "preparando"`), atribui a persona (US-008) e devolve o personagem (`montarPersonagem`)
- [ ] A tela mostra nome, cargo, empresa, contexto (2 a 3 frases), o tempo aproximado, o objetivo do vendedor e um único botão "Começar conversa"
- [ ] A persona **não** é revelada em lugar nenhum: nem no texto, nem no HTML, nem em resposta de API que o navegador do vendedor receba (a resposta devolve o personagem, não o `personaId`) — verificado olhando a resposta da rota, não só a tela
- [ ] Um aviso de uma linha sobre o microfone aparece antes de começar ("Vamos pedir o microfone para você falar com o cliente"), para a permissão não pegar ninguém de surpresa
- [ ] Sessão aberta e não iniciada por mais de 30 minutos vira `abandonada` na leitura seguinte (cálculo na leitura, sem tarefa agendada)
- [ ] Lint e build passam; verificar no navegador

### US-015: A sala por voz do navegador (nível 2 — o padrão)
**Description:** As a vendedor, I want falar com o cliente simulado abrindo só o link so that eu treine vendendo de boca, sem o gestor precisar configurar nada de voz.

**Acceptance Criteria:**
- [ ] `components/SalaVoz.tsx` (novo; usa `codigo`, nunca `token`, por causa de `scripts/verificar-jargao.mjs`): cabeçalho com nome e cargo do cliente, cronômetro regressivo, estado da conversa ("Ouvindo…", "Pensando…", "Falando…"), a última fala do cliente em texto grande e o botão de microfone central
- [ ] Escuta: `SpeechRecognition`/`webkitSpeechRecognition` com `lang="pt-BR"`, `interimResults` para mostrar o que está sendo entendido, dois modos — **segurar para falar** (padrão no celular) e **mãos livres** com fim de turno por 2 s de silêncio (padrão no desktop) — e um alternador visível entre eles
- [ ] Resposta: `POST /api/salas/[token]/conversar` recebe a fala transcrita, grava em `mensagens_sessao`, monta o prompt com a ficha do produto + personagem + últimas 20 falas e devolve a próxima fala do cliente (`askText`, 1 a 3 frases) — a transcrição fica **no servidor** (diferente de hoje, em que o cliente manda a conversa inteira a cada turno)
- [ ] Fala: quando `ELEVENLABS_API_KEY` existe, `POST /api/salas/[token]/voz` gera o áudio no servidor (texto-para-voz da ElevenLabs, modelo de baixa latência, voz da persona pela US-028) e devolve o áudio — a chave nunca vai para o navegador; sem a chave, `speechSynthesis` com uma voz `pt-BR` do próprio navegador
- [ ] Navegador sem `SpeechRecognition` (Firefox) ou microfone negado: a sala troca para texto na hora, com uma frase explicando e o convite a abrir no Chrome; a conversa já começada continua de onde parou
- [ ] "Prefiro digitar" está sempre visível e alterna para o campo de texto sem perder a conversa; "Encerrar e ver meu resultado" encerra a sessão a qualquer momento
- [ ] O tempo acaba: aviso aos 2 minutos restantes, e no zero o cliente se despede em uma fala e a sessão encerra sozinha
- [ ] Modo demonstração (sem IA conectada): roteiro fixo de 6 falas, a sala funciona inteira por voz do navegador e o resultado sai com `SeloIA demo`
- [ ] Erro da IA no meio da conversa fala com o **vendedor**, não com o gestor ("O cliente não conseguiu responder agora. Tente falar de novo." + botão "Tentar de novo"), com o código técnico só no `console.error` — regra já registrada no `CLAUDE.md` deste app
- [ ] Verificar no navegador em celular 390 (Chrome) e desktop 1400x1000; a conversa inteira precisa caber sem rolagem no celular

### US-016: A sala com o agente conversacional (nível 1)
**Description:** As a vendedor, I want conversar com o cliente como numa ligação, podendo interromper so that o treino se pareça com uma reunião de verdade.

**Acceptance Criteria:**
- [ ] Quando `ELEVENLABS_AGENTE` está conectada (`integracaoConfigurada`, decidido no servidor como hoje), a sala carrega o widget `<elevenlabs-convai>` com as variáveis dinâmicas da **sessão**, não mais da sala: `sessao_id`, `simulacao`, `produto`, `persona_instrucoes` (o system prompt do personagem), `participante` e `duracao_minutos`
- [ ] `app/webhook/elevenlabs/route.ts` passa a casar o evento de pós-conversa por `sessao_id` (mantendo o `sala_token` antigo como alternativa, para links já em uso), grava a transcrição em `mensagens_sessao`, encerra a sessão e dispara a avaliação (US-019)
- [ ] O cartão "Dados para a equipe técnica" em `/setup` é atualizado: novo prompt-modelo (o agente recebe as instruções por variável dinâmica, então o prompt fixo passa a ser só "Siga `{{persona_instrucoes}}`"), as seis variáveis e a contagem de conversas sem avaliação
- [ ] Se o widget não carregar em 10 s, a sala cai para o nível 2 sozinha, sem o vendedor precisar fazer nada, e registra o motivo no log
- [ ] `ESPERA_MAXIMA_MS` (90 s) e o aviso de avaliação não recebida continuam valendo, agora por sessão
- [ ] Verificação possível sem conta real: leitura de código + `tsc`/lint/build + teste ponta a ponta por `curl` do evento assinado, como foi feito na US-015/US-016 antigas (mesmo HMAC)
- [ ] Lint e build passam

### US-017: Tentativas, retomada e histórico do vendedor
**Description:** As a vendedor, I want poder treinar de novo e ver como fui das outras vezes so that eu perceba se estou melhorando.

**Acceptance Criteria:**
- [ ] Ao reabrir o link já identificado: "Você já treinou 2 de 3 vezes" com "Treinar novamente" e "Ver meu último resultado"
- [ ] Sessão encerrada sem avaliação (o vendedor fechou a aba): ao voltar, a sessão é retomada se tiver menos de 10 minutos de idade, senão é encerrada e avaliada com o que houver (mínimo de 4 falas; abaixo disso vira `abandonada` sem avaliação)
- [ ] `/simular/<código>/meus-resultados` lista as sessões daquele participante naquela simulação (data, nota, persona revelada **depois** da conversa, link para o feedback)
- [ ] A persona só é revelada ao vendedor na tela de feedback, nunca antes
- [ ] Lint e build passam; verificar no navegador

### Fase 5: avaliação e feedback

### US-018: Agente avaliador
**Description:** As a gestor, I want que cada conversa seja avaliada com o mesmo critério so that eu possa comparar vendedores sem depender do meu humor no dia.

**Acceptance Criteria:**
- [ ] `lib/avaliacao.ts` (server-only): `avaliarSessao(sessaoId)` recebe ficha do produto + metodologia e rubrica + persona e dificuldade + transcrição completa, e devolve `{ notaGeral, criterios: [{ id, nota, evidencia, comoMelhorar }], pontosFortes[], oportunidade: { criterio, oQueAconteceu, oQueFazer, fraseSugerida } }`
- [ ] A **nota geral nunca vem da IA**: é a média dos critérios arredondada a 1 casa, como já é regra em `lib/analise.ts` — e a média por grupo (Descoberta, Proposta de valor, Objeções, Fechamento) também é calculada no código
- [ ] Toda `evidencia` é um trecho **da própria conversa**; o prompt exige citação e o código descarta (nota mantida, evidência vazia com aviso) qualquer critério cuja evidência não apareça na transcrição
- [ ] A avaliação roda logo depois do encerramento, grava em `historico` (`tipo: "sessao"`) e preenche `sessoes.resultadoId`/`status: "avaliada"`; falha de IA deixa a sessão como `encerrada` e o gestor vê "Avaliação pendente" com "Tentar de novo"
- [ ] Reaproveita `salvarConversaAnalisada` onde já couber, sem duplicar a lógica de gravação no histórico
- [ ] `/r/<id>` e `/imprimir/<id>` aceitam o terceiro tipo (`"sessao"`, ao lado de `"conversa"` e `"painel"`), no mesmo molde já usado
- [ ] Teste com transcrição de exemplo em modo demonstração e com IA real (quando houver chave), conferindo que a nota geral bate com a média
- [ ] Lint e build passam

### US-019: Feedback que ensina
**Description:** As a vendedor, I want entender o que fazer diferente na próxima conversa so that o treino melhore minha venda, não só me dê uma nota.

**Acceptance Criteria:**
- [ ] Tela de feedback (pública, dentro da sala): nota grande com uma frase de leitura ("Muito bom desempenho"), quatro números por grupo, "O que você fez bem" (3 itens), "Principal oportunidade" (o que aconteceu + o que fazer) e "Experimente dizer" (a frase sugerida, com botão de copiar)
- [ ] A persona é revelada aqui, com uma linha explicando o perfil ("Carlos era um cliente apressado e cético")
- [ ] Ações: "Treinar novamente" (respeitando as tentativas) e "Ver minhas outras conversas"
- [ ] `mostrarFeedback: false` na simulação: o vendedor vê só "Conversa registrada. Seu gestor vai comentar com você." e nenhuma nota
- [ ] A conversa completa fica num `<details>` "Ver a conversa" com as falas em ordem
- [ ] Nenhuma ação de gestor aparece aqui (`acoesDoGestor` continua `false` na sala, como já é hoje)
- [ ] Lint e build passam; verificar no navegador (celular primeiro)

### US-020: E-mail do resultado para o vendedor
**Description:** As a vendedor, I want receber meu feedback por e-mail so that eu revise antes da próxima conversa com um cliente real.

**Acceptance Criteria:**
- [ ] Quando o participante tem e-mail e as notificações estão configuradas, o feedback é enviado logo após a avaliação, reaproveitando `lib/envio-analise.ts` e `lib/notificacoes.ts` (nenhum canal novo)
- [ ] O e-mail traz nota, os três pontos fortes, a principal oportunidade, a frase sugerida e o link do resultado; nunca traz a rubrica inteira
- [ ] Falha de envio não quebra a tela nem a avaliação: fica registrada e aparece para o gestor em Resultados como "Não conseguimos enviar por e-mail"
- [ ] O gestor pode desligar o envio em Configurações, em uma linha
- [ ] Lint e build passam

### US-021: Modelo de IA por tarefa (infraestrutura, nasce no `pdi-time`)
**Description:** As a mantenedor da suíte, I want usar um modelo rápido para conversar e um modelo mais capaz para avaliar so that a simulação fique fluida e a avaliação, confiável, sem pagar caro nas duas pontas.

**Acceptance Criteria:**
- [ ] `lib/ai.ts` (INFRA) ganha `model?: string` em `askText`/`askJSON` e `modelName(tarefa?: "padrao" | "avaliacao")`, lendo `OPENROUTER_MODEL_AVALIACAO` com queda para `OPENROUTER_MODEL` — mesmo desenho já existente para `visionModelName()`/`OPENROUTER_MODEL_VISAO`, sem inventar padrão novo
- [ ] A mudança nasce no `pdi-time` e é replicada byte a byte para os 17 apps do padrão (`scripts/verificar-padrao.sh` sai 0 antes e depois), como manda `PADRAO.md` para melhoria de infraestrutura
- [ ] `/setup` ganha, no cartão da IA, "Modelo para simulação" e "Modelo para avaliação", cada um com "Automático" (padrão) ou escolha manual; a lista vem do OpenRouter em tempo real (`GET /api/v1/models`, já usado pela suíte), agrupada em Gratuitos e Pagos, **nunca fixa no código**
- [ ] `lib/avaliacao.ts` chama a IA com a tarefa `avaliacao`; a simulação continua no modelo padrão
- [ ] Lint e build passam nos apps tocados

### Fase 6: resultados do gestor

### US-022: Painel da simulação — Visão geral
**Description:** As a gestor, I want abrir uma simulação e entender em dez segundos como o time está so that eu saiba se preciso agir.

**Acceptance Criteria:**
- [ ] `/resultados/[codigo]` com cabeçalho (nome, status, "N sessões · N vendedores · nota média") e três abas: **Visão geral | Equipe | Personas**
- [ ] Visão geral: quatro `Destaque` (Nota média, Participantes, Sessões, Evolução vs. período anterior), competências em barras horizontais (SVG próprio) e um bloco "Principal oportunidade do time" com uma frase acionável
- [ ] A frase da oportunidade é escrita pela IA a partir dos agregados (uma chamada, cacheada por 1 hora ou até chegar sessão nova), com um texto de reserva calculado no código quando a IA não estiver disponível
- [ ] Toda agregação é cálculo puro sobre as sessões avaliadas, no molde de `lib/painel-equipe.ts` (que continua servindo a análise de conversa real)
- [ ] Período comparado: janela atual contra a imediatamente anterior, não sobreposta — mesma regra já usada no app
- [ ] `/resultados` (sem código) lista as simulações com resultado, mais recentes primeiro
- [ ] Lint e build passam; verificar no navegador

### US-023: Aba Equipe
**Description:** As a gestor, I want ver vendedor por vendedor so that eu saiba com quem conversar esta semana.

**Acceptance Criteria:**
- [ ] Tabela (`DataTable`) com vendedor, nota, tendência (↑ → ↓, limiar de ±0,3 como já é usado), sessões e data da última
- [ ] Expandir a linha mostra: nota, quantas simulações fez, melhor desempenho (persona e nota), maior desafio (persona e nota) e link para a última conversa
- [ ] Ordenação por nota e por tendência; busca por nome
- [ ] Exportar para planilha (CSV) com uma linha por sessão — reaproveitando o padrão de exportação que a suíte já tem
- [ ] Lint e build passam; verificar no navegador

### US-024: Aba Personas — como o time vende para cada cliente
**Description:** As a gestor, I want ver em que tipo de cliente meu time trava so that o próximo treino ataque o problema certo.

**Acceptance Criteria:**
- [ ] Lista das personas usadas na simulação com emoji, nome, nota média e quantas sessões, ordenada da maior para a menor nota (o desenho do mockup: número grande, barra, sem gráfico complexo)
- [ ] Abaixo, um parágrafo escrito pela IA explicando a maior dificuldade do time com a persona de menor nota, citando o padrão observado — mesma regra de cache e de texto de reserva da US-022
- [ ] Persona com menos de 3 sessões aparece com "poucos dados" em vez de nota, para não induzir conclusão errada
- [ ] Lint e build passam; verificar no navegador

### US-025: Evolução ao longo do tempo
**Description:** As a gestor, I want ver a evolução de cada vendedor e de cada competência so that eu tenha motivo para manter o time treinando todo mês.

**Acceptance Criteria:**
- [ ] No detalhe do vendedor: uma linha por mês (SVG próprio) com a nota média e os pontos marcados, cobrindo até 12 meses
- [ ] Evolução por competência: a sequência de médias por mês nos quatro grupos, em texto compacto ("Objeções 6,1 → 6,7 → 7,2 → 8,0")
- [ ] A evolução atravessa simulações: é do participante no app inteiro, não só dentro de um link
- [ ] Menos de dois meses de dado: a área mostra "Ainda sem histórico suficiente" em vez de uma linha de um ponto só
- [ ] Lint e build passam; verificar no navegador

### US-026: Equipe (tela) e a conversa real
**Description:** As a gestor, I want ver todo mundo que já treinou e também avaliar uma conversa que aconteceu de verdade so that o app cubra o treino e o acompanhamento no mesmo lugar.

**Acceptance Criteria:**
- [ ] `/equipe` lista os participantes (nome, e-mail, sessões, nota média, última atividade), com "Cadastrar pessoa" (nome e e-mail) e "Convidar" (copia o link da simulação escolhida)
- [ ] "Analisar uma conversa real" (D11) leva ao fluxo que já existe hoje (colar/enviar `.txt`/`.vtt`/`.srt`), agora vinculando a análise a um participante da lista; a rota, o MCP e o formato do resultado não mudam
- [ ] O detalhe do participante junta sessões simuladas e conversas reais numa linha do tempo única
- [ ] Apagar um participante pede confirmação e explica o que acontece com as sessões dele (ficam, anônimas)
- [ ] Lint e build passam; verificar no navegador

### Fase 7: Home, voz por persona e fechamento

### US-027: Home
**Description:** As a gestor, I want abrir o app e saber o que está acontecendo e o que fazer a seguir so that eu não precise procurar nada.

**Acceptance Criteria:**
- [ ] Hero no formato do mockup: sobretítulo, título "Treine seu time para qualquer cenário de venda" (7 palavras), apoio de até 20 palavras, "+ Criar simulação" como ação primária e "Ver como funciona" como secundária (abre o `<details>` dos seis passos, sem vídeo)
- [ ] Quatro indicadores com variação vs. mês anterior: Simulações realizadas, Nota média do time, Vendedores treinados, Sessões realizadas
- [ ] "Simulações ativas": até três cartões grandes (produto, nome, chips de metodologia e dificuldade, participantes, sessões, nota média, "Ver resultados") e "Ver todas"
- [ ] Coluna da direita: "Comece em 3 passos" (cadastre o produto → crie a simulação → compartilhe o link), com o passo concluído marcado de verdade a partir do estado do banco, e "Dica da semana" (texto fixo rotativo, sem IA)
- [ ] Instalação nova, sem nada cadastrado: o hero fica, os indicadores somem e "Comece em 3 passos" ocupa o lugar dos cartões
- [ ] A ilustração do hero segue a fundação visual do segmento (`IlustracaoSegmento`), não uma foto de banco de imagens
- [ ] Lint e build passam; verificar no navegador (desktop e celular)

### US-028: Voz por persona e Configurações › Voz
**Description:** As a gestor, I want que cada tipo de cliente soe diferente so that o treino pareça com pessoas diferentes, não com o mesmo robô.

**Acceptance Criteria:**
- [ ] `lib/vozes.ts`: mapa persona → características de voz (velocidade, estabilidade, tom) e, quando a ElevenLabs está conectada, uma voz por persona escolhida da lista real da conta (`GET /v1/voices`, conferido na documentação), com queda para uma voz padrão
- [ ] Sem ElevenLabs: o mesmo mapa ajusta `rate`/`pitch` de `speechSynthesis`, para apressado soar mais rápido e cético mais sério
- [ ] Cartão "Voz" em `/setup`: estado da conexão, "Voz automática por persona" (ligado por padrão) e um botão "Ouvir uma amostra" por persona
- [ ] O cartão deixa claro em uma linha que **sem conectar nada a simulação já é por voz**, e que a ElevenLabs melhora a naturalidade — o benefício, não a tecnologia
- [ ] Lint e build passam; verificar no navegador

### US-029: MCP, rotina, artefato e formulário no modelo novo
**Description:** As a gestor, I want que o app continue funcionando dentro do meu assistente e me avisando sozinho so that ele opere sem eu abrir a tela todo dia.

**Acceptance Criteria:**
- [ ] `/mcp` ganha, além de `analisar_conversa` (inalterada), `criar_simulacao` (produto + metodologia + dificuldade → link) e `resultados_da_simulacao` (código → agregados), no mesmo `lib/mcp.ts` escrito à mão
- [ ] A rotina `resumo-simulador-vendas` passa a resumir **sessões** desde a última execução (quem treinou, nota média, maior dificuldade do time) e continua salvando um painel no histórico para a notificação apontar
- [ ] Artefato: o feedback e o painel da simulação continuam imprimíveis (`/imprimir/<id>`) e compartilháveis por link (`/r/<id>`)
- [ ] Formulário público (`/f/<token>`, infraestrutura hoje sem uso): registra o tipo "Convite para treinar", que coleta nome e e-mail e devolve o link da simulação — é o caminho para quem quer divulgar o treino sem mandar o link direto
- [ ] Lint e build passam

### US-030: Modo demonstração completo e primeira impressão
**Description:** As a executivo avaliando o app, I want ver o app cheio e conseguir fazer uma simulação de ponta a ponta sem configurar nada so that eu entenda o valor antes de decidir conectar a IA.

**Acceptance Criteria:**
- [ ] `lib/demo.ts` passa a semear (uma vez, só quando o banco está vazio e sem IA conectada): 1 produto de exemplo com ficha pronta, 2 simulações de exemplo (uma SPIN realista, uma consultiva difícil), 3 participantes e 6 sessões avaliadas com notas entre 6,4 e 9,1, distribuídas em 5 personas e espalhadas em 4 meses (para a evolução ter forma)
- [ ] Tudo de exemplo tem o chip "Exemplo" onde aparece; o conjunto some quando o primeiro dado real do mesmo tipo é criado (produto real apaga produto de exemplo; sessão real apaga sessões de exemplo)
- [ ] O link de exemplo abre e permite uma conversa por voz inteira com o roteiro fixo, terminando num feedback de exemplo
- [ ] Um `Aviso` de uma frase, com link para `/setup`, aparece em cada tela que mostra dado de exemplo
- [ ] Lint e build passam; verificar no navegador

### US-031: Fechamento — textos, verificações e documentação
**Description:** As a mantenedor, I want o app conferido e documentado so that a próxima pessoa (ou a próxima sessão) saiba o que foi decidido e por quê.

**Acceptance Criteria:**
- [ ] `scripts/verificar-jargao.mjs` sai 0: nenhuma tela usa "persona" sem apoio, "token", "webhook", "API", "prompt", "LLM" ou "rubrica" em texto visível — o vendedor lê "tipo de cliente", "link", "critérios de avaliação"
- [ ] `scripts/verificar-paleta.mjs` e `scripts/verificar-padrao.sh` saem 0 (o segundo já conferindo só `INFRA` para este app)
- [ ] Contagem de texto registrada: título do hero ≤ 8 palavras, apoio ≤ 20, uma linha de ajuda por campo; posição do botão primário medida em 1400x900
- [ ] Capturas de desktop e celular das seis telas mais a sala do vendedor, conferidas e corrigidas
- [ ] `README.md` reescrito em torno de Produto → Simulação → Sessão, com a seção de voz explicando os três níveis em linguagem de negócio; `CLAUDE.md` registra as decisões D1–D13 e os gotchas encontrados
- [ ] `catalogo.json`: `problema`, `ia` e `integracoes` atualizados (a IA agora simula o cliente e avalia; a ElevenLabs vira "melhora a voz", não "habilita a voz")
- [ ] Lint e build passam

## Non-Goals (fora deste MVP)

- CRM, ranking, gamificação, medalhas e placar do time.
- Criação livre de agentes, marketplace de personas, persona escrita pelo gestor.
- Cursos, trilhas, certificados.
- WhatsApp, calendário, agendamento de treino.
- Gestão de usuários com senha para vendedor, papéis, SSO corporativo (o vendedor se identifica, não cria conta).
- Dezenas de metodologias (BANT, Challenger, MEDDIC) — três bastam para provar a hipótese.
- Dashboards configuráveis, filtros cruzados, construtor de relatório.
- Busca vetorial / RAG sobre o material do produto (D12).
- Vídeo, avatar falante, análise de expressão facial.
- Gravar e guardar o áudio da conversa: só a transcrição é guardada (menos risco, menos custo, menos privacidade em jogo).

## Design Considerations

- **Cabeçalho, não sidebar** (D9): o mockup usa barra lateral; a suíte inteira usa `Topbar`, e a fundação visual de 15/09 foi desenhada assim. O ganho de coerência entre os 17 apps vale mais que a semelhança com o mockup.
- **O que é seguido do mockup:** cartões grandes com muito espaço em branco, quatro indicadores com variação, chips de metodologia e dificuldade, "Comece em 3 passos" com o passo concluído marcado, nota grande como elemento visual dominante nos resultados, listas em vez de gráficos.
- **O que fica de fora do mockup:** foto de banco de imagens no hero (a suíte usa a ilustração do segmento), a citação motivacional do rodapé, o bloco "Potencialize seu time com IA" (propaganda dentro do próprio produto) e os selos flutuantes ao redor da foto.
- **A sala do vendedor é outra coisa:** sem cabeçalho do app, sem menu, sem link para configuração. Uma tela, um cliente, um botão. Desenhada para o celular primeiro, com a última fala do cliente em texto grande (quem está treinando em um lugar barulhento precisa ler o que ouviu).
- **A persona é invisível para quem treina.** Emoji e nome de persona só aparecem para o gestor e, para o vendedor, depois do feedback.
- **Uma nota, quatro números.** O vendedor nunca vê nove critérios; o gestor vê os nove quando quiser.
- **Linguagem:** "tipo de cliente" no lugar de persona quando falar com o vendedor, "treino" no lugar de simulação quando o contexto for do vendedor, "link" no lugar de token, "material" no lugar de documento processado. Nada de "Render", "container", "webhook" ou "modelo de linguagem" em tela.

## Technical Considerations

- **Voz sem chave (o ponto novo).** O nível 2 usa `SpeechRecognition` para ouvir e `speechSynthesis` para falar; os dois são do navegador, não custam nada e não mandam áudio para o servidor do app. A transcrição (texto) é o que trafega. Exige HTTPS — o app publicado já é HTTPS; em `localhost` o navegador também libera. Firefox não tem reconhecimento de fala: cai para texto (P5).
- **Latência.** O objetivo é o cliente responder em menos de 3 s no nível 2. Para isso: falas curtas (1 a 3 frases, limite no prompt e `maxTokens` baixo), a síntese começa assim que o texto chega inteiro (sem streaming no MVP), e o modelo de simulação é um modelo rápido (US-021).
- **Transcrição no servidor.** Hoje a sala manda a conversa inteira a cada turno; com sessões isso vira desperdício e risco. A partir da US-015 o servidor guarda a transcrição e o navegador manda só a última fala.
- **Nada de áudio em disco.** O áudio da ElevenLabs é gerado e devolvido em memória; nenhum arquivo é guardado. O app não tem storage e não vai ganhar um neste MVP.
- **Custo por sessão.** Uma sessão de 10 minutos no nível 2 são ~20 turnos de ~300 tokens de saída, mais uma avaliação de ~1.500 tokens. No nível 1 entra o custo de voz da ElevenLabs por minuto, que é da conta do cliente. A escolha de modelo por tarefa (US-021) é o que mantém isso barato.
- **Concorrência.** Trinta vendedores no mesmo link significam trinta sessões simultâneas: nenhuma escrita depende de leitura anterior fora de uma transação, a atribuição de persona conta as sessões dentro da mesma chamada, e `node:sqlite` em WAL aguenta a carga esperada (dezenas, não milhares).
- **Privacidade.** Nome e e-mail de vendedor são dado pessoal: o cookie de sessão do vendedor não guarda e-mail, o `id_token` do Google/Microsoft é descartado após a leitura, e a tela de identificação diz em uma linha o que é guardado e para quê (`Privacidade`, componente que já existe).
- **Migração.** Nenhum `DROP TABLE`. Salas viram simulações preservando o código; vendedores viram participantes; resultados antigos continuam abrindo. Testado com uma cópia do `app.sqlite` de uma instalação antiga.
- **Infraestrutura intocada.** `lib/store.ts`, `lib/conta.ts`, `lib/historico.ts`, `lib/mcp*.ts`, `lib/rotinas.ts`, `proxy.ts` e `app/api/{setup,status,conta,rotinas,historico}` continuam byte a byte iguais aos do `pdi-time`. A única mudança de infraestrutura deste PRD é a US-021, e ela nasce no `pdi-time`.

## Success Metrics

- Do "Novo produto" ao link copiado: **menos de 10 minutos**, medido com uma pessoa não técnica cronometrada, sem ajuda.
- Do link aberto à primeira fala do cliente: **menos de 30 segundos**, no celular, incluindo a permissão de microfone.
- **Mais de 80%** das sessões terminam por decisão do vendedor (não por abandono ou falha), medido sobre as sessões de uma turma real.
- Resposta do cliente simulado em **menos de 3 segundos** em 9 de cada 10 turnos no nível 2.
- **100%** dos critérios avaliados com evidência citada da própria conversa (a checagem da US-018 é automática).
- Distribuição de personas em uma simulação de 50 sessões: **nenhuma persona acima de 30%**.
- Um gestor consegue dizer, olhando a aba Personas, qual perfil de cliente derruba o time — verificado perguntando, não inferido.

## Open Questions

1. **PDF, DOCX e PPTX no material do produto (US-005).** Só dá para ler esses formatos com dependência nova (`pdf-parse` e `mammoth` são as candidatas; PPTX exigiria uma terceira). Aceitamos as duas dependências, ficamos só com texto/legenda + colar, ou pedimos que o gestor exporte para texto? A mesma pergunta está aberta no `whatsapp-atendente`, então a resposta deveria valer para a suíte inteira.
2. **Firefox.** Aceitamos que quem abrir o link no Firefox treine por texto (com o convite a abrir no Chrome), ou vale implementar gravação por `MediaRecorder` + transcrição no servidor (custa chave de transcrição e latência maior) para a voz funcionar em todo navegador?
3. **ElevenLabs sem OAuth.** Não existe OAuth para chave de conta da ElevenLabs (`tasks/oauth-integracoes.md`). Vale avaliar uma conta da StartSe com agente compartilhado (o cliente não configura nada e a voz boa vem ligada de fábrica), com o custo de voz por nossa conta? Isso mudaria o nível 1 de "opcional" para "padrão".
4. **Tempo de conversa.** 10 minutos é o padrão do mockup. Vendedor experiente pode achar curto e iniciante pode achar longo — deixamos os três valores (5/10/15) ou medimos uma turma antes de fixar?
5. **Persona composta na tela.** A arquitetura já guarda comportamento principal + secundário (D2). Quando expor isso ao gestor: nunca, "em Opções avançadas" na criação, ou só na aba Personas dos resultados?
6. **Convite por e-mail.** O gestor manda o link no grupo do WhatsApp ou queremos que o app dispare o convite por e-mail para a lista de Equipe (já temos o canal de notificações pronto)? Isso adicionaria uma história pequena à Fase 6.
7. **Quem vê o feedback.** Hoje o gestor vê tudo. Faz sentido uma simulação "treino livre", em que só o vendedor vê o resultado e o gestor vê apenas os agregados? Muda a adesão do time.

## Mapa dos requisitos funcionais

| RF | Requisito | História |
|---|---|---|
| RF01 | Cadastrar produto | US-003 |
| RF02 | Importar landing page por URL | US-004 |
| RF03 | Adicionar documentos ao produto | US-005 (+ Q1) |
| RF04 | Gerar conhecimento estruturado do produto | US-006 |
| RF05 | Criar simulação vinculada ao produto | US-009 |
| RF06 | Selecionar metodologia | US-010 |
| RF07 | Configurar dificuldade | US-007, US-009 |
| RF08 | Selecionar personas | US-007, US-009 |
| RF09 | Personas aleatórias equilibradas | US-008 |
| RF10 | Gerar link público único | US-011 |
| RF11 | Identificar vendedor (OAuth ou nome/e-mail) | US-013 |
| RF12 | Executar conversa com o agente | US-015, US-016 |
| RF13 | Conversa por texto | US-015 |
| RF14 | Conversa por voz | US-015 (navegador), US-016 (ElevenLabs), US-028 (voz por persona) |
| RF15 | Avaliar conversa com IA | US-018 |
| RF16 | Feedback com evidências | US-018, US-019 |
| RF17 | Mostrar resultado ao vendedor | US-019, US-020 |
| RF18 | Painel da simulação | US-022 |
| RF19 | Resultado por vendedor | US-023 |
| RF20 | Resultado por persona | US-024 |
| RF21 | Histórico e evolução | US-025 |
| RF22 | Configurar OpenRouter | já existe (OAuth), ampliado em US-021 |
| RF23 | Escolher modelos gratuitos/pagos | US-021 |
| RF24 | Configurar ElevenLabs | já existe, revisto em US-028 |
