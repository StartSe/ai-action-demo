# Leitura de Contratos

Análise de contratos por IA: riscos, prazos críticos, obrigações e o que está faltando, do ponto de vista de quem vai assinar. Área: Jurídico.

## O que resolve
O executivo recebe um contrato de 30 páginas e precisa decidir rápido o que negociar antes de mandar para o jurídico. Este app lê o contrato (PDF ou texto colado), identifica as partes, resume o essencial, dá uma nota de risco para o papel informado, aponta as cláusulas que merecem atenção com sugestão de negociação, lista prazos críticos e o que não está no contrato, e ainda responde perguntas sobre o documento.

Limites: PDF de até 10 MB. Contratos muito longos são cortados em ~120 mil caracteres antes de ir para a IA, e o resultado avisa quantas páginas foram lidas. PDFs digitalizados (imagem sem camada de texto) podem ter leitura limitada; nesse caso, cole o texto do contrato. O contrato fica em memória por 1 hora (para as perguntas) e nunca é gravado em disco.

## Integrações
Obrigatória: IA (OpenRouter). Opcionais: Notificações (e-mail ou Slack) para os avisos de 30 dias antes de cada prazo, e Quadro de tarefas (MCP) para mandar os pontos a negociar como cartões ao time.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Extração de texto de PDF com `unpdf`.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo e testa a conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar, o app roda em modo demonstração com a análise de um contrato de exemplo.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para carregar o contrato de exemplo e analisar automaticamente.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3007
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/contratos-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-contratos-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3007:10000 -v contratos-ia-dados:/app/data ghcr.io/startse/contratos-ia:latest` e abra http://localhost:3007.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                 tela única (abas PDF/texto + resultado)
app/api/analisar/route.ts    recebe PDF (multipart) ou texto e devolve a análise
app/api/perguntar/route.ts   responde perguntas sobre o contrato já analisado
app/setup/page.tsx           configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/               leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts      informa ao frontend se a IA está conectada
app/api/health/route.ts      health check
components/ui.tsx            componentes visuais compartilhados pela suíte
components/setup.tsx         tela de setup genérica, gerada a partir de lib/integracoes.ts
lib/store.ts                 configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts           tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts           integrações que este app precisa
lib/ai.ts                    cliente OpenRouter (askText, askJSON)
lib/demo.ts                  análise e respostas de exemplo do modo demonstração
lib/estado.ts                contratos guardados em memória por 1 hora (Map)
lib/types.ts                 tipos do domínio
public/exemplo-contrato.txt  contrato fictício usado no botão "Usar contrato de exemplo"
Dockerfile                   build multi-stage com saída standalone
docker-compose.yml           sobe este app isolado (porta 3007)
render.yaml                  blueprint do Render (runtime image)
```
