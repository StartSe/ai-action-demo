# Analista Financeiro

Leitura instantânea da planilha de despesas por IA: o executivo solta um CSV, vê os números que importam e pergunta o que quiser em linguagem natural. Área: Financeiro.

## O que resolve
O executivo recebe a planilha de despesas do mês e não tem tempo de destrinchar linha por linha. Este app lê o CSV inteiramente no navegador (nada é enviado no upload), calcula totais, médias, variação do último mês, maiores categorias e maiores lançamentos, desenha os gráficos e usa a IA só para a leitura em texto e para responder perguntas — enviando apenas um resumo agregado e uma pequena amostra de linhas, nunca a planilha inteira.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com uma leitura de exemplo calculada a partir dos números reais da planilha carregada.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para carregar o CSV de exemplo e analisar automaticamente.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3009
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/financas-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-financas-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3009:10000 -v financas-ia-dados:/app/data ghcr.io/startse/financas-ia:latest` e abra http://localhost:3009.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Privacidade dos dados
O CSV é lido e processado inteiramente no navegador (parser próprio em `lib/csv.ts`, cálculos em `lib/analise.ts`). Nenhum arquivo é enviado ao servidor. Só dois tipos de informação saem do navegador, e apenas quando o executivo pede uma leitura ou faz uma pergunta:
- um resumo agregado (totais, médias, valores por mês e por categoria, variações, cinco maiores lançamentos);
- uma amostra de até 60 linhas normalizadas, usada somente para responder perguntas específicas.

## Estrutura
```
app/page.tsx               tela única (upload, mapeamento de colunas e resultado)
app/api/insights/route.ts  geração da leitura em texto a partir do resumo
app/api/perguntar/route.ts respostas a perguntas livres sobre os números
app/setup/page.tsx         configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/             leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts    informa ao frontend se a IA está conectada
app/api/health/route.ts    health check
components/ui.tsx          componentes visuais compartilhados pela suíte
components/setup.tsx       tela de setup genérica, gerada a partir de lib/integracoes.ts
components/GraficoMeses.tsx       gráfico SVG de despesas por mês
components/GraficoCategorias.tsx  gráfico SVG de despesas por categoria
lib/store.ts               configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts         tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts         integrações que este app precisa
lib/ai.ts                  cliente OpenRouter (askText, askJSON)
lib/demo.ts                resposta de exemplo do modo demonstração
lib/types.ts                tipos do domínio
lib/csv.ts                  parser de CSV (separador, aspas, números e datas em pt-BR)
lib/analise.ts               cálculos sobre os lançamentos (totais, meses, categorias, variações)
public/exemplo-despesas.csv  CSV de exemplo (~120 lançamentos, 6 meses, 7 categorias)
Dockerfile                build multi-stage com saída standalone
docker-compose.yml         sobe este app isolado
render.yaml                 blueprint do Render (runtime image)
```

## Limitações conhecidas
- O parser de CSV assume que cada arquivo tem uma linha de cabeçalho e datas em `dd/mm/aaaa` ou `aaaa-mm-dd`; outros formatos de data não são reconhecidos.
- Valores negativos são tratados como despesas (valor absoluto); o app não distingue receitas de despesas.
- A sugestão automática de colunas é uma heurística por nome e conteúdo; sempre confira o mapeamento antes de analisar.
