# PRD: Entrevistadora IA — Vagas → Candidatos → Entrevistas, conversa por voz no navegador, pesquisa do candidato (Bright Data) e análise para o gestor

Data: 18/09/2026. Escopo: só `entrevista-ia/` (mais a entrada dele em `catalogo.json`). Continua `tasks/prd-revisao-onboarding-erros-conta.md` (US-036/US-039/US-058/US-059, que deixaram este app com conta, sala de entrevista, link público por candidato, scorecard e ranking). Segue o modelo de app independente inaugurado por `tasks/prd-whatsapp-atendente-telas.md` e o desenho de entidades, voz em três níveis e Início do `tasks/prd-simulador-vendas-produto-simulacao-sessoes.md` (ambos de 17/09/2026).

## Introduction

Hoje a Entrevistadora IA é uma tela: à esquerda o formulário da vaga (título, requisitos, nome do candidato, tom e número de perguntas), à direita a sala de entrevista e, ao final, um scorecard. Existe um link público por candidato (`/entrevista/<código>`), gerado num diálogo que pede a vaga inteira de novo, e um ranking por vaga que agrupa scorecards pelo título digitado. Para demonstrar a ideia em dois minutos, funciona. Para quem vai **recrutar** com o app (a pessoa de RH, o gestor da área que abriu a vaga), faltam quatro coisas:

1. **Vaga e candidato como coisas de verdade.** Não existem as entidades: a vaga é um texto e o candidato é um campo dentro dela. Salário, desafios dos primeiros meses, cultura esperada, currículo, perfil público, quem já foi convidado e quem já respondeu não têm onde morar. Dez candidatos para a mesma vaga são dez preenchimentos do mesmo diálogo.
2. **Saber mais sobre quem vai entrevistar.** A IA entrevista às cegas: só conhece o nome. Um recrutador lê o currículo e procura a pessoa na web antes da conversa. O app precisa fazer isso por ele — a partir do nome completo e, quando existir, do currículo — e mostrar o que achou com a origem de cada informação, para o gestor confirmar ou corrigir.
3. **Uma conversa, não um formulário falado.** A sala de hoje fala a pergunta e espera o candidato digitar (ou ditar apertando um botão). Quem abre o link no celular espera uma conversa: falar e ser respondido. O `simulador-vendas` já resolveu isso em três níveis (agente conversacional da ElevenLabs quando conectado, voz do navegador com fala pela ElevenLabs quando só a chave existe, texto) e o mesmo desenho cabe aqui.
4. **Um parecer que ajude a decidir, e números do processo.** O scorecard avalia só requisitos técnicos ditos na conversa. Não há dimensão de cultura, não há cruzamento com o currículo nem com o que existe publicamente, não há "o que perguntar na próxima etapa". E não há relatório: quantos convites viraram entrevista, quanto tempo leva, como a nota se distribui.

Este PRD reorganiza o app em torno de **três entidades: Vaga → Candidato → Entrevista**. O gestor cadastra a cultura da empresa uma vez, abre vagas com cargo, salário, desafios e competências culturais, cadastra candidatos (a IA lê o currículo, pesquisa na web e preenche a ficha, com o currículo sempre acima da web), atribui cada candidato a uma vaga e envia o link. O candidato conversa por voz no navegador. A entrevistadora cobre requisitos, desafios, cultura e os pontos a esclarecer do currículo e da pesquisa. O gestor recebe um parecer técnico e cultural, com sinais de consistência entre o que foi dito, o currículo e o perfil público, e decide.

O app passa a ter seis lugares: **Início | Vagas | Candidatos | Entrevistas | Relatórios | Configurações**.

### Decisões tomadas em 18/09/2026

- **D1. App independente com seis destinos.** `"independente": true` em `catalogo.json`, como `whatsapp-atendente` e `simulador-vendas`: seis telas não cabem no molde de tela única do `pdi-time`. Navegação no `Topbar` compartilhado (sem barra lateral). A camada `INFRA` continua idêntica e conferida por `scripts/verificar-padrao.sh`.
- **D2. Três entidades, inclusive no banco.** `Vaga` (o que está aberto e o que se espera), `Candidato` (a pessoa e a ficha dela, reutilizável entre vagas) e `Entrevista` (um candidato numa vaga: o convite, o link, a conversa e o resultado). O link pertence à **entrevista**, nunca ao candidato nem à vaga. O parecer é filho da entrevista. A ficha pesquisada é filha do candidato. Nada disso é opcional para o MVP.
- **D3. A entrevista abre por voz, em qualquer navegador.** Três níveis, escolhidos pelo servidor na abertura da sala, nesta ordem: (1) agente conversacional da ElevenLabs, quando conectado; (2) **voz do navegador** — o navegador escuta (Web Speech API), a IA do OpenRouter conduz como entrevistadora e a fala sai pela ElevenLabs (quando só a chave existe) ou pela voz do próprio navegador; (3) texto. Texto nunca some: é a alternativa explícita ("Prefiro digitar") e o caminho de quem está num navegador sem suporte. O mesmo desenho, os mesmos limites e as mesmas lições da US-015/US-016 do `simulador-vendas`.
- **D4. Pesquisa do candidato pelo servidor MCP da Bright Data.** Um único token, conectado em Configurações, e as ferramentas do servidor remoto da Bright Data chamadas por `lib/mcp-cliente.ts` (que já existe): busca em mecanismo de pesquisa, perfil do LinkedIn por endereço, página como Markdown e busca em conjunto de dados. A integração REST do `prospeccao-ia` (zona Web Unlocker) **não** é replicada aqui. Os nomes exatos das ferramentas são confirmados por `tools/list` na hora de implementar, nunca assumidos a partir deste PRD.
- **D5. O currículo vence a web.** Cada campo da ficha do candidato carrega a origem (`cv`, `web`, `gestor`). Quando currículo e web discordam, fica o valor do currículo e a divergência é listada para o gestor ver. A web só preenche o que o currículo não tem. Sem currículo, a pesquisa parte do nome completo mais o termo de busca que o gestor informar (empresa, cidade, cargo). O gestor edita qualquer campo antes ou depois de salvar; o que ele digita vira `gestor` e não é sobrescrito por nova pesquisa.
- **D6. Homônimos são decisão do gestor, não da IA.** Quando a busca devolve mais de uma pessoa plausível, a ficha fica com `identidade_confirmada = 0`, mostra até três possibilidades (o que bate e o que não bate com o currículo e com o termo de busca) e a entrevista **não usa** o perfil web até o gestor escolher uma ou descartar todas. Sem currículo e sem termo de busca, a pesquisa não roda sozinha: a tela pede ao menos um dos dois.
- **D7. Cultura em dois níveis.** A cultura da empresa (valores, comportamentos esperados, o que não combina) é cadastrada uma vez em Configurações e vale para todas as vagas. Cada vaga escolhe quais competências culturais avaliar (entre as da empresa) e pode acrescentar as suas. A entrevistadora faz perguntas situacionais sobre elas; o parecer traz uma seção cultural separada da técnica.
- **D8. Relatórios respondem "o processo está funcionando?".** Filtro por vaga e período; funil (convidados → abriram → concluíram → avaliadas → avançar), tempo médio do convite à conclusão, taxa de conclusão dos links, nota média e distribuição de recomendações, com exportação em planilha e impressão. Evolução por período e comparação entre vagas ficam para depois.
- **D9. O parecer é da IA, a decisão é do gestor.** A recomendação da IA (avançar, avaliar com o gestor, não avançar) continua existindo. Ao lado dela entra a **decisão** registrada pelo gestor (avançar, aguardar, reprovar), que é o que conta no funil e no Início. Nada avança sozinho.
- **D10. Os endereços públicos não mudam.** A sala continua em `/entrevista/<código>` e as rotas públicas dela sob `/api/entrevista/candidato/<código>/*`, porque `proxy.ts` é infraestrutura comparada byte a byte e essas duas regras já existem nos 17 apps. Links gerados antes deste PRD continuam abrindo até expirar.
- **D11. "Iniciar entrevista" pelo gestor sai do caminho principal.** A sala em que o gestor digita as respostas do candidato confunde o propósito do app. Vira "Testar a entrevista" dentro da vaga: uma prévia do roteiro, sem gravar nada e sem gerar parecer. A ligação telefônica automática (ElevenLabs + Twilio) continua como está, como ação dentro de uma entrevista.
- **D12. Dado pessoal com cuidado.** Pesquisar uma pessoa identificada na web e guardar o resultado é tratamento de dado pessoal (LGPD). O convite e a tela de boas-vindas dizem ao candidato que a conversa é gravada e analisada por IA e que a empresa pode consultar informações públicas sobre ele; a ficha guarda só o que o gestor confirmou; "Apagar candidato" apaga ficha, fontes, currículo, entrevistas e pareceres de uma vez; nenhum dado de candidato sai do app para outro serviço além da IA (OpenRouter), da voz (ElevenLabs) e da pesquisa (Bright Data), e só o necessário para cada um.
- **D13. Sem análise de vídeo, emoção ou voz como critério.** A avaliação usa só o conteúdo do que foi dito. Nada de expressão facial, tom de voz, sotaque ou tempo de resposta como nota — fora do MVP e fora do produto.

### Premissas

- P1. `PADRAO.md` continua valendo no que não é camada de produto: Next.js 16, Tailwind 4, React 19, `node:sqlite`, IA via OpenRouter com modelo por tarefa, português sem jargão na tela (`scripts/verificar-jargao.mjs`), acento do segmento RH (`#6e3597`, `scripts/verificar-paleta.mjs`), nenhuma dependência nova além de `unpdf` (já usada em três apps) e da que Open Questions nomeia para DOCX.
- P2. Tudo funciona em **modo demonstração**, sem nenhuma chave: cultura de exemplo, uma vaga de exemplo ("Analista de Customer Success", a mesma do `EXEMPLO` atual), três candidatos de exemplo com fichas prontas (currículo e web de mentira, com origens marcadas), três entrevistas concluídas com pareceres plausíveis (notas entre 6,2 e 8,9, uma de cada recomendação), uma entrevista convidada e a sala abrindo por voz do navegador com um roteiro fixo. Todo dado de exemplo leva o chip "Exemplo" e some quando o primeiro dado real do mesmo tipo aparece.
- P3. Uma conta de administrador por instância (modelo da suíte). Não há "recrutador A" e "gestor B": quem entra é "você". O candidato nunca cria conta.
- P4. Gráficos são SVG desenhado à mão no próprio componente (funil em barras horizontais, distribuição em barras), sem biblioteca — o mesmo caminho de `whatsapp-atendente/components/GraficoLinhas.tsx` e `simulador-vendas/components/GraficoCriteriosFracos.tsx`.
- P5. A Web Speech API (`SpeechRecognition`) exige HTTPS e existe em Chrome, Edge e Safari; **não existe no Firefox**. Onde não existir, a sala cai para texto com uma frase explicando e o convite a abrir no Chrome — nunca uma tela quebrada.
- P6. Nenhum endpoint da ElevenLabs nem nenhuma ferramenta da Bright Data é assumido a partir deste PRD: os caminhos de texto-para-voz, do agente conversacional e do aviso de pós-conversa são conferidos na documentação oficial na hora de implementar (como em US-015/US-016 do `simulador-vendas`); os nomes e os parâmetros das ferramentas da Bright Data são lidos de `tools/list` do próprio servidor, e o `CLAUDE.md` registra a data da conferência.
- P7. Textos seguem os limites de "Menos texto na tela" do `PADRAO.md`: título de painel até 8 palavras, apoio até 20, uma linha de ajuda por campo. Nenhuma tela usa as palavras token, MCP, scraping, dataset, prompt ou webhook fora de "Opções avançadas"/"Para a equipe técnica" — na tela é "código do link", "pesquisa na web", "perfil público", "aviso automático".
- P8. Toda verificação de tela é feita em desktop (1400x1000) e celular (390 de largura). A sala do candidato é verificada primeiro no celular: é onde ela vai ser usada.
- P9. A pesquisa na web tem orçamento: no máximo 6 chamadas à Bright Data por candidato por rodada, 60 segundos no total, e cada página trazida é cortada em 20 mil caracteres antes de ir para a IA. Falha de pesquisa nunca impede cadastrar o candidato nem entrevistá-lo: a ficha fica só com o currículo e a tela diz que a pesquisa não deu certo e oferece "Pesquisar de novo".

## Goals

- Uma pessoa de RH cadastra a cultura da empresa, abre uma vaga e convida o primeiro candidato em **menos de 10 minutos**, sem nenhuma configuração técnica.
- Cadastrar um candidato com currículo leva um envio de arquivo: a ficha aparece preenchida, com a origem de cada campo, e a pesquisa na web chega em até um minuto sem travar a tela.
- O candidato abre o link no celular e **está conversando por voz em menos de 30 segundos**, em qualquer instalação do app, inclusive sem nenhuma chave de voz.
- A entrevista cobre requisitos, desafios da vaga, cultura da empresa e os pontos a esclarecer do currículo e do perfil público — não só "me conta sobre X".
- O gestor abre um parecer e responde, sem ler a transcrição, "este candidato atende à vaga?", "combina com a nossa cultura?" e "o que ele disse bate com o currículo?".
- Relatórios respondem "quantos convites viram entrevista e quanto tempo isso leva?" por vaga e por período, e exportam para planilha.

## User Stories

As histórias estão em ordem de implementação. Cada uma cabe em uma sessão de trabalho e termina com lint, build e (quando tem tela) verificação no navegador em desktop 1400x1000 e celular 390, abrindo as capturas e corrigindo o que estiver quebrado.

### Fase 0: fundação (independência, navegação e modelo de dados)

### US-001: O app vira independente e ganha os seis destinos
**Description:** As a pessoa de RH, I want ver no cabeçalho os seis lugares do app so that eu saiba onde abrir vaga, cadastrar candidato e ver resultado, mesmo antes das telas ficarem prontas.

**Acceptance Criteria:**
- [ ] `catalogo.json`: a entrada de `entrevista-ia` ganha `"independente": true`; `scripts/verificar-padrao.sh` passa a conferir só `INFRA` e `ESTRUTURA` para este app (o modelo já existe, nenhuma mudança no script)
- [ ] `entrevista-ia/CLAUDE.md` registra a data (18/09/2026) e o commit a partir do qual `components/ui.tsx`, `components/setup.tsx`, `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts` e `app/globals.css` passam a ser próprios do app
- [ ] `lib/navegacao.ts` (agora próprio) exporta Início `/`, Vagas `/vagas`, Candidatos `/candidatos`, Entrevistas `/entrevistas`, Relatórios `/relatorios`, Configurações `/setup`; "Histórico" sai do cabeçalho e passa a ser linkado só de Relatórios ("Relatórios anteriores")
- [ ] `app/vagas/page.tsx`, `app/candidatos/page.tsx`, `app/entrevistas/page.tsx`, `app/relatorios/page.tsx` existem, são client components, usam o mesmo `Topbar` e mostram um `Empty` com a ação que leva ao que já funciona enquanto a história de cada uma não chega — nenhuma rota devolve 404
- [ ] `proxy.ts` não muda: as quatro páginas nascem privadas; `/entrevista/*` e `/api/entrevista/candidato/*` continuam públicas (D10)
- [ ] O item ativo do cabeçalho reflete a rota atual nas seis páginas; lint e build passam; verificar no navegador (cabeçalho nas seis rotas, desktop e celular com o menu recolhido)

### US-002: Vaga, Candidato e Entrevista no banco
**Description:** As a app, I want guardar vaga, candidato, entrevista e a conversa em tabelas próprias so that dez candidatos na mesma vaga gerem dez históricos independentes e nada dependa do título digitado.

**Acceptance Criteria:**
- [ ] `lib/vagas.ts`: tabela `vagas` (`id`, `cargo`, `area`, `senioridade` `estagio|junior|pleno|senior|lideranca`, `modelo` `presencial|hibrido|remoto`, `local`, `salarioMin`, `salarioMax` (inteiros em reais, nulos quando "a combinar"), `salarioACombinar` 0/1, `desafios` texto, `requisitos` texto (um por linha), `competenciasCulturais` JSON (lista de `{ id, nome, descricao, origem: "empresa"|"vaga" }`), `tom` `acolhedor|objetivo`, `numeroPerguntas` 6 a 12 (padrão 8), `duracaoMin` 10 a 30 (padrão 15), `perguntaPretensao` 0/1, `status` `aberta|encerrada`, `exemplo` 0/1, `criadoEm`, `atualizadoEm`), com `criar`/`listar({status?})`/`obter`/`atualizar`/`mudarStatus`/`apagar`
- [ ] `lib/candidatos.ts`: tabela `candidatos` (`id`, `nome`, `email`, `telefone`, `cidade`, `linkedinUrl`, `termoBusca`, `ficha` JSON — ver US-009 —, `cvNome`, `cvTipo`, `cvTexto`, `cvArquivo` BLOB (até 5 MB), `pesquisaStatus` `nao_pedida|pendente|em_andamento|concluida|sem_resultado|falhou`, `pesquisaEm`, `identidadeConfirmada` 0/1, `exemplo` 0/1, `criadoEm`, `atualizadoEm`) e `fontes_candidato` (`id`, `candidatoId`, `tipo` `cv|linkedin|busca|pagina`, `url`, `titulo`, `resumo`, `conteudo` (texto normalizado, cortado em 20 mil caracteres), `coletadoEm`), com `criar`/`listar({busca?})`/`obter`/`atualizar`/`apagar` (apaga fontes, entrevistas e mensagens do candidato na mesma transação) e `adicionarFonte`/`listarFontes`
- [ ] `lib/entrevistas.ts`: tabela `entrevistas` (`id`, `vagaId`, `candidatoId`, `codigo` — o token do link em `lib/formularios.ts` —, `status` `convidada|aberta|em_andamento|concluida|avaliada|expirada|cancelada`, `nivelVoz` `agente|navegador|texto` (nulo até a sala abrir), `convidadaEm`, `abertaEm`, `iniciadaEm`, `concluidaEm`, `expiraEm`, `resultadoId` (id do parecer em `lib/historico.ts`), `decisao` `avancar|aguardar|reprovar` (nula até o gestor decidir), `decisaoEm`, `exemplo` 0/1, `criadoEm`) e `mensagens_entrevista` (`id`, `entrevistaId`, `papel` `entrevistadora|candidato`, `texto`, `segundo`, `criadoEm`), com `criar`, `obter`, `obterPorCodigo`, `listar({vagaId?, candidatoId?, status?, periodo?})`, `mudarStatus`, `registrarMensagem`, `transcricao(entrevistaId)`, `registrarResultado`, `decidir`, `cancelar`, `expirarVencidas()` (chamada na leitura, não por tarefa agendada)
- [ ] Uma entrevista é única por par (`vagaId`, `candidatoId`) enquanto não estiver `cancelada` ou `expirada`; tentar criar outra devolve a existente
- [ ] Migração dos dados antigos, uma vez na subida: cada scorecard salvo em `lib/historico.ts` (tipos `entrevista` e `scorecard`) vira uma `Vaga` (agrupada pelo título normalizado, `requisitos` copiados, demais campos vazios, `status: "encerrada"`), um `Candidato` (pelo nome) e uma `Entrevista` `avaliada` com `resultadoId` apontando para o registro antigo; nada em `historico` é apagado nem alterado (o padrão da suíte é nunca apagar dado de banco existente); `/r/[id]` continua abrindo os três tipos antigos
- [ ] Testes com `curl` num servidor standalone e `DATA_DIR` em `/tmp`: criar vaga, dois candidatos e duas entrevistas; reiniciar o servidor; conferir que tudo continua lá; conferir que a segunda criação do mesmo par devolve a mesma entrevista; apagar o candidato e conferir que as entrevistas dele sumiram
- [ ] Lint e build passam

### US-003: Cultura da empresa em Configurações
**Description:** As a pessoa de RH, I want cadastrar uma vez o que a empresa valoriza so that toda entrevista avalie cultura com os mesmos critérios, sem eu digitar de novo a cada vaga.

**Acceptance Criteria:**
- [ ] `lib/cultura.ts`: tipo `Cultura = { valores: { id, nome, descricao }[] (até 6), comportamentos: string (o que se espera no dia a dia), naoCombina: string (o que não funciona aqui), atualizadoEm }`, guardado em `lib/store.ts` sob a chave `CULTURA_EMPRESA` (JSON) com `obterCultura()`/`salvarCultura()`; `culturaDemo()` em `lib/demo.ts` (quatro valores plausíveis de uma empresa de serviços B2B) usada quando nada foi salvo ainda, marcada como exemplo
- [ ] Cartão próprio "Cultura da empresa" (`components/CulturaEmpresa.tsx`) registrado em `app/setup/page.tsx` abaixo do `<SetupPage />`, antes de `AcessoMCP`: lista de valores (nome curto + uma frase), dois campos de texto, botão "Salvar"; uma linha de apoio dizendo que a entrevistadora usa isso para perguntar e avaliar cultura
- [ ] Rotas `GET/PUT /api/cultura` (privadas), com validação (nome de valor até 40 caracteres, descrição até 200, textos até 1.000) e 400 com mensagem clara
- [ ] "Gerar a partir de um texto": o gestor cola a página "Sobre nós"/código de cultura e a IA propõe os valores e os dois textos (`askJSON`, modelo padrão); em modo demonstração devolve `culturaDemo()`; o gestor revisa antes de salvar
- [ ] Sem cultura salva, `Início` mostra o passo "Cadastre a cultura da empresa" em "Comece em 3 passos" (US-022) e a vaga nova avisa que está usando a cultura de exemplo
- [ ] Lint e build passam; verificar no navegador

### US-004: Dados de exemplo no modo demonstração
**Description:** As a executivo avaliando o app, I want ver as telas cheias de vagas, candidatos e pareceres plausíveis mesmo sem conectar nada so that eu entenda o que o app faz antes de decidir conectar a IA.

**Acceptance Criteria:**
- [ ] `lib/semear-demo.ts`: na primeira leitura de qualquer lista com as tabelas vazias, grava (uma vez) a vaga "Analista de Customer Success" (requisitos do `EXEMPLO` atual, faixa 5.500 a 7.000, híbrido em São Paulo, desafios em três frases, quatro competências culturais da `culturaDemo()`), três candidatos (Bruno Alves, Camila Rocha, Diego Martins) com fichas completas (campos de origem `cv` e `web`, uma divergência em Camila, fontes com URLs de exemplo `https://exemplo.com/...`), três entrevistas `avaliadas` com pareceres de exemplo (`parecerDemo`, US-019) de recomendações diferentes, e uma entrevista `convidada` para um quarto candidato (Fernanda Lima), tudo com `exemplo = 1`
- [ ] As datas são relativas a "agora" (últimos 14 dias), para o Início e os Relatórios terem forma
- [ ] Quando a primeira vaga real é criada, as vagas de exemplo (e as entrevistas delas) são apagadas; quando o primeiro candidato real é criado, os candidatos de exemplo (e as entrevistas deles) são apagados — registrado no log
- [ ] Toda lista mostra o chip "Exemplo" nos itens de exemplo e, quando só existem itens de exemplo, um `AvisoExemplo` de uma frase com a ação para `/setup#openrouter` (componente `components/AvisoExemplo.tsx`, mesmo desenho do `simulador-vendas`)
- [ ] Configurações ganha "Apagar os dados de exemplo" (com confirmação) no cartão do OpenRouter, que recria o estado inicial vazio
- [ ] Lint e build passam

### Fase 1: Vagas

### US-005: Lista de vagas e cadastro de vaga
**Description:** As a pessoa de RH, I want abrir uma vaga com cargo, salário, desafios, requisitos e competências culturais so that a entrevistadora saiba exatamente o que avaliar e o candidato saiba do que se trata.

**Acceptance Criteria:**
- [ ] `/vagas`: cartões (não tabela) com cargo, área, senioridade, modelo e local, faixa salarial ("R$ 5.500 a R$ 7.000" ou "A combinar"), contagem de candidatos por status (convidados, concluídas, avaliadas), chip de status; filtro Abertas/Encerradas/Todas; botão "Abrir vaga"; estado vazio com "Preencher com um exemplo"
- [ ] `/vagas/nova` e `/vagas/[id]/editar` (`components/FormularioVaga.tsx`): campos principais cargo, área, senioridade, modelo, local, faixa salarial (mín/máx com "A combinar"), desafios dos primeiros meses (texto, até 1.500 caracteres, uma linha de ajuda: "O que essa pessoa precisa resolver nos primeiros meses"), requisitos (um por linha); em `MaisDetalhes` ("Entrevista"): competências culturais (caixas com as da empresa marcadas por padrão + "Adicionar competência desta vaga"), tom, número de perguntas (6 a 12), duração estimada (10 a 30 min), "Perguntar pretensão salarial" (ligado por padrão quando há faixa)
- [ ] Validação no servidor (`POST/PUT /api/vagas`): cargo e requisitos obrigatórios; mínimo ≤ máximo; perguntas e duração dentro dos limites; 400 com mensagem clara
- [ ] Salário é digitado como número com máscara de milhar e guardado como inteiro; `lib/formato.ts` ganha `moeda(valor)`
- [ ] Lint e build passam; verificar no navegador (lista vazia, lista com exemplo, formulário em 1400 e 390)

### US-006: Vaga a partir de uma descrição colada
**Description:** As a gestor da área, I want colar a descrição da vaga que já tenho so that o formulário venha preenchido e eu só revise.

**Acceptance Criteria:**
- [ ] No topo de `/vagas/nova`, "Colar uma descrição pronta": textarea (até 8 mil caracteres) e botão "Preencher a vaga"; `POST /api/vagas/estruturar` chama `askJSON` (modelo padrão) e devolve os campos de `Vaga` que conseguiu inferir, mais `competenciasCulturais` sugeridas cruzando a descrição com a cultura da empresa
- [ ] O formulário é preenchido com o que voltou, o gestor edita e salva normalmente; campos não inferidos ficam vazios (nunca inventados: o prompt manda deixar `null`)
- [ ] Em modo demonstração devolve a vaga de exemplo depois de `esperar(1200)`
- [ ] `Loading` com etapas ("Lendo a descrição...", "Separando requisitos e desafios...", "Escolhendo competências culturais...")
- [ ] Lint e build passam; verificar no navegador

### US-007: Página da vaga
**Description:** As a pessoa de RH, I want abrir uma vaga e ver quem está em cada etapa so that eu conduza o processo dessa vaga de um lugar só.

**Acceptance Criteria:**
- [ ] `/vagas/[id]`: cabeçalho com cargo, chips (senioridade, modelo, local, faixa), status e ações "Editar", "Encerrar vaga"/"Reabrir", "Testar a entrevista" (D11), "Adicionar candidato"
- [ ] Bloco "O que a entrevistadora vai avaliar": requisitos, desafios e competências culturais, em três colunas no desktop e empilhado no celular
- [ ] Bloco "Candidatos": tabela (`DataTable`) com nome, status da entrevista (chip), nota e recomendação quando avaliada, decisão do gestor, data; ações por linha "Ver parecer", "Reenviar convite", "Cancelar"; botão "Comparar candidatos" quando há duas ou mais avaliadas (US-021)
- [ ] "Adicionar candidato" abre um diálogo que busca em candidatos já cadastrados (por nome) ou leva a `/candidatos/novo?vaga=<id>`; escolher um candidato cria a entrevista e abre o diálogo do convite (US-013)
- [ ] "Testar a entrevista" abre a `Sala` atual em modo prévia (texto, gestor digita), sem gravar nada e sem parecer, com um aviso de uma frase: "Prévia do roteiro. Nada aqui é salvo."
- [ ] Encerrar vaga cancela as entrevistas ainda `convidadas` (com confirmação que diz quantas) e mantém as demais
- [ ] Lint e build passam; verificar no navegador

### Fase 2: Candidatos

### US-008: Lista de candidatos e cadastro com currículo
**Description:** As a pessoa de RH, I want cadastrar um candidato pelo nome e enviar o currículo dele so that a IA leia o currículo e eu não digite o que já está no arquivo.

**Acceptance Criteria:**
- [ ] `/candidatos`: busca por nome, lista com nome, cidade, cargo atual (da ficha), origem da ficha (chips "CV", "Web"), número de entrevistas e a última vaga; botão "Cadastrar candidato"
- [ ] `/candidatos/novo` (`components/FormularioCandidato.tsx`): nome completo (obrigatório), currículo (`.pdf`, `.docx` ou `.txt`, até 5 MB, opcional), e em `MaisDetalhes` ("Para a pesquisa na web") e-mail, telefone, cidade, endereço do perfil no LinkedIn, termo de busca (uma linha de ajuda: "Empresa atual, cargo ou cidade, para achar a pessoa certa"); com `?vaga=<id>` o candidato salvo já é atribuído à vaga e o convite abre em seguida
- [ ] `POST /api/candidatos` recebe `formData`; PDF é lido com `unpdf` (`extractText`, como em `contratos-ia`); `.txt` direto; `.docx` conforme Open Questions (até decidir, aceita e avisa "Formato ainda não lido: cole o texto"); o texto extraído vai para `cvTexto` (cortado em 60 mil caracteres) e o arquivo para `cvArquivo`
- [ ] Currículo sem texto legível (PDF só imagem) não bloqueia: salva o arquivo, deixa `cvTexto` vazio e a tela diz "Não conseguimos ler o texto deste arquivo" com a opção de colar o texto
- [ ] `GET /api/candidatos/[id]/cv` devolve o arquivo original (privado) para o gestor abrir
- [ ] Lint e build passam; verificar no navegador

### US-009: Ficha do candidato a partir do currículo
**Description:** As a pessoa de RH, I want que a ficha do candidato apareça preenchida a partir do currículo so that eu revise em vez de transcrever.

**Acceptance Criteria:**
- [ ] `lib/ficha.ts`: tipo `Ficha` com campos `resumo`, `cargoAtual`, `empresaAtual`, `cidade`, `anosExperiencia`, `experiencias[]` (`{ empresa, cargo, inicio, fim, descricao }`), `formacao[]`, `competencias[]`, `idiomas[]`, `links[]`, `pretensaoSalarial`, `disponibilidade`, `observacoes`; **cada campo é `{ valor, origem: "cv"|"web"|"gestor", fonteId? }`** (listas guardam a origem por item)
- [ ] `extrairDoCurriculo(cvTexto)` chama `askJSON` (modelo padrão) com regras: só o que está escrito, `null` para o que não está, datas no formato que aparecem; devolve a `Ficha` com tudo em origem `cv`; a fonte `cv` é registrada em `fontes_candidato`
- [ ] Roda no `POST /api/candidatos` quando há `cvTexto`, antes de responder (até 20 s; passou disso, salva sem ficha e a tela oferece "Ler o currículo de novo")
- [ ] Em modo demonstração devolve a ficha de exemplo do candidato correspondente (ou uma genérica)
- [ ] `mesclar(fichaAtual, novaFicha, origem)` em `lib/ficha.ts` aplica D5: `gestor` nunca é sobrescrito; `cv` sobrescreve `web`; `web` só preenche vazio; conflitos `cv` × `web` vão para `divergencias[]` (`{ campo, cv, web, fonteId }`)
- [ ] Testes com `node --test` em `lib/ficha.test.ts` cobrindo as regras de mesclagem (o único arquivo de teste unitário do app; roda em `npm run lint`? não — roda com `node --test lib/*.test.ts` registrado no `CLAUDE.md`)
- [ ] Lint e build passam

### US-010: Conectar a pesquisa na web (Bright Data) em Configurações
**Description:** As a administrador do app, I want colar um token da Bright Data e testar a conexão so that a pesquisa de candidatos funcione sem a equipe técnica.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts` ganha `BRIGHTDATA: Integracao` (id `brightdata`, título "Pesquisa de candidatos na web", benefício "Encontra o perfil público do candidato para completar a ficha", `obrigatoria: false`, `link` para a página de tokens da Bright Data com rótulo "Obter o token da Bright Data", `notaConexao` em duas frases: exige conta na Bright Data; sem isso a ficha fica só com o currículo), campos `BRIGHTDATA_API_TOKEN` (`secret`, principal) e, em Opções avançadas, `BRIGHTDATA_MCP_URL` (`text`, padrão o endereço do servidor remoto da Bright Data, conferido na documentação) e `BRIGHTDATA_MODO_PRO` (`select` Desligado/Ligado, ajuda: "Ligue se a sua conta tiver as ferramentas de perfil do LinkedIn")
- [ ] `lib/pesquisa-cliente.ts`: `conexaoBrightData()` monta `{ url, token }` a partir dos três valores (a forma de passar o token — cabeçalho ou parâmetro do endereço — é conferida na documentação e registrada no `CLAUDE.md`) e usa `conectar`/`listarFerramentas`/`chamar` de `lib/mcp-cliente.ts`; `ferramentasDisponiveis()` com cache de 10 minutos; `pesquisaEnabled()`
- [ ] `testar(config)` lista as ferramentas e confere as quatro que a US-011 usa (busca, página como Markdown, perfil do LinkedIn, conjunto de dados); devolve `ok: true` com "Conectado. N ferramentas disponíveis." ou `ok: false` dizendo qual falta e que talvez precise do modo avançado; 401 → "O token foi recusado. Confira se copiou o token inteiro."
- [ ] `GET /api/status` passa a informar `integrations.pesquisa`
- [ ] `lib/acoes.ts` ganha `ACAO_PESQUISA = { rotulo: "Conectar a pesquisa na web em Configurações", url: "/setup#brightdata" }`
- [ ] README: tabela de variáveis ganha as três chaves com o link de onde obter
- [ ] Lint e build passam; verificar no navegador (`/setup` em 1400 e 390)

### US-011: Pesquisar o candidato na web
**Description:** As a pessoa de RH, I want que o app procure o candidato na web a partir do nome e do currículo so that eu tenha o perfil público dele antes da entrevista, sem abrir dez abas.

**Acceptance Criteria:**
- [ ] `lib/pesquisa.ts`: `pesquisarCandidato(candidatoId)` roda em segundo plano (disparada pela rota, sem esperar a resposta), muda `pesquisaStatus` para `em_andamento` e segue os passos: (1) monta a consulta com nome completo + `termoBusca` + `empresaAtual`/`cargoAtual`/`cidade` da ficha do currículo, nessa ordem de prioridade; (2) se `linkedinUrl` existe, chama a ferramenta de perfil do LinkedIn direto; senão chama a busca (`search_engine`, ou o nome que `tools/list` devolver) e separa os resultados em "perfil do LinkedIn", "outras páginas da pessoa" (portfólio, GitHub, publicações, notícias) e "ruído"; (3) traz o perfil do LinkedIn pela ferramenta de perfil quando houver endereço; (4) traz até 3 outras páginas como Markdown; (5) a IA (`askJSON`, modelo padrão) consolida tudo numa `Ficha` de origem `web` com um `confianca` 0 a 1 por campo e uma lista `identidadesPossiveis[]` (`{ nome, descricao, url, bate: string[], naoBate: string[] }`) quando há mais de uma pessoa plausível
- [ ] Orçamento (P9): no máximo 6 chamadas, 60 s no total (`AbortSignal.timeout`), cada conteúdo cortado em 20 mil caracteres; estourou → `pesquisaStatus: "falhou"` com o motivo no log, nunca na tela
- [ ] Regra de identidade (D6): uma só pessoa plausível com `confianca` média ≥ 0,7 → `identidadeConfirmada = 1` e a ficha web é mesclada (D5); senão `identidadeConfirmada = 0`, a ficha web fica guardada mas **não mesclada**, e a tela pede ao gestor para escolher (US-012)
- [ ] Sem `cvTexto` e sem `termoBusca` e sem `linkedinUrl`, a pesquisa não roda: `pesquisaStatus: "nao_pedida"` e a tela explica o que informar
- [ ] Cada página trazida vira uma `fonte_candidato` com `url`, `titulo`, `resumo` (duas frases da IA) e `conteudo`; a ficha web referencia `fonteId` por campo
- [ ] Em modo demonstração (`!aiEnabled()` ou `!pesquisaEnabled()`): sem pesquisa conectada, `pesquisaStatus: "nao_pedida"` e a ficha diz como conectar (ação `ACAO_PESQUISA`); com pesquisa conectada mas sem IA, a consolidação usa a ficha de exemplo — e a tela avisa que é exemplo
- [ ] `POST /api/candidatos/[id]/pesquisar` (privada) dispara ou repete a pesquisa; `GET /api/candidatos/[id]` devolve `pesquisaStatus` para a tela sondar a cada 3 s enquanto `pendente|em_andamento`
- [ ] Teste com um servidor MCP descartável local (`http.createServer` respondendo `initialize`, `tools/list` e `tools/call` com fixtures) cobrindo: uma pessoa clara; homônimos; busca vazia; ferramenta ausente; 401; estouro de tempo
- [ ] Lint e build passam

### US-012: Tela do candidato: ficha editável com origem, fontes e divergências
**Description:** As a pessoa de RH, I want ver a ficha do candidato com a origem de cada informação, corrigir o que estiver errado e confirmar quem é a pessoa so that a entrevistadora parta de dados que eu confio.

**Acceptance Criteria:**
- [ ] `/candidatos/[id]`: cabeçalho com nome, cargo e empresa atuais, cidade, chips de origem presentes ("CV", "Web", "Editado por você"), status da pesquisa em uma frase ("Pesquisando na web...", "Pesquisa concluída em 18/09", "Não encontramos a pessoa na web", "A pesquisa não deu certo" + "Pesquisar de novo"), ações "Editar ficha", "Pesquisar de novo", "Abrir currículo", "Atribuir a uma vaga", "Apagar candidato"
- [ ] Ficha em seções (Resumo, Experiência, Formação, Competências, Idiomas, Links, Pretensão e disponibilidade, Observações), cada valor com um chip pequeno de origem e, quando `web`, um link "fonte" para a URL
- [ ] Bloco "Confirme quem é a pessoa" quando `identidadeConfirmada = 0` e há `identidadesPossiveis`: até três cartões com nome, descrição, link, "Bate com: ..." e "Não bate com: ..."; botões "É esta pessoa" (mescla a ficha web dessa identidade, marca confirmada) e "Nenhuma destas" (descarta a ficha web, marca confirmada sem web)
- [ ] Bloco "Divergências entre o currículo e a web" quando `divergencias[]` não está vazio: campo, o que diz o currículo, o que diz a web, fonte; ação "Manter o currículo" (padrão, já aplicado) ou "Usar o da web" (vira origem `gestor` com o valor da web — foi uma escolha da pessoa)
- [ ] "Editar ficha": todos os campos editáveis inline; o que o gestor muda vira origem `gestor` (D5) e nunca é sobrescrito por nova pesquisa nem por novo currículo
- [ ] Bloco "Entrevistas": lista das entrevistas do candidato (vaga, status, nota, decisão, data) com "Ver parecer"
- [ ] "Apagar candidato" pede confirmação que diz o que vai junto (ficha, currículo, N entrevistas e pareceres) e chama `DELETE /api/candidatos/[id]`
- [ ] Nenhuma palavra proibida por P7 na tela (`scripts/verificar-jargao.mjs` passa; a variável que carrega o código do link chama-se `codigo`, ver gotcha da US-058 no `CLAUDE.md`)
- [ ] Lint e build passam; verificar no navegador (ficha completa, homônimos, divergências, sem pesquisa conectada — 1400 e 390)

### Fase 3: convite e entrevista do candidato

### US-013: Atribuir à vaga e enviar o convite
**Description:** As a pessoa de RH, I want atribuir um candidato a uma vaga e mandar o link em um passo so that o candidato receba um convite claro, com prazo, e eu saiba que enviei.

**Acceptance Criteria:**
- [ ] `POST /api/entrevistas` `{ vagaId, candidatoId, expiraEmDias }` cria a entrevista `convidada`, gera o link via `criar()` de `lib/formularios.ts` (`tipo: "entrevista"`, `limite: 1`, `parametros: { marca, nome, titulo, descricao, entrevistaId }`) e devolve `{ id, codigo, link }`; prazos válidos 7, 15 e 30 dias (padrão 15)
- [ ] Diálogo do convite (`components/DialogoConvite.tsx`, substitui `DialogoLinkCandidato.tsx`): link com "Copiar link", mensagem pronta com "Copiar convite" (nome do candidato, cargo, empresa, o que esperar — "uma conversa por voz de cerca de N minutos, no seu celular ou computador, no horário que preferir" —, o aviso de gravação e análise por IA e de consulta a informações públicas (D12), o prazo e o uso único), e "Enviar por e-mail" quando `lib/notificacoes.ts` tem canal de e-mail conectado e o candidato tem e-mail (usa `enviar()` com o convite; sucesso vira `Aviso` verde; falha vira `Aviso` com a mensagem de negócio já traduzida pela notificação)
- [ ] "Reenviar convite" (na vaga, no candidato e em Entrevistas): estende `expiraEm` pelo mesmo prazo, reabre o diálogo com o mesmo link (o código não muda enquanto o link não foi usado); em `expirada`, gera um link novo e a entrevista volta para `convidada`
- [ ] "Cancelar" muda para `cancelada` e `encerrar()` o link; o link cancelado responde "Este convite foi cancelado. Fale com quem enviou." na tela pública
- [ ] `app/entrevista/[token]/page.tsx` e as rotas de `app/api/entrevista/candidato/[token]/*` aceitam `tipo` `entrevista` (novo) e `scorecard` (links antigos, até expirarem, com o comportamento atual); o `CLAUDE.md` registra a data em que o tipo antigo pode ser removido (90 dias)
- [ ] Lint e build passam; verificar no navegador

### US-014: Tela Entrevistas
**Description:** As a pessoa de RH, I want ver todos os convites e entrevistas em um lugar, por status so that eu saiba quem ainda não respondeu, quem concluiu e o que falta avaliar.

**Acceptance Criteria:**
- [ ] `/entrevistas`: abas por status (Aguardando o candidato = `convidada|aberta`, Em andamento, Concluídas = `concluida|avaliada` sem decisão, Decididas, Expiradas e canceladas), filtro por vaga, busca por nome, período (7, 30, 90 dias, tudo)
- [ ] Linhas com candidato, vaga, status (chip), como foi (voz natural, voz do navegador, texto — só quando já abriu), nota e recomendação (quando avaliada), decisão, "há N dias"; ações por linha conforme o status: "Reenviar", "Cancelar", "Abrir parecer", "Decidir"
- [ ] Entrevistas `concluida` (transcrição salva, parecer ainda não pronto) mostram "Preparando o parecer..." e a linha sonda a cada 5 s até `avaliada`
- [ ] `expirarVencidas()` roda na leitura da lista
- [ ] Estado vazio por aba, com a ação certa ("Abra uma vaga", "Convide um candidato")
- [ ] Lint e build passam; verificar no navegador

### US-015: O roteiro da entrevista
**Description:** As a entrevistadora de IA, I want conhecer a vaga, a cultura e a ficha do candidato so that eu pergunte sobre o que importa e aprofunde o que precisa ser esclarecido.

**Acceptance Criteria:**
- [ ] `lib/roteiro.ts`: `montarContexto(entrevistaId)` reúne `Vaga` (cargo, desafios, requisitos, faixa se `perguntaPretensao`), `Cultura` + `competenciasCulturais` da vaga, e a `Ficha` do candidato **só com campos de origem `cv` e `gestor`, mais `web` quando `identidadeConfirmada = 1`** (D6), junto das `divergencias[]` como "pontos a esclarecer"
- [ ] `planejarRoteiro(contexto)` (uma chamada `askJSON`, modelo padrão, na abertura da sala, guardada em `entrevistas.roteiro` JSON) devolve os blocos na ordem: abertura (1 pergunta sobre trajetória e interesse), currículo e pontos a esclarecer (1 a 2), requisitos (2 a 4, um por requisito prioritário), desafios da vaga (1 a 2, situacionais: "como você atacaria..."), cultura (1 a 2 por competência escolhida, situacionais, sem citar o nome do valor), pretensão e disponibilidade (1, se ligado), encerramento (espaço para perguntas do candidato + despedida) — o total respeita `numeroPerguntas`
- [ ] `proximaFala(entrevistaId, ultimaResposta)` substitui `proximaPergunta`: segue o roteiro, faz follow-up quando a resposta foi vaga (uma vez por bloco, sem estourar o total), responde brevemente a uma pergunta do candidato sobre a vaga **só com o que está na vaga** (salário só a faixa, se `perguntaPretensao`; nunca inventa benefício), e nunca menciona nota, avaliação, currículo pesquisado ou perfil público de forma que constranja ("Vi no seu LinkedIn que..." é proibido; "Você comentou no currículo que..." é permitido)
- [ ] A conversa mora no servidor: cada fala vai para `mensagens_entrevista` (`registrarMensagem`) e o navegador manda só a última resposta; recarregar não perde nada
- [ ] `SYSTEM_PERGUNTA`/`SYSTEM_AVALIAR` atuais saem de `lib/entrevista.ts`; o que a prévia do gestor (D11) usa é o mesmo `lib/roteiro.ts` com um candidato vazio
- [ ] Em modo demonstração: roteiro fixo derivado da vaga (`roteiroDemo`), com uma pergunta cultural e uma de desafio reconhecíveis
- [ ] Lint e build passam

### US-016: A sala do candidato por voz do navegador (nível 2)
**Description:** As a candidato, I want abrir o link no celular, entender o que vai acontecer e conversar falando so that a entrevista pareça uma conversa, não um formulário.

**Acceptance Criteria:**
- [ ] `components/BoasVindas.tsx` (antes da sala): marca e nome da empresa (do `Topbar`), "Olá, {primeiro nome}", cargo, "cerca de N minutos", como funciona em três linhas (você fala, a entrevistadora responde, pode digitar se preferir), o aviso de gravação/análise por IA/consulta pública (D12) e o botão "Começar a entrevista" — o toque nele é o gesto que libera áudio e microfone
- [ ] Teste de microfone de uma frase ("Diga 'olá' para testarmos") com a transcrição aparecendo; sem permissão ou sem `SpeechRecognition` (P5), cai para texto com a frase certa e o convite a abrir no Chrome
- [ ] `components/SalaCandidato.tsx` (substitui o uso de `Sala.tsx` na rota pública; `Sala.tsx` fica só para a prévia do gestor): modo mãos livres (escuta, silêncio de 2 s encerra o turno, mesma trava anti-laço da `SalaVoz` do `simulador-vendas`), botão "Segurar para falar" como alternativa, "Prefiro digitar" sempre visível, indicador "Ouvindo / Pensando / Falando", progresso "Pergunta 3 de 8", "Encerrar entrevista" (com confirmação) disponível depois da segunda resposta
- [ ] Fala: `GET /api/entrevista/candidato/[token]/voz` gera o áudio no servidor (ElevenLabs, quando `ELEVENLABS_API_KEY` existe; a chave nunca vai para o navegador) e devolve; sem a chave, `speechSynthesis` com voz `pt-BR`; falha de voz nunca interrompe (regra já existente em `lib/voz.ts`)
- [ ] Retomada: um cookie assinado por link (`lib/sessao-candidato.ts`, mesmo desenho de `simulador-vendas/lib/sessao-vendedor.ts`) permite recarregar a página e continuar da pergunta atual, com a conversa vinda do servidor; um segundo aparelho com o mesmo link vê "Esta entrevista está em andamento em outro aparelho"
- [ ] Status: abrir a página → `aberta`; primeira resposta → `em_andamento` (`nivelVoz` registrado); despedida → `concluida`
- [ ] Todos os textos falam com o **candidato**: nenhuma frase manda configurar nada, nenhuma menciona gestor, nota ou Configurações (regra da US-032/US-039)
- [ ] Lint e build passam; verificar no navegador **primeiro no celular** (390, com toque) e depois em 1400: boas-vindas, microfone negado, conversa, texto, retomada

### US-017: A sala com o agente conversacional da ElevenLabs (nível 1)
**Description:** As a candidato, I want uma conversa em que eu possa falar naturalmente e até interromper so that a entrevista pareça uma ligação de verdade — quando a empresa conectou essa voz.

**Acceptance Criteria:**
- [ ] `lib/integracoes.ts`: o cartão "Ligação telefônica automática" vira "Agente conversacional da ElevenLabs" (id `elevenlabs-agente`), com `ELEVENLABS_AGENT_ID` como campo principal (lista carregada da conta), `ELEVENLABS_PHONE_NUMBER_ID` e `ELEVENLABS_WEBHOOK_SECRET` em Opções avançadas; o benefício diz que **sem isso a entrevista já é por voz** e que o agente torna a conversa mais natural e permite interromper; o passo a passo de criar o agente lista as variáveis dinâmicas que o app envia
- [ ] Quando o agente está conectado (`integracaoConfigurada`, decidido no servidor em `app/entrevista/[token]/page.tsx`), a sala carrega o widget `<elevenlabs-convai>` com as variáveis da **entrevista**: `entrevista_id`, `candidato` (primeiro nome), `cargo`, `empresa`, `roteiro` (o plano da US-015 em texto), `duracao_minutos`; o app some do caminho durante a conversa (`components/SalaAgenteCandidato.tsx`, mesmo desenho de `simulador-vendas/components/SalaAgente.tsx`)
- [ ] Se o widget não carregar em 10 s, a sala cai sozinha para o nível 2 sem o candidato escolher nada; "Prefiro conversar por aqui" leva ao nível 2 a qualquer momento sem perder a entrevista
- [ ] `app/webhook/elevenlabs/route.ts` (pública pela regra `/webhook/*` já existente; HMAC no formato `t=,v0=` com `crypto.timingSafeEqual`, janela de 30 min, cópia do padrão do `simulador-vendas`): casa o evento de pós-conversa por `entrevista_id`, grava a transcrição em `mensagens_entrevista`, muda para `concluida` e dispara a avaliação (US-019); sem segredo configurado recusa 401 com mensagem clara; responde 2xx rápido e processa depois
- [ ] `components/WebhookElevenLabs.tsx` em `/setup` mostra o endereço a colar na ElevenLabs em "Dados para a equipe técnica"
- [ ] A ligação telefônica (`/api/ligar`) continua funcionando com o mesmo agente e número, agora acionada de dentro de uma entrevista `convidada` ("Ligar para o candidato agora"), e a transcrição chega pelo mesmo aviso de pós-conversa
- [ ] Lint e build passam; verificar no navegador (queda para o nível 2 com o script bloqueado)

### US-018: Encerramento, agradecimento e o que acontece depois
**Description:** As a candidato, I want saber que terminei e o que vem depois so that eu feche a página tranquilo; as a pessoa de RH, I want que o parecer comece a ser preparado sozinho.

**Acceptance Criteria:**
- [ ] A despedida da entrevistadora (US-015) marca `concluida`, o cookie de retomada é invalidado e a tela mostra "Obrigado, {nome}. Sua entrevista foi enviada." com "A equipe de recrutamento vai analisar e entrar em contato." — nunca nota, nunca parecer
- [ ] Voltar ao link depois de concluída mostra a mesma tela de agradecimento (não "link já usado")
- [ ] `concluida` dispara `avaliarEntrevista(entrevistaId)` (US-019) em segundo plano; falha deixa `concluida` e a tela do gestor oferece "Preparar o parecer de novo"
- [ ] Entrevista encerrada pelo candidato antes do fim (botão "Encerrar entrevista") com ao menos duas respostas é avaliada normalmente, com o parecer dizendo que foi parcial; com menos de duas, fica `concluida` sem parecer e a linha em Entrevistas diz "Encerrada cedo demais para avaliar"
- [ ] Lint e build passam; verificar no navegador

### Fase 4: análise para o gestor

### US-019: O parecer agêntico
**Description:** As a gestor, I want um parecer que cruze a conversa com a vaga, a cultura e a ficha do candidato so that eu decida sem ler a transcrição inteira.

**Acceptance Criteria:**
- [ ] `lib/avaliacao.ts`: `avaliarEntrevista(entrevistaId)` em três passos, cada um uma chamada `askJSON` com `model: modelName("avaliacao")` (o app passa `avaliacao: true` para `openrouter()` e ganha o seletor "Modelo para avaliação" em `/setup`): (1) **extração** — fatos declarados na conversa (experiências, números, ferramentas, decisões, pretensão, disponibilidade), cada um com o número da pergunta de origem; (2) **cruzamento** — para cada fato, bate ou não com o currículo e com a ficha web confirmada (`confirmado|divergente|nao_verificavel`), e para cada requisito e competência cultural, a evidência mais forte; (3) **parecer** — a saída final abaixo
- [ ] Tipo `Parecer`: `notaGeral` 0 a 10, `recomendacao` (`avançar|avaliar com o gestor|não avançar`), `resumo` (3 frases), `aderencia` (`{ requisito, situacao: atende|parcial|nao_atende|nao_abordado, evidencia, pergunta? }[]`), `tecnico` (`{ criterio, nota, evidencia, pergunta? }[]`, 3 a 6), `cultura` (`{ competencia, nota, evidencia, pergunta? }[]`, uma por competência da vaga), `consistencia` (`{ afirmacao, fonte: cv|web, situacao, detalhe }[]`), `pontosFortes[]` (até 4), `pontosAtencao[]` (até 4), `proximaEtapa` (`{ perguntas: string[] (até 5), foco: string }`), `pretensao` (`{ valor?, dentroDaFaixa?: boolean }`), `parcial: boolean`
- [ ] Regras no prompt: só o que foi dito e o que está na ficha; nota cultural só com evidência comportamental (sem evidência → `nota: null` e "não abordado"); nenhuma inferência sobre idade, gênero, origem, religião, deficiência, aparência ou família, mesmo que apareçam na conversa (lista explícita no system prompt, com a instrução de ignorar); `recomendacao` nunca é `avançar` com algum requisito prioritário `nao_atende`
- [ ] O parecer é salvo em `lib/historico.ts` (`tipo: "parecer"`, `entrada: { entrevistaId, vagaId, candidatoId }`, `saida: Parecer`, `meta`), `registrarResultado` liga o id à entrevista e o status vira `avaliada`
- [ ] `parecerDemo(contexto)` em `lib/demo.ts` deriva evidências reais da transcrição (como `scorecardDemo` faz hoje) e preenche cultura e consistência com base na ficha de exemplo
- [ ] Custo registrado no `CLAUDE.md`: uma entrevista de 8 perguntas são ~10 chamadas curtas de roteiro (~300 tokens de saída cada) mais três de avaliação (~1.500, ~1.500 e ~2.500 tokens)
- [ ] Testado com `curl` numa entrevista de exemplo em modo demonstração e, com chave real, numa transcrição gravada em `tasks/fixtures/` (não é obrigatório na verificação automática)
- [ ] Lint e build passam

### US-020: A tela do parecer
**Description:** As a gestor, I want abrir o parecer e ver primeiro o que decide, depois o detalhe, e registrar minha decisão so that a decisão fique no app e não no e-mail.

**Acceptance Criteria:**
- [ ] `/entrevistas/[id]` (privada; `/r/[id]` continua abrindo pareceres e os tipos antigos, para links já copiados): cabeçalho com nome do candidato (link para a ficha), cargo (link para a vaga), data, como foi (voz natural/navegador/texto, duração), ações `Entregar` (PDF, copiar texto, imprimir) e "Nova entrevista com este candidato"
- [ ] Primeira dobra: `Destaque` com a nota geral (tom pela recomendação, como hoje), chip da recomendação, `resumo`, e o bloco **"Sua decisão"** com três botões (Avançar, Aguardar, Reprovar) que gravam `decisao`/`decisaoEm` via `POST /api/entrevistas/[id]/decidir`; a decisão tomada aparece como chip e pode ser mudada
- [ ] Seções, nesta ordem: "Aderência à vaga" (requisitos com chip atende/parcial/não atende/não abordado e evidência), "Avaliação técnica" (tabela como hoje, evidência linkando `#pergunta-N`), "Cultura" (uma linha por competência, nota e evidência; "não abordado" em cinza), "O que bate e o que não bate" (consistência: confirmado em verde, divergente em âmbar, não verificável em cinza, com a fonte), "Pontos fortes" / "Pontos de atenção", "Para a próxima etapa" (perguntas sugeridas e foco), "Pretensão salarial" (só quando dita: valor e dentro/fora da faixa), e `<details>` "Ver a conversa completa" com as perguntas numeradas
- [ ] Parecer `parcial` mostra um `Aviso` no topo: "Entrevista encerrada antes do fim: o parecer cobre só o que foi conversado."
- [ ] Seção "Ligar para o candidato" (já existe) fica no rodapé, só quando o agente está conectado
- [ ] `parecerParaTexto()` para copiar/PDF; `/imprimir/[id]` renderiza o mesmo conteúdo sem ações
- [ ] Lint e build passam; verificar no navegador (1400 e 390; parecer completo e parcial)

### US-021: Comparar candidatos da vaga
**Description:** As a gestor, I want ver os candidatos de uma vaga lado a lado, inclusive em cultura so that eu escolha quem avança com os mesmos critérios para todos.

**Acceptance Criteria:**
- [ ] `/vagas/[id]/comparar`: tabela ordenada por nota com candidato, nota, recomendação da IA, decisão do gestor, aderência (N de M requisitos atendidos), cultura (média das competências com nota), consistência (N divergências); caixas para escolher até **três** e o bloco "Lado a lado" com resumo, requisitos (chips), competências culturais (notas), pontos fortes e de atenção e perguntas para a próxima etapa
- [ ] Botões de decisão por candidato dentro da comparação (mesma rota da US-020)
- [ ] `gerarRanking()` e o tipo `ranking` do histórico saem: a comparação é calculada na leitura (nada de IA, nada salvo); `Entregar` oferece PDF e copiar texto da comparação
- [ ] Lint e build passam; verificar no navegador

### US-022: Início
**Description:** As a pessoa de RH, I want abrir o app e ver o que precisa de mim hoje so that eu não procure em quatro telas.

**Acceptance Criteria:**
- [ ] `lib/inicio.ts` (cálculo puro sobre o banco, nenhuma chamada de IA): quatro indicadores dos últimos 30 dias com variação sobre os 30 anteriores — Vagas abertas, Aguardando o candidato, Entrevistas concluídas, Para você decidir (avaliadas sem decisão); `valor: null` quando "ainda não dá para dizer" e `variacao: null` quando não há com o que comparar (regra do `simulador-vendas/lib/inicio.ts`)
- [ ] "Precisa de você": lista de até 6 itens em ordem de urgência — pareceres sem decisão (mais antigos primeiro), candidatos com identidade a confirmar, convites que expiram em até 3 dias, pesquisas que falharam; cada item leva direto à tela certa
- [ ] "Vagas abertas": até 3 cartões com cargo, candidatos por status e "Ver vaga"; "Ver todas"
- [ ] "Comece em 3 passos" (só quando falta algo): Cadastre a cultura da empresa → Abra uma vaga → Convide um candidato; marcados conforme existirem dados reais
- [ ] O hero atual (título grande, ilustração e `Passos`) sai do Início; a ilustração do segmento fica só no estado vazio; `PROMESSA` vira o título da tela de boas-vindas do candidato e do catálogo
- [ ] Lint e build passam; verificar no navegador (vazio, só exemplo, com dados reais — 1400 e 390)

### Fase 5: relatórios, integrações e fechamento

### US-023: Relatórios
**Description:** As a pessoa de RH, I want números do processo por vaga e período, exportáveis so that eu mostre à liderança se a triagem por IA está funcionando.

**Acceptance Criteria:**
- [ ] `lib/relatorios.ts`: `relatorio({ vagaId?, de, ate })` devolve funil (convidados, abriram, concluíram, avaliadas, decididas por decisão), tempo médio do convite à conclusão (em horas; mediana também), taxa de conclusão (concluídas ÷ convidadas), nota média, distribuição de recomendações da IA e de decisões do gestor, distribuição por como foi (voz natural, navegador, texto), e a lista das entrevistas do período
- [ ] `/relatorios`: filtros de vaga (todas ou uma) e período (7, 30, 90 dias, personalizado); quatro indicadores; funil em barras horizontais (SVG); distribuição de recomendações e decisões em barras; tabela das entrevistas; "Relatórios anteriores" leva a `/historico`
- [ ] "Exportar planilha" baixa um CSV (`;` como separador, UTF-8 com BOM, datas `dd/mm/aaaa`) com uma linha por entrevista do período (candidato, vaga, status, convite, conclusão, horas, como foi, nota, recomendação, decisão); "Imprimir" usa `/imprimir/relatorio?...` no padrão de impressão da suíte
- [ ] "Salvar este relatório" grava um registro `tipo: "relatorio"` no histórico com os números e o período, para comparação futura à mão
- [ ] Lint e build passam; verificar no navegador

### US-024: MCP e rotina semanal
**Description:** As a gestor que usa um assistente de IA, I want consultar vagas e pareceres e criar convites de dentro do assistente so that o app entre no meu fluxo; e quero um resumo semanal por e-mail.

**Acceptance Criteria:**
- [ ] `lib/ferramentas.ts`: `listar_vagas({status?})`, `listar_candidatos_da_vaga({vaga_id})` (com status, nota, recomendação e decisão), `obter_parecer({entrevista_id})` (substitui `obter_scorecard`, que continua como apelido aceitando ids antigos), `criar_convite({vaga_id, candidato_id, expira_em_dias?})` (devolve o link e a mensagem pronta), `pesquisar_candidato({candidato_id})` (dispara a pesquisa; devolve o status) — todas reaproveitando `lib/vagas.ts`/`lib/entrevistas.ts`/`lib/pesquisa.ts`, nada de lógica nova na ferramenta
- [ ] `lib/rotinas-do-app.ts` registra `resumo-semanal`: por vaga aberta, convites enviados, entrevistas concluídas, pareceres aguardando decisão e o melhor candidato da semana, entregue por `lib/notificacoes.ts`; a rotina aparece em `components/Rotinas.tsx` (copiado do `simulador-vendas`) em Configurações
- [ ] `catalogo.json`: `capacidades` ganha `"rotina"`; textos `problema`, `ia` e `integracoes` atualizados
- [ ] Lint e build passam; teste manual com o MCP Inspector registrado no `CLAUDE.md`

### US-025: Fechamento — modo demonstração completo, textos, catálogo e documentação
**Description:** As a mantenedor da suíte, I want o app inteiro coerente na primeira impressão e documentado so that quem abrir o catálogo entenda o que ele faz e quem for mexer no código saiba onde tudo está.

**Acceptance Criteria:**
- [ ] Percurso completo em modo demonstração sem nenhuma chave: Início → vaga de exemplo → candidato de exemplo (ficha, divergência, fontes) → convite → link do candidato no celular (boas-vindas, voz do navegador, texto) → parecer → comparação → relatório; nenhuma tela quebrada, nenhum erro de console, nenhuma rolagem horizontal em 390
- [ ] `?exemplo=1` passa a abrir o Início já semeado e `?exemplo=1&captura=1` a página da vaga de exemplo com candidatos (é o que o catálogo captura)
- [ ] Contagem de texto (P7) em todas as telas novas; `scripts/verificar-jargao.mjs entrevista-ia` e `scripts/verificar-paleta.mjs` passam; `scripts/verificar-padrao.sh` sai 0 (camada `INFRA` intacta)
- [ ] `README.md` reescrito: o que resolve (a jornada em um parágrafo), as seis telas, integrações (IA obrigatória para sair do demo; ElevenLabs voz e agente, opcionais; Bright Data, opcional; e-mail para convites, opcional), tabela de variáveis completa, estrutura de pastas
- [ ] `CLAUDE.md`: decisões deste PRD, datas de conferência das documentações (ElevenLabs, Bright Data), formato do token da Bright Data, gotchas novos (nome `codigo`, `fetch` numa linha, tipo antigo `scorecard` até quando)
- [ ] Verificação obrigatória do `PADRAO.md` (lint, build, standalone com `curl` nas rotas, capturas de `/`, `/vagas/[id]`, `/candidatos/[id]`, `/entrevista/<código>` e `/setup` em 1400x1000 e 390)

## Functional Requirements

- FR-1: O app é independente (`independente: true`) com seis destinos no cabeçalho: Início, Vagas, Candidatos, Entrevistas, Relatórios, Configurações.
- FR-2: Vaga, Candidato e Entrevista são tabelas próprias em SQLite; uma entrevista é o par único (vaga, candidato) ativo; o link pertence à entrevista.
- FR-3: A cultura da empresa é cadastrada uma vez em Configurações (até 6 valores, comportamentos esperados, o que não combina) e pode ser gerada pela IA a partir de um texto colado.
- FR-4: Uma vaga tem cargo, área, senioridade, modelo, local, faixa salarial ou "a combinar", desafios, requisitos, competências culturais (da empresa e próprias), tom, número de perguntas (6 a 12), duração (10 a 30 min), pergunta de pretensão e status.
- FR-5: Uma vaga pode ser preenchida a partir de uma descrição colada; a IA nunca inventa campos não presentes.
- FR-6: Um candidato é cadastrado pelo nome completo, com currículo opcional (`.pdf`, `.docx`, `.txt`, até 5 MB) e dados opcionais para a pesquisa (e-mail, telefone, cidade, LinkedIn, termo de busca).
- FR-7: A ficha do candidato é extraída do currículo pela IA; cada campo carrega a origem (`cv`, `web`, `gestor`).
- FR-8: A pesquisa na web usa o servidor MCP da Bright Data (busca, perfil do LinkedIn, página como Markdown, conjunto de dados), com no máximo 6 chamadas e 60 s por rodada, e roda em segundo plano.
- FR-9: O currículo prevalece sobre a web; a web só preenche vazios; conflitos viram divergências listadas; o que o gestor edita nunca é sobrescrito.
- FR-10: Quando há mais de uma pessoa plausível, o gestor confirma a identidade; até então a ficha web não é usada na entrevista.
- FR-11: Falha na pesquisa nunca impede cadastrar ou entrevistar; a tela explica e oferece repetir.
- FR-12: Atribuir um candidato a uma vaga cria a entrevista, gera o link (uso único, 7/15/30 dias) e mostra o convite pronto, com envio por e-mail quando há canal conectado.
- FR-13: Convites podem ser reenviados (prazo estendido ou link novo se expirado) e cancelados.
- FR-14: A tela Entrevistas lista tudo por status, vaga, período e nome.
- FR-15: O roteiro cobre abertura, currículo e pontos a esclarecer, requisitos, desafios, cultura (situacional), pretensão (se ligado) e encerramento, dentro do número de perguntas; a conversa é gravada no servidor a cada fala.
- FR-16: A entrevistadora nunca cita o perfil público de forma constrangedora, nunca menciona nota ou avaliação, e responde perguntas do candidato só com o que está na vaga.
- FR-17: A sala do candidato abre por voz em três níveis (agente ElevenLabs → voz do navegador → texto), com boas-vindas, aviso de gravação e consulta pública, teste de microfone, "Prefiro digitar" sempre visível e retomada ao recarregar.
- FR-18: Com o agente conversacional conectado, a transcrição chega pelo aviso de pós-conversa assinado (HMAC) e a sala cai para o nível 2 se o agente não carregar em 10 s.
- FR-19: Ao concluir, o candidato vê só um agradecimento; a avaliação começa sozinha.
- FR-20: O parecer é gerado em três passos (extração, cruzamento, parecer) com o modelo de avaliação, e traz nota, recomendação, resumo, aderência por requisito, técnico, cultura, consistência com currículo e web, pontos fortes e de atenção, perguntas para a próxima etapa e pretensão.
- FR-21: O parecer ignora e nunca infere idade, gênero, origem, religião, deficiência, aparência ou família; nota cultural exige evidência comportamental.
- FR-22: O gestor registra a decisão (avançar, aguardar, reprovar) separada da recomendação da IA; a decisão alimenta o funil e o Início.
- FR-23: Candidatos de uma vaga são comparados numa tabela e lado a lado (até três), sem chamada de IA.
- FR-24: O Início mostra quatro indicadores com variação, "Precisa de você", vagas abertas e "Comece em 3 passos".
- FR-25: Relatórios trazem funil, tempo médio e mediana, taxa de conclusão, nota média, distribuições, por vaga e período, com exportação CSV e impressão.
- FR-26: O MCP expõe listar vagas, listar candidatos da vaga, obter parecer, criar convite e pesquisar candidato; uma rotina semanal resume as vagas por e-mail ou Slack.
- FR-27: Tudo funciona em modo demonstração com dados de exemplo marcados, que somem quando o primeiro dado real do tipo aparece.
- FR-28: "Apagar candidato" remove ficha, fontes, currículo, entrevistas e pareceres numa transação.
- FR-29: Os endereços públicos `/entrevista/<código>` e `/api/entrevista/candidato/<código>/*` não mudam; links antigos funcionam até expirar.
- FR-30: Nenhuma tela usa jargão técnico fora de Opções avançadas/Para a equipe técnica; `scripts/verificar-jargao.mjs` passa.

## Non-Goals

- **Integração com ATS** (Gupy, Greenhouse, LinkedIn Recruiter): importar ou exportar candidatos e vagas de outro sistema. O CSV dos relatórios e o MCP são a porta de saída deste MVP.
- **Vários usuários com papéis** (recrutador, gestor, aprovador): uma conta por instância, como toda a suíte.
- **Agendamento de entrevistas humanas, calendário e lembretes automáticos** ao candidato (o reenvio é manual).
- **Envio automático por WhatsApp**: o convite é copiado ou enviado por e-mail.
- **Vídeo, análise de expressão facial, tom de voz, sotaque ou tempo de resposta como critério** (D13) — fora do produto, não só do MVP.
- **Testes técnicos, provas ou cases** dentro da entrevista.
- **Criar personas de entrevistadora, várias vozes ou avatar animado.**
- **Busca vetorial / RAG** sobre currículos: a ficha estruturada entra inteira no prompt.
- **Evolução por período e comparação entre vagas** nos relatórios (D8).
- **Criar o agente da ElevenLabs a partir do app**: o gestor cria na conta dele e escolhe na lista, como hoje.
- **Pesquisa em redes sociais pessoais** (Instagram, Facebook, X) e qualquer coleta além do que a busca e o LinkedIn profissional devolvem.
- **Recuperação de senha por e-mail**: continua `NOVA_SENHA_ADMIN`.

## Design Considerations

- Fundação visual da suíte (15/09/2026): `Topbar` com os seis destinos, cartões `.card`, `Field`/`Row`/`MaisDetalhes`, `DataTable`, `Chip`, `Destaque`, `Entregar`, `Aviso`, `Empty` com ilustração inline. O Início segue o desenho do `simulador-vendas` (indicadores com variação, lista do que precisa de atenção, cartões, três passos), sem hero grande.
- **Origem visível.** Chips pequenos "CV", "Web", "Você" ao lado de cada valor da ficha são o coração da confiança no dado. Nunca misturar sem marcar.
- **Sala do candidato é celular primeiro.** Botão grande de falar, um estado por vez (Ouvindo / Pensando / Falando), texto sempre à mão, nada de menu. Cores e marca da empresa iguais ao app; nenhum elemento do gestor (chip de status da IA, Configurações) aparece.
- **Parecer lê de cima para baixo em ordem de decisão**: nota e recomendação → decisão → aderência → técnico → cultura → consistência → próxima etapa → transcrição.
- **Cultura sem rótulo moral.** As notas culturais são "evidência de comportamento", não "é uma boa pessoa"; "não abordado" é um estado normal e neutro (cinza), não uma falha.
- Gráficos SVG à mão, uma cor de acento e cinza; sem legenda quando o rótulo cabe na barra.
- Ilustrações e ícones: os de `public/ilustracoes/icones` já existentes (`time`, `checklist`, `conversa`, `relatorio`, `alvo`, `acordo`) cobrem os seis destinos; nada novo a gerar.
- Impressão: `/imprimir/[id]` para parecer e comparação; `/imprimir/relatorio` para o relatório; folha A4 do padrão.

## Technical Considerations

- **Camada INFRA intacta**: `lib/ai.ts`, `lib/store.ts`, `lib/conta*.ts`, `lib/historico.ts`, `lib/formularios.ts`, `lib/mcp*.ts`, `lib/rotinas.ts`, `lib/notificacoes.ts`, `lib/email-envio.ts`, `app/api/setup|status|conta|historico|rotinas`, `app/mcp`, `app/f`, `proxy.ts`. Tudo deste PRD entra em arquivos novos ou em arquivos já próprios do app.
- **Tabelas novas** no mesmo `app.sqlite` (`abrirBanco()`): `vagas`, `candidatos`, `fontes_candidato`, `entrevistas`, `mensagens_entrevista`. `CREATE TABLE IF NOT EXISTS` na abertura; nunca `DROP`. A migração da US-002 é idempotente (marca em `config` a chave `MIGRACAO_ENTREVISTAS_V1`).
- **Link público**: continua em `lib/formularios.ts` (`tipo: "entrevista"`, `limite: 1`); `parametros` guarda `entrevistaId`, e o resto (vaga, candidato) é lido do banco na hora — nunca do link nem do corpo enviado pelo navegador.
- **Bright Data por MCP**: `lib/mcp-cliente.ts` já fala Streamable HTTP com `Authorization: Bearer`. Se a documentação indicar que o servidor remoto recebe o token no endereço, `conexaoBrightData()` monta a URL e o `CLAUDE.md` registra; o token nunca aparece em log (`console.error` só com o status). Modo Pro (`BRIGHTDATA_MODO_PRO`) é passado do jeito que a documentação indicar (parâmetro do endereço ou ferramenta diferente). O plano gratuito da Bright Data tem cota mensal de chamadas: a mensagem de cota esgotada é traduzida em `lib/pesquisa-cliente.ts` no mesmo formato de `interpretarFalhaElevenLabs`.
- **Segundo plano sem fila**: pesquisa e avaliação rodam com `void promise` na própria requisição que as dispara, com status no banco e sondagem pela tela (como o `simulador-vendas` faz com a avaliação). Reiniciar o servidor no meio deixa `em_andamento`/`concluida` e a tela oferece repetir. Sem worker, sem cron.
- **Modelo por tarefa**: roteiro e extração de currículo no modelo padrão; avaliação em `modelName("avaliacao")`.
- **Voz**: `lib/voz.ts` continua o único lugar que fala com a ElevenLabs para texto-para-voz; o agente conversacional é o widget no navegador + aviso de pós-conversa (nenhum áudio passa pelo servidor). Nada de áudio em disco.
- **Cookie de retomada** do candidato: assinado com a chave mestra de `lib/store.ts` (`crypto.createHmac`), só `entrevistaId` e `codigo`, `HttpOnly`, `SameSite=Lax`, validade igual ao link.
- **Dados pessoais**: `cvArquivo` e `fontes_candidato.conteudo` são os campos mais pesados; `apagar()` do candidato remove tudo numa transação. Sem retenção automática no MVP (Open Questions).
- **Jargão**: `scripts/verificar-jargao.mjs` varre `components/*.tsx` inteiro; a variável do link chama-se `codigo`, `fetch` com código interpolado fica numa linha só, e nenhum componente tem "MCP", "Webhook" ou "Token" no nome (`WebhookElevenLabs.tsx` é a exceção já registrada na suíte).
- **Custo por entrevista** (US-019): ~10 chamadas curtas de roteiro mais três de avaliação; pesquisa: até 6 chamadas à Bright Data mais uma de consolidação; extração de currículo: uma chamada. Tudo no modelo gratuito por padrão.

## Success Metrics

- Da abertura da vaga ao primeiro convite enviado em menos de 10 minutos, sem tocar em Configurações além da IA.
- Ficha do candidato com currículo: 80% dos campos preenchidos sem edição do gestor em currículos em português de uma a três páginas.
- Pesquisa na web concluída em até 60 s em 90% dos casos com pesquisa conectada; zero cadastros bloqueados por falha de pesquisa.
- Candidato falando com a entrevistadora em menos de 30 s depois de abrir o link, no Chrome do celular, sem nenhuma chave de voz.
- Taxa de conclusão dos links acima de 70% nas entrevistas de exemplo internas.
- Gestor decide (registra a decisão) sem abrir a transcrição em mais da metade dos pareceres.
- `scripts/verificar-padrao.sh`, `verificar-jargao.mjs` e `verificar-paleta.mjs` saem 0; nenhuma regressão nas rotas de infraestrutura.

## Open Questions

1. **Leitura de `.docx`.** `unpdf` só lê PDF. Para DOCX, a opção mais leve é `mammoth` (uma dependência, sem binários) — a mesma pergunta ficou aberta no PRD do `whatsapp-atendente`. Decidir antes da US-008; até lá, `.docx` é aceito e pede o texto colado.
2. **Ferramentas exatas da Bright Data e modo Pro.** O servidor remoto expõe um conjunto básico (busca, página como Markdown) e um conjunto ampliado (perfis do LinkedIn e outros conjuntos de dados) que pode exigir o modo avançado e ter custo por chamada diferente. Confirmar em `tools/list` e na documentação na US-010 quais nomes usar e se `web_data_linkedin_person_profile` precisa do modo Pro.
3. **Base legal da pesquisa.** D12 trata o candidato com aviso e apagamento, mas a base legal (legítimo interesse × consentimento) e a política de retenção (apagar automaticamente candidatos sem entrevista há N dias?) merecem uma frase do jurídico da StartSe antes de o app ir a um cliente. Sugestão de padrão: 180 dias sem movimento → aviso no Início para apagar.
4. **Agente da ElevenLabs compartilhado.** Como no `simulador-vendas`: vale uma conta da StartSe com um agente pronto (o cliente não configura nada e a voz boa vem ligada), com o custo de voz por nossa conta? Mudaria o nível 1 de "opcional" para "padrão".
5. **Envio de convite sem e-mail conectado.** Hoje o e-mail depende de Gmail/Outlook conectados pelo OAuth da suíte (credenciais `_APP`). Vale um remetente padrão da StartSe (Resend) para o convite sair mesmo sem a caixa do gestor conectada?
6. **Limiar de identidade.** O 0,7 de confiança da D6 é um chute razoável; ajustar com dez candidatos reais na primeira semana e registrar no `CLAUDE.md`.
7. **Pretensão salarial na conversa.** Perguntar pretensão numa triagem por IA pode afastar candidatos. Fica ligado por padrão quando há faixa (a faixa é dita ao candidato se ele perguntar), mas vale validar com o RH da StartSe.

## Rastreabilidade

| Pedido | Onde está |
|---|---|
| Layout profissional e moderno, app com telas | D1, US-001, US-022, Design Considerations |
| Fluxo de trabalho com link para entrevistar | D2, US-013, US-014 |
| Métricas e relatórios | D8, US-022, US-023 |
| Experiência conversacional com ElevenLabs | D3, US-016, US-017 |
| Análise agêntica para o gestor | US-019, US-020, US-021 |
| Cultura na entrevista | D7, US-003, US-015, US-019 |
| Pesquisar mais informações do candidato (Bright Data) | D4, US-010, US-011 |
| Registrar candidato pelo nome, CV opcional, IA preenche, gestor edita | US-008, US-009, US-012 |
| CV prevalece sobre a web; termo de busca quando não há CV | D5, D6, US-009, US-011 |
| Atribuir à vaga com cargo, salário, desafios | US-005, US-007, US-013 |
