@AGENTS.md

# Precificador — notas de manutenção

## De onde o código vem, e o que pode mudar

Este app nasceu em **21/09/2026** copiando a estrutura do `pdi-time`, o app de referência da suíte
"IA para Executivos" (`StartSe/ai-action-demo`, commit **fb89753beb2495f1b9114100b691ef62e9cbbc70**),
mas vive em repositório próprio. Vale a regra de "app independente" do `PADRAO.md` de lá:

- **Camada de infraestrutura — não mexer.** `lib/ai.ts`, `lib/store.ts`, `lib/conta.ts`,
  `lib/conta-comum.ts`, `lib/modelos.ts`, `lib/setup-comum.ts`, `lib/historico.ts`, `lib/mcp.ts`,
  `lib/mcp-cliente.ts`, `lib/mcp-oauth.ts`, `lib/formularios.ts`, `lib/notificacoes.ts`,
  `lib/email-envio.ts`, `lib/rotinas.ts`, `lib/sensivel.ts`, `app/mcp/`, `app/f/`,
  `app/api/{rotinas,setup,status,conta,historico}/`, `proxy.ts`, `eslint.config.mjs`,
  `instrumentation.ts`. São idênticos ao `pdi-time` naquele commit. Melhoria nessa camada nasce lá e
  é copiada para cá, nunca o contrário.
- **Camada de produto — é deste app.** Telas, `components/ui.tsx`, `components/setup.tsx`,
  `components/conta.tsx`, `lib/navegacao.ts`, `lib/ilustracao.ts` e `app/globals.css` depois dos
  tokens de cor. Já divergem (ver "O que foi estendido"), e não precisam acompanhar o `pdi-time`.
- **Continua valendo para sempre:** `GET /api/health`, `GET /api/status` no formato da suíte,
  `/mcp`, `/f/<código>`, rotinas, conta e sessão, o verificador de jargão e o de paleta.

## O que foi estendido em `components/ui.tsx`

Três mudanças, todas porque este app tem tela de lista e de item, coisa que o `pdi-time` não tem:

- `Empty` ganhou `children` (os três exemplos prontos entram abaixo da descrição) e `ilustracao`
  virou opcional.
- `DataTable` ganhou `link?: (linha) => string`: a linha inteira leva ao destino no desktop e o
  título vira botão no cartão do celular. Copiado em espírito do `whatsapp-atendente`.
- O chip de status do `Topbar` tem duas versões de texto. Abaixo de 420px, "Modo demonstração ·
  conectar" (208px de largura) espremia a marca contra o botão de menu; a versão curta
  ("Demonstração") cabe, e o chip inteiro continua sendo o link para Configurações. Medido: o
  cabeçalho fica em 55px a 360px, dentro do teto de 56px do padrão.

## Decisões de modelagem que o PRD deixou em aberto

- **O custo-hora entra na conta em duas parcelas, nunca duas vezes.** O PRD define
  `custoHora = (fixos de serviço + pró-labore) ÷ horas produtivas` e, separadamente, um rateio de
  serviço de `tempo × (fixos de serviço ÷ horas)` — somados, contariam os fixos de serviço duas
  vezes. `lib/precificacao/rateio.ts` separa: a parte do **pró-labore** é mão de obra e entra no
  custo direto (varia com o tempo da peça); a parte dos **fixos** é absorção e entra no rateio. A
  soma das duas é exatamente o custo-hora mostrado na tela, que é o número conferido contra planilha
  no teste de aceite do épico 1.
- **A perda incide sobre insumos e mão de obra, não sobre o rateio.** Refugo consome material e
  tempo; não consome aluguel a mais.
- **O primeiro marcador do corredor é o preço de lucro zero, não o custo total.** Numa régua de
  preço, vender exatamente pelo custo ainda dá prejuízo, porque imposto e taxa saem depois. O custo
  total continua visível na cascata e no "por quê?".
- **MEI é DAS como custo fixo, alíquota zero** (decisão de 21/09/2026). Não abre caminho de cálculo
  novo: `impostoPct()` devolve 0 para MEI e o DAS entra como uma linha de `linhas_custo_fixo`, com um
  botão em Negócio que a cria já preenchida.
- **Preço por canal é independente**, não derivado de um preço-base. Canal sem preço escolhido nasce
  no preço da própria margem-alvo (`precoDoCanal` em `lib/carteira.ts`) e daí anda sozinho. É o que o
  dono faz na vida real: o preço do iFood não é o da loja mais uma porcentagem.
- **Linha `ambos` de custo fixo** é repartida por `proporcaoProdutoPct`, um campo que só aparece
  quando a capacidade é medida nos dois eixos. Nos outros modos, vai inteira para o balde do modo.
- **Presets ficam em código** (`lib/presets.ts`), não num JSON editável sem deploy: preset é texto de
  tela e precisa passar pelo lint e pelo verificador de linguagem junto com o resto.
- **Participação na carteira é fatia de faturamento por preço**, não por volume: o app não pede
  volume por item, e uma estimativa declarada é melhor que uma inventada.

## Armadilhas já pagas

- **As horas produtivas aparecem em qualquer modo de capacidade.** A primeira versão escondia o
  campo quando a capacidade era medida em unidades — e aí um produto com tempo de execução
  declarado tinha mão de obra zero, silenciosamente, porque `custoHora` divide por horas que a
  pessoa não conseguia preencher. O modo de capacidade decide quem rateia o custo **fixo**; quem
  paga a mão de obra são sempre as horas.
- **`CampoNumero` guarda o texto digitado enquanto o campo está em foco.** Sem o rascunho, digitar
  "1," reformata para "1" e come a vírgula. No blur, volta a formatar a partir do número.
  Dinheiro (`unidadeAntes`) mostra sempre as casas decimais; quantidade e percentual cortam os zeros
  à toa, senão "500 g" vira "500,000 g".
- **`lib/formularios.ts` (infra) não tem campo de ajuda em `CampoFormulario`.** A instrução do campo
  de coleta de preço entrou no próprio rótulo, em vez de editar o arquivo compartilhado.
- **A ferramenta `precificar_item` procurava o canal dentro da carteira**, que só carrega o canal
  padrão — pedir "iFood" caía silenciosamente no balcão. Agora usa `listarCanais()` e recusa um
  canal que não existe, listando os que existem.
- **A barra da cascata soma 100% mesmo no prejuízo.** A base é `max(preço, consumido)`: as quatro
  fatias de custo tomam a barra inteira e a de lucro fica sem largura, com o buraco mostrado pelo
  valor negativo. Somar a fatia negativa como largura dava 134%.
- **As telas moram em `components/<Nome>.tsx`** e `app/<rota>/page.tsx` só delega, porque
  `scripts/verificar-jargao.mjs` varre `app/page.tsx` e `components/*.tsx`, mas não as outras rotas —
  texto de tela em `app/negocio/page.tsx` escaparia da varredura de linguagem.
- **O acento nasceu errado e a régua da paleta pegou.** O primeiro candidato (`#17785b`) ficou a
  ΔE 6,9 do `whatsapp-atendente`, abaixo do mínimo 10 entre segmentos. O valor final é
  `hsl(160, 80%, 26%)` = `#0d7754`, contraste 5,55:1 contra branco, ΔE 8,6 do `financas-ia` e 18,5 do
  `custos-ia` (mínimo 6 dentro do segmento) e 10,7 do vizinho mais próximo de outro segmento.
- **`tasks/paleta-segmentos.json` guarda os 18 apps da suíte como referência**, não só o nosso.
  `scripts/verificar-paleta.mjs` foi adaptado: entrada da paleta que não está no catálogo daqui é
  vizinho, não sobra. Sem eles, a regra de ΔE não teria contra o que comparar.
- **Os testes rodam no Node 24 no CI**, enquanto a imagem de produção é Node 22: `npm test` executa
  os `.ts` direto com `node --test`, e o apagamento de tipos só é ligado por padrão a partir do 24.

## Como conferir que o recálculo não vai ao servidor

Critério de aceite do épico 5. Com o app rodando, no console do navegador, na Bancada:

```js
window.__req = 0; const of = fetch; window.fetch = (...a) => { window.__req++; return of(...a); };
const r = document.querySelector('[role="slider"]'); r.focus();
for (let i = 0; i < 20; i++) r.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
setTimeout(() => console.log(window.__req), 1500);
```

Medido em 21/09/2026: **21 ajustes → 1 requisição**, que é a gravação do preço, adiada em 500 ms
depois do último movimento. O recálculo em si não faz nenhuma.

## A conversa de abertura e a escolha de modelo (21/09/2026)

- **A conversa propõe entradas, nunca preço.** `lib/conversa.ts` coleta em linguagem de dono de
  negócio e devolve um rascunho de custos, capacidade, canais e fichas; quem vira isso em preço
  continua sendo `lib/precificacao`. O princípio "a IA não calcula" vale igual aqui — a proposta
  não tem campo de preço, margem obtida nem lucro, e o leitor não saberia ler um.
- **Nada é gravado antes de a pessoa confirmar.** A tela mostra o rascunho com os números
  editáveis; `POST /api/proposta` só roda no clique.
- **O formato da proposta é de linhas, não JSON**, pelo mesmo motivo de `lib/leitura-ia.ts`. Três
  armadilhas pagas, todas com teste:
  - **Insumo precisa nomear o item a que pertence.** O modelo lista os dois itens e só depois
    todos os insumos; sem a referência, tudo grudava no último item e o primeiro ficava sem ficha.
  - **O gabarito não pode virar dado.** Com `<lacunas>` no formato, um modelo fraco devolvia
    "negocio: <nome> | <mei…>" literalmente. O prompt passou a trazer um exemplo preenchido, e
    `ehGabarito()` descarta qualquer linha com `<`/`>`.
  - **O marcador `MENSAGEM` separa o recado do raciocínio.** Modelos gratuitos de raciocínio
    despejam o rascunho mental antes da resposta, em inglês ("We need to respond to the owner…").
    Só o que vem depois do marcador chega à bolha da conversa.
- **O modelo é escolhido por tarefa e por nível** (`lib/modelos-do-app.ts`, próprio do app —
  `lib/ai.ts` e `lib/modelos.ts` são infraestrutura). A conversa usa o modelo mais capaz do nível;
  as leituras do dia a dia usam um mais barato. O padrão é "Melhor" (Opus 5 na conversa, Sonnet 5
  nas leituras) e o seletor "Qualidade das respostas" em Configurações desce até o nível gratuito.
  Um modelo apontado à mão em `OPENROUTER_MODEL` vence o nível.
- **Medição que justificou trocar o padrão da suíte (21/09/2026).** Rodando a conversa que vira
  rascunho em cada modelo gratuito do catálogo, com uma régua de 9 pontos (campos preenchidos,
  fichas completas, sem inglês, sem gabarito): `nemotron-3-super` (o padrão do `pdi-time`) tirou
  **2/9** — devolvia o próprio gabarito; `gemma-4-31b-it`, `qwen3.8-27b`, `inkling-small`,
  `glm-5.2` e `gemma-4-26b-a4b-it` tiraram 9/9. Em consistência e tempo, `gemma-4-31b-it` ficou em
  2/2 com 62 s, contra 1/2 e 122 s do `inkling-small` — por isso ele é o gratuito do app. Opus 5,
  no mesmo teste, respondeu em **9,7 s** com o rascunho completo.
- **Sem crédito o app não para.** `askText` já manda uma lista de reserva ao OpenRouter, começando
  por um modelo gratuito: um 402 no modelo pago cai sozinho para ele.
- `permitidas`, em `app/api/setup/route.ts`, sai das próprias integrações — por isso uma chave de
  configuração nova (`OPENROUTER_NIVEL`) só precisou ser declarada como campo em
  `lib/integracoes.ts`, sem tocar em infraestrutura.

## Busca na internet na conversa (1.1.0, 21/09/2026)

- **Mora em `lib/busca.ts`, não em `lib/ai.ts`.** `askText` é infraestrutura da suíte, copiada sem
  alteração, e não aceita o campo `plugins` do OpenRouter. O módulo próprio reaproveita o que
  importa: a chave por `getConfig` e a tradução de erro de `interpretarFalha`, para uma falha de
  busca falar a mesma língua de qualquer outra falha de IA.
- **Superfície: a ferramenta de servidor `openrouter:web_search`, não o plugin.** O plugin
  `plugins: [{ id: "web" }]` e o sufixo `:online` estão deprecados na documentação (consultada em
  21/09/2026) e cobram o mesmo. A ferramenta é melhor por um motivo de custo: o plugin busca
  **sempre**, uma vez por requisição; a ferramenta deixa o modelo decidir, então conversa que não
  precisa de fato público nenhum não paga busca. `max_tool_calls` segura o excesso.
- **A ferramenta está em Beta.** É por isso que toda falha de busca cai no caminho sem busca
  (`askText` puro) em vez de derrubar a conversa.
- **Buscador: `perplexity`, e a escolha foi medida.** O mais barato é o `parallel turbo` a
  US$ 0,001 — e **não serve**, porque a documentação o descreve como "inglês e japonês", enquanto
  este app pergunta em português sobre regra brasileira. Essa foi uma escolha errada da 1.1.0,
  corrigida na 1.1.1 depois de medir a mesma pergunta nos buscadores com suporte amplo de idioma:
  perplexity (US$ 0,005) em 10 s com 9 de 10 fontes brasileiras citando o gov.br; parallel `basic`
  (US$ 0,005) em 14 s com 8, citando um blog de banco; exa `auto` (US$ 0,007) em 13 s com 9.
  Lição: **preço de tabela não decide buscador; idioma e fonte decidem.**
- **Quem decide buscar é o modelo**, pela ferramenta. O prompt proíbe usar a busca para adivinhar
  custo ou preço deste negócio — isso só o dono sabe, e é ele que deve ser perguntado.
- **`max_characters` importa mais que o preço da busca.** O custo real está nos tokens do excerto
  injetado, não nos US$ 0,005 da consulta.
- **Busca que falha não derruba a conversa.** O `catch` volta com o texto sem a linha do pedido, ou
  com uma frase pedindo o número à pessoa. Perder o valor do DAS não pode custar a conversa.
- **As fontes aparecem na tela**, lidas de `annotations[].url_citation` da resposta do OpenRouter.
  Número que veio de fora tem que poder ser conferido na origem.
- **`lib/*.ts` não pode conter o literal do endereço local** (regra de `verificar-jargao.mjs`, só
  `lib/ai.ts` é exceção): o cabeçalho de origem usa `enderecoPublico()` de `lib/setup-comum.ts`.

## Versão (1.0.0, 21/09/2026)

Mesmo desenho dos apps da suíte que já versionam: `version` no `package.json`, importado direto
(`import { version } from "@/package.json"`, com `resolveJsonModule` já ligado) e mostrado no rodapé
de Configurações (como o `simulador-vendas`), em `GET /api/health` (como a `bussola-ia`) e na
apresentação do servidor do assistente. `CHANGELOG.md` no formato "Notas de versão". A versão sobe
nos dois arquivos na mesma mudança.

## O assistente sobre a carteira (1.2.0, 21/09/2026)

- **Uma tela, dois modos.** `/comecar` abre em "abertura" quando não há item cadastrado e em
  "assistente" quando há; `GET /api/ia/conversa` responde qual é, para a tela dizer a coisa certa
  antes da primeira pergunta. A tela pode forçar o modo abertura para refazer o preenchimento.
- **O assistente não recebe a carteira no prompt.** Ele recebe as mesmas cinco ferramentas de
  `lib/ferramentas.ts` que o `/mcp` expõe e chama as que precisar. Três motivos: não há segunda
  implementação da conta (as duas passam por `lib/carteira.ts`), a resposta é sobre os números de
  agora, e uma carteira grande não precisa caber no contexto.
- **O laço de ferramentas é manual, em `lib/assistente.ts`.** `askWithTools` (`lib/ai.ts`,
  infraestrutura) não convive com a ferramenta de busca do OpenRouter, que roda no servidor deles.
  Na mesma chamada andam as duas coisas: as funções do app o app executa, a busca o OpenRouter
  executa. `lib/busca.ts:completar()` é a porta única para isso.
- **`MAX_VOLTAS` fecha o laço.** Estourando sem resposta em texto, devolve uma frase pedindo a
  pergunta de outro jeito — nunca vazio.
- **A bolha é texto puro.** A suíte não tem renderizador de markdown em lugar nenhum, então o
  prompt pede texto puro e `semMarcacao()` (testado) tira o que passar mesmo assim.
