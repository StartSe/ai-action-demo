# Padrão de interface: Sarah Voice SDR

Extraído do projeto de design "Ferramenta de trabalho densa". Este documento é a
referência de layout para a implementação, com as regras de texto que valem
sobre ela.

Fonte: projeto `a085d611-866d-4206-be18-c9c981956aa6`, arquivo
`Sarah Voice SDR.dc.html`. 23 telas, sendo 8 desenhadas com variantes de estado
e 15 em nível de estrutura.

A linguagem visual (tokens, forma, movimento) é o design system "Sarah SDR,
Crimson + Mint", que substituiu a da suíte "IA para Executivos". O que veio de
lá, o que foi ajustado e o que ficou de fora está na seção 6, que é onde se
consulta antes de mudar qualquer coisa de cor, forma ou estrutura.

---

## 1. Natureza do produto na tela

Ferramenta de trabalho densa. Muita informação por tela, pouco espaço morto. O
Operador passa o dia aqui e precisa ver sem abrir.

Corpo em 15px com entrelinha 1,55. Rótulos e metadados entre 11px e 13px, que
é onde a densidade do produto sobrevive: tabela, barra lateral e checklist.
Título de tela em 28px, título de cartão em 17px, os dois em peso alto e
espaçamento negativo, como no design system (seção 6). Nenhuma versalete e nenhum rótulo em caixa alta
forçada por CSS: as siglas de trilha estão escritas em maiúscula no próprio
texto.

---

## 2. Tokens

### Cor

Tema escuro. Os valores são os do design system Crimson + Mint (seção 6). A
tabela é a fonte de verdade e está espelhada em `app/src/estilos.css`, onde o
cabeçalho registra a conferência de contraste.

| Papel | Token | Valor |
|---|---|---|
| Fundo da aplicação | `--fundo-app` | `#081314` |
| Superfície de cartão | `--superficie-cartao` | `#102728` |
| Superfície 2 (hover, bloco de apoio) | `--superficie-2`, `--superficie-secundaria` | `#153334` |
| Superfície 3 | `--superficie-3` | `#1B3D3D` |
| Superfície funda (campo, cabeçalho de tabela, filtros) | `--superficie-funda` | `#0B2021` |
| Borda | `--borda` | `#235151` |
| Borda suave (cartão, divisória) | `--borda-suave` | `#235151` a 55% |
| Borda de controle (campo, seletor) | `--borda-controle` | `#3F7A77` |
| Texto principal | `--texto-principal` | `#FFF7F7` |
| Texto secundário | `--texto-secundario` | `#D9E4E2` |
| Texto de apoio | `--texto-apoio` | `#B2C6C4` |
| Texto de apoio claro | `--texto-apoio-claro` | `#8AA6A4` |
| Texto desativado | `--texto-desativado` | `#789493` |
| Carmim, acento e ação | `--carmim`, `--acento` | `#FF4B55` |
| Carmim claro e escuro | `--carmim-2`, `--carmim-3` | `#FF7580`, `#BF2630` |
| Acento em repouso e em tinta | `--acento-repouso`, `--acento-tinta` | carmim a 12%, `#FF9399` |
| Texto sobre o carmim | `--texto-sobre-acento` | `#220A0C` |
| Menta | `--menta`, `--menta-2`, `--menta-3` | `#10B981`, `#34D399`, `#047857` |
| Positivo | `--positivo` | `#34D399` sobre menta a 10% |
| Atenção | `--atencao` | `#F7C948` sobre âmbar a 8% |
| Perigo | `--perigo` | `#FF8C93` sobre carmim a 8% |
| Informação | `--informacao` | `#55D9D2` sobre ciano a 8% |

Carmim é ação e intervenção: o botão principal, o item ativo, o que pede a mão
do operador. Menta é progresso, conexão e sucesso: o selo positivo, o foco do
campo, o link, o que confirma. Uma tela tem um carmim cheio, e o menta não
compete com ele. Atenção e perigo continuam dois papéis distintos: bloqueio que
tem saída é âmbar, falha do servidor é carmim claro.

### Tipografia

Corpo em Inter (400 a 900), por `<link>` do Google Fonts em `app/index.html`.
`JetBrains Mono` para todo dado que se lê como valor: número de telefone,
duração, custo, nota da avaliação, identificador de linha, horário. A separação
é semântica, e não decorativa, e se aplica pela classe `.val`.

### Forma e espaçamento

Raio de 14px em cartões e painéis, 10px em controles, 18px em diálogos, pílula
em selos (`--raio-cartao`, `--raio-controle`, `--raio-grande`, `--raio-selo`).
Espaçamento em múltiplos de 4. Sombra de cartão preta e longa
(`--sombra-cartao`), que no escuro separa sem clarear; `--sombra-media` e
`--sombra-alta` para o que flutua.

### Estrutura

Barra lateral fixa de 250px, 220px abaixo de 1100px e 78px, só com ícones,
abaixo de 1024px. Trilha de navegação em três níveis: OPERAÇÃO, MÁQUINA,
ADMINISTRAÇÃO. Barra do topo translúcida dentro da coluna de conteúdo, com o
nome da tela aberta à esquerda e a conta à direita. Conteúdo em coluna única com
largura máxima de 1100px.

### Classes de estilo

As classes vivem em `app/src/estilos.css`, em `@layer components`, com nome em
português: `.cartao`, `.bloco-secundario`, `.campo`, `.campo-recusado`,
`.botao-primario`, `.botao-secundario`, `.botao-menta`, `.botao-fantasma`,
`.botao-perigo`, `.botao-link`, `.selo` com os tons `.selo-positivo`,
`.selo-atencao`, `.selo-perigo`, `.selo-informacao`, `.selo-acento` e
`.selo-neutro`, `.titulo-de-tela`, `.titulo-de-secao`, `.sobretitulo`,
`.tabela`, `.esqueleto`, `.veu`, `.caixa-de-dialogo`, `.cartao-de-escolha`,
`.rotulo-de-indicador`, `.valor-de-indicador`, `.coluna-de-quadro`,
`.cartao-de-quadro` e `.val`, e as de movimento: `.revelar`, `.surgir`,
`.pulsar`, `.trocar-frase`, `.sinal` e seus estados, `.onda-de-voz`,
`.pontos-pensando`, `.ao-vivo` e `.giro`. `.sem-impressao` some no papel. Estilo
novo que se repete vira classe ali, e não uma sequência de utilitárias do
Tailwind copiada entre telas.

---

## 3. Telas e estados

Oito telas com variantes desenhadas:

| Tela | Variantes |
|---|---|
| Painel | normal, conta nova, carregando, falha de provedor |
| Precisam de você | normal, fila limpa, sem permissão |
| Ficha do lead | normal, lead bloqueado |
| Ficha da chamada | normal, processando |
| Playbooks | alterações pendentes, publicada, roteiro inexistente |
| Campanhas | lista, prévia antes de disparar, execução ao vivo, nenhuma campanha |
| Cadências | construtor, acompanhamento, modelos prontos |
| Tela estreita | painel, fila e funil |

Quinze telas em nível de estrutura: funil, leads, importação, chamadas,
reuniões, ficha da reunião, identidade, voz, base de conhecimento, ensaio,
números, especialistas, configurações, configuração inicial, autenticação.

### Comportamento em tela estreita

A navegação vira quatro abas fixas: Painel, Fila, Funil e Leads. Máquina e
Administração não aparecem no celular. O Painel corta funil, qualidade e
gráficos longos, mantendo as duas perguntas, os alertas e as próximas reuniões.
Playbooks, Configurações e Campanhas abrem em leitura, com aviso de que a edição
é no computador.

---

## 4. Regras de texto sobre este layout

O design chegou com 380 textos de interface. A revisão de escrita se aplica a
eles do mesmo modo que se aplicou ao PRD, **com uma exceção que vale registrar
antes das regras**.

### Três registros distintos

| Registro | Onde aparece | Como escreve |
|---|---|---|
| **Interface** | Rótulos, botões, estados vazios, mensagens de bloqueio, títulos | Direto e declarativo. Sem travessão, sem negação retórica, sem fecho de efeito |
| **Anotação** | Texto que explica a tela para quem constrói | Igual ao da interface. É documentação, não ensaio |
| **Fala da Sarah** | Ensaio, transcrições, roteiros, frase de abertura, frases devolvidas pelas ferramentas | **Conversacional, e deve continuar assim.** É fala, não interface |

A distinção não é detalhe de estilo. Aplicar registro de especificação à fala da
Sarah produziria um agente que soa como um sistema, que é exatamente o defeito
que o produto precisa evitar. A fala que está no design já está certa:

> Fecho em dois. A gente ajuda transportadora a montar a escala de rota sem
> planilha. Hoje como vocês fazem?

> Preço quem monta é o especialista, depende do tamanho da frota. Eu não arrisco
> número para não te passar informação errada.

Isso é português falado de verdade, com contração, frase curta e uma razão dita
em voz alta. Fica como está, e serve de referência para toda fala nova.

### Correções a aplicar na implementação

**43 travessões** nos textos de interface. Cada um vira dois-pontos, vírgula,
ponto ou parênteses, conforme a frase. Exemplos:

| Design | Implementação |
|---|---|
| `Excluir — pede confirmação escrita` | `Excluir. Pede confirmação escrita` |
| `Telefone curto demais — 7 dígitos` | `Telefone curto demais: 7 dígitos` |
| `Duplicado — será atualizado` | `Duplicado: será atualizado` |
| `13h45 — ligação de lembrete` | `13h45, ligação de lembrete` |
| `SP rodízio — atenção` | `SP rodízio: atenção` |
| `Recusou dar preço — regra travada` | `Recusou dar preço (regra travada)` |
| `Chave salva nunca é exibida de novo — só substituída` | `Chave salva não é exibida de novo, apenas substituída` |
| `Bloqueou +55 11 97730-5512 — pedido do lead` | `Bloqueou +55 11 97730-5512, a pedido do lead` |

**9 negações retóricas.** A construção afirma pela negativa de algo que ninguém
disse. Mantêm-se as que corrigem uma crença real do operador, porque ali a
negativa é o conteúdo:

| Design | Decisão |
|---|---|
| `Sempre no horário do lead, não no seu` | **Mantém.** Corrige a suposição natural de quem configura |
| `taxa de atendimento caindo é sinal de bloqueio pela operadora, não de desinteresse` | **Mantém.** Corrige a leitura errada que o operador faria sozinho |
| `Busca sem resultado: sugere limpar filtro, não devolve tela branca` | Reescreve: `Busca sem resultado sugere limpar o filtro` |
| `A campanha usa o conjunto, não um número só` | Reescreve: `A campanha usa o conjunto de números` |
| `Uma frase, não um slogan` | Reescreve: `Uma frase que diz o que o produto faz` |
| `Cada campo tem um exemplo real ao lado, não um texto de ajuda genérico` | Reescreve: `Cada campo traz um exemplo real ao lado` |
| `Chave inválida mostra o erro do provedor traduzido, não o código` | Reescreve: `Chave inválida mostra o erro do provedor traduzido` |
| `Insistir depois do pedido é infração, não persistência` | Reescreve: `Insistir depois do pedido é infração` |
| `Página em branco é o que faz o administrador desistir` | Corta. É fecho de efeito, e a frase anterior já diz o necessário |

**1 par de aspas curvas** no resultado de busca em transcrição. Vira aspas retas.

**Aforismos de anotação.** Três frases explicam com moldura em vez de fato, e a
implementação usa a versão direta:

| Design | Implementação |
|---|---|
| `é o que transforma histórico em inteligência comercial — fica no topo, com peso de tela` | `Fica no topo, com peso de tela` |
| `Comparecimento é o que separa reunião marcada de reunião que virou receita` | `Reunião marcada só vira receita quando o lead comparece` |
| `Ligação que não diz quem é vira reclamação` | `Ligação sem identificação gera reclamação` |

### Regra permanente

Todo texto novo de interface nasce sem travessão, sem aspas curvas, sem fecho de
efeito e sem negação que invente um interlocutor. Toda fala nova da Sarah nasce
falada: frase curta, contração natural, e a razão dita quando ela existe.

---

## 5. O que o design resolveu e que a implementação preserva

Três decisões do design que não são de estilo e precisam sobreviver ao código:

**O selo de propósito é estrutural.** Descoberta, Lembrete, Resgate e Retomada
aparecem em toda linha de chamada, em todo filtro e em toda cadência. É a
espinha do produto na tela.

**Todo bloqueio traz motivo e saída.** O design escreve o motivo por extenso e
oferece a alternativa: `Duas tentativas hoje, que é o limite da conta. Agendar
para amanhã ou aumentar o teto.` Nenhuma mensagem de recusa genérica.

**O cenário de demonstração é um só, e é concreto.** Vexo Tecnologia vendendo
roteirização para transportadoras de 20 a 200 veículos, lead Marcos Ferreira da
Fluxo Cargo, especialista Marina Alcântara. Manter esse cenário em toda tela de
exemplo, em vez de dados aleatórios, é o que torna o produto compreensível em
uma passada. A implementação usa os mesmos nomes nos dados de demonstração.

---

## 6. O design system Crimson + Mint

A linguagem visual vem do design system "Sarah SDR, Crimson + Mint" (v9), um
arquivo HTML único com tokens em `:root` e doze seções: tokens e cores,
tipografia e espaçamento, avatares, botões e navegação, formulários, KPIs,
tabela e gráficos, o motion system do agente de IA, espera e processamento,
calendário, kanban, login e cadastro, diálogos e feedback, e o diálogo de
primeiros passos. Ele substituiu a linguagem da suíte "IA para Executivos", que
era clara e violeta. A estrutura de componentes herdada da suíte (`Painel`,
`AreaDeTrabalho`, `Selo`, `TabelaDensa` e os demais) ficou: mudou a pele, e o
esqueleto é o mesmo.

### Como os tokens foram trazidos

**Os nomes ficaram, os valores mudaram.** O app inteiro fala por utilitárias
com nome de papel (`bg-acento`, `text-texto-apoio`, `border-borda`). Trocar o
valor de `--acento` pelo carmim, em vez de criar `--crimson` e renomear as
telas, é o que faz o redesenho chegar a toda tela de uma vez. Cada token do
`estilos.css` diz de qual variável do design system veio (`--superficie-2` é o
`--surface-2`). O que o design system tem e o app não tinha entrou com nome em
português: `--carmim`, `--menta`, `--superficie-2`, `--superficie-3`,
`--informacao`.

**Os quatro fundos afundados viraram um.** O design system usa `#0A1B1C`,
`#0A1C1D`, `#0B1D1E` e `#0B2021` para campo, cabeçalho de tabela, faixa de abas
e data. A diferença não se vê, e quatro tokens para ela seriam quatro escolhas a
fazer em cada tela nova. Ficou `--superficie-funda`, `#0B2021`.

**O acento deixou de ser calculado.** A regra da suíte derivava três tons do
acento por fórmula. O design system traz o carmim pronto com as duas variações,
e são elas que entraram. A conferência que continua obrigatória é a de
contraste, no cabeçalho do `estilos.css`.

### Contraste

| Par | Contraste |
|---|---|
| Texto principal `#FFF7F7` sobre o fundo `#081314` | 17,87:1 |
| Texto principal sobre a superfície `#102728` | 14,82:1 |
| Texto de apoio `#B2C6C4` sobre a superfície | 8,76:1 |
| Apoio claro `#8AA6A4` sobre a superfície 2 | 5,19:1 |
| Branco sobre o carmim `#FF4B55` | 3,29:1, reprova |
| Tinta `#220A0C` sobre o carmim | 5,72:1 |
| Carmim sobre a superfície | 4,76:1 |
| Menta `#10B981` sobre o fundo | 7,43:1 |
| Menta 2 `#34D399` sobre a superfície | 8,13:1 |
| Perigo `#FF8C93` sobre o fundo de perigo | 6,55:1 |
| Borda de controle `#3F7A77` sobre o campo | 3,43:1 (componente, 3:1) |

### O que foi adotado

**O tema escuro inteiro**, com o fundo explícito no `body` e os dois brilhos do
design system nos cantos de cima, carmim à esquerda e menta à direita.
`color-scheme: dark` faz o seletor nativo, a barra de rolagem e o calendário do
navegador acompanharem.

**Carmim para ação, menta para progresso**, como o design system declara na
abertura. Botão principal carmim; botão de confirmação (`.botao-menta`), link,
foco de campo e selo positivo em menta; botão destrutivo tingido de carmim, e
não cheio, para não se confundir com a ação principal.

**A forma**: raios de 8 a 24px, botão que sobe um pixel no hover e volta no
clique, foco visível em todo controle, selo com a borda do próprio tom, tabela
com cabeçalho afundado e raio na moldura.

**A barra lateral responsiva**, com os ícones de traço do design system.

**O login da seção 11**: moldura única com o painel visual (marca, sinal da IA,
promessa sobre a grade) e o formulário ao lado, para entrada, recuperação de
senha e convite.

**Diálogo e véu da seção 12**: cabeçalho, corpo e rodapé separados por linha,
sobre um véu escuro com desfoque.

**O motion system da seção 07**, como a classe `.sinal` e seus quatro estados
(`-discando`, `-ouvindo`, `-falando`, `-processando`), mais a onda de voz, os
pontos, o indicador de ao vivo e o giro. Tudo desliga com
`prefers-reduced-motion`, inclusive o hover que sobe o botão.

**As classes do quadro, do indicador e da escolha**, para o funil, o painel e o
assistente de abertura usarem a mesma peça.

### O que foi ajustado, e por quê

**Texto sobre o carmim é escuro.** O design system já faz assim, e a
conferência confirma: branco sobre `#FF4B55` fica em 3,29:1.

**A borda de campo é mais forte que a linha.** A linha `#235151` fica em 1,76:1
contra a superfície, e o campo some. Campo, seletor e caixa de marcar usam
`#3F7A77`; cartão e divisória continuam na linha, porque são decoração.

**O texto de apoio claro é novo.** O `--muted-2` do design system (`#789493`)
fica em 4,15:1 sobre a superfície 2. Ele continua como texto desativado, e o
sobretítulo e o cabeçalho de tabela usam `#8AA6A4`.

**O foco é menta no campo e carmim claro no botão.** O design system pede foco
menta no campo porque carmim, ali, é recusa. No botão o contorno acompanha a cor
do próprio botão.

**A escala de texto é a do produto.** O design system é uma vitrine com texto de
8 a 12px. Aqui o corpo fica em 15px e o menor rótulo em 10,5px: quem usa este
produto passa o dia nele.

**Sem caixa alta por CSS.** O design system põe `text-transform: uppercase` em
título de trilha, cabeçalho de tabela e sobretítulo. A regra da seção 1
continua: a sigla da trilha está escrita em maiúscula no próprio texto.

### O que ficou de fora, e por quê

**Os avatares (Boring Avatars).** O produto não mostra pessoa com imagem, e a
biblioteca seria dependência nova para desenhar iniciais. A conta na barra do
topo continua com as iniciais.

**O calendário e o seletor de data.** Não há tela de agenda nesta fase; o campo
de data que existe é o do navegador, que já acompanha o tema escuro.

**O quadro arrastável.** O funil mostra etapas, e mudar lead de etapa não é ação
daquela tela. As classes do quadro existem para o desenho; o arraste ficou de
fora.

**Os gráficos (área, rosca, barras, radar).** O painel mostra números e listas.
Gráfico entra quando houver série histórica para desenhar.

**O violeta do diálogo de primeiros passos.** O design system usa `#A78BFA` só
ali. Um terceiro acento que aparece numa tela competiria com o carmim e o menta;
a barra de progresso do assistente usa o gradiente de menta para carmim.

**O menu em gaveta do celular.** Abaixo de 780px o design system esconde a barra
atrás de um botão. Isso pede estado e controle novo na barra do topo; por ora a
barra fica recolhida em 78px também no celular.

**Os números de prova no login** e o bloco de benchmark de custo. São dado de
vitrine, e numa tela sem sessão não há conta de onde medi-los.

**Toast e dropdown.** O produto confirma no lugar da ação e não tem menu
flutuante; quando tiver, a peça vem daqui.
