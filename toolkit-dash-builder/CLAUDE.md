@AGENTS.md

## Notas específicas deste app

- **Origem.** Copiado de `pdi-time/` em 21/09/2026 seguindo o PRD em `prd/01-prd.md` (v1.1). Arquivos `[INFRA]` e `[PRODUTO]` são idênticos ao `pdi-time` e conferidos por `scripts/verificar-padrao.sh`; o domínio mora em `lib/painel.ts`, `lib/validar-painel.ts`, `lib/esclarecer.ts`, `lib/demo.ts`, `app/api/painel/**` e nos componentes `Painel`, `CartaoIndicador`, `Grafico*`, `TabelaPainel`, `ChipsArea`, `Esclarecimento`, `ConversaRefino`, `BannerObservacoes`, `ResultadoPainel`.
- **"Dados" na paleta, "Gestão" na ilustração — dois conceitos com o mesmo nome.** O segmento da paleta (`tasks/paleta-segmentos.json`) é texto livre usado só por `scripts/verificar-paleta.mjs` para exigir ΔE ≥ 10 entre segmentos; aqui é **"Dados"**, novo. O tipo `Segmento` de `lib/ilustracao.ts` (arquivo `[PRODUTO]`, comparado byte a byte) não tem "Dados", então `SetupPage` e `Hero` recebem **`segmento="Gestão"`** — segmento sem ilustração de pessoa, só o `.blob-acento`, como `agente-kanban` e `reunioes-ia`. Não acrescentar "Dados" ao tipo por causa de uma ilustração.
- **Tela única com `<main>` próprio na fase `pronto` (decisão P4 do PRD).** Nas fases `vazio`, `esclarecendo`, `carregando` e `erro` a tela é a do padrão (Hero + coluna de formulário + área de resultado). Na fase `pronto` o painel ocupa a largura inteira: o formulário recolhe para uma linha ("Pedido: … · Alterar pedido · Começar de novo") e a conversa de ajuste fica abaixo da grade. Cabe na regra de tela única sem `independente: true` — `scripts/verificar-padrao.sh` não compara `app/page.tsx` e o `financas-ia` já tem precedente.
- **Economia de texto medida:** título do hero "Seu painel pronto em trinta segundos" = 6 palavras (≤ 8); apoio "Descreva o que você quer acompanhar: a IA escolhe os indicadores do seu setor e monta o painel." = 18 palavras (≤ 20); os 5 itens da prévia têm 3/3/3/3/2 palavras (≤ 6); os `apoio` dos `Passos` têm 6/5/3 palavras; uma linha de ajuda no campo ("Quanto mais específico, melhor o painel."); benefício do cartão de IA em `/setup` em uma linha.
- **Rotas de domínio não exportam nada além dos handlers.** `lerPedido`/`MINIMO_DESCRICAO`/`MAXIMO_DESCRICAO` moram em `lib/pedido.ts` (sem `node:*`, lido também por `app/page.tsx`): o `next build` recusa um `route.ts` que exporte um símbolo que não seja handler ou configuração de rota.
- **Componentes de gráfico funcionam em Server Component** (`/r/[id]`, `/imprimir/[id]`): SVG só com geometria (`preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke`), texto em HTML, altura fixa em px, nada mede largura. A única exceção é `TabelaPainel` (`"use client"`): ela chama o `DataTable` de `ui.tsx` com funções `render`, e uma função não pode atravessar a fronteira servidor → cliente — por isso o componente inteiro é cliente e recebe só dados. Pelo mesmo motivo `ResultadoPainel` é cliente (o `Entregar` recebe `texto: () => string`) e aceita `acoes`/`antes`/`depois` como nós prontos.
- **Toda cor que precisa sair no papel é `fill`/`stroke` de SVG** (barras, barra de meta, linha, área, fatias). O Chrome não imprime fundo de `div` por padrão; `print-color-adjust: exact` na `.print-sheet` (bloco `/* Específico deste app */` de `globals.css`) é só a segunda rede. Em `modo="impressao"`, `TabelaPainel` renderiza um `<table>` simples de largura total (`.painel-tabela { grid-column: 1 / -1 }`), porque na largura do A4 o `DataTable` cai no modo cartão e pagina uma linha por página (limitação US-020 do `pdi-time`).
- **Refinamento: a IA devolve o painel inteiro; o servidor restaura o que ela mexeu sem declarar.** `validarRefinamento()` (`lib/painel.ts`) compara com `igual()` (chaves ordenadas), devolve o original de todo componente fora de `componentesAlterados` (conteúdo E posição), reinsere componentes sumidos no índice original e desfaz ids renomeados. Depois `validarPainel(..., { modo: "refinamento", moviveis })` só reposiciona os declarados/novos. `refinadoEm` é gravado no painel e o exclui do cache por hash (`lib/cache-painel.ts`).
- **Cache por hash respeita o modo:** um painel gerado em demonstração nunca é servido depois que a IA é conectada (compara `meta.demo`). "Gerar outra versão" envia `forcar: true`. Na resposta reaproveitada, `meta.insumo` ganha o sufixo "(painel reaproveitado)" e a tela mostra um `Aviso` explicando.
- **Tempo limite no cliente** (`lib/ai.ts` é `[INFRA]` e não aceita `signal`): `AbortController` de 120 s na geração, 90 s no ajuste e 45 s na análise; ao estourar, a frase "A IA demorou demais para responder. Tente de novo ou troque o modelo em Configurações.".
- **`maxTokens` por chamada:** geração 8.000 · ajuste 8.000 · observações 1.200 · esclarecimento 600. Os tokens reais de um painel gerado por IA **ainda não foram medidos** (a implementação foi verificada só em modo demonstração, sem chave do OpenRouter); ao medir, registrar aqui se 8.000 é folga ou aperto. Um painel de demonstração de 8 componentes tem ~5,5 mil caracteres de JSON (~1,7 mil tokens).
- **Gotcha do `verificar-jargao.mjs` que pegou aqui:** o link "Conectar a IA em 1 minuto" do aviso de números de exemplo (`ResultadoPainel.tsx`) precisa ser um `<a href="/setup#openrouter">` com o `href` como atributo literal — a regex de atributos técnicos só remove `href="..."`; a mesma URL numa prop `acao={{ url }}` do `Aviso` contaria como jargão.
- **Limitação conhecida dos gráficos de série:** o eixo Y começa em zero (marcas máximo, metade e zero, como o PRD pede) e valores negativos são desenhados no zero (`Math.max(v, 0)` em `GraficoSerie`/`GraficoBarras`); o valor correto continua no `title` e no texto `sr-only`. Se um painel de fluxo de caixa com mês negativo virar caso real, o ajuste é uma linha de base deslocada quando `min < 0`.
- **Sem rotina e sem formulário na v1:** `lib/rotinas-do-app.ts` tem `TIPOS_ROTINA = []`, `components/Rotinas.tsx` não existe (como no `videos-campanha`) e `app/api/f/[token]/route.ts` não importa nenhum módulo de callback. A infraestrutura (`lib/rotinas.ts`, `app/api/rotinas`, `instrumentation.ts`, `lib/formularios.ts`, `app/f`) continua copiada e ociosa.

## Dados externos (planilha)

- **A IA não escreve número quando há planilha.** Ela recebe só o perfil das colunas (`perfilDeDados()`,
  nunca as linhas) e devolve a *receita* de cada componente; `lib/agregar.ts` calcula em cima das linhas
  reais. `validarReceitas()` descarta toda receita que cite coluna inexistente ou tipo incompatível, então
  o que sobra é garantidamente calculável. Sem essa separação a IA escreveria números parecidos com os do
  usuário — plausíveis e errados, o pior defeito possível neste app.
- **Sem chave de IA o recurso não cai em demonstração.** `receitasAutomaticas()` monta o recorte pela
  tipagem das colunas; os números continuam saindo do arquivo. Cair em `painelDemo()` aqui seria mentir
  para quem acabou de mandar a própria planilha. A tela marca o recorte automático e o rodapé diz
  "Calculado do seu arquivo, sem IA".
- **`Origem` e `SeloIA` são sobrescritos em `ResultadoPainel` no recorte automático.** Os dois vêm de
  `components/ui.tsx`, arquivo `[PRODUTO]` comparado byte a byte com o `pdi-time`, e diriam "Gerado com IA"
  num painel onde nenhuma IA foi chamada. A exceção mora em `ResultadoPainel.tsx` (arquivo do app), não em
  `ui.tsx`. `scripts/verificar-padrao.sh` continua verde.
- **`DadosIndicador.anterior` virou opcional.** Planilha sem coluna de data não tem período anterior;
  `CartaoIndicador` omite a linha de comparação em vez de repetir o próprio valor (uma variação de 0% seria
  falsa). O caminho da IA segue obrigado a preencher pelo prompt, e `validarPainel` deixou de descartar o
  componente por falta de `anterior`.
- **`INSUMO_PLANILHA` mora em `lib/planilha.ts`, não em `lib/painel-dados.ts`.** Quem lê é o Client Component
  `ResultadoPainel`, e `painel-dados.ts` importa `lib/historico.ts` (`node:sqlite`) — importar de lá
  puxaria o SQLite para o bundle do navegador. Como a marca viaja no `meta.insumo` gravado com o painel,
  `/r/[id]` e `/imprimir/[id]` acertam o aviso sem reabrir o arquivo.
- **`.xlsx` não é lido de propósito.** É um zip de XML e um leitor próprio seria grande demais para o ganho,
  contra a filosofia de zero dependência de `lib/store.ts` e `lib/mcp.ts`. `detectarFormato()` reconhece o
  arquivo pelos bytes (`PK`) e devolve a frase que manda salvar como CSV.
- **Ambiguidade de `1.234`.** Com um separador só, três dígitos à direita são milhar e uma ou duas casas são
  decimal — regra que acerta `12,5` e `1.234` mas erra um `1.234` que queira dizer 1,234. É o compromisso
  certo para planilha brasileira; se aparecer caso real, a saída é decidir por coluna e não por célula.
- **Primeiro app da suíte com `npm test`.** `lib/planilha.test.ts` e `lib/agregar.test.ts` (vitest, 35 testes)
  cobrem formato de número e data, separador, aspas, tipagem e cada agregação. O resto do app segue sem teste.
