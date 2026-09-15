# PRD: Revisão da suíte IA para Executivos — onboarding, setup, erros orientados e conta inicial

Data: 15/09/2026. Escopo: os dezessete apps de `ai-action-demo/`, revisados um a um (código e capturas de tela em desktop e celular, em modo demonstração) em relação a: demonstração e onboarding, design e cor do segmento, setup básico com opções avançadas ocultas, orientação para o setup, usabilidade e fluxo, conectores, utilidade e quick wins, facilidade de configuração e mensagens de erro. Continua `tasks/prd-ui-ux-executivos.md` (fundação visual e capacidades, 13/09/2026) e `tasks/prd-novos-apps.md` (sete apps novos, 14/09/2026).

## Introduction

A suíte já tem uma fundação sólida e igual nos dezessete apps: uma tela, uma promessa, modo demonstração sem chave, `/setup` gerado a partir de `lib/integracoes.ts`, histórico, MCP, formulários públicos e rotinas. A revisão desta PRD olhou para o que acontece **depois** que o executivo gosta da demonstração e tenta usar o app de verdade: criar uma conta, conectar a IA, entender o que ainda falta, errar e se recuperar sem ajuda técnica.

Três problemas aparecem em todos os apps e viram mudanças transversais (nascem no `pdi-time`, replicadas nos outros dezesseis pelo `scripts/verificar-padrao.sh`):

1. **Não existe conta.** Qualquer pessoa com o endereço abre o app publicado, vê o histórico, troca as chaves em `/setup` e gera resultados com a chave paga de quem publicou. Rafael pediu uma autenticação inicial simples, no modelo "Setup Account" (nome, e-mail, senha, confirmar senha), com SQLite.
2. **Erro de IA vira beco sem saída.** `lib/ai.ts` só trata 401 e 429. Um 402 (sem crédito no OpenRouter), 404 (modelo retirado), 400 (modelo não aceita a entrada), erro de rede ou JSON inválido devolvido por um modelo gratuito chegam à tela como `A IA não respondeu (HTTP 402). {"error":...}` ou `fetch failed`, com status 500 e um botão "Tentar de novo" que repete o mesmo erro. O seletor de modelo existe em `/setup`, mas não é oferecido na hora do erro, e o teste de conexão não confere se o modelo escolhido funciona com o plano da pessoa.
3. **O setup não diz o que falta e por quê.** O chip "Modo demonstração" e o cartão "Tudo pronto" cobrem a IA. As integrações opcionais (Trello, ElevenLabs, Gmail, Apollo...) não aparecem na tela principal como algo a fazer, então a pessoa conecta a IA, vê "Tudo pronto" e nunca descobre que o app faria mais.

A revisão por app (seções "Por app" abaixo) traz o que é específico: cores de acento que não conversam com o segmento, exemplos fracos, campos demais no primeiro passo, mensagens genéricas em rotas próprias e três quick wins por app. Apps avaliados como "OK como está" ficam registrados sem história, conforme pedido.

### Premissas

- P1. `PADRAO.md` continua valendo: Next.js 16, Tailwind 4, React 19, sem biblioteca de UI, `node:sqlite`, IA via OpenRouter, português sem jargão na tela, verificação por `verificar-jargao.mjs` e `verificar-padrao.sh`. Nenhuma dependência nova para autenticação: hash de senha com `crypto.scrypt` e sessão com cookie assinado, tudo do Node.
- P2. Toda mudança em arquivo compartilhado nasce no `pdi-time` e é replicada nos outros dezesseis na mesma história, com `scripts/verificar-padrao.sh` saindo 0.
- P3. A conta inicial é **uma conta de administrador por instância** (o executivo que publicou). Convidar outras pessoas, perfis e permissões ficam fora (Non-Goals). O modelo é a tela "Setup Account" enviada por Rafael: título, uma frase de privacidade, nome, e-mail, senha, confirmar senha, um botão.
- P4. Continuam **públicos sem login**, porque são links que o app distribui para terceiros ou chamadas de máquina já autenticadas de outro jeito: `/f/<token>` e `/api/f/<token>` (formulários), `/s/<id>` (páginas publicadas do Clone de Site), `/webhook/**` (assinatura HMAC), `/mcp` (Bearer), `/api/rotinas/executar` (código de rotina), `/api/health`, `/api/setup/oauth/**/callback` (retorno dos provedores, protegido por cookie de estado) e `/setup/trello` (retorno do Trello). Tudo o mais exige sessão.
- P5. O modo demonstração continua existindo **depois** de entrar: criar a conta não conecta nada, só protege a instância. O catálogo passa a dizer "crie sua conta em 30 segundos e teste com dados de exemplo" em vez de "roda sem login".
- P6. O plano gratuito do Render tem disco efêmero: conta, chaves e histórico se perdem a cada deploy, como hoje já acontece com as chaves. O app avisa isso na tela de criação de conta quando detecta que roda no Render (`RENDER` no ambiente) sem `DATA_DIR` persistente, e o `render.yaml` continua com o bloco `disk` comentado.
- P7b. Envio de e-mail (decidido em 15/09/2026): Resend continua o padrão e ganha, ao lado, "Conectar meu Gmail" e "Conectar meu Outlook" em um clique (US-024). SendGrid está fora (plano gratuito extinto em 26/07/2025) e OAuth do Resend não existe (só chave de API).
- P7. Mensagens de erro seguem a regra: **o que aconteceu, o que fazer, para onde ir**, com um botão de ação quando existir (trocar o modelo, adicionar créditos, conectar de novo). O código HTTP acompanha a causa (401, 402, 429, 502, 503) em vez de 500 genérico, para que a tela escolha a ação certa.
- P9. A referência visual de 15/09/2026 é de **estilo**, não de escopo: o menu do modelo ("PDIs", "Colaboradores", "Relatórios") vira os destinos que existem de verdade (Início, Histórico, Configurações); o roxo do modelo é o acento do `pdi-time`, e cada app aplica o mesmo desenho no seu próprio acento, com `--accent-2` derivado por regra.
- P8. Ordem: primeiro as transversais no `pdi-time` (Fase 0), depois um app por história em ordem de prioridade (Alta → Média → Baixa), cada uma começando pela replicação dos arquivos compartilhados, e por fim catálogo e documentação.

## Goals

- G1. Nenhum app publicado fica aberto: o primeiro acesso cria a conta de administrador em menos de 30 segundos e todo acesso seguinte pede e-mail e senha, sem nenhuma dependência nova.
- G2. Todo erro de IA na tela diz a causa e oferece a saída em um botão: 100% das falhas do OpenRouter (401, 402, 404, 429, 5xx, rede, resposta inválida) mapeadas em `lib/ai.ts` com código próprio; zero ocorrências de `HTTP <n>` cru ou `fetch failed` na tela.
- G3. No plano gratuito do OpenRouter a pessoa nunca fica travada: o seletor de modelo em `/setup` mostra o recomendado e ao menos dois gratuitos, e o erro por falta de crédito oferece "Usar um modelo gratuito agora" que troca e repete a chamada.
- G4. O executivo sabe sempre qual é o próximo passo: a tela principal mostra, sem ocupar espaço do resultado, o que falta conectar e para que serve, e `/setup` distingue "mínimo para rodar" de "faz mais com".
- G5. Cada app tem cor de acento coerente com o segmento e mantém a família visual da suíte.
- G6. Cada app com veredito "Precisa de PRD" recebe seus quick wins (mínimo três) e correções de mensagens genéricas nas rotas próprias.
- G8. Os dezessete apps adotam a família visual nova (referência enviada em 15/09/2026): header com navegação real, hero com promessa e passos, corpo em duas colunas no desktop e uma no celular, `/setup` com progresso e chips de estado — sem nenhuma tela inventada e sem biblioteca de UI nova.
- G9. Nenhuma frase de segurança na tela é falsa: as chaves passam a ser guardadas cifradas e o texto sobre conexões externas é reescrito para o que de fato acontece.
- G7. Os dezessete `render.yaml` continuam gerados e iguais no repo público (verificado em 15/09/2026), e as três imagens ainda privadas no GHCR ficam públicas.

## Diagnóstico por app (revisão de 15/09/2026)

Cada app foi revisado no código e em capturas (desktop vazio 1400x900, `?exemplo=1` em 1400x1500, celular 390 px e `/setup`) nos nove critérios pedidos. Nenhum ficou "OK como está" porque todos repassam erros crus da IA (transversal); os quatro de prioridade Baixa estão quase prontos e recebem só ajustes pequenos além das transversais.

| App | Prioridade | O que pesa |
|---|---|---|
| Ata Executiva | Alta | Prazos calculados a partir de hoje sem data da reunião; `mailto:` com nomes no lugar de e-mails; cobrança "agendada" sem canal e com link `localhost`; acento confunde com o aviso de demonstração |
| PDI do Time | Média | Exemplo não gera; botão a 1250 px; lembretes com `localhost`; autoavaliação com falha da IA vira linha morta; `integrations` vazio |
| Voz do Cliente | Média | Resumo do demo contradiz o NPS -9; notas descartadas em silêncio; "nada encontrado" apaga o resultado; CRM sem "onde obter" |
| Radar de Sinais | Média | Fontes do demo sem link; grafo sem legenda; "O que fazer" atrás de "Ver mais"; sem fontes em português sem Exa |
| Bússola de IA | Média | Análise real sem IA rotulada como exemplo; fluxo de coleta não narrado; `window.alert`; leitura repetitiva |
| Posts em Minutos | Média | Rotina com empresa vazia; link de aprovação `localhost`; erros da OpenAI genéricos; prévia com imagens vazias |
| Prospecção no LinkedIn | Média | Demo sem mensagens; botão desabilitado sem explicação; sem caminho para o Prospect Halo; `Promise.all` perde tudo em 429 |
| Simulador de Vendas | Média | Demo analisa outra conversa; conversa é o quarto campo; parse ignora linhas em silêncio; sala por voz sem tempo limite |
| Leitura de Contratos | Média | PDF grande estoura o modelo; opt-in sem explicação; avisos via Slack falham em silêncio; risco depois da sugestão |
| Clone de Site | Média | Marca escondida e "Tailwind/CSS" em destaque; demo não avisa que a captura não foi lida; modelo de visão oculto |
| Vídeos de Campanha | Média | Sem "Copiar" por legenda; frase do Higgsfield sem link; imagem esquecida obriga a recriar; sem aviso de vídeo pronto |
| Custos de IA | Média | Gmail/Outlook exigem credenciais de aplicativo que o executivo não tem; câmbio manual |
| Prospecção com IA | Média | Mensagens da Apollo com nome de variável; "Zona Web Unlocker" no grupo principal; nomes de fornecedor na tela |
| Agente de Kanban | Baixa | "a partir de o quadro"; quatro botões empilhados; erros do Trello crus |
| Entrevistadora IA | Baixa | Nomes de produto nos cartões; erros da ElevenLabs em inglês; lista com hífens |
| Atendente no WhatsApp | Baixa | Conexão com a Meta sem resumo de negócio nem diagnóstico do webhook; `window.alert` |
| Analista Financeiro | Baixa | `integrations` vazio; "fonte de dados" sem explicação; erros crus nas três rotas |

Estado da publicação: ver a tabela abaixo. Relatórios completos por app (nove seções, tabelas de mensagens com arquivo e linha) foram gerados durante a revisão e resumidos nas histórias "Por app".

## Estado da publicação (item 9 do pedido, verificado em 15/09/2026)

| Verificação | Resultado |
|---|---|
| Branch `deploy-<app>` no repo público para cada um dos 17 apps | 17 de 17 |
| `render.yaml` do branch público idêntico a `<app>/render.yaml` e a `publico/deploy-<app>/render.yaml` | 17 de 17 |
| Imagem `ghcr.io/startse/<app>:latest`, `healthCheckPath: /api/health`, só `PORT`, bloco `disk` comentado | 17 de 17 |
| `render.yaml` da suíte no `main` público igual ao da raiz privada e com 17 serviços | Sim |
| `catalogo.json` público com 17 apps e capturas dos 17 em `capturas/` | Sim |
| Imagem pública no GHCR (manifest `latest` acessível sem login) | **14 de 17**: `clone-site`, `prospeccao-linkedin` e `videos-campanha` respondem "authentication required". O botão "Publicar este app" desses três falha no Render até os pacotes serem tornados públicos em https://github.com/orgs/StartSe/packages |

A cópia local de `ai-action-app-deploy/` está atrasada em relação ao `origin/main` (ainda mostra 10 apps); é só o clone local, o remoto está certo. Um `git reset --hard origin/main` nessa pasta resolve.

## User Stories

Ordem de implementação. As histórias da Fase 0 são feitas no `pdi-time` e replicadas nos outros dezesseis na história de replicação indicada. "Verificar no navegador" significa capturas em desktop 1400x900 (vazio), desktop 1400x1500 (`?exemplo=1&captura=1`), celular 390 px e `/setup`, abertas com a ferramenta Read e corrigidas até ficarem limpas (`PADRAO.md`, seção "Verificação obrigatória").

### Fase 0, transversais (todas no `pdi-time`; a replicação acontece na história de cada app, na Fase 1)

### US-001: Conta de administrador e sessão (`lib/conta.ts`)
**Description:** As a executivo que publicou o app, I want que só eu (e quem eu autorizar com a senha) entre no app so that meu histórico, minhas chaves e meu crédito de IA não fiquem abertos a quem tiver o endereço.

**Acceptance Criteria:**
- [ ] Novo `lib/conta.ts` (compartilhado, entra em `scripts/verificar-padrao.sh`): tabelas `usuarios` (`id`, `nome`, `email` único em minúsculas, `senha_hash`, `criado_em`) e `sessoes` (`token_hash`, `usuario_id`, `criado_em`, `expira_em`) criadas em `lib/store.ts` no mesmo `app.sqlite`
- [ ] Senha com `crypto.scrypt` (sal de 16 bytes, N=16384) e comparação com `timingSafeEqual`; nunca gravada nem logada em texto plano
- [ ] `existeConta()`, `criarConta({nome, email, senha})` (só quando não existe nenhuma; 409 depois), `entrar({email, senha})` devolve token de sessão aleatório (32 bytes, só o hash SHA-256 vai ao banco), `sessaoAtual(req)` lê o cookie `sessao`, `sair(token)` apaga
- [ ] Cookie `sessao`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` quando a `baseUrl(req)` é https, validade de 30 dias renovada a cada acesso autenticado
- [ ] Regra de senha: mínimo 8 caracteres com pelo menos uma letra maiúscula, uma minúscula e um número (o modelo pedia também caractere especial; ver Open Questions)
- [ ] Tentativas de entrar: após 5 falhas seguidas do mesmo e-mail, espera de 60 s (contador em memória), com mensagem "Muitas tentativas. Espere um minuto e tente de novo."
- [ ] Redefinição sem interface: variável de ambiente `NOVA_SENHA_ADMIN`, lida uma vez na subida, troca a senha da conta existente e grava um aviso no log; documentada no README como recurso da equipe técnica
- [ ] Testes por `curl` em servidor standalone: criar conta, segunda criação dá 409, entrar com senha errada dá 401 com mensagem, entrar certo devolve cookie, rota protegida sem cookie dá 401 JSON em `/api/*` e 302 para `/entrar` nas páginas
- [ ] Lint e build passam

### Fase 0.5, fundação visual: tokens, header e assets (no `pdi-time`)

Referência enviada por Rafael em 15/09/2026 (três telas: início, criação de conta e configurações). **É referência de estilo, não de escopo**: o menu do modelo cita "PDIs / Colaboradores / Relatórios", telas que não existem e que, por decisão de 15/09, não serão criadas — o header ganha os destinos reais (Início, Histórico, Configurações). Esta fase vem logo depois da US-001 porque as telas de conta (US-005) já nascem no desenho novo; o resto das telas vem na Fase 0.9.

### US-002: Tokens visuais da família nova (`globals.css`)
**Description:** As a mantenedor, I want a paleta, a tipografia e os raios do desenho novo em variáveis so that os dezessete apps mudem de cara sem cada um inventar o seu.

**Acceptance Criteria:**
- [ ] `globals.css` ganha os tokens do desenho: fundo `--bg: #f7f7fb`, superfície `--surface: #ffffff`, superfície de apoio `--surface-2: #fbfaff`, texto `--ink: #151530`, texto secundário `--ink-2: #6b7280`, linha `--line: #ececf5`
- [ ] **O acento vem da paleta por segmento** (`tasks/paleta-segmentos.json`, calculada e validada em 15/09/2026): o segmento define a família de matiz e cada app ocupa um degrau próprio. O `pdi-time` fica `#692bd4`, o violeta do modelo. Novo token `--accent-2` derivado por regra (matiz +18°, saturação +12, luminosidade +14, teto 66) e `--gradiente-acento: linear-gradient(135deg, var(--accent), var(--accent-2))` no botão primário e nos ícones circulares
- [ ] Novo `scripts/verificar-paleta.mjs` que confere as cinco regras da paleta (AA ≥ 4,5; ΔE ≥ 10 entre segmentos; ΔE ≥ 6 dentro do segmento; `--accent-2`, `soft` e `ink` derivados por regra) e sai diferente de 0 quando um app foge; entra no `verificar-padrao.sh`
- [ ] Tipografia: título de painel 40/44 px peso 800 com `letter-spacing: -0.02em` (28 px no celular), sobretítulo 12 px maiúsculo com `letter-spacing: 0.08em` no acento, corpo 15 px, apoio 13 px
- [ ] Raios e sombras: `--raio-card: 18px`, `--raio-campo: 12px`, `--raio-chip: 999px`, `--sombra-card: 0 1px 2px rgba(20,20,50,.04), 0 8px 24px rgba(20,20,50,.05)`; `.card` e `.input` passam a usar os tokens
- [ ] `.btn-primary` vira o botão do modelo (gradiente, 48 px de altura, peso 600, seta à direita opcional via `<span aria-hidden>`); `.btn-secundario` novo (branco, borda `--line`) para "Usar colaborador de exemplo"
- [ ] Novo `.chip-status` com as três variantes do modelo: pendente (âmbar), conectado (verde) e demonstração (âmbar com ponto), sem alterar o significado dos chips já existentes
- [ ] Contraste AA conferido no texto sobre o gradiente e nos chips, medido e registrado no `CLAUDE.md`
- [ ] Nenhuma fonte nova é baixada de CDN: a família manuscrita do modelo (as frases "Pessoas crescem resultados também") **não vira fonte**, entra como parte da ilustração ou não entra
- [ ] Lint e build passam; verificar no navegador (tela atual do `pdi-time` já com os tokens novos, desktop e celular)

### US-003: Header com navegação real e conta (`components/ui.tsx`)
**Description:** As a executivo, I want um cabeçalho que me diga onde estou, quem sou e para onde posso ir so that eu ache Configurações no celular e saiba que estou na minha conta.

**Acceptance Criteria:**
- [ ] `Topbar` reescrita no desenho do modelo: à esquerda o quadrado do acento com a inicial do app, o nome e a linha de apoio (segmento do app, sem "powered by AI" — inglês não passa no `verificar-jargao`); ao centro a navegação; à direita o chip de status, o sino e a conta
- [ ] Navegação com **três destinos reais**, nunca telas inexistentes: "Início" (`/`), "Histórico" (`/historico`, criada na US-012) e "Configurações" (`/setup`); o item ativo com sublinhado no acento; a lista vem de uma constante `NAVEGACAO` para um app poder acrescentar um destino próprio sem editar o componente
- [ ] Conta: círculo com as iniciais sobre o acento (sem foto: o modelo de conta tem só nome e e-mail), nome em uma linha e e-mail na segunda, abrindo um menu com "Sair"; enquanto não há sessão (telas públicas) o bloco não aparece
- [ ] Sino: aparece só quando há algo a mostrar (falha de entrega de rotina, autoavaliação recebida), com a contagem; sem nada pendente, não é renderizado — nada de sino decorativo
- [ ] **Celular (390 px)**: navegação vira um botão "Menu" que abre uma folha sobre a tela com os três destinos, o nome, o e-mail e "Sair"; o chip de status continua visível na barra; a barra não passa de 56 px de altura. Isso resolve a US-018 (sem caminho para Configurações no celular), que fica reduzida ao aviso de demonstração
- [ ] A altura da barra não muda quando `/api/status` responde (regra FR-8 da PRD de 13/09 continua valendo)
- [ ] `verificar-jargao` limpo; lint e build passam; verificar no navegador (desktop e celular, com e sem sessão)

### US-004: Assets preparados e servidos (`public/ilustracoes`)
**Description:** As a mantenedor, I want as ilustrações recortadas, leves e sem texto embutido so that cada app use a sua sem inchar a imagem publicada.

Os cinco PNGs entregues em `~/Desktop/projetos/assets/` (fora dos dois repositórios; 8,2 MB somados: `icones.png`, `pessoa-rh.png`, `estratégia-metas-pessoa.png`, `gestao-juridico-coding-pessoa.png`, `chatbot.png`) não entram como estão: `icones.png` é uma folha de 15 ícones com respingos pretos nas áreas transparentes, e as quatro ilustrações de pessoa têm **frases em português embutidas no próprio PNG** ("Pessoas que evoluem, resultados que acontecem"), o que não é lido por leitor de tela, não dá para revisar e amarra cada imagem a um app.

**Acceptance Criteria:**
- [ ] `icones.png` recortado nos 15 ícones individuais, fundo limpo (alfa real, sem respingos), 128 px, WebP com PNG de reserva, em `public/ilustracoes/icones/<nome>.webp`; nomes em português pelo que representam (`robo`, `relatorio`, `time`, `alvo`, `escudo`, `ideia`, `codigo`, `crescimento`, `integracao`, `conversa`, `checklist`, `nuvem`, `grafico`, `acordo`, `rede`)
- [ ] **O blob deixa de ser parte da imagem e vira CSS** com o acento de cada app: os blobs embutidos nos PNGs originais são lilás, que é o acento do `pdi-time`; em um app verde ou azul o lilás brigaria. Novo `.blob-acento` em `globals.css`, atrás da ilustração
- [ ] Ilustrações preparadas com o recorte da pessoa **sem blob e sem os cartões de texto**; as frases viram HTML por cima, escritas por cada app, traduzíveis e lidas por leitor de tela
- [ ] Preparação feita por `~/Desktop/projetos/assets/preparar.py` (fora dos dois repositórios, porque o `PADRAO.md` proíbe Python dentro dos apps), que já existe e roda: recupera o alfa de PNG achatado com o xadrez pintado nos pixels (detecta o xadrez pela alternância dos dois tons a cada ~9 px, não pela cor, senão notebooks e tablets cinza são comidos junto), tira o blob lilás, mantém só o maior componente e gera WebP em 640 px e na largura nativa
- [ ] Cinco ilustrações já prontas em `pdi-time/public/ilustracoes` (741 KB no total): `pessoa-rh`, `pessoa-marketing`, `pessoa-vendas`, `pessoa-financeiro` e `chatbot`
- [ ] As duas ilustrações que faltam (Estratégia e Gestão/Jurídico) são **geradas pelo MCP do Replicate** com `google/nano-banana-2` ou `openai/gpt-image-2`, no mesmo enquadramento das prontas e na família de cor do segmento (ver Technical Considerations), pedindo pessoa recortada sem fundo, sem blob e sem texto; o alfa é conferido antes de aceitar e o arquivo passa por `preparar.py`
- [ ] **Alternativa, se o Replicate não estiver disponível: reexportação limpa (só a pessoa, sem blob e sem cartões, como as de Marketing, Vendas e Financeiro) de Estratégia e Gestão/Jurídico.** Nesses dois os cartões brancos encostam na pessoa, e a separação automática come pedaços de camisa e de notebook — verificado e descartado. `decisoes-preditivo.png` tem o mesmo problema e é opcional. Até chegarem, os apps de Estratégia (`radar-sinais`, `bussola-ia`) e de Gestão/Jurídico (`agente-kanban`, `reunioes-ia`, `contratos-ia`) usam só o `.blob-acento`, sem pessoa
- [ ] Mapa segmento → ilustração em `lib/ilustracao.ts`: RH (`pessoa-rh`), Marketing (`pessoa-marketing`), Vendas (`pessoa-vendas`), Financeiro (`pessoa-financeiro`), Atendimento (`chatbot`); Estratégia e Gestão/Jurídico sem pessoa até a reexportação
- [ ] Toda ilustração entra como `<img>` decorativa (`alt=""`, `aria-hidden`), com `width`/`height` para não causar salto de layout, e `loading="lazy"` quando estiver abaixo da dobra
- [ ] No celular a ilustração de pessoa não é baixada (`<picture>` com `media`), porque o hero do celular não a mostra
- [ ] Peso total de `public/ilustracoes` medido e registrado; alvo `≤ 1,2 MB` por app (hoje: 741 KB com cinco ilustrações)
- [ ] Lint e build passam; verificar no navegador

### Fase 0 (continuação): conta, proteção das rotas e erros da IA

Retoma as transversais, agora já sobre os tokens e o header novos.

### US-005: Telas "Criar sua conta" e "Entrar"
**Description:** As a executivo abrindo o app pela primeira vez, I want criar minha conta em uma tela só, no modelo enviado (nome, e-mail, senha, confirmar senha) so that eu comece a usar em menos de 30 segundos.

**Acceptance Criteria:**
- [ ] Novo `components/conta.tsx` (compartilhado) com `TelaCriarConta` e `TelaEntrar`; páginas `app/conta/page.tsx` (criar) e `app/entrar/page.tsx` (entrar) e rotas `app/api/conta/route.ts` (GET existe?, POST criar), `app/api/conta/entrar/route.ts` (POST) e `app/api/conta/sair/route.ts` (POST), todas compartilhadas e verificadas por `verificar-padrao.sh`
- [ ] Tela de criação segue o modelo: título "Criar sua conta", frase "Nada sai daqui: seus dados ficam guardados só neste app, no seu servidor.", campos "Seu nome" (ajuda: "Aparece só na tela."), "E-mail" (ajuda: "Vai ser o seu login."), "Senha" (ajuda com a regra em uma linha) e "Confirmar senha", botão primário "Criar conta e começar", tudo com os componentes `Field`/`Row` e classes `.card`/`.input`/`.btn-primary` da suíte, no acento do app
- [ ] Validação no navegador antes de enviar (campos vazios, e-mail sem `@`, senhas diferentes, regra da senha) com a mensagem ao lado do campo, e a mesma validação no servidor com 400 e mensagem
- [ ] Ao criar, a sessão já é aberta e a pessoa cai em `/` (ou no `?next=` de onde veio, incluindo `?exemplo=1`)
- [ ] Tela "Entrar": e-mail, senha, botão "Entrar", link "Esqueci a senha" que abre um `MaisDetalhes` com a instrução da variável `NOVA_SENHA_ADMIN` em linguagem para repassar à equipe técnica
- [ ] Quando o app roda no Render sem disco persistente (`process.env.RENDER` definido e `DATA_DIR` em disco efêmero), a tela de criação mostra uma linha discreta: "Neste plano a conta e as configurações se perdem a cada nova publicação. Para manter, a equipe técnica adiciona um disco em Opções avançadas do Blueprint."
- [ ] `Topbar` ganha, à direita de "Configurações", o nome da pessoa (primeiro nome) e o botão "Sair"; `useStatus` passa a receber `usuario: { nome } | null` de `/api/status`
- [ ] Sem jargão: `node scripts/verificar-jargao.mjs pdi-time` limpo (palavras "login", "token", "hash" não aparecem na tela; usar "e-mail e senha", "acesso")
- [ ] Lint e build passam; verificar no navegador (criar conta, entrar, sair, no desktop e no celular)

### US-006: Proteção das rotas em `proxy.ts`
**Description:** As a executivo, I want que toda tela e rota privada exija a sessão so that ninguém use o app publicado sem entrar.

**Acceptance Criteria:**
- [ ] `proxy.ts` (já compartilhado e verificado) passa a: (a) manter o `Cache-Control: no-store` em `/f/**` e `/api/f/**`; (b) para todo caminho fora da lista pública (P4), ler o cookie `sessao` e validar em `lib/conta.ts`; sem sessão, páginas redirecionam para `/conta` quando ainda não existe conta ou para `/entrar?next=<caminho>` quando existe, e `/api/**` responde 401 `{ error: "Entre com seu e-mail e senha para continuar.", codigo: "sem_sessao" }`
- [ ] Lista pública documentada no topo do arquivo e testada: `/f/*`, `/api/f/*`, `/s/*`, `/webhook/*`, `/mcp`, `/api/mcp/*` só para `POST /mcp` (a geração de código em `/api/mcp/token` continua privada), `/api/rotinas/executar`, `/api/health`, `/api/setup/oauth/*/callback`, `/setup/trello`, `/conta`, `/entrar`, `/api/conta/*`, `/_next/*`, `/icon.svg`
- [ ] `proxy.ts` não usa `Response` de página inteira nem importa `components/`; só `NextResponse.redirect`/`json` e `lib/conta.ts` (Node runtime, permitido no Next 16)
- [ ] `useStatus` no cliente trata 401 redirecionando para `/entrar?next=` (cobre sessão expirada com a aba aberta)
- [ ] `/api/status` inclui `usuario` e continua respondendo (401) sem sessão, para o `Topbar` saber redirecionar
- [ ] Testes por `curl`: cada caminho da lista pública responde sem cookie como hoje; `/`, `/setup`, `/api/setup`, `/api/pdi`, `/r/<id>`, `/imprimir/<id>` respondem 302/401 sem cookie e 200 com cookie
- [ ] Lint e build passam

### US-007: Erros da IA com causa, código e ação (`lib/ai.ts`)
**Description:** As a executivo, I want que uma falha da IA me diga o que houve e o que fazer so that eu resolva sozinho, sem ler um código HTTP.

**Acceptance Criteria:**
- [ ] `lib/ai.ts` exporta `class ErroIA extends Error { codigo: CodigoErroIA; status: number; acao?: { rotulo: string; url: string } }` com `CodigoErroIA = "chave_ausente" | "chave_invalida" | "sem_credito" | "limite_diario" | "fila_cheia" | "modelo_indisponivel" | "entrada_recusada" | "sem_visao" | "provedor_fora" | "rede" | "resposta_vazia" | "resposta_invalida"`
- [ ] Mapeamento único usado por `askText`, `askVision` e `askWithTools` (função `interpretarFalha(res, detalhe)`): 401 → `chave_invalida` ("A chave da IA foi recusada. Conecte de novo em Configurações.", ação "Conectar a IA" → `/setup#openrouter`); 402 → `sem_credito` ("Sua conta no OpenRouter está sem crédito para este modelo. Troque para um modelo gratuito ou adicione créditos.", ações "Usar um modelo gratuito" e "Adicionar créditos" → `https://openrouter.ai/settings/credits`); 429 com `free-models-per-day` ou `daily` no detalhe → `limite_diario` ("Você atingiu o limite diário dos modelos gratuitos. Volte amanhã, troque o modelo ou adicione US$ 10 de crédito no OpenRouter para ampliar o limite."); outro 429 → `fila_cheia` (texto atual); 404 ou detalhe com `No endpoints found`/`not a valid model` → `modelo_indisponivel` ("O modelo escolhido não está disponível agora. Escolha outro em Configurações.", ação "Trocar o modelo"); 400 com `context length`/`too long` → `entrada_recusada` ("O texto enviado é maior do que este modelo aceita. Reduza o texto ou escolha um modelo com mais capacidade."); 400 com `image`/`modalit` → `sem_visao`; 500/502/503 → `provedor_fora` ("O serviço de IA está instável neste momento. Tente de novo em um minuto."); `fetch` lançando → `rede` ("Não foi possível falar com o serviço de IA. Confira a conexão do servidor e tente de novo."); conteúdo vazio → `resposta_vazia`; `parseJSON` falhando em `askJSON` → `resposta_invalida` ("A IA respondeu em um formato inesperado. Tente de novo; se repetir, troque para um modelo pago em Configurações.")
- [ ] `askJSON` tenta uma segunda vez sozinho antes de lançar `resposta_invalida` (modelos gratuitos erram JSON com frequência)
- [ ] Nova função `respostaErro(err)` em `lib/ai.ts` que toda rota usa no `catch`: se `err instanceof ErroIA`, devolve `Response.json({ error, codigo, acao }, { status: err.status })` com status 401/402/429/502/503 conforme o código; senão, mantém `{ error: err.message }` com 500. Nenhuma rota do `pdi-time` monta a resposta de erro de IA à mão
- [ ] O detalhe técnico do provedor (`detalhe.slice(0, 200)`) vai só para `console.error`, nunca para a tela
- [ ] Testes com servidor `fetch` simulado (script fora do repositório, como na história US-034 de `prd-novos-apps.md`): cada status acima gera o código esperado; 402 devolve as duas ações; `askJSON` repete uma vez
- [ ] Lint e build passam

### US-008: `ErrorBox` com ação e "Usar um modelo gratuito agora"
**Description:** As a executivo que viu o erro, I want um botão que resolva so that eu não precise ir procurar em Configurações.

**Acceptance Criteria:**
- [ ] `ErrorBox` em `components/ui.tsx` recebe `codigo?` e `acao?` além de `mensagem`; renderiza o botão da ação (`btn-primary !w-auto`) ao lado de "Tentar de novo"; para `sem_credito` e `limite_diario`, o botão "Usar um modelo gratuito" chama `PUT /api/setup` com `OPENROUTER_MODEL` = primeiro modelo gratuito diferente do atual e dispara `onTentarNovamente` em seguida
- [ ] Título do `ErrorBox` deixa de ser sempre "Não deu certo." e passa a refletir o código: "A IA está sem crédito", "Limite diário atingido", "Modelo indisponível", "Entre de novo", "Não deu certo" (padrão)
- [ ] Em `app/page.tsx` do `pdi-time`, o `catch` do `fetch` guarda `{ mensagem, codigo, acao }` do corpo e passa ao `ErrorBox`; 401 `sem_sessao` redireciona para `/entrar`
- [ ] Novo caso de demonstração local: `?erro=sem_credito` (só em dev, `NODE_ENV !== "production"`) força a rota a lançar o erro para capturar a tela
- [ ] Lint e build passam; verificar no navegador (erro 402 simulado no desktop e no celular)

### Fase 0.9, telas no desenho novo (no `pdi-time`)

Com os tokens, o header e os assets prontos e a conta funcionando, as telas passam para o desenho do modelo. A Fase 1 (um app por história) replica tudo de uma vez.

### US-009: Tela principal: hero, passos e duas colunas
**Description:** As a executivo abrindo o app, I want entender a promessa e ver o que vou receber antes de preencher so that eu saiba que vale o meu tempo.

**Acceptance Criteria:**
- [ ] Hero no topo: sobretítulo no acento, título de duas linhas, uma frase de apoio e a ilustração do segmento à direita; os textos vêm de constantes do app (`PROMESSA`), nunca do arquivo compartilhado
- [ ] **Economia de texto** (regra nova, ver Design Considerations): título do hero com até 8 palavras, apoio com até 20, lista "O que você vai receber" com até 5 itens de até 6 palavras, no máximo uma linha de ajuda por campo. Medir e registrar a contagem no `CLAUDE.md`
- [ ] Vídeo curto (opcional, só se passar em todas as condições da seção "Geração de imagens e vídeo"): 3 a 5 s, sem áudio, em laço, ≤ 400 KB, com `poster`, `preload="none"`, ausente no celular e sob `prefers-reduced-motion`, e só em modo demonstração
- [ ] Novo `Passos` em `components/ui.tsx`: três etapas numeradas com título e apoio ("1 Colaborador · Informe os dados", "2 Contexto · Entregas e objetivos", "3 PDI · Plano em 30, 60 e 90 dias"), a etapa atual no acento e as demais em cinza; é indicador de progresso, **não é navegação** (não recebe clique)
- [ ] Corpo em duas colunas a partir de `lg`: entrada à esquerda em cartões com ícone circular e título ("Sobre o colaborador", "Contexto profissional"), e à direita o cartão de prévia — antes de gerar, "O que você vai receber" com a lista de itens; depois de gerar, o resultado no lugar da prévia
- [ ] Botão primário com gradiente e "Usar colaborador de exemplo" logo abaixo, os dois dentro da coluna da esquerda e **visíveis em 1400x900** (medido com `getBoundingClientRect`, regra que a PRD já exige)
- [ ] O selo "Gerado com Inteligência Artificial" aparece no rodapé do resultado **só quando a IA gerou de verdade**; em modo demonstração o selo é "Exemplo, sem usar IA" — a US-029 (`bussola-ia`) já apontou esse erro e a regra passa a valer para todos
- [ ] O carrossel de depoimentos do modelo **não entra**: é elemento de página de venda, não de ferramenta interna. Registrar a decisão no `CLAUDE.md`
- [ ] **Celular (390 px)**: uma coluna; hero sem a ilustração de pessoa (só o título, a frase e os passos, que rolam na horizontal); a prévia desce para depois do formulário; nenhum texto de 40 px
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador nos quatro recortes

### US-010: `/setup` no desenho novo
**Description:** As a executivo configurando o app, I want ver o quanto falta e o que cada conexão faz so that eu não abandone no meio.

**Acceptance Criteria:**
- [ ] Layout de duas colunas: à esquerda uma coluna de apoio fixa (sobretítulo, título, o texto de privacidade e três itens com ícone, mais a ilustração do segmento); à direita os cartões das integrações
- [ ] Cabeçalho com "X de Y conectados" e barra de progresso, mantendo as duas linhas que a US-014 pede ("Para rodar" e "Faz mais com")
- [ ] Descrição de cada cartão em **uma linha**, com o `beneficio` no lugar do texto genérico e não somado a ele (economia de texto)
- [ ] Cartões numerados, cada um com ícone circular, título, descrição, o `beneficio` e um `chip-status` "Pendente" ou "Conectado"; `id` igual ao da integração, para os links `#<id>` funcionarem
- [ ] Campos de escolha com poucas opções (o canal das Notificações) viram um par de botões lado a lado no lugar do `select`, como no modelo; os demais `select` continuam `select`
- [ ] "Configurações avançadas" como `<details>` discreto com seta, e os botões "Testar conexão" (secundário) e "Salvar" (gradiente) alinhados à direita do cartão
- [ ] Rodapé com a frase de privacidade **verdadeira** (ver US-011), nunca "nenhuma conexão externa"
- [ ] **Celular**: uma coluna, a coluna de apoio vira um bloco curto no topo sem a ilustração, botões do cartão em largura total
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-011: Chaves guardadas cifradas e frases de privacidade verdadeiras
**Description:** As a executivo, I want que a promessa de segurança da tela seja verdade so that eu confie no que o app afirma.

Diagnóstico: o modelo mostra "Todas as chaves são criptografadas e armazenadas apenas neste aplicativo" e "Nenhuma conexão externa. Total privacidade." Hoje `setConfig` grava a chave em **texto plano** no SQLite (`lib/store.ts:36`) e o app chama OpenRouter, Trello, Resend e outros. Decisão de 15/09: implementar a cifragem e corrigir a segunda frase.

**Acceptance Criteria:**
- [ ] `lib/store.ts` passa a cifrar os valores de configuração com AES-256-GCM (`node:crypto`, sem dependência nova): cada valor guardado como `v1:<iv>:<tag>:<cifra>` em base64url, com IV de 12 bytes novo a cada gravação
- [ ] Chave mestra: `CHAVE_MESTRA` do ambiente (32 bytes em base64) quando existir; senão, gerada no primeiro uso e guardada em `<DATA_DIR>/chave-mestra` com permissão `0600`. `getConfig` lê valores antigos em texto plano e os regrava cifrados na primeira leitura (migração sem script)
- [ ] Valor que vem de variável de ambiente continua sendo lido direto, sem passar pela cifragem
- [ ] Perder a chave mestra torna as chaves ilegíveis: `getConfig` devolve `undefined` com um `console.error` claro e a tela trata como "não configurado", nunca com erro cru
- [ ] Frases da tela: "As chaves ficam cifradas neste app, no seu servidor. Nunca aparecem por inteiro depois de salvas." e, no lugar de "Nenhuma conexão externa. Total privacidade.", "Seus dados não passam por nenhum servidor nosso: o app fala direto com os serviços que você conectar." A segunda troca é obrigatória — a original é falsa, porque o app chama OpenRouter, Trello e outros
- [ ] O `CLAUDE.md` registra o alcance da cifragem: protege o arquivo em repouso (cópia, disco, `app.sqlite` vazado). Quem tem acesso ao contêiner em execução alcança as chaves, e **isso é aceito** (decisão de Rafael, 15/09/2026) — não é preciso derivar a chave mestra da senha nem hedge na tela
- [ ] Teste com `fetch`/banco simulado: valor gravado não aparece em texto plano no `app.sqlite`; valor antigo em texto plano é lido e migrado; chave mestra trocada torna o valor ilegível sem derrubar o app
- [ ] Lint e build passam; verificar no navegador (`/setup` mostrando as chaves mascaradas como hoje)

### US-012: Tela `/historico`
**Description:** As a executivo, I want uma lista do que já gerei so that o destino "Histórico" do menu leve a algum lugar e eu reencontre um resultado.

**Acceptance Criteria:**
- [ ] Nova rota compartilhada `app/historico/page.tsx`: lista de `lib/historico.ts` em cartões (título, resumo, data, chip do tipo), com link para `/r/<id>`, busca por texto e estado vazio com o caminho de volta para Início
- [ ] Rota privada (entra na proteção da US-006 `proxy.ts`, não na lista pública)
- [ ] O cartão de histórico que hoje vive na tela principal passa a mostrar os três últimos com o link "Ver todos" para `/historico`, liberando espaço na coluna
- [ ] **Celular**: um cartão por linha, sem tabela
- [ ] Entra em `scripts/verificar-padrao.sh`
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### Fase 0 (continuação): setup, orientação, rotinas e e-mail

Fecham as transversais, já no desenho novo. A partir daqui, a Fase 1 replica tudo app por app.

### US-013: Cartão da IA em `/setup`: modelo recomendado, gratuitos e teste de verdade
**Description:** As a executivo no plano gratuito do OpenRouter, I want escolher um modelo que funcione para mim so that o app não quebre na primeira chamada.

**Acceptance Criteria:**
- [ ] `MODELOS_GRATUITOS` em `lib/setup-comum.ts` ganha o campo `grupo: "recomendado" | "gratuito" | "pago"` e `CampoSetup` renderiza o `select` com `<optgroup>` "Recomendado (gratuito)", "Outros gratuitos" e "Pagos (mais qualidade)"; o rótulo do campo vira "Modelo de IA" e a ajuda "Comece pelo recomendado. Se aparecer 'sem crédito' ou 'limite diário', troque por outro gratuito ou adicione créditos."
- [ ] `opcoesDinamicas` do campo `OPENROUTER_MODEL`: com chave salva, busca `GET https://openrouter.ai/api/v1/models`, mantém os fixos e acrescenta até 8 modelos com sufixo `:free` que não estejam na lista (ordenados por `context_length` desc), com cache de 1 hora em memória; sem chave ou com falha, usa a lista fixa
- [ ] `testar` do `OPENROUTER` passa a fazer também uma chamada mínima de chat (`max_tokens: 5`) com o modelo escolhido e devolve, via `interpretarFalha`, a mesma mensagem que o app mostraria; a mensagem de sucesso inclui o plano: `is_free_tier` de `/api/v1/auth/key` vira "Plano gratuito: fique nos modelos gratuitos ou adicione créditos." ou "Créditos: US$ X restantes."
- [ ] No cartão, abaixo do botão "Conectar a IA", uma linha explica: "Conta gratuita do OpenRouter basta. Os modelos gratuitos têm limite diário; créditos ampliam o limite e liberam modelos melhores."
- [ ] `testar` das outras integrações do `pdi-time` (Notificações) revisado para nunca devolver `HTTP <n>` cru
- [ ] Lint e build passam; verificar no navegador (`/setup` com e sem chave)

### US-014: Próximos passos na tela principal e em `/setup`
**Description:** As a executivo que já conectou a IA, I want saber o que mais posso conectar e para que serve so that eu descubra o que o app faz sozinho.

**Acceptance Criteria:**
- [ ] `/api/status` devolve `proximos: { id, titulo, beneficio, url }[]` calculado de `INTEGRACOES` (as não configuradas, obrigatória primeiro), onde `beneficio` é um novo campo opcional de `Integracao` em linguagem de negócio ("Cria os cartões direto no seu Trello", "Envia o resumo por e-mail toda segunda")
- [ ] O popover do chip da `Topbar` (hoje só em demonstração) passa a existir também com a IA conectada, com o rótulo "Faz mais com..." e a lista `proximos` (até 3, cada um com o benefício e o link para `/setup#<id>`); quando a lista está vazia o chip é só "IA conectada"
- [ ] Em `/setup`, o cabeçalho "X de Y conectados" vira duas linhas: "Para rodar: IA conectada" e "Faz mais com: Trello, Notificações" com o que falta; o cartão "Tudo pronto" lista os `proximos` como "Quer ir além?" em vez de encerrar a página
- [ ] Os cartões de `/setup` ganham `id` igual ao da integração para os links `#<id>` rolarem até eles
- [ ] Lint e build passam; verificar no navegador

### US-015: Mensagens genéricas fora de `lib/ai.ts` no `pdi-time`
**Description:** As a executivo, I want que toda mensagem de erro me diga o que fazer so that "Tente novamente" não seja a única resposta.

**Acceptance Criteria:**
- [ ] `grep -rn "error:" app lib components` no `pdi-time` não encontra mensagens sem verbo de ação nem repasses de `String(err)`; cada `Response.json({ error })` de rota própria diz o que aconteceu e o que fazer
- [ ] `app/api/setup/oauth/openrouter/callback/route.ts`: "O OpenRouter não devolveu a chave (HTTP <n>)" vira "O OpenRouter não concluiu a conexão. Tente de novo; se repetir, cole a chave manualmente em Opções avançadas." e o status vai para o log
- [ ] `lib/notificacoes.ts`, `lib/rotinas.ts`, `lib/formularios.ts`, `lib/mcp-cliente.ts`: revisar as mensagens que chegam à tela com o mesmo critério (o que houve, o que fazer)
- [ ] Lint, build e `verificar-jargao` passam

### US-016: Catálogo, READMEs, `PADRAO.md` e workflow com conta
**Description:** As a executivo lendo o catálogo, I want saber que vou criar uma conta so that a promessa da página bata com o que vejo ao abrir.

**Acceptance Criteria:**
- [ ] `catalogo.json` (`lead`) e `README.md` da raiz trocam "roda sem login e sem chave" por "crie sua conta em 30 segundos, teste com dados de exemplo sem nenhuma chave e publique com um clique"; `site/index.html` ("Como funciona") ganha o passo "Crie sua conta" e a frase técnica sobre "sem login para baixar" continua (é sobre a imagem)
- [ ] `PADRAO.md`: novas seções "Cor por segmento" (a paleta, as cinco regras e o `verificar-paleta.mjs`), "Menos texto na tela" (os cinco limites) e "Imagens e vídeo" (modelos do Replicate, sem fundo, sem texto embutido, alfa conferido, `preparar.py`, limites do vídeo)
- [ ] `PADRAO.md`: nova seção "Conta e sessão" (arquivos compartilhados, lista pública do `proxy.ts`, `NOVA_SENHA_ADMIN`, regra "toda rota nova é privada por padrão; pública só entrando na lista com motivo") e a frase "Nada de menus, login ou configurações escondidas" vira "Nada de menus nem configurações escondidas; o acesso é uma conta simples criada no primeiro uso"
- [ ] README de cada app: seção "Primeiro acesso" (criar conta, redefinir senha) e a tabela de variáveis com `NOVA_SENHA_ADMIN`
- [ ] `.github/workflows/publicar.yml`, passo "Capturar prévia do app": antes da captura, `curl -X POST /api/conta` cria uma conta descartável e a captura passa o cookie (`--headless` não aceita cookie: usar `google-chrome ... --user-data-dir` com um perfil onde o cookie foi gravado via página `/entrar`, ou trocar a captura por um script Node com Playwright já usado localmente); alternativa aceitável documentada: variável `CONTA_DESLIGADA=1` só no contêiner de captura, lida por `proxy.ts`, nunca nos Blueprints
- [ ] `scripts/verificar-padrao.sh` inclui `lib/conta.ts`, `components/conta.tsx`, `app/conta`, `app/entrar`, `app/api/conta`
- [ ] Lint e build passam

### US-017: Cartão "Notificações" com o básico visível
**Description:** As a executivo, I want ver só canal, destino e a chave do Resend so that quatro campos de SMTP e um webhook não me assustem num cartão opcional.

Diagnóstico: em todos os 17 apps o cartão mostra 8 campos no grupo principal (`lib/setup-comum.ts:139-148`) e o passo a passo gerado por `passosSetup` (`components/setup.tsx:216`) fala só do Resend mesmo para quem escolhe Slack.

**Acceptance Criteria:**
- [ ] `NOTIFICACOES_SMTP_*` com `avancado: true`; `NOTIFICACOES_SLACK_WEBHOOK` visível só quando `NOTIFICACOES_CANAL === "slack"` (novo campo opcional `visivelQuando?: (config) => boolean` em `Campo`, respeitado por `CampoSetup`) e `NOTIFICACOES_RESEND_API_KEY` só quando o canal é e-mail
- [ ] Passo a passo por canal: e-mail ("Crie uma chave gratuita no Resend e cole abaixo; ou preencha o SMTP em Opções avançadas") e Slack ("No Slack, crie um webhook de entrada em Aplicativos › Incoming Webhooks e cole a URL"); `passosSetup` deixa de repetir a `ajuda` do primeiro campo quando ela já aparece sob o input
- [ ] Descrição do cartão diz para que serve neste app via `beneficio` (Fase 0) em vez do texto genérico "quando um formulário público chega ou uma rotina roda"
- [ ] Teste do Resend sem domínio verificado traduz o erro do provedor ("O Resend só envia para o seu próprio e-mail até você verificar um domínio; use o e-mail da conta ou verifique o domínio em resend.com/domains")
- [ ] Lint e build passam; verificar no navegador

### US-018: Modo demonstração visível e caminho para Configurações no celular
**Description:** As a executivo, I want perceber que estou vendo um exemplo e achar o botão de conectar em qualquer tela so that eu não conclua que o app "só sabe falar da Marina".

Diagnóstico: o chip "Modo demonstração" da `Topbar` é o único aviso e nada indica que é clicável; "Configurações" some no celular (`components/ui.tsx:71`, `max-md:hidden`); a linha `Origem` diz "Conecte a IA para analisar seus dados" sem link e com texto que não cabe em todos os apps (Bússola, Clone de Site, Kanban); em apps que ignoram a entrada em demo (Contratos, Clone de Site, Simulador, Ata) a pessoa sobe o próprio arquivo e recebe o exemplo fixo sem explicação.

**Acceptance Criteria:**
- [ ] Chip com ícone de seta e rótulo "Modo demonstração · conectar"; no celular o chip continua e "Configurações" vira ícone de engrenagem com `aria-label`
- [ ] `Origem` recebe `demoTexto?` (frase por app, ex.: "Exemplo fixo: o seu arquivo não foi lido") e renderiza "Conectar a IA" como link para `/setup#openrouter`; sem `demoTexto`, mantém a frase padrão, agora "Conecte a IA para usar os seus dados"
- [ ] `Empty` aceita `acaoSecundaria` para "Conectar a IA" quando `status.demo`
- [ ] Apps que ignoram a entrada em demo passam `demoTexto` explícito (Contratos, Clone de Site, Simulador, Ata, Kanban, Bússola)
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador (desktop e celular)

### US-019: Endereço público do app sem variável de ambiente
**Description:** As a executivo, I want que os links dos e-mails e lembretes apontem para o meu app publicado so that ninguém receba `http://localhost:3000`.

Diagnóstico: `lib/rotinas.ts:189`, `lib/checkins.ts:74` (PDI), `lib/rascunhos.ts:46` (Posts), `lib/cobranca.ts:125` (Ata) e `lib/ferramentas.ts:106` (Vídeos) montam links com `getConfig("APP_URL") || "http://localhost:3000"`, e nenhum cartão de `/setup` oferece `APP_URL`.

**Acceptance Criteria:**
- [ ] Toda rota que cria rotina, lembrete, formulário ou pedido grava `APP_URL` via `setConfig` a partir de `baseUrl(req)` quando ainda não existe ou quando o host mudou (nunca sobrescreve um `APP_URL` vindo do ambiente)
- [ ] Nova função `enderecoPublico()` em `lib/setup-comum.ts` centraliza a leitura (nunca `localhost` fora de desenvolvimento: sem valor, as rotinas registram "endereço público desconhecido" e o cartão Rotinas avisa)
- [ ] Campo "Endereço público do app" em "Para a equipe técnica" com o valor detectado e a opção de corrigir
- [ ] `verificar-jargao` ganha uma regra que acusa `"http://localhost:3000"` fora de `lib/ai.ts` (cabeçalho `HTTP-Referer`)
- [ ] Lint e build passam nos 17 apps

### US-020: Tabelas sem "Ver mais" desnecessário e números que cabem no celular
**Description:** As a executivo, I want ler a tabela sem clicar dez vezes so that a coluna mais acionável esteja visível.

Diagnóstico: `ResumoCelula` (`components/ui.tsx:249-255`) mostra "Ver mais" mesmo quando o texto cabe em duas linhas (visto no PDI, Radar, LinkedIn, Custos); no celular o cartão da `DataTable` soma um segundo "Ver mais" do `<details>`; `Destaque` em 40 px quebra em duas linhas com textos como "3 decisões · 5 ações".

**Acceptance Criteria:**
- [ ] `ResumoCelula` mede o estouro (`scrollHeight > clientHeight`) e só mostra "Ver mais" quando há texto oculto; papel `resumo` aceita `linhas` (padrão 2) para colunas como "O que fazer" ficarem inteiras
- [ ] No celular, um único "Ver mais" por cartão: os `detalhe` e o `resumo` truncado abrem juntos
- [ ] `Destaque` com `text-[32px]` abaixo de 640 px e `text-balance`
- [ ] Lint e build passam; verificar no navegador em três apps de amostra (PDI, Radar, Ata)

### US-021: Avisos inline no lugar de `window.alert` e fallbacks de rede com destino
**Description:** As a executivo, I want que toda falha apareça no lugar certo da tela com o que fazer so that "Erro inesperado." desapareça.

Diagnóstico: 30 arquivos usam `window.alert` ou `window.confirm` (rotinas, links, caixa de entrada, desfazer); os `catch` de `fetch` em `app/page.tsx` de todos os apps usam "Erro inesperado." e "Falha ao <verbo>." como fallback.

**Acceptance Criteria:**
- [ ] `components/ui.tsx` ganha `Aviso` (inline, tons ok/warn/danger, com `acao` opcional) e `useConfirmacao()` (diálogo da suíte) e `lerErro(r: Response | unknown): { mensagem, codigo?, acao? }` com os fallbacks padrão "O servidor não respondeu como esperado. Recarregue a página e tente de novo." e "Não conseguimos falar com o app. Verifique a conexão e tente de novo."
- [ ] `window.alert` proibido por regra do `eslint.config.mjs` (`no-restricted-globals`) nos 17 apps; `window.confirm` só para "Apagar tudo"
- [ ] Os componentes compartilhados `Rotinas.tsx` e `CopyButton` (que hoje faz `alert(t)` com o texto inteiro quando a área de transferência falha) usam `Aviso`
- [ ] Lint e build passam; verificar no navegador

### US-022: Cartão da IA sem "Modelo para imagens" onde não há visão e `integrations` completo
**Description:** As a executivo, I want ver só as opções que este app usa e ter a tela sabendo o que está conectado so that o setup não mostre campos sem função e a tela principal possa orientar.

Diagnóstico: "Modelo para imagens" aparece nos 17 apps e só `clone-site` e `custos-ia` usam visão; `/api/status` devolve `integrations: {}` em `pdi-time`, `financas-ia`, `contratos-ia` e outros apesar de declararem integrações opcionais.

**Acceptance Criteria:**
- [ ] `OPENROUTER` vira `openrouter({ visao: boolean })` em `lib/setup-comum.ts`; `lib/integracoes.ts` de cada app passa `visao: true` só em `clone-site` e `custos-ia`; no `clone-site` o campo sai de "avançadas" e ganha a ajuda "Este app depende dele para ler a captura"
- [ ] `app/api/status/route.ts` compartilhado (entra em `verificar-padrao.sh`) calcula `integrations` a partir de `INTEGRACOES` com `integracaoConfigurada` e aceita um `statusExtra()` opcional de `lib/status-do-app.ts` para chaves derivadas (ex.: `tts`, `ligacao`, `transcricao`)
- [ ] Lint e build passam nos 17 apps

### US-023: Rotinas com pré-requisitos validados e falhas visíveis
**Description:** As a executivo, I want que uma rotina só seja criada quando pode entregar e que eu veja quando falhou so that "agendado" signifique que vai chegar.

Diagnóstico: rotinas e avisos são criados sem canal configurado e falham em silêncio (Ata, Contratos, PDI); "Radar semanal" nasce sem temas; o bloco "Rodar sozinho, sem abrir o app" (endereço e código para agendador externo) fica no grupo principal do cartão Rotinas.

**Acceptance Criteria:**
- [ ] `TipoRotina` ganha `validar?(parametros, config): string | undefined` e `lib/rotinas.ts` recusa a criação com 400 e a mensagem quando o canal não tem Resend/SMTP/webhook conforme `NOTIFICACOES_CANAL` ou quando faltam parâmetros obrigatórios (temas, empresa)
- [ ] Coluna "Última execução" do cartão Rotinas mostra "Falhou: motivo" com link `/setup#notificacoes`; a rotina com 3 falhas seguidas pausa e avisa
- [ ] Bloco "Rodar sozinho" dentro de "Opções avançadas" do cartão Rotinas; cartão "Usar dentro do seu assistente" recolhido por padrão com o resumo "Para quem usa Claude ou ChatGPT"
- [ ] Botões "Receber X toda semana" na tela principal dizem "precisa de e-mail ou Slack configurado" quando `integrations.notificacoes` é falso e levam a `/setup#notificacoes`
- [ ] Lint e build passam; verificar no navegador

### US-024: Enviar avisos pelo Gmail ou pelo Outlook em um clique
**Description:** As a executivo, I want conectar minha própria caixa de e-mail em um clique so that os avisos do app saiam do meu endereço, sem eu precisar criar conta em um serviço de envio nem entender chave de API.

Decisão de 15/09/2026, depois de conferir os provedores: o **OAuth do Resend não existe** (só chave de API, com permissão "envio" ou "total"); o **plano gratuito do SendGrid foi extinto em 26/07/2025** (novas contas: teste de 60 dias, depois US$ 19,95/mês), então está fora; o **Brevo** envia 300/dia de graça com remetente verificado por código de seis dígitos, mas reescreve o remetente quando o endereço é `@gmail.com`. O Resend continua como padrão porque já funciona sem domínio quando o destino é o e-mail da própria conta — que é o caso de uso ("me avise quando um formulário chegar"); o que falta é caixa própria em um clique. O `custos-ia` já tem os dois fluxos de OAuth prontos (Google PKCE e Microsoft PKCE, US-034 de `prd-novos-apps.md`): esta história move o que é comum para `lib/email-envio.ts` no `pdi-time`.

**Acceptance Criteria:**
- [ ] Novo `lib/email-envio.ts` (compartilhado): `ProvedorEnvio = "resend" | "gmail" | "outlook" | "smtp"`, `provedorDeEnvio()` (ordem: caixa conectada → Resend → SMTP), `enviarPorGmail()` (`POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` com a mensagem em RFC 2822 codificada em base64url) e `enviarPorOutlook()` (`POST https://graph.microsoft.com/v1.0/me/sendMail`); renovação do token de acesso e rotação do refresh token da Microsoft reaproveitadas do desenho de `custos-ia/lib/email.ts`
- [ ] `lib/notificacoes.ts` passa a chamar `lib/email-envio.ts` no canal e-mail; quando há caixa conectada, o remetente é o endereço da própria pessoa e a mensagem de sucesso diz "Enviado do seu Gmail para X" / "do seu Outlook"
- [ ] Rotas compartilhadas `app/api/setup/oauth/google/{route,callback}` e `app/api/setup/oauth/microsoft/{route,callback}` no `pdi-time`, copiadas do `custos-ia` e reduzidas aos escopos de envio: Google `https://www.googleapis.com/auth/gmail.send` (escopo **sensível**, não restrito: verificação do Google de 3 a 5 dias úteis, sem revisão de segurança CASA; até lá o app fica em teste com até 100 contas) e Microsoft `Mail.Send offline_access User.Read` (sem fila de verificação; só o aviso de "editor não verificado")
- [ ] Cartão "Notificações" em `lib/setup-comum.ts` com dois botões, "Conectar meu Gmail" e "Conectar meu Outlook", acima do campo de chave do Resend; conectado, mostra "Conectado como fulano@empresa.com" e "Desconectar"; a chave do Resend e o SMTP ficam em "Opções avançadas" (junto com o que a US-017 já manda esconder)
- [ ] Sem `GOOGLE_CLIENT_ID_APP`/`MICROSOFT_CLIENT_ID_APP` no ambiente, os botões não aparecem e o cartão mostra só o caminho do Resend, sem mensagem de erro
- [ ] `testar` do cartão envia de verdade pela caixa conectada e traduz as falhas: Google 403 `insufficientPermissions` → "A autorização não incluiu o envio; conecte o Gmail de novo"; `invalid_grant` → "A conexão com o Gmail expirou; conecte de novo"; Graph 403 → mesma frase para o Outlook; Resend sem domínio → a frase da US-017
- [ ] `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP`, `MICROSOFT_CLIENT_ID_APP` e `MICROSOFT_CLIENT_SECRET_APP` entram no `Dockerfile` (`ARG` → `ENV`) e no `publicar.yml` como secrets, como já é feito com `TRELLO_API_KEY_APP`; `.env.example` e README atualizados
- [ ] `/api/setup/oauth/google/callback` e `/api/setup/oauth/microsoft/callback` entram na lista pública do `proxy.ts` (US-006)
- [ ] `scripts/verificar-padrao.sh` inclui `lib/email-envio.ts` e as quatro rotas de OAuth
- [ ] Testes por `curl` em servidor isolado: sem credenciais → 302 `/setup?erro=`; com credenciais → 302 para o provedor com `code_challenge` S256 e `state` em cookie; callback com `access_denied`, `state` errado e `code` falso com as três mensagens próprias; teste unitário com `fetch` simulado do envio pelo Gmail (base64url correto) e pelo Graph
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador (`/setup` com e sem credenciais de aplicativo, desktop e celular)

### Fase 1, um app por história (replicação transversal + correções próprias)

A antiga história única de replicação ("replicar a Fase 0 nos outros dezesseis") foi dissolvida: **cada história por app começa replicando os arquivos compartilhados da Fase 0** e só então aplica o diagnóstico próprio e os quick wins. Assim cada sessão fecha um app inteiro, verificável de ponta a ponta, em vez de deixar dezesseis apps pela metade. Vale para todas as histórias de US-025 a US-041 este bloco comum de critérios, além dos listados em cada uma:

- [ ] Arquivos compartilhados da Fase 0 (`lib/conta.ts`, `lib/ai.ts`, `lib/email-envio.ts`, `lib/notificacoes.ts`, `lib/setup-comum.ts`, `components/conta.tsx`, `components/ui.tsx`, `components/setup.tsx`, `proxy.ts`, `app/conta`, `app/entrar`, `app/api/conta`, `app/api/setup/oauth/{google,microsoft,openrouter}`, `app/api/status/route.ts`) copiados do `pdi-time`; `scripts/verificar-padrao.sh` sai 0 para este app
- [ ] Toda rota própria com IA troca o `catch` à mão por `respostaErro(err)`; `app/page.tsx` passa `codigo` e `acao` ao `ErrorBox` e redireciona para `/entrar` no 401 `sem_sessao`
- [ ] Cada `Integracao` própria do app ganha `beneficio` em linguagem de negócio; `insumo` da `Origem` revisado (sem artigo inicial)
- [ ] Rotas públicas próprias deste app conferidas contra a lista do `proxy.ts` (`clone-site`: `/s/[id]`; `simulador-vendas` e `whatsapp-atendente`: `/webhook/**`; `agente-kanban`: `/setup/trello`; `custos-ia`: `/api/setup/oauth/{google,microsoft}/callback`); rota pública nova entra na lista com comentário justificando
- [ ] Capturas de `/conta`, `/entrar`, `/` (vazio 1400x900), `/?exemplo=1&captura=1` (1400x1500), celular 390 px e `/setup` abertas com a ferramenta Read e corrigidas até ficarem limpas

Ordem: prioridade Alta, depois Média (por impacto), depois as quatro de prioridade Baixa da Fase 2.

### US-025: Ata Executiva (`reunioes-ia`), prioridade Alta
**Description:** As a gestor que gera a ata de uma reunião, I want prazos certos, e-mails certos e cobranças que de fato saem so that a ata sirva de registro confiável e não me engane.

Diagnóstico: três falhas enganam em produção. Os prazos relativos ("até sexta") são calculados a partir de hoje porque não existe campo de data da reunião (`lib/ata.ts:40`); "Abrir no e-mail" coloca os nomes dos participantes como destinatários do `mailto:` (`app/page.tsx:124-134`); "Cobrar na véspera" confirma o agendamento sem canal de notificação configurado e com link de confirmação para `localhost:3000` (`lib/cobranca.ts:89-129`). O acento `#8a5a00` é da mesma família do âmbar do chip "Modo demonstração" e do chip "pendente", que perdem a função de alerta. Dois cartões de setup para a mesma capacidade (transcrição) com nome de produto no título.

**Acceptance Criteria:**
- [ ] Campo "Data da reunião" (padrão hoje) no painel, gravado em `EntradaAta` e passado ao prompt como referência dos prazos relativos; as datas da demo passam a ser relativas a hoje (`lib/demo.ts:30,48-52,63-65`) e o título perde "(setembro/2026)"
- [ ] `linkEmailFollowup` usa os e-mails de `emailsPorNome()` e deixa o destinatário vazio quando não há e-mail cadastrado
- [ ] "Cobrar na véspera": 400 com `motivo: "notificacoes"` e link `/setup#notificacoes` quando não há Resend/SMTP (ou webhook, se o canal for Slack); respeita `NOTIFICACOES_CANAL`; a base do link vem de `baseUrl(req)` guardada nos parâmetros da rotina; a data no e-mail sai como dd/mm/aaaa; falha de entrega aparece no chip da ação ("Cobrança não enviada: motivo")
- [ ] Erros da IA via `respostaErro` (Fase 0); erros da transcrição mapeados: 401 → chave recusada com link `/setup#transcricao`, 402/429/`quota` → "sem minutos de transcrição, adicione créditos ou cole a transcrição em texto", 413/422 → formato ou tamanho não aceito; sem texto → "Não encontramos fala neste áudio"; `ErrorBox` com "Tentar de novo" guardando a última entrada
- [ ] Aba "Enviar áudio" mostra o mesmo aviso de transcrição não conectada que a aba "Gravar agora"; `/api/status.integrations` expõe `transcricao`, `mcpTarefas` e `notificacoes` e a tela deixa de chamar `/api/setup` por resultado
- [ ] Setup: um único cartão "Transcrição de áudio" com `select` "Serviço" (ElevenLabs ou OpenAI) e um campo de chave, título sem nome de produto, sem passo duplicado; cartão "Quadro de tarefas" antes do de transcrição
- [ ] Tela: "Usar transcrição de exemplo" gera a ata direto; "Participantes" vai para "Mais detalhes" para o botão ficar acima da dobra em 1400x900; os três botões operacionais em uma linha (`flex-wrap`); "Adicionar todas ao calendário" gera um `.ics` com N eventos; abas sem quebra de linha no celular (`whitespace-nowrap`); `Destaque` em 32 px no celular
- [ ] `alternarConcluida` desfaz o estado otimista e avisa quando o PUT falha; o comando enviado ao quadro vira `Crie o cartão "<ação>" para <responsável> até <prazo>`
- [ ] Acento trocado para `#35507a` (azul-ardósia; soft `#e7eaf2`, ink `#26395a`), porque o bronze atual se confunde com o âmbar do aviso de demonstração e `#1f6f5f` colidiria com o Kanban; `scripts/gerar-icones.mjs` rodado e `catalogo.json` atualizado
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-026: PDI do Time (`pdi-time`), prioridade Média
**Description:** As a líder que prepara a conversa de feedback, I want ver o exemplo em um clique e confiar nos lembretes so that o app vire rotina de RH.

Diagnóstico: "Preencher com um exemplo" só preenche e o botão "Gerar PDI" fica a ~1250 px do topo em 1400x900; os lembretes de check-in chegam com link `http://localhost:3000` (`lib/checkins.ts:74`); uma autoavaliação cuja IA falhou vira a linha morta "Falha ao gerar" sem motivo nem como refazer (`app/page.tsx:200`, `app/api/f/[token]/route.ts:56-60`); `/api/status` devolve `integrations: {}` apesar de declarar Notificações; o botão "Lembrar dos check-ins" aparece entre a origem e o resumo, antes de a pessoa ler o plano.

**Acceptance Criteria:**
- [ ] "Preencher com um exemplo" preenche e gera (`gerar(EXEMPLO, guardar)`); "Tempo na função" vai para "Mais detalhes" e os textareas começam com `min-h-20`, com "Gerar PDI" visível em 1400x900 (medir com `getBoundingClientRect`)
- [ ] Links de lembrete e de autoavaliação usam a base pública gravada na criação (US-019, `APP_URL`); nunca `localhost` em e-mail
- [ ] Autoavaliação recebida sem PDI mostra o motivo (`erroGeracao` gravado no callback) e o botão "Gerar PDI agora" chamando `POST /api/pdi/autoavaliacao/[id]/gerar`; o líder recebe a notificação "Recebemos a autoavaliação de X, mas a IA falhou: motivo"
- [ ] `/api/status.integrations.notificacoes` calculado; `LembrarCheckins` mostra "Você recebe um lembrete por e-mail em 30, 60 e 90 dias" ou "Configure as notificações para receber os lembretes" antes do clique; `POST /api/pdi/checkins` recusa canal Slack sem webhook (400, `motivo: "notificacoes"`)
- [ ] "Lembrar dos check-ins" sai de cima do resumo e vai para o fim do plano, junto de Acompanhamento
- [ ] Coluna "Indicador" dos objetivos com `md:w-56` ou em linha própria; item "Copiar versão para enviar à pessoa" no menu "Mais" (texto em segunda pessoa gerado pela IA, ou por regra no demo)
- [ ] Erros da IA via `respostaErro`; fallbacks "Falha ao gerar o PDI." e "Erro inesperado." substituídos pelas frases da Fase 0
- [ ] Integração `MCP_TAREFAS` declarada e botão "Buscar entregas no quadro" que lista cartões concluídos pela pessoa no campo "Entregas" (cliente MCP já pronto)
- [ ] Acento avaliado: manter `#2b5d8c` ou trocar por `#2f6b57` (verde-musgo, "desenvolvimento"), decisão registrada no `CLAUDE.md` do app
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-027: Voz do Cliente (`voz-do-cliente`), prioridade Média
**Description:** As a gestor de CX, I want um exemplo coerente, feedback sobre o NPS e consultas que não apagam meu resultado so that eu confie na análise.

Diagnóstico: o resumo do demo diz "a maior parte dos comentários é positiva" enquanto o Destaque mostra NPS -9 com 38% negativos (`lib/demo.ts:66`); editar o texto do exemplo descarta as notas NPS em silêncio (`app/page.tsx:212-214`); "nada encontrado" em pesquisa ou tickets substitui o resultado atual por um `ErrorBox` (`app/page.tsx:130-187`); o cartão "CRM (MCP)" não tem "onde obter"; o botão principal fica em y≈1100 em 1400x900.

**Acceptance Criteria:**
- [ ] Resumo do demo reescrito para bater com NPS -9 e 38% negativos (elogios convivem com bloco pesado de detratores em estabilidade e suporte)
- [ ] Linha sob a entrada: "Nota NPS detectada na coluna 'X': o NPS será calculado" ou "Sem coluna de nota: o NPS não será calculado. Envie um CSV com uma coluna 0 a 10 ou use a Pesquisa NPS por link"; ao editar o texto do exemplo, aviso de que as notas foram descartadas; `BarraSentimento.tsx:40` explica como enviar notas
- [ ] "Nenhuma resposta" e "Nenhum ticket" (400) viram aviso inline dentro do acordeão, mantendo o resultado atual; mensagens dizem o que fazer (copiar o link e enviar aos clientes; ampliar o período)
- [ ] "Criar pesquisa" exige título e trata erro do `POST /api/pesquisas`; alerta de sentimento sem `window.alert`; aviso de que o link precisa de endereço público quando a base é `localhost`
- [ ] Textarea de `min-h-32` para `min-h-24` e dropzone compacta, com "Analisar comentários" visível em 1400x900
- [ ] Cartão "CRM (MCP)" com `link` e passo a passo por fornecedor (HubSpot: Configurações › Integrações; Zendesk: Admin › Apps e integrações); texto sem "servidor MCP"
- [ ] Erros da IA e do MCP via `respostaErro`; `lib/tickets-mcp.ts:94` diz "O CRM conectado não oferece listar tickets; confira ou conecte outro em Configurações"
- [ ] Nova fonte de respostas: `MCP_DADOS` declarado para ler NPS de uma planilha viva (molde pronto)
- [ ] Acento avaliado: `#a8324a` se confunde com o vermelho de perigo dos chips "Detratores"; testar `#b83a5e` ou `#c2185b` e registrar a decisão
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-028: Radar de Sinais (`radar-sinais`), prioridade Média
**Description:** As a executivo de estratégia, I want ler o radar sem cliques e saber de onde vêm os sinais so that eu confie nas fontes e aja.

Diagnóstico: o demo tem `url: ""` em todas as 22 fontes, então a promessa "fontes verificadas" não é demonstrada; o grafo não tem legenda nem dica de clique e os nós "sinal" não têm rótulo (`components/Grafo.tsx:77-88`); "O que fazer" fica atrás de "Ver mais" em todas as 11 linhas; sem Exa o radar de temas brasileiros sai magro e em inglês e nada avisa; "Radar semanal" pode ser criado sem temas pelo cartão Rotinas (`lib/rotinas-do-app.ts:37-39`).

**Acceptance Criteria:**
- [ ] Fontes do demo com links reais (páginas públicas estáveis dos veículos citados) ou rótulo "(exemplo)" visível; `?exemplo=1` reproduzível
- [ ] Grafo com legenda (tema, sinal, ator ou tecnologia), dica "Clique em um ponto para ver as fontes", rótulo dos sinais ao passar o mouse no desktop e alvos de toque de 24 px no celular; componentes desconexos aproximados
- [ ] Coluna "O que fazer" com papel `titulo`/inteira no desktop e visível no cartão do celular; "Baixar grafo (JSON)" some do menu "Mais" (fica em "Para a equipe técnica")
- [ ] Após conectar a IA, a `Origem` e uma linha sob o formulário dizem quais fontes entram na rodada ("Hacker News, GitHub; Reddit indisponível") e convidam a conectar a Exa para notícias em português (`/setup#exa`); Exa com chave inválida em produção aparece como aviso, não falha silenciosa
- [ ] Novo provedor sem chave em `lib/busca.ts`: Google News RSS (consulta em pt-BR) no array `PROVEDORES`; alternativa à Exa (Tavily ou Brave) como segunda opção de chave no mesmo cartão
- [ ] Resultado com 0 sinais explica ("A busca trouxe N achados, mas nenhum sustentou um sinal com fonte verificada; tente temas mais específicos ou período maior") em vez de "bom momento para só monitorar"
- [ ] "Refazer com estes temas" no histórico e temas lembrados no navegador (`localStorage`); `Loading` mostra as fontes que já responderam
- [ ] "Radar semanal" só pode ser criado pelo botão do resultado: sai de `TIPOS_ROTINA` genérico ou o cartão Rotinas valida temas antes de criar
- [ ] Erros via `respostaErro`; `lib/integracoes.ts:19-20` (Exa) sem `HTTP <n>` cru; rotina criada sem `window.alert`
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-029: Bússola de IA (`bussola-ia`), prioridade Média
**Description:** As a executivo que quer medir a maturidade em IA, I want entender que preciso coletar respostas e ver um diagnóstico real rotulado como real so that eu confie no resultado.

Diagnóstico: a análise de respostas reais sem IA usa `leituraSemIA` mas sai com `demo: true` e a `Origem` "Exemplo ilustrativo… Conecte a IA" (`lib/bussola.ts:84`), um erro de rótulo que derruba a confiança; nada narra o fluxo (ajustar questionário → criar link → analisar respostas); `window.alert` na validação do link; `leituraSemIA` repete a mesma frase em quatro dimensões; as seis médias aparecem três vezes (radar, tabela, chips).

**Acceptance Criteria:**
- [ ] `analisarAvaliacao` usa `meta({ demo: false, insumo: "N respostas recebidas (leitura automática, sem IA)" })` para respostas reais; `demo: true` só em `gerarAvaliacaoExemplo`, com `insumo` "8 respostas fictícias; para um diagnóstico real, crie o link de avaliação"
- [ ] Quando a IA falha (402, 429, 5xx) em "Analisar respostas", o app cai em `leituraSemIA` com aviso "Leitura automática: a IA não respondeu (motivo). Tente de novo para a leitura escrita" em vez de erro
- [ ] Passo a passo de três etapas acima dos botões do painel; "Avaliações em andamento" aberto por padrão quando há alguma; "Analisar respostas" desabilitado mostra "0 respostas · analise quando chegarem" em texto visível
- [ ] Validação inline (sem `window.alert`) em "Criar link"; confirmação antes de apagar questionário; salvar questionário com o mesmo título atualiza em vez de duplicar; impedir apagar questionário com avaliação ativa (ou avisar)
- [ ] `leituraSemIA` com 2 ou 3 variantes por faixa; resumo cita a dimensão mais forte e a mais fraca e não repete o Destaque
- [ ] "Nível por dimensão" colorido por faixa (`TOM_NIVEL`) ou removido; rótulos do radar sem quebra em 3 linhas; "Próximos passos" com `list-disc`; "Título da avaliação" em linha inteira
- [ ] Erros de "Gerar questionário para o setor" repassam a causa (via `respostaErro`) e permitem seguir com o questionário modelo
- [ ] Aviso de endereço público e de disco efêmero ao criar o link (Fase 0 fornece `baseUrl` e a detecção do Render)
- [ ] Rotina "Resumo da coleta" (N respostas, faltam X, prazo em Y dias) com capacidade `rotina` no catálogo; `MCP_TAREFAS` declarado para mandar os próximos passos como cartões
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-030: Posts em Minutos (`posts-sociais`), prioridade Média
**Description:** As a responsável por marketing, I want a rotina semanal falando da minha empresa e erros de imagem que eu consiga resolver so that o app publique de verdade.

Diagnóstico: a rotina passa `empresa: ""` e os rascunhos saem como "Posts de sua empresa" ou sobre "Vetra Logística" em demo (`lib/rascunhos.ts:40`, `lib/demo.ts:11`); o link de aprovação usa `localhost` sem `APP_URL` (`lib/rascunhos.ts:46`); `app/api/imagem/route.ts:29-33` devolve "O provedor de imagens não respondeu" para 400 (organização não verificada, prompt recusado) e 429 (`insufficient_quota`); `?exemplo=1` sai com três caixas de imagem vazias; quatro botões por cartão quebram em três linhas.

**Acceptance Criteria:**
- [ ] "Temas do trimestre" guarda o nome da empresa (ou reaproveita a última usada) e a rotina passa `empresa` para `gerarPosts`; `salvar()` mantém a lista local e avisa em caso de falha; erro da rotina sem `window.alert`
- [ ] Link de aprovação com a base pública (Fase 0)
- [ ] Erros da OpenAI mapeados: 400 `organization must be verified` → verificar a organização ou trocar para `gpt-image-1-mini`; 400 `safety`/`content_policy` → editar o tema; 429 `insufficient_quota` → adicionar crédito, o app usa o cartaz provisório; 429 outro → aguardar; 5xx → indisponível; `lib/integracoes.ts:23-24` sem `HTTP <n>` cru; rótulo "Imagem provisória" com link `/setup#openai`
- [ ] `OPENAI_IMAGE_MODEL` com `avancado: true`; `insumo` de `lib/posts.ts:33` vira "o briefing informado"
- [ ] `?exemplo=1` gera o cartaz local nos três posts (rápido e offline) para a prévia do catálogo; botão "Gerar imagens dos 3 posts" no cabeçalho do resultado
- [ ] Cartão de post com "Copiar" fixo e menu "Mais" (Baixar imagem, Reescrever, Lembrete no calendário); "Agendar" renomeado para "Lembrete no calendário"; quando o texto estoura o limite, o botão vira "Reescrever para caber em N" com a instrução do limite
- [ ] Painel "Aprovados" lista também "Aguardando" e "Ajuste pedido" com o comentário e o botão "Reescrever com esse comentário"
- [ ] Webhook de saída (URL única, como o do Slack) para Zapier ou Make com `{rede, texto, hashtags, horario, imagem}`, como integração opcional "Programar publicação"
- [ ] `lib/cartaz.ts:5` lê o acento do CSS ou do catálogo em vez do hex fixo; erros da IA via `respostaErro`
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-031: Prospecção no LinkedIn (`prospeccao-linkedin`), prioridade Média
**Description:** As a líder de vendas, I want a demonstração que mostre as mensagens e um caminho claro até o Prospect Halo so that eu entenda o valor completo em um clique.

Diagnóstico: `?exemplo=1` entrega só a lista, sem nenhuma mensagem (a promessa do h1); "Escrever para os selecionados" fica desabilitado sem dizer por quê; após conectar a IA nada orienta para o Prospect Halo (frase sem link, cartão sem "Criar conta"); `Promise.all` em `lib/sequencias.ts:87` perde as 19 sequências boas quando uma cai em 429; no celular há dois "Ver mais" por lead e estouro horizontal.

**Acceptance Criteria:**
- [ ] `?exemplo=1` e "Preencher com um exemplo" encadeiam `escrever(campanha.id, [3 melhores])` e mostram "Mensagens prontas"
- [ ] Leads com pontuação ≥ 80 pré-selecionados; botão desabilitado com rótulo "Marque os leads para escrever"; após escrever, contador "3 mensagens prontas" junto do botão e rolagem até os cartões
- [ ] Com `status.ai && !integrations.prospecthalo`, a frase dos leads fictícios vira "Conecte o Prospect Halo em Configurações para buscar no seu LinkedIn e enviar as mensagens aprovadas" com link `/setup#prospecthalo`; cartão com `link: { url: "https://prospecthalo.ai", rotulo: "Criar conta no Prospect Halo" }`; "Receber leads novos toda semana" avisa que precisa de Notificações
- [ ] `escreverParaCampanha` com `Promise.allSettled`, devolvendo as sequências que deram certo e a lista das que falharam; a tela mostra "Escrevemos X de Y; clique em Escrever de novo para as restantes"
- [ ] Erros via `respostaErro` (status 401/402/429 em vez de 500) e `ErrorBox` com ação; `lib/prospecthalo.ts:65,88` sem pedir edição de JSON: o mapeamento vira `select` com `opcoesDinamicas` das ferramentas remotas; 401/403 e timeout do servidor traduzidos
- [ ] Celular: um único "Ver mais" por lead (link do LinkedIn dentro do resumo) e sem estouro horizontal em 390 px (verificar `Topbar`/`Workspace`)
- [ ] "Copiar lista (CSV)" em "Mais"; `MCP_CRM` declarado com "Enviar para o CRM" nos leads selecionados
- [ ] Rotina sem `window.alert`; acento `#0a66c2` mantido (referência ao LinkedIn), registrado
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-032: Simulador de Vendas (`simulador-vendas`), prioridade Média
**Description:** As a gestor comercial, I want colar uma conversa em qualquer formato e ver a análise dela so that eu confie no simulador e o leve ao time.

Diagnóstico: o exemplo preenche a conversa do Rodrigo no cenário "desconto", mas a demo analisa a conversa da Beatriz de renovação (`lib/analise.ts:104`): título e resumo não batem com o texto no campo; o botão principal fica cortado na dobra em 1400x900 e a conversa é o quarto elemento do painel; linhas sem prefixo `Vendedor:`/`Cliente:` são ignoradas em silêncio e a IA recebe transcrição vazia; a sala por voz fica em "Analisando sua conversa…" para sempre quando o webhook não chega (`components/SalaSimulacao.tsx:191-206`); `criarLinkTreino` e `salvarVendedor` engolem erros.

**Acceptance Criteria:**
- [ ] Demo coerente: em modo demonstração a análise usa a conversa colada (ou o exemplo passa a ser a conversa da Beatriz com `cenarioId: "renovacao"`); título, cenário e resumo batem
- [ ] Painel reordenado: conversa primeiro, "Analisar a conversa" logo abaixo e visível em 1400x900; vendedor e cenário em `Row` compacta; "Criar link de treino" e "Painel da equipe" como ações secundárias abaixo, sem card aninhado
- [ ] `app/api/analisar/route.ts` valida o resultado de `parseConversaColada` e devolve 400 "Não reconheci nenhuma fala. Comece cada linha com 'Vendedor:' ou 'Cliente:'"; o parser aceita "Atendente", "Comprador", "Falante 1/2" e carimbos `[hh:mm] Nome:`; upload de `.txt`, `.vtt` e `.srt` convertido no servidor
- [ ] Sala por voz: após 90 s sem análise, mensagem "A análise ainda não chegou; peça ao gestor para conferir a conexão com a ElevenLabs" e a ligação fica registrada; cartão "Dados para a equipe técnica" mostra a última tentativa de webhook recusada e o motivo (`ELEVENLABS_ULTIMO_ERRO_WEBHOOK`)
- [ ] Linha sob "Criar link de treino" conforme `integrations["elevenlabs-agente"]`: "Hoje o treino é por texto. Conecte a ElevenLabs para o vendedor treinar por voz" com link; "Receber o resumo toda semana" avisa que precisa de Notificações
- [ ] Setup ElevenLabs: segredo do webhook em "Opções avançadas", passos reescritos sem repetir a ajuda, link direto para API Keys, prompt-modelo do agente e as variáveis dinâmicas (`sala_token`, `vendedor_id`) documentados no README e no cartão técnico
- [ ] `criarLinkTreino` e `salvarVendedor` mostram erro; rotas da sala respondem ao vendedor em linguagem própria ("O cliente simulado não conseguiu responder agora"); erros via `respostaErro`; `lib/integracoes.ts:51` sem `HTTP <n>`
- [ ] "Enviar a análise ao vendedor" em `Entregar` usando `Vendedor.email` e `lib/notificacoes.ts`; conector `MCP_CRM` no lugar de "Levar as notas para o CRM (Em breve)"
- [ ] Acento trocado de `#3f6212` (oliva, igual ao verde semântico dos chips) para `#15803d` ou `#0f766e`, ícones regenerados
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-033: Leitura de Contratos (`contratos-ia`), prioridade Média
**Description:** As a executivo que recebe um contrato, I want analisar em um clique, entender o que ganho ao guardar e não estourar o modelo com um PDF grande so that o app seja o primeiro passo antes do jurídico.

Diagnóstico: "Usar contrato de exemplo" só preenche; o opt-in "Guardar por 30 dias" não diz que destrava link, PDF formatado e avisos de prazo; um PDF de 10 MB vira centenas de milhares de caracteres no prompt e estoura o modelo com erro cru (`lib/contratos.ts:61`); "Avisar 30 dias antes" com canal Slack sem webhook cria a rotina e falha em silêncio (`app/api/analisar/prazos/route.ts:29-32`); a tabela mostra a sugestão antes do risco; `PoliticaContratos.tsx:29-38` não checa `r.ok`.

**Acceptance Criteria:**
- [ ] "Usar contrato de exemplo" chama `analisar(fd)`; `btn-ghost` no estado vazio; "Analisar outro" mantém papel e preocupação
- [ ] Legenda sob o opt-in: "Necessário para link compartilhável, PDF formatado e avisos de prazo"; texto do demo (`lib/demo.ts:89`) atualizado para "logo abaixo"
- [ ] Texto enviado à IA limitado a ~120 mil caracteres com aviso no resultado "Contrato muito longo: analisamos as primeiras N páginas"; erro 400 de contexto do modelo mapeado (Fase 0, `entrada_recusada`)
- [ ] Agendar avisos valida Resend/SMTP ou webhook conforme o canal (400, `motivo: "notificacoes"`, link); `AvisarPrazos` mostra falha de envio da rotina com o motivo e permite cancelar; `/api/status.integrations.notificacoes` calculado e aviso na seção Prazos antes do clique
- [ ] Tabela de cláusulas: risco como `resumo` e sugestão como `detalhe`; prompt limita `tipo_contrato` a 60 caracteres; `Destaque` com "3 alto, 3 médio, 1 baixo" na interpretação
- [ ] "Adicionar todos ao calendário" (um `.ics` com N eventos)
- [ ] `PoliticaContratos.tsx` e `AcessoMCP.tsx` tratam falha; mensagens de `app/api/analisar/prazos/route.ts:16,19` explicam opt-in e expiração; `/r/[id]` explica por que a caixa de perguntas não existe após 1 h
- [ ] Setup: "Política de contratos" antes de "Ir para o app"; cartão MCP recolhido
- [ ] Erros via `respostaErro` em `analisar` e `perguntar`; conector `MCP_TAREFAS` com "Enviar pontos a negociar como tarefas"
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-034: Clone de Site (`clone-site`), prioridade Média
**Description:** As a responsável por marketing, I want preencher a minha marca, saber quando a captura não foi lida e escolher o modelo certo so that a página gerada seja minha de verdade.

Diagnóstico: nome e cores da marca (a promessa do h1) ficam recolhidos enquanto "Formato Tailwind/CSS" (jargão) fica em destaque (`app/page.tsx:168-195`); em demo o app devolve sempre a landing "Nimbus Finanças" sem avisar que a captura não foi lida; "Modelo para imagens" é o campo central deste app e fica em "Opções avançadas"; "Testar conexão" não testa visão; falhas da IA chegam como 500; sem miniatura da captura nem entrada por URL.

**Acceptance Criteria:**
- [ ] Grade principal com "Nome da marca" e "Cor principal"; "Formato" e "Instruções" em "Mais detalhes"; subtítulo do resultado sem repetir a marca; "Largura da tela" removido; alternador Computador/Celular oculto no celular
- [ ] Em `meta.demo`, faixa acima da prévia: "Esta é uma página de exemplo fixa: a sua captura não foi lida. Conecte a IA em Configurações para gerar a sua versão" com link; com modelo `:free`, linha "Gerado com o modelo gratuito; para páginas mais fiéis, troque o modelo para imagens em Configurações"; edição em demo avisa que a mudança é ilustrativa
- [ ] Cartão próprio em `/setup` ("Qualidade da página gerada") com o seletor de modelo de visão e o botão "Testar leitura de imagem" que envia um PNG mínimo por `askVision`
- [ ] Miniatura da captura na Dropzone e "Referência" ao lado da prévia; campo "ou cole o endereço da captura" reaproveitando `baixarImagem`; integração opcional de serviço de captura por URL do site (chave simples)
- [ ] `Loading` avisa "Isso leva de 1 a 2 minutos com o modelo gratuito" quando `status.ai`; diálogo "A página está no ar" avisa que o link vale enquanto o app estiver publicado e sugere baixar o HTML
- [ ] Erros via `respostaErro` (`sem_visao` → "escolha um modelo com visão em Configurações"); `lib/gerador.ts:64` explica truncamento em vez de nitidez; `EntregarPagina.tsx:44` sem `alert` com o HTML inteiro
- [ ] Acento: decidir entre manter `#374151` (registrar o motivo no `CLAUDE.md`) ou `#4338ca`
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-035: Vídeos de Campanha (`videos-campanha`), prioridade Média
**Description:** As a executivo de marketing, I want copiar a legenda certa, anexar a imagem depois e saber quando o vídeo ficou pronto so that o fluxo feche sem recomeçar.

Diagnóstico: app maduro (custo antes de gastar, erros do Higgsfield traduzidos). Faltam "Copiar" por legenda no cartão; a frase "Conecte o Higgsfield" aparece três vezes sem link e o cartão não tem "Criar conta"; esquecer a imagem obriga a recriar os conceitos (`lib/videos.ts:161`); a geração leva minutos com a aba aberta; `?captura=1` não fixa a cena do storyboard (a prévia pública está certa graças ao movimento reduzido do workflow, mas capturas locais saem sobrepostas).

**Acceptance Criteria:**
- [ ] `Storyboard` recebe `fixa` e mostra a cena 1 sem animação quando `captura=1`
- [ ] `CopyButton` por rede em "Legendas por rede"; "Copiar legenda do Instagram" no menu "Mais" copia só a do conceito escolhido
- [ ] Frase do Higgsfield uma vez acima dos cartões, com link `/setup#higgsfield`; cartão com `link: { url: "https://higgsfield.ai", rotulo: "Criar conta no Higgsfield" }`
- [ ] `PATCH /api/conceitos/[id]` grava `imagemDataUrl` depois de criar os conceitos; Dropzone no resultado quando falta a imagem
- [ ] `NOTIFICACOES` declarada e aviso por e-mail ou Slack em `atualizarEstado` quando o vídeo passa a "pronto"
- [ ] "Refazer este conceito" com instrução curta; diálogo de custo diz o motivo quando `get_cost` falha e avisa que o valor será debitado
- [ ] Erros via `respostaErro`; `lib/conceitos.ts:150` orienta trocar o modelo; `lib/higgsfield.ts:377` explica que o app precisa estar publicado em https; lista técnica de ferramentas só no log
- [ ] Limpeza: README linha 7, `getConfig("APP_URL")` em `lib/ferramentas.ts:106`, comentário herdado em `rotinas-do-app.ts`, `var(--color-accent)` no fallback do storyboard; acento `#be185d` mantido
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador
### US-036: Custos de IA (`custos-ia`), prioridade Média
**Description:** As a diretor financeiro, I want conectar meu e-mail sem criar um projeto no Google Cloud e ver o câmbio atualizado so that o app leia as notas sozinho desde o primeiro dia.

Diagnóstico: a tela principal é uma das melhores da suíte (botão acima da dobra, "Ler as notas do e-mail" desabilitado com link para conectar, exemplo com Destaque, alertas, gráfico e faturas). O gargalo é o setup: conectar Gmail ou Outlook exige credenciais de aplicativo (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, registro no Microsoft Entra) que o executivo não tem como criar (`components/ConectarEmail.tsx:47-58`); o cartão "Câmbio" pede cotações manuais ("não são buscadas automaticamente"); `app/api/leitura/route.ts:19` repassa `err.message` com 500; `ReceberFechamento.tsx:61` usa `window.alert`.

**Acceptance Criteria:**
- [ ] Credenciais de aplicativo da suíte embutidas por variável de ambiente no build, como já faz `TRELLO_API_KEY_APP`: `GOOGLE_CLIENT_ID_APP`/`GOOGLE_CLIENT_SECRET_APP` e `MICROSOFT_CLIENT_ID_APP`/`MICROSOFT_CLIENT_SECRET_APP` lidas em `credenciaisDoApp`; com elas, o cartão mostra só "Conectar o Gmail"/"Conectar o Outlook"; sem elas, o passo a passo atual fica em "Para a equipe técnica"; README e `PADRAO.md` documentam a criação dos dois registros (redirect `https://<app>/api/setup/oauth/google/callback`) e o secret do GitHub Actions que os injeta
- [ ] Câmbio automático: cotação PTAX do Banco Central (API pública, sem chave) buscada uma vez por dia com cache em `config`; o cartão vira "Câmbio (automático)" com os campos manuais em "Opções avançadas" para sobrescrever
- [ ] Erros via `respostaErro`; `ErroEmail` continua 502 mas com `acao` para `/setup#gmail` ou `/setup#outlook`; "Falha inesperada ao ler o e-mail." vira "Não conseguimos ler a caixa agora. Tente de novo; se persistir, reconecte em Configurações"
- [ ] `ReceberFechamento` sem `window.alert`; gráfico "mês a mês" com os últimos 6 meses mesmo quando só o atual tem dados (barras vazias rotuladas), para não sobrar 80% de área em branco
- [ ] `Origem` do exemplo diz "faturas fictícias de setembro; conecte o e-mail ou envie notas em PDF para ver o seu gasto" em vez de "conecte a IA"
- [ ] Quick win de utilidade: alerta "Assinatura duplicada" (mesma ferramenta em dois fornecedores ou dois planos) além de "Acima do planejado" e "Assinatura nova"
- [ ] Acento `#7e22ce` mantido (único roxo de Financeiro/TI na suíte)
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-037: Prospecção com IA (`prospeccao-ia`), prioridade Média
**Description:** As a líder de vendas, I want entender o que a Apollo e a Bright Data acrescentam e receber erros em linguagem de negócio so that eu conecte só o que preciso.

Diagnóstico: tela e exemplo bons (`?exemplo=1` já abre a abordagem do primeiro lead com e-mail, LinkedIn, WhatsApp e próximo passo). `lib/apollo.ts:95` fala em "APOLLO_API_KEY" na mensagem para o usuário; o cartão da Bright Data pede "Zona Web Unlocker" no grupo principal; `app/api/abordagem/route.ts:28` repassa `err.message` com 500; `window.alert` na rotina e `window.confirm` no envio; subtítulo "Buscado via Apollo.io" é nome de fornecedor na tela.

**Acceptance Criteria:**
- [ ] Mensagens da Apollo e da Bright Data sem nome de variável: "A busca de leads recusou a chave. Confira em Configurações › Busca de leads" (401), "A conta da Apollo atingiu o limite de créditos do plano" (402/429), "A busca de leads não respondeu; tente de novo" (5xx); `ErroApollo` com `acao` para `/setup#apollo`
- [ ] Campo `BRIGHTDATA_ZONE` com `avancado: true` e `padrao: "web_unlocker1"`; títulos dos cartões sem nome de produto ("Busca de leads" e "Enriquecimento com o site do lead", fornecedor na descrição); subtítulo do resultado "Dados de exemplo" ou "Leads reais"
- [ ] Após conectar a IA sem Apollo, o resultado mostra "Estes leads são fictícios: conecte a busca de leads em Configurações para trazer contatos reais" com link `/setup#apollo`; `proximos` da Fase 0 lista Apollo com o benefício
- [ ] Erros via `respostaErro` na abordagem e na busca; rotina sem `window.alert`; confirmação de envio ao CRM como diálogo da suíte (`DialogoConfirmacao`) em vez de `window.confirm`
- [ ] Quick wins de utilidade: "Escrever para os 5 melhores" em um clique; "Copiar lista (CSV)" já existe, ganhar "Enviar todos para o CRM" quando `MCP_CRM` estiver conectado; rotina semanal pré-preenchida com o último perfil buscado
- [ ] Acento `#0f4c81` mantido, mas registrado que é vizinho de `#2b5d8c` (PDI) e `#0a66c2` (LinkedIn); se o PDI mudar para verde, a família azul fica só em Vendas
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador


### Fase 2, apps quase prontos (prioridade Baixa)

Estes quatro apps precisam das transversais e de ajustes pequenos. Decisão de 15/09/2026: **entram nesta rodada**, no fim da fila, com o mesmo bloco comum de critérios da Fase 1.

### US-038: Agente de Kanban (`agente-kanban`), prioridade Baixa
**Description:** As a gestor que opera o quadro por comandos, I want erros do Trello em português e um painel sem pilha de botões so that o agente pareça um assistente e não uma ferramenta técnica.

Diagnóstico: tela e exemplo fortes (chat, sugestões, quadro atualizado ao lado, confirmação do plano antes de agir). `Origem` sai com "a partir de o quadro" (`insumo` começa com artigo, `app/api/agente/route.ts:44`); quatro botões fantasma empilhados no fim do painel ("Desfazer", "Reiniciar", "Receber resumo", "Criar caixa de entrada"); `lib/trello.ts:34` lança "Trello respondeu 401 ao chamar /1/…" que chega à tela via `app/api/agente/route.ts:50` com 500; quatro `window.alert`.

**Acceptance Criteria:**
- [ ] `insumo` sem artigo inicial ("quadro atual e comando enviado ao agente") e revisão dos `insumo` dos 17 apps na história de replicação
- [ ] Ações secundárias do painel em uma linha (`flex-wrap`) ou dentro de "Mais ações", mantendo só "Enviar" como primário
- [ ] Erros do Trello mapeados: 401 → "A autorização do Trello expirou ou foi revogada. Clique em Autorizar no Trello de novo" com `acao` `/setup#trello`; 429 → "O Trello está limitando as chamadas; espere um minuto"; 404 → "O quadro ou a lista não existe mais; escolha outro quadro em Configurações"; detalhe técnico só no log; erros da IA via `respostaErro`
- [ ] Sem `window.alert`: avisos inline no painel
- [ ] Sem `TRELLO_API_KEY_APP` no ambiente, o cartão diz em linguagem de negócio que a equipe técnica precisa cadastrar a chave do app antes do botão funcionar (hoje abre "Opções avançadas" sem explicar)
- [ ] Quick wins de utilidade: "Resumo do quadro" como primeira sugestão quando há quadro real conectado; "Receber um resumo do quadro toda manhã" avisa que precisa de Notificações; mostrar o nome do quadro conectado no cabeçalho do resultado ("Quadro: Recrutamento 2026")
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-039: Entrevistadora IA (`entrevista-ia`), prioridade Baixa
**Description:** As a recrutador, I want entender a diferença entre voz e ligação e receber erros da ElevenLabs em português so that eu ative só o que faz sentido.

Diagnóstico: quase pronto. Tela limpa, botão acima da dobra, exemplo completo (scorecard 7,4/10, chip "avaliar com o gestor", evidências), link público por candidato e ranking da vaga. Faltam: títulos dos cartões com nome de produto ("Voz da entrevistadora (ElevenLabs)", "Ligação telefônica automática (ElevenLabs + Twilio)"); `lib/voz.ts:29` lança "Falha ao gerar áudio na ElevenLabs (status N). {detalhe}" e `lib/voz.ts:66` repassa a mensagem em inglês do provedor; "Próximos passos" com hífens manuais em vez de lista.

**Acceptance Criteria:**
- [ ] Cartões "Voz da entrevistadora" e "Ligação telefônica automática" com o fornecedor na descrição; o segundo com os campos de agente e número em "Opções avançadas" e um resumo de negócio do que exige (conta ElevenLabs com agente conversacional e número Twilio)
- [ ] Erros da ElevenLabs mapeados: 401 → chave recusada com `acao` `/setup#elevenlabs`; 402/429 ou `quota` → "sem créditos de voz; a entrevista continua por texto"; 5xx → indisponível; a sala cai para texto sem interromper a entrevista; `lib/voz.ts:66` traduz `detail.message` comuns
- [ ] "Próximos passos" com `list-disc`; erros da IA via `respostaErro` nas rotas `proxima` e `avaliar` com "Tentar de novo" que retoma a pergunta atual sem perder o histórico
- [ ] Quick wins de utilidade: "Copiar convite para o candidato" (texto pronto com o link público); comparar dois candidatos lado a lado a partir do ranking; aviso na tela quando a voz está desligada ("A entrevista é por texto; conecte a voz em Configurações")
- [ ] Acento `#5b3f9e` mantido
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-040: Atendente no WhatsApp (`whatsapp-atendente`), prioridade Baixa
**Description:** As a dono de negócio, I want saber o que preciso da Meta antes de começar e ver se as mensagens do número real estão chegando so that a conexão não seja uma caixa-preta.

Diagnóstico: quase pronto. Simulador em forma de celular, aprovar e corrigir respostas, tabela de conversas, "Conectar meu número" no fim. A conexão real depende de token permanente, ID do número e webhook na Meta (fluxo Embedded Signup avaliado como esforço alto em `tasks/oauth-integracoes.md`); `app/api/simular/route.ts:33` repassa `err.message` com 500; três `window.alert`; cartão "Sistemas da empresa (MCP)" com jargão.

**Acceptance Criteria:**
- [ ] Cartão do WhatsApp com um resumo de negócio antes dos campos ("Você precisa de uma conta Meta Business com o WhatsApp Cloud API; a equipe técnica leva cerca de 30 minutos") e os campos técnicos em "Opções avançadas"; "Dados para a equipe técnica" mostra o endereço do webhook, o token de verificação e a última mensagem recebida do número real (data e hora) para diagnosticar a conexão
- [ ] Erros via `respostaErro` no simulador; falhas ao enviar pela Meta (token expirado, número não verificado, janela de 24 h) traduzidas com `acao` `/setup#whatsapp`
- [ ] Sem `window.alert`; "Receber o relatório diário" avisa que precisa de Notificações antes de clicar
- [ ] Quick wins de utilidade: importar a base de conhecimento de um arquivo (`.txt`, `.pdf`) além de colar; "Perguntas sem resposta da semana" como sugestão de novos itens da base; badge com a contagem de respostas aguardando aprovação
- [ ] Acento `#128c7e` mantido (verde do WhatsApp)
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### US-041: Analista Financeiro (`financas-ia`), prioridade Baixa
**Description:** As a gestor financeiro, I want que o app me diga o que a fonte de dados e as notificações acrescentam so that eu passe da planilha manual para a leitura automática.

Diagnóstico: quase pronto. Tela limpa, mapeamento de colunas confirmado antes de analisar, gráficos legíveis, "Pergunte aos seus números". `/api/status` devolve `integrations: {}` apesar de declarar Notificações e Fonte de dados (MCP); as três rotas próprias repassam `err.message` com 500; dois `window.alert`; "Conectar uma fonte de dados" não diz o que é uma fonte (planilha viva, ERP).

**Acceptance Criteria:**
- [ ] `/api/status.integrations` com `notificacoes` e `mcpDados`; o link "Conectar uma fonte de dados" ganha a frase "Leia direto da planilha compartilhada ou do ERP, sem exportar CSV toda vez"
- [ ] Erros via `respostaErro` em `insights`, `perguntar` e `fonte-dados`; mensagens de `lib/fonte-dados-mcp.ts` sem "JSON" nem "ferramenta" na tela ("A fonte conectada não devolveu uma planilha; confira em Configurações qual leitura usar")
- [ ] Sem `window.alert`; "Automatize os próximos meses" avisa que precisa de Notificações antes de criar a rotina
- [ ] Quick wins de utilidade: comparação com o mesmo mês do ano anterior quando a planilha tiver 13+ meses; "Orçamento por categoria" (já existe rotina de orçamento; expor o desvio no Destaque); exportar a leitura como planilha com uma aba por categoria
- [ ] Acento `#0b6e4f` mantido
- [ ] Lint, build e `verificar-jargao` passam; verificar no navegador

### Fase 3, catálogo e fechamento

### US-042: Pacotes públicos, catálogo e verificação final
**Description:** As a executivo no catálogo, I want que "Publicar este app" funcione nos 17 e que a página reflita a conta inicial so that a promessa bata com o que acontece.

**Acceptance Criteria:**
- [ ] Os pacotes `clone-site`, `prospeccao-linkedin` e `videos-campanha` tornados públicos em https://github.com/orgs/StartSe/packages (passo manual, registrado no resumo do job "Atualizar repositório público" até ser feito); o job passa a falhar com aviso claro quando um pacote continua privado depois do primeiro build (consulta `ghcr.io/token` + manifest, como feito nesta revisão)
- [ ] `catalogo.json` atualizado com os acentos alterados (Ata, Simulador e os que forem decididos) e `scripts/gerar-icones.mjs` rodado; `site/index.html` mostra o passo "Crie sua conta" em "Como funciona"
- [ ] `git reset --hard origin/main` na cópia local de `ai-action-app-deploy/` (só leitura; hoje está 7 apps atrás)
- [ ] Verificação final: `npm run lint`, `npm run build`, `verificar-jargao.mjs` e `verificar-padrao.sh` nos 17; capturas de `/conta`, `/entrar`, `/`, `/?exemplo=1&captura=1` e `/setup` (desktop e celular) dos 17 abertas e revisadas; `progress.txt` atualizado
- [ ] Lint e build passam

## Functional Requirements

Conta e sessão
- FR-1: No primeiro acesso a uma instância sem conta, qualquer rota privada redireciona para `/conta`, que cria a conta de administrador (nome, e-mail, senha, confirmar senha) e abre a sessão.
- FR-2: Com conta existente, rotas privadas sem sessão redirecionam para `/entrar?next=<caminho>` (páginas) ou respondem 401 `{ error, codigo: "sem_sessao" }` (`/api/**`).
- FR-3: Rotas públicas continuam sem sessão: `/f/*`, `/api/f/*`, `/s/*`, `/webhook/*`, `POST /mcp`, `/api/rotinas/executar`, `/api/health`, `/api/setup/oauth/*/callback`, `/setup/trello`, `/conta`, `/entrar`, `/api/conta/*`.
- FR-4: Senhas guardadas com `scrypt` e sal; sessões como hash SHA-256 de token aleatório; cookie `HttpOnly`, `SameSite=Lax`, `Secure` em https, 30 dias renováveis.
- FR-5: Só existe uma conta por instância; `POST /api/conta` responde 409 quando já existe. Redefinição de senha pela variável `NOVA_SENHA_ADMIN` lida na subida.
- FR-6: A `Topbar` mostra o primeiro nome e "Sair"; `/api/status` devolve `usuario`.

Erros da IA
- FR-7: `lib/ai.ts` lança `ErroIA` com `codigo`, `status` e `acao` para toda falha do OpenRouter (401, 402, 404, 429 diário ou fila, 400 de contexto ou visão, 5xx, rede, resposta vazia, JSON inválido); o corpo do provedor vai só para o log.
- FR-8: Toda rota com IA responde com `respostaErro(err)`: `{ error, codigo, acao }` e status 401/402/429/502/503, nunca 500 para falhas do provedor.
- FR-9: `ErrorBox` recebe `codigo` e `acao`, muda o título conforme o código e mostra o botão da ação; para `sem_credito` e `limite_diario`, "Usar um modelo gratuito" troca `OPENROUTER_MODEL` e repete a chamada.
- FR-10: O seletor de modelo em `/setup` agrupa "Recomendado (gratuito)", "Outros gratuitos" e "Pagos", com lista dinâmica de modelos `:free` do OpenRouter quando há chave e lista fixa como reserva.
- FR-11: "Testar conexão" da IA faz uma chamada mínima com o modelo escolhido e informa o plano (gratuito ou créditos restantes).

Setup e orientação
- FR-12: `/api/status` devolve `integrations` calculado de `INTEGRACOES` e `proximos` (integrações pendentes com `beneficio`); a `Topbar` mostra "Faz mais com..." quando há pendências.
- FR-13: Campos SMTP e webhook do Slack ficam em "Opções avançadas" ou aparecem só quando o canal os exige; o passo a passo do setup é por canal e não repete a ajuda do campo.
- FR-14: "Modelo para imagens" aparece só nos apps que usam visão.
- FR-15: Toda rotina, lembrete ou aviso valida o canal e os parâmetros antes de ser criado e mostra falhas de entrega no cartão Rotinas.
- FR-16: Links em e-mails, Slack e formulários usam `enderecoPublico()`; `localhost` nunca sai do servidor de desenvolvimento.

Envio de e-mail
Desenho
- FR-26: `globals.css` define os tokens da família nova (fundo, superfície, texto, linha, raios, sombra, gradiente do acento); nenhum app define cor fora deles.
- FR-27: O header mostra navegação com três destinos reais (Início, Histórico, Configurações), o chip de status, o nome e o e-mail da conta com "Sair"; no celular vira um botão "Menu" com uma folha sobre a tela.
- FR-28: A tela principal tem hero (sobretítulo, título, apoio, ilustração do segmento), `Passos` como indicador de progresso não clicável, e duas colunas a partir de `lg` (entrada à esquerda, prévia ou resultado à direita); no celular tudo vira uma coluna e a ilustração de pessoa não é baixada.
- FR-29: `/setup` mostra progresso ("X de Y conectados" com barra), cartões numerados com `chip-status` "Pendente" ou "Conectado", e "Configurações avançadas" como `<details>`.
- FR-33: O acento de cada app vem de `tasks/paleta-segmentos.json`: o segmento define a família de matiz, cada app um degrau próprio, com AA ≥ 4,5, ΔE ≥ 10 entre segmentos e ≥ 6 dentro; `scripts/verificar-paleta.mjs` confere.
- FR-34: Imagens novas são geradas pelo MCP do Replicate com `google/nano-banana-2` ou `openai/gpt-image-2`, e vídeos curtos com `alibaba/wan-3`, sempre sem fundo e sem texto embutido, e sempre passando por `preparar.py`.
- FR-35: Um app tem no máximo um vídeo, de 3 a 5 s, sem áudio, ≤ 400 KB, com `poster`, ausente no celular e sob `prefers-reduced-motion`, e só em modo demonstração.
- FR-36: Limites de texto: título do hero ≤ 8 palavras, apoio ≤ 20, listas ≤ 5 itens de ≤ 6 palavras, ≤ 1 linha de ajuda por campo, descrição de cartão em 1 linha.
- FR-30: Toda ilustração é decorativa (`alt=""`), servida em WebP em duas larguras, com o texto fora da imagem; nenhuma frase visível fica embutida em PNG.
- FR-31: Valores de configuração são gravados cifrados (AES-256-GCM) no SQLite; valores antigos em texto plano são migrados na primeira leitura.
- FR-32: Nenhuma tela afirma "nenhuma conexão externa" nem promete mais do que a cifragem entrega.

Envio de e-mail
- FR-23: O canal e-mail das notificações usa, nesta ordem, a caixa conectada da pessoa (Gmail ou Outlook), depois a chave do Resend, depois o SMTP; quando há caixa conectada, o remetente é o endereço da própria pessoa.
- FR-24: O cartão Notificações mostra "Conectar meu Gmail" e "Conectar meu Outlook" como botões de um clique (escopos `gmail.send` e `Mail.Send`); chave do Resend e SMTP ficam em "Opções avançadas".
- FR-25: Sem credenciais de aplicativo no ambiente (`GOOGLE_CLIENT_ID_APP`, `MICROSOFT_CLIENT_ID_APP`), os botões somem e o cartão mostra só o caminho do Resend, sem erro.

Demonstração e tela
- FR-17: O chip "Modo demonstração" é visivelmente clicável e existe um caminho para `/setup` no celular; `Origem` em demo tem link e, nos apps que ignoram a entrada, uma frase própria.
- FR-18: "Preencher com um exemplo" preenche e executa em todos os apps; o botão primário fica visível em 1400x900.
- FR-19: "Ver mais" aparece só quando há texto oculto; um por cartão no celular.
- FR-20: Nenhum `window.alert`; avisos inline com ação.

Por app
- FR-21: Cada história "Por app" implementa os itens do seu diagnóstico e no mínimo três quick wins de utilidade listados.
- FR-22: Acentos alterados: Ata Executiva para `#35507a`, Simulador de Vendas para `#15803d`; avaliados e decididos com registro em `CLAUDE.md`: PDI (`#2f6b57`), Voz do Cliente (`#b83a5e`), Clone de Site (`#4338ca`). Nenhum par de apps fica com acentos a menos de ΔE 10.

## Non-Goals

- Múltiplos usuários, convites, perfis ou permissões por app: uma conta de administrador por instância basta nesta rodada.
- Login social (Google, Microsoft) para entrar no app: a conta é local; OAuth continua só para conectar integrações.
- Recuperação de senha por e-mail: a redefinição é pela variável `NOVA_SENHA_ADMIN`, executada pela equipe técnica.
- SendGrid, Brevo, Mailgun ou qualquer provedor de envio novo além do Resend: o caminho de caixa própria (Gmail/Outlook) cobre quem não quer criar conta em serviço de envio.
- Domínio verificado no Resend, SPF/DKIM próprios e envio em massa: os avisos vão para a própria pessoa e para o time, não para clientes.
- Persistência no plano gratuito do Render: o disco continua efêmero e o app só avisa.
- Trocar o provedor de IA ou adicionar SDK do OpenRouter: continua `fetch` direto em `lib/ai.ts`.
- Embedded Signup da Meta para o WhatsApp e OAuth próprio com LinkedIn ou Instagram para publicar: esforço alto e revisão de app fora do controle da suíte (ver `tasks/oauth-integracoes.md`).
- Telas que o modelo enviado cita mas que não existem: "PDIs", "Colaboradores" e "Relatórios" não viram páginas. O header leva a Início, Histórico e Configurações.
- Carrossel de depoimentos na tela principal: é elemento de página de venda, não de ferramenta interna.
- Foto de perfil no header: o modelo de conta tem nome e e-mail; o avatar são as iniciais sobre o acento. Nada de upload de imagem nem de cargo e empresa.
- Fonte manuscrita nova, biblioteca de UI, biblioteca de ícones ou de animação: o desenho é feito com Tailwind 4 e os assets entregues.
- Ilustrações para Estratégia e Gestão/Jurídico: os PNGs entregues têm cartões de texto encostando na pessoa e não sobrevivem à separação automática; esses apps ficam só com o blob do acento até virem reexportados limpos.
- Derivar a chave mestra da senha do administrador: quem tem o contêiner tem as chaves, e isso é aceito; a cifragem cobre o arquivo em repouso.
- Trocar a fonte do texto: a família tipográfica atual continua; muda escala, peso e espaçamento.
- Editar prompts ou qualidade das respostas da IA, salvo onde uma história cita explicitamente (limite de `tipo_contrato`, variantes de `leituraSemIA`).

## Design Considerations

- Tela de conta segue o modelo enviado: título grande, frase de privacidade, quatro campos com ajuda em itálico curto, um botão largo. Na suíte isso vira `.card` centralizado de 480 px, `Field` com `ajuda`, botão `.btn-primary` no acento do app e o ícone do app acima do título, para a pessoa saber em qual app está entrando.
- Erros: título por código, mensagem em uma ou duas frases (o que houve, o que fazer), botão de ação primário e "Tentar de novo" secundário. Detalhe técnico nunca na tela.
- **Cor por segmento (decisão de 15/09/2026).** Antes cada app escolhia o seu acento e a PRD só evitava colisões; agora **o segmento define a família de matiz** e cada app ocupa um degrau próprio dentro dela, para a suíte ser lida como um conjunto. O modelo enviado ancora o RH em violeta (o `pdi-time` aparece roxo), o que substitui o verde-musgo que esta PRD avaliava.

  Regras verificáveis, todas conferidas por `scripts/verificar-paleta.mjs` (novo):
  1. Contraste do texto branco sobre o acento ≥ 4,5 (AA).
  2. ΔE (CIE76) ≥ 10 entre acentos de **segmentos diferentes**.
  3. ΔE ≥ 6 entre acentos do **mesmo segmento** — parecidos de propósito, nunca iguais.
  4. `--accent-2` (a segunda parada do gradiente) é sempre derivado por regra: matiz +18°, saturação +12, luminosidade +14 (teto 66).
  5. `soft` = mesma matiz com luminosidade 94; `ink` = mesma matiz, saturação +10, luminosidade −18.

  Paleta calculada e validada (os valores completos, com `soft`, `ink`, HSL e contraste medido, estão em `tasks/paleta-segmentos.json`):

| Segmento | Apps e acento |
|---|---|
| RH | `pdi-time` `#692bd4`, `entrevista-ia` `#6e3597` |
| Jurídico | `contratos-ia` `#473b91` |
| Gestão | `agente-kanban` `#2e3b7a`, `reunioes-ia` `#465f9b` |
| Vendas | `prospeccao-linkedin` `#0a63c2`, `prospeccao-ia` `#0b5789`, `simulador-vendas` `#3e68cc` |
| Estratégia | `radar-sinais` `#0a707f`, `bussola-ia` `#1a6d93` |
| Atendimento | `whatsapp-atendente` `#0e7c6a` |
| Financeiro | `financas-ia` `#0f6b3d`, `custos-ia` `#1f8441` |
| Marketing | `posts-sociais` `#a5185a`, `videos-campanha` `#cc199d`, `clone-site` `#792a3f`, `voz-do-cliente` `#ab36ab` |

  O `prospeccao-linkedin` fica em `#0a63c2`, praticamente o azul da marca do LinkedIn, o que preserva a referência que a PRD anterior queria manter. Treze dos dezessete apps mudam de acento: `scripts/gerar-icones.mjs` e o `catalogo.json` precisam ser regerados na história de cada app.

- **Menos texto na tela.** Direção de 15/09/2026: os apps estão verbosos. Limites que valem para os dezessete e entram no `PADRAO.md`:
  - Hero: título de no máximo 8 palavras, uma frase de apoio de no máximo 20. Nada de terceiro parágrafo.
  - Campo de formulário: no máximo **uma** linha de ajuda, e só quando ela evita um erro. Campo cujo rótulo já explica não leva ajuda.
  - Cartão de `/setup`: descrição de uma linha; o `beneficio` substitui o texto genérico, não se soma a ele.
  - Listas de "o que você vai receber": no máximo 5 itens, de até 6 palavras cada.
  - Nenhum texto repetido entre o passo a passo e a ajuda do campo (a US-017 já corrige isso no cartão Notificações).
  - Onde um ícone e um número bastam, não entra frase.

- Painel: botão primário sempre visível em 1400x900 medido por `getBoundingClientRect` no fim de cada história de app; campos opcionais em "Mais detalhes"; ações secundárias em uma linha ou em "Mais ações", nunca empilhadas.

## Technical Considerations

### Geração de imagens e vídeo (orientação de 15/09/2026)

Quando faltar uma ilustração ou fizer sentido um recurso visual próprio de um app, **as imagens podem ser geradas pelo MCP do Replicate**. Modelos a usar, decididos por Rafael:

| Para | Modelo |
|---|---|
| Vídeos curtos | `alibaba/wan-3` |
| Imagens | `google/nano-banana-2` ou `openai/gpt-image-2` |

Regras de uso, para o resultado entrar na suíte sem estragar o que já está decidido:

- **Peça a pessoa recortada, sem fundo, sem blob e sem nenhum texto na imagem.** O blob é CSS com o acento do app (US-004) e os textos são HTML. Um PNG com frase embutida não é traduzível, não é lido por leitor de tela e amarra a imagem a um app. Foi exatamente o problema dos primeiros assets.
- **Confira o canal alfa antes de aceitar.** Quatro dos PNGs entregues em 15/09 vieram sem alfa, com o xadrez de transparência pintado nos pixels; só dá para perceber abrindo o arquivo, não olhando a prévia.
- Toda imagem gerada passa por `~/Desktop/projetos/assets/preparar.py` antes de entrar em `public/ilustracoes`: recorte, remoção de respingos e WebP em 640 px e na largura nativa.
- A paleta da imagem deve conversar com a família do segmento (ver Design Considerations): a pessoa de um app de Vendas em tons de azul, de Marketing em magenta, e assim por diante. Peça isso no prompt.
- **Nesta sessão o MCP do Replicate não está conectado** (só o Higgsfield, que o `videos-campanha` já usa). Quem for implementar precisa configurá-lo antes da US-004.

**Vídeo curto:** é uma boa ideia onde ele mostra o app funcionando, e má ideia como enfeite. Condições para entrar:

- No máximo um por app, de 3 a 5 segundos, sem áudio, em laço, WebM (VP9) com MP4 de reserva, **≤ 400 KB**.
- `poster` obrigatório (o primeiro quadro em WebP), para não haver buraco enquanto carrega.
- `preload="none"`, e **não é baixado no celular** nem quando `prefers-reduced-motion: reduce` está ativo — nesses dois casos fica só o `poster`.
- Nunca atrás de texto: o vídeo é um elemento próprio, não fundo de seção.
- Só na tela inicial em modo demonstração, mostrando o resultado sendo gerado. Em app já conectado, o espaço é do resultado de verdade.

- `proxy.ts` roda sempre em Node.js no Next 16 (confirmado em `next/dist/build/analysis/get-page-static-info.js`: "Proxy always runs on Node.js runtime"), então pode abrir o SQLite via `lib/store.ts`. Atenção ao custo: uma consulta por requisição; `sessaoAtual` mantém cache em memória de 60 s por token.
- Tabelas novas no mesmo `app.sqlite`: `usuarios`, `sessoes`. `lib/store.ts` já cria `config`; a criação das novas entra em `lib/conta.ts` no primeiro uso.
- `crypto.scrypt` é síncrono-bloqueante por ~50 ms com N=16384: aceitável para uma conta por instância. `timingSafeEqual` em toda comparação de hash.
- O workflow de captura precisa de sessão: opção recomendada é um script Node com o Chromium já usado localmente, que cria a conta por `POST /api/conta`, entra e captura com o cookie; a alternativa `CONTA_DESLIGADA=1` só no contêiner de captura fica documentada e nunca vai para os Blueprints.
- `respostaErro` e `ErroIA` moram em `lib/ai.ts` (já compartilhado); `lerErro`, `Aviso` e `useConfirmacao` em `components/ui.tsx`; `lib/conta.ts`, `components/conta.tsx`, `app/conta`, `app/entrar`, `app/api/conta`, `app/api/status/route.ts` entram em `scripts/verificar-padrao.sh`.
- Lista dinâmica de modelos: `GET https://openrouter.ai/api/v1/models` devolve `pricing.prompt === "0"` e sufixo `:free`; cache de 1 h em memória; a lista fixa continua como reserva e como "Recomendado".
- Códigos HTTP do OpenRouter usados no mapeamento: 401 chave, 402 crédito insuficiente, 404 modelo, 408 timeout, 429 rate limit (o corpo distingue `free-models-per-day`), 502/503 provedor. Fonte: documentação de erros do OpenRouter, conferida em 15/09/2026.
- Credenciais de aplicativo (Google, Microsoft, Trello) embutidas por variável de ambiente no build do GitHub Actions: secrets `GOOGLE_CLIENT_ID_APP`, `GOOGLE_CLIENT_SECRET_APP`, `MICROSOFT_CLIENT_ID_APP`, `MICROSOFT_CLIENT_SECRET_APP`, `TRELLO_API_KEY_APP`; o Dockerfile recebe por `ARG` e grava em `ENV`. Segredos de cliente em imagem pública são um risco aceito para OAuth de aplicação pública (padrão dos apps instaláveis); registrar a decisão no `PADRAO.md`.
- A cotação PTAX do Banco Central vem de `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)` (sem chave); euro via `CotacaoMoedaDia`.

## Success Metrics

- 17 de 17 apps exigem conta no primeiro acesso e sessão nos acessos seguintes; 0 rotas privadas acessíveis sem cookie (teste por `curl` na verificação final).
- 0 ocorrências de `HTTP <n>`, `fetch failed` ou JSON do provedor em mensagens visíveis; 100% das falhas do OpenRouter com `codigo` e `acao`.
- Um usuário no plano gratuito do OpenRouter que recebe 402 ou limite diário volta a ter resultado em 1 clique ("Usar um modelo gratuito").
- Em `/setup`, o cartão Notificações mostra no máximo 3 campos antes de "Opções avançadas".
- Botão primário visível em 1400x900 nos 17 apps (medido); "Preencher com um exemplo" executa em 17 de 17.
- 0 `window.alert` no código dos 17 apps (regra de lint).
- 17 de 17 imagens públicas no GHCR; 17 de 17 `render.yaml` iguais entre repo privado e público (já verdadeiro hoje).
- Tempo do zero ao primeiro resultado real em qualquer app ≤ 5 minutos (criar conta, conectar a IA, gerar), cronometrado em três apps de amostra.

## Decisões (15/09/2026) e o que continua em aberto

Decidido com Rafael antes de converter para o loop:

- **Regra de senha:** ~~a simplificada~~ — revista no mesmo dia ao chegar a referência visual; ver a decisão de desenho abaixo.
- **Captura do catálogo com conta:** script Node com Playwright que cria a conta por `POST /api/conta`, entra e captura com o cookie. A variável `CONTA_DESLIGADA` fica descartada, para não existir caminho de desligar a conta em imagem nenhuma.
- **Plano do Render:** mantém o gratuito nos Blueprints, com o aviso na tela de criação de conta de que conta e configurações se perdem a cada publicação.
- **Envio de e-mail:** Resend como padrão, mais Gmail e Outlook em um clique (US-024). SendGrid fora; OAuth do Resend não existe.
- **Agrupamento do trabalho:** uma história por app, cada uma já incluindo a replicação dos arquivos compartilhados da Fase 0.
- **Escopo da rodada:** as quatro fases, incluindo os quatro apps de prioridade Baixa.

- **Desenho:** a referência de 15/09/2026 é adotada como fundação visual, em duas fases no `pdi-time` (0.5: tokens, header e assets; 0.9: telas), antes da fase por app, para que cada app seja tocado uma única vez.
- **Menu:** três destinos reais (Início, Histórico, Configurações). "PDIs", "Colaboradores" e "Relatórios" do modelo não viram telas.
- **Senha:** revertida para a regra do modelo — 8+ caracteres com maiúscula, minúscula, número **e caractere especial** —, com o medidor de quatro barras. `lib/conta.ts` e os testes já foram ajustados.
- **Segurança:** as chaves passam a ser cifradas em repouso (AES-256-GCM) e a frase "nenhuma conexão externa" é corrigida. Rafael confirmou em 15/09 que **não é problema** quem tem acesso ao contêiner alcançar as chaves — a cifragem cobre o arquivo em repouso e nada na tela precisa ressalvar isso.
- **Ilustrações:** o blob vira CSS com o acento de cada app (os blobs embutidos são lilás, o acento do `pdi-time`, e brigariam nos outros dezesseis). Cinco segmentos já têm ilustração pronta; Estratégia e Gestão/Jurídico aguardam reexportação limpa.

- **Cor:** o segmento passa a definir a família de matiz (paleta calculada e validada em `tasks/paleta-segmentos.json`); o RH fica violeta, ancorado pelo modelo. Treze dos dezessete apps mudam de acento.
- **Imagens e vídeo:** podem ser gerados pelo MCP do Replicate — `google/nano-banana-2` ou `openai/gpt-image-2` para imagem, `alibaba/wan-3` para vídeo curto — sempre sem fundo e sem texto embutido. Vídeo só com as condições de peso, `poster` e `prefers-reduced-motion`.
- **Texto:** os apps estão verbosos; cinco limites passam a valer e entram no `PADRAO.md`.

Continua em aberto:

- Credenciais de aplicativo Google e Microsoft: quem cria e mantém os registros na StartSe. O `gmail.send` é escopo **sensível** (verificação de 3 a 5 dias úteis, sem CASA); o `gmail.readonly` do `custos-ia` é **restrito** e continua na fila longa. Enquanto a verificação não sai, o app fica em teste com até 100 contas; o Outlook não depende de fila.
- ~~Acentos "avaliar" (PDI, Voz do Cliente, Clone de Site)~~: resolvido pela paleta por segmento.
