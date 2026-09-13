# Investigação: autorização em um clique para mais integrações

Objetivo: mapear, para cada integração ainda resolvida por "cole sua chave" em algum app da suíte, se dá para trocar por um botão "Autorizar" (como já existe para IA/OpenRouter e para o Trello). Cada seção segue viabilidade, pré-requisitos e esforço; termina com a ordem recomendada.

## Padrões já implementados (referência)

A suíte já tem dois desenhos de OAuth funcionando, e qualquer integração nova deve se encaixar em um dos dois:

1. **PKCE de servidor** (`OPENROUTER`, em `lib/setup-comum.ts` + `app/api/setup/oauth/openrouter/{route,callback}/route.ts` de cada app): `GET /oauth/<provedor>` gera `code_verifier`/`code_challenge`, guarda o verifier num cookie `HttpOnly` de 10 min e redireciona para o provedor; `GET /oauth/<provedor>/callback` troca o `code` pela chave via `fetch` server-to-server e grava com `setConfig`. Serve para provedores com endpoint de token único (client secret confidencial não exposto no navegador).
2. **Token flow no navegador** (`TRELLO`, em `agente-kanban/lib/integracoes.ts` + `app/api/setup/oauth/trello/route.ts` + `app/setup/trello/page.tsx`): a chave "pública" do app (identifica o app, não a pessoa) fica embutida via variável de ambiente (`TRELLO_API_KEY_APP`); o servidor só monta a URL de autorização e redireciona; o provedor devolve o token no fragmento da URL (`#token=...`), que só o navegador lê, e uma página cliente (`/setup/trello`) o envia de volta via `PUT /api/setup`. Serve para provedores sem client secret confidencial (chave pública embutida no app é aceitável).

Em ambos os casos, o campo `oauth: { tipo, rotulo, url }` de `Integracao` (`lib/setup-comum.ts:28`) já cobre a UI (o cartão mostra só o botão; chave/token manuais vão para "Opções avançadas").

## Meta Embedded Signup (WhatsApp Cloud API) — `whatsapp-atendente`

Hoje: `lib/integracoes.ts` pede colar `WHATSAPP_TOKEN` (token de acesso permanente) e `WHATSAPP_PHONE_NUMBER_ID` manualmente, com link para o painel da Meta for Developers.

- **Viabilidade:** existe (Meta oferece o fluxo "WhatsApp Embedded Signup", via Facebook Login for Business), mas é o mais distante dos dois padrões acima. O retorno do login não é a chave final: é um `code` que vira um token de usuário de curta duração, que precisa então ser trocado por um token de **System User** de longa duração via chamadas adicionais à Graph API (`/oauth/access_token`, depois associar o WABA e o número ao System User), e o `WHATSAPP_PHONE_NUMBER_ID`/`WABA_ID` só chegam via evento `postMessage` do popup do embedded signup (não vem no `code`).
- **Pré-requisitos:** app da Meta em modo Business, produto "WhatsApp" adicionado; para sair do modo de teste (só números de teste, limite de 5 destinatários) é preciso **App Review** das permissões `whatsapp_business_management` e `whatsapp_business_messaging`, o que exige **Business Verification** da empresa dona do app (documentos, pode levar dias a semanas) — isso é um pré-requisito de negócio, não só de código, e é o gargalo real do fluxo.
- **Esforço:** Alto. Integração JS (SDK do Facebook Login carregado na página de `/setup`, não um simples redirect de servidor), mais o encadeamento de chamadas Graph API para chegar ao token de System User, mais o processo de verificação de negócio fora do nosso controle. Não se encaixa em nenhum dos dois padrões já implementados sem um terceiro desenho (popup + `postMessage` + múltiplas chamadas server-to-server).

## HubSpot OAuth — `prospeccao-ia` e `voz-do-cliente`

Hoje: nenhum dos dois apps tem HubSpot; `prospeccao-ia` usa Apollo (busca de leads) e Bright Data (enriquecimento); `voz-do-cliente` hoje só depende da IA (sem integração de origem de dados). HubSpot está listado no PRD como fonte futura de leads/tickets para os dois.

- **Viabilidade:** alta. HubSpot usa OAuth 2.0 padrão de authorization code (não PKCE), com client id/secret confidenciais — se encaixa no padrão 1 (PKCE de servidor) já implementado para o OpenRouter, só trocando o passo de `code_challenge` por um client secret guardado em variável de ambiente do app (como o servidor já troca o `code` sem expor nada ao navegador, dá para usar o fluxo simples sem PKCE).
- **Pré-requisitos:** conta de desenvolvedor HubSpot, criar um "app" (público, para instalar em qualquer portal do cliente) com client id/secret e redirect URI cadastrado, escolher escopos (`crm.objects.contacts.read`/`write`, `crm.objects.deals.read` para leads; escopos de tickets para Voz do Cliente). Alternativa mais simples para uso interno de um único portal: **Private App Token** do HubSpot (token estático gerado manualmente no próprio portal, sem fluxo OAuth) — cobre o caso de uso atual da suíte (um portal por cliente) com o esforço de "colar chave" de hoje, então o ganho de implementar OAuth completo só compensa se a suíte for instalada por vários portais diferentes sem acesso do operador ao painel do HubSpot.
- **Esforço:** Baixo a médio. O desenho de servidor é uma cópia quase direta do `openrouter/{route,callback}` trocando a URL de autorização, o endpoint de troca de token e os escopos; a decisão de negócio (OAuth completo vs. Private App Token) pesa mais que o código.

## Google OAuth (Drive, Sheets, Calendar) — `reunioes-ia` (Ata) e `financas-ia` (Financeiro)

Hoje: `reunioes-ia` usa ElevenLabs/OpenAI só para transcrição de áudio (sem Google); `financas-ia` não tem `lib/integracoes.ts` (recebe CSV colado/upload, sem fonte externa). O PRD prevê Google Drive+Calendar para a Ata (buscar a gravação, criar convites/lembretes) e Google Sheets para o Financeiro (ler a planilha da empresa).

- **Viabilidade:** alta, mesmo padrão PKCE/authorization code do HubSpot e do OpenRouter (Google Identity Platform é OAuth 2.0 padrão, com suporte a PKCE nativo — ainda mais próximo do desenho do OpenRouter que o do HubSpot).
- **Pré-requisitos:** projeto no Google Cloud Console, tela de consentimento OAuth configurada, credencial "Web application" com redirect URI. O ponto de atenção é o **escopo**: escopos amplos de Drive/Sheets (`drive`, `spreadsheets` com acesso a todos os arquivos) são "sensíveis"/"restritos" e exigem **verificação do Google** (CASA/revisão de segurança, pode levar semanas) antes de sair do limite de 100 usuários de teste; usar `drive.file` (só arquivos criados ou explicitamente abertos pelo próprio app) e `calendar.events` evita a verificação restrita na maioria dos casos, ao custo de o usuário precisar abrir/selecionar o arquivo pela primeira vez através do picker do app em vez do app enxergar todo o Drive dele.
- **Esforço:** Médio. Código é o mais próximo do padrão já existente (PKCE de servidor, como OpenRouter); o esforço real está em desenhar o fluxo em torno do escopo restrito (`drive.file` + Google Picker, ou aceitar a espera de verificação para escopo amplo) e em manter 3 escopos diferentes (Drive, Sheets, Calendar) organizados — dá para pedir os três de uma vez na mesma tela de consentimento.

## Sem OAuth: ElevenLabs, OpenAI, Apollo, Bright Data

Nenhum dos quatro oferece OAuth para as chaves usadas aqui — são chaves de API de conta (dashboard → gerar chave), sem conceito de "autorizar em nome de alguém". `reunioes-ia` (ElevenLabs, OpenAI), `prospeccao-ia` (Apollo, Bright Data) continuam com o passo a passo de até três passos já padronizado em US-029 (`link` + `ajuda` do primeiro campo). Não há trabalho de OAuth a fazer para esses quatro; qualquer melhoria futura nesses cartões é só de texto/ajuda, não de fluxo.

## Ordem recomendada de implementação

1. **HubSpot** (Prospecção e Voz do Cliente) — maior semelhança de código com o padrão PKCE já testado do OpenRouter, menor dependência de aprovação externa (a decisão de negócio "OAuth completo vs. Private App Token" pode até dispensar OAuth no curto prazo).
2. **Google (Drive/Sheets/Calendar)** para Ata e Financeiro — mesmo padrão de código do item 1, esforço concentrado em escolher escopo restrito (`drive.file`) para evitar a fila de verificação do Google.
3. **Meta Embedded Signup** (WhatsApp) — maior ganho de experiência (elimina o token manual, hoje o pior fluxo de setup da suíte, ver US-031), mas maior esforço e o único com uma dependência externa que não é só técnica (Business Verification da Meta), então deve entrar depois dos outros dois estarem prontos e validados.
