# AutoML

AutoML é uma plataforma de AutoML no-code de instância única: upload de CSV/Excel/JSON, exploração com distribuições e correlações, treinamento automático (classificação, regressão e forecasting) e Relatório de Insights em português. Uma conta, um arquivo SQLite, um `docker compose up`.

## Arquitetura

| Serviço  | Tecnologia                                               | Papel                                                                 |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `web`    | Next.js 16 (App Router) + Drizzle + Better Auth          | UI, autenticação, API pública/MCP, enfileira jobs, aplica migrations  |
| `worker` | Python 3.12 (pandas, scikit-learn, XGBoost, statsmodels) | Parse/profiling de datasets, treinamento AutoML e predição via BullMQ |
| `redis`  | Redis 7 (appendonly, `noeviction`)                       | Filas BullMQ (`datasets`, `training`, `predictions`)                  |

Não há servidor de banco: os dados relacionais vivem em um arquivo SQLite (`SQLITE_PATH`) e as planilhas enviadas, os Parquet e os artefatos de modelo em `UPLOAD_DIR`. Os dois caminhos ficam no volume nomeado `data`, montado em `/data` no `web` e no `worker`. Práticas de segurança estão em [SECURITY.md](SECURITY.md).

## Instalação

```bash
cp .env.example .env            # preencha AUTH_SECRET (openssl rand -base64 32); o resto já serve
docker compose up --build       # redis → web (migrations + servidor) → worker
# web em http://localhost:3000
```

### Primeiro acesso

Com o banco vazio, qualquer visita a `http://localhost:3000` cai em `/setup`: você define nome, e-mail e senha (a senha precisa ser pelo menos "média" no medidor de força) e entra logado. A conta é criada ali, o dataset de exemplo é carregado em segundo plano e, a partir desse momento, `/setup` redireciona para o login e o cadastro público (`POST /api/auth/sign-up/email`) responde 403. Não existe recuperação de senha nem segunda conta: guarde a senha; ela pode ser trocada em Configurações → Segurança (nome e e-mail não são editáveis).

### Desenvolvimento nativo (hot reload)

Suba só o Redis pelo compose (`docker compose up redis`) e rode os dois processos no host apontando para o mesmo arquivo e a mesma pasta de uploads:

```bash
# apps/web
SQLITE_PATH=../../data/pocket.db node scripts/migrate.mjs
SQLITE_PATH=../../data/pocket.db UPLOAD_DIR=../../data/uploads REDIS_URL=redis://localhost:6379 \
  AUTH_SECRET=dev-secret BETTER_AUTH_URL=http://localhost:3000 npm run dev
# apps/worker
SQLITE_PATH=../../data/pocket.db UPLOAD_DIR=../../data/uploads REDIS_URL=redis://localhost:6379 \
  uv run python main.py
```

Qualidade: `npm run typecheck | lint | test` em `apps/web`; testes do worker via container (ver `apps/worker/CLAUDE.md`).

## Variáveis de ambiente

O código lê exatamente as 16 variáveis abaixo — as mesmas, nos mesmos grupos, do [`.env.example`](.env.example) (web: 14, worker: 7, 5 em comum). O compose repassa o `.env` inteiro aos dois serviços (`env_file`), então basta editar o arquivo e reiniciar. Valor inválido nunca derruba o app: o web avisa uma vez no log e usa o default.

### Obrigatórias

| Variável          | Default                  | Lida por    | Efeito                                                                                         |
| ----------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`     | —                        | web         | Segredo que assina sessões e cookies do Better Auth; gere com `openssl rand -base64 32`.       |
| `BETTER_AUTH_URL` | `http://localhost:3000`  | web         | URL pública do app (origem dos cookies e referência de "mesma origem"); com https em produção. |
| `REDIS_URL`       | `redis://localhost:6379` | web, worker | Redis da fila BullMQ; no compose o host é `redis`.                                             |

### Armazenamento

| Variável           | Default            | Lida por    | Efeito                                                                            |
| ------------------ | ------------------ | ----------- | --------------------------------------------------------------------------------- |
| `SQLITE_PATH`      | `./data/pocket.db` | web, worker | Arquivo SQLite compartilhado pelos dois serviços (no compose, `/data/pocket.db`). |
| `UPLOAD_DIR`       | `uploads`          | web, worker | Diretório das planilhas enviadas, Parquet, lotes e artefatos de modelo.           |
| `MAX_UPLOAD_MB`    | `10`               | web         | Tamanho máximo de cada upload, em megabytes.                                      |

### Treino

| Variável               | Default   | Lida por    | Efeito                                                                                                        |
| ---------------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `TRAINING_CONCURRENCY` | `2`       | web, worker | Treinos simultâneos na fila `training`; o web usa o mesmo valor para estimar a espera na fila.                |
| `MODEL_N_JOBS`         | `2`       | worker      | Núcleos por treino (`n_jobs` do Random Forest/XGBoost); `TRAINING_CONCURRENCY × MODEL_N_JOBS` ≈ vCPUs.        |
| `OMP_NUM_THREADS`      | (runtime) | worker      | Threads BLAS/OpenMP por processo, lida pelo numpy/scikit-learn ao carregar; cobre o MLP, que ignora `n_jobs`. |
| `TRAINING_MAX_ROWS`    | vazio     | web         | Teto de linhas por treino; vazio ou ausente = sem limite.                                                     |

### API/segurança

| Variável               | Default  | Lida por | Efeito                                                                                                                            |
| ---------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `API_PREDICT_MAX_ROWS` | `500`    | web      | Máximo de linhas por chamada em `POST /api/v1/predict` (acima disso responde 413; o body é limitado a 1 MB, fixo).                |
| `INTERNAL_ORIGIN_MODE` | `report` | web      | Requisições cross-origin às rotas internas: `off` ignora, `report` permite e audita `authz.cross_origin`, `enforce` responde 403. |
| `API_AUTH_FAIL_MODE`   | `report` | web      | Falhas de autenticação da API/MCP por IP: `report` só audita, `enforce` responde 429 após 10 falhas por minuto.                   |

### Avançado

| Variável                | Default             | Lida por    | Efeito                                                                                                                                                     |
| ----------------------- | ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAYOUT_REVIEW_ENABLED` | `false`             | web, worker | `true`/`1`/`yes`/`on`: o worker pausa em `needs_review` planilhas com layout duvidoso (tela "Revisar planilha"); precisa do mesmo valor nos dois serviços. |
| `SEED_ASSETS_DIR`       | `<cwd>/seed-assets` | web         | Pasta do dataset de exemplo; o default é a cópia embutida na imagem do web.                                                                                |
| `SEED_EXAMPLES_ON_BOOT` | `1`                 | web         | `0` desliga o backfill do dataset de exemplo no boot do web (rede de segurança do `/setup`).                                                               |

As proteções (`INTERNAL_ORIGIN_MODE`, `API_AUTH_FAIL_MODE`) nascem em modo de observação; o roteiro para medir e ligar `enforce` está em [SECURITY.md → Modo observação → enforce](SECURITY.md#modo-observação--enforce).

## Banco de dados

O banco é um único arquivo SQLite em `SQLITE_PATH`, aberto pelo `web` (`@libsql/client`) e pelo `worker` (`sqlite3` da stdlib) em modo WAL — por isso aparecem `pocket.db-wal` e `pocket.db-shm` ao lado dele enquanto os serviços rodam.

- **Migrations**: o container `web` executa `scripts/migrate.mjs` antes de subir o servidor; cada migration do Drizzle (`apps/web/drizzle/`) roda em transação e uma falha derruba o container em vez de deixar o banco "meio migrado". O `worker` só inicia depois que o `web` está saudável, então nunca abre o arquivo antes das migrations.
- **Backup**: copie a pasta `/data` inteira (banco + uploads + modelos) com os serviços parados, ou faça um backup online consistente do banco com o cliente SQLite:

  ```bash
  # offline: tudo de uma vez
  docker compose stop web worker && docker compose cp web:/data ./backup-$(date +%F) && docker compose start web worker
  # online: só o banco, sem parar nada (requer o CLI sqlite3 no host, com o volume acessível)
  sqlite3 /caminho/para/pocket.db ".backup backup-$(date +%F).db"
  ```

  Restaurar é o caminho inverso: parar os serviços, repor o arquivo (sem `-wal`/`-shm` antigos) e a pasta `uploads`, subir de novo.

## Deploy em servidor próprio

O mesmo `docker-compose.yml` serve para produção atrás de um proxy reverso com TLS (Coolify/Traefik, Caddy, nginx):

1. Aponte o proxy para `web:3000` e **não publique** as portas de `redis` nem do `web` no host (remova os blocos `ports` do compose, que existem só para desenvolvimento).
2. `BETTER_AUTH_URL` deve ser exatamente a URL pública com `https://` — é dela que o Better Auth deriva o atributo `Secure` dos cookies e a origem de referência do `INTERNAL_ORIGIN_MODE`.
3. Marque `AUTH_SECRET` como segredo no painel do orquestrador; nunca o commite.
4. Faça backup do volume `data` (seção acima) — é tudo o que o Pocket tem de estado.

Smoke test após o deploy: acesse a URL pública → `/setup` (primeiro acesso) → o dataset de exemplo aparece em **Datasets** como "Pronto" em poucos segundos → crie um projeto, escolha um alvo e treine no modo **Rápido** → o Relatório de Insights abre com métricas e campos principais. Se algo falhar, `docker compose logs web` (migrations/HTTP) e `docker compose logs worker` (parse/treino) são o primeiro lugar a olhar; a tabela `audit_logs` registra login, uploads e treinos.
