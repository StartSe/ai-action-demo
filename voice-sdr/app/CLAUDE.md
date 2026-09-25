# app/

Vite 8 + React 19 + TypeScript 5 + TanStack Router/Query + Tailwind v4.

## Gotchas

- **Tailwind v4 não usa `tailwind.config.js`.** O plugin é `@tailwindcss/vite` e
  o CSS entra por `@import 'tailwindcss'` em `src/estilos.css`. Tema e tokens se
  declaram em CSS, não em arquivo de configuração JS.
- **`vite.config.ts` importa `defineConfig` de `vitest/config`**, e não de
  `vite`. Sem isso o bloco `test` não tipa.
- **ESLint flat config**: `eslint-plugin-react-hooks` expõe o preset plano em
  `configs.flat['recommended-latest']`. O `configs['recommended-latest']` sem o
  `flat` é o formato eslintrc antigo e quebra o ESLint 10.
- **`@compartilhado/` importa de `supabase/functions/_shared/`.** É o caminho
  para o que os dois lados precisam calcular igual, como o token de convite:
  a interface gera o token e o hash, e a função de borda recalcula o mesmo
  hash. O alias está em `vite.config.ts` e em `tsconfig.app.json`, como o `@/`.
  Só vale para módulo sem plataforma; nada de `Deno` ali dentro.
- **`@importacao/` importa de `supabase/functions/leads-import/`.** A tela de
  importação (`/leads/importar`) desenha a prévia e o relatório que a borda
  monta, e lê dali os tipos, `CAMPOS_DO_LEAD` e `resolverMapeamento` — uma
  segunda versão do contrato na interface só teria como divergir. Vale a mesma
  regra do `@compartilhado/`: módulo sem `Deno`, alias declarado em
  `vite.config.ts` **e** em `tsconfig.app.json`, e o `index.ts` da função
  continua fora do alcance da interface.
- **`@voz/` importa de `supabase/functions/voice-catalog/`.** A tela de voz
  grava `voice_settings` por `ajustesParaGravar` e lê por `lerAjustesGravados`,
  o par que a borda usa; mesma regra dos outros aliases de função.
- **`@publicacao/` importa de `supabase/functions/agent-publish/`.** A tela de
  playbooks desenha o `ResultadoDoProposito` que a borda devolve, e o dublê da
  Sarah publica passando por `atenderPublicacao` com a porta em memória. É o
  que faz "três publicados e um em falha" mostrar a frase de
  `MENSAGENS_DO_PROPOSITO`, e não uma escrita para o teste.
- **`@diagnostico/` importa de `supabase/functions/call-diagnose/`.** O cartão
  de diagnóstico da ficha lê dali `DiagnosticoNaTela`, a lista fechada de alvos
  e `paraTela` (a mesma tradução da linha de `call_diagnoses` que a borda usa),
  e o dublê analisa por `atenderDiagnostico` com `porta-em-memoria.ts` sobre as
  fixtures da ElevenLabs. Aplicar é o RPC `aplicar_proposta_do_diagnostico`,
  e publicar continua sendo `sarah.publicarPlaybook` (roteiro e jeito da casa)
  ou `sarah.republicar` (o resto), num segundo clique.
- **Typecheck é `tsc --build`** sobre dois projetos: `tsconfig.app.json` (código
  de `src`, DOM) e `tsconfig.node.json` (só `vite.config.ts`, tipos de Node).
  Arquivo novo fora de `src` precisa entrar em um dos dois.
- `noUncheckedIndexedAccess` está ligado: acesso por índice devolve
  `T | undefined` e precisa de guarda.

## Tokens e estilo

- **A linguagem visual é o design system "Sarah SDR, Crimson + Mint"**, tema
  escuro: carmim para ação, menta para progresso e sucesso. O que foi adotado,
  ajustado e deixado de fora está em `docs/padrao-de-interface.md` seção 6.
  Leia antes de mexer em cor, forma ou estrutura de tela.
- **A paleta mora em `src/estilos.css`**, em `:root`, com nomes em português
  (`--acento`, `--texto-apoio`, `--raio-cartao`). O bloco `@theme inline`
  logo abaixo só aponta as utilitárias do Tailwind para essas variáveis, sem
  repetir o valor: `bg-acento`, `text-texto-apoio`, `rounded-cartao`. Cor nova
  entra nos dois blocos. Redesenho troca valor, não nome: é o nome de papel
  que faz a mudança chegar a toda tela.
- **Texto sobre o carmim é `text-texto-sobre-acento`, nunca `text-white`.**
  Branco sobre `#FF4B55` dá 3,29:1. A conferência de contraste de cada par está
  no cabeçalho de `src/estilos.css`; cor nova entra nela.
- **Foco de campo é menta, foco de botão é carmim claro.** Carmim num campo é
  recusa (`.campo-recusado`), e o campo focado não pode parecer errado.
- **Nada de cor solta no JSX** (`#hex`, `rgb()`, `bg-white`): o véu de diálogo
  é `.veu`, a tinta é token. Gradiente e brilho decorativos que só uma moldura
  usa (o painel visual de `AreaDeAcesso`) são a exceção, escritos com `rgb()`
  dos próprios tokens.
- **Estilo que se repete vira classe em `@layer components`**, com nome em
  português: `.cartao`, `.bloco-secundario`, `.campo`, `.botao-primario`,
  `.botao-secundario`, `.botao-menta`, `.botao-fantasma`, `.botao-perigo`,
  `.botao-link`, `.selo` e os tons `.selo-*`, `.titulo-de-tela`,
  `.titulo-de-secao`, `.tabela`, `.esqueleto`, `.veu`, `.caixa-de-dialogo`,
  `.cartao-de-escolha`, `.coluna-de-quadro`, `.cartao-de-quadro`, `.revelar`,
  `.sinal` e seus estados, `.sem-impressao`. A lista inteira está na seção 2
  do padrão de interface.
- **Classe com tamanho próprio fica dentro de `@layer components`.** Regra fora
  de camada vence qualquer utilitária, e `giro h-4 w-4` não encolheria. E o
  Tailwind v4 move por `translate` e `scale`, não por `transform`: transição e
  `prefers-reduced-motion` nomeiam essas propriedades.
  Sequência de utilitárias copiada entre telas não passa. **Tailwind v4 não
  aceita `@apply` de classe personalizada dentro de outra**: cada uma se
  escreve inteira.
- Tamanho e largura fora da escala do Tailwind se escrevem com a variável:
  `w-[var(--largura-barra-lateral)]`, `max-w-[var(--largura-leitura)]`.
- Dado que se lê como valor (telefone, duração, custo, nota, horário) leva a
  classe `.val`, que aplica JetBrains Mono. Ela e a Inter do corpo vêm do
  Google Fonts por `<link>` em `index.html`.
- **A barra lateral recolhe abaixo de 1024px** (`max-lg:`) para 78px, só com os
  ícones de `IconeDeNavegacao`; a largura é `--largura-barra-lateral`, que
  muda por media query no `:root` e é lida pela casca. Recolhido, o rótulo é
  `sr-only`, e por isso continua sendo o nome do elo nos testes.

## Componentes e rotas

- Componentes de base ficam em `src/componentes/`, um arquivo por componente.
- **Toda tela de trabalho é uma `AreaDeTrabalho`** (título, frase de apoio e
  conteúdo) e toda tela sem sessão é uma `AreaDeAcesso` (cartão do formulário e
  a marca ao lado). Moldura própria copiada dentro da rota não passa: as duas
  molduras existem para isso.
- **A `AreaDeTrabalho` traz o único `h1` da tela.** Título de cartão é `h2`, e
  quem o desenha é `Painel` ou `Secao`.
- **`Painel` só recebe `rotulo` quando o cartão é um destino em si**, como cada
  provedor em `/config/integracoes`. O `rotulo` vira `aria-label` e a seção
  vira `role="region"`: uma tela cheia de regiões sem necessidade atrapalha
  quem navega por marcos, e os testes contam regiões.
- **`react-refresh/only-export-components` derruba o lint** quando um arquivo
  de componente exporta também uma função. Lógica auxiliar vai para
  `src/utilidades/`. Exportar **tipo** ao lado do componente passa, e é como
  `TabelaDensa` entrega `ColunaDensa` e `Selo` entrega `TomDoSelo`.
- **Lista de trabalho é `TabelaDensa`**, e as colunas são **dado**
  (`ColunaDensa<Linha>`: título, classe da célula e uma função de conteúdo), não
  JSX repetido tela a tela. Coluna nova entra nas asserções do teste sozinha, e
  a classe `.val` do telefone fica declarada ao lado do título.
- **Seleção em tabela é da tela, não da `TabelaDensa`.** A tabela recebe
  `selecao` (rótulos acessíveis, `selecionada`, `tudoSelecionado` e os dois
  `aoAlternar`) e só desenha as caixas; quem guarda os ids é quem sabe o que
  fazer com eles. Sem a prop, a tabela continua sem coluna de seleção.
- **Confirmação de ação usa `Dialogo`** (`src/componentes/dialogo.tsx`): título,
  o que vai acontecer, o que a tela precisar perguntar e dois botões. Não é
  `<dialog>` — `showModal` não existe em jsdom —, e é a mesma razão de
  `ModalDeFundacao`. Ação destrutiva passa `tom="perigo"`.
- **Campo que o sistema preenche e a pessoa pode corrigir é `string | null`**,
  e o `null` é "ainda não tocado". O valor à vista se **deriva no desenho** (o
  escrito, senão o palpite), nunca se sincroniza por efeito — que o lint recusa.
  É o que faz a cidade corrigida à mão sobreviver à troca do DDD e o campo
  esvaziado de propósito continuar vazio. `src/leads/cadastro.ts` é o exemplo.
- **Estado que precisa sobreviver a uma troca de filtro mora acima do
  `useQuery`.** Chave de consulta nova volta a `isPending`, o ramo da lista sai
  da árvore e todo `useState` dele morre junto: a seleção de `/leads` fica em
  `TelaDeLeads` e é a lista que a poda pelo que está à vista. Podar no desenho,
  e não por efeito, é também o que o lint desta base exige.
- **Barra de filtros usa `Seletor`** (`src/componentes/seletor.tsx`), o mesmo em
  `/config/auditoria` e em `/leads`. O rótulo vira `aria-label`, que é como o
  teste acha o campo.
- **`EstadoVazio` aceita ação de botão ou de endereço.** A de endereço vira
  `<a href>`, como a barra lateral, porque o destino pode ser uma rota que
  ainda não foi registrada — o `Link` do TanStack recusa em tempo de compilação
  o que não conhece.
- A casca (`src/componentes/casca.tsx`) é o componente da rota-camada
  `aplicacao` e lê o caminho atual com `useRouterState`. Ela monta a barra
  lateral (navegação e checklist) e a barra do topo (onde a pessoa está e a
  conta). As duas recebem tudo por prop, para testar sem provedor nem roteador:
  `caminhoAtual` para a lateral, `secao` e `emailDoUsuario` para a do topo.
- **O nome da tela na barra do topo sai de `rotuloDoCaminho`**, em
  `src/utilidades/navegacao.ts`, que lê a mesma lista de `src/copy/navegacao.ts`
  que desenha a barra lateral. Caminho fora da trilha devolve `undefined` e a
  barra mostra só a conta.
- A barra lateral usa `<a href>` porque só `/` está registrada. Conforme as
  rotas entrarem em `src/roteador.tsx`, trocar por `<Link to>`.
- **Duas famílias de rota.** `/entrar`, `/recuperar-senha` e `/convite/$token`
  pendem direto da raiz e abrem sem sessão. Tudo que exige sessão pende da rota-camada
  `aplicacao` (sem caminho próprio, `id: 'aplicacao'`), cujo `beforeLoad`
  desvia para `/entrar` levando `destino` com o endereço tentado. **Rota nova
  de produto entra como filha de `rotaAplicacao`**, senão nasce pública.
- **`criarRoteador` recebe contexto**: `{ autenticacao: { temSessao } }`. A
  guarda roda antes de renderizar, então a leitura da sessão precisa ser
  síncrona — quem espera resposta de rede é `servico.iniciar()`, no `main.tsx`,
  por `await` de topo, antes do primeiro desenho.
- **`validateSearch` de uma rota herda a busca da raiz.** Devolver `{}` não
  apaga o que veio da barra de endereço; devolver a chave sempre, ainda que
  `undefined`, apaga — **só as chaves que ela declara**. O que a rota não nomeia
  continua visível, vindo do pai: `/leads?utm_source=email` chega com o
  `utm_source` dentro, e isso é de propósito (bagagem de link não é filtro). É
  a atribuição de cada chave que faz `destinoSeguro` barrar redirecionamento
  aberto em `/entrar?destino=...`.
- **Endereço aninhado não implica rota aninhada.** `/leads/novo` é rota irmã de
  `/leads`, as duas filhas diretas de `aplicacao`: `rotaLeads` não é rota-camada,
  e aninhar faria a lista montar por baixo do formulário a cada abertura. Só
  quem desenha moldura comum vira pai.
- **`useSearch({ from })` quer o `routeId`, não o caminho.** Rota filha de
  `aplicacao` tem id `/aplicacao/leads` e caminho `/leads`; o `to` de
  `useNavigate` usa o caminho, e o `from` de `useSearch` usa o id. Trocar os
  dois é erro de typecheck, com a lista de ids na mensagem.
- **`useParams({ from })` também quer o `routeId`.** A ficha da chamada lê
  `useParams({ from: '/aplicacao/chamadas/$id' })`; o `'/convite/$token'` só
  funciona sem o prefixo porque pende direto da raiz.
- **A busca chega em JSON: `?semana=3` escrito à mão é o número 3.**
  `textoDaBusca` descarta o que não é texto, e o filtro numérico some calado.
  Chave que pode ser número converte na própria `validateSearch`
  (`/reunioes`, chave `semana`). E a prova de que a rota devolve toda chave só
  cai com chave em branco ou inválida na barra de endereço (`?estado=%20`):
  com valor válido, a busca herdada da raiz faz o filtro funcionar mesmo com a
  chave omitida.
- **Busca nova sai da busca corrente, não da que o desenho leu.**
  `navigate({ search: (atual) => ({ ...atual, ...mudanca }) })`. Com
  `{ ...busca, ...mudanca }`, dois filtros trocados antes de o primeiro chegar
  à tela apagam um ao outro.

## Serviços de dados

O mesmo desenho da autenticação vale para todo dado: contrato em
`src/<assunto>/tipos.ts`, implementação sobre o Supabase em
`servico-supabase.ts`, dublê em `src/testes/`, e um provedor de contexto que
entrega o serviço à árvore. `src/equipe/` é o segundo exemplo.

- **Carga de tela é `useQuery`**, com `refetch()` depois de cada escrita.
  Sincronizar por `useEffect` + `setState` não passa no lint, e o `QueryClient`
  já está montado tanto em `main.tsx` quanto em `montarAplicacao`.
- **Escrita recusada pela RLS não levanta erro**: um `using` que não casa só
  não afeta linha. A implementação faz `.select()` depois do `update`/`delete`
  e trata lista vazia como `sem-permissao`.
- **Tela fechada por papel nega na tela, não na rota.** A rota continua
  registrada para todo mundo e o componente é quem decide: quem não pode ver a
  negativa com o motivo e a lista de quem concede acesso (`quemConcedeAcesso`),
  em um `role="alert"`. Desviar em silêncio deixa quem clicou no item da barra
  lateral sem saber por que não chegou a lugar nenhum.
  `src/rotas/config-discagem.tsx` é o exemplo, e a regra de papel é função pura
  em `src/equipe/papeis.ts`.
- **A regra mora no banco; a tela só evita oferecer o que a política nega.**
  `src/equipe/papeis.ts` espelha a hierarquia de `has_role`, e é função pura
  testada à parte.
- **Segredo digitado não volta.** Campo de credencial nasce vazio e continua
  vazio depois de gravar: o servidor devolve `preenchida`, nunca o valor. O
  marcador (`••••••••`) diz que há chave; **campo em branco significa "não
  mexi"**, nunca "apague" — `valoresParaSalvar` descarta os vazios antes de
  chamar o cofre. Gravação recusada mantém o que foi digitado; gravação aceita
  limpa o campo.
- **Estado de espera é da tela, não do servidor.** `integrations-status` observa
  quatro estados (`conectado`, `nao_configurado`, `erro`, `indisponivel`);
  `testando` só existe enquanto o pedido viaja e cobre o estado anterior —
  afirmar "com erro" durante o teste manda agir sobre resultado que já está
  sendo refeito. A decisão é função pura em `src/integracoes/cartao.ts`.
- **Medido e declarado são dois campos, e a tela mostra os dois.** Na
  configuração inicial, `pendente` vem da medição do banco e `marcado` vem de
  quem configura. Marcar não apaga pendência: só o passo que não bloqueia nada
  (`bloqueia: []`) pode ser fechado por declaração. A decisão é pura, em
  `src/configuracao-inicial/progresso.ts`.
- **"Aguardando aprovação" é decisão do servidor, não da copy.** O passo chega
  com `estado` (`pendente`, `aguardando_aprovacao`, `concluido`), calculado em
  `onboarding_health` a partir do catálogo: hoje só o número, que espera a
  operadora, e a agenda, que espera a verificação do aplicativo OAuth do
  Google. `estadoDoPasso` só acrescenta `indisponivel`, que é da tela.
  Deduzir a espera da existência de um texto em `copy/` punha a regra no
  arquivo errado, e um passo novo nasceria em espera por ter ganhado frase.
- **Espera não é inofensiva, e a tela diz as duas coisas.** O passo em espera
  mostra de quem é a resposta e o que continua bloqueado enquanto ela não vem.
  Só a primeira frase faria a espera parecer resolvida.
- **Passo de fase futura não vira link.** `disponivel: false` significa que a
  tabela daquele passo ainda não existe neste banco; o passo continua na lista,
  com a frase de "ainda não disponível", e o endereço de resolver some. Mandar
  alguém para uma rota que não existe é pior do que não oferecer nada.
- **Escrita em lote confere o que voltou.** A recusa da RLS é silenciosa, então
  a operação pede `.select('id')` e compara com os ids que mandou: nada voltou é
  `sem-permissao`; parte voltou é **resultado**, não erro — "18 de 20
  bloqueados", com a lista de quem ficou de fora, nomeado. Os três números
  fecham a conta do pedido (`src/leads/acoes.ts`), como o relatório da
  importação.
- **Ação que precisa de evento por linha manda em ondas.** `update` em lote é
  uma chamada só, mas `registrar_evento_de_lead` recebe um lead por vez: cem por
  onda, o mesmo tamanho de `leads-import`. O evento não é atômico com a escrita
  que o narra — fundir os dois exigiria um RPC —, e por isso evento que falha
  não desfaz nem reporta a escrita que já foi aceita.
- **Arquivo que a borda devolve no corpo se salva com `baixarTexto`**
  (`src/utilidades/download.ts`). Ele devolve `false` quando o ambiente não sabe
  criar endereço de objeto, que é o caso de jsdom, e a tela diz isso em vez de
  afirmar que baixou. No teste, cote `URL.createObjectURL` **e**
  `HTMLAnchorElement.prototype.click`: sem o segundo, jsdom trata o âncora como
  navegação e imprime "Not implemented" no meio da suíte.
- **Frase de interface com número é função em `src/copy/`.** "18 de 20
  bloqueados" e "1 lead selecionado" não se montam por concatenação no JSX sem
  espalhar concordância pela tela. A função continua sendo literal: ela escreve,
  não decide.
- **Recorte de lista: a busca da rota e o recorte do serviço não são o mesmo
  objeto.** A busca guarda o período (`atividade=7d`) e o termo como a pessoa
  digitou; o recorte (`@compartilhado/recorte-de-leads.ts`, o mesmo que
  `lead-export` recebe) guarda o instante em ISO e o termo já normalizado por
  `@compartilhado/telefone.ts`. Link com instante cravado envelhece, e campo de
  busca precisa mostrar de volta o que foi digitado.
- **A chave do `useQuery` sai da busca, nunca do recorte.** O recorte carrega o
  instante da última atividade, que muda a cada leitura do relógio: chave nova a
  cada desenho é consulta nova a cada desenho. `chaveDaBusca` existe para isso.
- **Filtro que a tela não reconhece vira recusa, não consulta.** Um
  `?ordenacao=preco` escrito à mão não pode cair no recorte aberto: mostrar a
  conta inteira a quem pediu um recorte é o engano que ninguém percebe. Quem
  decide é o módulo compartilhado, e o motivo (`filtro-invalido`) entra na mesma
  união das falhas do servidor.
- **Campo de texto que espelha a barra de endereço se remonta por `key`.** O
  campo de busca de `/leads` tem `key={busca.termo ?? ''}`: é o que faz "Limpar
  filtros" esvaziar o que está escrito sem sincronizar estado por efeito, que o
  lint desta base recusa.
- **Estado de publicação é conta, não coluna.** "O que está no ar é o que está
  gravado?" (RF-311) se responde comparando o hash compilado com
  `agent_publications.published_hash`, propósito a propósito, e quem sabe fazer
  isso é `@compartilhado/agente/compilador.ts` — o mesmo módulo que
  `agent-publish` usa, e por isso o hash bate. `src/sarah/servico-supabase.ts`
  o chama depois de gravar. A dedução "salvei, logo está desatualizado" erra
  nos dois sentidos: acusa mudança de quem regravou o mesmo texto e cala sobre
  mudança vinda de outra tela.
- **Marcador da primeira fala sai de `@compartilhado/agente/primeira-fala.ts`.**
  A lista que a tela mostra ao lado do campo, a que a recusa cita e a que a
  amostra de voz interpola são a mesma; uma segunda lista escrita na interface
  recusaria variável que existe no primeiro marcador novo do compilador. As
  explicações em português ficam em `src/copy/sarah.ts`, cruzadas com a lista
  pela chave, e o teste da tela cobra que nenhuma fique muda.
- **Controle que dispara pedido pago espera o cursor parar e só aceita a última
  resposta.** Em `/sarah/voz`, cada mexida no ajuste é uma síntese: o pedido sai
  de um `useEffect` com `setTimeout` curto sobre o estado do pedido (o lint
  aceita `setState` dentro do callback do temporizador) e um contador em `useRef`
  descarta a resposta que chega fora de ordem. No teste, `waitFor` cobre a espera.
- **Duas publicações, e a tela nomeia as duas.** Publicar um playbook é
  promover o rascunho salvo em `playbook_versions` (com `change_note`) e, em
  seguida, chamar `agent-publish`. O hash de RF-311 só compila versões
  `published`, então salvar rascunho **não** muda o estado de publicação: o
  rascunho pendente é dito à parte ("há um rascunho salvo na versão 3"). Publicar
  só acende sem nada por salvar, para o que vai ao ar ser sempre uma versão que
  o histórico mostra.
- **O quarto estado do indicador (R-06) vem de fora do banco.**
  `IndicadorPublicacao` desenha os três de RF-311 mais
  `alterado_fora_da_plataforma`, que sai de `foraDaPlataforma` na resposta de
  `integrations-status`. Quem decide é `estadoDoIndicador`, em
  `src/sarah/playbooks.ts`: divergência do provedor vence o hash.
- **Releitura de fundo não pode desmontar a tela.** Usar `isFetching` como
  "esperando" faz a volta de foco à aba trocar a tela pelo esqueleto e apagar o
  `useState` de baixo; a espera do refazer só vale quando o estado anterior não
  tinha nada a perder (`indisponivel`, por exemplo).
- **Escrita que muda o que um serviço externo diz termina consultando de novo.**
  Salvar a chave e parar deixaria o cartão mostrando o estado da chave velha;
  `salvar` grava e já chama `testar` daquele provedor. O resultado sobrepõe só
  a linha daquele cartão, sem refazer a carga da tela inteira.
- **Contrato de borda que ainda não existe nesta branch mora no `tipos.ts` da
  tela.** `phone-register` é da frente de borda (US-065, ralph/f2-borda); a
  resposta que `/numeros` lê é `RespostaDoRegistro`, em `src/numeros/tipos.ts`,
  e o dublê não finge rodar a borda. No merge, a função honra esse formato ou
  a tela passa a importá-lo por alias, como `@publicacao/`.
- **Espera que só a borda conhece se pergunta ao abrir, não no clique.** O
  cartão do calendário (`src/especialistas/cartao-do-calendario.tsx`) chama
  `calendar-connect`, que não grava nada, por `useQuery` com `enabled` quando
  não há vínculo: "aguardando aprovação do Google" aparece como estado do
  passo antes de alguém tentar. O clique pergunta de novo (o `state` do
  endereço vence), e a leitura do estado é pura (`src/especialistas/calendario.ts`),
  lendo `sync_error` de volta pelo dicionário `MENSAGENS_DO_CALENDARIO`.
  Tempo desde uma leitura é `formatarRelativo(iso, agora)`, de `utilidades/datas.ts`.
- **Estado que dura dias sai da linha, não da resposta.** "Aguardando aprovação
  da operadora" (P-04) é `provider_number_id` nulo em linha ligada
  (`estadoDaLinha`, em `src/numeros/linhas.ts`): a aba que cadastrou fecha muito
  antes de a operadora responder. A resposta do registro só acrescenta o aviso
  daquela aba, e o `nao_registrada` dela oferece registrar de novo.
- **O freio e o aviso de discagem pausada moram na casca**
  (`src/componentes/freio-de-emergencia.tsx`), e o discador lê o mesmo estado
  pela mesma chave (`CHAVE_DA_OPERACAO`, em `src/chamadas/operacao.ts`). Quem
  puxa o freio invalida a chave, e o discador passa a recusar antes de chamar
  o servidor sem estado nenhum passando entre os dois. O dublê padrão de
  chamadas nasce com o freio solto, e por isso o aviso não aparece em teste
  alheio; o botão do freio aparece em toda tela montada.
- **Assinatura em tempo real é loja fora do React** (`criarLojaAoVivo`, em
  `src/chamadas/ao-vivo.ts`), lida por `useSyncExternalStore`: abre com o
  primeiro ouvinte e fecha com o último. O `select` de `call_live` sai de
  `COLUNAS_DE_CALL_LIVE`, cobrado por conjunto exato — a transcrição nunca
  trafega pela assinatura (R-08).
- **O portão em `/config/discagem` é desenho do que o servidor diz.**
  `EstadoDoPortao` lê `servico.portao()` (`estado_do_portao`) e não chama
  `faltaParaAbrir`: as duas condições aparecem separadas, cada uma com o
  caminho, e a lista do que falta é a do servidor. Código que o serviço não
  conhece vira falha, nunca "liberado". Quem não administra vê a negativa da
  política e, abaixo, o portão e a lista de teste em leitura
  (`NumerosDeTeste podeEditar={false}`).
- **Recusa da guarda chega pronta de `call-place`**, com `mensagem` e
  `alternativa` de `_shared/discagem/guarda.ts`. O dublê de chamadas decide
  por `guardarDiscagem` com uma porta em memória (freio, portão, bloqueio,
  janela), para a frase que a tela mostra ser a do sistema.
- **Assinatura que só avisa não precisa de loja.** Quando a linha inteira já é o
  que todo membro lê (`exception_items`), o serviço expõe `assinar(aoMudar)` e a
  tela faz `useEffect(() => servico.assinar(() => invalidateQueries(...)))`:
  sem `setState`, o lint aceita, e a carga de sempre refaz a lista sob a RLS. A
  loja de `ao-vivo.ts` fica para quando o evento carrega o estado. O dublê
  guarda os ouvintes e o teste os aciona à mão (`chegar`, em `/fila`).
  Recarga por intervalo quando o tempo real cai: `assinar(aoMudar,
  aoTrocarEstado)` repassa o status do `subscribe` e a tela põe
  `refetchInterval: intervaloDaRecarga(estado)`; `setState` passado direto
  como callback também passa no lint. O dublê o aciona por `sinalizar`.
- **Gênero da fila é lido como tipo de RF-909.** `exception_items.kind` ainda
  recebe os nomes da F3 (`human_requested`, `dnc_requested`,
  `repeated_failure`); `tipoDoGenero`, em `fila/leitura.ts`, os traduz por
  `SINONIMOS_DA_F3`. Gênero novo no check do banco precisa entrar em `TIPOS`
  (`fila/tipos.ts`), em `TIPO_DO_ITEM` e em `SEM_LIMIAR` (`copy/fila.ts`) e em
  `acaoDoItem` (`fila/consulta.ts`), senão a linha some da tela sem erro.
- **"Sai da lista na mesma ação" se prova com a releitura presa.** O dublê
  rápido demais faz a carga refeita esconder a falta da poda local; o da fila
  tem `segurarCargas()`, e o teste confere a ausência do item antes de soltar.
- **URL assinada nasce no clique.** O reprodutor de `/chamadas/:id` chama
  `pedirAudio` (`call-audio`, validade de cinco minutos) quando alguém toca, e
  o dublê conta os pedidos em `pedidosDeAudio`: é assim que "não pede no
  carregamento" vira asserção. Erro do `<audio>` (endereço vencido) volta ao
  botão para pedir outro.
  O componente é `ReprodutorDeGravacao` (`src/componentes/`), o mesmo na ficha e
  na fila; quem decide se ele aparece é `estadoDaGravacao`, de `chamadas/ficha.ts`.
- **Exclusão que uma fase futura vai precisar viaja no recorte, não na
  consulta.** `/chamadas` tira o ensaio (T-16) por `DIRECOES_DA_LISTA`, em
  `src/chamadas/consulta.ts`: o recorte carrega `direcoes`, a consulta do
  Supabase faz `.in('direction', recorte.direcoes)` e o dublê aplica o mesmo
  recorte por `aplicarRecorte`. Um `neq` escrito na consulta não teria teste
  nenhum, porque o dublê não roda o Supabase. No banco, a lista lê de
  `chamadas_reais` (US-099), a visão que é o filtro canônico do ensaio; a
  ficha continua lendo `calls` por id, porque o ensaio tem ficha.
- **`jsonb` sem forma fixa se parte em blocos, nunca se desenha cru.** O resumo
  de passagem da ficha da reunião passa por `blocosDoResumo`
  (`src/reunioes/resumo-de-passagem.ts`): chave conhecida em qualquer grafia
  ganha rótulo da copy, desconhecida vira "Chave como gente", e o que não se
  lê some. O teste da tela cobra a ausência de `{`, `[` e `"` na seção.
- **"Não encontrada" é uma só quando a RLS já esconde.** A ficha lê a visão por
  id e trata zero linha e id que nem é uuid (22P02) como `nao-encontrada`: a de
  outra conta, a inexistente e a de ensaio dão a mesma tela, para não virar
  oráculo de existência.
- **Propósito na tela é `SeloProposito`** (`src/componentes/selo-proposito.tsx`),
  um tom só para os quatro: os tons do `Selo` dizem estado, e propósito não é
  estado.
- **Configuração com motivo na trilha grava por RPC, nunca por `update`.**
  RF-008 pede autor e motivo, e o motivo só chega a `registrar_auditoria()`
  por `set_config('app.audit_reason')` na mesma transação — o cliente não tem
  como levantá-lo. `/config/discagem` manda só as colunas que mudaram
  (`mudancasDe`, em `src/discagem/politica.ts`) para
  `definir_politica_de_discagem`, e confirma o que mudou com o antes e o depois
  (`camposMudados`), em vez de só dizer "salvo".
- **Limite de terceiro que o banco não conhece é conferido na tela, com recuo
  escrito.** A simultaneidade recusa acima do menor entre sessões do provedor de
  voz e canais da telefonia, lidos de `integrations-status` pela mesma chave
  `['integracoes']` da tela de integrações; sem leitura, vale o check da coluna
  e a tela diz que não conferiu. Quem decide é `limiteDeSimultaneidade`, que
  também diz qual dos dois está mandando.
- **Todo campo de limite mora num `role="group"` com o nome dele, e a
  consequência de atingi-lo fica dentro do grupo.** O teste de
  `/config/discagem` varre `CAMPOS` e procura cada consequência no grupo do
  campo: campo novo entra na varredura sozinho.
- **Desligar a gravação é declarado; parar de gravar é medido.** `/config/privacidade`
  não diz "desligada" enquanto houver propósito no ar com a configuração
  anterior (L-18): a medição é `medirPublicacaoDaConta` (a mesma do estado de
  RF-311, exportada de `src/sarah/servico-supabase.ts`) lida por
  `propositosComGravacaoPendente`, de `@publicacao/publicacao.ts`, que é a régua
  de `agent-publish`. O botão de republicar chama `sarah.republicar()` e a tela
  refaz a carga. No teste, o dublê de privacidade tem `publicar()`, que o
  `republicar` da Sarah embrulhado chama.
- **Contagem que precisa estar na tela antes de salvar é `useQuery` com
  `enabled`**, com o valor do campo na chave (`/config/privacidade`, prazo
  menor): o número aparece enquanto se digita, sem efeito nem clique a mais.
- **Relógio lido no desenho reprova no lint** ("Cannot call impure function during render"). Quem só
  precisa do instante da montagem usa `useState(() => Date.now())`.
- **Número que a fase não entrega chega como objeto, não como zero.**
  `dashboard_summary` devolve `{codigo: 'indisponivel_nesta_fase', fatia}` para
  reunião e apuração; o tipo é `Campo<T>` (`src/painel/tipos.ts`) e quem decide
  o cartão é `lerCampo`, em `src/painel/cartoes.ts`: `valor`, `sem_base` (nulo,
  não houve de onde tirar) ou `indisponivel` (selo e a frase da fatia). Quando
  a fatia ligar o número, o valor chega no lugar do objeto e a tela não muda.
  O dublê do painel devolve o `jsonb` do RPC e passa por `lerResumo`, a leitura
  do serviço de verdade.
- **Escrita que muda ordem desenha a resposta do servidor, nunca a pedida.**
  `configurarEtapas` relê a configuração e a devolve; a tela a põe na cache com
  `setQueryData`, e recusa (posição duplicada) faz `refetch`, nunca desfaz um
  estado otimista. Toda escrita da configuração invalida `['funil']`, que é o
  prefixo da chave do quadro (`src/funil/configuracao-das-etapas.tsx`).
- **Rótulo de etapa se lê pela chave no dublê, como a junção faz.** O dublê de
  leads guarda as etapas como estado (`etapasGuardadas`) e resolve
  `lead.etapa` pela chave a cada carga do quadro: renomear uma etapa muda a
  coluna e o cartão sem tocar nos leads guardados.
- **Lista que mistura origens se ordena na tela, por uma função pura.** A ficha
  do lead recebe os eventos crus de `lead_events` e chama `montarLinhaDoTempo`
  (`src/leads/linha-do-tempo.ts`): `occurred_at` decrescente, depois `kind`,
  depois `id`. O dublê de leads devolve os eventos na ordem de chegada de
  propósito, para a falta da ordenação cair no teste de tela.
- **História se lê do evento, situação se lê da linha.** A mudança de etapa na
  linha do tempo diz o rótulo do `payload` (o de então); a etapa atual vem da
  junção com `pipeline_stages`. O dublê de leads grava o `payload` com o rótulo
  vigente no `moverDeEtapa`, então renomear depois muda a situação e não o
  item.
- **Trava de dado do banco se prova com o dublê aplicando a mesma trava.** A
  correção da classificação (`/chamadas/:id`) não se defende na tela: quem a
  mantém é `proteger_classificacao_corrigida`. O dublê de chamadas guarda as
  fichas como estado, `retaguarda(id, mudanca)` passa a escrita posterior por
  `aplicarTravaDaCorrecao` (espelho do gatilho), e o teste remonta a tela com
  o mesmo dublê para ter uma "carga posterior". O teste gêmeo sem correção
  prova que a retaguarda chega — senão a trava não estaria medindo nada.
- **Seção nova de `/config/conta` mora no próprio arquivo.** A tela é
  estendida por mais de uma frente (limiares da fila na F4, roteamento na F5,
  canal de WhatsApp na F6): cada seção é um componente em `src/conta/` com
  serviço em arquivo à parte (`limiares-da-fila.tsx`, `limiares-supabase.ts`),
  e `config-conta.tsx` e `servico-supabase.ts` ganham só uma linha cada. É o
  que deixa o merge com conflito de poucas linhas. A copy dos limiares é
  `copy/config-conta.ts`; a da zona de perigo continua em `copy/conta.ts`. O
  canal de WhatsApp foge um pouco do padrão: o serviço é o de
  `src/whatsapp/` (o mesmo que `/conversas` e a ficha do lead usam), e não um
  arquivo próprio em `src/conta/`, porque o canal é lido em mais de uma tela.
- **Retrato do servidor sem formato fixado se lê com recusa para o silêncio.**
  `leituraDaSaude` só devolve número quando o `health` casa com o formato
  esperado e a janela está cheia; o resto é "ainda sem histórico". Zero
  inventado é pior do que nenhum número.

## Checklist da configuração inicial

- **A barra lateral recebe o checklist por prop** (`checklist?: ReactNode`), e
  quem o monta é a casca. A barra continua testável sem provedor nem roteador.
- **`ChecklistDeConfiguracao` devolve `null`** quando a carga falha, quando não
  há passo e quando a configuração terminou. Aviso de erro fixo na navegação
  seguiria o operador por todas as telas sem nada a fazer a respeito.
- **A tela e o checklist compartilham a chave de consulta**
  (`['configuracao-inicial']`): o `refetch()` de um atualiza o outro, sem
  estado passando entre eles.
- **O passo embute a tela, não uma cópia dela.** `FormularioDoPasso`
  (`src/configuracao-inicial/formulario-do-passo.tsx`) monta o componente da
  rota com `dentroDoAssistente`, e a tela repassa `embutida` à
  `AreaDeTrabalho`, que tira `h1`, frase de apoio e `main` e mantém as ações.
  Tela nova que um passo embute recebe `PropsDeTelaEmbutivel`, esconde o link
  que aponta de volta para `/configuracao-inicial` e não lê a rota com
  `useSearch({ from })` (fora da rota dela isso levanta erro: use
  `strict: false`). Qual tela vai em qual passo é `telasDoPasso`.
- **O assistente sabe que a tela gravou pelo serviço, não pela tela.**
  `FormularioDoPasso` devolve à árvore os serviços do contexto embrulhados por
  `remedirDepoisDeGravar` (`Proxy`), que invalida `['configuracao-inicial']`
  depois de todo método fora de `LEITURAS`. Método novo de serviço que só lê
  entra em `LEITURAS`; esquecer custa uma medição à toa, e não o contrário.
- **O tutorial é um só: o assistente de abertura** (`assistente-de-inicio.tsx`).
  As etapas estão em `ETAPAS_DO_INICIO` (`inicio.ts`), das conexões ao fecho,
  e ele abre na primeira que falta por `etapaInicial(conexoes, medicao)`: as
  conexões vêm dos serviços, o resto de `medicaoDaConfiguracao`, a mesma
  medição do banco do checklist. Etapa nova entra nas duas listas e ganha
  frase de "por que" antes do formulário. As etapas depois do resumo
  (publicar, número, primeira ligação, pronto) moram em `etapas-finais.tsx` e
  embutem a tela de verdade (`FormularioDoPasso`, `Ligacao`).
- **A primeira pergunta é o nome da assistente** (etapa `nome`, logo depois
  das boas-vindas). Grava por `sarah.salvarNome`, que faz `upsert` em `agents`
  só com `name`: a linha nasce sem empresa, e o passo `agente` do catálogo só
  resolve com `company_name` preenchido. Por isso o nome não vem de
  `onboarding_health`: `medicaoDaConfiguracao(configuracao, nomeGravado)` lê o
  nome da identidade gravada. Sem nome, `etapaInicial` abre em `nome`.
- **A assistente não tem nome de fábrica, e a interface não diz "Sarah".** O
  produto é `NOME_DO_PRODUTO` (`@compartilhado/marca.ts`, o mesmo das bordas);
  a assistente é o nome que a conta escolheu, lido por `useNomeDaAssistente()`
  (`src/sarah/nome-da-assistente.ts`, chave `['sarah-identidade']`), e antes
  dele "a assistente" (`nomeOuAssistente`, em `src/copy/assistente.ts`). Copy
  que cita o nome é função dele: `textosDoInicio(nome)`, `textosDoEnsaio(nome)`,
  `identidadeDaSarah.explicacao(nome)`; o objeto sem nome (`inicio`, `ensaio`)
  continua exportado para quem não o cita. `testes/estatica/marca.test.ts`
  varre os literais de `src/copy/` e das `respostas.ts` das bordas.
- **Fechar o tutorial grava a dispensa, e o painel a respeita na mesma
  carga.** `visita.ts` guarda em memória que o tutorial apareceu; o painel só
  reabre um tutorial dispensado numa carga nova (recarregar, outro login).
  `montarAplicacao` zera a marca, porque cada montagem de teste é uma carga.
- **A primeira ligação de teste é passo da interface, não do catálogo.**
  `completed_steps` e `current_step` só aceitam passo de
  `passos_de_configuracao`, então a ligação se declara em
  `onboarding_state.test_call_id` (`ligacaoDeTeste` no progresso). Campo novo
  no progresso declarado entra em `progressoAtual`, senão todo botão o apaga
  ao gravar.
- **Dublê de configuração mede por função.** `medir` em
  `RespostasDaConfiguracao` é lido a cada carga, e é como o teste diz "com um
  especialista gravado, o passo resolve"; `cargas` conta as medições.

## Autenticação

O contrato está em `src/autenticacao/tipos.ts` (`ServicoDeAutenticacao`); a
implementação sobre o Supabase, em `servico-supabase.ts`; o dublê de teste, em
`src/testes/servico-dublado.ts`. **A interface fala com o contrato, nunca com
o cliente do Supabase.**

- **`useAutenticacao()`** (de `src/autenticacao/contexto.ts`) devolve
  `{ servico, sessao }`. A árvore precisa estar dentro de
  `ProvedorDeAutenticacao`, que lê a sessão por `useSyncExternalStore`: quem
  guarda o estado é o serviço, fora do React.
- **`react-hooks/set-state-in-effect` é erro, não aviso.** Sincronizar estado
  externo por `useEffect` + `setState` derruba o lint. O caminho é
  `useSyncExternalStore`, com `assinar` e `ler` memorizados.
- **`main.tsx` não pode declarar componente**: `react-refresh` exige que todo
  arquivo com componente exporte alguma coisa. Componente de topo mora em
  `src/aplicacao.tsx`.
- **Sessão que muda precisa de `roteador.invalidate()`**, senão o `beforeLoad`
  da camada protegida não reavalia e a expiração só aparece ao recarregar. É o
  que `Aplicacao` faz.
- **Conta inexistente e senha errada são o mesmo erro para o GoTrue.** Quem os
  separa é `servico.entrar`, chamando o RPC `email_registrado` só quando o
  código é `invalid_credentials`. A tradução de código para motivo é pura e
  está em `src/autenticacao/falhas.ts`.
- **Texto de erro nunca nasce no componente**: motivo é um valor de
  `MotivoDeFalhaDe*`, e a frase sai de `src/copy/autenticacao.ts`.

## Testes de componente

`@testing-library/react` com `environment: 'jsdom'` (já configurado em
`vite.config.ts`). Chame `afterEach(cleanup)` em todo arquivo de teste que
renderiza, senão a montagem anterior vaza para o teste seguinte.

- **Tela com rota monta a aplicação inteira**: `montarAplicacao(servico,
  caminho)`, de `src/testes/montar-aplicacao.tsx`, sobe o roteador de verdade
  sobre histórico em memória e devolve `{ roteador, ...render }`. É o que
  permite provar guarda de rota e navegação sem navegador. Componente que não
  depende do roteador continua sendo renderizado direto.
- **`montarAplicacao` monta todos os provedores e um `QueryClient` novo** a
  cada chamada, sem repetição de consulta. Cada serviço entra como parâmetro
  posicional depois do caminho (equipe, auditoria), sempre com dublê padrão:
  teste que não mexe naquele assunto passa `undefined` e segue (hoje: equipe,
  auditoria, integrações, configuração inicial, leads, Sarah, números, chamadas, discagem, bloqueios, privacidade, especialistas, ensaio, fila, conta, diagnóstico, painel, reuniões, whatsapp). Provedor novo se
  liga em dois lugares: aqui e em `main.tsx`. A lista é posicional e cresce no
  fim: serviço novo no meio troca em silêncio os dublês de todo teste que já
  passa `undefined`.
- **Troca de filtro passa por uma espera.** Chave de consulta nova volta a
  `isPending` e a tabela some enquanto a resposta não chega: a asserção depois
  de mexer num seletor precisa de `waitFor` sobre as linhas, não só sobre o
  recorte pedido.
- **O dublê padrão de um serviço que desenha algo na casca precisa nascer em
  silêncio.** O de configuração inicial devolve conta pronta, e por isso o
  checklist não aparece na barra lateral de nenhum teste alheio. Um padrão
  falante acrescentaria texto e `role="region"` a toda tela montada, e
  quebraria asserção de outra história.
- **Dublê de tela que fala com uma função de borda chama a borda de verdade.**
  O de leads atende `preverImportacao`/`importar` passando o pedido por
  `atenderImportacao` (o mesmo código que a função roda) com a camada de dados
  em memória: o que o dublê substitui é a rede, e só ela. Uma prévia escrita à
  mão casaria com a tela por construção, e os números do critério de aceite
  deixariam de provar alguma coisa.
- **Cenário grande de teste é gerador compartilhado, não arquivo de apoio.** A
  planilha de mil linhas vem de `@importacao/planilha-de-exemplo.ts`, o mesmo
  módulo que o teste da borda usa; ele mora fora de qualquer `*.test.ts` porque
  importar um arquivo de teste a partir de outro registra a suíte inteira dele
  dentro da que importou.
- **Dublê que filtra filtra de verdade.** Quando o serviço recorta dado
  (auditoria), o dublê aplica o mesmo recorte em memória, reusando o módulo
  puro do contrato. Assim o teste prova as duas coisas de uma vez: que a tela
  pediu o filtro certo e que a lista encolheu.
- **Dado de exemplo com data se ancora no relógio**, não em data fixa: um
  filtro de período com instantes fixos passa hoje e falha no mês que vem.
- **Os auxiliares de teste ficam em `src/testes/`** e não são importados por
  `main.tsx`, então não entram no pacote.
- Sem `@testing-library/user-event` na base: use `fireEvent`.
- **Arrastar e soltar se prova em jsdom pelo estado da tela.** jsdom não tem
  `DataTransfer`, e `fireEvent.dragStart` chega com `dataTransfer` nulo: o item
  arrastado mora num `useState` da tela, o `drop` lê dali, e o
  `dataTransfer?.setData` fica só para o navegador aceitar o arrasto. Todo
  arrastar tem um caminho de teclado que chama a mesma função (RNF-15), e é
  esse o teste principal (`/funil`).
- **Sem `@testing-library/jest-dom` na base.** `toBeDisabled`, `toHaveValue` e
  companhia caem com "Invalid Chai property" — e o erro aparece em todo teste do
  arquivo, o que faz parecer quebra de outra coisa. Meça a propriedade:
  `campo.disabled`, `(campo as HTMLInputElement).value`.
- **O que só o serviço do Supabase decide se prova com cliente gravador.** O
  dublê de tela não roda o `servico-supabase.ts`, então "remover é `update`,
  nunca `delete`" não tem como cair num teste de tela. `bloqueios/servico-supabase.test.ts`
  passa um cliente feito de `Proxy` que aceita qualquer cadeia, registra cada
  método com os argumentos e responde pela tabela e pelo método que abriu a
  cadeia. As colunas da escrita saem de função pura (`remocaoDoBloqueio`) que o
  dublê também aplica, para os dois lados gravarem o mesmo objeto.
- **Campo de dublê novo quebra `toEqual` alheio.** Acrescentar uma chave ao que
  um dublê guarda (`eventos` ganhou `actor`) derruba toda asserção de igualdade
  profunda sobre ele. Rode `npm run check` inteiro, não só o teste da história.
- **Relógio falso entra antes do que agenda o temporizador.** Temporizador
  agendado no relógio real não anda com `vi.advanceTimersByTime`: o teste "a
  recusa continua lá dez minutos depois" passava com a recusa programada para
  sumir. Instale `vi.useFakeTimers({ shouldAdvanceTime: true })` no começo do
  teste (as esperas do Testing Library continuam andando) e devolva o relógio
  real no `afterEach`.
- **Grupo com o nome do campo torna `getByLabelText` ambíguo.** Quando o
  `role="group"` de um limiar leva o mesmo `aria-label` do rótulo do campo
  (`/config/conta`), `getByLabelText` acha os dois e cai
  com "Found multiple elements". Ache o campo por
  `getByRole('textbox', { name })`.
- **Moeda do `Intl` vem com espaço não quebrável, e o `getByText` não
  normaliza o texto que você passa.** "Em uso: R$ 50,00" escrito com espaço
  comum não casa; use expressão regular com `\s`.
- **Dois textos de interface iguais quebram `getByText`.** Ao escrever copy
  nova, confira que a explicação de um campo e a mensagem de erro dele não são
  a mesma frase.
- **Nome de ferramenta em linguagem humana sai de `src/copy/ferramentas.ts`.**
  É a tabela única da ficha da chamada e do ensaio; tela nova que mostra
  `call_tool_invocations.tool` importa `nomeDaFerramenta` em vez de montar a
  própria. E a ordem das invocações é a de `at` (`emOrdemDoInstante`), nunca a
  de chegada: as de sistema só são gravadas na finalização.
- **Permissão do navegador fica atrás de contrato e se pede antes do pedido
  pago.** O microfone do ensaio é `MicrofoneDoEnsaio` (`src/ensaio/voz.ts`),
  entregue por prop como o condutor; a implementação recebe a `mediaDevices`
  por parâmetro e roda em jsdom com dublê. A tela só chama `rehearsal-session`
  depois do microfone liberado, e a negativa é estado de tela (`avancarVoz`),
  não erro.
- **Leitura repetida durante uma conversa guarda só a mais nova.** Contador em
  `useRef`, incrementado a cada pedido e conferido na volta; resposta atrasada
  de uma leitura velha desenharia lista antiga por cima (`sarah-ensaio.tsx`).

## Verificação no navegador

`npm run dev` na raiz e abra `http://localhost:5173`. A regra é console limpo:
qualquer erro, inclusive 404 de recurso estático, conta como falha.
