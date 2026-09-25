# Sarah Voice SDR

SDR por voz que liga, qualifica e marca a reunião na agenda do especialista.
Monorepo: `app/` (interface), `supabase/` (banco e funções), `docs/`
(especificação).

## Publicar a sua cópia

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/StartSe/toolkit-sarah-voice-sdr)

Cada cliente tem a própria cópia da interface e o próprio projeto Supabase. O
botão lê o [`render.yaml`](render.yaml) e publica a interface como site
estático na conta de quem clica, sem projeto fixo. Na primeira abertura, a
cópia mostra **Conectar ao seu Supabase**, que leva ao instalador do painel da
StartSe: ele cria o banco e publica as funções no projeto do cliente, e a cópia
recebe o projeto pelo link do fim da instalação. O fluxo inteiro, o que o
cliente ainda confere à mão e o que depende do painel estão em
[`docs/instalacao.md`](docs/instalacao.md).

O roteiro que o painel executa é [`instalacao.json`](instalacao.json), gerado
por `npm run pacote` junto com a pasta `instalacao/`. Mudou migração, função ou
`supabase/config.toml`: rode `npm run pacote` e commite. O `npm run check`
reprova o pacote que envelheceu.

## Como rodar

```bash
npm install          # instala a raiz e o workspace app
npm run dev          # http://localhost:5173
npm run build        # bundle de produção
```

Exige Node 22.18 ou mais novo: `check:sql` executa TypeScript direto, sem passo
de build, e depende do type stripping nativo.

Toda rota de produto exige sessão, e a sessão é do projeto Supabase conectado.
Com `app/.env.local` preenchido (copie `app/.env.example`, com a URL e a chave
que o `supabase start` imprime), o `npm run dev` já nasce conectado ao Supabase
local. Sem ele, a aplicação abre na tela de conexão.

## Escada de validação

Três degraus. **O laço local sobe os degraus 1 e 2**, que é exatamente o que
`npm run check` faz: os dois rodam dentro do processo, em poucos segundos, sem
container, sem daemon e sem navegador. **O degrau 3 é do CI e do ponto de
checagem de cada fatia** — é onde entram Docker, `db reset`, Postgres de verdade
e navegador, tudo o que pediria permissão do sistema operacional e travaria o
laço autônomo num diálogo.

| Degrau | Comando | O que faz | Quem roda |
|---|---|---|---|
| 1. Estático | `npm run check:estatico` | `typecheck`, `lint` e `check:sql`: nada é executado, só lido | Laço local e CI, a toda mudança |
| 2. Em processo | `npm run check:processo` | `test:unit` (jsdom e funções de servidor) e `test:db` (PGlite) | Laço local e CI, a toda mudança |
| 3. Fora do processo | `npm run check:full` | Supabase em container, migrações sobre banco vazio, `deno check`, travessia entre contas em Postgres real e navegador | CI, e o ponto de checagem da fatia |

```bash
npm run check        # degraus 1 e 2. É o comando do laço local.
npm run check:full   # degrau 3. CI apenas: sobe Docker e abre navegador.
```

`testes/estatica/scripts-de-validacao.test.ts` faz valer a fronteira: se alguém
pendurar `docker`, `supabase` ou `playwright` em algo que o `check` alcança, o
próprio `check` reprova.

| Comando | O que faz |
|---|---|
| `npm run typecheck` | `tsc --build` nas ferramentas da raiz e no workspace `app` |
| `npm run lint` | ESLint em `scripts/` e `testes/`, depois em `app/` |
| `npm run test:unit` | Testes de componente em jsdom, no workspace `app` |
| `npm run test:db` | Testes de banco em PGlite e validação das migrações, na raiz |
| `npm run test:rls` | Só a travessia entre contas, o mesmo arquivo que o CI reexecuta |
| `npm run check:sql` | Regras estáticas sobre `supabase/migrations`, sem banco |
| `npm run test:navegador` | Passo de navegador do degrau 3; sai em silêncio enquanto não houver `playwright.config.ts` |

**`npm run check:full` não deve ser executado no laço local.** Ele sobe o
Supabase em Docker e abre navegador, e as duas coisas pedem permissão do macOS.
Quando uma verificação exigir esse degrau, escreva o script, deixe para o CI e
registre que ficou de fora.

### Esteira de integração contínua

`.github/workflows/integracao.yml` roda os degraus 1 e 2 em todo envio, com
orçamento de dois minutos para o `npm run check`. O degrau 3 é caro e só entra
em dois casos: quando a mudança toca `supabase/` ou quando o destino é a branch
principal. Quem decide é `scripts/decisao-do-ci.ts`, e a decisão tem teste em
`testes/estatica/esteira-de-integracao.test.ts` — o `if:` do YAML não enxerga a
lista de arquivos tocados, e regra sem teste não sobrevive à próxima mudança.
Quando o diff não pode ser montado, o degrau 3 roda por precaução. Qualquer
etapa que falhe reprova a esteira: nenhuma carrega `continue-on-error`.

### Banco em processo

Os testes de banco rodam em PGlite, o Postgres compilado para WebAssembly. O
auxiliar `testes/auxiliares/banco-de-teste.ts` sobe um banco vazio em memória,
cria os papéis do PostgREST e um schema `auth` mínimo — com `auth.uid()` lendo
um parâmetro de sessão no lugar do JWT — e aplica todas as migrações em ordem.
Com isso, política de RLS se exercita sem serviço de autenticação e sem daemon.

### Travessia entre contas

`npm run test:rls` roda `testes/banco/travessia-entre-contas.test.ts`, que monta
duas contas com um usuário cada e verifica, tabela por tabela, que cada uma
enxerga as próprias linhas e nenhuma da outra. As tabelas vêm do catálogo do
Postgres, não de uma lista: tabela nova entra na varredura sozinha, e reprova
enquanto ninguém declarar como ela se liga à conta.

É atalho, não degrau novo: `npm run test:db` — e portanto `npm run check` —
já roda esse arquivo junto com os outros.

O mesmo arquivo roda contra Postgres de verdade quando `SUPABASE_DB_URL` está
definida; é o que `npm run test:rls:postgres` faz dentro de `check:full`, depois
do `supabase db reset`. Nesse modo os dois testes que derrubam política para
provar que a varredura tem dente ficam de fora: num banco compartilhado, um
rollback que falhasse deixaria a tabela aberta.

### Validação estática das migrações

`npm run check:sql` reprova a migração que: não fecha parêntese, literal ou
corpo de função; cria tabela sem habilitar row level security; cria tabela de
negócio sem `account_id`; chama `is_member` fora da forma
`(select is_member(...))`; ou carrega chave, URL ou segredo literal. Pega a
maior parte dos erros de isolamento em menos de um segundo e sem banco.

### Banco local de verdade

`npm run db:start` e `npm run db:reset` usam o CLI do Supabase e o Docker.
São para trabalho manual, fora do laço. Copie `app/.env.example` para
`app/.env.local` com a URL e a chave que o `supabase start` imprime.
