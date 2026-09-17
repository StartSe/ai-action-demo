# PRD: Homepage pública do AutoML para executivos

## Introdução

Hoje a raiz do produto (`apps/web/src/app/page.tsx`) só faz
`redirect("/projects")`, e o `proxy.ts` manda quem não tem sessão para
`/login`. **Não existe uma porta de entrada pública**: um executivo que recebe
o link `automl.example.com` cai numa tela de login sem saber o que o produto
faz.

Esta PRD cria a homepage pública em `/`, voltada a **executivos e gestores de
negócio** (vendas, operações, finanças, marketing) que querem entender se
AutoML resolve um problema concreto deles — sem falar com um cientista de
dados. A página precisa **mostrar o produto funcionando**, não descrevê-lo:
animações sutis e orquestradas exibem o agente de IA analista de dados
respondendo uma pergunta, um modelo preditivo sendo treinado e comparado, e
os resultados virando gráfico e decisão.

O esboço visual fornecido (hero com mockup do dashboard, logos, "Como
funciona" em 4 passos, recursos, CTA final) é a **inspiração**, não a
estrutura final: a PRD propõe uma sequência de seções pensada para o
raciocínio de um executivo (problema → prova → como → confiança → ação).

| # | Frente | Situação atual no código | O que muda |
|---|---|---|---|
| A | Rota pública e navegação | `/` redireciona para `/projects`; proxy exige sessão em `/`; header público existe só inline em `/docs` e nas políticas; não há footer compartilhado | `/` vira landing pública (logado continua indo para `/projects`); `SiteHeader`/`SiteFooter` reutilizáveis em `components/marketing/` |
| B | Conteúdo e animações | Nada | Hero com "palco do produto" animado em 4 cenas, seções com reveal no scroll, agente digitando, mini-gráficos animando; tudo respeitando `prefers-reduced-motion` |
| C | Conversão | `RequestEnterpriseDialog` exige sessão (`requireSession()` na action); cadastro aberto em `/signup` mas gated por `approved_at` (lista de espera) | Modal de lead **público** gravando em `enterprise_leads` com `user_id` nulo e `source = homepage`; CTAs de cadastro com `?ref=home` para medir origem |
| D | Qualidade | Sem métrica de performance de página pública | Budget de JS, Lighthouse mobile ≥ 90, acessibilidade AA, SEO/OG |

## Objetivos

- Um visitante sem conta entende **em até 10 segundos** (hero) o que o
  AutoML faz e para quem é, e vê o produto em ação sem clicar em nada.
- Dois caminhos de conversão sempre visíveis: **"Começar grátis"** (cadastro)
  e **"Falar com nosso time"** (lead comercial), ambos mensuráveis no banco.
- Animação a serviço da explicação: cada movimento mostra uma etapa real do
  produto (dados → agente → modelo → decisão). Nenhuma animação decorativa
  em loop fora do palco do hero; tudo desliga com `prefers-reduced-motion`.
- Zero regressão para quem já usa o produto: usuário logado que acessa `/`
  continua caindo em `/projects`; links de convite (`/?invite=`) continuam
  funcionando.
- Performance de página de marketing: Lighthouse mobile ≥ 90 em Performance
  e Acessibilidade; LCP ≤ 2,5 s; CLS < 0,1.

## Decisões de produto

### Público e tom

Executivo de negócio, não técnico. Fala-se em **vendas, demanda, churn,
inadimplência, estoque, preço**; nunca em "features", "hiperparâmetros" ou
"pipeline". Métricas aparecem traduzidas ("acerta 87% das previsões", "erro
médio de 13%") ao lado do nome técnico em fonte menor. Tratamento: "você".

### Estrutura de seções (ordem final)

| # | Seção | Pergunta do executivo que responde | Âncora |
|---|---|---|---|
| 1 | Header fixo | Onde entro / onde começo? | — |
| 2 | Hero + palco do produto | O que é isso e o que ele faz? | `#inicio` |
| 3 | Empresas que confiam | Quem mais usa? | — |
| 4 | Casos de uso por decisão | Serve para o **meu** problema? | `#casos-de-uso` |
| 5 | Como funciona em 4 passos | O que eu preciso fazer? | `#como-funciona` |
| 6 | O agente analista de dados | Preciso de alguém técnico do meu lado? | `#agente` |
| 7 | Recursos e segurança | Posso confiar / colocar em produção? | `#recursos` |
| 8 | CTA final (banda escura) | E agora? | `#comecar` |
| 9 | Footer | Políticas, docs, contato | — |

Nav do header: Casos de uso, Como funciona, Agente, Recursos, Docs (link
para `/docs`), Entrar, **Começar grátis**. Não há Blog, Clientes ou Preços
(ver Non-Goals).

### Palco do produto (hero): 4 cenas em loop

Substitui o mockup estático do esboço. É um único componente client
(`HeroStage`) com uma sequência de cenas de ~4 s cada, conectadas por
transições de 600 ms, total ≈ 16 s, em loop:

| Cena | O que aparece | Movimento |
|---|---|---|
| 1. Dados | Uma planilha `vendas_2025.xlsx` sendo enviada; colunas detectadas ganham chips de tipo (data, número, categoria) e o alvo "Vendas" é destacado | Barra de upload 0→100 %, chips surgem em stagger de 80 ms |
| 2. Agente | Bolha do agente: "Encontrei sazonalidade em março e novembro. Promoção é a variável que mais explica as vendas. Quer que eu treine um modelo de previsão?" | Efeito de digitação (~30 caracteres/s), indicador "analisando…" antes |
| 3. Modelo | Três candidatos (Floresta aleatória, Gradient boosting, Regressão linear) com barras de progresso e métrica em linguagem de negócio; o vencedor recebe selo "Melhor modelo" | Barras enchem em ritmos diferentes; vencedor sobe para o topo |
| 4. Decisão | Gráfico "Previsto vs. Real" (linha) desenhando e KPIs contando: Acerto 87 %, Erro médio 13,4 %; card "Importância" com 4 barras (Preço, Promoção, Mês, Canal) | Linha desenha em 1,2 s, números contam de 0 ao valor, barras crescem |

Regras:

- Dados **fictícios e fixos** (constantes em `src/lib/marketing/hero-scenes.ts`);
  nunca lidos do banco. Nomes de empresas/pessoas não aparecem.
- Indicadores clicáveis abaixo do palco (4 pontos) permitem ir direto a uma
  cena; hover/focus no palco **pausa** o loop; palco fora da viewport ou aba
  oculta (`document.hidden`) também pausa.
- SSR renderiza a **cena 4 completa** (estado final, sem animação) — é o que
  aparece se o JS falhar e o que `prefers-reduced-motion` exibe para sempre.
  Após a hidratação, o loop começa da cena 1.
- Sem vídeo, sem Lottie, sem imagens raster do produto: tudo é DOM/SVG com
  os componentes do próprio design system (cards, badges, tipografia), o que
  mantém a fidelidade visual e o peso baixo.

### Princípios de animação (o "sem exageros")

Tokens em `src/components/marketing/motion-tokens.ts`, únicos para a página:

- Durações: micro 150 ms (hover), reveal 500 ms, transição de cena 600 ms.
- Easing padrão `[0.22, 1, 0.36, 1]` (ease-out); nada de bounce/elastic.
- Deslocamento máximo de entrada: 24 px; escala máxima em hover: 1,02.
- Reveal no scroll acontece **uma vez** (`viewport: { once: true }`),
  stagger máximo de 80 ms entre itens irmãos.
- Só o palco do hero tem loop. Nada animando em paralelo com ele acima da
  dobra.
- `useReducedMotion()` → reveals viram opacidade instantânea, palco fica na
  cena 4, contadores mostram o valor final, digitação vira texto pronto.

### Biblioteca

`motion` (Framer Motion, `import … from "motion/react"`), única dependência
nova. Só entra em ilhas client (`"use client"`); a página em si é Server
Component. `LazyMotion` + `domAnimation` para reduzir o bundle.

### Chamadas para ação e honestidade sobre o beta

- **Primária: "Começar grátis"** → `/signup?ref=home` (mais `&invite=` quando
  presente na URL da home). Microcopy: "Sem cartão de crédito."
- **Secundária: "Falar com nosso time"** → modal de lead público (Frente C).
- Como o acesso é liberado por convite/lista de espera, a home exibe abaixo
  do CTA primário a linha "Estamos em beta: novas contas entram na lista de
  espera e são liberadas em lotes." Decisão de abrir o acesso direto para
  quem vem da home fica em Open Questions e **não bloqueia** esta PRD.

### Lead público

Reutiliza `enterprise_leads`: `user_id` já é nulo (`ON DELETE SET NULL`),
`name`/`email` já existem como colunas copiadas. Diferenças do modal logado:
nome, email e empresa vêm do formulário; `source = homepage` (novo valor);
rate limit **por IP** (não há usuário); campo honeypot; sem envio de email.
Mesmo enum de objetivo e mesmo limite do desafio.

### Tema

A homepage é **sempre clara** (tema da marca), com a banda final escura
(`#0a0f1e`, mesmos gradientes radiais do `AuthShell`). Não herda o modo
escuro do app.

## User Stories

### Frente A: Rota pública e navegação

### US-001: `/` vira rota pública com redirecionamento de quem está logado
**Description:** Como visitante, quero acessar `/` sem conta e ver a
homepage; como usuário logado, quero continuar caindo em `/projects`.

**Acceptance Criteria:**
- [ ] `src/proxy.ts`: `pathname === "/"` é tratado como público (checagem explícita; não adicionar `"/"` a `PUBLIC_PATHS`, porque o `startsWith` tornaria tudo público)
- [ ] Novo helper exportado em `src/lib/session.ts`: `getOptionalSession(): Promise<SessionUser | null>` — devolve o usuário sem redirecionar (reaproveita o `getSessionUser` privado); `requireSession` continua igual
- [ ] `src/app/page.tsx` é removido e a home passa a viver em `src/app/(marketing)/page.tsx` (route group serve `/`); a page chama `getOptionalSession()` e, com sessão, faz `redirect` para `/projects` **preservando a query string** (`/?invite=X` → `/projects?invite=X`, para o auto-resgate de convite continuar funcionando)
- [ ] Sem sessão, renderiza a landing; `searchParams.invite` (só se casar com o formato de código de convite já validado em `src/lib/invites.ts`) é propagado para os links de `/signup` e `/login`
- [ ] Teste Vitest em `src/lib/__tests__/proxy-public-paths.test.ts` (ou no teste existente do proxy, se houver): `/` público, `/projects` não, `/abc` não; teste do helper de links `marketingAuthHref(path, { invite, ref })` em `src/lib/marketing/links.ts`
- [ ] Typecheck e lint passam

### US-002: Layout `(marketing)` com `SiteHeader` e `SiteFooter`
**Description:** Como visitante, quero um header fixo com navegação por
âncoras e um footer com políticas, para me orientar na página.

**Acceptance Criteria:**
- [ ] `src/app/(marketing)/layout.tsx` (server) monta `<SiteHeader /> {children} <SiteFooter />`, tema claro forçado (a raiz não recebe `.dark` nesta rota)
- [ ] `src/components/marketing/site-header.tsx` (client): `Logo` à esquerda; nav com âncoras Casos de uso, Como funciona, Agente, Recursos e link Docs; à direita "Entrar" (ghost) e "Começar grátis" (primário); recebe `invite`/`ref` para montar os hrefs com `marketingAuthHref`
- [ ] Header `sticky top-0`; ao rolar mais de 8 px ganha fundo `bg-background/80 backdrop-blur` e `border-b` (transição de 150 ms); abaixo de `md` a nav vira menu (Sheet/Drawer do design system) com os mesmos itens
- [ ] `src/components/marketing/site-footer.tsx` (server): `Logo`, "© {ano} AutoML.", links Política de Uso, Política de Privacidade, Docs, e link `mailto:` de contato (mesmo endereço usado em "Solicitar um conector")
- [ ] Rolagem por âncora suave (`scroll-behavior: smooth` só nesta rota) com `scroll-margin-top` igual à altura do header; desligada com `prefers-reduced-motion`
- [ ] Verificar no navegador em 375 px e 1280 px
- [ ] Typecheck e lint passam

### Frente B: Conteúdo e animações

### US-003: Hero com headline, CTAs e palco estático (SSR)
**Description:** Como executivo, quero entender em uma frase o que o produto
faz e ver o resultado final antes de qualquer animação.

**Acceptance Criteria:**
- [ ] `src/components/marketing/hero.tsx`: badge "AutoML para negócios"; H1 "IA preditiva, do dado à decisão em minutos." (com "minutos" em `text-primary`); subtítulo "O AutoML transforma suas planilhas em previsões e responde perguntas de negócio em linguagem natural. Sem código, sem cientista de dados."; botão primário "Começar grátis →" e secundário "Falar com nosso time"; microcopy "Sem cartão de crédito." e a linha de beta definida em "Decisões de produto"
- [ ] Todos os textos em constantes de `src/lib/marketing/copy.ts` (a PRD é a fonte; nada literal no JSX)
- [ ] `HeroStage` (client, `src/components/marketing/hero-stage.tsx`) nesta story renderiza apenas a **cena 4** (gráfico "Previsto vs. Real", 2 KPIs, card de importância) como estado inicial e único — sem timers ainda; dados de `src/lib/marketing/hero-scenes.ts`
- [ ] Gráfico em SVG inline (sem Plotly na home); largura 100 % do container, `aria-hidden` no palco inteiro, com um `<p class="sr-only">` descrevendo a cena
- [ ] Layout: duas colunas a partir de `lg` (texto 5/12, palco 7/12); empilhado abaixo, palco depois do texto
- [ ] H1 é o elemento LCP (texto, sem imagem acima da dobra além do logo)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-004: Seção "Empresas que confiam"
**Description:** Como executivo, quero ver quem já usa para calibrar confiança.

**Acceptance Criteria:**
- [ ] `src/components/marketing/trusted-by.tsx` (server): label "Empresas que confiam" e logos monocromáticos em SVG (`public/marketing/logos/*.svg`), lista em `copy.ts` (`TRUSTED_LOGOS`), hoje: Alura, FIAP, PM3, AutoML (ver Open Questions sobre autorização)
- [ ] Logos em `opacity-60`, `grayscale`, sem hover animado; altura fixa 28 px, `alt` com o nome
- [ ] Renderiza nada se a lista estiver vazia (não deixa um bloco em branco)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-005: Seção "Casos de uso por decisão"
**Description:** Como executivo, quero reconhecer o meu problema numa lista
de decisões de negócio, para saber que o produto serve para mim.

**Acceptance Criteria:**
- [ ] `src/components/marketing/use-cases.tsx`: label "Casos de uso", título "Que decisão você precisa tomar com mais segurança?", grade de 6 cards (3 col em `lg`, 2 em `md`, 1 abaixo): Prever vendas e demanda; Antecipar cancelamento de clientes (churn); Reduzir inadimplência; Planejar estoque e reposição; Ajustar preços e promoções; Priorizar leads e oportunidades
- [ ] Cada card: ícone lucide, título, uma frase de resultado ("Saiba quantos pedidos esperar por loja nas próximas 8 semanas."), tipo de modelo em pequeno (Previsão temporal / Classificação / Regressão) e um mini-gráfico SVG estático de 96×32 (sparkline ou barras) com dados fixos em `copy.ts`
- [ ] Conteúdo em `USE_CASES` (`copy.ts`); cards sem link nesta story (os CTAs ficam no hero/banda final)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-006: Seção "Como funciona em 4 passos"
**Description:** Como executivo, quero saber o que vou precisar fazer, em
passos que correspondem ao produto real.

**Acceptance Criteria:**
- [ ] `src/components/marketing/how-it-works.tsx`: label "Como funciona", título "Do seu dado à decisão em 4 passos", subtítulo "Feito para quem não é especialista em dados."
- [ ] Passos mapeados aos módulos reais: 1 Conecte seus dados (planilha, CSV ou conector) → 2 O agente prepara e entende (limpeza, tipos, sazonalidade) → 3 O AutoML treina e escolhe o melhor modelo → 4 Decida e publique (relatório, previsões em lote, API/MCP)
- [ ] Cada passo: ícone em quadrado `bg-primary/10`, número, título, frase; conectores entre passos (linha tracejada horizontal em `lg`, vertical abaixo) em SVG
- [ ] Conteúdo em `HOW_IT_WORKS_STEPS` (`copy.ts`)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-007: Seção "O agente analista de dados" (versão estática)
**Description:** Como executivo, quero ver que posso perguntar em português e
receber resposta com gráfico, para saber que não dependo de alguém técnico.

**Acceptance Criteria:**
- [ ] `src/components/marketing/agent-showcase.tsx`: duas colunas — esquerda texto (label "Agente de IA", título "Pergunte como perguntaria a um analista", 3 bullets: entende a pergunta, consulta seus dados, explica o resultado com gráfico); direita um "chat" com pergunta do usuário ("Quais lojas mais caíram em vendas no último trimestre e por quê?") e resposta do agente (2 frases + gráfico de barras SVG com 5 lojas + linha "Fonte: 12.480 linhas analisadas")
- [ ] Texto e dados do gráfico em `AGENT_SHOWCASE` (`copy.ts`); nenhum dado real
- [ ] Nesta story tudo é estático (a digitação entra em US-015)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-008: Seção "Recursos e segurança"
**Description:** Como executivo, quero saber se dá para levar isso a
produção com segurança.

**Acceptance Criteria:**
- [ ] `src/components/marketing/features.tsx`: label "Recursos principais", título "Tudo que você precisa para transformar dados em resultados", 4 cards (2×2 em `md`+): AutoML inteligente (testa, compara e escolhe modelos); Insights explicáveis (importância das variáveis em linguagem de negócio); Pronto para produção (previsões em lote, API, MCP e web app publicável); Segurança e controle (2FA, chaves rotacionáveis, trilha de auditoria, dados na sua organização)
- [ ] Nenhuma promessa que o produto não cumpra hoje: o texto de cada card deve corresponder a uma funcionalidade existente (Prever, Insights, Deploy API/MCP/web app, Segurança em Configurações)
- [ ] Conteúdo em `FEATURES` (`copy.ts`)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-009: Banda final de CTA
**Description:** Como executivo convencido, quero um convite claro para agir
no fim da página.

**Acceptance Criteria:**
- [ ] `src/components/marketing/final-cta.tsx`: seção `#comecar`, fundo `#0a0f1e` com os gradientes radiais do `AuthShell` (extrair para classe/utilitário compartilhado, sem duplicar CSS); título "Pronto para transformar seus dados em vantagem competitiva?", texto "Comece grátis e veja o poder do AutoML na prática."; botões "Começar grátis →" (branco) e "Falar com nosso time" (outline claro); microcopy "Sem cartão de crédito."
- [ ] Mesmos hrefs/props de convite e `ref` do hero (`marketingAuthHref`)
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-010: SEO, Open Graph e dados estruturados
**Description:** Como time AutoML, quero que o link da home renda um card
bonito no LinkedIn/WhatsApp e seja indexável.

**Acceptance Criteria:**
- [ ] `generateMetadata` em `(marketing)/page.tsx`: título "AutoML — IA preditiva, do dado à decisão em minutos", descrição ≤ 160 chars, `openGraph` e `twitter` com imagem estática `public/marketing/og.png` (1200×630, gerada uma vez e versionada), `alternates.canonical` a partir de `appOrigin()`
- [ ] JSON-LD `SoftwareApplication` (nome, descrição, `applicationCategory: BusinessApplication`, `offers` grátis) injetado via `<script type="application/ld+json">`
- [ ] Headings semânticos: um único `h1`, cada seção com `h2`, cards com `h3`
- [ ] `robots` permite indexar `/`; rotas do app continuam como estão
- [ ] Typecheck e lint passam

### US-011: Dependência `motion` e primitivas de animação
**Description:** Como desenvolvedor, quero primitivas únicas para toda a
página, para que o "sem exageros" seja regra de código e não de revisão.

**Acceptance Criteria:**
- [ ] `motion` adicionado em `apps/web/package.json` (versão fixa); nenhuma outra lib de animação
- [ ] `src/components/marketing/motion-tokens.ts`: `DURATION` (micro 0.15, reveal 0.5, scene 0.6), `EASE` `[0.22, 1, 0.36, 1]`, `STAGGER` 0.08, `DISTANCE` 24
- [ ] `src/components/marketing/reveal.tsx` (client): `<Reveal as delay>` — opacidade 0→1 e `y` 24→0 ao entrar na viewport, `once: true`, `amount: 0.3`; com `useReducedMotion()` renderiza sem transição
- [ ] `src/components/marketing/animated-number.tsx` (client): conta de 0 ao valor com `animate` do motion em 1,2 s ao entrar na viewport; recebe `format` (pt-BR, casas decimais, sufixo %); reduced motion = valor final
- [ ] `src/components/marketing/motion-provider.tsx`: `LazyMotion features={domAnimation} strict` envolvendo a home no layout `(marketing)`
- [ ] Teste Vitest de `formatAnimatedNumber` (pt-BR: `0,87`, `13,4%`, `12.480`)
- [ ] Typecheck e lint passam (atenção: setState só em callbacks de timer/`onAnimationComplete`, nunca síncrono em `useEffect`)

### US-012: Palco do hero — cenas 1 (Dados) e 2 (Agente)
**Description:** Como executivo, quero ver a planilha entrar e o agente
entender os dados, para acreditar que o começo é simples.

**Acceptance Criteria:**
- [ ] `hero-stage.tsx` ganha uma máquina de cenas (`scene: 0..3`) controlada por `setTimeout` em `useEffect` (limpo no unmount); estado inicial continua sendo a cena 4 para o SSR; após o mount, vai para a cena 1
- [ ] Cena 1: card "vendas_2025.xlsx · 12.480 linhas" com barra de progresso 0→100 % em 1,2 s; em seguida 6 chips de coluna (Data, Loja, Canal, Preço, Promoção, Vendas) aparecem em stagger com ícone de tipo; "Vendas" recebe badge "Alvo"
- [ ] Cena 2: indicador "Analisando…" (3 pontos pulsando, 600 ms) por 0,8 s, depois a bolha do agente com o texto de `HERO_SCENES.agent` em efeito de digitação (~30 caracteres/s), cursor ao fim
- [ ] Transição entre cenas com `AnimatePresence mode="wait"` (fade + 12 px), 600 ms
- [ ] Textos e dados em `hero-scenes.ts`; nada literal no componente
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-013: Palco do hero — cenas 3 (Modelo) e 4 (Decisão), loop e controles
**Description:** Como executivo, quero ver os modelos competindo e o
resultado virando gráfico, e poder pausar ou pular cenas.

**Acceptance Criteria:**
- [ ] Cena 3: três linhas de candidato com barra de progresso enchendo em ritmos diferentes (2,4 s / 2,0 s / 1,6 s) e métrica aparecendo ao fim ("Acerto 87 %", "84 %", "71 %"); o vencedor sobe para o topo (`layout` do motion) e recebe badge "Melhor modelo"
- [ ] Cena 4 (a mesma da US-003) agora anima ao entrar: linha "Previsto vs. Real" desenha via `pathLength` 0→1 em 1,2 s; KPIs com `AnimatedNumber`; barras de importância crescem em stagger
- [ ] Loop: ao fim da cena 4 espera 2 s e volta à cena 1; total ≈ 16 s
- [ ] Pausa: hover ou foco dentro do palco, `useInView` falso ou `document.visibilitychange` oculto pausam o timer; retomar continua a cena atual
- [ ] Indicadores: 4 botões (`aria-label="Cena 1: Dados"` etc.) abaixo do palco, o ativo preenchido; clicar vai para a cena e reinicia o timer dela
- [ ] `useReducedMotion()` true: sem timers, sem indicadores, cena 4 estática
- [ ] Verificar no navegador (inclusive com "Reduce motion" do sistema ligado)
- [ ] Typecheck e lint passam

### US-014: Reveal no scroll das seções e conectores animados
**Description:** Como visitante, quero que as seções entrem suavemente
conforme rolo, sem me distrair.

**Acceptance Criteria:**
- [ ] Título e subtítulo de cada seção envolvidos em `<Reveal>`; cards de Casos de uso, Recursos e passos de Como funciona com stagger de 80 ms (um `Reveal` por item com `delay = índice × STAGGER`)
- [ ] Conectores de "Como funciona" desenham (`pathLength`) quando a seção entra, 600 ms cada, em sequência
- [ ] Nenhum elemento acima da dobra usa `Reveal` (hero e header aparecem sem atraso)
- [ ] Verificar no navegador em 375 px e 1280 px
- [ ] Typecheck e lint passam

### US-015: Agente analista — digitação e gráfico surgindo
**Description:** Como executivo, quero ver a resposta do agente sendo escrita,
para sentir a interação real.

**Acceptance Criteria:**
- [ ] Ao entrar na viewport (uma vez): pergunta aparece de imediato; indicador "analisando…" 0,8 s; resposta em digitação (~30 caracteres/s); ao terminar o texto, barras do gráfico crescem em stagger e a linha "Fonte: …" aparece
- [ ] Componente `TypingText` reutilizável (`src/components/marketing/typing-text.tsx`) usado aqui e na cena 2 do palco; reduced motion = texto completo
- [ ] Sem loop; se o usuário rolar para fora e voltar, o estado final permanece
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-016: Casos de uso — mini-gráficos animam ao entrar
**Description:** Como executivo, quero que os cards de caso de uso "ganhem
vida" de forma discreta ao aparecer.

**Acceptance Criteria:**
- [ ] Sparklines desenham (`pathLength`) e barras crescem em 600 ms quando o card entra na viewport, uma vez, junto com o `Reveal` do card
- [ ] Hover: card sobe 2 px e `shadow-md` em 150 ms; nada mais
- [ ] Reduced motion = gráficos completos, sem hover animado
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### Frente C: Conversão

### US-017: Lead público em `enterprise_leads` (`source = homepage`)
**Description:** Como time AutoML, quero receber pedidos de contato de quem
ainda não tem conta, com a mesma qualificação do modal logado.

**Acceptance Criteria:**
- [ ] `ENTERPRISE_LEAD_SOURCES` ganha `homepage`; **nenhuma migration**: em `db/schema.ts` `enterprise_leads.user_id` e `org_id` já aceitam nulo, `source` é `text` (não enum) e `name`/`email`/`company` são `NOT NULL` e vêm do formulário
- [ ] `src/lib/marketing/homepage-lead.ts` (client-safe): schema Zod `homepageLeadSchema` — `name` (2–120), `email` (formato válido; recusa domínios descartáveis mais comuns via lista curta), `company` (obrigatório, ≤ 200), `objective` (mesmo enum), `challenge` (10–1000), `website` (honeypot: deve vir vazio); mensagens pt-BR; `HOMEPAGE_LEAD_*` para os textos do modal
- [ ] `src/lib/marketing/homepage-lead-request.ts` (server, deps injetáveis `insertLead`, `audit`, `rateLimitStore`, `now`): valida → honeypot preenchido responde sucesso falso silencioso (não grava, evento `lead.homepage_honeypot`) → rate limit por IP `HOMEPAGE_LEAD_RATE_LIMIT` (5/24 h, `hitRateLimit`) → INSERT com `user_id = null`, `org_id = null`, `source = homepage` → evento `lead.homepage_request` com metadata `{ objective, source }` (nunca email, empresa ou desafio)
- [ ] Server action `submitHomepageLead` em `src/app/(marketing)/actions.ts` faz só o wiring (IP via `headers()`, mesmas fontes de IP do `requestMeta`)
- [ ] `docs/metricas-uso.md`: eventos novos na tabela e consulta "leads da homepage por semana e por objetivo"
- [ ] Testes Vitest em `src/lib/__tests__/homepage-lead.test.ts`: honeypot, email inválido, rate limit no 6º envio, sucesso grava `source = homepage` e `user_id` nulo, metadata do evento não contém email
- [ ] Typecheck e lint passam

### US-018: Modal "Falar com nosso time" na homepage
**Description:** Como executivo, quero pedir uma conversa sem criar conta.

**Acceptance Criteria:**
- [ ] `src/components/marketing/contact-dialog.tsx` (client): botão + `Dialog` do design system; campos Nome, Email corporativo, Empresa, Objetivo (RadioGroup com `ENTERPRISE_OBJECTIVE_OPTIONS`), Seu desafio (textarea com contador), honeypot oculto (`autocomplete="off"`, `tabindex=-1`, fora do fluxo visual); botão `w-full` "Conversar com nosso time"; linha com cadeado e `ENTERPRISE_PRIVACY_NOTICE`
- [ ] Validação client com `homepageLeadSchema`; erro abaixo do campo indicado por `field`; erro sem campo acima do botão
- [ ] Sucesso: conteúdo do modal vira "Recebemos seu pedido. Nossa equipe entra em contato em até 1 dia útil." + botão Fechar; grava `sessionStorage["homepage-lead:sent"]` e todos os botões "Falar com nosso time" da página passam a "Solicitação enviada" (desabilitados) via `useSyncExternalStore`
- [ ] Usado no hero, no header mobile e na banda final; `RequestEnterpriseDialog` (logado) **não** é alterado
- [ ] Verificar no navegador (envio real em dev grava a linha no Postgres local)
- [ ] Typecheck e lint passam

### US-019: Origem do cadastro (`ref=home`) mensurável
**Description:** Como time AutoML, quero saber quantos cadastros vieram da
homepage.

**Acceptance Criteria:**
- [ ] Links de cadastro da home levam `?ref=home`; `/signup` aceita `ref` (só valores de uma lista curta, `SIGNUP_REFS`) e o guarda no mesmo mecanismo do convite: campo do body no fluxo email/senha e cookie httpOnly de curta duração no fluxo Google (padrão de `storeInviteCookie`/`invite-cookie.ts`, sem duplicar a lógica — generalizar o helper se necessário)
- [ ] O hook after-create de `lib/auth.ts` grava `ref` na metadata do evento de criação de conta já existente (ou em `auth.signup`, se for preciso criar); nunca em coluna nova de `users`
- [ ] `docs/metricas-uso.md`: consulta "cadastros por `ref` por semana"
- [ ] Teste do parser `parseSignupRef` (aceita `home`, recusa lixo)
- [ ] Typecheck e lint passam

### Frente D: Qualidade

### US-020: `/docs` e políticas usam `SiteHeader`/`SiteFooter`
**Description:** Como visitante, quero a mesma navegação em todas as páginas
públicas.

**Acceptance Criteria:**
- [ ] `docs/page.tsx`, `politica-de-uso/page.tsx` e `politica-de-privacidade/page.tsx` trocam o header inline pelo `SiteHeader` (variante `compact`, sem âncoras da home — só Logo, Docs, Entrar, Começar grátis) e ganham `SiteFooter`
- [ ] Nenhuma mudança de conteúdo nessas páginas; `PUBLIC_PATHS` inalterado
- [ ] Verificar no navegador
- [ ] Typecheck e lint passam

### US-021: Performance, acessibilidade e budget
**Description:** Como time, quero garantir que a home carrega rápido no
celular de um executivo e passa em acessibilidade.

**Acceptance Criteria:**
- [ ] Lighthouse mobile (Chrome, throttling padrão, build de produção): Performance ≥ 90, Acessibilidade ≥ 95, SEO ≥ 95; resultados colados em `progress.txt`
- [ ] LCP ≤ 2,5 s e CLS < 0,1 no relatório; o palco reserva altura fixa (`aspect-ratio`) para não deslocar layout
- [ ] JS da rota `/` ≤ 180 kB gzip (verificar em `next build`); `motion` só via `LazyMotion`
- [ ] axe DevTools sem violações críticas/sérias; navegação por teclado alcança header, CTAs, indicadores do palco e modal; foco visível
- [ ] Contraste AA em todos os textos, inclusive sobre a banda escura
- [ ] Com "Reduce motion" do sistema ligado: nenhum `setTimeout` de cena é criado (verificar com breakpoint/log em dev) e nenhuma transição roda
- [ ] Typecheck e lint passam

## Requisitos funcionais

- FR-1: `GET /` sem sessão renderiza a homepage; com sessão redireciona para `/projects` preservando a query string.
- FR-2: O proxy trata exatamente `/` como público; nenhuma outra rota muda de política.
- FR-3: Parâmetro `invite` válido em `/` é propagado para todos os links de `/signup` e `/login` da página.
- FR-4: Todos os links de cadastro da home levam `ref=home`, gravado na metadata do evento de criação de conta.
- FR-5: O header é fixo, ganha fundo translúcido após 8 px de rolagem e vira menu abaixo de `md`.
- FR-6: O palco do hero exibe 4 cenas em loop (≈ 16 s), pausa com hover/foco/fora da viewport/aba oculta, e tem 4 indicadores clicáveis.
- FR-7: O HTML servido (SSR) contém a cena 4 completa; com `prefers-reduced-motion` a página não cria timers nem transições.
- FR-8: Reveals no scroll acontecem uma única vez por elemento, com deslocamento ≤ 24 px e duração ≤ 500 ms.
- FR-9: O modal "Falar com nosso time" grava em `enterprise_leads` com `user_id` nulo, `source = homepage`, após validação, honeypot e rate limit 5/24 h por IP.
- FR-10: Após envio bem-sucedido, todos os botões "Falar com nosso time" da página ficam desabilitados como "Solicitação enviada" até fechar a aba.
- FR-11: Eventos de auditoria de lead nunca contêm email, nome, empresa ou texto do desafio.
- FR-12: Todo texto visível da home vem de `src/lib/marketing/copy.ts` ou `hero-scenes.ts`.
- FR-13: Nenhum dado exibido na home vem do banco de dados; tudo é constante fictícia.
- FR-14: A home tem um único `h1`, `h2` por seção, metadados Open Graph com imagem 1200×630 e JSON-LD `SoftwareApplication`.
- FR-15: A home é sempre renderizada em tema claro, independentemente da preferência do app.

## Non-Goals (fora de escopo)

- Blog, página de clientes/cases, página de preços, página "Sobre".
- Vídeo, Lottie, imagens raster do produto ou screenshots reais.
- Ferramenta de analytics de terceiros (Plausible, GA); mede-se pelo banco.
- Envio de email para a equipe ao receber lead (mesma decisão das PRDs anteriores).
- Mudar a regra de aprovação/lista de espera do cadastro.
- Alterar o `RequestEnterpriseDialog` logado ou as telas do app.
- Internacionalização; a home é só em pt-BR.
- Testes E2E automatizados de animação (verificação é manual no navegador + Lighthouse).
- Modo escuro na home.

## Considerações de design

- Direção: clara, respiro generoso, azul da marca `#3b5eeb` (`--primary`) como único acento; cinzas do design system; banda final em `#0a0f1e` com os gradientes radiais do `AuthShell`. Fonte Inter (já carregada), `--radius: 0.625rem`.
- Palco do hero e mock do chat usam os **mesmos componentes** do produto (Card, Badge, tipografia) para que a home pareça o app — sem inventar uma segunda linguagem visual.
- Gráficos da home são SVG inline desenhados à mão (linha, barras, sparkline), nunca Plotly.
- Ícones lucide já usados no app (Database, Sparkles, LineChart, CheckCircle2, ShieldCheck, Rocket).
- Hierarquia por seção: label pequeno em `text-primary` + `bg-primary/10` (como no esboço), `h2` de 32–40 px, subtítulo em `text-muted-foreground`.
- Referências no repositório: `components/auth/auth-shell.tsx` (painel escuro), `components/auth/logo.tsx`, header inline em `app/docs/page.tsx`, `components/app/request-enterprise-dialog.tsx` (estrutura do formulário de lead).
- Esboço original do usuário: imagem fornecida na conversa de 2026-09-03 (hero à esquerda + dashboard à direita, logos, 4 passos, 3 recursos, banda escura). Mantido como referência de tom visual; a estrutura de seções é a desta PRD.

## Considerações técnicas

- Next.js 16 App Router: a home fica em `src/app/(marketing)/` (layout próprio com header/footer e `LazyMotion`); `src/app/page.tsx` atual é removido. Ler `node_modules/next/dist/docs/` antes de mexer em `proxy.ts`, `generateMetadata` e route groups (o `AGENTS.md` avisa que a versão difere do conhecimento prévio).
- `getOptionalSession` é o único ponto novo em `lib/session.ts`; não relaxar `requireSession`.
- Lint `react-hooks/set-state-in-effect` é erro no projeto: timers de cena fazem `setState` em callbacks, nunca no corpo do `useEffect`; leitura de `sessionStorage` via `useSyncExternalStore`.
- Hidratação: o estado inicial do palco é determinístico (cena 4) e não depende de `Date.now()`/`Math.random()`.
- `motion` v12 (`motion/react`) é compatível com React 19; usar `LazyMotion` + `m` em vez de `motion` onde possível para reduzir bundle.
- Lead público: `hitRateLimit`/`enforceRateLimit` do Redis já existem; chave `ratelimit:homepage-lead:<ip>`. Fail-open sem Redis (consistente com o restante), mas honeypot e validação continuam.
- `enterprise_leads.user_id` e `org_id` já aceitam nulo e `source` é `text`: o lead público entra sem migration (US-017).
- Os dados de `hero-scenes.ts` e `copy.ts` são módulos puros e client-safe (sem `@/db`, sem `server-only`).
- Testes Vitest existentes que varrem rotas (`internal-routes-cors.test.ts`) não são afetados: nenhuma rota de API nova (a home usa server actions).

## Métricas de sucesso

- Leads: ≥ 5 leads/semana com `source = homepage` no primeiro mês após publicar (consulta em `docs/metricas-uso.md`).
- Cadastros: ≥ 30 % dos cadastros semanais com `ref = home` no primeiro mês.
- Performance: Lighthouse mobile Performance ≥ 90, LCP ≤ 2,5 s, CLS < 0,1 (registrado em `progress.txt` a cada onda que mexer no hero).
- Regressão zero: nenhum evento `authz.*` novo e nenhum relato de usuário logado preso em `/` após o deploy.
- Qualitativo: em 5 sessões de teste com executivos (prática de 100 executivos), ≥ 4 conseguem explicar em uma frase o que o produto faz depois de ver só o hero.

## Ondas de entrega

| Onda | Stories | Resultado |
|---|---|---|
| 1 — Fundação | US-001, US-002, US-003, US-009, US-010 | `/` pública, com hero estático, header/footer, CTA final e SEO; já publicável |
| 2 — Conversão | US-017, US-018, US-019 | Lead público e origem do cadastro mensuráveis — os dois CTAs têm peso igual, então entram antes do conteúdo e das animações |
| 3 — Conteúdo | US-004, US-005, US-006, US-007, US-008 | Todas as seções, ainda sem animação |
| 4 — Animação | US-011, US-012, US-013, US-014, US-015, US-016 | Palco em 4 cenas, reveals, agente digitando |
| 5 — Qualidade | US-020, US-021 | Páginas públicas unificadas, Lighthouse e acessibilidade fechados |

Até a US-018 entrar, o botão "Falar com nosso time" do hero e da banda final
é um link `mailto:` de contato (placeholder). O `prd.json` do Ralph renumera as
stories nessa ordem de execução e cita o ID desta PRD no título de cada uma.

## Open Questions

1. **Acesso direto para quem vem da home**: manter lista de espera (decisão
   atual, com a linha de beta no hero) ou aprovar automaticamente cadastros
   com `ref=home`? Impacta a copy "Começar grátis" e a métrica de cadastros.
2. **Logos**: há autorização para exibir Alura, FIAP e PM3? Se não, a seção
   sai com só AutoML ou é removida até ter 3+ logos autorizados.
3. **Contato**: qual endereço/canal recebe o lead da home (mesmo `mailto:`
   do "Solicitar um conector"? WhatsApp?). Afeta o footer e a mensagem de
   sucesso ("em até 1 dia útil" precisa ser sustentável).
4. **Imagem OG**: gerar via design (Figma) ou renderizar do próprio hero
   (`modern-screenshot` já está no projeto)? Padrão sugerido: PNG estático
   versionado.
5. **Headline**: manter "IA preditiva, do dado à decisão em minutos." (do
   esboço) ou testar uma variante orientada a resultado ("Preveja vendas,
   churn e demanda com os dados que você já tem.")? Sem analytics, um teste
   A/B não é mensurável hoje — decidir por convicção.
