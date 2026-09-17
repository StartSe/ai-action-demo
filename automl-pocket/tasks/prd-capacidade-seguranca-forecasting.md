# PRD: Prática com 100 executivos — capacidade de treino, segurança do reset de senha e sidebar do forecasting

## Introdução

Este PRD cobre três frentes preparatórias para a prática Beta com ~100 executivos usando a plataforma em paralelo:

1. **Capacidade de treino**: garantir que 100 treinos de classificação disparados quase ao mesmo tempo terminem com espera curta (**meta: < 5 minutos** entre clicar em "Treinar" e ver o relatório), na instância Coolify atual — Azure **D8as_v7** (8 vCPUs, 32 GiB RAM, US$ 264,99/mês ≈ US$ 0,36/h). O dataset da prática é padronizado e minúsculo (**20 linhas × 8 colunas**), o que deve permitir **10+ treinos em paralelo**; o risco a mitigar é um usuário subir uma planilha maior e ocupar slots da fila por minutos.
2. **Segurança da recuperação de senha**: fechar a lacuna de rate limit por IP (hoje o limite de 3/hora é **por email alvo**, então alternar emails contorna o limite), explicitar a expiração do token e dar feedback de cooldown na tela para tentativas repetidas do mesmo usuário.
3. **UX do forecasting**: mover a seleção do **eixo temporal (campo de data)** e do **campo de identificação (agrupador de séries)** da área de configuração à direita para a **sidebar** de colunas — que passa a ser o único lugar para escolhê-los.

### Estado atual (levantado no código)

- Fila "training" com `TRAINING_CONCURRENCY=4` (env, `apps/worker/main.py`) e `MODEL_N_JOBS=2` + `OMP_NUM_THREADS=2` — calibrados para 4 treinos simultâneos caberem nos 8 vCPUs sem sufocar Postgres/web. Rate limit de treino: 5/min por usuário.
- Orçamento de configs por modo: fastest=1, high_quality=2, higher_quality=4, production=8 (`MODE_CONFIG_COUNTS`).
- Reset de senha: `PASSWORD_RESET_RATE_LIMIT = 3/hora` **por email alvo** (rota pública, `enforceRateLimit`); resposta neutra ("se o email existir, enviaremos um link"); email real via Resend. A expiração do token de reset usa o **default do better-auth (1 hora)** — não está explícita em `src/lib/auth.ts`.
- Forecasting: os selects de eixo temporal e campo de identificação vivem na área de configuração de treino (`predict-view.tsx`); a sidebar (`<aside>` w-80) só tem busca + abas Prever/Ignorar.
- **Experiência de espera atual**: o usuário NÃO precisa atualizar a página — a tela de progresso (`jobs/[jobId]/training-progress.tsx`) faz `router.refresh()` a cada 2s, mostra "Na fila de treinamento..." → "Treinando seu modelo..." com progresso por candidato e redireciona sozinha ao relatório no sucesso. O que falta é a **posição na fila** e estimativa: com 100 pessoas, "Na fila..." parado por minutos parece travamento (daí a US-004).

## Metas

- 100 treinos de classificação enfileirados em ~1 minuto terminam todos com espera individual **p95 < 5 minutos** no hardware da prática.
- Números de capacidade medidos (não estimados): tempo por treino por modo e vazão por nível de concorrência, documentados em runbook com a receita do dia da prática.
- Pedidos de reset de senha de um mesmo IP alternando emails são barrados (rate limit por IP), sem quebrar o uso legítimo.
- Expiração do token de reset explícita no código (1 hora) e comunicada no email.
- Usuário que repete o pedido de reset vê cooldown com contagem regressiva em vez de erro seco.
- No forecasting, o campo de data e o agrupador são escolhidos na sidebar; os selects antigos da área de configuração deixam de existir.

## User Stories

### Frente 1 — Capacidade para 100 treinos paralelos

### US-001: Benchmark de treino de classificação
**Description:** Como responsável pela prática, quero medir o tempo real de um treino de classificação no dataset da prática, por modo e por nível de concorrência, para dimensionar a VM e as envs do dia.

**Acceptance Criteria:**
- [ ] Script reprodutível (em `apps/worker/`, fora do caminho de produção) que roda `train_classification` N vezes sobre o dataset da prática (20 linhas × 8 colunas) e reporta duração p50/p95 por modo (`fastest` e `high_quality` no mínimo)
- [ ] Medição repetida com 1, 4, 8, 10 e 12 treinos simultâneos (mesma máquina), reportando a degradação por contenção de CPU — a hipótese a validar é que 10+ paralelos cabem na D8as_v7 com esse volume
- [ ] Medição adicional com um dataset grande (ex.: 100 mil linhas × 30 colunas) para quantificar quanto tempo um treino pesado ocupa um slot da fila (insumo da US-009)
- [ ] Resultados registrados em tabela no runbook (US-003) com data, hardware e tamanho do dataset
- [ ] Typecheck/lint passes (para qualquer código TS tocado); script Python roda no container de testes do worker

### US-002: Teste de carga com 100 treinos
**Description:** Como responsável pela prática, quero simular 100 usuários enfileirando treinos quase ao mesmo tempo para validar a meta de p95 < 5 minutos de ponta a ponta (fila + treino), incluindo Postgres/Redis/web sob carga.

**Acceptance Criteria:**
- [ ] Script que enfileira 100 jobs `model:train` (chegadas espalhadas em ~60s, simulando os cliques) contra um ambiente com a MESMA configuração da prática
- [ ] Relatório com: makespan total, espera p50/p95 por job, uso de CPU/RAM da VM durante o teste
- [ ] Teste executado com a configuração recomendada pelo benchmark (US-001) e resultado registrado no runbook
- [ ] Nenhum job falha por timeout/OOM durante o teste

### US-003: Runbook do dia da prática
**Description:** Como operador da plataforma, quero um runbook com a receita exata do dia (envs, VM, limites e plano B) para executar a prática sem improviso.

**Acceptance Criteria:**
- [ ] Documento em `tasks/` ou `docs/` com: valores de `TRAINING_CONCURRENCY` (hipótese: 10+)/`MODEL_N_JOBS`/`OMP_NUM_THREADS`/`TRAINING_MAX_ROWS` para o dia, dataset padrão da prática (20 linhas × 8 colunas), modo de treino recomendado como default, e decisão sobre upscale temporário da VM (com custo/hora e passo a passo no Azure/Coolify, incluindo rollback) — que pode nem ser necessário com o dataset minúsculo
- [ ] Fórmula de capacidade documentada: `makespan ≈ ceil(100 / C) × T` (C = concorrência efetiva, T = duração de um treino), com os valores medidos nas US-001/US-002 aplicados
- [ ] Checklist pré-evento (subir envs, smoke test com 5 treinos, monitorar CPU) e plano B se a fila acumular (ex.: subir concorrência a quente / dividir a turma em duas ondas)

### US-004: Posição na fila na tela de progresso do treino
**Description:** Como executivo na prática, quero ver minha posição na fila enquanto o treino não começa, para saber que a plataforma não travou.

**Acceptance Criteria:**
- [ ] Enquanto o job está aguardando (waiting no BullMQ), a tela de progresso mostra "Na fila: posição X de Y" (ou equivalente), atualizada pelo polling existente
- [ ] Quando o treino inicia, a UI volta ao progresso por etapas atual sem regressão
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Proteção da fila contra treinos pesados
**Description:** Como operador da prática, quero que uma planilha grande enviada por um usuário não monopolize a fila de treino, para que os 100 treinos do dataset padrão continuem fluindo.

**Acceptance Criteria:**
- [ ] Limite configurável por env (ex.: `TRAINING_MAX_ROWS`, sem valor = sem limite) validado ao enfileirar o treino: dataset acima do teto recebe mensagem clara em pt-BR ("Para esta prática, treine com datasets de até X linhas") em vez de entrar na fila
- [ ] O limite considera o dataset da versão ativa (linhas em `datasets.row_count`), sem custo extra de leitura do parquet
- [ ] Com a env ausente, o comportamento atual fica intacto (nada muda fora do evento)
- [ ] Valor recomendado para o dia definido no runbook (US-003) a partir da medição do dataset grande (US-001)
- [ ] Typecheck passes e teste unitário da validação

### Frente 2 — Segurança da recuperação de senha

### US-006: Rate limit por IP no reset de senha
**Description:** Como operador, quero limitar pedidos de reset por IP de origem, para que alternar emails alvo não contorne o limite de 3/hora por email.

**Acceptance Criteria:**
- [ ] Novo limite por IP na rota pública de pedido de reset (ex.: 10/hora por IP, somando todos os emails), aplicado ANTES do envio de email; valores em `rate-limit-policy.ts` com comentário justificando
- [ ] O mesmo mecanismo cobre o reenvio de verificação de email (mesma mecânica de rota pública + Resend)
- [ ] Resposta ao atingir o limite permanece neutra (não revela se o email existe) e o evento fica auditado
- [ ] IP extraído do header correto atrás do proxy do Coolify (`x-forwarded-for` via `requestMeta`), com teste cobrindo a chave composta
- [ ] Typecheck passes e testes unitários do novo limite

### US-007: Expiração explícita do token e invalidação do link anterior
**Description:** Como usuário, quero que o link de reset tenha validade clara (1 hora) e que apenas o link mais recente funcione, para reduzir a janela de abuso.

**Acceptance Criteria:**
- [ ] `resetPasswordTokenExpiresIn: 3600` (ou equivalente) explícito na config do better-auth em `src/lib/auth.ts`, com comentário
- [ ] Comportamento de invalidação verificado e documentado: ao pedir um novo reset, o link anterior deixa de funcionar (se o better-auth não suportar, registrar a limitação no runbook e abrir follow-up)
- [ ] O email de reset (`email-templates.ts`) informa a validade: "Este link expira em 1 hora"
- [ ] Typecheck passes

### US-008: Cooldown visível na tela "Esqueci a senha"
**Description:** Como usuário que não recebeu o email, quero ver quanto tempo falta para poder pedir de novo, em vez de clicar repetidamente e tomar erro.

**Acceptance Criteria:**
- [ ] Após um pedido, o botão de reenvio fica desabilitado com contagem regressiva local de 60s ("Reenviar em 59s…")
- [ ] Se o servidor responder 429 (limite por email ou por IP), a tela mostra mensagem amigável em pt-BR com orientação de aguardar, sem revelar qual limite foi atingido
- [ ] A resposta neutra de sucesso continua idêntica (não vaza existência de conta)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### Frente 3 — Forecasting: data e agrupador na sidebar

### US-009: Eixo temporal e campo de identificação na sidebar
**Description:** Como usuário configurando uma previsão temporal, quero escolher o campo de data e o agrupador de séries na sidebar de colunas, para configurar o treino num lugar só, junto do alvo.

**Acceptance Criteria:**
- [ ] Com o tipo "previsão temporal" ativo, a sidebar do Prever exibe uma seção com os selects "Eixo temporal" (obrigatório, colunas de data) e "Campo de identificação" (opcional, categóricas elegíveis — mesma lista `idColumns` atual, com o mesmo empty-state)
- [ ] Os selects equivalentes são REMOVIDOS da área de configuração à direita (a sidebar é o único lugar); a agregação temporal e demais Configurações avançadas continuam onde estão
- [ ] Validações e comportamentos preservados: treino desabilitado sem eixo temporal; `resetForecastOptions` (Trocar tipo/Retreinar/Cancelar) reseta também os valores da sidebar; em modo relatório os campos refletem o modelo vigente como somente leitura
- [ ] Pré-carregamento respeita a regra do CLAUDE.md: coluna do modelo antigo só aparece selecionada se ainda existir no dataset com o tipo esperado
- [ ] Em classificação/regressão a seção não aparece e a sidebar fica idêntica à de hoje
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Requisitos Funcionais

- FR-1: O sistema deve permitir medir (script) a duração de treinos de classificação por modo e concorrência, sem afetar o caminho de produção.
- FR-2: O sistema deve suportar a configuração de concorrência da fila de treino por env (`TRAINING_CONCURRENCY`) sem mudança de código — já existe; o runbook define o valor do dia.
- FR-3: A tela de progresso do treino deve exibir a posição do job na fila enquanto ele aguarda execução (a atualização automática a cada 2s e o redirecionamento ao relatório já existem e devem ser preservados).
- FR-3b: Quando a env `TRAINING_MAX_ROWS` estiver definida, o sistema deve recusar (com mensagem em pt-BR) o enfileiramento de treinos sobre datasets com mais linhas que o teto; sem a env, nada muda.
- FR-4: A rota pública de pedido de reset de senha deve aplicar rate limit por IP além do limite por email alvo, mantendo resposta neutra.
- FR-5: O token de reset de senha deve expirar em 1 hora, com o valor explícito na configuração e informado no corpo do email.
- FR-6: A tela "Esqueci a senha" deve impor cooldown visual de 60s entre pedidos e tratar 429 com mensagem amigável.
- FR-7: No modo forecasting, a sidebar do Prever deve conter os selects de eixo temporal e campo de identificação, removidos da área de configuração.
- FR-8: O payload de treino (`training_jobs.config`) não muda de shape — `timeColumn` e `idColumn` continuam sendo enviados como hoje, apenas a origem na UI muda.

## Non-Goals (fora de escopo)

- Autoscaling automático da VM ou múltiplos workers em máquinas separadas (o upscale do dia é manual, via runbook).
- Benchmark/carga para regressão e forecasting (a prática é de classificação).
- Fila prioritária ou reserva de slots por usuário/organização.
- CAPTCHA ou verificação adicional no fluxo de reset de senha.
- Mover a agregação temporal, horizonte ou modelo de forecast para a sidebar (ficam nas Configurações avançadas).
- Alterar o rate limit de treino (5/min por usuário) — suficiente para uso via UI.

## Considerações Técnicas

- **Fórmula de capacidade**: `makespan ≈ ceil(100 / C) × T`. Com o dataset da prática (20 linhas × 8 colunas) a hipótese é T de poucos segundos em `fastest`: com T=5s, até os C=4 atuais drenam 100 treinos em ~2 min, e C=10 em ~50s — a meta de < 5 min fica folgada **desde que a fila contenha só treinos do dataset padrão**. O risco dominante passa a ser um treino pesado ocupando slots (mitigado pela US-005 + `TRAINING_RATE_LIMIT` existente). Se T medido for maior que a hipótese, `C ≥ 100 × T / 300` (T=30s → C≥10; T=60s → C≥20; cada treino usa ~2 vCPUs com n_jobs=2, então C alto pode pedir upscale temporário da VM). A decisão final sai das medições (US-001/US-002).
- Ao subir `TRAINING_CONCURRENCY`, observar Postgres (commits de progresso por etapa de cada job) e RAM (32 GiB ÷ C treinos simultâneos); `MODEL_N_JOBS` pode cair para 1 quando C for alto — nunca `n_jobs=-1` (regra existente do worker).
- Rate limit por IP reutiliza `enforceRateLimit` com chave `password-reset-ip:<ip>`; atrás do proxy do Coolify o IP real vem de `x-forwarded-for` (já tratado em `requestMeta`).
- A posição na fila pode vir de `Queue.getWaitingCount()`/posição do job no BullMQ, exposta pelo endpoint de status que o polling do treino já consome.
- Sidebar do forecasting: reutilizar os componentes de select existentes; a seção nova entra no `<aside>` de `predict-view.tsx` condicionada a `kind === "forecast"`. Estado (`timeColumn`, `idColumn`) já vive no `PredictView` — a mudança é de posição na árvore, não de dado.

## Métricas de Sucesso

- Teste de carga (US-002): 100 treinos com espera p95 < 5 minutos e zero falhas.
- Segurança: pedido de reset com >10 emails distintos do mesmo IP em 1 hora é bloqueado (verificável em teste); nenhum relato de bloqueio indevido de usuário legítimo na prática.
- Forecasting: configurar data + agrupador não exige rolar a área de configuração; fluxo de treino de previsão temporal completo funcionando via sidebar (verificado no browser).

## Questões em Aberto

- Upscale temporário da VM no dia será necessário? Com o dataset de 20×8 a hipótese é que não — confirmar com o benchmark antes de decidir custo/quem executa.
- Qual valor de `TRAINING_MAX_ROWS` para o dia (permitir alguma exploração além do dataset padrão ou travar justo)?
- O better-auth invalida o token anterior ao emitir um novo pedido de reset? Se não houver suporte nativo, avaliar workaround ou aceitar a janela de 1h.
- Os 100 executivos treinam ao mesmo tempo (uma onda) ou em turmas? Duas ondas de 50 dobram a folga da meta.
