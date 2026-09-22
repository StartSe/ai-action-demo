# Análise de Perda

Agrupa as notas de perda de oportunidades do CRM (texto livre) pelo motivo real, com os trechos das notas que comprovam cada grupo. Área: Vendas.

## O que resolve
"Perdemos por preço" é a resposta padrão do time comercial e quase nunca é a verdadeira — mas ninguém lê 200 notas de perda para achar o motivo de verdade. Este app sobe um CSV exportado do CRM, lê as notas de perda em texto livre e agrupa por motivo real (não a categoria genérica que o CRM já trazia), com a contagem e os trechos reais que sustentam cada grupo. Nenhuma oportunidade é reclassificada ou escrita de volta no CRM: é só leitura e agrupamento.

**Rigor anti-alucinação:** nenhum grupo aparece sem pelo menos uma nota real que o sustente; um motivo com menos de 3 ocorrências fica em uma seção separada ("Poucas ocorrências"), nunca forçado dentro de um grupo maior; notas vazias, ambíguas ou sem motivo claro vão para um grupo explícito "Sem motivo identificado na nota", contado à parte.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração: as notas do CSV enviado (ou do exemplo) são agrupadas por um classificador simples de palavra-chave, sem IA — os grupos continuam vindo das notas reais, nunca de uma resposta fixa.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e analisar o CSV de exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3024
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/analise-de-perda:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-analise-de-perda (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3024:10000 -v analise-de-perda-dados:/app/data ghcr.io/startse/analise-de-perda:latest` e abra http://localhost:3024.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `analisar_perdas` diretamente. Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup` e configure o assistente com o endereço (`https://<seu-app>/mcp`) e o código como `Authorization: Bearer <código>`.

```bash
curl -X POST https://<seu-app>/mcp \
  -H "Authorization: Bearer <código>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

O cartão também mostra um passo a passo de três passos para o Claude Desktop e para o ChatGPT, e um botão "Copiar configuração" que copia um JSON pronto (endereço + código) logo após gerar um acesso.

### Testar com o MCP Inspector
```bash
npx @modelcontextprotocol/inspector
```
Na interface que abre no navegador, escolha o transporte "Streamable HTTP", cole `http://localhost:3000/mcp` (ou o endereço do deploy) em URL e adicione o cabeçalho `Authorization: Bearer <código>` em "Custom Headers". Clique em "Connect": a aba "Tools" deve listar `analisar_perdas`; ao executá-la com um CSV no campo `csv`, o resultado devolvido é o mesmo objeto (grupos, poucas ocorrências, sem motivo) que a rota `/api/perdas` produz.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Modelo usado no dia a dia do app. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx             tela única (upload do CSV + resultado agrupado)
app/api/perdas/route.ts  análise (POST), histórico (GET) e limpeza (DELETE)
app/mcp/route.ts         endpoint MCP (JSON-RPC 2.0) para assistentes de IA
app/api/mcp/token/route.ts  gera, consulta e revoga o código de acesso do endpoint MCP
app/setup/page.tsx       configuração inicial (chave da IA, OAuth, teste de conexão, acesso MCP)
app/api/setup/           leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts  informa ao frontend se a IA está conectada
app/api/health/route.ts  health check
components/ui.tsx        componentes visuais compartilhados pela suíte
components/setup.tsx     tela de setup genérica, gerada a partir de lib/integracoes.ts
components/AcessoMCP.tsx cartão do /setup para gerar/revogar o acesso MCP
lib/store.ts             configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts       tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts       integrações que este app precisa (só OpenRouter)
lib/ai.ts                cliente OpenRouter (askText, askJSON, askWithTools)
lib/mcp.ts               protocolo MCP (JSON-RPC 2.0), código de acesso e limite de chamadas
lib/ferramentas.ts       ferramentas expostas via MCP (analisar_perdas)
lib/csv.ts               parser de CSV e detecção da coluna de nota de perda
lib/perdas.ts            lógica de análise (IA real ou fallback por palavra-chave), usada pela rota HTTP e pela ferramenta MCP
lib/demo.ts               classificador determinístico de demonstração (sem IA)
lib/types.ts              tipos do domínio
public/exemplo-perdas.csv CSV de exemplo usado por "Preencher com um exemplo" e por ?exemplo=1
Dockerfile                build multi-stage com saída standalone
docker-compose.yml        sobe este app isolado
render.yaml                blueprint do Render (runtime image)
```
