# PRD: Melhorias de UX e Insights com IA Generativa

## Introdução

Conjunto de melhorias de experiência e inteligência do produto, levantadas em revisão de uso: (a) feedback claro ao alterar a senha, (b) indicador de força de senha na redefinição (paridade com o cadastro), (c) limite de caracteres consistente nos campos de texto, (d) seleção automática do dataset recém-enviado ao criar projeto, (e) pular a escolha de tipo de modelo quando a previsão temporal está indisponível, (f) detecção de colunas booleanas 0/1 como categóricas (hoje viram regressão por engano), (g) — sendo um produto para executivos — um botão "Gerar Insights" que usa IA Generativa para produzir uma análise executiva do modelo treinado, reutilizando a integração LLM já existente do Explore (`src/lib/llm.ts`, OpenRouter), (h) independência entre projeto e dataset na exclusão (hoje `deleteProject` apaga o dataset "órfão" junto, o que impede o cenário de vários projetos preditivos sobre a mesma base), e (i) verificação de email no cadastro por email/senha (login social Google já chega verificado), mantendo a jornada de convite do beta — convite validado primeiro, verificação de email como segundo passo.

## Goals

- Usuário recebe confirmação visível imediatamente após alterar a senha.
- Redefinição de senha tem o mesmo indicador de força do cadastro.
- Nenhum campo de texto aceita entrada ilimitada; criação e renomeação de projeto têm o mesmo limite, validado também no servidor.
- Após enviar uma planilha dentro do fluxo de criação de projeto, ela é selecionada automaticamente — o usuário não precisa localizá-la na lista e clicar.
- Quando o dataset não tem coluna de data, o usuário cai direto na configuração de "Prever", sem passar pela escolha de tipo de modelo com um cartão desabilitado.
- Colunas binárias 0/1 são inferidas como categóricas por padrão, levando a treinamento de classificação (com possibilidade de reverter para número no Preparar).
- Relatório pós-treinamento oferece uma análise executiva gerada por IA, sob demanda, salva junto ao modelo.
- Excluir um projeto nunca apaga o dataset — datasets têm ciclo de vida próprio e podem alimentar vários projetos; a exclusão de dataset acontece só na lista de datasets, por decisão explícita do usuário.
- Cadastro por email/senha exige verificação do email antes do acesso; login com Google dispensa o passo (email já verificado pelo provedor). A jornada de convite permanece: convite resgatado no cadastro, verificação de email na sequência.

## User Stories

### US-001: Feedback visível ao alterar a senha
**Description:** Como usuário que acabou de redefinir a senha, quero uma confirmação clara e imediata de que a alteração funcionou, para não ficar em dúvida se preciso tentar de novo.

**Acceptance Criteria:**
- [ ] Em `src/app/reset-password/page.tsx`, após sucesso de `authClient.resetPassword`, disparar `toast.success("Senha alterada com sucesso. Entre com a nova senha.")` (sonner, já montado globalmente em `src/app/layout.tsx`) antes do `router.push("/login?reset=1")`
- [ ] A mensagem inline existente na tela de login (`login/page.tsx`, `reset=1`) é mantida como reforço — toast e mensagem não podem divergir no texto
- [ ] Alteração de senha via configurações (se existir fluxo de troca logado) também exibe toast de sucesso; se o fluxo não existir, registrar como fora de escopo no PR
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-002: Indicador de força de senha na redefinição
**Description:** Como usuário redefinindo minha senha, quero ver o nível de força da nova senha enquanto digito, igual ao cadastro, para escolher uma senha adequada.

**Acceptance Criteria:**
- [ ] `src/app/reset-password/page.tsx` renderiza `<PasswordStrength password={...} />` (componente existente em `src/components/auth/password-strength.tsx`) abaixo do campo de nova senha, no mesmo posicionamento visual usado em `signup/page.tsx`
- [ ] O indicador reage a cada tecla digitada (mesmo comportamento do cadastro)
- [ ] O indicador não bloqueia o submit (paridade com o cadastro — só o `minLength={8}` bloqueia)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Limite de caracteres consistente nos campos de texto
**Description:** Como usuário, quero que campos de nome tenham limite de caracteres claro, para não criar registros com nomes absurdamente longos que quebram o layout.

**Acceptance Criteria:**
- [ ] Constante `NAME_MAX_LENGTH = 100` extraída de `create-project-dialog.tsx` para um módulo compartilhado (ex.: `src/lib/validation-limits.ts`) e reutilizada nos dois diálogos
- [ ] `RenameDialog` em `src/app/(app)/projects/projects-view.tsx` ganha `maxLength={NAME_MAX_LENGTH}` no input (hoje não tem)
- [ ] `renameProject` em `src/app/(app)/projects/actions.ts` valida comprimento máximo no servidor, com a mesma mensagem de erro de `createProject` ("O nome do projeto deve ter no máximo 100 caracteres.") — hoje só valida vazio
- [ ] Auditoria dos demais inputs de texto livres: qualquer `<Input>`/`<Textarea>` de texto sem `maxLength` recebe um limite razoável (referências existentes: convite 64, título de web app 120, descrição 500, relato de problema 5000)
- [ ] Contador ou truncamento silencioso: usar apenas `maxLength` nativo (sem contador visual) — comportamento consistente com os campos que já têm limite
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-004: Seleção automática do dataset após upload
**Description:** Como usuário criando um projeto, quero que a planilha que acabei de enviar seja usada automaticamente no projeto, para não ter que encontrá-la na lista e clicar nela em seguida.

**Acceptance Criteria:**
- [ ] Em `src/app/(project)/projects/[projectId]/datasets/dataset-picker.tsx`, quando `uploadFile` conclui com sucesso (resposta do `POST /api/datasets/upload` traz o dataset criado), chamar automaticamente `selectDataset(projectId, datasetId)` da action existente (`datasets/actions.ts`), que grava `projects.datasetId` e redireciona para `/projects/{id}/prepare`
- [ ] A rota da API de upload retorna o `datasetId` criado no corpo da resposta (ajustar `src/app/api/datasets/upload/route.ts` se necessário)
- [ ] O Preparar já lida com dataset em processamento (`prepare-pending.tsx`) — o redirect pode acontecer antes do parse terminar, e a tela de pendência cobre o intervalo
- [ ] Erro no upload mantém o comportamento atual (mensagem inline + retry), sem seleção automática
- [ ] Upload feito fora do contexto de criação de projeto (se o picker for reutilizado em outro lugar) não seleciona automaticamente — a auto-seleção só ocorre quando há `projectId` no fluxo
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-005: Pular escolha de tipo quando previsão temporal está indisponível
**Description:** Como usuário cujo dataset não tem coluna de data, quero cair direto na configuração de "Prever", para não ver uma tela de escolha em que só existe uma opção habilitada.

**Acceptance Criteria:**
- [ ] Em `src/app/(project)/projects/[projectId]/predict/predict-view.tsx`, quando `hasDateColumn === false` e não há `?tipo=` na URL, selecionar `kind = "predict"` automaticamente e renderizar direto a configuração (equivalente a já ter clicado no cartão "Prever")
- [ ] A URL é atualizada para `?tipo=prever` (via `writeKindToUrl`), mantendo deep-link e refresh consistentes
- [ ] Na tela de configuração, exibir uma nota discreta informando que "Previsão temporal" está indisponível por falta de coluna de data (reaproveitar `NO_DATE_COLUMN_NOTE`), para o usuário entender por que não viu a escolha
- [ ] Quando `hasDateColumn === true`, o comportamento atual (tela de escolha com os dois cartões) permanece intacto
- [ ] Voltar/limpar a seleção não pode criar loop de redirecionamento (se o usuário navegar para o Prever sem `?tipo=`, cai de novo na configuração direto — comportamento aceitável e documentado)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-006: Colunas binárias 0/1 inferidas como categóricas
**Description:** Como usuário com uma coluna alvo booleana gravada como 0/1, quero que ela seja tratada como categórica por padrão, para que o treinamento seja de classificação e não de regressão.

**Acceptance Criteria:**
- [ ] Em `apps/worker/jobs/inference.py`, `_classify_numeric` (ou ponto equivalente de `_infer_column`) passa a retornar `category` quando os valores não nulos da coluna são um subconjunto de `{0, 1}` (aceitar int e float `0.0/1.0`)
- [ ] Colunas string cujos valores parseiam para apenas `{0, 1}` seguem a mesma regra (o caminho string→numérico ≥95% também classifica como `category` nesse caso)
- [ ] Colunas com um único valor distinto (só 0 ou só 1) também viram `category` (constante — sem utilidade como alvo numérico)
- [ ] A troca manual de tipo no Preparar (`changeColumnType` em `prepare/actions.ts`) permite reverter para `number` — verificar que nenhuma validação impede `category → number` nesse caso
- [ ] Testes em `apps/worker/tests/test_inference.py` cobrindo: int 0/1, float 0.0/1.0, string "0"/"1", coluna com nulos + 0/1, e contraexemplo (0/1/2 continua `number`)
- [ ] Datasets já enviados não são re-inferidos (sem migração retroativa) — a regra vale para novos parses
- [ ] pytest do worker passa; typecheck/lint do web passam (se houver mudança no web)

### US-007: Backend de geração de insights com IA
**Description:** Como desenvolvedor, preciso de uma server action que gere uma análise executiva do modelo treinado via LLM e a persista, para a UI do relatório consumir.

**Acceptance Criteria:**
- [ ] Coluna nova na tabela `models` (ex.: `aiInsight` JSONB com `{ text, model, generatedAt }`), com migração drizzle gerada e aplicada
- [ ] Server action `generateModelInsight(projectId, modelId)` co-localizada em `predict/actions.ts` (ou módulo próprio), que monta o prompt com: `problemType`, alvo, algoritmo vencedor, `metrics`, `insights` (topFields, fatores, segmentos — já em pt-BR), config do treinamento e tipos das colunas — sem enviar linhas de dados brutos
- [ ] Chamada via `chatComplete` de `src/lib/llm.ts` (integração OpenRouter existente), modelo default o mesmo do Explore (`getExploreModel()`), com `maxTokens` limitado
- [ ] Prompt instrui resposta em pt-BR, tom executivo (o que o modelo aprendeu, o que os fatores principais significam para o negócio, limitações e próximos passos), sem jargão estatístico não explicado, com tamanho alvo de 3 a 5 parágrafos
- [ ] Resultado salvo em `models.aiInsight`; chamadas subsequentes retornam o salvo sem nova chamada ao LLM (regenerar só se solicitado explicitamente pela UI)
- [ ] Rate limit registrado em `rate-limit-policy.ts` (ex.: `INSIGHT_RATE_LIMIT = { limit: 5, windowSec: 3600 }` por usuário) e aplicado via `enforceRateLimit`
- [ ] Sem `OPENROUTER_API_KEY` configurada, a action retorna `{ error }` amigável sem lançar exceção (mesmo padrão de gate do Explore)
- [ ] `logAudit` registrando a geração (ex.: `"model.insight.generate"`)
- [ ] Teste unitário (vitest) da montagem do prompt e do caminho feliz com `chatComplete` fake injetado
- [ ] Typecheck/lint passam

### US-008: Botão "Gerar Insights" no relatório do modelo
**Description:** Como executivo olhando o relatório do modelo treinado, quero clicar em "Gerar Insights" e receber uma análise em linguagem de negócio, para entender o que o modelo diz sem depender de um analista.

**Acceptance Criteria:**
- [ ] Seção "Insights da IA" no relatório (`model-report.tsx`, visível para classification, regression e forecasting), posicionada após as métricas principais
- [ ] Sem insight salvo: botão "Gerar insights" com ícone (ex.: sparkles); clique chama `generateModelInsight`, mostra estado de carregamento (skeleton ou spinner com texto "Analisando o modelo…") e renderiza o texto ao concluir
- [ ] Com insight salvo (`models.aiInsight` presente): texto renderizado direto, com data de geração discreta e botão secundário "Regenerar"
- [ ] Texto renderizado com quebras de parágrafo preservadas (markdown simples ou parágrafos), em container legível para texto corrido
- [ ] Erro (rate limit, LLM indisponível, chave ausente) exibe mensagem amigável inline com opção de tentar de novo — nunca quebra o restante do relatório
- [ ] Se o servidor indicar que a feature não está configurada (sem `OPENROUTER_API_KEY`), a seção inteira não é renderizada
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-009: Excluir projeto sem apagar o dataset
**Description:** Como usuário, quero que excluir um projeto preserve o dataset, para poder criar vários projetos preditivos sobre a mesma base sem medo de perder os dados.

**Acceptance Criteria:**
- [ ] Em `deleteProject` (`src/app/(app)/projects/actions.ts`), remover todo o bloco de "dataset órfão" (linhas ~119–160): a exclusão do projeto apaga apenas o projeto, seus models/training_jobs (cascade) e os artefatos dos modelos — nunca o dataset, seus arquivos ou as versões do Preparar
- [ ] O texto do diálogo de confirmação de exclusão em `projects-view.tsx` deixa claro que o dataset será mantido (ex.: "O dataset associado não será excluído.")
- [ ] A exclusão de dataset continua existindo apenas na lista de datasets (`(app)/datasets`), com a confirmação atual — verificar que lá o aviso sobre projetos que usam o dataset (se houver) continua correto
- [ ] O `logAudit("dataset.delete", ..., viaProjectId)` disparado pela exclusão de projeto deixa de existir (não há mais exclusão implícita)
- [ ] Datasets preservados continuam contando na cota de armazenamento (comportamento correto — o usuário gerencia pela lista de datasets)
- [ ] Teste (vitest) cobrindo: excluir projeto não remove linha de `datasets` nem `datasetVersions`
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-010: Verificação de email no cadastro por email/senha (backend)
**Description:** Como operador do produto, quero que contas criadas por email/senha confirmem o email antes de acessar, para garantir que só emails reais entrem — sem afetar quem entra com Google.

**Acceptance Criteria:**
- [ ] `emailVerification.sendVerificationEmail` configurado em `src/lib/auth.ts`, enviando via módulo `sendEmail` existente (Resend), com template pt-BR em `src/lib/email-templates.ts` (saudação, botão "Confirmar email", aviso de expiração) — mesmo padrão do email de redefinição de senha
- [ ] `emailAndPassword.requireEmailVerification: true` e `emailVerification.sendOnSignUp: true` — cadastro por email/senha dispara o email automaticamente e o login é bloqueado até a confirmação
- [ ] `autoSignInAfterVerification: true` — clicar no link confirma e já entra, caindo na jornada normal (gate de waitlist/aprovação intacto)
- [ ] Login com Google não passa pelo passo (better-auth marca `emailVerified` pelo provedor) — validar com conta Google nova
- [ ] Ordem da jornada preservada: o resgate do convite continua no `user.create.after` (cadastro), ou seja, o convite é validado primeiro; a verificação de email é o segundo passo e não interfere no resgate
- [ ] Rate limit para reenvio de email de verificação registrado em `rate-limit-policy.ts` (ex.: 3/hora por email), aplicado no hook `before` como o de redefinição de senha
- [ ] **Migração de compatibilidade:** usuários existentes com `emailVerified = false` criados antes desta feature recebem backfill `emailVerified = true` (senão o deploy tranca todo mundo para fora)
- [ ] Sem `RESEND_API_KEY` (dev), o conteúdo é logado no console e o fluxo segue testável
- [ ] `logAudit` nas ações relevantes (ex.: `auth.email_verified`)
- [ ] Typecheck/lint passam

### US-011: Verificação de email — jornada na UI
**Description:** Como usuário que se cadastrou com email/senha, quero instruções claras para confirmar meu email e uma forma de reenviar o link, para concluir o acesso sem fricção.

**Acceptance Criteria:**
- [ ] Após o cadastro por email/senha, o usuário vê uma tela/estado "Confirme seu email" (email mascarado ou completo, instrução de checar a caixa de entrada e spam) em vez de cair direto no produto
- [ ] Botão "Reenviar email" nessa tela, com feedback de sucesso (toast) e respeitando o rate limit (mensagem amigável ao atingir o limite)
- [ ] Tentativa de login com conta não verificada mostra mensagem específica ("Confirme seu email antes de entrar") com ação de reenvio — não a mensagem genérica de credenciais inválidas
- [ ] Link de verificação expirado/inválido leva a uma página com mensagem clara e botão de reenvio (mesmo padrão do token inválido do reset de senha)
- [ ] Após confirmar, o usuário entra e segue a jornada atual (aprovado → produto; sem convite válido → waitlist)
- [ ] Rotas públicas necessárias adicionadas ao PUBLIC_PATHS do proxy (verificação acontece sem sessão)
- [ ] Fluxo Google permanece intocado: cadastro/login social nunca vê tela de verificação
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Após redefinição de senha bem-sucedida, o sistema deve exibir toast de sucesso (sonner) e manter a mensagem inline no login.
- FR-2: A página `/reset-password` deve exibir o componente `PasswordStrength` existente, com comportamento idêntico ao do cadastro.
- FR-3: Todos os inputs de texto livre devem ter `maxLength`; nome de projeto limitado a 100 caracteres na criação e na renomeação, com validação espelhada no servidor (`createProject` e `renameProject`).
- FR-4: Ao concluir o upload de uma planilha no fluxo de criação de projeto, o sistema deve selecionar o dataset automaticamente (`selectDataset`) e redirecionar para `/prepare`.
- FR-5: Quando o dataset não possui coluna de tipo `date`, o Prever deve pular a tela de escolha de tipo de modelo e abrir direto a configuração de "Prever" (`?tipo=prever`), com nota explicando a indisponibilidade da previsão temporal.
- FR-6: A inferência de tipos do worker deve classificar colunas cujos valores não nulos ⊆ {0, 1} como `category`, com override manual para `number` disponível no Preparar.
- FR-7: O sistema deve gerar, sob demanda, uma análise executiva do modelo via LLM (integração OpenRouter existente), persistida em `models.aiInsight`, com rate limit e auditoria.
- FR-8: O relatório do modelo deve exibir a seção de insights da IA com estados: não gerado (botão), gerando (loading), gerado (texto + regenerar) e erro (mensagem + retry).
- FR-9: A exclusão de um projeto deve remover apenas o projeto, seus modelos/jobs e artefatos — nunca o dataset, seus arquivos ou versões; a exclusão de dataset ocorre exclusivamente na lista de datasets.
- FR-10: Cadastro por email/senha deve exigir verificação de email antes do primeiro acesso (better-auth `requireEmailVerification` + `sendOnSignUp`), com reenvio rate-limitado; login social Google dispensa o passo; usuários pré-existentes recebem backfill de `emailVerified`.
- FR-11: A jornada de convite permanece anterior à verificação: o convite é resgatado no cadastro (`user.create.after`) e a verificação de email é o passo seguinte, sem interferência mútua.

## Non-Goals

- Chat interativo de follow-up sobre o modelo (só a análise inicial sob demanda; o Explore Chat continua sendo o canal de perguntas livres).
- Geração automática de insights ao fim de todo treinamento (só por clique).
- Re-inferência retroativa de tipos em datasets já processados.
- Detecção de booleanos textuais além de 0/1 ("sim/não", "yes/no") — pandas bool já vira `category`; textuais ficam para depois.
- Contadores visuais de caracteres restantes nos inputs (só `maxLength` nativo).
- Streaming da resposta do LLM na seção de insights (resposta completa de uma vez é suficiente para 3–5 parágrafos).
- Política de senha mais rígida (bloquear senhas fracas) — o indicador continua informativo.
- Limpeza automática de datasets sem uso (garbage collection) — o usuário gerencia manualmente pela lista de datasets, dentro da cota de armazenamento.
- Verificação de email retroativa para contas existentes (recebem backfill como verificadas) ou verificação periódica/re-verificação.
- Mudança na regra do convite (código inválido continua levando à waitlist, nunca bloqueando o cadastro).

## Technical Considerations

- **Toast:** sonner já está montado globalmente (`src/components/ui/sonner.tsx` + `layout.tsx`); usar `import { toast } from "sonner"` como nos demais consumidores.
- **LLM:** reutilizar `chatComplete` de `src/lib/llm.ts` (OpenRouter, fetch cru, sem SDK). Diferente do Explore, o insight não depende de `E2B_API_KEY` — o gate é só `OPENROUTER_API_KEY`; não reutilizar `isExploreConfigured()` sem ajuste.
- **Dados do prompt:** `models.metrics` e `models.insights` (JSONB) já contêm métricas e textos pt-BR prontos (`topFields` com importância por permutação, fatores, segmentos) — o prompt deve resumir/estruturar esses JSONs, não recalcular nada.
- **Inferência 0/1:** a mudança fica em `apps/worker/jobs/inference.py`; atenção à ordem das checagens em `_infer_column` (a checagem binária precisa vir antes de `_looks_like_id`, que capturaria colunas 0/1 de alta unicidade? — não: 0/1 nunca é único por linha em dataset real, mas cobrir no teste).
- **Auto-seleção pós-upload:** `selectDataset` já faz `redirect()`; chamá-la de um handler client-side dispara o redirect do Next normalmente por ser server action — verificar comportamento com `useTransition` como nos outros usos.
- **Migração:** nova coluna em `models` via drizzle-kit (`db:generate`/`db:migrate`), nullable, sem backfill.
- **Exclusão de projeto:** o bloco a remover em `deleteProject` coleta paths de parquet e chama `removeFileQuiet` — atenção para não remover também a limpeza dos artefatos dos **modelos** (essa fica). A US-004 (auto-seleção pós-upload) reforça o cenário de N projetos por dataset, então a independência é pré-condição de consistência.
- **Verificação de email:** better-auth cobre o fluxo nativamente (`emailVerification.sendVerificationEmail`, `requireEmailVerification`, `sendOnSignUp`, `autoSignInAfterVerification`); o módulo `sendEmail` (Resend) e o padrão de template já existem (`email-templates.ts`). O ponto crítico é o **backfill** de `emailVerified = true` para contas existentes na mesma release — sem isso o deploy bloqueia usuários ativos. O cookie httpOnly do convite no fluxo Google e o resgate em `user.create.after` não mudam.

## Success Metrics

- Zero cliques manuais entre "upload concluído" e a tela Preparar no fluxo de criação de projeto (antes: localizar na lista + clicar).
- Dataset sem coluna de data: usuário chega à configuração de treinamento com um clique a menos e sem ver cartão desabilitado.
- Colunas alvo 0/1 passam a gerar treinamentos de classificação sem intervenção manual no Preparar.
- Insight de IA gerado em menos de ~20s e persistido — segunda visualização é instantânea (sem nova chamada ao LLM).
- Excluir um projeto e criar outro sobre o mesmo dataset funciona sem re-upload.
- 100% das contas novas por email/senha só acessam após confirmar o email; zero usuários pré-existentes bloqueados no deploy.

## Open Questions

- O texto do insight deve ser incluído em exports/compartilhamentos futuros do relatório (web app publicado)? Por ora, fica só no relatório interno.
- Vale expor a escolha de modelo LLM (custo menor com um modelo mais barato para insights) via env própria (`INSIGHT_MODEL`) ou herdar sempre `EXPLORE_MODEL`? PRD assume herdar.
- Ao regenerar o insight, manter histórico das versões anteriores ou sobrescrever? PRD assume sobrescrever.
- Com datasets preservados na exclusão de projetos, vale mostrar na lista de datasets quantos projetos usam cada um (e avisar antes de excluir um dataset em uso)? PRD assume manter o comportamento atual da lista, só garantindo que a exclusão explícita continue com confirmação.
- Prazo de expiração do link de verificação de email: usar o default do better-auth (1h) ou estender? PRD assume o default.
