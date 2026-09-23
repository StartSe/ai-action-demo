# Painel Pronto

Painel de indicadores gerado por IA a partir de uma frase: indicadores com comparação, gráfico de tendência, ranking, distribuição e tabela, com números de exemplo do mercado brasileiro, prontos para ajustar conversando e imprimir. Área: Dados e Gestão.

## O que resolve
O gestor sabe o que quer acompanhar, mas não sabe quais indicadores pedir nem como montar o painel. Este app identifica o setor do pedido, escolhe os indicadores que um analista escolheria, monta os gráficos e preenche os números.

Há dois caminhos, e eles entregam coisas diferentes:

1. **Sem arquivo** — os números são de exemplo. A entrega é a *especificação* do painel: quais indicadores, quais gráficos, qual layout. É o passo anterior ao BI.
2. **Com a sua planilha** (`Usar os seus dados`) — os números são **calculados a partir do seu arquivo**. A entrega é o painel de verdade.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Gráficos feitos à mão em SVG (sem biblioteca).

## Usar os seus dados (planilha)
Na tela inicial, no cartão **Usar os seus dados**, envie um CSV (ou arraste o arquivo). O app lê o arquivo, mostra cada coluna com o tipo que reconheceu (número, data ou texto) para você conferir antes de gerar, e monta o painel com os números reais.

**A IA nunca escreve um número.** Ela recebe só a lista de colunas — nome, tipo e estatística, nunca as linhas — e devolve a *receita* de cada componente: qual coluna agrupar, qual agregar e qual conta fazer (soma, média, contagem, mínimo, máximo, distintos). Quem calcula é o servidor, em `lib/agregar.ts`, percorrendo as linhas do arquivo. Um número escrito pela IA seria descartado pelo validador. Essa separação é o ponto do recurso: um número inventado que se parece com o seu é pior do que número nenhum.

Sem chave de IA o recurso **continua funcionando**: `receitasAutomaticas()` escolhe o recorte pela forma das colunas (a medida em dinheiro vira indicador, a coluna de data vira tendência, a categoria com poucos valores vira ranking e distribuição). O painel avisa na tela que o recorte foi automático. Com a IA conectada o recorte fica melhor e passa a obedecer ao que você escreveu no campo de texto.

Detalhes que importam:

- **Formato:** CSV, TSV ou separado por `;` ou `|` — o separador é descoberto sozinho. Aspas, quebra de linha dentro do campo e o BOM do Excel são tratados. `.xlsx` **não** é lido: o app reconhece o arquivo e pede para salvar como CSV.
- **Codificação:** tenta UTF-8; se os bytes não forem válidos, relê como Windows-1252 (o que o Excel em português escreve) e avisa na tela. Sem isso, "Indicação" chegava ilegível.
- **Colunas de código** (CEP, CPF, CNPJ, id, telefone, matrícula, ano) são lidas como texto, não como número: o `01310` mantém o zero à esquerda e nenhuma delas entra numa soma. Antes disso o painel exibia "Total de CEP".
- **Errou o tipo?** Cada coluna tem um seletor na tela de conferência: troque para número, data ou texto e o arquivo é relido na hora.
- **Células que não convertem** (um `N/A` numa coluna numérica) viram vazio, e a tela diz quantas foram — elas não entram nas contas.
- **Números:** `R$ 21.572,39`, `1,234.56`, `12,5%` e `(1.500,00)` (negativo entre parênteses) são todos entendidos. Dinheiro e percentual são reconhecidos pelo cabeçalho e pelos valores, e definem o formato na tela.
- **Datas:** `21/09/2026`, `2026-09-21`, `09/2026` e `Set/2026`. A série temporal agrupa por dia, mês, trimestre ou ano.
- **Limites:** 8 MB por arquivo, 50 mil linhas e 60 colunas. Acima disso o arquivo é lido até o teto e a tela avisa. Medido no teto (50 mil linhas, 7,1 MB): envio em 0,7–1,6 s, painel em 0,4 s, ajuste em 0,25 s, memória de pico 228 MB.
- **Comparação:** o indicador fala do último período **fechado**, e compara com o fechado anterior. Um arquivo que termina no meio do mês mostraria um pedaço contra um mês inteiro — num recorte de 30 dias isso rendia +2818%, que media a janela e não o negócio. Sem nenhum período fechado, mostra o mais recente sem comparar; sem coluna de data, mostra o total do arquivo e omite a comparação.
- **Período do gráfico** sai da janela do arquivo: até 62 dias por dia, até 2 anos por mês, até 5 anos por trimestre, acima disso por ano.
- **Guarda:** a planilha fica no mesmo `app.sqlite` por 30 dias, para o painel poder ser reaberto por `/r/<id>` e impresso. Depois é apagada sozinha.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com quatro painéis de exemplo (vendas, financeiro, marketing e assinaturas), escolhidos pelas palavras do pedido.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher com o pedido de Vendas e gerar sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3020
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/toolkit-dash-builder:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-toolkit-dash-builder (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3020:10000 -v toolkit-dash-builder-dados:/app/data ghcr.io/startse/toolkit-dash-builder:latest` e abra http://localhost:3020.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Como funciona
1. **Descreva** o painel em uma frase (ou clique num dos oito chips por área: Vendas, Financeiro, Marketing, Operações, SaaS, E-commerce, Agência, RH).
2. **Esclarecimento** (só quando o pedido é curto ou vago): uma heurística local decide, sem IA, se vale perguntar; no caso duvidoso a IA faz de 1 a 3 perguntas com respostas sugeridas. "Pular e gerar agora" está sempre disponível.
3. **Geração**: a IA identifica o setor, escolhe de 5 a 8 componentes (indicadores, linha/área, barras, pizza/rosca, tabela) e preenche com números de exemplo. Um validador no servidor conserta o que vier fora do formato (tipos desconhecidos, posições sobrepostas, séries longas demais) e pede uma segunda tentativa quando sobram menos de 5 componentes.
4. **Ajuste conversando**: "troque o gráfico de barras por pizza", "acrescente ticket médio", "tire a tabela". Só os componentes que você citou mudam; o resto volta idêntico (validação anti-deriva). "Desfazer" restaura os 5 últimos estados.
5. **Analisar**: até três observações sobre o painel (anomalia, tendência, sugestão), sempre sobre os números de exemplo, nunca sobre a sua empresa.
6. **Leve embora**: o painel é salvo na geração; "Baixar PDF" abre `/imprimir/<id>` em A4; "Copiar dados da tabela" e "Copiar números do painel" põem CSV (`;` e vírgula decimal) na área de transferência; `/historico` lista tudo e `/r/<id>` reabre.

Um pedido repetido em até 24 h reaproveita o painel salvo sem chamar a IA; "Gerar outra versão" ignora esse cache de propósito.

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem as ferramentas `criar_painel`, `refinar_painel`, `listar_paineis` e `obter_painel` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), em vez do pacote `@modelcontextprotocol/sdk` — mesma filosofia de `lib/store.ts` (SQLite sem dependências externas). Rate limit de 60 chamadas por minuto por código, em memória.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". A aba "Tools" deve listar as quatro ferramentas; `criar_painel` com uma descrição devolve o mesmo objeto (painel, id e link) que a rota `/api/painel` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Para quê | Onde obter |
|---|---|---|
| `OPENROUTER_API_KEY` | Liga a IA. Alternativa a conectar em Configurações. | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | Força um modelo específico. Sem ela, o app escolhe (`nvidia/nemotron-3-super-120b-a12b:free`). | https://openrouter.ai/models |
| `APP_URL` | Endereço público, para os links que o app gera (ex.: nas ferramentas MCP). | a URL da instância |
| `DATA_DIR` | Onde fica o banco. Padrão `./data`; no Docker, `/app/data`. | — |
| `CHAVE_MESTRA` | Chave de 32 bytes em base64 que cifra as chaves guardadas. Sem ela, o app gera uma e guarda em `<DATA_DIR>/chave-mestra`. | gerada pela equipe técnica |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta na próxima subida; pode ser removida depois. | — |
| `PORT` | Porta do servidor. O Render e o Docker usam `10000`. | — |
| `CONTA_DESLIGADA` | Só no contêiner efêmero de captura de prévia. Nunca em instância real. | — |

Nenhuma credencial de suíte com sufixo `_APP` é usada: este app não conecta caixa de e-mail. O `Dockerfile` é cópia idêntica do `pdi-time` (com os `ARG` de `GOOGLE_*_APP`/`MICROSOFT_*_APP`) porque o workflow passa os mesmos `build-args` a todos os apps; sem valor, os botões simplesmente não aparecem em `/setup`.

## Organizar o painel
No painel pronto, **Reorganizar** deixa arrastar um cartão sobre outro para trocar a ordem e usar − / + para mudar a largura (1 a 4 colunas). **Salvar arranjo** grava: o link `/r/<id>` e a impressão passam a mostrar o arranjo escolhido. O arrasto nativo não funciona em toque, então os botões existem também para celular, e o teclado responde (setas movem, Shift + setas redimensionam).

## Ajustar conversando
Funciona nos dois tipos de painel, por caminhos diferentes:

- **Painel de exemplo:** a IA reescreve o painel, como antes.
- **Painel da sua planilha:** a IA (ou, sem chave, um editor por palavra-chave) muda a **receita**, e o servidor recalcula do arquivo. Nunca reescreve número.

Sem chave de IA o editor reconhece: trocar o tipo de um gráfico ("troque a barra por rosca"), tirar um cartão ("tire a tabela"), acrescentar um indicador ("acrescente o total de desconto"), mudar o período ("por trimestre") e mudar o agrupamento ("agrupe por UF"). O que não reconhece ele diz que não reconheceu, em vez de fazer algo aproximado.

## Testes
```bash
npm test     # vitest run
```
Cobrem a leitura da planilha (formatos de número e data, separador, aspas, tipagem das colunas), o
motor de agregação (cada agregação conferida contra um valor calculado à mão), as operações de
layout (invariantes da grade) e o editor de receitas sem IA. É o código onde um erro não quebra a
tela — entrega um painel bonito com a conta errada.

## Estrutura
```
app/page.tsx                    tela única (chips, campo, envio de planilha, esclarecimento, carregando, painel, conversa de ajuste)
app/api/painel/route.ts         POST gerar (aceita forcar) · GET listar · DELETE apagar tudo
app/api/painel/[id]/route.ts    GET obter · PUT gravar o estado do Desfazer · DELETE apagar um
app/api/painel/esclarecer/      POST avaliar o pedido (heurística local, depois IA)
app/api/painel/refinar/         POST ajustar um painel
app/api/painel/observacoes/     POST analisar o painel
app/r/[id]/page.tsx             reabre um painel salvo
app/imprimir/[id]/page.tsx      folha A4 (grade de 2 colunas, tabela em largura total)
app/mcp/route.ts                endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/setup/page.tsx              configuração inicial (chave, OAuth, teste de conexão, acesso MCP)
components/Painel.tsx           grade de 4 colunas e despacho por tipo de componente
components/CartaoIndicador.tsx  número grande, variação e barra de meta (SVG)
components/GraficoSerie.tsx     linha e área (SVG só com geometria; texto em HTML)
components/GraficoBarras.tsx    barras verticais e horizontais (<rect> em SVG)
components/GraficoRosca.tsx     pizza e rosca (circle + stroke-dasharray, até 6 fatias)
components/TabelaPainel.tsx     tabela (DataTable na tela; <table> próprio na impressão)
components/ChipsArea.tsx        os oito chips de sugestão por área
components/Esclarecimento.tsx   perguntas com chips + "Pular e gerar agora"
components/ConversaRefino.tsx   conversa de ajuste + Desfazer
components/BannerObservacoes.tsx até 3 observações, dispensável
lib/types.ts                    tipos do domínio (EspecPainel, ComponentePainel...)
lib/painel.ts                   prompts, gerarPainel, refinarPainel, observarPainel, validarRefinamento
lib/esclarecer.ts               heurística local + prompt do gate
lib/validar-painel.ts           validador/reparador da especificação
lib/formatar.ts                 moeda/número/percentual em pt-BR e CSV
lib/cache-painel.ts             cache por hash do pedido (24 h)
lib/demo.ts                     os quatro painéis de exemplo e as respostas de demonstração
lib/planilha.ts                 leitura de CSV/TSV, tipagem das colunas e perfil para a IA
lib/receita.ts                  a "receita" de um componente (quais colunas, qual agregação) e sua validação
lib/agregar.ts                  o motor de cálculo: receita + linhas do arquivo -> números do painel
lib/painel-dados.ts             painel a partir da planilha (prompt de receitas + recorte automático sem IA) e o ajuste
lib/refinar-receitas.ts         ajuste do painel de planilha: edita a receita (com IA ou por palavra-chave)
lib/layout.ts                   mover, redimensionar e reempacotar a grade
components/PainelEditavel.tsx   a grade no modo de reorganizar (arrastar, botões e teclado)
lib/dados-store.ts              guarda a planilha enviada por 30 dias
app/api/dados/route.ts          POST envia a planilha e devolve o perfil das colunas
components/EnvioPlanilha.tsx    envio do arquivo e conferência das colunas antes de gerar
lib/ferramentas.ts              ferramentas expostas via MCP
lib/ai.ts                       cliente OpenRouter (compartilhado)
Dockerfile                      build multi-stage com saída standalone
docker-compose.yml              sobe este app isolado (porta 3020)
render.yaml                     blueprint do Render (gerado)
```
