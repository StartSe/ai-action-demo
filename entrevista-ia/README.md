# Entrevistadora IA

Entrevistadora de IA que conduz a primeira triagem de candidatos por voz e texto e entrega um scorecard para o gestor. Área: Recursos Humanos.

## O que resolve
A primeira conversa de triagem com candidatos toma tempo do gestor. Este app descreve a vaga (título, requisitos, candidato, tom e número de perguntas) e a entrevistadora de IA conduz a conversa na mesma tela — falando as perguntas em voz alta e ouvindo ou lendo as respostas — até fechar um scorecard com nota geral, critérios avaliados, pontos fortes, pontos de atenção, recomendação e próximos passos.

## Stack
Next.js 16 (App Router) + Tailwind CSS 4 + TypeScript. IA via OpenRouter com modelo gratuito por padrão. Voz e ligação telefônica via ElevenLabs (opcional).

## Configuração inicial (sem variáveis de ambiente)
Abra `/setup` no navegador. Lá você conecta cada integração colando uma chave (ou, no caso da IA, com um clique em "Conectar com OpenRouter") e testa a conexão antes de usar:

- **Inteligência artificial (OpenRouter)** — obrigatória para sair do modo demonstração. Gera as perguntas da entrevista e o scorecard final.
- **Voz da entrevistadora (ElevenLabs)** — opcional. Com a chave salva, escolha a voz em uma lista carregada da própria conta; sem ela, a voz usa o sintetizador do navegador do candidato.
- **Ligação telefônica automática (ElevenLabs + Twilio)** — opcional. Depois de salvar a chave da ElevenLabs, o setup lista os agentes conversacionais e os números de telefone já cadastrados na conta para você selecionar; com os dois selecionados, a seção "Ligar para o candidato" do scorecard passa a funcionar.

Tudo fica salvo em SQLite (`data/app.sqlite`, ou `/app/data` no Docker), sem precisar de `.env`. Variáveis de ambiente, quando existem, têm prioridade sobre o que foi salvo no setup. Até conectar a IA, o app roda em modo demonstração com perguntas roteirizadas e um scorecard de exemplo.

## Rodar localmente
```bash
npm install
npm run dev              # http://localhost:3000 e depois http://localhost:3000/setup
```
Abra `/?exemplo=1` para preencher a vaga, iniciar a entrevista e simular as respostas do candidato sozinho, até o scorecard aparecer.

## Rodar com Docker
```bash
docker compose up --build   # http://localhost:3003
```

## Imagem pública e deploy no Render
A imagem é construída e publicada pelo GitHub Actions do repositório da suíte a cada push na `main`: `ghcr.io/startse/entrevista-ia:latest`. Não é preciso construir nem publicar à mão.

- Publicar com um clique: https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-entrevista-ia (o `render.yaml` desta pasta é gerado a partir do `catalogo.json` da raiz; não edite à mão).
- Rodar no seu computador sem construir: `docker run --rm -p 3003:10000 -v entrevista-ia-dados:/app/data ghcr.io/startse/entrevista-ia:latest` e abra http://localhost:3003.
- Depois do deploy, abra `https://<seu-app>.onrender.com/setup` e conecte a IA.
- O health check responde em `/api/health`. No plano free o disco é efêmero: a configuração se perde a cada deploy. Para persistir, adicione um disco em `/app/data` (bloco `disk` comentado no `render.yaml`, plano pago).

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório: a configuração é feita em `/setup`. Variáveis, quando definidas, têm prioridade sobre o que foi salvo lá.
| Variável | Descrição |
|---|---|
| `DATA_DIR` | Pasta do banco SQLite. Padrão `./data` (Docker: `/app/data`). |
| `OPENROUTER_API_KEY` | Alternativa ao setup. Obtenha em https://openrouter.ai/keys. |
| `OPENROUTER_MODEL` | Alternativa ao setup. Padrão `nvidia/nemotron-3-super-120b-a12b:free`. |
| `ELEVENLABS_API_KEY` | Alternativa ao setup. Ativa a voz da entrevistadora. Obtenha em [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys). |
| `ELEVENLABS_VOICE_ID` | Alternativa ao setup. Voz usada no text-to-speech. Padrão `EXAVITQu4vr4xnSDxMaL`. |
| `ELEVENLABS_AGENT_ID` | Alternativa ao setup. Id do agente conversacional usado na ligação telefônica. |
| `ELEVENLABS_PHONE_NUMBER_ID` | Alternativa ao setup. Id do número Twilio vinculado ao agente. |
| `PORT` | Porta HTTP. O Render e o Docker usam `10000`. |

## Estrutura
```
app/page.tsx                        tela única (formulário + sala de entrevista + scorecard)
app/api/entrevista/proxima/route.ts próxima pergunta da entrevista
app/api/entrevista/avaliar/route.ts geração do scorecard
app/api/tts/route.ts                voz da entrevistadora (ElevenLabs)
app/api/ligar/route.ts              ligação telefônica (ElevenLabs Conversational AI + Twilio)
app/api/status/route.ts             informa ao frontend se a IA e as integrações de voz estão conectadas
app/api/health/route.ts             health check
app/setup/page.tsx                  configuração inicial (chaves, OAuth, teste de conexão)
app/api/setup/                      leitura/gravação da configuração, teste e OAuth do OpenRouter
components/ui.tsx                   componentes visuais compartilhados pela suíte
components/setup.tsx                tela de setup genérica, gerada a partir de lib/integracoes.ts
components/Sala.tsx                 sala de entrevista (avatar, chat, voz, reconhecimento de fala)
lib/store.ts                        configuração em SQLite (node:sqlite), com variáveis de ambiente como prioridade
lib/setup-comum.ts                  tipos do setup e integração OpenRouter (compartilhado)
lib/integracoes.ts                  integrações que este app precisa (OpenRouter, voz e ligação da ElevenLabs)
lib/ai.ts                           cliente OpenRouter (askText, askJSON)
lib/voz.ts                          integração opcional com a ElevenLabs (voz e ligação telefônica)
lib/demo.ts                         perguntas roteirizadas e scorecard de exemplo do modo demonstração
lib/types.ts                        tipos do domínio
Dockerfile                          build multi-stage com saída standalone
docker-compose.yml                  sobe este app isolado
render.yaml                         blueprint do Render (runtime image)
```
