# PRD: Sidebar de forecasting compacta, double check da quota, limite do lote e plano da IA no Explore

## 1. Introdução/Overview

Quatro ajustes de refinamento identificados em uso real da plataforma:

1. **Sidebar de forecasting sobrecarregada** — no modo forecasting, os blocos fixos da sidebar (header, busca, tabs, bloco de Eixo temporal + Campo de identificação com parágrafos longos, rodapé com contador) consomem ~570px, deixando ~70–100px para a lista de colunas: o usuário vê só ~2 colunas num laptop. O bloco de forecasting deve ficar compacto no final da sidebar e o contador de predições deve sair (já existe em Configurações).
2. **Double check do "zeramento" do contador de predições** — investigação concluída: o contador é por **usuário** (`inference_usage`, PK `user_id + year_month`), sem vínculo com projeto; deletar/recriar projeto **não** zera nem permite burlar o limite. O "zeramento" observado foi a virada do mês na janela **UTC** (às 21h de 31/08 no horário de Brasília o contador já vira para setembro). Ação: teste de regressão + documentação, mantendo UTC.
3. **Limite do lote desalinhado da quota** — o texto do WebApp público fala em "limite de 10.000 linhas" (por arquivo de lote), o que se confunde com a quota mensal de 5.000 inferências. Um arquivo de lote nunca deveria exceder a quota mensal inteira: reduzir o limite do lote para 5.000 e reescrever o texto distinguindo os dois limites.
4. **"Interpretação da IA" no Explore não é interpretação do prompt** — hoje a aba mostra uma explicação pós-execução dos resultados. O plano passo a passo (interpretação do prompt do usuário) já é gerado internamente na etapa de planejamento, mas nunca exibido. A aba deve passar a mostrar esse plano, substituindo a explicação pós-execução.

## 2. Goals

- Lista de colunas da sidebar em forecasting exibindo ≥ 8 linhas numa janela de 768px de altura.
- Prova automatizada de que o consumo de inferências sobrevive à exclusão do projeto (sem brecha de burla).
- Nenhum texto na plataforma que confunda limite de linhas por arquivo com quota mensal; lote limitado a 5.000 linhas.
- Aba "Interpretação da IA" exibindo o plano passo a passo que a IA seguiu para atender o prompt.

## 3. User Stories

### US-001: Compactar o bloco de forecasting na sidebar
**Description:** Como usuário configurando um forecasting, quero uma sidebar enxuta para ver mais colunas do dataset sem rolagem excessiva.

**Acceptance Criteria:**
- [ ] Em `predict-view.tsx`, os parágrafos descritivos do bloco de forecasting saem do fluxo: a descrição do "Eixo temporal" (linhas ~713-716) e a `ID_COLUMN_DESCRIPTION` (~205 caracteres) viram tooltip acionado por ícone de ajuda (ⓘ) ao lado do título de cada campo
- [ ] O bloco mantém apenas: título curto + ícone de ajuda + `<select>` para cada um dos dois campos, com espaçamento reduzido (bloco fixo ≤ ~120px de altura total)
- [ ] Avisos condicionais (ex.: "Todas as colunas de data estão ignoradas...") continuam aparecendo quando aplicáveis
- [ ] A lista de colunas (`flex-1`) passa a exibir ≥ 8 linhas em janela de 768px de altura no modo forecasting
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-002: Remover o contador de predições da sidebar
**Description:** Como usuário, não preciso ver o total de predições na sidebar do Prever, pois essa informação já está em Configurações; quero o espaço liberado para a lista de colunas.

**Acceptance Criteria:**
- [ ] O `InferenceUsageIndicator` é removido do rodapé da sidebar em `predict-view.tsx` (linha ~774)
- [ ] Exceção: quando o uso está ≥ 80% do limite, um aviso compacto de uma linha ainda aparece (estado âmbar atual), para o usuário não ser surpreendido pelo 429
- [ ] O parágrafo explicativo do rodapé é reduzido a uma linha ou removido
- [ ] O card "Uso" em Configurações (`settings/page.tsx`) permanece como está (fonte oficial da informação)
- [ ] Código morto do indicador (se não usado em outro lugar) é removido
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Teste de regressão — consumo de inferências sobrevive à exclusão do projeto
**Description:** Como operador da plataforma, quero garantia automatizada de que deletar e recriar projetos não zera nem burla a quota mensal de inferências.

**Acceptance Criteria:**
- [ ] Teste (Vitest) em `apps/web/src/lib/` provando que `inference_usage` é chaveado por `user_id + year_month` e que o count registrado via `recordProjectInferenceUsage` permanece após a exclusão do projeto de origem
- [ ] Teste cobrindo a virada de mês: `currentYearMonth()` usa UTC; consumo registrado em meses diferentes cai em linhas diferentes
- [ ] Comentário em `inference-quota.ts` documentando que a janela é UTC (para usuários em BRT, o reset ocorre às 21h do último dia do mês)
- [ ] Typecheck passes; Tests pass

### US-004: Reduzir limite do lote para 5.000 linhas e clarificar textos
**Description:** Como usuário do WebApp público, quero entender a diferença entre o limite de linhas por arquivo e a minha quota mensal, sem textos que sugiram um limite de 10.000 inferências.

**Acceptance Criteria:**
- [ ] `MAX_BATCH_ROWS` em `apps/worker/jobs/model_predict_batch.py` passa de 10.000 para 5.000; mensagem de erro pt-BR atualizada
- [ ] Testes do worker atualizados (`test_model_predict_batch.py`)
- [ ] Texto do lote em `public-web-app.tsx` (linha ~234) atualizado para: limite de 5.000 linhas por arquivo, deixando explícito que cada linha consome 1 predição da quota mensal do responsável pelo app
- [ ] Comentário/constante correlata em `apps/web/src/lib/predictions.ts` (linha ~70) atualizada para manter sincronia com o worker
- [ ] Nenhuma outra superfície da UI menciona "10.000" em contexto de predição/lote (verificar com grep)
- [ ] Typecheck passes; Tests pass (pytest e Vitest)
- [ ] Verify in browser using dev-browser skill

### US-005: Exibir o plano passo a passo na aba "Interpretação da IA" do Explore
**Description:** Como usuário do Explore, quero ver na "Interpretação da IA" o plano passo a passo que a IA montou a partir do meu prompt, para entender como ela interpretou o que pedi.

**Acceptance Criteria:**
- [ ] O plano gerado na etapa de planejamento (`planningSystemPrompt`, `pipeline.ts` linhas ~243-249) é persistido no resultado da análise (campo novo `plan` no tipo `ExploreResult` em `db/schema.ts` — campo JSONB/texto, sem migração destrutiva)
- [ ] A aba "Interpretação da IA" em `result-panel.tsx` passa a renderizar o plano como lista numerada de passos (interpretação do prompt), substituindo a explicação pós-execução dos resultados
- [ ] O prompt de planejamento é ajustado para produzir passos claros e legíveis para o usuário final (pt-BR, sem jargão de pandas/Plotly nos rótulos), mantendo no máximo 5 passos
- [ ] O título da análise continua sendo gerado (pode migrar para a etapa de planejamento, eliminando a chamada LLM de interpretação pós-execução, ou manter a etapa só para o título — decidir na implementação pelo caminho mais simples)
- [ ] A prévia no card do chat (`explore-view.tsx` linha ~551) passa a mostrar o plano (line-clamp mantido)
- [ ] Análises antigas sem plano persistido exibem o fallback "Nenhuma interpretação disponível para esta análise."
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

## 4. Functional Requirements

**Sidebar de forecasting**
- FR-1: No modo forecasting, o bloco de Eixo temporal e Campo de identificação deve ocupar no máximo ~120px fixos no final da sidebar, com descrições acessíveis via tooltip.
- FR-2: O contador de predições não deve aparecer na sidebar, exceto como aviso compacto quando o uso ≥ 80% do limite.
- FR-3: A lista de colunas deve exibir ≥ 8 linhas em janela de 768px no modo forecasting.

**Quota de inferências**
- FR-4: O consumo mensal de inferências deve permanecer chaveado por usuário e mês (UTC), imune à exclusão de projetos — comprovado por teste automatizado.

**Limite do lote**
- FR-5: A predição em lote deve aceitar no máximo 5.000 linhas por arquivo (worker e textos da UI sincronizados).
- FR-6: Os textos da UI devem distinguir claramente limite por arquivo vs quota mensal.

**Explore**
- FR-7: A aba "Interpretação da IA" deve exibir o plano passo a passo derivado do prompt do usuário, persistido junto ao resultado da análise.

## 5. Non-Goals (Out of Scope)

- Mudar a janela mensal da quota para horário de Brasília (mantém UTC).
- Job de reset/limpeza de linhas antigas de `inference_usage` (histórico preservado).
- Limitar o lote dinamicamente ao saldo restante da quota (o check de quota existente já bloqueia com 429).
- Exibir o plano em tempo real durante a execução da análise (spinner de etapas permanece como está).
- Mostrar aviso de quota nas telas de deploy (fica para PRD futura, se necessário).
- Redesign geral da tela Prever — apenas os ajustes de sidebar descritos.

## 6. Design Considerations

- **Tooltips (US-001):** usar o componente de tooltip existente do shadcn/ui; ícone de ajuda `HelpCircle` (lucide) em `text-muted-foreground`, tamanho 14-16px, ao lado do label.
- **Aviso de 80% (US-002):** reusar o estado âmbar atual do `InferenceUsageIndicator` (ícone `AlertTriangle` + texto curto), apenas suprimindo o estado normal.
- **Plano no Explore (US-005):** renderizar como `<ol>` numerada com espaçamento confortável; manter a aba com o mesmo nome "Interpretação da IA".

## 7. Technical Considerations

- **US-001/002:** mudanças concentradas em `predict-view.tsx`; nenhuma alteração de servidor. `getUserInferenceUsage` continua sendo carregado em `predict/page.tsx` (necessário para o aviso de 80%).
- **US-003:** os testes podem usar o padrão de store injetada já existente em `inference-quota.ts` (há `dbStore` isolável); para o cenário de exclusão de projeto, basta provar que a leitura não depende de `projects` (a tabela não tem FK para projeto).
- **US-004:** manter uma única fonte de verdade possível para o limite (constante espelhada web/worker com comentário de sincronia, como já é feito em outros pontos).
- **US-005:** o plano hoje é uma string de até 5 linhas; persistir como texto simples é suficiente. O tipo `ExploreResult` (`db/schema.ts:380-393`) é JSONB — adicionar campo opcional `plan?: string` é retrocompatível. Avaliar mover a geração do título para a etapa de planejamento (retornando JSON `{title, plan}`) e **remover** a chamada LLM de interpretação pós-execução — economiza uma chamada por análise; se complicar, manter a etapa apenas para o título.
- A rota SSE (`app/api/explore/chat/route.ts`) não precisa mudar, a menos que se queira emitir o plano — fora de escopo.

## 8. Success Metrics

- ≥ 8 colunas visíveis na sidebar em forecasting (antes: ~2) em janela de 768px.
- Teste de regressão da quota verde no CI, cobrindo exclusão de projeto e virada de mês.
- Zero ocorrências de "10.000" em textos de predição da UI; lote e textos falando 5.000.
- 100% das novas análises do Explore exibindo plano passo a passo na aba "Interpretação da IA".

## 9. Open Questions

- O aviso compacto de 80% na sidebar deve linkar para Configurações (onde o uso completo é exibido)?
- Nas análises de conversa/meta do Explore (rota de chat, sem execução de código), a aba deve mostrar o quê — a resposta em texto atual ou ocultar a aba?
- Vale exibir também o plano nas análises antigas regenerando-o sob demanda, ou o fallback basta?
