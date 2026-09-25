# Voice SDR

SDR por voz que liga para o lead, qualifica pelo roteiro da empresa e marca a reunião na agenda do especialista. Área: Vendas.

## O que resolve
Equipes comerciais perdem receita em três pontos de telefone: lead novo esfria antes do retorno, a base antiga fica parada porque ligar para todos é caro, e reunião marcada vira falta porque ninguém confirma antes nem resgata depois. A Sarah, a SDR por voz, faz esse trabalho de roteiro: liga em minutos para o lead que acabou de chegar, retoma a base, qualifica, oferece só horários livres na agenda do especialista, marca, confirma e resgata. Cada ligação fica com transcrição, resumo e classificação. A métrica é reunião realizada, não reunião agendada.

## Stack
Vite 8 + React 19 + TanStack Router e Query + Tailwind CSS 4 + TypeScript na tela (`app/`). Banco Postgres e Edge Functions (Deno) no Supabase (`supabase/`). Voz pela ElevenLabs Conversational AI, telefonia pela Twilio, IA pelo OpenRouter. A imagem da suíte roda `server.mjs` (Node 22, sem dependência) servindo `app/dist`.

Este app tem **estrutura própria** (`"padrao": "proprio"` no `catalogo.json` da raiz), como o AutoML: não é Next.js e fica fora de `scripts/verificar-padrao.sh`, `scripts/verificar-jargao.mjs`, `scripts/verificar-paleta.mjs` e `scripts/gerar-icones.mjs`. As convenções dele estão em `CLAUDE.md` e em `docs/padrao-de-interface.md`.

## Como funciona
São duas partes, em dois lugares:

1. **A tela**, esta imagem. Publicada pelo botão do catálogo, na conta de quem clica. Não guarda nada: não há SQLite, `/setup` nem volume.
2. **O banco e as funções**, no **projeto Supabase do próprio cliente**. Quem instala é o painel da StartSe (`StartSe/ai-hub`), por OAuth, a partir de `instalacao.json` e da pasta `instalacao/` (migrações em partes, uma função empacotada por passo, registro da versão e conferência pela função `saude`). O fluxo completo está em [`docs/instalacao.md`](docs/instalacao.md).

Na primeira abertura, a tela mostra **Conectar ao seu Supabase**. O botão principal leva ao instalador do painel; quem já instalou informa o endereço do projeto e a chave publicável vem da própria função `saude`. A tela também recebe o projeto pelo link do fim da instalação (`#projeto=<url>&chave=<publicável>`) e guarda no navegador. Depois vêm a conta de dono (primeira pessoa a entrar) e o tutorial, onde a conta liga a IA, a voz, a telefonia e, se quiser, o WhatsApp.

## Pré-requisitos do cliente
| Serviço | Para quê | Obrigatório |
|---|---|---|
| [Supabase](https://supabase.com/dashboard) | Banco, autenticação, rotinas e funções da conta | Sim |
| [OpenRouter](https://openrouter.ai/keys) | Modelo que conversa na ligação e classifica o resultado | Sim |
| [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) | Voz e agente conversacional da Sarah | Sim |
| [Twilio](https://console.twilio.com) | Número de telefone e as ligações | Sim |
| [Z-API](https://www.z-api.io) | Mensagens de WhatsApp | Não |
| Google Agenda | Ler a ocupação do especialista e criar o evento | Não |
| [Resend](https://resend.com/api-keys) | Convite da reunião e apuração de comparecimento por e-mail | Não |

As credenciais dos provedores são digitadas no tutorial da própria tela e ficam no projeto Supabase do cliente.

## Rodar localmente
Node 22.18 ou mais novo.

```bash
cd voice-sdr
npm ci                 # instala a raiz (ferramentas e testes) e o workspace app
npm run dev            # http://localhost:5173
```

Sem projeto configurado, a tela abre em "Conectar ao seu Supabase". Para nascer conectada a um Supabase local, copie `app/.env.example` para `app/.env.local` com a URL e a chave que o `supabase start` imprime. O guia de desenvolvimento da origem (escada de validação, banco em PGlite, pacote de instalação) está em [`docs/desenvolvimento.md`](docs/desenvolvimento.md). O comando do laço é `npm run check` (degraus 1 e 2, sem container nem navegador).

Para conferir a imagem sem Docker:

```bash
npm ci --workspace app --include-workspace-root=false
npm run build --workspace app
PORT=3025 node server.mjs      # serve app/dist; abra http://localhost:3025
```

## Rodar com Docker
```bash
docker compose up --build      # http://localhost:3025
```

## Imagem pública e deploy no Render
A cada push na `main` da suíte que toque esta pasta, `.github/workflows/publicar.yml` constrói `ghcr.io/startse/voice-sdr:latest` (contexto `./voice-sdr`), captura `/?exemplo=1&captura=1` e atualiza o catálogo público. O `render.yaml` desta pasta é gerado por `scripts/gerar-deploy.mjs` a partir do `catalogo.json`: `runtime: image`, plano `free`, `healthCheckPath: /api/health`. Não edite à mão.

Depois de publicar: abra o app, clique em **Instalar pelo painel da StartSe**, volte ao app, crie a conta de dono e siga o tutorial. No Supabase, libere o endereço da cópia em Authentication, URL Configuration (a própria tela mostra o endereço exato e o atalho).

## Rotas do servidor
| Rota | Resposta |
|---|---|
| `GET /api/health` | `200 { ok: true }` |
| `GET /api/status` | `{ ai: false, demo: false, model: null, integrations: { supabaseNoBuild }, setup: { pronto: true, url: "/" }, versao }`. A IA, a voz e a telefonia são ligadas no Supabase do cliente, e este servidor não tem como saber delas. |
| `/api/*` | `404` em JSON |
| `/assets/*` | Arquivo com hash, `Cache-Control: public, max-age=31536000, immutable` |
| qualquer outra | `index.html` com `no-cache` (o roteador usa o histórico do navegador) |

## Variáveis de ambiente (todas opcionais)
Nada é obrigatório.
| Variável | Quando | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Build (`--build-arg`) | Fixam o projeto Supabase na tela. Sem as duas, a tela recebe o projeto pelo instalador ou pelo formulário. A chave é a publicável. Na imagem pública elas ficam vazias. |
| `VITE_PAINEL_DA_STARTSE` | Build | Outro endereço do painel da StartSe, para homologação. |
| `PORT` | Execução | Porta HTTP. O Render e o Docker usam `10000`. |
| `HOSTNAME` | Execução | Interface de rede. Padrão `0.0.0.0`. |
| `DIST` | Execução | Pasta servida. Padrão `./dist` ao lado de `server.mjs` (na imagem) ou `./app/dist`. |

As variáveis das funções (`SARAH_*`, `SUPABASE_*`) são do projeto Supabase do cliente, não desta imagem; ver `docs/instalacao.md`.

## Versão
A versão é o `version` do `package.json` da raiz desta pasta, repetida no `versao` da entrada do `catalogo.json` e registrada no `CHANGELOG.md`. O `/api/status` devolve a mesma versão.

## Estrutura
```
server.mjs             servidor da imagem (só node:*)
Dockerfile             build do workspace app + runner com server.mjs
render.yaml            Blueprint gerado por scripts/gerar-deploy.mjs da suíte
ORIGEM.md              de onde veio esta pasta e como sincronizar
app/                   a tela (Vite + React)
supabase/              migrações, config.toml e funções (instaladas no Supabase do cliente)
instalacao.json        roteiro do instalador do painel (gerado por npm run pacote)
instalacao/            migrações em partes e funções empacotadas (gerado)
scripts/               ferramentas da origem + sincronizar-da-origem.sh
testes/                testes de banco (PGlite) e estáticos
docs/                  PRD, arquitetura, padrão de interface e instalação
```
