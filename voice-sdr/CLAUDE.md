# Sarah Voice SDR

Monorepo com npm workspaces. `app/` é a interface, `supabase/` é o banco e as
funções de servidor, `docs/` é a especificação.

## Comandos

Rode sempre da raiz — os scripts delegam para o workspace `app`.

```
npm run dev        # Vite em http://localhost:5173
npm run build
npm run typecheck  # tsc --build nas ferramentas da raiz e no app
npm run lint       # eslint em scripts/ e testes/, depois em app/
npm test           # test:unit (jsdom + funções de servidor) e test:db (PGlite)
```

Node 22.18 ou mais novo: `check:sql` roda TypeScript direto, sem passo de build.

## Validação: em processo, sem container

**Nunca execute `docker`, `supabase start`, `supabase db reset`, `supabase
migration up`, Playwright ou qualquer automação de navegador.** Nada que faça o
macOS pedir permissão. Se uma verificação exigir isso, escreva o script e deixe
para o CI, anotando em `notes` que ficou de fora.

```
npm run check       # degraus 1 e 2: typecheck, lint, check:sql, test:unit, test:db. Sempre.
npm run check:full  # degrau 3. CI apenas. Nunca rode isto localmente.
```

A escada tem três degraus e cada um é um script: `check:estatico` (degrau 1, só
leitura), `check:processo` (degrau 2, jsdom e PGlite) e `check:full` (degrau 3,
container, Postgres real e navegador). `npm run check` é os dois primeiros, e é
o comando do laço. Degrau novo entra como script, senão a escada só existe na
prosa do README.

Passo do degrau 3 que depende de credencial **sai com zero quando a variável
está ausente**, e diz por quê — é o que `scripts/testes-de-navegador.ts` faz sem
suíte e `scripts/sonda-de-publicacao.ts` faz sem chave do provedor. Degrau que
fica vermelho por falta de segredo ensina o time a ignorar a esteira. A razão de
o passo não rodar no laço vai no topo do arquivo, senão alguém o move para o
`check` por não saber.

A esteira é `.github/workflows/integracao.yml`: degraus 1 e 2 a todo envio, com
dois minutos de orçamento para o `check`; degrau 3 só quando a mudança toca
`supabase/` ou quando o destino é `main`. Quem decide é `scripts/decisao-do-ci.ts`,
porque o `if:` do YAML não enxerga a lista de arquivos tocados — e a regra tem
teste em `testes/estatica/esteira-de-integracao.test.ts`. Mudança na esteira se
prova sabotando o YAML e vendo o teste cair; não dá para rodar o Actions daqui.

`npm run check` fecha em poucos segundos e não abre container, porta nem
navegador. `testes/estatica/scripts-de-validacao.test.ts` guarda essa regra: ele
expande os scripts que o `check` alcança e reprova se aparecer `docker`,
`supabase` ou `playwright`. Script novo dentro do `check` passa por ali.

- **Banco nos testes** é PGlite, Postgres em WebAssembly rodando no próprio
  processo do Vitest. `criarBancoDeTeste()`, em
  `testes/auxiliares/banco-de-teste.ts`, sobe o banco em memória, cria os papéis
  do PostgREST (`anon`, `authenticated`, `service_role`) e um schema `auth`
  mínimo com `auth.uid()` lendo o parâmetro de sessão `request.jwt.claim.sub`,
  e aplica as migrações em ordem. `comoUsuario`, `comoAnonimo` e `comoServico`
  trocam o papel da sessão — RLS só se exercita fora de `postgres`, que é
  superusuário e passa por cima de toda política.
- Toda nova suposição sobre o que o Supabase provê pronto (tabela de `auth`,
  papel, schema, privilégio padrão) entra no preâmbulo desse auxiliar, senão a
  migração quebra só no CI.
- **Isolamento entre contas** se prova em
  `testes/banco/travessia-entre-contas.test.ts`, que varre as tabelas do
  catálogo com duas contas e cobra os dois lados: cada conta vê as próprias
  linhas e nenhuma da outra. `npm run test:rls` roda só ele; `npm run check` já
  o alcança por `test:db`. Com `SUPABASE_DB_URL` definida, o mesmo arquivo roda
  contra Postgres real — é o que o CI faz depois do `db reset`, e nunca o laço
  local.
- **Interface** se verifica por teste de componente em jsdom com Testing
  Library. Sem navegador.
- **Funções de servidor** se verificam pela parte portável, com a camada de
  dados dublada: `test:unit` roda o workspace `app` e, em seguida, o projeto
  `vitest.funcoes.config.ts`, que pega `supabase/functions/**/*.test.ts`. O
  `index.ts` de cada função é adaptador Deno e fica fora do typecheck e do lint
  da raiz; quem o verifica é `check:funcoes` (`deno check`), no CI. As
  convenções estão em `supabase/CLAUDE.md`.
- **`check:sql`** pega a maior parte dos erros de isolamento sem banco nenhum:
  tabela sem RLS, tabela de negócio sem `account_id`, `is_member` fora da forma
  `(select is_member(...))`, segredo literal em migração. A lista de tabelas
  isentas de `account_id` está em `scripts/analise-de-migracoes.ts`, com a razão
  de cada isenção.
- `btree_gist`, `pg_trgm` e `pgcrypto` existem em PGlite, como pacotes
  `@electric-sql/pglite/contrib/*`, e já entram no auxiliar. O que faltar fica
  coberto por `check:sql` e pelo CI.


## Instalação

Cada cliente publica a própria cópia da interface (botão do Render,
`render.yaml`) e tem o próprio projeto Supabase, instalado pelo painel da
StartSe a partir de `instalacao.json`. A cópia recebe o projeto em tempo de
execução (`app/src/conexao/`). **Mudou migração, função ou
`supabase/config.toml`: `npm run pacote` e commite**, senão o `check` reprova.
O fluxo e o que depende do painel estão em `docs/instalacao.md`.

## Convenções

- **Português no código do produto.** Nomes de arquivo, componentes, funções e
  variáveis em português. Só a stack (React, Vite, TanStack) fica em inglês.
- **Literais de interface** ficam em `app/src/copy/`, agrupados por tela; nunca
  soltos no JSX. Falas da Sarah ficam em
  `supabase/functions/_shared/speech/`, porque quem as emite é o servidor.
- **Registro de texto**: interface é direta e declarativa, sem travessão nem
  fecho de efeito; a fala da Sarah é conversacional. A distinção está em
  `docs/padrao-de-interface.md` seção 4 e vale para todo texto novo.
- **Rotas** em `app/src/rotas/`, registradas por código em
  `app/src/roteador.tsx` (TanStack Router sem geração de arquivos). O conjunto
  canônico de rotas está em `docs/PRD-implementacao.md` seção 7.
- **Alias `@/`** aponta para `app/src/`, **`@compartilhado/`** para
  `supabase/functions/_shared/`, que é onde mora o código sem plataforma usado
  pelos dois lados (o token de convite é o caso), e **`@importacao/`** para
  `supabase/functions/leads-import/`, de onde a tela de importação lê o contrato
  da prévia e do relatório em vez de manter uma segunda versão dele, e
  **`@voz/`** para `supabase/functions/voice-catalog/`, de onde a tela de voz
  lê o formato de `agents.voice_settings`, e **`@publicacao/`** para
  `supabase/functions/agent-publish/`, de onde a tela de playbooks lê o
  relatório dos quatro propósitos e o dublê atende a publicação pelo código da
  borda, **`@sugestoes/`** para `supabase/functions/onboarding-suggest/` e
  **`@entrevista/`** para `supabase/functions/onboarding-interview/`, de onde o
  assistente de abertura lê o formato das sugestões e o dublê atende as duas
  bordas pelo mesmo código, e **`@reset/`** para
  `supabase/functions/environment-reset/`, de onde /config/conta lê a palavra
  de confirmação e as frases da recusa, e **`@diagnostico/`** para
  `supabase/functions/call-diagnose/`, de onde o cartão de diagnóstico da
  ficha da chamada lê achados, propostas e a lista fechada de alvos e o dublê
  analisa pelo código da borda, e **`@saude/`** para
  `supabase/functions/saude/`, de onde a tela de conexão e o aviso de versão
  leem o formato da resposta da função `saude`. Todos estão declarados nos mesmos dois lugares: `vite.config.ts` (resolve.alias) e
  `tsconfig.app.json` (paths). Mudar um exige mudar o outro. Módulo de `_shared` que passar a
  depender de `Deno` deixa de poder ser importado pela interface.
- **Dois mundos de TypeScript.** `app/` é DOM e é configurado por
  `app/tsconfig.*.json`; `scripts/` e `testes/` são Node e são configurados por
  `tsconfig.ferramentas.json` na raiz. Cada um tem ESLint e Vitest próprios.
  Arquivo novo na raiz precisa cair dentro do `include` de
  `tsconfig.ferramentas.json`, senão passa sem typecheck.

## Fontes de verdade

`docs/PRD.md` (produto), `docs/PRD-implementacao.md` (arquitetura, esquema,
rotas, fases) e `docs/padrao-de-interface.md` (tokens, layout, texto).
