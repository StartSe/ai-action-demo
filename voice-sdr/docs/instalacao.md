# Instalação: uma cópia e um Supabase por cliente

**Decisão do dono.** Cada cliente tem a **própria cópia** da interface (publicada
pelo botão do Render ou por qualquer hospedagem de site estático) e o **próprio
projeto Supabase** (banco e Edge Functions). A StartSe não hospeda a interface
nem o banco. Quem instala o banco e as funções no projeto do cliente é o
instalador do painel da StartSe (repositório `StartSe/ai-hub`, família
`destino: "supabase"` do contrato de instalação), por OAuth, no modelo
**instalar e esquecer**: o token vive durante a instalação e é revogado no fim.

Este documento descreve o fluxo, o que foi feito para ele não deixar passo
manual, o que o cliente ainda confere à mão, e o que depende de mudança no
painel.

## 1. O fluxo, do começo ao fim

1. **O cliente publica a cópia.** Botão "Deploy to Render" do README, que lê
   `render.yaml`: site estático de `app/dist`, sem projeto fixo.
2. **A cópia abre em "Conectar ao seu Supabase"** (`app/src/conexao/`). Sem
   projeto não há Auth a quem pedir sessão, então essa tela vem antes de
   `/entrar`. O botão principal leva ao instalador do painel:
   `https://ai-action.startse.com/toolkits/sarah-voice-sdr/instalador?volta=<origem da cópia>`.
3. **No painel, o cliente autoriza o app "AI Hub" no Supabase** (OAuth), escolhe
   a organização e escolhe um projeto ou pede um novo.
4. **O painel executa `instalacao.json`**, um passo por requisição:
   o preparo das extensões, as migrações em partes, o registro da versão, uma
   função por passo e a conferência.
5. **A conferência chama a função `saude`** do projeto. Ela prova que o banco
   responde com o esquema desta solução, grava o endereço das rotinas e devolve
   a chave publicável do projeto.
6. **O painel devolve o cliente para a cópia** com
   `<volta>#projeto=https://<ref>.supabase.co&chave=<publicável>` e revoga o
   token. *Hoje o painel ainda não faz este passo; ver §7.* Enquanto não faz, o
   cliente volta para a cópia e informa o endereço do projeto no formulário da
   tela de conexão: a chave vem sozinha, pela mesma função `saude`.
7. **A cópia lê o fragmento**, valida (só `projeto` e `chave`, chave publicável),
   grava no navegador, limpa a barra de endereço e abre `/entrar`. Projeto
   diferente do que a cópia já usava pede confirmação, com os dois endereços à
   vista: um link pode ser mandado por qualquer um.
8. **A fundação cria o dono.** Numa instalação sem dono, `/entrar` abre o modal
   de fundação: cadastro no Auth do projeto e `fundar_instalacao`. Não há passo
   `admin` no roteiro.
9. **O tutorial começa** (assistente de abertura), e é nele que a conta liga as
   credenciais dela: voz, telefonia, modelo e, se quiser, WhatsApp.

## 2. O roteiro

**Onde:** `instalacao.json`, na raiz, como o contrato manda (§1 do contrato).
**Gerado** por `scripts/pacote-de-instalacao.ts` (`npm run pacote`), junto com a
pasta `instalacao/` e `supabase/functions/_shared/versao-da-instalacao.ts`.
`testes/estatica/pacote-de-instalacao.test.ts` regera em memória e compara com o
que está commitado, então migração nova, função nova ou `verify_jwt` mudado sem
`npm run pacote` reprovam o `npm run check`.

**55 passos** hoje (contrato 2, `destino: "supabase"`, `entradas: []`):

| passos | tipo | o quê |
| --- | --- | --- |
| 1 | `sql` | `instalacao/preparo/`: liga `pg_cron` e `pg_net`, que a migração das rotinas confere e não cria |
| 5 | `sql` | `instalacao/migracoes/parte-01` a `parte-05`: as 98 migrações, 20 por parte, cópias byte a byte de `supabase/migrations/` |
| 1 | `sql` | `instalacao/registro/`: grava em `app_config` a última migração e o resumo das funções |
| 47 | `funcao` | uma por pasta de `supabase/functions/*` com `index.ts`, empacotada em `instalacao/funcoes/<nome>/index.ts` |
| 1 | `conferencia` | `GET` na função `saude`, prova `ok = true` |

`verificarJwt` vem de `supabase/config.toml` (padrão `true` sem bloco), e
`motivoSemJwt` é o comentário que o `config.toml` já tinha acima do bloco. Os 22
`false` levam motivo; o teste cobra.

### Por que existe a pasta `instalacao/`

Dois limites do painel, lidos no código dele:

- **O passo `funcao` publica só os `.ts` da pasta da função, sem subpastas**
  (`lerPasta` filtra `type === 'file'` e o multipart manda o nome solto). Quase
  toda função daqui importa de `../_shared/`, e algumas de outras funções
  (`cron-dial` importa de `whatsapp-inbound` e de quatro `tool-*`). Publicada
  pela pasta, subiria sem os módulos. Por isso cada função é **empacotada num
  arquivo só** pelo rolldown (fixado em `devDependencies`), com o
  `npm:@supabase/supabase-js@2` de fora, e o arquivo leva `// @ts-nocheck`
  porque o Deno o lê como TypeScript. O teste confere que sobra só import
  `npm:` e que o texto se lê igual como TS e como JS. Copiar os módulos
  achatados daria 947 arquivos (7,4 MB), e o painel lê cada um por uma chamada
  ao GitHub; empacotado, é um por função (1,7 MB no total).
- **O passo `sql` roda a pasta inteira numa requisição do painel**, um arquivo
  por chamada à Management API, lendo todos do GitHub antes. A rota não declara
  `maxDuration`; com 98 arquivos seriam minutos numa requisição só. Em partes de
  20, cada requisição fica na ordem da medida do próprio painel (2 arquivos em
  7,7 s).

O preparo e o registro estão fora de `supabase/migrations/` de propósito: o
preparo é do projeto hospedado (localmente as extensões se ligam como antes), e
o registro carrega a versão desta geração do pacote.

## 3. Os escopos do OAuth

A Voice SDR precisa de:

| escopo | acesso | por quê |
| --- | --- | --- |
| Database | leitura e escrita | as migrações, o preparo e o registro (`POST /database/query`) |
| Edge Functions | leitura e escrita | publicar as 47 funções (`POST /functions/deploy`) |
| Projects | leitura e escrita | **só** para criar projeto novo; escolher um existente pede leitura |
| Organizations | leitura | o seletor de organização e o `organization_slug` de projeto novo |
| REST | leitura e escrita | o painel ainda não isolou se `/database/query` depende dele (§6 do documento de medição do painel) |

E **dispensa**:

| escopo | por quê |
| --- | --- |
| Secrets | só o passo `admin` lê a chave secreta, e o roteiro não tem `admin`: a fundação cria o dono. Nada é gravado em segredo de função: o segredo das rotinas nasce no Vault (§4) |
| Auth | a configuração do Auth não muda na instalação. O preço é a §5 |

**O escopo não é pedido por roteiro hoje.** A tela de consentimento do Supabase
mostra os escopos cadastrados no aplicativo OAuth "AI Hub", e o
`enderecoDeAutorizacao` do painel não manda `scope`. Para esta solução não pedir
Secrets, o painel precisa de um segundo aplicativo OAuth sem Secrets e escolher
qual usar pelo roteiro (sem passo `admin`, o sem Secrets). Ver §7.

## 4. O que não fica para ninguém gravar à mão

| antes | agora | onde |
| --- | --- | --- |
| `SARAH_INTERNAL_SECRET` gravado nas funções **e** no Vault, com o mesmo valor | a migração sorteia o segredo no Vault quando falta; as funções leem a variável e, sem ela, o Vault por `segredo_interno_da_instalacao()` (só `service_role`), com cinco minutos de validade no isolado | `20261005100000_instalacao_sem_passo_manual.sql`, `_shared/segredo-interno.ts`, as 12 funções que mandam ou conferem `x-internal-secret` |
| `app_config.rotinas.url_base` gravado depois do deploy | a função `saude` grava `SUPABASE_URL + /functions/v1` por `registrar_url_base_das_rotinas`, só quando falta. A conferência da instalação a chama logo depois do deploy, e a tela de conexão também | mesma migração, `supabase/functions/saude/` |
| `pg_cron` e `pg_net` ligados no painel do Supabase | o primeiro passo do roteiro liga, `create extension if not exists` | `instalacao/preparo/00_extensoes.sql` |
| confirmação de e-mail desligada no Auth para a fundação ter sessão | enquanto a instalação não tem dono, o gatilho confirma o e-mail no cadastro, e a interface entra com a mesma senha quando o cadastro volta sem sessão | `20261005110000_dono_sem_confirmacao_de_email.sql`, `servico-supabase.ts` |
| `SARAH_ORIGENS_PERMITIDAS` para o retorno do OAuth do modelo | sem a variável, vale a origem do próprio pedido autenticado | `_shared/origens-permitidas.ts`, `model-connect` |

**Por que o endereço vem de uma função e não de um passo `sql`.** O contrato não
interpola nada em arquivo `.sql` (`quantos` e `pasta` são os únicos campos), e o
SQL não tem de onde tirar o ref do projeto. Toda função tem `SUPABASE_URL` no
ambiente. Gravar pela conferência é o caminho que roda em toda instalação, e
gravar só quando falta preserva o valor de quem o definiu à mão.

**CORS aberto (`access-control-allow-origin: *`) é seguro aqui.** Nenhuma função
lê ou grava cookie (conferido: nenhum `cookie` nem `allow-credentials` em
`supabase/functions/`). A autorização é sempre um portador no cabeçalho: o JWT
da sessão, a chave da conta em `x-intake-key`, o segredo interno, a assinatura
do provedor ou o `state` assinado. O navegador não manda portador de cabeçalho
por conta própria, então uma página de outra origem não consegue agir em nome
de ninguém. É isso que deixa a cópia funcionar em qualquer endereço sem
configuração. A única função que dependia de origem é o retorno do OAuth do
modelo, e ela passou a aceitar a origem do próprio pedido autenticado quando a
lista não está definida.

**`ENDERECO_DA_INTERFACE`** (volta do OAuth do calendário e da telefonia)
continua opcional: sem ele, a página de volta pede para fechar a janela, em vez
de levar de volta à cópia.

## 5. O que o cliente ainda confere à mão

**Os endereços do Auth.** O Supabase só aceita o `redirectTo` que a cópia manda
(recuperação de senha: `origem + /recuperar-senha`) quando ele está em
Authentication, URL Configuration, Redirect URLs. Fora da lista, o link cai no
Site URL, que num projeto novo é `http://localhost:3000`. O instalador não tem o
escopo Auth, e o endereço da cópia só é conhecido na cópia. Implementado:

- **(a) a cópia mostra o endereço exato** a liberar, com botão de copiar e o
  atalho para `https://supabase.com/dashboard/project/<ref>/auth/url-configuration`
  (`EnderecosDoAuth`): no modal de fundação e depois do pedido de recuperação.
  Site URL é a origem da cópia; Redirect URLs recebe `origem/**`.

Opção descrita, não implementada:

- **(b) o roteiro pede o escopo Auth** e um passo novo do painel grava `site_url`
  e `uri_allow_list` por `PATCH /v1/projects/{ref}/config/auth` a partir de uma
  entrada do formulário ("endereço da sua cópia do app", `formato: "url-http"`).
  Custa uma linha a mais na tela de consentimento (o escopo Auth dá acesso a
  243 campos de configuração) e um tipo de passo novo no contrato. Com o `volta`
  da §7, a entrada nem precisaria ser digitada.

O convite de equipe não passa pelo Auth: o link é do próprio app (token em
`invitations`), montado com a origem da cópia. Ele não depende da lista.

**Também fica com o cliente**, e é do produto, não da instalação: as credenciais
dos provedores (voz, telefonia, modelo, WhatsApp), digitadas no tutorial. E o
SMTP do Auth: o SMTP padrão do Supabase manda poucos e-mails por hora, o que
limita a recuperação de senha em conta com muita gente.

O e-mail de confirmação do cadastro ainda chega ao fundador, porque quem decide
mandar é a configuração do Auth. O link não é necessário para entrar.

## 6. A versão da instalação

O registro (último passo `sql`) grava em `app_config` `instalacao.migracao` (a
última migração do pacote) e `instalacao.funcoes` (o resumo das funções). A
função `saude` devolve essas duas e as que ela própria foi gerada com
(`_shared/versao-da-instalacao.ts`). A cópia compara com a versão que ela espera
(`AvisoDeVersao`, faixa no topo):

| situação | faixa |
| --- | --- |
| migração do banco mais antiga que a da cópia | "Atualize a sua instalação" |
| migração do banco mais nova que a da cópia | "Esta cópia é mais antiga que o seu banco" |
| mesma migração, funções de outra geração | "As funções do projeto são de outra versão" |
| sem registro (instalado pelo CLI) | nada; a migração sai de `supabase_migrations.schema_migrations` quando existe |

## 7. O que o painel precisa (StartSe/ai-hub)

Nada aqui foi alterado no ai-hub. O que a Voice SDR precisa dele, em ordem de
importância:

1. **`?volta=` na página do instalador.** `/toolkits/<id>/instalador` não lê
   parâmetro hoje. Precisa aceitar `volta`, validar (só origem, `https:` ou
   `http://localhost`, sem caminho nem credencial), guardar junto do PKCE no
   cookie selado da partida (a volta do OAuth passa por `/supabase/volta`) e,
   no fecho, mostrar "Abrir a sua cópia" com o host à vista, apontando para
   `<volta>#projeto=<supabase_url>&chave=<valor>`. O painel já tem `supabase_url`
   como reservada.
2. **`revelar` na `conferencia` da família supabase.** O roteiro já declara
   `revelar: { campo: "chave", rotulo: "Chave publicável do projeto" }` no passo
   de conferência; o validador de hoje descarta o campo em silêncio. A resposta
   da `saude` traz `chave` no primeiro nível, como o contrato exige. Alternativa
   sem `revelar`: o painel lê a chave publicável por `GET /v1/projects/{ref}/api-keys`
   (sem `reveal`), antes de revogar. Com `volta` e a chave, o link do fecho se
   monta sem entrada nenhuma e o cliente não cola nada.
3. **Escopo por roteiro.** Um segundo aplicativo OAuth sem Secrets, escolhido
   quando o roteiro não tem passo `admin` (§3).
4. **Opcional, para o pacote encolher:** `lerPasta` recursiva com caminho no
   nome do arquivo do multipart (o deploy da Management API aceita caminhos),
   e um campo de faixa no `sql` (`de`/`ate`). Com os dois, o roteiro apontaria
   direto para `supabase/functions/<nome>` e `supabase/migrations`, e
   `instalacao/` deixaria de existir.
5. **Opcional:** o passo de Auth da §5 (b).

**O catálogo.** O instalador procura o roteiro em `StartSe/toolkit-<id>`, na
`main`, e a página exige a solução no catálogo. Este repositório assume o id
`sarah-voice-sdr` (repositório `StartSe/toolkit-sarah-voice-sdr`); o nome de
repositório e o id do catálogo precisam casar com `ID_NO_CATALOGO`, em
`app/src/conexao/instalador.ts`, e com o botão do README. O `app.manifest.json`
do catálogo não foi criado aqui.

## 8. Atualizações: proposta, não implementada

O desenho do painel é instalar e esquecer: ele não guarda token nem estado do
cliente. A Voice SDR se atualiza assim, sem mudar isso:

- **A cópia se atualiza pelo repositório.** No Render, `autoDeploy: false`:
  quem quer a versão nova pede "Manual Deploy" ou sincroniza o próprio fork.
- **O banco se atualiza rodando o mesmo instalador de novo**, no mesmo projeto.
  As funções já são idempotentes (deploy substitui). O registro também. As
  **migrações não são**: a maior parte cria tabela sem `if not exists`, e
  reaplicar a parte 1 num banco pronto falha no primeiro `create table`.
- **O que falta para reaplicar ser seguro** é o painel aplicar só o que o banco
  ainda não tem. Proposta: um passo novo no contrato, `migracoes`, que lê a
  pasta, consulta `supabase_migrations.schema_migrations` (o mesmo registro do
  CLI do Supabase), aplica em ordem só as versões ausentes e registra cada uma
  na mesma transação. Com isso, instalação nova, atualização e projeto que já
  veio pelo CLI passam pelo mesmo caminho, e a faixa de versão da §6 vira o
  convite para rodar o instalador de novo.
- **Enquanto o passo não existe**, atualizar um projeto instalado é aplicar à mão
  as migrações posteriores a `instalacao.migracao` (no SQL Editor ou pelo CLI) e
  rodar o instalador só para as funções, o que hoje não dá para separar no
  painel.
