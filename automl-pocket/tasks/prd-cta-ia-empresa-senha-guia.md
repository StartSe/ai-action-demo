# PRD: CTA "IA para sua empresa", Segurança só para contas com senha, troca de senha e tela do guia de dados

## Introdução

Esta PRD reúne quatro ajustes que saíram da revisão de UX do beta (mockups de
2026-09-03). O fio condutor: a plataforma já tem os mecanismos (lead em
`enterprise_leads`, 2FA, guia do problema por IA), mas a **apresentação** ainda
fala em "ambiente exclusivo", esconde o CTA comercial em texto pequeno, mostra
um card de Segurança inútil para quem entra pelo Google, não permite trocar a
senha estando logado e empilha dois cards grandes na tela "Escolha uma fonte
de dados".

| # | Frente | Dor observada | Situação atual no código |
|---|---|---|---|
| A | CTA "IA para sua empresa" e novo formulário de lead | O CTA atual ("Solicitar ambiente exclusivo para sua empresa") é um link discreto e o formulário pede cargo, tamanho do time e interesse, que o usuário não sabe responder na hora. Queremos um CTA fixo e visível na sidebar, um bloco em Configurações e um banner contextual depois do resultado, todos abrindo um modal curto de qualificação (objetivo, empresa, desafio). | `RequestEnterpriseDialog` + `EnterpriseInlineCta` gravam em `enterprise_leads` (US-032/033) via `requestEnterpriseEnvironment`; `source` em `settings`, `sidebar`, `quota_*`, `training_success`. Sidebar só mostra o CTA expandida. Tela de treino concluído já tem CTA inline. Relatório do modelo não tem CTA. |
| B | Bloco Segurança para contas só Google | O card "Segurança" aparece para quem entrou pelo Google apenas com um aviso de que a 2FA é do Google. Ocupa espaço e confunde. | `TwoFactorSecurityCard` sempre renderizado em `settings/page.tsx`; com `hasPasswordAccount=false` mostra `TWO_FACTOR_GOOGLE_ONLY_NOTICE`. |
| C | Trocar senha no login convencional | Quem usa email e senha só consegue mudar a senha pelo fluxo "Esqueci minha senha" (email). Não há opção em Configurações. | Better Auth 1.7 expõe `changePassword` (`/change-password`, aceita `revokeOtherSessions`); hash bcrypt injetado em `lib/auth.ts`. Não há UI, evento de auditoria nem email de aviso. |
| D | Tela "Escolha uma fonte de dados" poluída | Os cards "Qual problema você quer resolver?" e "Guia do problema" (com tabela de características e downloads) ficam acima dos cards de upload. O usuário que já tem planilha precisa rolar; o que não tem, não percebe que aquilo é para ele. | `projects/[projectId]/page.tsx` renderiza `ProblemDescriptionCard` + `ProblemBriefCard` antes do grid de fontes. `prepare/page.tsx` usa `ProblemBriefCard variant="collapsed"`. |

As frentes são independentes e podem ser priorizadas separadamente. A ordem
sugerida está em "Ondas de entrega".

## Objetivos

- Todo usuário logado vê, em qualquer tela, um caminho de no máximo dois
  cliques para "Falar com nosso time", e o pedido é gravado com objetivo,
  empresa e desafio em texto livre.
- O bloco de Configurações e o banner pós-resultado usam a mesma linguagem
  ("IA para sua empresa", "Conversar com nosso time") e o mesmo modal.
- Contas que entram só pelo Google não veem o card Segurança.
- Contas com senha trocam a senha em Configurações informando a senha atual,
  com opção de encerrar as outras sessões, evento de auditoria e email de
  aviso.
- A tela "Escolha uma fonte de dados" mostra só os cards de fonte e um card
  de CTA compacto; a experiência "descrever o problema, gerar guia, baixar
  planilha modelo" ganha tela própria.
- Nenhuma migration destrutiva: colunas novas são nulas, colunas antigas
  continuam existindo, consultas de métricas continuam funcionando.

## Decisões de produto

### Formulário de lead: substituir pelo do mockup

Decisão: o modal passa a pedir **objetivo** (rádio, uma opção), **empresa**
(texto, obrigatório) e **desafio** (texto livre, obrigatório). Cargo, tamanho
do time e interesse deixam de ser pedidos. Motivo: o objetivo em rádio
qualifica o lead com um clique e o desafio em texto é o que a equipe
comercial realmente usa na primeira conversa. As colunas `role`, `team_size`
e `interest` ficam no banco (nulas para leads novos) para não quebrar as
consultas antigas.

Opções do objetivo (valor no banco e rótulo na tela):

| Valor (`objective`) | Rótulo |
|---|---|
| `prever_vendas_demanda` | Prever vendas ou demanda |
| `analisar_dados_decisoes` | Analisar dados e tomar decisões |
| `automatizar_processos` | Automatizar processos |
| `criar_agentes_ia` | Criar agentes de IA |
| `implementar_ia_empresa` | Implementar IA na empresa |
| `outro` | Outro |

O campo "desafio" reutiliza a coluna `message` (mesmo limite de 1000 chars);
só muda o rótulo e passa a ser obrigatório na validação nova.

### Onde o CTA aparece

- **Sidebar**: card fixo acima de "Configurações", sempre visível (não
  depende de rolagem). Com a sidebar recolhida vira um botão só com ícone e
  tooltip. `source = sidebar`.
- **Configurações**: card "Quer aplicar IA na sua empresa?" com lista de
  frentes (Estratégia de IA, Dados, Machine Learning, Agentes de IA,
  Automação) e botão primário. Substitui o card "Ambiente exclusivo para sua
  empresa". `source = settings`.
- **Pós-resultado**: banner verde em dois momentos, treino concluído
  (`source = training_success`, já existe e é redesenhado) e rodapé do
  relatório do modelo em Prever (`source = model_report`, novo).
- **Limites atingidos** (`quota_*`) e card do guia: continuam existindo, só
  mudam o texto do botão para "Falar com nosso time".

### Notificação de leads

Continua **só gravando no banco** (mesma decisão da PRD anterior). Consulta
em `docs/metricas-uso.md`. Email para a equipe fica em Non-Goals.

### Guia de dados: tela própria

O fluxo "descrever o problema, gerar guia, baixar planilha modelo" vai para
`/projects/[projectId]/guia`. Motivo: o guia tem tabela de características,
lista de armadilhas e dois downloads; não cabe em modal sem rolagem interna.
A tela "Escolha uma fonte de dados" ganha um único card compacto ("Precisa de
ajuda para preparar seus dados?") que leva para lá.

### Troca de senha

Só para contas com `accounts.provider_id = "credential"`. Exige senha atual,
nova senha com mínimo 8 caracteres (mesmo `minPasswordLength` do Better
Auth), confirmação, e checkbox "Encerrar sessões em outros dispositivos"
marcada por padrão. Não exige código 2FA (a senha atual já prova posse). Após
trocar, envia email "Sua senha foi alterada" com orientação para quem não
reconhece a ação.

## User Stories

### Frente A: CTA "IA para sua empresa" e novo formulário de lead

### US-001: Colunas novas em `enterprise_leads` e validação do novo formulário
**Description:** Como equipe AutoML, quero que cada lead registre o objetivo
escolhido e o desafio em texto, para qualificar a conversa antes do primeiro
contato.

**Acceptance Criteria:**
- [ ] Enum Postgres `enterprise_objective` com os seis valores da tabela em "Decisões de produto"; coluna `enterprise_leads.objective` (enum, nula) adicionada
- [ ] `enterprise_leads.interest` passa a aceitar nulo (migration `ALTER COLUMN ... DROP NOT NULL`); `role` e `team_size` continuam existindo e não são mais preenchidos
- [ ] Migration Drizzle aditiva gerada com `db:generate` e aplicada em dev; nenhuma linha existente é alterada
- [ ] Em `src/lib/enterprise-lead.ts`: `ENTERPRISE_OBJECTIVE_LABELS`, `ENTERPRISE_OBJECTIVE_OPTIONS`, novo schema Zod com `objective` (obrigatório), `company` (obrigatório, até 200), `challenge` (obrigatório, 10 a 1000 chars, gravado em `message`), `source`; mensagens de erro em pt-BR ("Escolha o principal objetivo.", "Descreva seu desafio em pelo menos 10 caracteres.")
- [ ] `ENTERPRISE_LEAD_SOURCES` ganha `model_report`
- [ ] `src/lib/enterprise-lead-request.ts` grava `objective` e `message`, mantém rate limit 3/24h por usuário e o evento `lead.enterprise_request` com metadata `{ objective, source }` (sem o texto do desafio)
- [ ] `docs/metricas-uso.md`: consulta 19 passa a agrupar por `objective` e por `source`; linha da tabela de eventos atualizada
- [ ] Testes Vitest em `src/lib/__tests__/enterprise-lead.test.ts`: objetivo ausente, desafio curto, empresa vazia, sucesso grava `objective` e `message`, `source = model_report` aceito
- [ ] Typecheck/lint passam

### US-002: Modal "IA para sua empresa" redesenhado
**Description:** Como usuário do beta, quero contar meu objetivo e desafio em
um formulário curto, para ser contatado pelo nosso time sem preencher
dados que não sei.

**Acceptance Criteria:**
- [ ] `RequestEnterpriseDialog` passa a renderizar: ícone (Sparkles, lucide), título "IA para sua empresa", subtítulo "Conte um pouco sobre seu desafio.", grupo de rádio "Qual é o principal objetivo?" com as seis opções (cada opção em uma linha com borda, a selecionada com borda `primary`), campo "Empresa" com placeholder "Digite o nome da sua empresa", textarea "Seu desafio" com placeholder "Descreva o desafio ou objetivo que gostaria de alcançar com IA..." e contador de caracteres, botão primário de largura total "Conversar com nosso time →"
- [ ] Nome e email não aparecem como campos; continuam vindo da sessão no servidor
- [ ] Rodapé fora do card do modal (ou última linha dentro dele): ícone de cadeado + "As informações são enviadas para nossa equipe e usadas apenas para contato sobre sua solicitação."
- [ ] Componente `RadioGroup` adicionado em `src/components/ui/radio-group.tsx` (shadcn sobre Radix, pacote `radix-ui` já instalado) e usado no modal; navegação por teclado (setas) funciona
- [ ] Erros de validação aparecem abaixo do campo; erro de rate limit mostra "Você já enviou 3 pedidos hoje. Nossa equipe vai entrar em contato."
- [ ] Sucesso mostra `ENTERPRISE_LEAD_SUCCESS_MESSAGE`; o estado "enviado" continua em `sessionStorage` e o rótulo dos CTAs vira "Solicitação enviada"
- [ ] `ENTERPRISE_CTA_LABEL` passa a "Falar com nosso time"; `EnterpriseInlineCta` (limites e card do guia) usa o novo rótulo sem outra mudança visual
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-003: Card fixo na sidebar
**Description:** Como usuário, quero ver sempre na sidebar um convite
discreto para falar com nosso time, para lembrar que posso levar meu
caso adiante.

**Acceptance Criteria:**
- [ ] Novo componente `SidebarEnterpriseCard` renderizado em `app-sidebar.tsx` acima do link "Configurações", em bloco fixo (não rola com a lista de itens); separado por `border-t`
- [ ] Sidebar expandida: card com fundo `primary/5` e borda `primary/20`, ícone Sparkles + rótulo em caixa alta "IA PARA SUA EMPRESA" na cor `primary`, texto "Transforme um desafio real do negócio em uma solução com IA." e botão `outline` "Falar com nosso time →"
- [ ] Sidebar recolhida: só um botão quadrado com o ícone Sparkles e `title`/tooltip "IA para sua empresa"
- [ ] Ambos abrem `RequestEnterpriseDialog` com `source="sidebar"`; no estado enviado o botão mostra "Solicitação enviada" desabilitado
- [ ] O card não empurra o rodapé (usuário e Sair) para fora da tela em altura 720px; se faltar espaço, a lista de navegação é o que rola
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (expandida, recolhida, 720px de altura)

### US-004: Card "Quer aplicar IA na sua empresa?" em Configurações
**Description:** Como usuário, quero entender em Configurações o que a
AutoML pode fazer além do AutoML, para decidir se peço uma conversa.

**Acceptance Criteria:**
- [ ] O card "Ambiente exclusivo para sua empresa" é substituído por um card em duas colunas (empilha em `sm`): à esquerda ícone Sparkles em quadrado azul, título "Quer aplicar IA na sua empresa?", texto "O AutoML é só o começo. Se sua empresa tem um desafio de negócio que pode ser resolvido com IA, nosso time pode ajudar a transformar o caso de uso em uma solução real." e botão primário "Conversar com nosso time →"; à direita lista com ícone de check: Estratégia de IA, Dados, Machine Learning, Agentes de IA, Automação
- [ ] Posição: logo abaixo do card "Uso"
- [ ] Abre `RequestEnterpriseDialog` com `source="settings"`
- [ ] Textos centralizados em `src/lib/enterprise-lead.ts` (sem strings soltas no JSX)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill

### US-005: Banner "Quer levar este modelo para produção?" pós-resultado
**Description:** Como usuário que acabou de treinar um modelo, quero ver no
momento do resultado um convite para levar aquele modelo para produção com
ajuda da equipe.

**Acceptance Criteria:**
- [ ] Novo componente `ProductionCtaBanner` com fundo `emerald-50`/borda `emerald-200` (variante escura correspondente) em duas colunas: à esquerda card branco com "Modelo finalizado com sucesso! 🎉", nome do modelo/projeto, até duas métricas principais (classificação: acurácia e F1; regressão e forecasting: MAE e MAPE, formatados como no relatório) e "Última atualização: hoje, HH:MM"; à direita ícone de foguete, título "Quer levar este modelo para produção?", texto "Nossa equipe pode ajudar sua empresa a transformar este experimento em uma solução de IA integrada aos seus sistemas e processos." e botão `outline` verde "Conversar com nosso time →"
- [ ] Se as métricas não estiverem disponíveis, o bloco de métricas é omitido sem quebrar o layout
- [ ] Em `training-progress.tsx`, quando `status === "succeeded"`, o `EnterpriseInlineCta` atual é substituído pelo banner com `source="training_success"`; abrir o modal continua pausando o redirecionamento automático
- [ ] Em `predict-view.tsx`, o banner aparece no rodapé do relatório (depois das seções de insights) com `source="model_report"`, apenas quando existe modelo treinado com sucesso
- [ ] Botão "Fechar" (X) no banner do relatório oculta pelo resto da sessão por projeto (`sessionStorage["production-cta:dismissed:<projectId>"]`); o banner da tela de treino não tem fechar
- [ ] Estado enviado: botão "Solicitação enviada" desabilitado
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (treino concluído e relatório, classificação e regressão)

### Frente B: Segurança só para contas com senha

### US-006: Ocultar o card Segurança para contas só Google
**Description:** Como usuário que entra pelo Google, não quero ver um card de
Segurança que não me permite fazer nada.

**Acceptance Criteria:**
- [ ] `settings/page.tsx` renderiza `TwoFactorSecurityCard` apenas quando `hasPasswordAccount === true`
- [ ] `TWO_FACTOR_GOOGLE_ONLY_NOTICE` e o ramo `!hasPasswordAccount` do card são removidos (ou o card passa a exigir `hasPasswordAccount` no tipo)
- [ ] Nenhuma outra tela referencia o aviso removido (grep limpo)
- [ ] Teste existente do card ajustado; Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (conta Google e conta com senha)

### Frente C: troca de senha para login convencional

### US-007: Rota de troca de senha, rate limit, auditoria e email de aviso
**Description:** Como usuário com senha, quero que a troca de senha seja
protegida e deixe rastro, para que eu seja avisado se alguém trocar por mim.

**Acceptance Criteria:**
- [ ] `lib/auth.ts`: `rateLimit.customRules["/change-password"] = { window: 3600, max: 5 }` (5 tentativas por hora por IP/usuário)
- [ ] Hook `after` do Better Auth para o caminho `/change-password` com sucesso registra `auth.password_changed` em `audit_logs` com `{ revokeOtherSessions }`; falha por senha atual incorreta registra `auth.password_change_failed`
- [ ] `buildPasswordChangedEmail` em `src/lib/email-templates.ts`: assunto "Sua senha do AutoML foi alterada", corpo com data/hora, "Se não foi você, redefina sua senha agora" com link para `/forgot-password` e orientação para ativar a verificação em duas etapas; enviado via `sendEmail` no mesmo hook (nunca lança; falha só loga)
- [ ] Testes Vitest: template gera assunto e link corretos; regra de rate limit presente na config; hook grava evento (deps injetadas)
- [ ] `docs/metricas-uso.md` e `SECURITY.md` listam os dois eventos novos
- [ ] Typecheck/lint passam

### US-008: Seção "Senha" no card Segurança
**Description:** Como usuário com senha, quero trocar minha senha em
Configurações informando a senha atual, para não depender do email de
redefinição.

**Acceptance Criteria:**
- [ ] `TwoFactorSecurityCard` é renomeado (ou envolvido) em `SecurityCard` com duas seções: "Senha" (nova, em cima) e "Autenticação em dois fatores" (existente)
- [ ] Seção "Senha": texto "Use uma senha com pelo menos 8 caracteres que você não usa em outros sites." e botão `outline` "Alterar senha"
- [ ] Diálogo `ChangePasswordDialog` com campos: "Senha atual", "Nova senha" (mín. 8, mostra em tempo real "Mínimo de 8 caracteres" e "Diferente da senha atual"), "Confirmar nova senha", checkbox marcada "Encerrar sessões em outros dispositivos"; botão mostrar/ocultar senha em cada campo
- [ ] Envio via `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`; erro de senha atual incorreta mostra "Senha atual incorreta."; erro de rate limit mostra "Muitas tentativas. Tente novamente em uma hora."
- [ ] Sucesso: toast "Senha alterada." e texto no diálogo "Enviamos um email de confirmação para <email>."; com `revokeOtherSessions`, a sessão atual continua válida
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (senha errada, senhas diferentes, sucesso)

### Frente D: tela de fonte de dados limpa e tela do guia

### US-009: Tela `/projects/[projectId]/guia`
**Description:** Como executivo sem planilha pronta, quero uma tela dedicada
para descrever meu problema, gerar o guia e baixar a planilha modelo.

**Acceptance Criteria:**
- [ ] Nova rota `src/app/(project)/projects/[projectId]/guia/page.tsx` (server component) com escopo de org via `findProjectScoped`; projeto inexistente → `notFound()`
- [ ] Cabeçalho: link "← Voltar para o projeto", título "Prepare seus dados com ajuda da IA", subtítulo "Conte o que você quer prever e a IA sugere quais informações sua planilha deveria ter, exemplos e uma planilha modelo."
- [ ] Corpo: `ProblemDescriptionCard` e `ProblemBriefCard` (variante completa) reaproveitados sem mudança de comportamento (gerar, gerar novamente, downloads .csv/.xlsx)
- [ ] Rodapé com botão primário "Já tenho minha planilha, enviar dados →" para `/projects/[id]/datasets`
- [ ] A tela não aparece como aba na `project-navbar`; é alcançada pelos CTAs da US-010 e pelo link do card recolhido em `prepare/page.tsx` ("Abrir guia completo")
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (sem descrição, com descrição sem guia, com guia)

### US-010: Card "Precisa de ajuda para preparar seus dados?" na tela de fonte
**Description:** Como usuário criando um projeto, quero escolher a fonte de
dados sem distração e, se não tiver dados, encontrar um único convite claro
para a ajuda da IA.

**Acceptance Criteria:**
- [ ] Em `projects/[projectId]/page.tsx`, `ProblemDescriptionCard` e `ProblemBriefCard` são removidos; o grid de fontes de dados passa a vir logo após o título
- [ ] Abaixo do grid, novo componente `DataHelpCtaCard`: fundo `primary/5`, ícone Sparkles em círculo, título "Precisa de ajuda para preparar seus dados?", texto "Conte o que você quer prever e a IA sugere quais informações sua planilha deveria ter, exemplos e uma planilha modelo.", botão `outline` "Me ajuda a preparar os dados →" para `/projects/[id]/guia`; à direita ilustração decorativa estática (chip "Seu desafio" + esboço de tabela, em SVG/CSS, oculta em `sm`)
- [ ] Quando o projeto já tem `problem_brief`, o card muda para "Seu guia do problema está pronto" com o alvo do brief em uma linha e botão "Ver guia" (mesmo destino)
- [ ] Quando o projeto tem descrição mas não tem guia, o botão diz "Gerar guia com IA →"
- [ ] O card não aparece quando o projeto já tem dataset vinculado (a tela nesse caso já redireciona ou mostra o aviso de dataset existente)
- [ ] Typecheck/lint passam
- [ ] Verify in browser using dev-browser skill (sem descrição, com guia, mobile)

## Functional Requirements

- FR-1: `enterprise_leads` ganha `objective` (enum de seis valores, nulo) e `interest` passa a aceitar nulo; nenhuma coluna é removida.
- FR-2: O formulário de lead exige `objective`, `company` (até 200) e `challenge` (10 a 1000, gravado em `message`); cargo, tamanho do time e interesse não são mais coletados.
- FR-3: O evento `lead.enterprise_request` registra `objective` e `source`, nunca o texto do desafio.
- FR-4: `source` aceita `settings`, `sidebar`, `quota_storage`, `quota_inference`, `quota_llm`, `training_success`, `model_report`.
- FR-5: Rate limit de leads continua 3 por usuário a cada 24 h.
- FR-6: O CTA da sidebar é sempre visível (expandida: card; recolhida: ícone com tooltip).
- FR-7: Configurações mostra o card "Quer aplicar IA na sua empresa?" abaixo de "Uso" e não mostra mais "Ambiente exclusivo para sua empresa".
- FR-8: O banner pós-resultado aparece na tela de treino concluído e no rodapé do relatório; no relatório pode ser fechado pelo resto da sessão.
- FR-9: Todos os CTAs entram no estado "Solicitação enviada" após um envio bem-sucedido na sessão.
- FR-10: O card Segurança só é renderizado para contas com `accounts.provider_id = "credential"`.
- FR-11: A troca de senha exige senha atual, nova senha com mínimo 8 caracteres igual à confirmação e diferente da atual; `revokeOtherSessions` padrão verdadeiro.
- FR-12: Troca de senha limitada a 5 tentativas por hora; sucesso gera `auth.password_changed` e email de aviso; falha por senha incorreta gera `auth.password_change_failed`.
- FR-13: A tela `/projects/[id]/guia` reaproveita os componentes de descrição e guia sem alterar geração, cache, rate limit ou downloads.
- FR-14: A tela "Escolha uma fonte de dados" mostra apenas o grid de fontes e o card "Precisa de ajuda para preparar seus dados?", que muda de texto conforme o projeto tenha descrição e/ou guia.

## Non-Goals (fora de escopo)

- Envio de email para a equipe ou para o usuário ao receber um lead; integração com CRM (HubSpot, monday.com, Zapier); painel admin de leads.
- Editar nome, email ou foto em Configurações (card Perfil continua somente leitura).
- Definir senha para contas que entraram só pelo Google (vincular provedor credential); passkeys/WebAuthn.
- MFA para contas só Google.
- Mudar o prompt, o schema ou os limites da geração do guia do problema; mudar o formato das planilhas modelo.
- Aba "Guia" na navbar do projeto.
- Remover as colunas `role`, `team_size`, `interest` do banco ou migrar leads antigos.
- Dark mode dedicado para os banners além do que os tokens existentes já cobrem.

## Design Considerations

- Mockups de referência: tela de Configurações com sidebar e modal (imagem 1 do briefing) e card "Precisa de ajuda para preparar seus dados?" (`Screenshot 2026-09-03 at 08.28.04.png`).
- Componentes existentes a reaproveitar: `Dialog`, `Card`, `Button`, `Textarea`, `Input`, `Checkbox`, `Tooltip`, `sonner`; novo `RadioGroup` (shadcn) em `src/components/ui/`.
- Ícones lucide: `Sparkles` (IA para sua empresa), `Rocket` (produção), `CheckCircle2` (lista de frentes), `Lock` (rodapé de privacidade), `Eye`/`EyeOff` (senha).
- Cores: CTAs de lead em `primary`; banner pós-resultado em verde (`emerald`), único ponto que usa verde para não competir com estados de sucesso do treino.
- Todos os textos em pt-BR centralizados em `src/lib/enterprise-lead.ts` (leads), `src/lib/two-factor-*`/novo `src/lib/password-change.ts` (senha) e `src/lib/project-problem.ts` (guia).

## Technical Considerations

- Better Auth 1.7.1: `changePassword` já existe no client e no servidor; a senha nova passa pelo `password.hash` (bcrypt, 12 rounds) já injetado. Verificar no código do plugin se `revokeOtherSessions` preserva a sessão atual (comportamento documentado: sim).
- Hooks do Better Auth (`hooks.after`) já são usados pelo `loginAuditPlugin`; o evento de troca de senha segue o mesmo padrão.
- Resend: `sendEmail` nunca lança; sem `RESEND_API_KEY` loga no console. O template segue `buildPasswordResetEmail`.
- Migration Drizzle: criar enum + `ADD COLUMN objective` + `ALTER COLUMN interest DROP NOT NULL`. Rodar `db:generate` e revisar o SQL antes de commitar.
- `EnterpriseLeadSource` é usado no Zod da action e no metadata do evento; adicionar `model_report` nos dois lugares e no `docs/metricas-uso.md`.
- `predict-view.tsx` é grande (1300+ linhas); o banner entra como componente isolado com props mínimas (`projectId`, `modelName`, `metrics`, `source`).
- Métricas para o banner: usar o mesmo objeto que alimenta `model-report.tsx`; em `training-progress.tsx`, se o job ainda não expuser métricas, omitir o bloco (critério da US-005).
- Nenhuma env nova nesta PRD.

## Estratégia incremental e compatibilidade

### Princípios

- Migrations só aditivas; leads antigos continuam legíveis.
- Componentes antigos (`EnterpriseInlineCta`, `ProblemDescriptionCard`, `ProblemBriefCard`) continuam existindo; só mudam de lugar ou de rótulo.
- Cada story passa em `typecheck`, `lint` e `test` isoladamente.

### Ondas de entrega

| Onda | Stories | Migration? | Observação |
|---|---|---|---|
| 1 | US-006, US-009, US-010 | não | Limpeza de tela e ocultar Segurança; entregam valor imediato sem risco de dados |
| 2 | US-007, US-008 | não | Troca de senha; depende só do Better Auth |
| 3 | US-001, US-002 | sim (aditiva) | Novo formulário; a UI antiga continua funcionando até a US-002 entrar |
| 4 | US-003, US-004, US-005 | não | Novos pontos de entrada usando o modal novo |

## Success Metrics

- Leads por semana (consulta 19) sobem em relação às quatro semanas anteriores à Onda 4, com `objective` preenchido em 100% dos novos.
- Distribuição de `source`: `sidebar` e `model_report` passam a aparecer nas consultas.
- Zero leads com `objective` nulo criados após a Onda 3.
- Pelo menos um `auth.password_changed` em produção sem `auth.password_change_failed` correlato de força bruta (rate limit nunca atingido por usuário legítimo).
- Contas só Google: nenhum card Segurança renderizado (verificação manual).
- Tela "Escolha uma fonte de dados" cabe sem rolagem em 1366×768 com sidebar expandida.

## Open Questions

- O banner do relatório deve reaparecer em uma nova sessão depois de fechado, ou lembrar o fechamento por usuário no banco? (Assumido: por sessão.)
- Devemos manter o `EnterpriseInlineCta` nas mensagens de limite atingido com o texto atual ("Os limites são do beta. Precisa de mais capacidade?") ou alinhar ao novo discurso? (Assumido: manter texto, só trocar o rótulo do botão.)
- A troca de senha deve encerrar também os "dispositivos confiáveis" da 2FA? (Assumido: não; o Better Auth trata isso separadamente.)
