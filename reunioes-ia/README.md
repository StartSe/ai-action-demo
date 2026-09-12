# Ata Executiva

Transforma a gravação ou a transcrição de uma reunião em ata executiva com decisões, ações, responsáveis e prazos, além de um e-mail de acompanhamento pronto. Área: Gestão.

## O que resolve
Reuniões terminam sem registro claro do que foi decidido e de quem é responsável por quê. Este app cola a transcrição, recebe um áudio ou grava a reunião direto no navegador, e a IA organiza tudo em uma ata objetiva: resumo executivo, decisões com contexto, ações com responsável e prazo, riscos e bloqueios, pendências e um e-mail de acompanhamento pronto para enviar.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Transcrição de áudio via ElevenLabs Scribe ou OpenAI Whisper.

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta a IA com um clique ("Conectar com OpenRouter", fluxo OAuth) ou colando uma chave, escolhe o modelo, conecta a transcrição de áudio (ElevenLabs e/ou OpenAI) e testa cada conexão. Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Até conectar a IA, o app roda em modo demonstração com uma ata de exemplo; sem nenhuma chave de transcrição, o upload e a gravação de áudio devolvem uma transcrição de exemplo, mas a aba "Colar transcrição" gera atas reais assim que a IA estiver conectada.

## Rodar localmente
```bash
npm install
npm run dev             # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher e executar um exemplo sozinho.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3008
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/reunioes-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-reunioes-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3008:10000 -v reunioes-ia-dados:/app/data ghcr.io/startse/reunioes-ia:latest` e abra http://localhost:3008.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `ELEVENLABS_API_KEY` | Alternativa ao setup. Transcreve áudio via ElevenLabs Scribe (opção preferida). Obtenha em https://elevenlabs.io/app/settings/api-keys |
| `OPENAI_API_KEY` | Alternativa ao setup. Transcreve áudio via OpenAI Whisper, usada se a ElevenLabs não estiver conectada. Obtenha em https://platform.openai.com/api-keys |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                       tela única (formulário + resultado)
app/api/ata/route.ts               geração da ata (OpenRouter ou demo)
app/api/transcrever/route.ts       transcrição de áudio: ElevenLabs -> OpenAI -> demo
app/setup/page.tsx                 configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/                     leitura/gravação da configuração, teste e OAuth do OpenRouter
app/api/status/route.ts            informa ao frontend o que está conectado
app/api/health/route.ts            health check
components/ui.tsx                  componentes visuais compartilhados pela suíte
components/setup.tsx               tela de setup genérica, gerada a partir de lib/integracoes.ts
components/EntradaTranscricao.tsx  abas de entrada: colar texto, enviar áudio, gravar
components/AtaResultado.tsx        exibição da ata gerada
lib/store.ts                       configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts                 tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts                 integrações que este app precisa (OpenRouter, ElevenLabs, OpenAI)
lib/ai.ts                          cliente OpenRouter (askText, askJSON, askWithTools)
lib/demo.ts                        ata e transcrição de exemplo do modo demonstração
lib/transcricao.ts                 transcrição de áudio: ElevenLabs -> OpenAI -> demo
lib/types.ts                       tipos do domínio
public/exemplo-transcricao.txt     transcrição de exemplo usada no estado vazio e em ?exemplo=1
Dockerfile                         build multi-stage com saída standalone
docker-compose.yml                 sobe este app isolado (porta 3008)
render.yaml                        blueprint do Render (runtime image)
```
