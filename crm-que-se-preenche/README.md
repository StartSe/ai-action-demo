# CRM que Se Preenche

O vendedor odeia preencher CRM, e o funil vira ficção. Este app escuta a reunião de vendas — colada, enviada como áudio ou gravada no navegador — e propõe uma atualização do negócio (etapa, valor, concorrente, próximo passo), cada campo com o trecho exato da transcrição que o sustenta. Área: Comercial.

## O que resolve
Depois de uma reunião de vendas, atualizar o CRM é a última coisa que o vendedor quer fazer — e o que não é atualizado não existe para quem acompanha o funil. Este app analisa a reunião e propõe a atualização com evidência ao lado de cada campo; a pessoa revisa, aceita só o que quiser e confirma antes de qualquer coisa ser aplicada ao negócio. Campo sem evidência clara na reunião fica marcado como tal — nunca é preenchido por suposição.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Transcrição de áudio via ElevenLabs Scribe ou OpenAI Whisper (opcional).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, e opcionalmente conecta a transcrição de áudio (ElevenLabs e/ou OpenAI). Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar a IA, o app roda em modo demonstração com uma proposta de exemplo; sem chave de transcrição, enviar ou gravar áudio devolve uma transcrição de exemplo — colar o texto continua analisando de verdade.

## Primeiro acesso
Ao abrir o app pela primeira vez você cria uma conta (nome, e-mail e senha) em `/conta`; nas próximas vezes, entre com e-mail e senha em `/entrar`. Esqueceu a senha? Peça à equipe técnica para definir a variável `NOVA_SENHA_ADMIN` com a nova senha e reiniciar o app uma vez — ela troca a senha da conta existente na subida e pode ser removida depois.

## Como funciona
1. Crie um negócio (empresa + contato).
2. Cole, envie ou grave a transcrição da reunião.
3. A IA propõe etapa, valor, concorrente e próximo passo — cada um com o trecho exato que sustenta a proposta, ou vazio quando a reunião não trouxe evidência.
4. Você aceita só os campos que quiser e confirma: só então o negócio é atualizado, com o evento registrado no histórico.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3020
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/crm-que-se-preenche:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-crm-que-se-preenche (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3020:10000 -v crm-que-se-preenche-dados:/app/data ghcr.io/startse/crm-que-se-preenche:latest` e abra http://localhost:3020.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Usar dentro de um assistente de IA (MCP)
O app expõe `POST /mcp`, um endpoint MCP (Model Context Protocol) próprio sobre JSON-RPC 2.0, para que assistentes como Claude ou ChatGPT chamem a ferramenta `analisar_reuniao` diretamente (analisa e devolve a proposta — nunca aplica no negócio). Gere um código de acesso no cartão "Usar dentro do seu assistente" em `/setup`.

Decisão de implementação: protocolo implementado à mão em `lib/mcp.ts` (JSON-RPC 2.0), em vez do pacote `@modelcontextprotocol/sdk` — mesma decisão de todos os apps da suíte.

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `NOVA_SENHA_ADMIN` | Redefine a senha da conta administrativa na próxima subida do app (recurso da equipe técnica; não aparece em `/setup`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `TRANSCRICAO_SERVICO` | Alternativa ao setup. Serviço de transcrição de áudio: `elevenlabs` (padrão) ou `openai`. |
| `TRANSCRICAO_API_KEY` | Alternativa ao setup. Chave do serviço escolhido (ElevenLabs: https://elevenlabs.io/app/settings/api-keys; OpenAI: https://platform.openai.com/api-keys). |
| `ELEVENLABS_API_KEY`, `OPENAI_API_KEY` | Nomes antigos, ainda aceitos quando `TRANSCRICAO_API_KEY` não está definida (ElevenLabs tem prioridade). |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                            tela única (negócios, análise e revisão da proposta)
app/api/negocios/route.ts               listar e criar negócios
app/api/negocios/[id]/route.ts          ler e apagar um negócio
app/api/negocios/[id]/analisar/route.ts analisa a transcrição (prévia, sem efeito colateral)
app/api/negocios/[id]/atualizar/route.ts aplica só os campos confirmados
app/api/transcrever/route.ts            transcrição de áudio pelo serviço escolhido em /setup (ou demo)
app/setup/page.tsx                      configuração inicial (chaves, OAuth, teste de conexão)
components/EntradaTranscricao.tsx       colar texto, enviar áudio ou gravar (copiado de reunioes-ia)
lib/analise.ts                          o motor: propõe a atualização, nunca aplica
lib/negocios.ts                         CRUD dos negócios sobre lib/historico.ts (tipo "negocio")
lib/transcricao.ts                      transcrição de áudio (copiado de reunioes-ia)
```
