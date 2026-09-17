# Runbook — Prática com 100 executivos (treinos de classificação)

> US-003 do PRD `tasks/prd-capacidade-seguranca-forecasting.md`.
> Última atualização: 2026-08-31. Números locais medidos em laptop 8 vCPUs arm64 (US-001/US-002);
> números da VM Azure D8as_v7 (8 vCPUs, 32 GiB, Coolify) marcados como **a medir** — rodar os
> mesmos comandos na VM antes do evento e preencher.

## Receita do dia (envs do worker)

Definir no environment do serviço worker (Coolify → serviço worker → Environment Variables; os
docker-compose já leem essas envs com fallback):

| Env | Valor do dia | Default atual | Por quê |
|---|---|---|---|
| `TRAINING_CONCURRENCY` | **10** | 4 | Validado no teste de carga local (US-002): 100 treinos 20×8 em `high_quality` drenam em 2,3 min com CPU de pico em ~1,7 de 8 vCPUs. O gargalo a 10 simultâneos é o GIL (treino infla de ~1s para ~14s), não CPU/RAM — subir além de 10 quase não melhora o makespan com dataset pequeno. |
| `MODEL_N_JOBS` | **2** | 2 | Núcleos por treino (RF/XGBoost). Nunca `-1` (regra do worker). Com dataset 20×8 o paralelismo interno mal é usado; manter 2. |
| `OMP_NUM_THREADS` | **2** | 2 | Threads BLAS/OpenMP (cobre o MLP). Manter o valor de produção. |
| `TRAINING_MAX_ROWS` | **5000** | (sem limite) | Proteção da fila (US-005): um dataset 5k×12 ocupa um slot por ~7–15s (medição local US-001) — aceitável; 100k×30 ocuparia por minutos. 5.000 linhas dá folga para exploração além do dataset padrão sem permitir monopolizar a fila. Mensagem de bloqueio em pt-BR já pronta (`src/lib/training-limits.ts`). **Remover a env depois do evento.** |
| `TRAINING_RATE_LIMIT` | não mexer (5/min) | 5/min | Fora de escopo do PRD; suficiente para uso via UI. |

- **Dataset padrão da prática:** 20 linhas × 8 colunas (classificação, alvo binário).
- **Modo de treino default recomendado:** `high_quality` (default da plataforma). O teste de carga
  já validou a meta nesse modo com folga — não é preciso orientar a turma a usar `fastest`.
  Evitar orientar `higher_quality`/`production` no dia (4×/8× mais configs por treino).

## Fórmula de capacidade e números medidos

```
makespan ≈ ceil(100 / C) × T
```

C = concorrência efetiva (`TRAINING_CONCURRENCY`), T = duração de um treino **sob contenção**
(usar o p95 medido na concorrência C, não o tempo a 1x).

Aplicando os números locais (US-001/US-002, laptop 8 vCPUs arm64, container):

| Cenário | C | T (p95 medido) | Makespan projetado | Makespan medido |
|---|---|---|---|---|
| `fastest`, 20×8 | 4 | 2,8s | ceil(100/4) × 2,8s ≈ 1,2 min | — |
| `high_quality`, 20×8 | 4 | 4,3s | ceil(100/4) × 4,3s ≈ 1,8 min | — |
| `high_quality`, 20×8 (config do dia) | 10 | ~15s | ceil(100/10) × 15s ≈ 2,5 min | **2,3 min** (US-002) |

Teste de carga local completo (US-002; 100 jobs `high_quality` 20×8, chegadas espalhadas em 60s,
worker com a config do dia): **100 sucesso / 0 falha**, makespan **139,9s**, espera p50/p95 =
**35,0s/69,9s**, treino p50/p95 = **14,0s/15,1s**, ponta a ponta p50/p95 = **49,8s/81,5s** →
**meta p95 < 5 min OK com ~3,7× de folga**. CPU média/pico 1,5/1,7 vCPUs de 8; RAM pico 0,40 GiB;
loadavg pico 1,6.

Números oficiais da VM D8as_v7: **a medir** (preencher a tabela abaixo rodando os comandos da
seção seguinte na VM):

| Medição na D8as_v7 | Valor |
|---|---|
| Benchmark `fastest`/`high_quality` × concorrência 1,4,8,10,12 (p50/p95) | **a medir** |
| Slot ocupado por dataset grande (100k×30) | **a medir** |
| Teste de carga 100 jobs: makespan / espera p95 / ponta a ponta p95 | **a medir** |
| CPU/RAM de pico durante o teste de carga | **a medir** |

### Comandos de medição (rodar na VM antes do evento)

```sh
# Benchmark por modo × concorrência (container de testes do worker, a partir de apps/worker):
uv run python scripts/benchmark_training.py

# Teste de carga (DENTRO do container do worker, com o worker consumindo em paralelo):
docker compose exec -T worker python scripts/load_test_training.py
# Smoke rápido: --jobs 6 --spread 3 --mode fastest
```

Antes de qualquer medição: conferir `redis-cli llen bull:training:wait` = 0 (teste abortado deixa
jobs fantasma que o worker reprocessa no boot — ver notas da US-002 em progress.txt).

## Upscale temporário da VM — decisão e passo a passo

**Decisão: NÃO fazer upscale por padrão.** O teste de carga com a config do dia usou ~1,7 de
8 vCPUs e 0,4 GiB de 32 GiB — a D8as_v7 atual (US$ 264,99/mês ≈ **US$ 0,36/h**) tem folga larga
para 100 treinos do dataset 20×8. Upscale só entraria se a medição na VM contrariar a local
(ponta a ponta p95 > ~3 min no teste de carga) — e mesmo assim o primeiro remédio é o plano B
abaixo, não a VM.

Se ainda assim for preciso (executar na véspera, nunca no meio do evento):

1. **Azure Portal** → Virtual Machines → VM do Coolify → *Availability + scale* → **Size** →
   escolher `D16as_v7` (16 vCPUs, 64 GiB; ≈ 2× o custo da D8as_v7, ≈ **US$ 0,72/h** — conferir o
   preço exato no portal antes de aplicar) → **Resize**. A VM **reinicia** (~2–5 min de downtime).
2. Aguardar o Coolify subir os serviços (web, worker, Postgres, Redis) e validar com o smoke test
   do checklist abaixo.
3. Ajustar envs para aproveitar a máquina: `TRAINING_CONCURRENCY=20` (mantendo
   `MODEL_N_JOBS=2`/`OMP_NUM_THREADS=2`) e redeploy do worker via Coolify.
4. **Rollback (logo após o evento):** repetir o passo 1 escolhendo `D8as_v7` de volta, restaurar
   `TRAINING_CONCURRENCY=4` (valor de produção), remover `TRAINING_MAX_ROWS` e redeploy. Conferir
   no portal que o size voltou (o custo/hora dobrado corre até o resize de volta).

## Checklist pré-evento (véspera / manhã do dia)

- [ ] Medições na VM feitas e tabela "a medir" acima preenchida (benchmark + teste de carga).
- [ ] Subir envs do dia no worker via Coolify: `TRAINING_CONCURRENCY=10`, `TRAINING_MAX_ROWS=5000`
      (manter `MODEL_N_JOBS=2`, `OMP_NUM_THREADS=2`) e **redeploy do worker**.
- [ ] Conferir fila limpa: `redis-cli llen bull:training:wait` → 0.
- [ ] **Smoke test com 5 treinos**: 5 usuários/abas treinando o dataset padrão quase juntos;
      conferir que todos concluem em < 1 min, que a tela de progresso mostra "Na fila: posição
      X de Y" (US-004) enquanto espera e que o redirecionamento ao relatório funciona.
- [ ] Testar o teto: subir uma planilha > 5.000 linhas e conferir a mensagem de bloqueio em pt-BR.
- [ ] Deixar monitoramento aberto durante o evento: `htop`/`docker stats` na VM (CPU/RAM do worker
      e do Postgres) e `redis-cli llen bull:training:wait` (profundidade da fila).
- [ ] Confirmar formato da turma: uma onda de 100 ou duas de 50 (duas ondas dobram a folga).

## Plano B — se a fila acumular no dia

Sintoma: posição na fila crescendo/parada por > 2 min na tela de progresso, ou
`llen bull:training:wait` subindo sem drenar.

1. **Subir concorrência a quente:** `TRAINING_CONCURRENCY=16` no Coolify + redeploy do worker
   (~segundos de indisponibilidade do worker; os jobs na fila não se perdem — BullMQ retoma).
   CPU tem folga (pico local 1,7/8); vigiar Postgres (commits de progresso por etapa) e RAM.
2. **Dividir a turma em duas ondas** de ~50: metade treina, metade assiste; makespan cai pela
   metade sem tocar em infra.
3. **Caça ao treino pesado:** se um job estiver ocupando um slot por minutos (dataset grande que
   passou antes do teto ou teto mal configurado), identificar na tabela `training_jobs` (status
   `running` antigo) e, em último caso, aguardar — não matar o worker no meio do evento.
4. Upscale da VM **não** é plano de meio de evento (reinicia a VM inteira, ~2–5 min fora do ar
   para todo mundo). Só na véspera, conforme seção acima.

## Pós-evento

- [ ] Restaurar `TRAINING_CONCURRENCY=4` e **remover** `TRAINING_MAX_ROWS`; redeploy do worker.
- [ ] Se houve upscale, fazer o rollback do size da VM (seção de upscale, passo 4).
- [ ] Registrar em progress.txt/notes os números reais do dia (makespan, p95, falhas) para a
      próxima prática.
