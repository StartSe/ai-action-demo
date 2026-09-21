# PRD — `toolkit-dash-builder` ("Painel Pronto") v1.1 — refinado após validação (2026-09-21)

App número 20 da suíte **IA para Executivos** (`StartSe/ai-action-demo`). Recriação, dentro do
padrão da suíte, do produto "AI Dash Builder" gerado no Lovable.

- Análise do original: [`00-analise-projeto-original.md`](00-analise-projeto-original.md)
- Recorte de funcionalidades e core: [`02-funcionalidades-e-core.md`](02-funcionalidades-e-core.md)
- Padrão obrigatório: [`../../PADRAO.md`](../../PADRAO.md) · app de referência: [`../../pdi-time/`](../../pdi-time/) · armadilhas registradas: [`../../pdi-time/CLAUDE.md`](../../pdi-time/CLAUDE.md)
- Validação (Fase 4): [`03-validacao-prd.md`](03-validacao-prd.md) · registro do refinamento (Fase 5): [`04-refinamento-prd.md`](04-refinamento-prd.md)

| | |
|---|---|
| Id da pasta / do catálogo / da imagem | `toolkit-dash-builder` |
| Nome de exibição | **Painel Pronto** — *única decisão humana ainda pendente: confirmar com Renato antes do primeiro push* (ver P1, seção 11) |
| Áreas | Dados, Gestão |
| Porta local | **3020** (próxima livre; 3019 é `build-agentflows`) |
| Acento | `#a5540d` (segmento novo **"Dados"** na paleta; nos componentes a ilustração usa `segmento="Gestão"` — ver 8.4) |
| Capacidades na v1 | `artefato`, `mcp` |

### Histórico de revisões

| Versão | Data | O que mudou |
|---|---|---|
| v1 | 2026-09-21 | Primeira versão completa (Fase 3). |
| **v1.1** | 2026-09-21 | Refinado após a validação independente da Fase 4 ([`03-validacao-prd.md`](03-validacao-prd.md)): 3 achados bloqueantes, 5 altos, 9 médios e 4 baixos aplicados (um sub-item do achado 20 não aplicado, por estar errado — ver [`04-refinamento-prd.md`](04-refinamento-prd.md)); P1–P6 fechadas; nome de exibição trocado de "Painel em Minutos" para "Painel Pronto" (evita a família falsa com "Posts em Minutos"). A numeração das seções não mudou. |

---

## 1. Visão e problema

### O problema
Um gestor de área quer acompanhar o próprio negócio por números e não consegue. Ele não tem
analista, não vai aprender Power BI, Metabase ou Grafana, e — este é o ponto que as ferramentas de
BI ignoram — **ele nem sabe quais indicadores deveria pedir**. Perguntado "quais métricas você quer
no painel?", responde "as de vendas". A ferramenta de BI então lhe entrega uma tela em branco com
um seletor de colunas, e o projeto morre ali.

O caminho normal é: contratar um analista, esperar duas semanas por um levantamento de requisitos,
receber um protótipo que não é o que ele imaginava, e iterar por e-mail. O painel nasce meses depois
da pergunta que o motivou.

### A visão
Descrever o painel em uma frase e recebê-lo pronto em trinta segundos — com os indicadores que um
analista escolheria para aquele setor, o layout que um designer montaria e números de exemplo
plausíveis para o mercado brasileiro. Ver, ajustar conversando ("troque o gráfico de barras por
pizza", "acrescente ticket médio"), imprimir e levar para a reunião.

O produto não é um BI. É o **passo anterior ao BI**: o lugar onde se descobre, em minutos e sem
custo, qual painel a empresa precisa ter — e que serve como especificação pronta para quem for
construí-lo com dado real.

### Público
- **Primário:** executivo ou gestor de área (vendas, marketing, financeiro, operações, RH) de uma
  empresa média brasileira, sem analista de dados à disposição e sem paciência para ferramenta de BI.
- **Secundário:** consultor, gerente de projeto ou pessoa de produto que precisa mostrar rápido "o
  painel vai ser mais ou menos assim" antes de encomendar a construção.
- **Não é para:** analista de dados que já tem a base pronta e quer conectá-la (é o `financas-ia`, o
  `automl-pocket`, ou um BI de verdade).

### Proposta de valor em uma frase
**Descreva em uma frase o que você quer acompanhar e receba, em trinta segundos, um painel completo
com os indicadores certos do seu setor — pronto para ajustar conversando e imprimir.**

---

## 2. Objetivos e métricas de sucesso da v1

### Objetivos de produto
1. **Provar o conceito em dois minutos, sem nenhuma chave.** O `PADRAO.md` define o teste: o
   executivo abre, clica num chip da sua área, vê um painel completo e decide se vale conectar a IA.
2. **Entregar um painel que um analista aprovaria.** Indicadores canônicos do setor, layout coerente,
   números na escala certa, tudo em português correto.
3. **Tornar o ajuste seguro.** Pedir uma mudança nunca pode estragar o resto do painel.
4. **Fechar o ciclo.** O painel gerado é salvo, reaberto, impresso e acessível por um assistente de
   IA via MCP.

### Métricas de sucesso (medidas na verificação manual e nas duas primeiras semanas de uso)

| # | Métrica | Alvo v1 | Como medir |
|---|---|---|---|
| M1 | Tempo do primeiro painel em modo demonstração | ≤ 3 s do clique ao painel na tela | `esperar(1200)` + render; cronometrar na verificação |
| M2 | Tempo do primeiro painel com IA conectada (modelo gratuito) | ≤ 45 s no p90 | medir 10 gerações reais, 10 prompts distintos |
| M3 | Taxa de painel com **≥ 5 componentes válidos na primeira chamada** da IA | ≥ 90 % (sem precisar da segunda tentativa própria de `gerarPainel`, RF-06 a4) | em 20 gerações reais, contar as que registraram `[painel] segunda tentativa` no log do servidor |
| M4 | Painel gerado passa nas regras de composição | 100 % (≥ 5 componentes válidos depois da segunda tentativa, sem sobreposição, soma de largura por linha ≤ 4) | validador do servidor (RF-06) conserta e registra em `console.warn`; `resposta_invalida` só quando sobram menos de 3 componentes |
| M5 | Refinamento não altera componente não pedido | 100 % (a restauração do original garante) | 15 pedidos de refinamento, conferir os IDs não declarados |
| M6 | Tempo de um refinamento | ≤ 25 s no p90 | medir 10 refinamentos |
| M7 | Texto sem jargão e sem erro de acentuação | `verificar-jargao.mjs` sai 0; revisão manual de 20 painéis gerados sem erro de acento | script + leitura |
| M8 | Acessibilidade do acento | contraste ≥ 4,5:1 contra branco | `verificar-paleta.mjs` sai 0 |
| M9 | Economia de cota | prompt repetido em até 24 h não chama a IA (salvo "Gerar outra versão", que ignora o cache de propósito) | conferir no log que a segunda chamada é cache |
| M10 | App sobe e responde sem nenhuma variável de ambiente | `/api/health`, `/api/status`, `/` e uma geração completa em demonstração | build `standalone` + `curl` |

### Não-objetivos da v1
Conectar dado real; substituir uma ferramenta de BI; suportar mais de uma conta; publicar o painel
num link aberto na internet; alertar sobre variação de indicador.

---

## 3. Personas e jornadas

### Persona A — Renata, diretora comercial (persona principal)
40 anos, 18 pessoas no time, usa o CRM mas nunca abriu um relatório dele. Precisa levar números para
a reunião mensal com o CEO e hoje monta tudo à mão numa planilha na véspera. Não vai instalar nada
nem esperar por TI. Abre o app pelo link do catálogo.

### Persona B — Paulo, gerente de operações
Herdou a área e não sabe quais indicadores o antecessor acompanhava. Quer uma referência boa e
rápida do que *deveria* medir, para depois pedir à TI que construa com dado real.

### Persona C — Camila, consultora
Faz diagnóstico em PMEs. Precisa mostrar ao cliente, na própria reunião, como ficaria o painel da
operação dele. Usa o app como ferramenta de apresentação e imprime o resultado para deixar com o
cliente.

### Jornada principal (Renata, primeira visita, sem nenhuma chave configurada)

1. **Chega.** Abre o app. Cria a conta de administrador em `/conta` (nome, e-mail, senha) — 30 s.
2. **Entende em 5 segundos.** A tela mostra a promessa em uma frase, os três passos, e o campo de
   descrição já em foco, com placeholder mostrando o formato esperado. A barra superior mostra o
   chip "Modo demonstração".
3. **Escolhe o atalho.** Em vez de escrever, clica no chip **Vendas**. O campo é preenchido com um
   prompt completo e bem escrito. Ela lê e ajusta duas palavras.
4. **Gera.** Clica em "Gerar painel" (ou `Ctrl+Enter`).
5. **(Opcional) Esclarecimento.** Se o texto fosse curto ou vago, apareceria um cartão com 1 a 3
   perguntas, cada uma com 2 a 4 chips de resposta, e um botão "Pular e gerar agora". Com o prompt
   do chip, a heurística local reconhece radicais de domínio suficientes (RF-04) e o passo é pulado
   sem nenhuma chamada.
6. **Espera com contexto.** O checklist avança sozinho: "Identificando o setor do seu pedido…" →
   "Escolhendo os indicadores certos…" → "Montando os gráficos…" → "Gerando números de exemplo… com
   modelo gratuito isso pode levar até um minuto". Em demonstração são ~1,2 s; com IA, 20 a 40 s (é
   na quarta frase que a tela fica esperando, por isso ela avisa da espera longa).
7. **Vê o painel.** Quatro cartões de indicador na primeira linha (com variação contra o período
   anterior), dois gráficos na segunda, uma distribuição e uma tabela na terceira. Acima da grade,
   um aviso discreto: "Números de exemplo, para você validar o formato do painel."
8. **Ajusta conversando.** Abaixo do painel, um campo: "O que você quer mudar?". Escreve "troque o
   gráfico de barras por pizza e acrescente um indicador de ticket médio". Em ~15 s o painel volta
   com exatamente essas duas mudanças e uma frase do que foi feito. O botão "Desfazer" está ao lado.
9. **Analisa.** Clica em "Analisar" e recebe até três observações curtas sobre o painel (uma
   anomalia, uma tendência, uma sugestão), num banner dispensável.
10. **Leva embora.** O painel já foi salvo no histórico no momento da geração (RF-13, sem botão
    "Salvar", como no `pdi-time`); "Imprimir" abre `/imprimir/[id]` já formatado para A4; "Copiar
    dados da tabela" põe o CSV na área de transferência; "Gerar outra versão" pede um painel novo para
    o mesmo pedido, ignorando o cache (RF-12 a5).
11. **Volta depois.** Em `/historico` encontra o painel pelo título e reabre em `/r/[id]`.

### Jornada secundária — conectar a IA (Renata, segunda visita)
Clica em "Conectar a IA em 1 minuto" no aviso de demonstração → `/setup` → botão "Conectar a IA"
(OAuth PKCE do OpenRouter, um clique) → volta ao app com o chip de demonstração apagado. A partir
daí os painéis são gerados de verdade.

### Jornada terciária — pelo assistente (Camila)
Configura o acesso MCP em `/setup` (cartão "Usar dentro do seu assistente", botão "Copiar
configuração"), cola no Claude Desktop e pede: "crie um painel de operações logísticas para uma
transportadora e me diga quais indicadores escolheu". O assistente chama `criar_painel` e devolve o
painel; o link `/r/[id]` abre o mesmo painel no app.

---

## 4. Escopo da v1

### 4.1 Requisitos funcionais

Cada requisito tem critérios de aceite verificáveis. "Demonstração" = `aiEnabled() === false`.

---

**RF-01 — Descrever o painel**
A tela principal tem um campo de texto multilinha ("Descreva o painel que você quer acompanhar"),
com placeholder de exemplo, contador não intrusivo e botão "Gerar painel".

*Aceite:*
- a1. O campo aceita até 1.000 caracteres; acima disso o texto é cortado e um `Aviso` explica.
- a2. Enviar com menos de 10 caracteres não chama a IA: mostra "Descreva com um pouco mais de
  detalhe (pelo menos 10 letras)" e mantém o foco no campo.
- a3. `Ctrl+Enter` (e `⌘+Enter`) envia; a dica aparece ao lado do botão.
- a4. O botão fica desabilitado enquanto a geração está em andamento e o texto muda para "Gerando…".

---

**RF-02 — Chips de sugestão por área**
Oito chips acima do campo: Vendas, Financeiro, Marketing, Operações, SaaS, E-commerce, Agência, RH.
Clicar substitui o conteúdo do campo por um prompt completo daquela área e devolve o foco ao campo,
com o cursor no fim.

**Os oito textos** (constante `CHIPS_AREA` em `components/ChipsArea.tsx`; são estes, palavra por
palavra — os da origem foram descartados porque usam "Dashboard", "CAC, CPL, ROAS", "SLA",
"throughput", "MRR, churn, runway" e "headcount, turnover", tudo proibido pela seção 8.5):

| Chip | Texto (15 a 35 palavras; ≥ 4 indicadores nomeados; ≥ 3 radicais da lista de domínio) |
|---|---|
| Vendas | Painel de vendas com receita do mês, ticket médio, taxa de conversão do funil, ranking de vendedores e tendência de receita nos últimos 6 meses. |
| Financeiro | Painel financeiro com receita, despesas, margem líquida, fluxo de caixa mensal e distribuição de gastos por categoria. |
| Marketing | Painel de marketing com custo por lead, custo de aquisição de cliente, retorno sobre anúncios, tráfego por canal nos últimos 6 meses e ranking de campanhas por conversão. |
| Operações | Painel de operações com nível de serviço cumprido, tempo médio de atendimento, chamados resolvidos por dia, satisfação (NPS) e distribuição de chamados por tipo. |
| SaaS | Painel de assinaturas com receita recorrente mensal, cancelamento, novos clientes, expansão de receita, meses de caixa e crescimento nos últimos 6 meses. |
| E-commerce | Painel de loja virtual com receita, ticket médio, taxa de conversão, produtos mais vendidos, vendas por estado e tendência de vendas dia a dia. |
| Agência | Painel de agência com receita por cliente, horas faturadas, ocupação da equipe, projetos em andamento e ranking de clientes por receita. |
| RH | Painel de pessoas com número de colaboradores, rotatividade, satisfação interna, distribuição por área, contratações e desligamentos e tempo médio de contratação. |

*Aceite:*
- a1. Os oito prompts são exatamente os da tabela acima: têm entre 15 e 35 palavras e citam ao
  menos 4 indicadores nomeados (verificável lendo a tabela).
- a2. Clicar num chip nunca dispara a geração sozinho.
- a3. Nenhum chip usa jargão proibido por `verificar-jargao.mjs` nem sigla fora de NPS (seção 8.5).
- a4. Os oito textos devolvem `false` em `precisaEsclarecerLocal()` (RF-04 a8): nenhum chip passa
  pelo gate de esclarecimento.

---

**RF-03 — Atalhos de demonstração**
`?exemplo=1` preenche com o prompt do chip **Vendas** (RF-02) e envia sozinho; `?captura=1` desliga
a rolagem automática até o resultado. É este fluxo que `.github/workflows/publicar.yml` fotografa
(`/?exemplo=1&captura=1`, Chrome headless, 1200×800, `--virtual-time-budget=8000`) para a prévia do
catálogo público — por isso ele tem de ser **determinístico**: a mesma imagem a cada build.

*Aceite:*
- a1. `/?exemplo=1` abre, preenche e mostra o painel sem nenhum clique.
- a2. O efeito marca um `useRef` antes de agendar o `setTimeout(…, 0)` e **não** registra
  `clearTimeout` no cleanup (`PADRAO.md:30`: em `next dev`, o Strict Mode mataria o atalho).
- a3. `/?exemplo=1&captura=1` não rola a página.
- a4. `?exemplo=1` **não** chama `POST /api/painel/esclarecer`: vai direto para `POST /api/painel`
  (o gate nunca pode abrir um questionário na prévia do catálogo).
- a5. Determinismo da captura: em modo demonstração (o contêiner de captura sobe sem chave e com
  `CONTA_DESLIGADA=1`), o prompt de Vendas cai sempre no painel `vendas` de `lib/demo.ts` (7.4), a
  espera é fixa (`esperar(1200)`), o `Loading` respeita `--force-prefers-reduced-motion` (fica na
  primeira etapa) e nenhuma animação além do `reveal` roda. Resultado: a imagem mostra o painel
  comercial completo, com o aviso de números de exemplo, dentro dos 8 s de orçamento do Chrome.

---

**RF-04 — Gate de esclarecimento**
Antes de gerar, o servidor decide se o pedido precisa de esclarecimento. Primeiro a heurística local
(sem IA, por **radicais distintos** com fronteira de palavra — seção 6.3); só no caso duvidoso a IA
é consultada, e é ela quem decide se pergunta.

*Aceite:*
- a1. Prompt com menos de 30 caracteres **ou** com menos de 3 radicais distintos da lista de domínio
  vai para **avaliação**: a IA é consultada e decide se pergunta (pode responder
  `precisaEsclarecer: false`); em demonstração, as perguntas fixas de `esclarecimentoDemo()`.
- a2. Prompt com 3 ou mais radicais distintos da lista de domínio nunca vai para esclarecimento
  (nenhuma chamada de IA é feita nesse passo).
- a3. Quando há perguntas, a resposta é `{ precisaEsclarecer: true, perguntas: [...] }` com 1 a 3
  perguntas, cada uma com 2 a 4 sugestões.
- a4. A tela mostra as perguntas com as sugestões como chips clicáveis e um campo livre por pergunta.
- a5. Existe sempre o botão **"Pular e gerar agora"**, que gera com o prompt original.
- a6. As respostas escolhidas são concatenadas ao prompt no formato
  `\n\nDetalhes adicionais:\n- <pergunta>: <resposta>`.
- a7. Em demonstração, o gate usa apenas a heurística local e um conjunto fixo de perguntas de
  exemplo (nunca fica indisponível).
- a8. Os oito prompts dos chips (RF-02) devolvem `false` em `precisaEsclarecerLocal()`; "painel de
  vendas para minha empresa" (35 caracteres, mas só **1** radical distinto: `vend`) e "plano de RH"
  (< 30 caracteres; e `ano` dentro de "plano" **não** conta, porque a comparação é por palavra
  inteira) devolvem `true`. Teste escrito na Etapa 7.

---

**RF-05 — Geração do painel**
`POST /api/painel` recebe o pedido e devolve a especificação completa do painel.

*Aceite:*
- a1. Sem chave de IA: espera de 900 a 1.500 ms e devolve um dos painéis de `lib/demo.ts`, escolhido
  por palavra-chave do prompt, com `meta.demo === true`.
- a2. Com chave: chama `askJSON<EspecPainel>` com o system prompt da seção 6.1 e
  `maxTokens: 8000`; se o validador (RF-06) deixar menos de 5 componentes, `gerarPainel` faz **uma
  segunda chamada própria** (RF-06 a4) antes de desistir.
- a3. A resposta sempre traz `{ demo, painel, meta, id, reaproveitado }` (`id` sempre presente: o
  painel é salvo na geração, RF-13 a1; `reaproveitado: true` quando veio do cache, RF-12).
- a4. Falha de IA volta por `respostaErro(err)` com mensagem em português e sem detalhe técnico.
- a5. A tela de erro mostra o pedido original do usuário em itálico (`<p className="italic
  text-muted">` **acima** do `ErrorBox`, que não tem slot para isso) e o botão **"Tentar de novo"**
  do próprio `ErrorBox` (`onTentarNovamente`; o rótulo é fixo em `components/ui.tsx:423`).
- a6. O cliente envia com `AbortController` e limite de **120 s**; ao estourar, mostra `ErrorBox` com
  "A IA demorou demais para responder. Tente de novo ou troque o modelo em Configurações." e o botão
  de tentar de novo (`lib/ai.ts` é `[INFRA]` e não tem `signal`; o limite fica no cliente).
- a7. O corpo aceita `forcar?: boolean`: com `true`, o cache (RF-12) é ignorado e a IA é chamada de
  novo — é o que o botão "Gerar outra versão" envia.

---

**RF-06 — Validação e reparo da especificação**
A especificação devolvida pela IA passa por um validador no servidor antes de chegar à tela.

*Aceite:*
- a1. Componentes com `tipo` desconhecido são descartados.
- a2. Componentes sem os campos obrigatórios do seu tipo são descartados.
- a3. Sobra mais de 8 componentes → mantém os 8 primeiros por ordem de posição.
- a4. Sobra menos de **5** componentes válidos → `gerarPainel` chama `askJSON` **uma segunda vez**,
  com o prompt do usuário acrescido de `\n\nA resposta anterior veio incompleta ou fora do formato.
  Devolva um painel completo, com 5 a 8 componentes válidos.` e registra `[painel] segunda tentativa`
  no log; se depois da segunda validação ainda sobrarem menos de **3**, lança
  `new ErroIA("resposta_invalida", "A IA devolveu uma resposta que não deu para usar. Tente de novo
  ou descreva o painel de outro jeito.", 502)`. Essa segunda tentativa é **do `gerarPainel`**, não
  do `askJSON`: o `askJSON` de `lib/ai.ts` só repete quando o JSON não faz *parse*; um JSON válido
  com 2 componentes volta na primeira chamada e o validador não tem a quem pedir de novo.
- a5. IDs duplicados ou ausentes são reatribuídos como `c1`, `c2`, … na ordem de posição.
- a6. Posições sobrepostas ou com soma de largura > 4 numa linha são reempacotadas da esquerda para
  a direita, mantendo a ordem original. Quando a linha não tem espaço, o validador **acrescenta uma
  linha** (nunca descarta por falta de espaço; o limite de 4 linhas é alvo do prompt, não regra do
  validador). Na **geração** o reempacotamento vale para todos os componentes; no **refinamento**
  (RF-09 a6) só move os componentes cujo id está em `componentesAlterados` ou que são novos — os
  demais mantêm a `posicao` do original (senão o validador viraria uma fonte de mudança não pedida).
- a7. Séries com mais de 12 pontos são cortadas em 12; distribuições com mais de **6** fatias têm o
  excedente agrupado numa fatia "Outros" (somando os valores); tabelas com mais de 10 linhas, em 10,
  e com mais de 6 colunas, em 6.
- a8. O validador nunca lança: ele conserta ou descarta, e registra o que fez com `console.warn`.

---

**RF-07 — Tela de carregamento com etapas**
Durante a geração, o `Loading({ etapas })` de `components/ui.tsx` mostra o checklist avançando.

*Aceite:*
- a1. Quatro etapas, avançando por tempo decorrido (1.200 ms cada, o intervalo do `Loading`):
  "Identificando o setor do seu pedido…" · "Escolhendo os indicadores certos…" · "Montando os
  gráficos…" · "Gerando números de exemplo… com modelo gratuito isso pode levar até um minuto".
- a2. O texto do pedido continua visível durante a espera.
- a3. Em demonstração, o checklist não pisca nem "pula" (a espera de 1,2 s cobre a primeira etapa).
- a4. A **quarta** frase é a de espera longa, porque o intervalo do `Loading` para em 3,6 s e é nela
  que a tela fica com IA de verdade (20 a 60 s). A **primeira** frase faz sentido sozinha: com
  `prefers-reduced-motion` o `Loading` não avança (`ui.tsx:345`) e a captura do catálogo roda com
  `--force-prefers-reduced-motion`.

---

**RF-08 — Renderização do painel em grade**
Grade responsiva de 4 colunas (desktop), 2 (tablet) e 1 (celular), com os componentes ordenados por
`posicao.linha` e depois `posicao.coluna`.

*Aceite:*
- a1. Os **sete tipos** renderizam por **seis renderizadores**: `indicador`, `linha`/`area`, `barra`,
  `pizza`/`rosca` (duas apresentações da mesma distribuição), `tabela`.
- a2. Nenhum gráfico usa biblioteca externa.
- a3. A cor das séries vem de `--color-accent` (e `--color-accent-2` para a segunda série ou para o
  destaque); nenhuma cor é escrita à mão no JSX além dos cinzas já tokenizados.
- a4. No celular, tudo vira uma coluna e nenhum rótulo é cortado sem `title`.
- a5. Não há rolagem horizontal da página em nenhuma largura de 320 px para cima.
- a6. `indicador` mostra o valor formatado em `pt-BR`, a variação percentual contra `anterior` com
  sinal e cor (`ok`/`danger`/`neutro`) e, se houver `meta`, uma barra de progresso.
- a7. Coluna de tabela com `tipo: "data"`: valor que casa `/^\d{4}-\d{2}-\d{2}$/` é formatado por
  `data(new Date(\`${valor}T00:00:00\`))` (hora local; `new Date("AAAA-MM-DD")` é meia-noite UTC e
  no Brasil mostra o dia anterior — armadilha US-070 do `CLAUDE.md` do `pdi-time`); valor que não
  casa é exibido como texto.

---

**RF-09 — Refinamento por conversa**
`POST /api/painel/refinar` recebe o painel atual e um pedido em texto, e devolve o painel atualizado,
uma mensagem curta e a lista dos componentes alterados.

*Aceite:*
- a1. Todo componente cujo id **não** está em `componentesAlterados` volta idêntico ao original —
  **inclusive a `posicao`** e o índice na lista —, mesmo que a IA o tenha alterado (restauração pelo
  validador anti-deriva, 6.2).
- a2. Componentes com id novo (não existente no original) são aceitos como acréscimo — **salvo** se
  forem iguais (ignorando `id` e `posicao`) a um componente original que sumiu: nesse caso é um id
  renomeado pela IA e o original é devolvido no lugar (sem duplicar conteúdo).
- a3. Um componente removido pela IA só some se seu id estiver em `componentesAlterados`.
- a4. A resposta traz `mensagem` (uma frase, em português) exibida na conversa.
- a5. Se a IA devolver `{ esclarecimento: "..." }`, a pergunta aparece na conversa e o painel não
  muda.
- a6. O painel resultante passa pelo mesmo validador do RF-06, em modo refinamento: o
  reempacotamento só move componentes declarados ou novos (RF-06 a6).
- a7. Em demonstração, o refinamento aplica uma transformação determinística de exemplo e explica que
  é exemplo.
- a8. O histórico da conversa mostra o que foi pedido e o que foi feito, em ordem.
- a9. O cliente envia com `AbortController` e limite de **90 s**; ao estourar, a mensagem de
  demora do RF-05 a6 aparece na conversa e o painel não muda.
- a10. A chamada usa `maxTokens: 8000` (o refinamento devolve o painel inteiro; com o padrão de 4.000
  de `askText` o JSON truncaria e `askJSON` queimaria duas chamadas por pedido).

---

**RF-10 — Desfazer**
Botão "Desfazer" ao lado da conversa, restaurando o painel anterior ao último refinamento.

*Aceite:*
- a1. Pilha em memória no cliente com os 5 últimos estados.
- a2. Desabilitado quando a pilha está vazia.
- a3. Desfazer não chama a IA.
- a4. Desfazer **persiste** o estado restaurado no painel salvo: `PUT /api/painel/[id]` com
  `{ painel }` (sem IA; passa por `validarPainel` e chama `atualizarSaida`). Sem isso, "Imprimir" e
  `/r/[id]` mostrariam a versão refinada, diferente da que está na tela.

---

**RF-11 — Observações do painel (insights)**
Botão "Analisar" acima do painel. `POST /api/painel/observacoes` recebe a especificação e devolve até
3 observações.

*Aceite:*
- a1. Nunca é chamado automaticamente após a geração.
- a2. Cada observação tem `tipo` (`anomalia` | `tendencia` | `sugestao`), `mensagem` (1 a 2 frases,
  em português, citando o nome do indicador e o número) e é exibida num banner dispensável.
- a3. O banner some ao ser fechado e não volta até a próxima análise.
- a4. As mensagens se referem ao painel ("no exemplo gerado…"), nunca afirmam fatos sobre a empresa.
- a5. Em demonstração, devolve três observações de exemplo coerentes com o painel mostrado.
- a6. A chamada usa `maxTokens: 1200`; o cliente envia com `AbortController` e limite de **45 s**
  (ao estourar, a mensagem de demora do RF-05 a6 no lugar do banner).

---

**RF-12 — Cache por hash do pedido**
O pedido final (prompt + esclarecimentos), normalizado, vira um hash SHA-256. Se existir um painel
salvo com o mesmo hash há menos de 24 h, ele é reaproveitado sem chamar a IA.

*Aceite:*
- a1. Normalização: `trim()`, minúsculas, espaços múltiplos colapsados.
- a2. A resposta de um acerto de cache traz `meta.insumo` indicando reaproveitamento e o mesmo
  `demo` do painel original.
- a3. Um pedido com 24 h e 1 min de idade não é reaproveitado.
- a4. O cache nunca atravessa o modo: painel gerado em demonstração não é servido depois que a IA é
  conectada, e vice-versa.
- a5. O botão **"Gerar outra versão"** (visível no estado `pronto`) envia `forcar: true` e ignora o
  cache — quem não gostou do painel recebe outro, e o apresentador consegue mostrar variação.
- a6. Um painel **refinado não serve de cache**: `refinarPainel` grava `saida.refinadoEm = <ISO>`
  (campo opcional de `EspecPainel` que a IA nunca preenche — mesmo padrão de `PDI.acompanhamento`,
  US-070 do `CLAUDE.md` do `pdi-time`) e `lib/cache-painel.ts` ignora resultados com `refinadoEm`.
  Sem isso, `atualizarSaida` sobrescreve só a `saida` e o pedido idêntico seguinte receberia o painel
  já mutilado por refinamentos de outra sessão como se fosse a geração original.

---

**RF-13 — Salvar, listar, reabrir e apagar**
O painel é salvo em `lib/historico.ts` com `tipo: "painel"`, **sempre na geração** (como o
`pdi-time` com `SENSIVEL = false`: `idSalvo` sem opt-in). Não existe botão "Salvar" na tela; o
parâmetro `guardar` existe **só** na ferramenta MCP `criar_painel` (padrão `true`).

*Aceite:*
- a1. `POST /api/painel` salva sempre e devolve `id` na resposta; `Entregar` recebe o `id` desde a
  geração ("Copiar link" e "Imprimir" disponíveis de imediato).
- a2. Cada refinamento bem-sucedido de um painel salvo chama `atualizarSaida(id, painel)` com
  `painel.refinadoEm` preenchido (RF-12 a6); Desfazer persiste por `PUT /api/painel/[id]` (RF-10 a4).
- a3. `/historico` lista os painéis com título e data, com filtro por texto no cliente.
- a4. `/r/[id]` abre o painel salvo em página própria; id inexistente cai em `not-found`.
- a5. "Apagar tudo" pede confirmação por `useConfirmacao()` (nunca `window.confirm`, salvo a exceção
  já registrada no padrão).

---

**RF-14 — Imprimir**
`/imprimir/[id]` renderiza o painel formatado para A4, sem a barra superior nem os controles.

*Aceite:*
- a1. Abre já com o diálogo de impressão (`ImprimirAoCarregar.tsx`).
- a2. Todos os componentes aparecem, inclusive os gráficos. Toda barra pintada (barras de
  `GraficoBarras`, barra de meta do `CartaoIndicador`) é um `<rect>` em SVG com `fill`, nunca um
  `div` com `bg-accent`: o Chrome não imprime cor de fundo por padrão e um `div` sairia em branco no
  PDF; `fill`/`stroke` de SVG imprimem. Por segurança adicional, o bloco de impressão de
  `globals.css` liga `print-color-adjust: exact` na `.print-sheet` (7.8). Nada depende de `canvas`.
- a3. O aviso de "números de exemplo" aparece no rodapé impresso.
- a4. Em `modo="impressao"`, `TabelaPainel` **não** usa o `DataTable` (que na largura útil do A4 cai
  no modo cartão e pagina uma linha por página — limitação US-020 do `CLAUDE.md` do `pdi-time`):
  renderiza um `<table>` HTML próprio e simples, ocupando a **linha inteira** da grade de impressão
  (`grid-column: 1 / -1`), com as 10 linhas no máximo.
- a5. No PDF gerado pelo Chrome com as opções padrão (sem "Gráficos de fundo" marcado), barras,
  fatias, linha e barra de meta estão visíveis e a tabela cabe em uma página.

---

**RF-15 — Copiar os dados**
Botão "Copiar dados da tabela" em cada componente do tipo `tabela` e "Copiar números do painel" no
topo, ambos usando `navigator.clipboard`, sem dependência nova.

*Aceite:*
- a1. O conteúdo copiado é CSV com separador `;` e decimal com vírgula (Excel em português).
- a2. Confirmação por `Aviso`, nunca por `window.alert`.

---

**RF-16 — Modo demonstração**
Tudo funciona sem nenhuma chave.

*Aceite:*
- a1. `/api/status` devolve `demo: true` e a `Topbar` mostra o chip clicável de demonstração.
- a2. A `Topbar` recebe `resumo="Painel de exemplo, sem usar IA. Conecte a IA para gerar a partir do
  seu pedido."` e o popover do chip de demonstração mostra essa frase e o link "Conectar a IA em 1
  minuto" (`ui.tsx:115-123`). Não existe componente `DemoNotice` em `components/ui.tsx` — o
  `PADRAO.md:25,28` ainda cita o nome, mas está desatualizado nesse ponto; não criar um.
- a3. `SeloIA` mostra "Exemplo, sem usar IA".
- a4. Os quatro painéis de exemplo têm a mesma forma da resposta real (mesma quantidade de
  componentes, mesmos formatos) — a tela não sabe em qual modo está.

---

**RF-17 — Configuração em `/setup`**
`lib/integracoes.ts` declara **somente** o OpenRouter.

*Aceite:*
- a1. `INTEGRACOES = [openrouter({ beneficio: "..." })]`.
- a2. Botão "Conectar a IA" (OAuth PKCE) funciona e grava a chave cifrada.
- a3. `POST /api/setup/testar` com chave falsa devolve `ok:false` com mensagem clara.
- a4. A tela também traz o cartão "Usar dentro do seu assistente" (`components/AcessoMCP.tsx`).

---

**RF-18 — Acesso por assistente (MCP)**
`POST /mcp` expõe quatro ferramentas.

*Aceite:*
- a1. `criar_painel({ descricao, esclarecimentos?, guardar? })` → mesma função da rota HTTP;
  `guardar` vale `true` por padrão e é o único lugar onde existe.
- a2. `refinar_painel({ id, pedido })` → refina um painel salvo e grava o resultado (com
  `refinadoEm`).
- a3. `listar_paineis({ limite? })` → títulos, datas e ids, **filtrando `tipo === "painel"`**
  (`listar()` de `historico.ts` devolve todos os tipos).
- a4. `obter_painel({ id })` → a especificação completa e o link `/r/[id]`.
- a5. Nenhuma delas duplica prompt ou lógica: todas chamam as funções de `lib/painel.ts`.

---

**RF-19 — Conta, sessão e rotas privadas**
Vem do padrão, sem alteração.

*Aceite:*
- a1. Primeira visita cai em `/conta`; visitas seguintes, em `/entrar?next=…`.
- a2. Toda rota nova de domínio nasce **privada** (nenhuma entra na lista pública do `proxy.ts`).
- a3. Sem sessão, `/api/**` responde 401 com `{ error, codigo: "sem_sessao" }` e a tela navega para
  `/entrar`.

---

**RF-20 — Idioma e economia de texto**
*Aceite:*
- a1. `node scripts/verificar-jargao.mjs toolkit-dash-builder` sai com código 0.
- a2. Título do hero ≤ 8 palavras; frase de apoio ≤ 20 palavras; lista de prévia ≤ 5 itens de ≤ 6
  palavras; no máximo uma linha de ajuda por campo.
- a3. Nenhum texto visível usa "dashboard", "KPI", "componente", "spec", "layout" ou "mock".
- a4. Textos fixos da tela: botão de erro "Tentar de novo" (rótulo do `ErrorBox`), botão "Gerar outra
  versão", frase de demora "A IA demorou demais para responder. Tente de novo ou troque o modelo em
  Configurações.", `resumo` da `Topbar` do RF-16 a2.

### 4.2 Fora de escopo na v1
Fonte de dados real (CSV, planilha, CRM, webhook); binding assistido; alertas por indicador;
rotinas agendadas; formulário público `/f/<token>`; link público sem sessão; arrastar componentes;
troca de tipo por botão; metas configuradas por popover; exportação para Excel por biblioteca;
múltiplas contas; temas; mais de um painel aberto ao mesmo tempo; `goal_chart`.

---

## 5. Especificação do painel

Arquivo: `lib/types.ts`. Nomes em português, porque os mesmos nomes aparecem nos prompts e nos
esquemas das ferramentas MCP — manter um vocabulário só reduz erro do modelo e mantém o app dentro
da regra de idioma da suíte.

### 5.1 Tipos

```ts
// lib/types.ts — tipos do domínio de toolkit-dash-builder.
// Nenhum import node:*: este arquivo é lido também pelo client component app/page.tsx.

/**
 * Os SETE tipos de componente que a IA pode gerar. Não existe outro.
 * "pizza" e "rosca" são duas apresentações da mesma distribuição (mesmo `dados`, mesmo renderizador).
 */
export type TipoComponente = "indicador" | "linha" | "area" | "barra" | "pizza" | "rosca" | "tabela";

/** Como um número é escrito na tela. */
export type Formato = "moeda" | "numero" | "percentual";

/**
 * Posição na grade de 4 colunas.
 * linha: 0, 1, 2 ou 3. coluna: 0 a 3. largura: 1 a 4.
 * Invariante: em cada linha, a soma das larguras é no máximo 4 e nenhum intervalo se sobrepõe.
 */
export interface Posicao {
  linha: number;
  coluna: number;
  largura: 1 | 2 | 3 | 4;
}

/** indicador — um número grande com comparação e, opcionalmente, meta. */
export interface DadosIndicador {
  valor: number;
  anterior: number;
  formato: Formato;
  /** Só para formato "moeda". Sempre "R$" nesta versão. */
  prefixo?: string;
  /** Quando presente, o cartão mostra uma barra de progresso de valor sobre meta. */
  meta?: number;
  /** "aumentar" (padrão) ou "diminuir": define se uma variação positiva é boa (verde) ou ruim (vermelho). */
  direcaoBoa?: "aumentar" | "diminuir";
}

/** Um ponto de uma série: o rótulo do eixo X e o valor do eixo Y. */
export interface Ponto {
  rotulo: string;
  valor: number;
}

/** linha, area e barra — uma série de 4 a 12 pontos. */
export interface DadosSerie {
  /** Nome do eixo horizontal, para a legenda (ex.: "Mês", "Vendedor"). */
  eixoX: string;
  /** Nome do eixo vertical (ex.: "Receita"). */
  eixoY: string;
  formato: Formato;
  prefixo?: string;
  /** Só para "barra". "vertical" para comparação simples, "horizontal" para ranking com nomes longos. */
  orientacao?: "vertical" | "horizontal";
  pontos: Ponto[];
}

/** pizza e rosca — 3 a 6 fatias (o validador agrupa o excedente em "Outros"). */
export interface DadosDistribuicao {
  formato: Formato;
  prefixo?: string;
  fatias: Ponto[];
}

export interface ColunaTabela {
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "moeda" | "percentual" | "data";
}

/** tabela — 3 a 6 colunas, 3 a 10 linhas. */
export interface DadosTabela {
  colunas: ColunaTabela[];
  linhas: Array<Record<string, string | number>>;
}

interface Base {
  /** "c1", "c2", ... Único dentro do painel e estável entre refinamentos. */
  id: string;
  /** Até 40 caracteres, em português, sem sigla solta. */
  titulo: string;
  posicao: Posicao;
}

/**
 * União discriminada por `tipo`: um único campo `dados` por componente.
 * (A origem tinha `config` e `mockData` duplicados, com fallback `mockData?.data ?? config?.data ?? []`.)
 */
export type ComponentePainel =
  | (Base & { tipo: "indicador"; dados: DadosIndicador })
  | (Base & { tipo: "linha" | "area" | "barra"; dados: DadosSerie })
  | (Base & { tipo: "pizza" | "rosca"; dados: DadosDistribuicao })
  | (Base & { tipo: "tabela"; dados: DadosTabela });

export interface EspecPainel {
  /** Até 60 caracteres, em português. */
  titulo: string;
  /** Uma frase explicando o que o painel acompanha, até 25 palavras. */
  resumo: string;
  /** Setor identificado pela IA, usado no rodapé e no histórico. */
  setor: string;
  /** 5 a 8 componentes. */
  componentes: ComponentePainel[];
  /**
   * Data ISO do último refinamento. Preenchido SÓ por `refinarPainel()` (nunca pela IA, que não
   * conhece o campo) e gravado junto com a `saida` por `atualizarSaida`. Um painel com `refinadoEm`
   * é excluído do cache por hash (RF-12 a6): `atualizarSaida` sobrescreve só a `saida`, então sem
   * esta marca um pedido idêntico receberia o painel já refinado como se fosse a geração original.
   * Mesmo padrão de `PDI.acompanhamento` (US-070 do CLAUDE.md do pdi-time).
   */
  refinadoEm?: string;
}

/** O pedido do usuário, guardado como `entrada` no histórico. */
export interface PedidoPainel {
  descricao: string;
  /** Respostas do gate de esclarecimento: pergunta -> resposta. */
  esclarecimentos?: Record<string, string>;
  /** SHA-256 do pedido normalizado, para o cache (RF-12). */
  hash?: string;
}

export interface PerguntaEsclarecimento {
  id: string;
  pergunta: string;
  /** 2 a 4 respostas sugeridas, mostradas como chips. */
  sugestoes: string[];
}

export interface RespostaEsclarecimento {
  precisaEsclarecer: boolean;
  perguntas: PerguntaEsclarecimento[];
}

export interface RespostaRefinamento {
  painel: EspecPainel;
  /** Uma frase sobre o que foi feito. */
  mensagem: string;
  /** Ids alterados, removidos ou acrescentados (o id do componente novo, como o prompt exige). */
  componentesAlterados: string[];
}

export type TipoObservacao = "anomalia" | "tendencia" | "sugestao";

export interface Observacao {
  tipo: TipoObservacao;
  mensagem: string;
}

/** Uma fala da conversa de refinamento (só no cliente; não é persistida na v1). */
export interface Fala {
  autor: "voce" | "ia";
  texto: string;
  em: string;
}
```

### 5.2 Regras de posição e grade

- A grade tem **4 colunas** no desktop (`lg`), 2 no tablet (`md`) e 1 no celular.
- `largura` vira classe por um **mapa estático** — no Tailwind 4 só entra no CSS a classe escrita
  literalmente no código; `` `lg:col-span-${n}` `` não gera nada:

  ```ts
  export const LARGURA_CLASSE: Record<1 | 2 | 3 | 4, string> = {
    1: "lg:col-span-1 md:col-span-1",
    2: "lg:col-span-2 md:col-span-2",
    3: "lg:col-span-3 md:col-span-2",
    4: "lg:col-span-4 md:col-span-2",
  };
  ```
  (largura 3 e 4 viram 2 no tablet.)
- Ordenação de render: `linha` crescente, depois `coluna` crescente.
- Em cada linha, a soma das larguras é no máximo 4; intervalos `[coluna, coluna+largura)` não se
  sobrepõem. O validador (RF-06) reempacota o que vier errado, da esquerda para a direita.
- Layout canônico que o prompt pede (e que o validador preserva quando já está correto):

  | Linha | Conteúdo | Larguras |
  |---|---|---|
  | 0 | 3 ou 4 `indicador` | 1 cada |
  | 1 | 1 gráfico de tendência (`linha` ou `area`) + 1 comparativo (`barra`) | 2 + 2 |
  | 2 | 1 distribuição (`pizza` ou `rosca`) + 1 `tabela` (opcional) | 2 + 2, ou tabela sozinha com 4 |

- **4 linhas** (0 a 3) é o **alvo do prompt**, não uma regra do validador: componente com `linha > 3`
  é movido para a última linha com espaço e, se nenhuma tiver espaço, o validador **acrescenta uma
  linha** ao fim (nunca descarta um componente válido por falta de lugar).

### 5.3 Limites

| Coisa | Mínimo | Máximo | Motivo |
|---|---|---|---|
| Componentes por painel | 5 | 8 | Legibilidade e tamanho da resposta da IA |
| Indicadores na linha 0 | 3 | 4 | Layout canônico |
| Pontos de uma série | 4 | 12 | 12 meses é o caso mais longo útil; acima disso o rótulo não cabe no celular |
| Fatias de uma distribuição | 3 | 6 | Fatias se diferenciam só por opacidade do acento; com 8, os degraus ficam em ~8,6 pontos e fatias vizinhas se confundem (e somem no preto e branco). Com 6, degraus de 12 pontos. O validador agrupa o excedente em "Outros" |
| Linhas de tabela | 3 | 10 | Impressão em A4 (limitação conhecida do `DataTable`) |
| Colunas de tabela | 3 | 6 | Celular |
| Título do painel | — | 60 caracteres | Cabe na `ResultHead` e no histórico |
| Título de componente | — | 40 caracteres | Cabe no cabeçalho do cartão sem truncar no celular |
| Resumo do painel | — | 25 palavras | Regra de economia de texto do `PADRAO.md` |
| Descrição do pedido | 10 | 1.000 caracteres | Evita prompt vazio e prompt gigante |
| `maxTokens` da geração | — | 8.000 | Um painel de 8 componentes com séries de 12 pontos e tabela de 10×6 cabe em ~6 mil (estimativa generosa: o painel canônico tem ~1.500; medir na Etapa 5 e registrar no `CLAUDE.md`) |
| `maxTokens` do refinamento | — | 8.000 | Devolve o painel inteiro; com o padrão de 4.000 de `askText` o JSON truncaria |
| `maxTokens` das observações | — | 1.200 | Três frases curtas em JSON |
| `maxTokens` do esclarecimento | — | 600 | Até 3 perguntas com 4 sugestões |
| Tempo limite no cliente (`AbortController`) | — | 120 s geração · 90 s refinamento · 45 s observações | `lib/ai.ts` é `[INFRA]` e não aceita `signal`; sem limite uma chamada travada no modelo gratuito deixaria o `Loading` parado para sempre |

### 5.4 O que foi resolvido em relação à origem

1. **`config` e `mockData` viraram `dados`.** Um campo só por componente, tipado pela união
   discriminada. Some o fallback `mockData?.data ?? config?.data ?? []`.
2. **`goal_chart` foi removido.** A necessidade ("meta contra realizado") é atendida pelo campo
   opcional `meta` de `DadosIndicador`, renderizado como barra de progresso. Um tipo a menos para a
   IA errar, e o formato incompatível da origem deixa de existir.
3. **Séries deixaram de ser `Array<Record<string, number|string>>` com nomes de eixo dinâmicos.**
   Agora são `Ponto[]` com `rotulo`/`valor` fixos, e os nomes dos eixos ficam em `eixoX`/`eixoY`.
   Isso elimina a classe inteira de erro em que a IA nomeia a chave do objeto de um jeito no `config`
   e de outro no dado.
4. **`format`/`prefix` subiram para todos os tipos**, não só o indicador: o gráfico também precisa
   saber escrever "R$ 1,2 mi" no eixo.
5. **Acrescentado `direcaoBoa`** ao indicador: sem isso, "churn caiu 3 %" aparece em vermelho.
6. **Acrescentados `resumo` e `setor`** ao painel: alimentam o `resumo` do histórico e a proveniência
   na tela, sem uma segunda chamada de IA.

---

## 6. Prompts

Os quatro prompts abaixo são a parte mais valiosa do produto: é neles que mora o "analista
embutido". Todos moram em `lib/painel.ts` (geração, refinamento, observações) e
`lib/esclarecer.ts` (gate), nunca duplicados dentro de uma rota — as rotas HTTP e as ferramentas MCP
chamam as mesmas funções.

O bloco de idioma abaixo abre **todos** eles (constante `IDIOMA` em `lib/painel.ts`, reutilizada):

```
IMPORTANTE — Idioma: escreva sempre em português do Brasil com acentuação completa e correta. Use "ã", "õ", "ç", "á", "é", "í", "ó", "ú" sempre que necessário. Nunca troque um acento por letra simples (nunca escreva "nao" no lugar de "não", "voce" no lugar de "você", "configuracao" no lugar de "configuração", "media" no lugar de "média"). Todos os títulos, rótulos, nomes e textos que a pessoa vai ler precisam estar em português do Brasil, acentuados.
```

> Nota de implementação: `askJSON()` de `lib/ai.ts` já acrescenta ao system a instrução "Responda
> somente com JSON válido, sem comentários e sem blocos de código markdown", usa `temperature: 0.2` e
> repete a chamada uma vez **se o parse falhar** — e só nesse caso. Um JSON válido com conteúdo fora
> do esquema (2 componentes, tipos inventados) volta na primeira chamada; a segunda tentativa para
> esse caso é do próprio `gerarPainel()` (RF-06 a4, 7.2). Ainda assim os prompts repetem a exigência
> de JSON estrito, porque a redundância derruba a variância de modelos gratuitos.

### 6.1 Geração do painel — `SYSTEM_PAINEL`

```
<IDIOMA>

Você é um ESPECIALISTA em painéis de indicadores para empresas brasileiras de médio porte. Sua ÚNICA função é transformar a descrição da pessoa em um painel completo, profissional e acionável, no formato JSON descrito abaixo. Você não conversa, não explica, não pede esclarecimento: você SEMPRE entrega um painel.

PASSO 1 — IDENTIFIQUE O SETOR
Leia o pedido e classifique em um destes setores. Use a lista de indicadores canônicos do setor identificado para escolher o que vai no painel.

- VENDAS / CRM: receita, ticket médio, taxa de conversão, leads gerados, oportunidades abertas, ciclo de venda, ranking de vendedores, funil (topo, meio, fundo), receita por produto, receita por região.
- FINANCEIRO: receita, despesas, margem líquida, fluxo de caixa, contas a pagar, contas a receber, inadimplência, gastos por categoria, resultado mês a mês.
- MARKETING: custo de aquisição de cliente, custo por lead, retorno sobre investimento em anúncios, valor do cliente ao longo do tempo, tráfego por canal (busca, pago, redes sociais, e-mail, direto), conversão por campanha, ranking de campanhas.
- OPERAÇÕES / ATENDIMENTO: nível de serviço cumprido, tempo médio de atendimento, chamados abertos e resolvidos, fila pendente, satisfação do cliente, recomendação (NPS), distribuição por tipo e por prioridade.
- SAAS / ASSINATURA: receita recorrente mensal, receita recorrente anual, cancelamento (por cliente e por receita), novos clientes, expansão, contração, meses de caixa, relação entre valor do cliente e custo de aquisição, crescimento mês a mês.
- COMÉRCIO ELETRÔNICO: receita, ticket médio, taxa de conversão, abandono de carrinho, produtos mais vendidos, vendas por estado, vendas por categoria, vendas dia a dia.
- AGÊNCIA / SERVIÇOS: receita por cliente, horas faturadas, ocupação da equipe, projetos em andamento, margem por projeto, ranking de clientes.
- RECURSOS HUMANOS: número de pessoas, rotatividade, satisfação interna (eNPS), contratações e desligamentos, distribuição por área, tempo médio de contratação, absenteísmo.
- LOGÍSTICA: pedidos entregues, tempo médio de entrega, entregas no prazo, taxa de devolução, estoque por item, ranking de transportadoras.
- EDUCAÇÃO: alunos ativos, taxa de conclusão, evasão, recomendação (NPS), ranking de cursos, engajamento.

Se o pedido não couber em nenhum setor, escolha indicadores genéricos relevantes: volume, eficiência, satisfação e tendência. Escreva no campo "setor" o nome do setor que você identificou, em português.

PASSO 2 — MONTE O PAINEL

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código, sem comentários):
{
  "titulo": "Título do painel em português, até 60 caracteres",
  "resumo": "Uma frase, até 25 palavras, sobre o que este painel acompanha",
  "setor": "Setor identificado no passo 1",
  "componentes": [ /* 5 a 8 componentes */ ]
}

TIPOS DE COMPONENTE (são estes SETE e mais nenhum: "indicador", "linha", "area", "barra", "pizza", "rosca", "tabela" — "pizza" e "rosca" são duas apresentações da mesma distribuição):

1. indicador — um número grande com comparação contra o período anterior.
{
  "id": "c1",
  "tipo": "indicador",
  "titulo": "Receita do mês",
  "posicao": { "linha": 0, "coluna": 0, "largura": 1 },
  "dados": {
    "valor": 487000,
    "anterior": 412000,
    "formato": "moeda",
    "prefixo": "R$",
    "direcaoBoa": "aumentar"
  }
}
Use "meta": <número> apenas quando a pessoa pedir meta ou objetivo. Use "direcaoBoa": "diminuir" quando cair for bom (cancelamento, custo, tempo de atendimento, inadimplência, absenteísmo, devolução).

2. linha — série temporal (tendência ao longo do tempo).
{
  "id": "c4",
  "tipo": "linha",
  "titulo": "Receita nos últimos 6 meses",
  "posicao": { "linha": 1, "coluna": 0, "largura": 2 },
  "dados": {
    "eixoX": "Mês",
    "eixoY": "Receita",
    "formato": "moeda",
    "prefixo": "R$",
    "pontos": [
      { "rotulo": "Jan", "valor": 320000 },
      { "rotulo": "Fev", "valor": 358000 },
      { "rotulo": "Mar", "valor": 341000 },
      { "rotulo": "Abr", "valor": 402000 },
      { "rotulo": "Mai", "valor": 388000 },
      { "rotulo": "Jun", "valor": 487000 }
    ]
  }
}

3. area — igual à linha, para volume acumulado ou tráfego. Mesmo formato de dados.

4. barra — comparação ou ranking. Mesmo formato da linha, mais "orientacao".
{
  "id": "c5",
  "tipo": "barra",
  "titulo": "Top 5 vendedores",
  "posicao": { "linha": 1, "coluna": 2, "largura": 2 },
  "dados": {
    "eixoX": "Vendedor",
    "eixoY": "Receita",
    "formato": "moeda",
    "prefixo": "R$",
    "orientacao": "horizontal",
    "pontos": [
      { "rotulo": "Ana Silva", "valor": 142000 },
      { "rotulo": "Carlos Souza", "valor": 118000 }
    ]
  }
}
Use "horizontal" quando os rótulos forem nomes de pessoa, cliente ou produto. Use "vertical" quando forem meses, dias ou categorias curtas.

5. pizza — distribuição em partes de um todo.
{
  "id": "c6",
  "tipo": "pizza",
  "titulo": "Receita por canal",
  "posicao": { "linha": 2, "coluna": 0, "largura": 2 },
  "dados": {
    "formato": "moeda",
    "prefixo": "R$",
    "fatias": [
      { "rotulo": "Indicação", "valor": 185000 },
      { "rotulo": "Busca paga", "valor": 142000 }
    ]
  }
}

6. rosca — mesmo formato da pizza, com o total no centro.

7. tabela — detalhamento linha a linha.
{
  "id": "c7",
  "tipo": "tabela",
  "titulo": "Maiores oportunidades abertas",
  "posicao": { "linha": 2, "coluna": 2, "largura": 2 },
  "dados": {
    "colunas": [
      { "chave": "cliente", "rotulo": "Cliente", "tipo": "texto" },
      { "chave": "valor", "rotulo": "Valor", "tipo": "moeda" },
      { "chave": "fechamento", "rotulo": "Previsão", "tipo": "data" }
    ],
    "linhas": [
      { "cliente": "Construtora Aurora", "valor": 148000, "fechamento": "2026-07-15" }
    ]
  }
}
Toda chave usada em "linhas" tem de existir em "colunas", e toda coluna tem de aparecer em todas as linhas.

REGRAS DE COMPOSIÇÃO (OBRIGATÓRIAS):
- Mínimo 5 e máximo 8 componentes.
- A grade tem 4 colunas. Em cada linha, a soma das larguras é no máximo 4 e nenhum componente se sobrepõe a outro.
- Linha 0: 3 ou 4 componentes do tipo "indicador", cada um com largura 1, nas colunas 0, 1, 2 e 3. SEMPRE com "anterior" preenchido.
- Linha 1: um gráfico de tendência ("linha" ou "area") na coluna 0 com largura 2, e um comparativo ("barra") na coluna 2 com largura 2.
- Linha 2: uma distribuição ("pizza" ou "rosca") na coluna 0 com largura 2 e, quando fizer sentido, uma "tabela" na coluna 2 com largura 2. Uma tabela sozinha pode ocupar a linha inteira (coluna 0, largura 4).
- Use no máximo 4 linhas (0 a 3).
- Ids sequenciais: "c1", "c2", "c3", ... na ordem em que aparecem.

REGRAS DOS NÚMEROS DE EXEMPLO (RÍGIDAS):
- Os números são fictícios, mas têm de ser realistas para uma empresa brasileira de médio porte: receita mensal entre R$ 50 mil e R$ 5 milhões.
- Séries temporais: 6 pontos (Jan a Jun, ou os últimos 6 meses), com variação natural entre eles — nunca uma sequência perfeitamente crescente nem números redondos demais.
- Tabelas: de 3 a 10 linhas e de 3 a 6 colunas.
- Pizza e rosca: de 3 a 6 fatias, somando um todo coerente (agrupe o resto em "Outros" se precisar).
- Barras de ranking: de 5 a 8 itens, JÁ ORDENADOS do maior para o menor, com o título começando por "Top N ".
- Nomes de pessoas brasileiros e variados (Ana Silva, Carlos Souza, Mariana Costa, Pedro Lima, Juliana Alves, Rafael Nunes).
- Cidades e estados brasileiros (São Paulo, Rio de Janeiro, Belo Horizonte, Curitiba, Recife, Porto Alegre).
- Nomes de produtos, clientes e campanhas plausíveis em português.
- Percentuais no campo "valor" como número inteiro ou com uma casa (18.5 quer dizer 18,5%), com "formato": "percentual" e sem prefixo.
- Valores em dinheiro sempre com "formato": "moeda" e "prefixo": "R$".
- Contagens com "formato": "numero" e sem prefixo.
- Datas sempre no formato AAAA-MM-DD.

ANTI-PADRÕES (NUNCA FAÇA):
- NUNCA devolva markdown, cercas de código ou qualquer texto fora do JSON.
- NUNCA invente um tipo de componente fora dos sete nomes listados.
- NUNCA escreva em inglês em título, rótulo, nome ou dado.
- NUNCA omita "anterior" em um indicador.
- NUNCA gere menos de 5 nem mais de 8 componentes.
- NUNCA peça esclarecimento: entregue sempre um painel, mesmo com pedido vago, usando o melhor palpite pelo contexto.
- NUNCA sobreponha posições nem estoure a largura 4 de uma linha.
- NUNCA repita o mesmo indicador em dois cartões.
- NUNCA use uma sigla sem que ela seja de uso corrente no Brasil (NPS pode; MRR escreva como "receita recorrente mensal").
- NUNCA escreva texto sem acentuação.

Responda SOMENTE com o JSON. Nada antes, nada depois.
```

**Prompt de usuário da geração** (`lib/painel.ts`):

```ts
export const PROMPT_PAINEL = (pedido: PedidoPainel) => {
  const detalhes = Object.entries(pedido.esclarecimentos ?? {})
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Monte um painel a partir desta descrição:\n\n"${pedido.descricao}"` +
    (detalhes ? `\n\nDetalhes adicionais:\n${detalhes}` : "");
};
```

### 6.2 Refinamento — `SYSTEM_REFINAR`

```
<IDIOMA>

Você faz edições CIRÚRGICAS em painéis de indicadores. A pessoa já tem um painel pronto e quer mudar UMA coisa. Você faz SOMENTE o que foi pedido e não toca em mais nada.

Você recebe um resumo do painel atual, o JSON completo dele e o pedido da pessoa. Devolva o painel COMPLETO atualizado, preservando EXATAMENTE todos os componentes que a pessoa não mencionou.

REGRAS CRÍTICAS:
1. Altere SOMENTE os componentes que a pessoa mencionou explicitamente.
2. NUNCA remova, reordene nem altere um componente que a pessoa não mencionou.
3. Ao acrescentar um componente, coloque-o na próxima posição livre, SEM mover os que já existem.
4. Ao trocar o tipo de um gráfico, preserve os dados e adapte apenas o formato: uma série vira fatias somando os mesmos valores; fatias viram uma série com os mesmos rótulos.
5. Preserve TODOS os ids existentes. NUNCA renomeie um id.
6. Devolva o painel completo, com o MÍNIMO de alterações.
7. Um componente não mencionado tem de voltar IDÊNTICO ao original: mesmo tipo, mesmo título, mesma posição e exatamente os mesmos dados.
8. Respeite os mesmos limites da geração: 5 a 8 componentes, grade de 4 colunas, soma de largura por linha no máximo 4. Um indicador ACRESCENTADO vai para a linha 0, com largura 1, se lá houver coluna livre; senão vai para a última linha, com largura 1.

EXEMPLOS DE COMPORTAMENTO CORRETO:
- "troque o gráfico de barras por pizza" → mude SOMENTE aquele componente para "pizza", convertendo os pontos em fatias. Todo o resto idêntico.
- "acrescente um indicador de ticket médio" → acrescente UM componente novo, com id novo (o próximo da sequência), na linha 0 se houver coluna livre; senão na última linha. Não toque em nada existente.
- "tire a tabela" → remova SOMENTE o componente do tipo "tabela". Mantenha todo o resto.
- "mude o título do painel" → altere SOMENTE o campo "titulo" do painel. Os componentes ficam idênticos e "componentesAlterados" volta vazio.
- "os valores estão baixos demais" → ajuste os números SOMENTE dos componentes que a pessoa citou; se ela não citou nenhum, pergunte em "esclarecimento".

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):

Quando você conseguiu fazer a alteração:
{
  "painel": {
    "titulo": "...",
    "resumo": "...",
    "setor": "...",
    "componentes": [ /* TODOS os componentes: os inalterados copiados EXATAMENTE, e só o(s) mencionado(s) alterado(s) */ ]
  },
  "mensagem": "Uma frase, em português, dizendo o que você fez",
  "componentesAlterados": ["c3"]
}

Quando o pedido não está claro o bastante para agir:
{
  "esclarecimento": "Uma pergunta curta, em português, para entender o que a pessoa quer"
}

REGRAS DO CAMPO "componentesAlterados":
- Liste SOMENTE os ids que você de fato alterou.
- Para cada componente NOVO que você acrescentou, inclua o id dele na lista.
- Para cada componente que você removeu, inclua o id removido na lista.
- Se você não alterou nenhum componente (por exemplo, só o título do painel), devolva uma lista vazia.
- Se você alterar um componente e não listar o id dele, a alteração será DESCARTADA e o original restaurado.

TIPOS DE COMPONENTE E SEUS DADOS (os mesmos sete da geração, e mais nenhum):
- indicador: { valor, anterior, formato: "moeda"|"numero"|"percentual", prefixo?, meta?, direcaoBoa?: "aumentar"|"diminuir" }
- linha, area: { eixoX, eixoY, formato, prefixo?, pontos: [{ rotulo, valor }] }
- barra: { eixoX, eixoY, formato, prefixo?, orientacao: "vertical"|"horizontal", pontos: [{ rotulo, valor }] }
- pizza, rosca: { formato, prefixo?, fatias: [{ rotulo, valor }] }
- tabela: { colunas: [{ chave, rotulo, tipo }], linhas: [{ ... }] }

Números novos seguem as mesmas regras de realismo da geração: escala de empresa brasileira de médio porte, nomes e cidades brasileiras, tudo em português acentuado.

Responda SOMENTE com o JSON. Nada antes, nada depois.
```

**Contexto montado antes do pedido** (`lib/painel.ts`, equivalente ao `buildRefineContext` da
origem — o resumo legível vem primeiro para o modelo saber *o que existe*, e o JSON depois para ele
copiar o que não muda):

```ts
function resumoDoComponente(c: ComponentePainel): string {
  switch (c.tipo) {
    case "indicador":
      return `valor ${c.dados.valor} contra ${c.dados.anterior} (${c.dados.formato})`;
    case "linha":
    case "area":
    case "barra":
      return `${c.dados.pontos.length} pontos de ${c.dados.eixoX} por ${c.dados.eixoY}`;
    case "pizza":
    case "rosca":
      return `${c.dados.fatias.length} fatias`;
    case "tabela":
      return `${c.dados.linhas.length} linhas e ${c.dados.colunas.length} colunas`;
  }
}

export const PROMPT_REFINAR = (painel: EspecPainel, pedido: string) => {
  const lista = painel.componentes
    .map((c, i) => `${i + 1}. [${c.tipo}] "${c.titulo}" (id: ${c.id}, linha ${c.posicao.linha}, coluna ${c.posicao.coluna}, largura ${c.posicao.largura}) — ${resumoDoComponente(c)}`)
    .join("\n");
  return `Painel atual: "${painel.titulo}" (setor: ${painel.setor})
Componentes:
${lista}

Pedido da pessoa: "${pedido}"

JSON completo do painel atual:
${JSON.stringify(painel)}

Devolva o painel COMPLETO. Altere SOMENTE o que a pessoa pediu. Todos os outros componentes têm de voltar IDÊNTICOS.`;
};
```

**Validação anti-deriva** (`lib/painel.ts`, porte de `validateRefinement` da origem com o
vocabulário novo e três acréscimos: restauração dos componentes sumidos **no índice original**,
detecção de **id renomeado** e comparação estrutural `igual()` definida aqui — a origem usava
`deepEqual` e não restaurava removidos):

```ts
/** Igualdade estrutural com chaves ordenadas (JSON.stringify puro depende da ordem das chaves). */
function ordenarChaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarChaves);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenarChaves((v as Record<string, unknown>)[k])]));
  }
  return v;
}
export const igual = (a: unknown, b: unknown) => JSON.stringify(ordenarChaves(a)) === JSON.stringify(ordenarChaves(b));

/** O componente sem `id` e sem `posicao`: é isso que se compara para reconhecer um id renomeado. */
const semIdentidade = ({ id: _id, posicao: _p, ...resto }: ComponentePainel) => resto;

/**
 * Devolve o painel refinado com todo componente não declarado restaurado do original
 * (conteúdo E posição), os sumidos reinseridos no índice original e ids renomeados desfeitos.
 */
export function validarRefinamento(
  original: EspecPainel,
  refinado: EspecPainel,
  alterados: string[],
): { painel: EspecPainel; restaurados: string[] } {
  const porId = new Map(original.componentes.map((c) => [c.id, c]));
  const restaurados: string[] = [];
  const declarados = new Set(alterados);
  const idsRefinados = new Set(refinado.componentes.map((c) => c.id));
  const sumidos = original.componentes.filter((c) => !idsRefinados.has(c.id));

  const componentes: ComponentePainel[] = refinado.componentes.map((novo) => {
    const antigo = porId.get(novo.id);
    if (!antigo) {
      // Id desconhecido: acréscimo de verdade OU um original renomeado pela IA (c3 -> c9 com o mesmo conteúdo).
      const renomeado = sumidos.find((s) => igual(semIdentidade(s), semIdentidade(novo)));
      if (renomeado) {
        console.warn(`[refinar] id "${novo.id}" é "${renomeado.id}" renomeado; original devolvido.`);
        sumidos.splice(sumidos.indexOf(renomeado), 1);
        return renomeado;
      }
      return novo;
    }
    if (declarados.size > 0) {
      if (!declarados.has(novo.id) && !igual(antigo, novo)) {
        console.warn(`[refinar] componente "${novo.id}" mudou sem ser declarado; original restaurado.`);
        restaurados.push(novo.id);
        return antigo;                                          // conteúdo E posicao do original
      }
      return novo;
    }
    // Sem lista declarada: heurística — mesmo tipo e mesmo título com dados diferentes é deriva.
    if (novo.tipo === antigo.tipo && novo.titulo === antigo.titulo && !igual(antigo, novo)) {
      restaurados.push(novo.id);
      return antigo;
    }
    return novo;
  });

  // Componente sumido sem ser declarado volta para o painel, no ÍNDICE original (não no fim),
  // para que o reempacotamento do validador não mova os vizinhos.
  for (const antigo of sumidos) {
    if (declarados.has(antigo.id)) continue;                    // remoção pedida: fica removido
    const indice = original.componentes.indexOf(antigo);
    componentes.splice(Math.min(indice, componentes.length), 0, antigo);
    restaurados.push(antigo.id);
  }

  return { painel: { ...refinado, componentes }, restaurados };
}
```

Depois disso o painel passa por `validarPainel(painel, { modo: "refinamento", moviveis })`, com
`moviveis` = ids em `componentesAlterados` ∪ ids novos: só esses podem ter a `posicao` alterada pelo
reempacotamento (RF-06 a6); os demais mantêm a `posicao` do original — a posição é parte do
componente, e M5 conta como falha um componente não pedido que troque de linha ou coluna.

### 6.3 Gate de esclarecimento — `SYSTEM_ESCLARECER`

Antes de qualquer chamada, a **heurística local** (`lib/esclarecer.ts`, sem IA). Ela conta
**radicais distintos** com fronteira de palavra — não substrings: a heurística da origem
(`clarify.ts`) fazia `includes()` sobre uma lista com pares singular/plural, de modo que "painel de
vendas para minha empresa" somava `venda` + `vendas` = 2 acertos e passava sem pergunta, e "plano de
RH" casava `ano` dentro de "plano".

```ts
/** Radicais de domínio (sem acento, minúsculos). Um token conta quando COMEÇA por um radical. */
const RADICAIS_DOMINIO = [
  "vend", "receit", "fatur", "lucr", "margem", "ticket",
  "client", "lead", "convers", "funil", "propost", "oportunidad",
  "campanh", "retorn", "aquisic", "canal", "canais", "trafeg", "anunci",
  "estoqu", "inventar", "giro", "produt", "categori",
  "projet", "taref", "praz", "entreg", "ocupac", "hora",
  "financ", "flux", "caix", "despes", "cust", "orcament", "inadimpl",
  "marketing", "engajament", "assinatur", "cancelament", "churn", "recorrent", "expans",
  "rh", "pessoa", "colaborador", "rotatividad", "contratac", "desligament",
  "juridic", "process", "contrat",
  "atendiment", "chamad", "satisfac", "nps", "servic",
  "meta", "indicador", "objetiv",
  "mensal", "mes", "diari", "dia", "semanal", "trimestr", "anual",
  "regi", "estad", "loj", "vendedor", "equip", "time",
];

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** true = precisa avaliar (a IA decide se pergunta; em demonstração, as perguntas fixas). */
export function precisaEsclarecerLocal(descricao: string): boolean {
  const texto = normalizar(descricao).trim();
  if (texto.length < 30) return true;
  const tokens = texto.split(/[^a-z0-9]+/).filter(Boolean);
  const radicais = new Set<string>();
  for (const token of tokens) {
    // Radical curto (rh, nps, dia, mes) só casa a palavra inteira ou o plural; os demais casam por prefixo.
    const radical = RADICAIS_DOMINIO.find((r) =>
      r.length <= 3 ? token === r || token === `${r}s` || token === `${r}es` : token.startsWith(r),
    );
    if (radical) radicais.add(radical);
  }
  return radicais.size < 3;
}
```

Regra: **< 30 caracteres ou < 3 radicais distintos → consultar a IA** (em demonstração, as perguntas
fixas de `esclarecimentoDemo()`); **≥ 3 radicais → gerar direto**, sem chamada. Casos de teste
obrigatórios (Etapa 7): os oito chips do RF-02 → `false`; "painel de vendas para minha empresa" →
`true` (1 radical); "plano de RH" → `true` (curto; `ano` em "plano" não conta); "faz um painel pra
mim" → `true`. Radicais de até 3 letras (`rh`, `nps`, `dia`, `mes`) casam só a palavra inteira ou o
plural, para "mesa", "mesmo" e "diante" não contarem.

Só quando `precisaEsclarecerLocal()` devolve `true` a IA é chamada (`maxTokens: 600`), com este
system:

```
<IDIOMA>

Você avalia pedidos de painel de indicadores feitos por gestores brasileiros.

Sua tarefa: decidir se o pedido tem informação suficiente para montar um painel útil, com 5 a 8 indicadores e gráficos relevantes, OU se falta algo crítico (o setor ou a área, o período, o recorte — por região, por produto, por pessoa — ou a meta).

Se o pedido já estiver claro, responda com "precisaEsclarecer": false e "perguntas": [].
Se faltar informação, devolva de 1 a 3 perguntas curtas, objetivas e em português. Cada pergunta PRECISA trazer de 2 a 4 respostas sugeridas, curtas (até 4 palavras cada), para a pessoa escolher com um clique.

Regras:
- Nunca pergunte algo que a pessoa já respondeu no pedido.
- Nunca pergunte mais de três coisas.
- Nunca peça detalhe técnico (nome de sistema, formato de arquivo, origem dos dados): o painel é montado com números de exemplo.
- Seja útil, não burocrático. Se der para adivinhar com segurança, não pergunte.
- Escreva as perguntas na segunda pessoa ("Você quer acompanhar...").

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "precisaEsclarecer": true,
  "perguntas": [
    {
      "id": "setor",
      "pergunta": "Qual área você quer acompanhar?",
      "sugestoes": ["Vendas", "Financeiro", "Marketing", "Operações"]
    },
    {
      "id": "periodo",
      "pergunta": "Qual período interessa mais?",
      "sugestoes": ["Últimos 6 meses", "Mês atual", "Ano corrente"]
    }
  ]
}

Responda SOMENTE com o JSON. Nada antes, nada depois.
```

Prompt de usuário: `Avalie este pedido de painel:\n\n"<descricao>"`.

Junção das respostas no pedido (`lib/esclarecer.ts`):

```ts
export function juntarEsclarecimentos(descricao: string, respostas: Record<string, string>): string {
  const linhas = Object.entries(respostas)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- ${k}: ${v}`);
  return linhas.length ? `${descricao}\n\nDetalhes adicionais:\n${linhas.join("\n")}` : descricao;
}
```

### 6.4 Observações do painel — `SYSTEM_OBSERVACOES`

Este é o prompt que na origem estava **em inglês** (`src/lib/ai/detect-anomalies.ts:18-42`). Aqui
ele é traduzido por inteiro e ajustado para nunca afirmar fatos sobre a empresa (risco 12 do
documento de core).

```
<IDIOMA>

Você é um analista de dados que lê um painel de indicadores e aponta o que chama atenção nele.

Os números do painel são exemplos gerados para a pessoa validar o formato, não dados reais da empresa dela. Por isso, fale sempre sobre o PAINEL ("no painel gerado, ...", "neste exemplo, ..."), nunca sobre a empresa ("sua receita caiu").

Regras:
- No máximo 3 observações.
- Cada observação tem de 1 a 2 frases.
- Seja específico: cite o nome do indicador, o número e o percentual.
- Prefira observações acionáveis: o que a pessoa olharia a seguir.
- Nunca repita o que o cartão já mostra sem acrescentar leitura ("a receita foi de R$ 487 mil" não é uma observação).
- Escreva números no formato brasileiro (R$ 487 mil, 18,5%).

Tipos de observação:
- "anomalia": um valor bem acima ou bem abaixo dos demais da mesma série ou distribuição.
- "tendencia": crescimento ou queda consistente em três períodos ou mais.
- "sugestao": um recorte, um indicador ou um gráfico que faria falta neste painel.

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "observacoes": [
    { "tipo": "tendencia", "mensagem": "No painel gerado, a receita cresce há seis meses seguidos, de R$ 320 mil para R$ 487 mil (+52%)." },
    { "tipo": "anomalia", "mensagem": "Ana Silva responde por R$ 142 mil do ranking, 20% acima do segundo colocado — vale entender o que ela faz diferente." },
    { "tipo": "sugestao", "mensagem": "Falta um recorte por região: com ticket médio e conversão na mão, ver a receita por estado mostraria onde investir." }
  ]
}

Responda SOMENTE com o JSON. Nada antes, nada depois.
```

Prompt de usuário: o painel serializado em texto compacto (não o JSON inteiro, para economizar
tokens):

```ts
export const PROMPT_OBSERVACOES = (painel: EspecPainel) =>
  `Painel: "${painel.titulo}" (setor: ${painel.setor})\n\n` +
  painel.componentes.map((c) => {
    switch (c.tipo) {
      case "indicador":
        return `[indicador] ${c.titulo}: ${c.dados.valor} (anterior ${c.dados.anterior}, ${c.dados.formato})`;
      case "linha":
      case "area":
      case "barra":
        return `[${c.tipo}] ${c.titulo} (${c.dados.eixoY} por ${c.dados.eixoX}): ` +
          c.dados.pontos.map((p) => `${p.rotulo}=${p.valor}`).join(", ");
      case "pizza":
      case "rosca":
        return `[${c.tipo}] ${c.titulo}: ` + c.dados.fatias.map((f) => `${f.rotulo}=${f.valor}`).join(", ");
      case "tabela":
        return `[tabela] ${c.titulo}: ${c.dados.linhas.length} linhas — colunas ${c.dados.colunas.map((x) => x.rotulo).join(", ")}`;
    }
  }).join("\n");
```

---

## 7. Arquitetura no padrão da suíte

### 7.1 Árvore de arquivos

Partindo de `cp -r pdi-time toolkit-dash-builder`. Comentário por arquivo dizendo o que muda.
`[INFRA]` = copiado sem alterar e comparado byte a byte por `scripts/verificar-padrao.sh`.
`[PRODUTO]` = também comparado byte a byte (fora de apps `independente`).
`[PRÓPRIO]` = escrito para este app.

```
toolkit-dash-builder/
├─ AGENTS.md                      [INFRA-ish] reescrito pelo próprio next dev; copiar
├─ CLAUDE.md                      [PRÓPRIO] @AGENTS.md + as notas deste app (nasce vazio de notas)
├─ README.md                      [PRÓPRIO] mesmas seções do de referência; tabela de variáveis só com OPENROUTER_*
├─ Dockerfile                     [PRÓPRIO] cópia IDÊNTICA à do pdi-time, inclusive os ARG/ENV de GOOGLE_*_APP e MICROSOFT_*_APP
│                                  (o workflow passa os quatro build-args a todos os apps; sem valor, lib/email-envio.ts só esconde os botões)
├─ docker-compose.yml             [PRÓPRIO] cópia; só a porta (3020:10000) e o nome do volume (toolkit-dash-builder-dados:/app/data) mudam
├─ render.yaml                    [GERADO] nunca à mão: node scripts/gerar-deploy.mjs
├─ next.config.ts                 [INFRA] { output: "standalone" }, cópia
├─ postcss.config.mjs             [INFRA] cópia
├─ eslint.config.mjs              [INFRA] cópia sem alterar
├─ tsconfig.json                  [INFRA] cópia
├─ package.json                   [PRÓPRIO] só o "name" muda. NADA MAIS: nodemailer e @types/nodemailer FICAM (lib/notificacoes.ts,
│                                  que é [INFRA] e copiado byte a byte, faz `await import("nodemailer")`; sem eles o `next build` falha no type-check)
├─ proxy.ts                       [INFRA] cópia sem alterar; nenhuma rota nova entra na lista pública
├─ instrumentation.ts             [INFRA] cópia (limpa expirados na subida; o agendador fica ocioso sem rotina)
├─ .env.example                   [PRÓPRIO] cópia idêntica à do pdi-time (todas opcionais; nenhuma linha é removida)
├─ .gitignore / .dockerignore     [INFRA] cópia (ignoram data/)
├─ app/
│  ├─ layout.tsx                  [PRÓPRIO] só metadata.title = "Painel Pronto · IA para Executivos" e description
│  ├─ globals.css                 [PRODUTO] cópia; trocar só as 4 cores do @theme; CSS do app depois de /* Específico deste app */
│  ├─ painel.css                  [PRÓPRIO] NOVO: grade de 4 colunas, cartão de componente, estilos de impressão
│  ├─ icon.svg                    [GERADO] node scripts/gerar-icones.mjs
│  ├─ page.tsx                    [PRÓPRIO] REESCRITO: tela única (chips, campo, esclarecimento, carregando, painel, conversa)
│  ├─ setup/page.tsx              [PRÓPRIO] <SetupPage marca="P" nome="Painel Pronto" area="Dados e Gestão" segmento="Gestão" /> + <AcessoMCP/>
│  │                               (segmento="Gestão" é o tipo Segmento de lib/ilustracao.ts, que não tem "Dados"; ver 8.4)
│  ├─ conta/page.tsx              [PRÓPRIO] só marca/nome/área (divergência registrada em scripts/padrao-excecoes.json)
│  ├─ entrar/page.tsx             [PRÓPRIO] idem
│  ├─ historico/page.tsx          [PRÓPRIO] idem, listando painéis (tipo "painel")
│  ├─ r/[id]/page.tsx             [PRÓPRIO] REESCRITO: renderiza <Painel/> a partir do histórico
│  ├─ r/[id]/not-found.tsx        [PRÓPRIO] cópia com o texto do domínio
│  ├─ imprimir/[id]/page.tsx      [PRÓPRIO] REESCRITO: <Painel modo="impressao"/> + rodapé de "números de exemplo"
│  ├─ imprimir/[id]/ImprimirAoCarregar.tsx  [PRÓPRIO] cópia
│  ├─ imprimir/[id]/not-found.tsx [PRÓPRIO] cópia
│  ├─ f/[token]/page.tsx          [INFRA] cópia (formulário público genérico; nenhum tipo registrado na v1)
│  ├─ f/[token]/FormularioPublico.tsx [INFRA] cópia
│  ├─ mcp/route.ts                [INFRA] cópia sem alterar (importa NOME_SERVIDOR de @/lib/ferramentas)
│  └─ api/
│     ├─ health/route.ts          [INFRA] {ok:true}
│     ├─ status/route.ts          [INFRA] cópia sem alterar (monta integrations a partir de INTEGRACOES + statusExtra)
│     ├─ setup/**                 [INFRA] cópia sem alterar, INCLUSIVE oauth/google, oauth/microsoft e oauth/mcp (rotas compartilhadas;
│     │                            verificar-padrao.sh percorre a pasta arquivo a arquivo e devolve "ausente" antes de olhar as exceções;
│     │                            sem credencial _APP os botões simplesmente não aparecem em /setup — é assim em videos-campanha e bussola-ia)
│     ├─ conta/**                 [INFRA] cópia sem alterar
│     ├─ historico/route.ts       [INFRA] cópia sem alterar
│     ├─ rotinas/**               [INFRA] cópia sem alterar (infraestrutura obrigatória, sem tipo de rotina na v1)
│     ├─ mcp/token/route.ts       [INFRA] cópia sem alterar
│     ├─ f/[token]/route.ts       [PRÓPRIO] molde mínimo; nenhum registrarCallback na v1
│     └─ painel/                  [PRÓPRIO] NOVO: as rotas de domínio (o app/api/pdi/** some)
│        ├─ route.ts                 POST gerar (aceita forcar) · GET listar · DELETE apagar tudo
│        ├─ [id]/route.ts            GET obter um painel salvo · PUT gravar o estado do Desfazer (sem IA) · DELETE apagar um
│        ├─ esclarecer/route.ts      POST avaliar o pedido (heurística local, depois IA)
│        ├─ refinar/route.ts         POST refinar um painel
│        └─ observacoes/route.ts     POST analisar o painel
├─ components/
│  ├─ ui.tsx                      [PRODUTO] cópia SEM ALTERAR (842 linhas)
│  ├─ setup.tsx                   [PRODUTO] cópia sem alterar
│  ├─ conta.tsx                   [PRODUTO] cópia sem alterar
│  ├─ AcessoMCP.tsx               [PRÓPRIO] cópia; trocar só a lista de ferramentas citadas
│  ├─ Rotinas.tsx                 REMOVER (sem rotina na v1; o cartão "Rotinas" não é renderizado em /setup — como videos-campanha)
│  ├─ BuscarEntregas.tsx / DialogoAutoavaliacao.tsx / LembrarCheckins.tsx   REMOVER (domínio do pdi-time)
│  ├─ Painel.tsx                  [PRÓPRIO] NOVO: a grade e o despacho por tipo de componente
│  ├─ CartaoIndicador.tsx         [PRÓPRIO] NOVO: número grande, variação, barra de meta (a barra é <rect> SVG, imprime)
│  ├─ GraficoSerie.tsx            [PRÓPRIO] NOVO: linha e área (SVG só com geometria + texto em HTML), molde de financas-ia/GraficoMeses.tsx
│  ├─ GraficoBarras.tsx           [PRÓPRIO] NOVO: vertical e horizontal (barras como <rect> SVG; rótulos em HTML), molde de financas-ia/GraficoCategorias.tsx
│  ├─ GraficoRosca.tsx            [PRÓPRIO] NOVO: pizza e rosca (SVG, circle + stroke-dasharray; até 6 fatias)
│  ├─ TabelaPainel.tsx            [PRÓPRIO] NOVO: na tela, embrulho de DataTable; em modo="impressao", <table> próprio de largura total
│  ├─ ChipsArea.tsx               [PRÓPRIO] NOVO: os 8 chips de sugestão
│  ├─ Esclarecimento.tsx          [PRÓPRIO] NOVO: perguntas com chips + "Pular e gerar agora"
│  ├─ ConversaRefino.tsx          [PRÓPRIO] NOVO: histórico da conversa + campo + desfazer
│  └─ BannerObservacoes.tsx       [PRÓPRIO] NOVO: até 3 observações, dispensável
├─ lib/
│  ├─ ai.ts                       [INFRA] cópia sem alterar
│  ├─ store.ts                    [INFRA] cópia sem alterar
│  ├─ conta.ts / conta-comum.ts   [INFRA] cópia sem alterar
│  ├─ modelos.ts                  [INFRA] cópia sem alterar
│  ├─ setup-comum.ts              [INFRA] cópia sem alterar
│  ├─ historico.ts                [INFRA] cópia sem alterar
│  ├─ mcp.ts / mcp-cliente.ts / mcp-oauth.ts  [INFRA] cópia sem alterar
│  ├─ formularios.ts              [INFRA] cópia sem alterar
│  ├─ notificacoes.ts / email-envio.ts / rotinas.ts  [INFRA] cópia sem alterar
│  ├─ navegacao.ts                [PRODUTO] cópia sem alterar (Início, Histórico, Configurações)
│  ├─ ilustracao.ts               [PRODUTO] cópia sem alterar
│  ├─ formato.ts / sensivel.ts    [PRODUTO] cópia; SENSIVEL = false (painel não guarda dado pessoal)
│  ├─ integracoes.ts              [PRÓPRIO] REESCRITO: INTEGRACOES = [openrouter({ beneficio: "..." })]
│  ├─ status-do-app.ts            [PRÓPRIO] REESCRITO: statusExtra() devolve {} (nada além das integrações)
│  ├─ ferramentas.ts              [PRÓPRIO] REESCRITO: NOME_SERVIDOR = "toolkit-dash-builder" + 4 ferramentas
│  ├─ rotinas-do-app.ts           [PRÓPRIO] REESCRITO: TIPOS_ROTINA = [] (sem rotina na v1)
│  ├─ notificacoes-do-app.ts      REMOVER (sem notificação na v1; no pdi-time só lib/pdi.ts, lib/status-do-app.ts e app/api/pdi/checkins o importam, todos próprios)
│  ├─ types.ts                    [PRÓPRIO] REESCRITO: os tipos da seção 5
│  ├─ demo.ts                     [PRÓPRIO] REESCRITO: esperar() + 4 painéis + refinamento e observações de exemplo
│  ├─ painel.ts                   [PRÓPRIO] NOVO: SYSTEM_PAINEL, SYSTEM_REFINAR, SYSTEM_OBSERVACOES,
│  │                               gerarPainel() (com a segunda tentativa própria), refinarPainel() (grava refinadoEm),
│  │                               observarPainel(), validarRefinamento(), igual()
│  ├─ esclarecer.ts               [PRÓPRIO] NOVO: TERMOS_DOMINIO, precisaEsclarecerLocal(), SYSTEM_ESCLARECER, esclarecer()
│  ├─ validar-painel.ts           [PRÓPRIO] NOVO: o validador/reparador do RF-06 (sem import node:*)
│  ├─ formatar.ts                 [PRÓPRIO] NOVO: moeda/número/percentual em pt-BR, compacto, variação (sem import node:*)
│  ├─ cache-painel.ts             [PRÓPRIO] NOVO: hashPedido() + busca no histórico (RF-12; ignora saida.refinadoEm; respeita forcar)
│  └─ pdi.ts / autoavaliacoes.ts / checkins.ts / entregas-quadro.ts   REMOVER (domínio do pdi-time)
└─ public/
   ├─ ilustracoes/pessoa-*.webp            [PRODUTO] cópia (acervo por segmento)
   └─ ilustracoes/icones/*.{webp,png}      [PRODUTO] cópia sem alterar (15 ícones)
```

> Atenção a `lib/formatar.ts` e `lib/validar-painel.ts`: ambos são lidos pelo client component
> `app/page.tsx` **e** por módulos de servidor. Por isso não podem ter nenhum import `node:*` —
> armadilha já registrada na primeira nota do `CLAUDE.md` do `pdi-time`.

### 7.2 Rotas de API

Todas privadas (exigem sessão pelo `proxy.ts`). Erro sempre por `respostaErro(err)`.
Correspondência com os nomes do enunciado da tarefa: `/api/gerar` → `POST /api/painel`;
`/api/refinar` → `POST /api/painel/refinar`; `/api/esclarecer` → `POST /api/painel/esclarecer`;
`/api/dashboards` → `GET /api/painel`; `/api/dashboards/[id]` → `/api/painel/[id]`. A pasta única
`app/api/painel/**` segue a convenção do `pdi-time` (`app/api/pdi/**`).

---

#### `POST /api/painel` — gerar

*Pedido:*
```json
{
  "descricao": "Painel de vendas com receita, ticket médio, conversão do funil e ranking de vendedores",
  "esclarecimentos": { "Qual período interessa mais?": "Últimos 6 meses" },
  "forcar": false
}
```
`forcar` (opcional, padrão `false`): `true` ignora o cache e chama a IA de novo — é o que "Gerar
outra versão" envia. Não existe `guardar` na rota HTTP: o painel é **sempre** salvo (RF-13).

*Resposta 200:*
```json
{
  "demo": false,
  "painel": { "titulo": "...", "resumo": "...", "setor": "Vendas", "componentes": [ ... ] },
  "meta": { "demo": false, "model": "nvidia/nemotron-3-super-120b-a12b:free", "geradoEm": "2026-09-21T14:02:11.000Z", "insumo": "descrição do painel" },
  "id": "a1b2c3d4",
  "reaproveitado": false
}
```

*Erros:* `400` `{ "error": "Descreva com um pouco mais de detalhe (pelo menos 10 letras)." }` ·
`401` `{ "error": "...", "codigo": "sem_sessao" }` · demais por `respostaErro` com o `codigo` de
`ErroIA`.

*Regras:* valida tamanho (10 a 1.000) → monta `PedidoPainel` → calcula o hash → consulta o cache
(RF-12; pulado com `forcar: true`; ignora resultados com `saida.refinadoEm`) → em demonstração
devolve de `lib/demo.ts` → senão `gerarPainel()`:

```ts
// lib/painel.ts — o caminho com IA de gerarPainel(), resumido
const MINIMO_BOM = 5, MINIMO_ACEITAVEL = 3;
let bruto = await askJSON<EspecPainel>({ system: SYSTEM_PAINEL, prompt: PROMPT_PAINEL(pedido), maxTokens: 8000 });
let painel = validarPainel(bruto);
if (painel.componentes.length < MINIMO_BOM) {
  console.warn(`[painel] segunda tentativa: sobraram ${painel.componentes.length} componentes válidos`);
  const reforco = "\n\nA resposta anterior veio incompleta ou fora do formato. Devolva um painel completo, com 5 a 8 componentes válidos.";
  bruto = await askJSON<EspecPainel>({ system: SYSTEM_PAINEL, prompt: PROMPT_PAINEL(pedido) + reforco, maxTokens: 8000 });
  const segundo = validarPainel(bruto);
  if (segundo.componentes.length > painel.componentes.length) painel = segundo;
}
if (painel.componentes.length < MINIMO_ACEITAVEL) {
  throw new ErroIA("resposta_invalida", "A IA devolveu uma resposta que não deu para usar. Tente de novo ou descreva o painel de outro jeito.", 502);
}
```

→ `salvar({ tipo: "painel", titulo, resumo, entrada: pedido, saida: painel, meta })` **sempre** →
devolve `{ demo, painel, meta, id, reaproveitado }`. (No pior caso são quatro chamadas ao modelo:
duas do `gerarPainel` × o retry de *parse* do `askJSON`; é aceitável porque só acontece com resposta
ruim, e M3 mede quantas vezes a segunda tentativa foi necessária.)

---

#### `GET /api/painel` — listar

*Resposta:* `{ "itens": [ { "id": "...", "tipo": "painel", "titulo": "...", "resumo": "...", "criadoEm": "..." } ] }`
(direto de `listar(10)` de `lib/historico.ts`).

#### `DELETE /api/painel` — apagar tudo
*Resposta:* `{ "ok": true }`. A tela pede confirmação antes.

---

#### `GET /api/painel/[id]` — obter um painel salvo
*Resposta:* `{ "painel": EspecPainel, "pedido": PedidoPainel, "meta": Meta, "criadoEm": "..." }`,
ou `404` `{ "error": "Este painel não existe mais." }`.

#### `PUT /api/painel/[id]` — gravar um estado sem IA (Desfazer)
*Pedido:* `{ "painel": EspecPainel }`
*Resposta:* `{ "ok": true, "painel": EspecPainel }` (o painel depois de `validarPainel`), ou `404`.
*Regras:* não chama a IA; passa o corpo por `validarPainel()`; mantém `refinadoEm` como veio no corpo
(o estado restaurado de um painel refinado continua fora do cache); chama `atualizarSaida(id, painel)`.
Usada pelo botão "Desfazer" (RF-10 a4) para que `/r/[id]` e `/imprimir/[id]` mostrem o que está na
tela. `400` quando `painel` não tem componentes.

#### `DELETE /api/painel/[id]` — apagar um
*Resposta:* `{ "ok": true }`.

---

#### `POST /api/painel/esclarecer` — avaliar o pedido

*Pedido:* `{ "descricao": "faz um painel pra mim" }`

*Resposta 200:*
```json
{
  "precisaEsclarecer": true,
  "perguntas": [
    { "id": "setor", "pergunta": "Qual área você quer acompanhar?", "sugestoes": ["Vendas", "Financeiro", "Marketing", "Operações"] },
    { "id": "periodo", "pergunta": "Qual período interessa mais?", "sugestoes": ["Últimos 6 meses", "Mês atual", "Ano corrente"] }
  ],
  "origem": "ia"
}
```
`origem` é `"local"` quando a heurística decidiu sozinha (sem chamar a IA), `"ia"` quando a IA foi
consultada e `"demo"` em modo demonstração. Quando não precisa esclarecer:
`{ "precisaEsclarecer": false, "perguntas": [], "origem": "local" }`.

*Regra:* nunca chama a IA quando `precisaEsclarecerLocal()` devolve `false`; quando chama, usa
`maxTokens: 600`. Falha da IA neste passo **não** bloqueia: cai para `{ precisaEsclarecer: false }`
e a geração segue (é um passo opcional de qualidade, não uma etapa obrigatória). O atalho
`?exemplo=1` não passa por aqui (RF-03 a4).

---

#### `POST /api/painel/refinar` — refinar

*Pedido:*
```json
{
  "painel": { "titulo": "...", "resumo": "...", "setor": "...", "componentes": [ ... ] },
  "pedido": "troque o gráfico de barras por pizza e acrescente um indicador de ticket médio",
  "id": "a1b2c3d4"
}
```

*Resposta 200 (alterado):*
```json
{
  "demo": false,
  "painel": { ... },
  "mensagem": "Troquei o ranking de vendedores por um gráfico de pizza e acrescentei o ticket médio.",
  "componentesAlterados": ["c5", "c9"],
  "restaurados": ["c4"],
  "meta": { ... }
}
```
`restaurados` são os ids que a IA alterou sem declarar e que o validador devolveu ao original — a
tela não os mostra, mas eles vão para o `console.warn` do servidor e ajudam na medição da M5.

*Resposta 200 (pergunta de volta):*
```json
{ "demo": false, "esclarecimento": "Você quer trocar o gráfico de barras de vendedores ou o de produtos?" }
```

*Erros:* `400` quando `pedido` tem menos de 3 caracteres ou `painel` não tem componentes.

*Regras:* `askJSON<RespostaRefinamento>` com `maxTokens: 8000` (o painel volta inteiro) →
`validarRefinamento(original, refinado, componentesAlterados)` → `validarPainel(..., { modo:
"refinamento", moviveis })` → `painel.refinadoEm = new Date().toISOString()` → quando `id` é
informado, `atualizarSaida(id, painel)`. O `refinadoEm` é o que tira este painel do cache (RF-12 a6).

---

#### `POST /api/painel/observacoes` — analisar

*Pedido:* `{ "painel": EspecPainel }`
*Resposta:* `{ "demo": false, "observacoes": [ { "tipo": "tendencia", "mensagem": "..." } ], "meta": { ... } }`
No máximo 3; a resposta é cortada em 3 no servidor mesmo que a IA mande mais. `askJSON` com
`maxTokens: 1200`.

Resumo dos `maxTokens` por rota (tabela 5.3): geração **8.000** · refinamento **8.000** · observações
**1.200** · esclarecimento **600**. Nenhuma rota fica no padrão de 4.000 de `askText` por omissão.

---

#### Rotas herdadas, sem alteração
`GET /api/health` · `GET /api/status` (com `dynamic = "force-dynamic"`) · `GET|PUT /api/setup` ·
`POST /api/setup/testar` · `GET /api/setup/oauth/openrouter/**` · `/api/conta/**` ·
`GET /api/historico` · `/api/rotinas/**` · `POST /api/mcp/token` · `POST /mcp`.

### 7.3 Modelo de dados no SQLite

Arquivo único `DATA_DIR/app.sqlite` (`node:sqlite`), o mesmo de `lib/store.ts`, `lib/conta.ts`,
`lib/historico.ts`, `lib/formularios.ts` e `lib/rotinas.ts`. **A v1 não cria nenhuma tabela nova.**

| Tabela | Origem | O que este app guarda nela |
|---|---|---|
| `config` | `lib/store.ts` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `APP_URL`, `MCP_CODIGO` — todos cifrados em AES-256-GCM |
| `contas` / `sessoes` | `lib/conta.ts` | a conta de administrador da instância |
| `resultados` | `lib/historico.ts` | **os painéis** |
| `formularios` / `respostas` | `lib/formularios.ts` | nada na v1 |
| `rotinas` | `lib/rotinas.ts` | nada na v1 |

Uso da tabela `resultados` (colunas já existentes: `id`, `tipo`, `titulo`, `resumo`, `entrada`,
`saida`, `meta`, `criadoEm`, `expiraEm`):

| Coluna | Conteúdo neste app |
|---|---|
| `id` | id curto gerado por `lib/historico.ts` |
| `tipo` | sempre `"painel"` |
| `titulo` | `EspecPainel.titulo` |
| `resumo` | `EspecPainel.resumo` (alimenta `/historico` sem abrir o painel) |
| `entrada` | JSON de `PedidoPainel` — `{ descricao, esclarecimentos, hash }` |
| `saida` | JSON de `EspecPainel` — atualizado a cada refinamento (com `refinadoEm`) e a cada Desfazer por `atualizarSaida(id, ...)` |
| `meta` | `{ demo, model, geradoEm, insumo }` de `meta()` de `lib/ai.ts` |
| `expiraEm` | nulo (`SENSIVEL = false`: painel não guarda dado pessoal, não expira) |

**Cache por hash (RF-12)** — sem tabela nova: `lib/cache-painel.ts` usa
`listarPorTipo<PedidoPainel, EspecPainel>("painel", 50)` de `lib/historico.ts` e procura o primeiro
resultado cujo `entrada.hash` bata, cujo `criadoEm` tenha menos de 24 h, cujo `meta.demo` seja igual
ao modo atual **e cuja `saida` não tenha `refinadoEm`** (um painel já refinado não representa mais o
pedido original). Com `forcar: true` a busca nem é feita. Com 50 resultados por consulta e um `JSON.parse` por linha, o custo é irrelevante na
escala de uma instância. Se um dia virar gargalo, a evolução é uma coluna indexada em `resultados` —
mas isso mudaria um arquivo `[INFRA]` e exigiria replicação para os 19 apps, então fica registrado
como decisão consciente de **não** fazer agora.

```ts
// lib/cache-painel.ts
import { createHash } from "node:crypto";

export function hashPedido(pedido: PedidoPainel): string {
  const texto = juntarEsclarecimentos(pedido.descricao, pedido.esclarecimentos ?? {})
    .trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(texto).digest("hex");
}
```

### 7.4 Modo demonstração — `lib/demo.ts`

```ts
export function esperar(ms = 1200) { return new Promise((r) => setTimeout(r, ms)); }
```

Quatro painéis completos, cada um com 6 a 8 componentes, cobrindo os sete tipos (rosca em três,
pizza no financeiro; nenhuma distribuição com mais de 6 fatias):

| Chave | Título | Setor | Palavras-chave que o selecionam | Componentes |
|---|---|---|---|---|
| `vendas` | Painel comercial do mês | Vendas | vendas, venda, comercial, funil, vendedor, lead, proposta, conversão, CRM | 4 indicadores (receita, ticket médio, conversão, oportunidades) · linha de receita 6 meses · barra horizontal "Top 5 vendedores" · rosca de receita por canal · tabela de maiores oportunidades |
| `financeiro` | Painel financeiro do trimestre | Financeiro | financeiro, caixa, despesa, custo, margem, lucro, contas, orçamento, inadimplência | 4 indicadores (receita, despesas, margem, saldo em caixa) · área de fluxo de caixa 6 meses · barra vertical de despesas por mês · pizza de gastos por categoria · tabela de contas a receber |
| `marketing` | Painel de marketing e aquisição | Marketing | marketing, campanha, anúncio, tráfego, canal, aquisição, lead, retorno, engajamento | 4 indicadores (custo por lead, custo de aquisição, retorno sobre anúncios, leads) · linha de leads 6 meses · barra horizontal "Top 6 campanhas" · rosca de tráfego por canal · tabela de campanhas |
| `assinatura` | Painel de receita recorrente | SaaS | assinatura, recorrente, cancelamento, churn, mensalidade, plano, retenção, SaaS | 4 indicadores (receita recorrente, cancelamento com `direcaoBoa: "diminuir"`, novos clientes, meses de caixa) · linha de receita recorrente · barra vertical de novos contra cancelados · rosca por plano · tabela dos maiores clientes |

Escolha: normaliza o prompt, conta ocorrências das palavras-chave de cada painel e devolve o de
maior pontuação; empate ou zero acerto devolve `vendas`. É o que faz o exemplo nunca parecer
aleatório em relação ao que a pessoa pediu.

Também em `lib/demo.ts`:
- `esclarecimentoDemo()` — duas perguntas fixas (área e período) com chips, usadas quando a
  heurística local pede esclarecimento em modo demonstração.
- `refinamentoDemo(painel, pedido)` — transformação determinística: se o pedido cita "pizza",
  "rosca" ou "distribuição", converte a primeira barra em rosca; se cita "acrescente"/"adicione",
  acrescenta um indicador de ticket médio; senão, troca o título do painel. Sempre devolve uma
  `mensagem` que deixa claro tratar-se de exemplo.
- `observacoesDemo(painel)` — três observações coerentes com o painel (calculadas de verdade a
  partir dos números: maior crescimento da série, maior fatia, e uma sugestão fixa por setor).

Todos com a **mesma forma** da resposta real, de modo que `app/page.tsx` nunca precise saber em qual
modo está.

### 7.5 Tratamento de erros

Toda rota segue o padrão do `pdi-time`:

```ts
try {
  const resultado = await gerarPainel(pedido, { forcar }); // a rota HTTP salva sempre; `guardar` só existe no MCP
  return Response.json(resultado);
} catch (err) {
  return respostaErro(err);
}
```

- `interpretarFalha(res, detalheBruto)` (privado de `lib/ai.ts`) traduz o status do OpenRouter num
  `ErroIA` com `codigo` (`chave_ausente`, `chave_invalida`, `sem_credito`, `limite_diario`,
  `fila_cheia`, `modelo_indisponivel`, `entrada_recusada`, `provedor_fora`, `rede`, `resposta_vazia`,
  `resposta_invalida`), `status` e `acao?` (`{rotulo, url}`).
- Detalhe técnico só em `console.error`. Nunca na tela. Nunca citar caminho de rota na mensagem
  (dizer "em Configurações").
- Erro de validação de entrada é 400 com frase em português, escrito na própria rota.
- Na tela, `lerErro()` de `components/ui.tsx` lê `{mensagem, codigo, acao}`; `codigo: "sem_sessao"`
  navega para `/entrar?next=…`; o resto vai para o `ErrorBox`, **com o pedido original em itálico
  renderizado acima dele** (`<p className="italic text-muted">`; o `ErrorBox` não tem slot para isso)
  **e o botão "Tentar de novo"** (rótulo fixo do `ErrorBox`, `ui.tsx:423`, via `onTentarNovamente`)
  — sacada 2.14.
- Tempo limite no **cliente** (`lib/ai.ts` é `[INFRA]` e faz `fetch` sem `signal`): `AbortController`
  com 120 s na geração, 90 s no refinamento e 45 s nas observações. Ao estourar, `ErrorBox` com "A IA
  demorou demais para responder. Tente de novo ou troque o modelo em Configurações." e o botão de
  tentar de novo. Sem isso, uma chamada travada no modelo gratuito deixaria o `Loading` parado na
  última etapa para sempre.
- Atalho de demonstração para capturar a tela de erro, só fora de produção:
  `POST /api/painel?erro=sem_credito` lança `interpretarFalha(new Response(null, {status:402}), "")`
  — mesmo padrão já usado em `pdi-time/app/api/pdi/route.ts`.
- `resposta_invalida` — tanto a do `askJSON` (JSON que não faz *parse* duas vezes) quanto a do
  `gerarPainel` (menos de 3 componentes válidos depois da segunda tentativa, RF-06 a4): a mensagem na
  tela é "A IA devolveu uma resposta que não deu para usar. Tente de novo ou descreva o painel de
  outro jeito."

### 7.6 Ferramentas MCP — `lib/ferramentas.ts`

```ts
export const NOME_SERVIDOR = "toolkit-dash-builder";
```

| Ferramenta | Argumentos | O que faz | Chama |
|---|---|---|---|
| `criar_painel` | `descricao` (obrigatório), `esclarecimentos?` (objeto), `guardar?` (booleano, padrão `true` — o único lugar onde `guardar` existe) | Gera o painel a partir da descrição e devolve a especificação, o `id` e o link `/r/<id>` | `gerarPainel()` de `lib/painel.ts` |
| `refinar_painel` | `id` (obrigatório), `pedido` (obrigatório) | Refina um painel salvo, grava com `atualizarSaida` (com `refinadoEm`) e devolve o painel novo e o que mudou | `refinarPainel()` |
| `listar_paineis` | `limite?` (padrão 10, máximo 50) | Lista os painéis salvos com id, título, resumo e data — **filtrando `tipo === "painel"`** (`listar()` devolve todos os tipos) | `listar()` de `lib/historico.ts` |
| `obter_painel` | `id` (obrigatório) | Devolve a especificação completa, o pedido original e o link `/r/<id>` | `obter()` de `lib/historico.ts` |

Esqueleto no formato de `pdi-time/lib/ferramentas.ts:9-33` (`schema` é JSON Schema com `required`;
`executar` valida os argumentos e lança `Error` com frase em português — `lib/mcp.ts` serializa o
retorno como texto JSON, então devolver objetos com `painel` e `link` funciona):

```ts
// lib/ferramentas.ts
import { gerarPainel, refinarPainel } from "./painel";
import { listar, obter } from "./historico";
import { enderecoPublico } from "./setup-comum";
import type { Ferramenta } from "./mcp";
import type { EspecPainel, PedidoPainel } from "./types";

export const NOME_SERVIDOR = "toolkit-dash-builder";

const link = (id: string) => `${enderecoPublico()}/r/${id}`;

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "criar_painel",
    descricao: "Gera um painel de indicadores completo (indicadores, gráficos e tabela, com números de exemplo) a partir de uma descrição em português do que a pessoa quer acompanhar.",
    schema: {
      type: "object",
      properties: {
        descricao: { type: "string", description: "O que o painel deve acompanhar (10 a 1.000 caracteres)" },
        esclarecimentos: { type: "object", description: "Opcional: pergunta -> resposta, para detalhar o pedido", additionalProperties: { type: "string" } },
        guardar: { type: "boolean", description: "Salvar no histórico (padrão: sim)" },
      },
      required: ["descricao"],
    },
    async executar(args) {
      const { descricao, esclarecimentos, guardar = true } = args as { descricao?: string; esclarecimentos?: Record<string, string>; guardar?: boolean };
      if (!descricao || descricao.trim().length < 10) throw new Error("Descreva o painel com pelo menos 10 letras.");
      const r = await gerarPainel({ descricao, esclarecimentos }, { guardar });
      return { painel: r.painel, id: r.id, link: r.id ? link(r.id) : undefined, demo: r.demo };
    },
  },
  // refinar_painel, listar_paineis (filtra tipo === "painel") e obter_painel seguem o mesmo molde.
];
```

Nenhuma delas duplica prompt ou lógica: as quatro chamam as mesmas funções que as rotas HTTP, como
`PADRAO.md:79` exige. O link absoluto sai de `enderecoPublico()` de `lib/setup-comum.ts`, nunca de
`getConfig("APP_URL") || "http://localhost:3000"` montado à mão (regra da US-019, com verificação
própria no `verificar-jargao.mjs`).

### 7.7 Rotinas

**Nenhuma na v1** (decisão 13 do documento de core). `lib/rotinas-do-app.ts` fica assim:

```ts
// Este app não tem tarefa agendada na v1: o painel é gerado sob demanda e os números são de exemplo,
// então não há o que resumir nem sobre o que alertar. A infraestrutura (lib/rotinas.ts,
// app/api/rotinas, instrumentation.ts) continua copiada e ociosa, pronta para quando existir dado
// real; o cartão "Rotinas" NÃO é renderizado em /setup (components/Rotinas.tsx foi removido, como
// no videos-campanha, que também não tem a capacidade "rotina").
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
```

E `capacidades` em `catalogo.json` não lista `"rotina"`. `instrumentation.ts:9` importa
`@/lib/rotinas-do-app`, então o arquivo precisa existir mesmo com a lista vazia.

### 7.8 Impressão — `/imprimir/[id]`

Server Component que lê `obter(id)` de `lib/historico.ts` e renderiza `<Painel modo="impressao" />`,
mais `<ImprimirAoCarregar />`.

- Sem `Topbar`, sem conversa de refinamento, sem botões (`.no-print` já existe em `globals.css`).
- Cabeçalho: título do painel, resumo, setor e a data de geração.
- Rodapé: "Números de exemplo, gerados para validar o formato do painel." e a proveniência
  (`Origem`, com modelo e data).
- A grade de impressão é de 2 colunas (A4 retrato), com `break-inside: avoid` em cada cartão, no
  bloco `/* Específico deste app */` de `globals.css` — que também liga a impressão de cor:

  ```css
  /* Específico deste app */
  @media print {
    .print-sheet { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-sheet .painel-grade { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .print-sheet .painel-tabela { grid-column: 1 / -1; }
  }
  ```
  (`globals.css` é comparado ignorando só as quatro cores de acento, mas o bloco depois do marcador
  `/* Específico deste app */` é livre — é assim que os outros apps acrescentam CSS.)
- **Toda cor que precisa aparecer no papel é `fill`/`stroke` de SVG**, nunca `background` de `div`:
  o Chrome não imprime fundo por padrão (a opção "Gráficos de fundo" vem desmarcada) e `print-color-adjust`
  é só a segunda rede de segurança. Barras de `GraficoBarras` e a barra de meta do `CartaoIndicador`
  são `<rect>`; linha, área e fatias já são SVG. Nada de `canvas`, nada de biblioteca.
- **Tabela em modo impressão:** `TabelaPainel` com `modo="impressao"` renderiza um `<table>` HTML
  próprio e simples (cabeçalho + até 10 linhas, formatação por tipo de coluna, sem `DataTable`) que
  ocupa a **linha inteira** da grade (`grid-column: 1 / -1`). Motivo: na largura útil do A4 o
  `DataTable` cai no modo cartão (`ui.tsx:678`, `<table className="max-md:hidden …">`) e uma tabela
  de 10 × 6 vira 60 pares rótulo/valor mais altos que a página; `break-inside: avoid` a empurraria
  inteira para a página seguinte (limitação US-020 do `CLAUDE.md` do `pdi-time`). Com a tabela na
  largura total e 10 linhas, ela cabe em uma página (RF-14 a5).
- O que se imprime é a `saida` salva — por isso Desfazer persiste por `PUT /api/painel/[id]`
  (RF-10 a4): sem isso o PDF sairia diferente da tela.

### 7.9 Tela `/setup`

```tsx
// app/setup/page.tsx
<SetupPage marca="P" nome="Painel Pronto" area="Dados e Gestão" segmento="Gestão" />
<AcessoMCP />
```

`segmento="Gestão"`, e não `"Dados"`: a prop é do tipo `Segmento` de `lib/ilustracao.ts:6-14`
(`"RH" | "Marketing" | "Vendas" | "Financeiro" | "Atendimento" | "Estratégia" | "Gestão" |
"Jurídico"`), arquivo `[PRODUTO]` comparado byte a byte — `"Dados"` não compila. "Gestão" não tem
ilustração de pessoa (só o `.blob-acento`), como em `agente-kanban` e `reunioes-ia`. O segmento
**da paleta** (`tasks/paleta-segmentos.json`) continua "Dados"; são dois conceitos (8.4).

```ts
// lib/integracoes.ts (íntegra)
import { openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escolhe os indicadores e monta o painel" });

export const INTEGRACOES: Integracao[] = [OPENROUTER];
```

```ts
// lib/status-do-app.ts (íntegra)
// Este app não tem chave derivada de status além das próprias integrações.
export function statusExtra(): Record<string, boolean> {
  return {};
}
```

Sem visão (`visao: false`) e sem modelo de avaliação (`avaliacao: false`): o app faz uma coisa só
com a IA e o campo principal continua chamado "Modelo", sem `rotuloModelo`. `.env.example` lista
apenas `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `APP_URL`, `DATA_DIR`, `CHAVE_MESTRA` e
`NOVA_SENHA_ADMIN`, todas opcionais.

---

## 8. UI / UX

### 8.1 Telas

O app é **uma tela** (`app/page.tsx`, client component), mais as quatro telas que o padrão já dá:
`/setup`, `/historico`, `/r/[id]` e `/imprimir/[id]` (além de `/conta` e `/entrar`). Nenhum destino
novo na `Topbar`: `lib/navegacao.ts` segue com Início, Histórico e Configurações.

**Estados da tela principal** (uma máquina de estados no cliente, `estado.fase`):

| Fase | O que aparece | Como sai daqui |
|---|---|---|
| `vazio` | `Hero` + `Passos` à esquerda, formulário (chips + campo + botão), `Stage` com `Empty` convidativo à direita | enviar o formulário |
| `esclarecendo` | `Esclarecimento` no lugar do `Empty`: 1 a 3 perguntas com chips, campo livre por pergunta, botões "Gerar painel" e "Pular e gerar agora" | responder ou pular |
| `carregando` | `Loading({ etapas })` com o pedido visível | resposta do servidor |
| `pronto` | Painel em largura total, com `ResultHead`, `Aviso` de números de exemplo, `BannerObservacoes` (quando houver), grade, `ConversaRefino` abaixo (com "Desfazer"), botão "Gerar outra versão" e `Entregar` (já com `id`)/`Origem`/`SeloIA` no rodapé | novo pedido, refinamento, "Gerar outra versão" ou "Começar de novo" |
| `erro` | `<p className="italic text-muted">` com o pedido original, acima do `ErrorBox` com a mensagem traduzida e o botão "Tentar de novo" | tentar de novo |

**Layout (decisão P4, fechada).** Nos estados `vazio`, `esclarecendo`, `carregando` e `erro`, a
estrutura é a do padrão: `Workspace` com `Panel` à esquerda e `Stage` à direita. No estado `pronto`,
um `<main>` próprio de largura total substitui o `Workspace`: o painel ocupa a largura inteira e o
formulário recolhe para uma linha resumida no topo ("Painel comercial do mês · alterar pedido"), com
a conversa de refinamento em faixa abaixo da grade. Isso cabe na regra de tela única **sem**
`"independente": true`: o padrão exige uma tela e nenhum destino novo na `Topbar` (`PADRAO.md:28-29`)
e `scripts/verificar-padrao.sh:76-84` não compara `app/page.tsx` (só `ui.tsx`, `setup.tsx`,
`conta.tsx`, `navegacao.ts`, `ilustracao.ts`, `globals.css` e os ícones). Precedente:
`financas-ia/app/page.tsx:349` já usa um `<main className="grid lg:grid-cols-2 …">` próprio no lugar
do `Workspace`. Registrar a decisão no `CLAUDE.md` do app. O `Hero` da fase `vazio` recebe
`segmento="Gestão"` (8.4).

**Home (fase `vazio`), textos medidos contra os cinco limites do `PADRAO.md`:**
- Sobretítulo: "Painel de indicadores".
- Título (≤ 8 palavras): **"Seu painel pronto em trinta segundos"** — 6 palavras.
- Apoio (≤ 20 palavras): **"Descreva o que você quer acompanhar: a IA escolhe os indicadores do seu setor e monta o painel."** — 18 palavras.
- Passos (3), no formato `{ titulo, apoio }` que `Passos` exige (`ui.tsx:244-248`; `apoio` ≤ 6
  palavras): "Descreva o painel" · *em uma frase, do seu jeito* — "A IA escolhe os indicadores" ·
  *os que um analista escolheria* — "Ajuste conversando" · *troque, acrescente, tire*.
- Prévia do que vem (≤ 5 itens de ≤ 6 palavras): "Indicadores com comparação" · "Gráfico de tendência" · "Ranking do período" · "Distribuição por categoria" · "Tabela detalhada".
- Uma linha de ajuda no campo: "Quanto mais específico, melhor o painel."

**Histórico.** `/historico` (herdado) lista os painéis por `titulo` e `resumo`, com filtro por texto
no cliente. Cada linha abre `/r/[id]`.

### 8.2 Componentes de gráfico feitos à mão

Nenhuma biblioteca. Moldes: `financas-ia/components/GraficoMeses.tsx` (série, altura fixa em px,
grade com `minmax(0,1fr)`, rótulo curto no celular) e `GraficoCategorias.tsx` (barras horizontais
com rótulo à esquerda e valor à direita).

| Componente | Tipos que atende | Técnica | Tema e acento |
|---|---|---|---|
| `CartaoIndicador.tsx` | `indicador` | `div` para o número grande e a variação (seta textual não: usar "+12,4%" com cor); a **barra de meta é um SVG** de altura fixa (`width="100%"`, `height={6}`, `viewBox="0 0 100 6"`, `preserveAspectRatio="none"`) com dois `<rect>`: trilho e progresso — imprime, ao contrário de um `div` com fundo | número em `text-ink`; variação em `text-ok` / `text-danger` / `text-muted` conforme `direcaoBoa`; `<rect>` do progresso com `fill="var(--color-accent)"`, trilho com `var(--color-accent-soft)` |
| `GraficoSerie.tsx` | `linha`, `area` | O SVG contém **só geometria** (`polyline` da série, `path` fechado da área, linhas de grade): `width="100%"`, `height={ALTURA}` fixa em px, `viewBox="0 0 100 ALTURA"`, `preserveAspectRatio="none"` e `vector-effect="non-scaling-stroke"` no traço. Eixo Y (3 marcas), rótulos do eixo X e o valor do último ponto ficam em **HTML**, numa grade `minmax(0,1fr)` alinhada ao SVG, como em `financas-ia/components/GraficoMeses.tsx:37-96`. **Sem `<circle>` por ponto** (deformaria com `preserveAspectRatio="none"`); a leitura ponto a ponto vai no `<p className="sr-only">` e no `title` da coluna HTML. Funciona em Server Component (`/r/[id]`, `/imprimir/[id]`): nada mede largura no cliente | traço em `var(--color-accent)`, preenchimento da área com o mesmo acento a 14 % de opacidade; grade em `--color-line` |
| `GraficoBarras.tsx` | `barra` | Barras como **`<rect>` em SVG** (imprimem), rótulos e valores em HTML. `vertical`: grade CSS com `minmax(0,1fr)` por ponto, cada coluna com um SVG `width="100%"` `height={ALTURA}` `viewBox="0 0 100 ALTURA"` `preserveAspectRatio="none"` e um `<rect>` de altura proporcional; `horizontal`: linhas com rótulo à esquerda (largura fixa, `truncate` + `title`), SVG `flex-1` de altura fixa com um `<rect>` de largura proporcional, e valor à direita | `fill="var(--color-accent)"`; a maior barra a 100 % e as demais com `fill-opacity` 0,7, para dar hierarquia sem inventar cor |
| `GraficoRosca.tsx` | `pizza`, `rosca` | SVG: um `circle` por fatia com `stroke-dasharray`/`stroke-dashoffset` (nada de cálculo de arco por `path`), **até 6 fatias** (o validador agrupa o excedente em "Outros"), `rosca` com o total formatado no centro; legenda ao lado com quadradinho, rótulo, **valor formatado e percentual** | a maior fatia começa em `var(--color-accent)` cheio e as demais descem em degraus de **≥ 12 pontos** de opacidade (100 / 88 / 76 / 64 / 52 / 40 %); **nenhuma paleta de 8 cores** (a origem usava; aqui a identidade é o acento do app) |
| `TabelaPainel.tsx` | `tabela` | Na tela: embrulho do `DataTable` de `components/ui.tsx` (que já vira blocos rotulados no celular), com formatação por `ColunaTabela.tipo` (datas por `formatarData`, 8.3). Em `modo="impressao"`: `<table>` HTML próprio e simples ocupando a linha inteira da grade (7.8) | herda o tema; nenhum estilo próprio além do da impressão |

Regras comuns a todos:
- **Altura fixa em px e texto fora do SVG.** O cartão varia de ~300 px (celular) a ~640 px (largura
  2 no desktop) e as páginas `/r/[id]` e `/imprimir/[id]` são Server Components — não há
  `ResizeObserver` para medir. Por isso o SVG só carrega geometria (esticada com
  `preserveAspectRatio="none"` e traço com `vector-effect="non-scaling-stroke"`) e todo texto (eixos,
  rótulos, valores) fica em HTML ao lado, na mesma grade: um SVG com texto dentro de um `viewBox`
  escalado ou estoura o cartão ou deforma a letra (armadilha já registrada no `financas-ia`).
- **`Intl` compacto com espaço trocado.** `notation: "compact"` do `Intl` usa espaço não separável
  (` `, ` `), que não quebra linha e estoura coluna estreita: trocar por espaço comum
  antes de ir para a tela (`lib/formatar.ts`).
- **Rótulo curto no celular.** Mês "Janeiro" vira "jan"; nome de pessoa vira o primeiro nome. O
  texto completo fica no `title` e no desktop.
- **Nenhum `title` substitui rótulo obrigatório**: todo gráfico tem legenda ou rótulo de eixo
  visível, porque `title` não existe no celular nem na impressão.
- **Acessibilidade:** cada gráfico tem um `<p className="sr-only">` com a leitura em texto ("Receita
  por mês: janeiro R$ 320 mil, fevereiro R$ 358 mil, ..."), que também é o que um leitor de tela e a
  busca do navegador encontram.
- **Impressão:** nenhum gráfico depende de `canvas`; toda cor que precisa sair no papel é
  `fill`/`stroke` de SVG (barras, barra de meta, linha, área, fatias), porque fundo de `div` não
  imprime por padrão (7.8, RF-14).

### 8.3 Formatação (`lib/formatar.ts`)

```ts
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MOEDA_COMPACTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const NUMERO = new Intl.NumberFormat("pt-BR");
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** O compacto do Intl usa espaço NÃO separável, que estoura coluna estreita (ver financas-ia). */
const semEspacoDuro = (s: string) => s.replace(/[  ]/g, " ");

export function formatar(valor: number, formato: Formato, compacto = false): string {
  switch (formato) {
    case "moeda": return semEspacoDuro((compacto ? MOEDA_COMPACTA : MOEDA).format(valor));
    case "percentual": return PERCENTUAL.format(valor / 100);
    case "numero": return NUMERO.format(valor);
  }
}

/** Variação percentual contra o período anterior, com o caso anterior === 0 tratado. */
export function variacao(valor: number, anterior: number): number {
  if (anterior === 0) return valor > 0 ? 100 : 0;
  return ((valor - anterior) / Math.abs(anterior)) * 100;
}

/** Cor da variação, respeitando direcaoBoa: cair é bom em cancelamento, custo, tempo. */
export function tomDaVariacao(v: number, direcaoBoa: "aumentar" | "diminuir" = "aumentar") {
  if (Math.abs(v) < 0.05) return "neutro" as const;
  const bom = direcaoBoa === "aumentar" ? v > 0 : v < 0;
  return bom ? ("ok" as const) : ("danger" as const);
}

/**
 * Coluna de tabela do tipo "data" (AAAA-MM-DD). `new Date("2026-07-15")` é meia-noite UTC e, no fuso
 * do Brasil, mostra 14/07 — armadilha US-070 do CLAUDE.md do pdi-time. Com "T00:00:00" vira hora local.
 * Valor que não casa o formato é devolvido como texto, sem tentar interpretar.
 */
export function formatarData(valor: string | number): string {
  const texto = String(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  return data(new Date(`${texto}T00:00:00`)); // data() de lib/formato.ts
}
```

### 8.4 Acento

```css
/* app/globals.css — só estas quatro linhas mudam em relação ao pdi-time */
@theme {
  --color-accent: #a5540d;
  --color-accent-2: #edb90c;
  --color-accent-soft: #f9efe7;
  --color-accent-ink: #5e3008;
}
```

Entrada correspondente em `tasks/paleta-segmentos.json` (a acrescentar quando o app entrar no
catálogo, para `scripts/verificar-paleta.mjs` passar):

```json
"toolkit-dash-builder": {
  "segmento": "Dados",
  "acento": "#a5540d",
  "acento2": "#edb90c",
  "soft": "#f9efe7",
  "ink": "#5e3008",
  "hsl": [28, 85, 35],
  "contrasteBranco": 5.42
}
```

**"Dados" na paleta, "Gestão" na ilustração — são dois conceitos com o mesmo nome.** O *segmento da
paleta* é o campo `segmento` de `tasks/paleta-segmentos.json`: texto livre, só usado por
`scripts/verificar-paleta.mjs` para exigir ΔE ≥ 10 entre segmentos diferentes (não há lista fixa).
Aqui ele é **"Dados"**, novo. O *`Segmento` de ilustração* é o tipo de `lib/ilustracao.ts:6-14`
(`"RH" | "Marketing" | "Vendas" | "Financeiro" | "Atendimento" | "Estratégia" | "Gestão" |
"Jurídico"`), arquivo `[PRODUTO]` comparado byte a byte, exigido por `SetupPage`
(`components/setup.tsx:48`) e `Hero` (`components/ui.tsx:225`). Ele não tem "Dados", e acrescentar
seria registrar uma exceção ao padrão por causa de uma ilustração. Por isso os componentes usam
**`segmento="Gestão"`** — segmento sem ilustração de pessoa (só o `.blob-acento`), como
`agente-kanban` e `reunioes-ia`. Precedente do mesmo desacoplamento: `voz-do-cliente` tem área
"Experiência do Cliente e Marketing" e usa `segmento="Marketing"`. Registrar no `CLAUDE.md` do app.

**Por que este acento.** Segmento novo na paleta, **Dados**, porque nenhum app do padrão ocupa esse território
(o `automl-pocket` tem `padrao: "proprio"` e fica fora da paleta). Os 18 acentos atuais se
distribuem em quatro faixas de matiz — verdes e teais 140–199, azuis 204–230, violetas 248–275 e
magentas 300–344 — e **toda a faixa 0–139 está livre**. A varredura de candidatos (matiz 15–50,
saturação 50–85, luminosidade 24–40) filtrada por contraste contra branco entre 4,8 e 7,5 e ΔE76 ≥
12 contra todos os acentos existentes devolveu 2.527 combinações válidas; a escolhida tem contraste
**5,42:1** (AA em qualquer tamanho de texto) e ΔE mínimo **48,3** (contra `clone-site`, `#792a3f`),
muito acima do piso de 10 entre segmentos. As três derivadas saem das fórmulas oficiais do
`PADRAO.md:35`: `acento2` = matiz +18°, saturação +12 (teto 90), luminosidade +14 (teto 66); `soft` =
mesma matiz, saturação teto 60, luminosidade 94; `ink` = mesma matiz, saturação +10 (teto 85),
luminosidade −18 (piso 20).

Além de estar livre, o laranja queimado é o acento **certo para este produto**: é o único app da
suíte cujo conteúdo principal são barras, linhas e fatias pintadas com a cor de acento, e um laranja
quente sobre fundo claro lê melhor em gráfico do que os azuis e violetas já ocupados. O gradiente
`--gradiente-acento` (`#a5540d` → `#edb90c`) dá ao botão primário e aos ícones circulares um tom
âmbar que combina com a leitura de "painel".

### 8.5 Textos e vocabulário

O app fala de painéis, não de *dashboards*. **Vocabulário obrigatório na tela:**

| Nunca escrever | Escrever |
|---|---|
| dashboard | painel |
| KPI, métrica | indicador |
| componente, widget, card | cartão, gráfico, tabela |
| spec, config, schema | especificação (só em documentação, nunca na tela) |
| layout, grid | disposição, grade (evitar; descrever o que se vê) |
| mock, dados fictícios | números de exemplo |
| prompt | pedido, descrição |
| chart | gráfico |
| refine, refinar (na tela) | ajustar, mudar |
| insight | observação |
| MRR, ARR, churn | receita recorrente mensal, receita recorrente anual, cancelamento |

Siglas aceitas por serem de uso corrente no Brasil: **NPS**. Tudo o mais é escrito por extenso — a
mesma regra vale dentro dos prompts, para os títulos gerados pela IA obedecerem.

`scripts/verificar-jargao.mjs` varre `app/page.tsx` e todo `components/*.tsx` (exceto `setup.tsx`) e
reprova `/setup`, `webhook`, `token`, ` ID`, `OpenRouter`, `Nemotron`, `gpt-`, `API`, `endpoint`,
`env` — inclusive como nome de variável ou de chave JSON. Consequências concretas para este app:

- `components/AcessoMCP.tsx` **é** varrido: a palavra "token" não pode aparecer ali (o padrão já
  resolve chamando de "código de acesso").
- Todo `fetch("/api/painel/refinar", { ... })` precisa caber em **uma linha**, porque a regex de
  isenção roda por linha.
- Nada de `id` como texto visível: o `/r/[id]` é "link do painel".
- Se algum termo for inevitável, entra em `scripts/jargao-excecoes.json` com o motivo — nunca fica
  sem registro.

### 8.6 Uma animação só
Apenas o `reveal` do resultado, que já vem de `globals.css`. Sem gradiente decorativo, sem contador
animado no indicador, sem gráfico que "cresce" ao aparecer (além de ser proibido pelo padrão,
atrapalha a captura headless — ver a nota de `--force-prefers-reduced-motion` no `CLAUDE.md` do
`pdi-time`).

---

## 9. Deploy e operação

### 9.1 Porta
**3020.** As 19 portas ocupadas vão de 3001 (`pdi-time`) a 3019 (`build-agentflows`). Entra no
`docker-compose.yml` da raiz e no do app como `3020:10000`, com volume nomeado
`toolkit-dash-builder-dados:/app/data`, e na tabela de portas do `README.md` da raiz.

### 9.2 Entrada em `catalogo.json`

Acrescentar ao fim do array `apps` (o `id` tem de ser igual ao nome da pasta). Decisão P2 fechada:
áreas `["Dados", "Gestão"]` ("Dados" já existe como área no catálogo, pelo `automl-pocket`, então
não cria filtro novo) e os textos abaixo, que separam este app do `financas-ia` pela pergunta que
cada um responde ("não sei quais indicadores pedir" contra "tenho a planilha"). O `nome` é o único
campo que ainda depende de confirmação humana (P1).

```json
{
  "id": "toolkit-dash-builder",
  "nome": "Painel Pronto",
  "areas": [
    "Dados",
    "Gestão"
  ],
  "problema": "O gestor sabe o que quer acompanhar, mas não sabe quais indicadores pedir nem como montar o painel.",
  "ia": "Identifica o setor do pedido, escolhe os indicadores certos, monta os gráficos e preenche com números de exemplo do mercado brasileiro.",
  "integracoes": "IA (OpenRouter). Nenhuma outra: os números são de exemplo.",
  "acento": "#a5540d",
  "porta": 3020,
  "captura": "capturas/toolkit-dash-builder.png",
  "capacidades": [
    "artefato",
    "mcp"
  ],
  "demo": null
}
```

### 9.3 `render.yaml`
**Gerado**, nunca escrito à mão: `node scripts/gerar-deploy.mjs` lê `catalogo.json` e escreve
`toolkit-dash-builder/render.yaml` (`runtime: image`, `image.url: ghcr.io/startse/toolkit-dash-builder:latest`,
`plan: free`, `region: oregon`, `healthCheckPath: /api/health`, só `PORT` em `envVars`, bloco `disk`
comentado). O gerador valida os campos novos e falha com mensagem clara se faltar algum. Validar o
gerador com `node --test scripts/gerar-deploy.test.mjs`.

Plano: **`free`, sem `persistencia`** (decisão P6, fechada). O app não precisa de disco persistente
para funcionar: o modo demonstração roda sem nada, a chave pode ser reconectada em um clique e o
valor do app é regenerável (painel em 30 s, sem dado do usuário). Dezesseis dos dezenove apps estão
assim. O `README.md` do app traz a frase padrão do gerador ("No plano free o disco é efêmero…",
`scripts/gerar-deploy.mjs:148-149`). Reavaliar junto com a fonte de dados real da v2, quando houver
algo a perder; o caminho então será `persistencia: { "plano": "0.5c-512mb", "discoGB": 1,
"discoGuarda": "a chave da IA e os painéis salvos" }`.

### 9.4 Ícone
`node scripts/gerar-icones.mjs` gera `toolkit-dash-builder/app/icon.svg` a partir do `acento` do
catálogo (e atualiza os demais se alguma cor mudou). Nunca escrito à mão.

### 9.5 Variáveis

Nenhuma obrigatória (`PADRAO.md:49`). Tabela do `README.md` do app:

| Variável | Para quê | Onde obter |
|---|---|---|
| `OPENROUTER_API_KEY` | Liga a IA. Alternativa a conectar em Configurações. | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Força um modelo específico. Sem ela, o app escolhe. | https://openrouter.ai/models |
| `APP_URL` | Endereço público, para os links que o app gera. | a URL da instância |
| `DATA_DIR` | Onde fica o banco. Padrão `./data`; no Docker, `/app/data`. | — |
| `CHAVE_MESTRA` | Chave de 32 bytes em base64 que cifra as chaves guardadas. Sem ela, o app gera uma e guarda em `<DATA_DIR>/chave-mestra`. | gerada pela equipe técnica |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta na próxima subida; pode ser removida depois. | — |
| `PORT` | Porta do servidor. O Render define `10000`. | — |
| `CONTA_DESLIGADA` | Só no contêiner efêmero de captura de prévia. Nunca em instância real. | — |

Nenhuma credencial de suíte com sufixo `_APP` é usada: este app não conecta caixa de e-mail. Mesmo
assim o `Dockerfile` é **cópia idêntica** do `pdi-time`, com os `ARG`/`ENV` de `GOOGLE_*_APP` e
`MICROSOFT_*_APP`: o workflow passa os quatro `build-args` a todos os apps
(`.github/workflows/publicar.yml:85-89`), o `buildx` só avisa sobre argumento não consumido, e
`lib/email-envio.ts:31` (`[INFRA]`) sem valor apenas esconde os botões em `/setup`. Menos arquivos
diferentes do `pdi-time` = menos manutenção.

### 9.6 Publicação
Push na `main` → `.github/workflows/publicar.yml` constrói a imagem, publica em
`ghcr.io/startse/toolkit-dash-builder:latest`, regenera o repositório público
`StartSe/ai-action-app-deploy` (branch `deploy-toolkit-dash-builder` com o Blueprint) e captura
`/?exemplo=1&captura=1` para o catálogo. **Passo manual obrigatório depois do primeiro build:**
tornar o pacote público em https://github.com/orgs/StartSe/packages → o pacote → Package settings →
Change visibility → Public. Sem isso o botão "Publicar no Render" não funciona e o job avisa no
resumo.

---

## 10. Plano de implementação

Dez etapas. Cada uma termina com o app **funcionando** e verificado; nenhuma deixa o repositório num
estado quebrado. `npm run lint` (zero erros) e `npm run build` (sem erros) valem para todas — só são
repetidos abaixo quando há algo específico a olhar.

---

**Etapa 1 — Esqueleto do app a partir do `pdi-time`**
`cp -r pdi-time toolkit-dash-builder`; apagar **só** o domínio do PDI (`lib/pdi.ts`,
`lib/autoavaliacoes.ts`, `lib/checkins.ts`, `lib/entregas-quadro.ts`, `lib/notificacoes-do-app.ts`,
`app/api/pdi/**`, os quatro componentes de domínio, `components/Rotinas.tsx`); trocar `package.json`
(**só** o `name` — `nodemailer` e `@types/nodemailer` ficam), `app/layout.tsx` (`metadata`),
`app/globals.css` (as 4 cores), `docker-compose.yml` (porta 3020 e nome do volume); `Dockerfile` e
`.env.example` ficam **idênticos** aos do `pdi-time`; **nada** sai de `app/api/setup/**` (inclusive
`oauth/google`, `oauth/microsoft`, `oauth/mcp`); `app/setup/page.tsx` com `segmento="Gestão"`;
acrescentar a entrada em `catalogo.json` e em `tasks/paleta-segmentos.json` (**juntas**, a regra 1 da
paleta exige); rodar `node scripts/gerar-deploy.mjs` e `node scripts/gerar-icones.mjs`; acrescentar o
serviço ao `docker-compose.yml` da raiz (e corrigir o comentário "3001 a 3018" da linha 2 para
"3001 a 3020") e a linha à tabela de portas do `README.md` da raiz. `app/page.tsx` fica
temporariamente com um "em construção".

*Como verificar:* `npm install && npm run build` (o type-check passa porque `nodemailer` ficou);
`node scripts/verificar-paleta.mjs` (sai 0); `scripts/verificar-padrao.sh` (é bash, não Node; sai 0
— o app novo já entra na comparação, e nenhuma pasta INFRA pode estar "ausente");
`git diff --stat` não toca nenhum outro app.

---

**Etapa 2 — Tipos, formatação e validador**
`lib/types.ts` (seção 5.1, com `refinadoEm?`), `lib/formatar.ts` (8.3, com `formatarData`) e
`lib/validar-painel.ts` (RF-06, com `{ modo, moviveis }` e `LARGURA_CLASSE`). Nenhum import `node:*`
nos três.

*Como verificar:* `npx tsc --noEmit`; um teste manual rápido com
`node --experimental-strip-types` chamando o validador com seis entradas ruins (tipo desconhecido,
id duplicado, linha estourando a largura 4, série de 30 pontos, rosca de 9 fatias → 6 com "Outros",
componente em `linha: 7` sem espaço → linha acrescentada) e conferindo o conserto;
`formatarData("2026-07-15")` devolve "15/07" com `TZ=America/Sao_Paulo`.

---

**Etapa 3 — Componentes visuais do painel**
`CartaoIndicador.tsx`, `GraficoBarras.tsx`, `GraficoSerie.tsx`, `TabelaPainel.tsx`,
`GraficoRosca.tsx`, `Painel.tsx`, `app/painel.css`. Nesta ordem (valor decrescente; a rosca é a que
pode cair para a v2 se apertar). Alimentados por um painel fixo escrito à mão.

*Como verificar:* uma página temporária renderizando os quatro painéis de exemplo; capturar em
1400×900, 768×1000 e 390×2600 com `shot.mjs` e **abrir as imagens**; conferir que não há rolagem
horizontal, que nenhum rótulo é cortado sem `title` e que a cor vem só do acento; imprimir a página
temporária em PDF pelo Chrome **com as opções padrão** e conferir que barras, fatias e barra de meta
aparecem (são `<rect>`/`circle` SVG); `node scripts/verificar-jargao.mjs toolkit-dash-builder` (sai 0).

---

**Etapa 4 — `lib/demo.ts` com os quatro painéis**
Escrever os quatro painéis completos (6 a 8 componentes cada, cobrindo os sete tipos, nenhuma
distribuição com mais de 6 fatias), a escolha por palavra-chave, `esclarecimentoDemo`,
`refinamentoDemo` e `observacoesDemo`.

*Como verificar:* os quatro renderizam na página temporária sem nenhum campo faltando;
`validarPainel()` não conserta nada em nenhum deles (se consertar, o exemplo está fora do padrão que
o prompt pede); leitura em voz alta de todos os textos procurando acento faltando.

---

**Etapa 5 — Geração: `lib/painel.ts` + `POST /api/painel`**
`SYSTEM_PAINEL`, `PROMPT_PAINEL`, `gerarPainel()` (com o caminho de demonstração primeiro e a
segunda tentativa própria do RF-06 a4), a rota (com `forcar`), o cache (`lib/cache-painel.ts`,
ignorando `refinadoEm`) e a gravação no histórico **sempre** (`id` em toda resposta).

*Como verificar:* build `standalone` de verdade —
`cp -r public .next/standalone/; cp -r .next/static .next/standalone/.next/;`
`DATA_DIR=/tmp/dash-dados PORT=3020 HOSTNAME=127.0.0.1 node --disable-warning=ExperimentalWarning .next/standalone/server.js &`
— e `curl` em `/api/health`, `/api/status` (`demo:true`), `POST /api/painel` com quatro prompts
diferentes (conferir que cada um cai no painel de exemplo certo), `POST /api/painel` com 5
caracteres (400 com mensagem), o mesmo pedido duas vezes (`reaproveitado: true` na segunda) e uma
terceira com `forcar: true` (`reaproveitado: false`), `GET /api/painel` e `DELETE /api/painel`.
Depois, com `OPENROUTER_API_KEY` de verdade: 10 gerações, medindo M2, M3 (quantas precisaram de
`[painel] segunda tentativa`) e M4, e **medindo os tokens reais de um painel** para registrar no
`CLAUDE.md` do app se os 8.000 de `maxTokens` são folga ou aperto.

---

**Etapa 6 — Tela principal: fases `vazio`, `carregando`, `pronto`, `erro`**
`app/page.tsx` com `Hero` (`segmento="Gestão"`), `Passos` (com `apoio`), `ChipsArea` (os oito
textos do RF-02), campo, `ETAPAS_CARREGANDO` (a quarta é a frase de espera longa), `Topbar` com o
`resumo` do RF-16 a2, render do painel em `<main>` próprio de largura total, "Gerar outra versão",
`Entregar` (com `id`)/`Origem`/`SeloIA`, `ErrorBox` com o pedido em itálico acima e "Tentar de novo",
`AbortController` de 120 s, e os atalhos `?exemplo=1` / `?captura=1` (sem passar pelo gate).

*Como verificar:* `/?exemplo=1` preenche e gera sozinho **sem** chamar `/api/painel/esclarecer`
(conferir na aba de rede); `/?exemplo=1&captura=1` não rola; simular a captura do workflow
(`google-chrome --headless=new --window-size=1200,800 --force-prefers-reduced-motion
--virtual-time-budget=8000 --screenshot=... "http://localhost:3020/?exemplo=1&captura=1"` com
`CONTA_DESLIGADA=1`) e **abrir a imagem**: tem de mostrar o painel comercial, não um questionário nem
o `Loading`; medir os cinco limites de texto e registrar as contagens no `CLAUDE.md` do app; capturar desktop vazio
(1400×900), desktop com exemplo (1400×1500, espera 5000) e celular (390×2600, `mobile 1`), **abrir
as três imagens** e corrigir o que estiver feio; `npm run lint` (atenção ao
`react-hooks/exhaustive-deps` com funções irmãs — inline em vez de extrair, nota 2 do `CLAUDE.md` do
`pdi-time`).

---

**Etapa 7 — Gate de esclarecimento**
`lib/esclarecer.ts`, `POST /api/painel/esclarecer`, `components/Esclarecimento.tsx` e a fase
`esclarecendo`.

*Como verificar:* um teste com `node --experimental-strip-types` chamando `precisaEsclarecerLocal()`
com os **oito textos dos chips** (todos `false`), "painel de vendas para minha empresa" (`true`),
"plano de RH" (`true`) e "faz um painel pra mim" (`true`) — RF-04 a8; `curl` com "faz um painel"
(perguntas, `origem: "local"` ou `"ia"`), com o prompt do chip de Vendas (`precisaEsclarecer:false`,
`origem:"local"`, **sem nenhuma chamada de IA** — conferir no log) e com um prompt de 25 caracteres.
Na tela: responder por chip, responder por texto, e o botão "Pular e gerar agora". Falha simulada da
IA neste passo não pode bloquear a geração.

---

**Etapa 8 — Refinamento e desfazer**
`refinarPainel()` (`maxTokens: 8000`, grava `refinadoEm`), `validarRefinamento()` (com `igual`,
renome de id e reinserção no índice original), `POST /api/painel/refinar`, `PUT /api/painel/[id]`,
`components/ConversaRefino.tsx`, a pilha de desfazer (persistindo pelo `PUT`) e `atualizarSaida`.

*Como verificar:* 15 pedidos de refinamento reais (trocar tipo, acrescentar indicador, remover
tabela, mudar título, mudar números, pedido ambíguo) medindo M5 (**posição incluída**: um componente
não pedido que troque de linha ou coluna conta como falha) e M6; conferir no log quantos componentes
foram restaurados por deriva e quantos ids renomeados foram desfeitos; confirmar que um pedido
ambíguo volta como `esclarecimento` sem mudar o painel; desfazer restaura o estado anterior sem
chamar a IA **e** `/r/[id]` passa a mostrar o estado restaurado; repetir o pedido original em
`POST /api/painel` depois de um refinamento e conferir que o cache **não** devolve o painel refinado
(`reaproveitado: false`).

---

**Etapa 9 — Observações, salvar, imprimir, copiar**
`POST /api/painel/observacoes`, `components/BannerObservacoes.tsx`, `/r/[id]`, `/imprimir/[id]`, os
dois botões de copiar.

*Como verificar:* gerar (já salvo), abrir `/historico`, abrir `/r/[id]`, imprimir em PDF pelo Chrome
**com as opções padrão** (sem marcar "Gráficos de fundo") e **abrir o PDF** conferindo que barras,
fatias, linha e barra de meta saíram, que a tabela está em uma página na largura total e que o rodapé
de "números de exemplo" está lá (RF-14 a5); uma tabela com data confere o dia certo com
`TZ=America/Sao_Paulo`; colar o CSV copiado no Excel e conferir separador e decimal;
`/r/<id inexistente>` cai em `not-found`.

---

**Etapa 10 — MCP, `/setup`, README, CLAUDE.md e verificação final**
`lib/ferramentas.ts` com as quatro ferramentas, `lib/integracoes.ts`, `lib/status-do-app.ts`,
`lib/rotinas-do-app.ts`, `components/AcessoMCP.tsx`, `app/setup/page.tsx` (`segmento="Gestão"`),
`README.md` no formato do de referência (com a frase do disco efêmero do plano `free`) e `CLAUDE.md`
com as notas aprendidas no caminho — no mínimo: a distinção segmento da paleta × `Segmento` de
ilustração (8.4), a decisão do `<main>` próprio na fase `pronto` (P4), os tokens reais medidos na
Etapa 5 e as contagens dos limites de texto.

*Como verificar:* a lista completa do `PADRAO.md:95-99` —
`npm install` · `npm run lint` (zero) · `npm run build` (zero) ·
`node scripts/verificar-jargao.mjs toolkit-dash-builder` (zero) ·
`node scripts/verificar-paleta.mjs` (zero) · `scripts/verificar-padrao.sh` (zero) ·
`node --test scripts/gerar-deploy.test.mjs` ·
build `standalone` no ar com `curl` em `/api/health`, `/api/status`, `GET /api/setup`,
`PUT /api/setup` com chave falsa (conferir `ai:true` no status), `PUT` com `null` (apagar),
`POST /api/setup/testar` (deve dar `ok:false` com mensagem clara) e todas as rotas de domínio em
demonstração; MCP pelo Inspector (`npx @modelcontextprotocol/inspector`, Streamable HTTP,
`http://localhost:3020/mcp`, `Authorization: Bearer <código>`) chamando as quatro ferramentas;
capturas de `/` e `/setup` em desktop e celular, **abertas e revisadas**; encerrar o servidor
(`lsof -ti :3020 | xargs kill`). Não rodar `docker build` — o Actions constrói no push.

---

## 11. Perguntas abertas e hipóteses assumidas

### Perguntas abertas — fechadas na Fase 5 (só P1 continua aguardando confirmação humana)

**P1. O nome e o id definitivos — FECHADA, com uma confirmação pendente.** O id fica
`toolkit-dash-builder`: o custo de mudar é alto (nome da imagem `ghcr.io/startse/toolkit-dash-builder`,
`NOME_SERVIDOR` do MCP, branch público de deploy) e o id não aparece na tela. O nome de exibição
passa a **"Painel Pronto"**: o catálogo já tem **"Posts em Minutos"** (`catalogo.json:76`,
`posts-sociais`) e dois apps "X em Minutos" lado a lado soariam como uma família que não existe;
`marca="P"` continua valendo. **Esta é a única decisão humana ainda pendente do PRD: Renato confirma
"Painel Pronto" antes do primeiro push.** Se preferir outro nome, muda só o `nome` do catálogo, o
`metadata.title`, o `nome` da `SetupPage`/`Topbar` e o `README.md` — nada de código.

**P2. As áreas no catálogo e a fronteira com `financas-ia` — FECHADA.** `["Dados", "Gestão"]` e os
textos de 9.2 (ajustados ao nome novo). "Dados" já existe como área (`automl-pocket`), não cria
filtro novo; o `problema` escrito pela pergunta ("não sabe quais indicadores pedir") separa bem do
`financas-ia` ("tenho a planilha").

**P3. O segmento novo "Dados" na paleta — FECHADA.** Aprovado. `scripts/verificar-paleta.mjs` não
tem lista fixa de segmentos — só exige ΔE ≥ 10 contra os outros, e o acento tem 48,3. A objeção real
nunca foi a paleta, e sim o tipo `Segmento` de ilustração (`lib/ilustracao.ts`): nos componentes usa-se
**`segmento="Gestão"`**; a distinção está documentada em 8.4 e vai para o `CLAUDE.md` do app.

**P4. A forma da tela no estado "pronto" cabe na regra de tela única? — FECHADA.** Sim, **sem**
`"independente": true`. `Workspace`/`Panel`/`Stage` nas fases `vazio`, `esclarecendo`, `carregando` e
`erro`; um `<main>` próprio de largura total na fase `pronto` (8.1). O padrão não compara
`app/page.tsx`, e `financas-ia` já tem precedente.

**P5. `pizza`/`rosca` entram na v1? — FECHADA.** Sim. Com `stroke-dasharray` em `<circle>` são ~60
linhas, e cortar custaria mais (os quatro painéis de demonstração, o layout canônico e o prompt
teriam de mudar). Condições: máximo de **6 fatias** (excedente em "Outros"), degraus de opacidade
**≥ 12 pontos**, legenda com valor e percentual. Continua sendo o último da ordem de implementação;
se cair, cai junto com a mudança do prompt, nunca só o componente.

**P6. Persistência no Render — FECHADA.** Plano **`free`, sem `persistencia`** na v1 (9.3). O valor
do app é regenerável e o modo demonstração cobre a instância que perdeu a chave. Reavaliar com a
fonte de dados real da v2.

### Hipóteses assumidas (decididas aqui; mudar exige revisar o PRD)

| # | Hipótese | Base |
|---|---|---|
| H1 | Os números continuam 100 % fictícios na v1; não há fonte de dados real | Documento de core, seção 3; é o que mantém o app dentro de "dois minutos sem nenhuma chave" |
| H2 | `goal_chart` não existe; meta é um campo opcional do indicador | Risco 2 do documento de core (o tipo está quebrado na origem) |
| H3 | A grade tem 4 colunas, não 3 | A origem dizia 3 colunas mas pedia 4 indicadores em `col 0,1,2,3` na linha 0 — incoerência corrigida aqui |
| H4 | Uma chamada síncrona, sem streaming e sem polling | O streaming da origem não entrega nada útil; `Loading({etapas})` cobre a percepção |
| H5 | Insights só sob demanda, nunca automáticos | Economia de cota do modelo gratuito (risco 7 do core) |
| H6 | Sem rotina e sem formulário público na v1; `capacidades: ["artefato","mcp"]` | Decisões 13 e 14 do documento de core |
| H7 | Sem tabela nova no SQLite; painel é `Resultado` de `lib/historico.ts` com `tipo: "painel"` | Evita divergir de um arquivo `[INFRA]` e ganha `/historico`, `/r/[id]` e `/imprimir/[id]` de graça |
| H8 | Cache de 24 h por varredura de `listarPorTipo("painel", 50)`, sem índice | Escala de uma instância; a alternativa mexeria em `lib/historico.ts`, que é compartilhado |
| H9 | `maxTokens: 8000` na geração | Um painel de 8 componentes com séries de 12 pontos e tabela de 10×6 cabe em ~6 mil; medir na etapa 5 |
| H10 | Vocabulário de tela sem "dashboard", "KPI" e "componente" | `scripts/verificar-jargao.mjs` e a regra de PT-BR do `PADRAO.md` |
| H11 | O refinamento devolve o painel completo (não um conjunto de operações) | É o desenho que se sabe que funciona; trocar é evolução da v2 (risco 5 do core) |
| H12 | Acento `#a5540d`, segmento "Dados" na paleta | Seção 8.4; validado contra as cinco regras de `scripts/verificar-paleta.mjs` (contraste 5,42; ΔE mínimo 48,3) |
| H13 | Porta 3020 | Próxima livre; 3019 é `build-agentflows` |
| H14 | O painel é salvo **sempre** na geração; não há botão "Salvar"; `guardar` existe só no MCP | Padrão do `pdi-time` com `SENSIVEL = false` (`lib/pdi.ts:31-34`); `Entregar` só oferece link e impressão quando há `id`; Desfazer persiste por `PUT /api/painel/[id]` |
| H15 | `segmento="Gestão"` em `SetupPage` e `Hero` (sem ilustração de pessoa); "Dados" só na paleta | `Segmento` de `lib/ilustracao.ts` não tem "Dados" e o arquivo é `[PRODUTO]`, comparado byte a byte (8.4) |
| H16 | Distribuições com **6 fatias no máximo**; excedente vira "Outros" | Fatias diferenciadas só por opacidade do acento precisam de degraus ≥ 12 pontos para serem legíveis (e sobreviverem ao preto e branco) |
| H17 | `gerarPainel` tem segunda tentativa própria (< 5 componentes válidos); erro só abaixo de 3; `maxTokens` 8.000/8.000/1.200/600 | `askJSON` só repete no erro de *parse* (`lib/ai.ts:225-242`); `askText` usa 4.000 por padrão |
| H18 | Painel refinado não serve de cache (`refinadoEm`); "Gerar outra versão" envia `forcar: true` | `atualizarSaida` sobrescreve só a `saida` (`lib/historico.ts:75-78`); sem isso o cache devolveria painéis mutilados e nunca uma versão nova |
| H19 | Toda cor impressa é `fill`/`stroke` de SVG; tabela de impressão é `<table>` próprio de largura total | O Chrome não imprime fundo de `div` por padrão; o `DataTable` cai no modo cartão em A4 (US-020) |
