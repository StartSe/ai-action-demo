# PRD: Correções de Navegação e Refinamento de UX

## Introdução

Após a conclusão das 27 stories da plataforma AutoML (`prd-plataforma-automl.md`), o teste manual revelou três bugs de navegação/acesso e a necessidade de uma passada geral de polish de UX no fluxo completo (projetos → upload → prepare → predict → relatório). Este PRD cobre essas correções e refinamentos.

Causas raiz já investigadas no código:

1. **Card de projeto não abre**: `ProjectCard` em `apps/web/src/app/(app)/projects/projects-view.tsx` renderiza uma `<div>` sem `Link`, `onClick` ou `router.push`. A rota destino `/projects/[projectId]` já existe e funciona (redireciona para `/prepare` quando o projeto tem dataset).
2. **"Gerar Dashboard"**: botão desabilitado com tooltip "Em breve" em `apps/web/src/app/(project)/projects/[projectId]/prepare/prepare-view.tsx:275-276` (tela Prepare, não na lista de projetos). Dashboards são non-goal declarado do produto.
3. **`/datasets` vazio**: `apps/web/src/app/(app)/datasets/page.tsx` é um stub estático ("A gestão de datasets estará disponível em breve") — não consulta o banco. A listagem funcional existe apenas em `/projects/[projectId]/datasets` (`DatasetPicker`).
4. **Relatório inacessível**: a rota `/projects/[projectId]/reports` existe e renderiza os relatórios, mas só é alcançável pela aba Reports do `ProjectNavbar` (dentro do projeto — inacessível por causa do bug 1) ou por um auto-redirect 1,2s após o job terminar, que só ocorre se o usuário permanecer na página do job. Não há CTA persistente "Ver relatório".

> **Importante — não recriar o relatório**: os Insights Reports de Classificação, Regressão e Forecasting já estão implementados (`classification-report.tsx`, `regression-report.tsx`, `forecasting-report.tsx`) seguindo a estrutura da documentação da plataforma de referência (Classification/Regression Summary, Predictive Performance, Performance Details, Advanced Model Details, Top Fields, Top Factors, Segments, Decision Threshold Graph, Sample Rows; Regressão com RMSE/MAE, Distribuição do Alvo e Previsto × Real). O trabalho deste PRD é **dar acesso** ao relatório (US-031), não reconstruí-lo.

## Objetivos

- Restaurar a navegação principal: clicar em um projeto abre o projeto.
- Remover a opção "Gerar Dashboard" (funcionalidade fora de escopo do produto).
- Transformar `/datasets` em uma listagem real dos datasets da organização.
- Garantir caminho claro e persistente até o relatório de avaliação de qualquer modelo treinado.
- Elevar o polish de UX do fluxo completo: estados vazios, loading, feedback de erro e navegação consistentes.

## User Stories

> Numeração continua a partir de US-027 do `prd.json` para facilitar a incorporação posterior ao loop do Ralph.

### US-028: Card de projeto clicável
**Description:** Como usuária, quero clicar em um projeto na lista para abri-lo e continuar o trabalho.

**Acceptance Criteria:**
- [ ] Todo o card (preview + nome + metadados) é um `<Link>` para `/projects/{id}`
- [ ] O `DropdownMenu` (Renomear/Arquivar/Excluir) continua funcionando sem disparar a navegação (fora do link ou com `stopPropagation`/`preventDefault`)
- [ ] Cursor pointer e feedback visual de hover no card
- [ ] Acessível por teclado: card focável, Enter abre o projeto
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-029: Remover "Gerar Dashboard"
**Description:** Como usuária, não quero ver opções que não funcionam; o botão "Gerar Dashboard" (desabilitado, "Em breve") deve ser removido.

**Acceptance Criteria:**
- [ ] Botão "Gerar Dashboard" removido de `prepare-view.tsx` (JSX e código associado sem uso)
- [ ] Nenhuma outra referência a "Gerar Dashboard" restante na UI (`grep` limpo em `apps/web/src`)
- [ ] Layout da toolbar do Prepare permanece alinhado após a remoção
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-030: Listagem real na tela `/datasets`
**Description:** Como usuária, quero ver todos os datasets da minha organização na tela Datasets do sidebar para gerenciá-los em um só lugar.

**Acceptance Criteria:**
- [ ] `/datasets` lista os datasets da org (mesma query por `orgId` usada em `/projects/[projectId]/datasets`), ordenados por `updatedAt` desc
- [ ] Cada linha mostra: nome do arquivo, formato, linhas × colunas, status (badge) e data de atualização
- [ ] Datasets com `status: error` mostram a `error_message` acessível (tooltip ou expansão)
- [ ] Ação de download reutilizando `GET /api/datasets/[datasetId]/download`
- [ ] Ação de excluir com diálogo de confirmação (bloqueada ou com aviso se o dataset estiver vinculado a um projeto)
- [ ] Empty state com texto orientativo e CTA para criar projeto/fazer upload
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-031: Acesso persistente ao relatório de avaliação
**Description:** Como usuária, quero um caminho claro para o relatório de avaliação de um modelo treinado, sem depender de ficar na página do job durante o treinamento.

**Acceptance Criteria:**
- [ ] Card de projeto com modelo treinado exibe CTA "Ver relatório" (junto ao badge "Modelo treinado") linkando para `/projects/{id}/reports`
- [ ] Na tela do job (`predict/jobs/[jobId]`), quando `status === "succeeded"`, além do auto-redirect há botão explícito "Ver relatório"
- [ ] Na tela Predict, se já existe modelo treinado para o projeto, há link visível para o relatório
- [ ] Aba "Reports" do `ProjectNavbar` continua habilitada quando há modelo
- [ ] Verificado no browser que o relatório existente renderiza todas as seções (Resumo, Performance, Campos/Fatores Principais, Segmentos, Limiar, Linhas de Exemplo) ao chegar por cada um dos novos caminhos — sem alterar os componentes de relatório
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-032: Estados vazios e de carregamento consistentes
**Description:** Como usuária, quero feedback visual claro em todas as telas do fluxo enquanto dados carregam ou quando não há dados.

**Acceptance Criteria:**
- [ ] Lista de projetos: empty state com CTA "Novo projeto" quando não há projetos
- [ ] Skeleton/loading state nas telas que buscam dados (projetos, datasets, prepare, relatório) via `loading.tsx` do App Router ou equivalente
- [ ] Durante parse/profile de dataset, o status é comunicado com indicador de progresso e texto do passo atual (não apenas polling silencioso)
- [ ] Nenhuma tela do fluxo renderiza conteúdo "cru" sem fallback de carregamento
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-033: Feedback de erro e recuperação no fluxo de dados
**Description:** Como usuária, quero entender o que deu errado (upload, parse, treinamento) e ter uma ação de recuperação, em vez de telas silenciosas.

**Acceptance Criteria:**
- [ ] Upload que falha exibe mensagem de erro em português com ação "Tentar novamente"
- [ ] Dataset com `status: error` no picker mostra a mensagem e permite excluir/reenviar
- [ ] Job de treinamento `failed` exibe `error_message` amigável e botão para reconfigurar/reiniciar o treinamento
- [ ] Relatório sem `insights`/`metrics` (placeholder atual) explica a situação e oferece re-treinar, em vez do texto genérico "em breve"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-034: Polish de navegação e microinterações
**Description:** Como usuária, quero uma navegação coerente entre as telas do fluxo, com transições e affordances claras.

**Acceptance Criteria:**
- [ ] `ProjectNavbar` permite voltar à lista de projetos (logo/breadcrumb clicável)
- [ ] Abas do projeto refletem o estado atual (aba ativa destacada; abas indisponíveis com tooltip explicando o porquê, ex.: "Treine um modelo para ver o relatório")
- [ ] Ações assíncronas (criar projeto, selecionar dataset, iniciar treinamento) mostram estado pending nos botões (spinner/disabled)
- [ ] Toasts de confirmação para ações destrutivas concluídas (excluir projeto/dataset)
- [ ] Revisão de textos da UI: tudo em português, sem placeholders "Em breve" restantes em elementos interativos
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: O card de projeto deve navegar para `/projects/{id}` ao clique e via teclado (Enter), mantendo o menu de contexto funcional de forma independente.
- FR-2: O sistema não deve exibir o botão "Gerar Dashboard" em nenhuma tela.
- FR-3: A rota `/datasets` deve listar todos os datasets da organização do usuário autenticado, com nome, formato, dimensões, status e data.
- FR-4: A tela `/datasets` deve permitir download e exclusão (com confirmação) de datasets.
- FR-5: Projetos com modelo treinado devem expor link direto para `/projects/{id}/reports` a partir do card, da tela Predict e da tela do job concluído.
- FR-6: Toda tela do fluxo deve ter empty state e loading state definidos.
- FR-7: Falhas de upload, parse e treinamento devem exibir mensagem em português e uma ação de recuperação.
- FR-8: Botões que disparam ações assíncronas devem exibir estado pending até a conclusão.
- FR-9: O `ProjectNavbar` deve oferecer retorno à lista de projetos.

## Non-Goals (Out of Scope)

- Implementar dashboards (a remoção do botão é definitiva; dashboards seguem como non-goal do produto).
- Upload/gestão de datasets diretamente pela tela `/datasets` global (a criação continua no fluxo por projeto; a tela global é de visualização/gestão).
- Conexão a bancos de dados externos como fonte de dados.
- Alterações no pipeline de treinamento do worker Python (apenas exibição/navegação no frontend).
- Compartilhamento público de relatórios.
- Paginação/busca avançada nas listagens (volume esperado é baixo; pode virar melhoria futura).

## Design Considerations

- Reutilizar componentes shadcn/ui existentes: `Badge`, `DropdownMenu`, `Tooltip`, `Dialog`, `Skeleton`, toasts.
- Empty states seguem o padrão visual já usado (ícone + título + descrição + CTA primário azul `#3B5EEB`).
- A tela `/datasets` deve reaproveitar a estética da grade do `DatasetPicker` (`dataset-picker.tsx`), não criar um design novo.
- Loading states via convenção `loading.tsx` do App Router onde a tela é RSC.

## Technical Considerations

- `ProjectCard` está em `apps/web/src/app/(app)/projects/projects-view.tsx` (~linha 224); usar `next/link` e manter o dropdown fora da área do link.
- A query de datasets por `orgId` já existe em `(project)/projects/[projectId]/datasets/page.tsx` — extrair/reutilizar.
- Exclusão de dataset deve verificar vínculo com `projects.datasetId` antes de remover; registrar em `audit_logs` como as demais ações destrutivas.
- O placeholder do relatório está em `reports/page.tsx:73-89` (caso `insights`/`metrics` nulos).
- O auto-redirect pós-treinamento está em `predict/jobs/[jobId]/training-progress.tsx:120-126` — manter, apenas complementar com CTA explícito.

## Success Metrics

- Do login ao relatório de um modelo já treinado em no máximo 2 cliques (card do projeto → aba/CTA Reports).
- Nenhum elemento interativo desabilitado sem explicação em toda a UI.
- Nenhuma tela do fluxo sem empty state ou loading state.
- `/datasets` reflete 100% dos datasets da organização com status correto.

## Open Questions

- Os demais botões "Em breve" da tela Prepare ("Limpar", "Combinar", chat) devem ser removidos junto com "Gerar Dashboard" ou permanecem como teaser de roadmap? (US-034 assume remoção de placeholders em elementos interativos — confirmar.)
- Na tela `/datasets`, excluir um dataset vinculado a um projeto deve ser bloqueado ou permitido com aviso de que o projeto perderá o vínculo?
- O empty state de `/datasets` deve levar para "Novo projeto" ou permitir upload direto desvinculado de projeto (hoje o upload exige projeto)?
