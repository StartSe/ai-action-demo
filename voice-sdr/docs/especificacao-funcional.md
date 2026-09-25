# Sarah Voice SDR — Especificação funcional

Documento único de referência para design e implementação. Descreve **o que a
aplicação faz**, tela por tela, e **qual o papel de cada ferramenta** — as que a
Sarah usa durante a ligação e as que sustentam o produto por baixo.

Layout, cor e tipografia ficam fora daqui de propósito. Aqui está o
comportamento: o que existe, o que cada coisa faz, o que o usuário vê em cada
estado.

---

## 1. O produto

A Sarah é uma SDR que trabalha por telefone. Ela liga para leads, conversa em
português, entende se há encaixe, consulta a agenda real de um especialista,
marca a reunião, lembra o lead 15 minutos antes, resgata quem não apareceu e
devolve tudo registrado — etapa do funil, resumo da dor, gravação e transcrição.

**A métrica que define sucesso: reuniões qualificadas agendadas, e quanto custa
cada uma.** Todo número do painel existe para explicar essas duas.

O operador humano não fica no telefone. Ele configura a Sarah, olha o funil e
atende a fila de exceções — os casos em que a Sarah, corretamente, não seguiu
sozinha.

---

## 2. Quem usa

| Papel | O que faz | O que não pode |
|---|---|---|
| **Dono** | Tudo, inclusive credenciais, cobrança e exclusão de dados | — |
| **Administrador** | Configura a Sarah, playbooks, campanhas, números, especialistas, equipe | Ver credenciais salvas, excluir a conta |
| **Operador** | Trabalha o funil, dispara ligações, resolve a fila, marca resultado de reunião | Mudar playbook, credenciais ou política de discagem |
| **Observador** | Lê painel, funil, chamadas e relatórios | Qualquer escrita |

A separação importa para o design: o Operador é quem passa o dia na aplicação e
precisa da menor fricção; o Administrador entra para configurar e sai.

---

## 3. Mapa da aplicação

```
Autenticação          entrar · criar conta por convite · recuperar senha

Configuração inicial  assistente de 8 passos + checklist persistente

Operação diária       Painel
                      Precisam de você      ← fila de exceções
                      Funil                 ← kanban
                      Leads                 ← lista + ficha do lead
                      Chamadas              ← histórico + gravação
                      Reuniões              ← agenda

Máquina               Sarah                 ← identidade, voz, playbooks, ensaio
                      Campanhas
                      Cadências
                      Números
                      Especialistas

Administração         Configurações         ← conta, integrações, discagem,
                                              bloqueios, privacidade, equipe,
                                              webhooks, auditoria
```

---

## 4. O eixo do produto: propósito da chamada

Nenhuma ligação é genérica. Toda chamada nasce com um **propósito**, e o
propósito decide três coisas: o roteiro que a Sarah segue, **quais ferramentas
ela tem permissão de usar** e como o resultado é interpretado.

| Propósito | Nasce de | O que a Sarah faz | Ferramentas liberadas |
|---|---|---|---|
| **Descoberta** | Lead novo: importação, formulário, campanha, ligação recebida | Entende o contexto, qualifica em 4–5 trocas, propõe reunião | consultar agenda · agendar · qualificar · transferir · não perturbe |
| **Lembrete** | 15 min antes da reunião (configurável) | Confirma presença; se não puder, remarca ali mesmo | confirmar · consultar agenda · remarcar · transferir |
| **Resgate** | Reunião passou sem presença confirmada | Acolhe sem cobrar, oferece novo horário | consultar agenda · remarcar · qualificar · transferir |
| **Retomada** | Passo de uma cadência de follow-up | Reabre o assunto a partir do resumo anterior | consultar agenda · agendar · qualificar · transferir · não perturbe |

Restringir ferramenta por propósito elimina a falha mais cara da categoria: a
Sarah marcar uma reunião nova durante uma ligação que era só de lembrete.

No design, o propósito é um selo presente em toda chamada, em toda linha de
histórico e em todo filtro.

---

## 5. Funcionalidades

### 5.1 Painel

A primeira tela depois do login. Responde, na ordem: *quanto entregamos, a que
custo, e tem algo quebrado?*

**Blocos:**
1. **Reuniões agendadas no período** — número grande, comparação com o período anterior.
2. **Custo por reunião agendada** — soma de telefonia + voz + modelo, dividida pelas reuniões. É o número que justifica o produto.
3. **Funil do período** — quantos leads em cada etapa e a taxa de passagem entre elas. Mostra onde trava.
4. **Ligações** — total, atendidas, taxa de atendimento, duração média. Taxa de atendimento baixa é problema de número ou de horário, não de discurso.
5. **Reuniões** — marcadas, confirmadas, realizadas, não compareceram, taxa de comparecimento.
6. **Qualidade da conversa** — nota média da avaliação automática e distribuição de sentimento.
7. **Saúde** — créditos de telefonia e de voz, números ativos, automações rodando, último erro.
8. **Próximas reuniões** e **últimas ligações**, com atalho para ouvir.

**Filtro de período** (hoje, 7, 30, 90 dias) e filtro por origem e campanha.
**Estado vazio:** conta recém-criada mostra o checklist de configuração no lugar dos números, não zeros.

---

### 5.2 Precisam de você

A fila de exceções. É aqui que a autonomia da Sarah fica honesta: tudo que ela
decidiu **não** resolver sozinha aparece nesta tela, com contexto suficiente para
um humano agir em um clique.

**O que entra na fila:**

| Situação | Como chega | Ação esperada |
|---|---|---|
| Lead pediu para falar com uma pessoa | A Sarah chamou a ferramenta de transferência e não havia ninguém disponível | Retornar a ligação |
| Lead pediu para não ser contatado | Registro automático de bloqueio | Confirmar e, se for o caso, registrar o motivo |
| Lead irritado ou reclamando | Sentimento muito negativo na chamada | Ouvir e decidir |
| Chamada falhou repetidas vezes | Número inválido, caixa postal recorrente, sem atendimento | Corrigir o telefone ou encerrar o lead |
| Reunião sem especialista | Agenda cheia ou ninguém cadastrado para a área | Abrir horário ou reatribuir |
| Chamada reprovada na avaliação | A Sarah não avisou da gravação, prometeu condição comercial, etc. | Ouvir e ajustar o playbook |
| Crédito ou cota acabando | Provedor abaixo do limite configurado | Recarregar |

Cada item traz: quem é o lead, o que aconteceu, o trecho relevante da
transcrição, o áudio, e os botões de ação. Item resolvido sai da fila com
registro de quem resolveu.

**Esta tela é o segundo lugar mais visitado do produto.** No design, ela precisa
de contagem visível na navegação e de ordenação por urgência.

---

### 5.3 Leads

**Lista.** Busca por nome, telefone ou e-mail. Filtros: etapa, temperatura,
origem, campanha, última atividade, tem reunião marcada, bloqueado. Seleção
múltipla com ações em lote: inscrever em cadência, adicionar a campanha,
bloquear, exportar, excluir.

**Ficha do lead.** Depois do Painel, a tela mais importante do produto. Reúne:

- **Identidade** — nome, telefone, e-mail, cidade/UF, empresa, origem, data de entrada.
- **Situação** — etapa do funil, pontuação 0–100, temperatura (quente/morno/frio), sentimento da última conversa.
- **Resumo** — o que a Sarah entendeu: a dor relatada, se há encaixe, objeções levantadas, próximo passo combinado. É isto que o especialista lê antes da reunião.
- **Linha do tempo** — tudo em ordem: ligações (com áudio embutido), mudanças de etapa e quem as fez (Sarah ou pessoa), reuniões marcadas/confirmadas/perdidas, entrada e saída de cadência, bloqueios, notas manuais.
- **O que vem a seguir** — próxima ligação agendada, passo pendente de cadência, reunião marcada.
- **Ações** — ligar agora (escolhendo o propósito), inscrever em cadência, mover de etapa, bloquear, escrever nota, mesclar com outro lead.

**Entrada de leads.** Quatro caminhos, todos escrevendo na mesma base:

1. **Importação de planilha** — envio do arquivo, mapeamento de colunas, normalização de telefone para formato internacional, marcação de duplicados com escolha (ignorar, atualizar, criar), prévia com contagem de válidos e inválidos, relatório de erros linha a linha. Nada é gravado antes da confirmação.
2. **Captura por webhook** — cada conta tem um endereço e uma chave própria. Um formulário de landing page envia o lead e a Sarah pode ligar em minutos. É o caminho de maior valor comercial do produto: velocidade de resposta é o que converte lead de anúncio.
3. **Cadastro manual** — formulário curto.
4. **Ligação recebida** — número desconhecido que liga vira lead automaticamente, com origem registrada.

Toda entrada resolve cidade, estado e fuso a partir do DDD — usado depois para
respeitar o horário local de quem recebe a ligação.

---

### 5.4 Funil

Kanban com as etapas da conta. Cada cartão mostra nome, telefone, pontuação,
temperatura, tempo parado na etapa e um selo quando a movimentação foi feita pela
Sarah. Arrastar move o lead e registra o evento como decisão humana.

Etapas têm **identificador fixo** e **nome editável**: o cliente renomeia a coluna
para o vocabulário dele sem quebrar nenhuma automação. As etapas padrão são
novo, contatado, qualificado, reunião marcada, ganho e perdido — com as duas
últimas marcadas como desfecho.

Filtros no topo por período, origem e campanha. Contagem e valor por coluna.

---

### 5.5 Chamadas

**Histórico.** Lista com direção, propósito, lead, duração, resultado, custo e
nota da avaliação. Filtros por período, propósito, resultado, campanha, número e
especialista. **Busca dentro das transcrições** — achar "falou em orçamento" em
2.000 ligações é o que transforma o histórico em inteligência comercial.

**Ficha da chamada.** Precisa dar para auditar uma ligação inteira sem sair dela:

- **Reprodutor com transcrição sincronizada** — clicar numa fala salta o áudio para aquele ponto; falas identificadas por quem falou.
- **Cabeçalho** — lead, propósito, número usado, duração, custo, resultado, sentimento.
- **Ferramentas usadas**, em linguagem humana e em ordem: *"consultou agenda de Estratégia → ofereceu 4 horários → agendou terça, 14h, com Marina"*. Sem JSON na cara do usuário — mas com o detalhe técnico acessível em um clique, para depuração.
- **Avaliação automática** — cada critério com aprovado/reprovado e a justificativa.
- **Resultado registrado** — etapa, pontuação e resumo que a chamada gerou, com botão de corrigir. A correção humana fica gravada e alimenta a revisão do playbook.

**Discador.** Escolher lead, propósito e número de origem, e ligar. Quando a
política bloqueia, a tela diz exatamente por quê — *"fora da janela permitida
(9h–20h no horário do lead)"*, *"número na lista de bloqueio"*, *"última
tentativa há 12 minutos; o intervalo mínimo é 60"* — e oferece a alternativa
(agendar para o próximo horário válido).

**Ao vivo.** Chamadas em andamento com status e cronômetro, com opção de
encerrar. Em campanha, mostra quantas linhas estão ocupadas.

---

### 5.6 Reuniões

**Agenda** semanal e lista, filtrável por especialista e por status.

**Ficha da reunião:** lead, especialista, horário, modalidade, link, status e o
**resumo de passagem** — o que o especialista precisa saber antes de entrar.
Histórico completo: marcada na ligação X, confirmada na ligação Y, remarcada de
tal para tal horário e por quê.

**Ciclo automático:**
1. Marcada → convite por e-mail para lead e especialista; evento no calendário do especialista.
2. 15 minutos antes (configurável) → a Sarah liga para confirmar. Confirmou, fica confirmada; não pode, remarca na hora; não atende, segue marcada.
3. Depois do horário → se ninguém marcou presença, entra como falta e dispara o resgate.
4. Resgate → nova ligação oferecendo horário. Esgotadas as tentativas configuradas, o lead vai para perdido com o motivo.

**Ações manuais:** marcar realizada, marcar falta, cancelar com motivo,
reatribuir especialista, remarcar.

---

### 5.7 Sarah

A área que decide se o produto é bom. Cinco abas.

**Identidade.** Como ela se apresenta: nome, empresa, o que oferece, o que
**nunca** deve afirmar, para quem transferir. Texto livre, com exemplos.

**Voz.** Catálogo de vozes com audição em português; ajuste de velocidade e
estabilidade; clonagem a partir de um áudio enviado; e a **primeira fala** —
a frase de abertura, com variáveis de lead e empresa, ouvível ali mesmo.

**Playbooks.** Um roteiro por propósito, apresentado em três camadas visíveis:

1. **Regras da casa** *(travadas)* — identificar-se, avisar que a ligação pode ser gravada, frases curtas, nunca prometer preço/prazo/condição, encerrar com cordialidade quando pedem para não ligar mais, parar e transferir diante de irritação ou risco.
2. **Roteiro do propósito** *(editável por administrador, com aviso)* — o passo a passo e quando chamar cada ferramenta.
3. **Jeito da casa** *(livre)* — tom, vocabulário, contexto do negócio, exemplos de boas respostas.

Cada playbook é versionado, com histórico, comparação entre versões e publicação
explícita. **Toda chamada grava qual versão usou** — é assim que se explica por
que a Sarah disse o que disse numa ligação de três semanas atrás.

Um botão gera um primeiro rascunho a partir de uma descrição em linguagem
natural do negócio, para o administrador não encarar uma página em branco.

**Base de conhecimento.** Perguntas e respostas e documentos que a Sarah pode
usar. Sem isso, ela inventa — e inventar é o defeito mais caro que um agente de
voz comete. Fora da base, a resposta obrigatória é *"isso eu confirmo com o time
e te retorno"*.

**Ensaio.** Conversar com a Sarah **antes de ela ligar para alguém** — por texto
e por voz, no navegador. Escolher um perfil de lead simulado (cético, sem tempo,
interessado, irritado, número errado) e ver a conversa inteira, com as
ferramentas que ela chamou destacadas. É o ambiente onde o playbook é ajustado
sem queimar lead real.

**Estado de publicação** visível o tempo todo: rascunho, publicado, ou
*publicado com alterações pendentes*. Editar e esquecer de publicar é a pegadinha
número um dessa categoria de produto; o design precisa tornar isso impossível de
ignorar.

---

### 5.8 Especialistas

Quem recebe as reuniões.

- **Cadastro** — nome, área de atuação, modalidades atendidas, duração padrão, teto de reuniões por dia, link da sala, e-mail.
- **Disponibilidade** — janelas por dia da semana, mais bloqueios pontuais.
- **Calendário conectado** — quando ligado, a ocupação real é lida do calendário do especialista, e a reunião marcada vira evento lá. Sem isso, a Sarah marca em cima de compromisso existente.
- **Antecedência** — mínima (não marcar para daqui a 10 minutos) e máxima (não marcar para daqui a três meses).
- **Roteamento** — como escolher quem recebe: por área, rodízio entre disponíveis, ou fixo.

---

### 5.9 Números

- **Lista de linhas**, cada uma com: número, apelido, se a Sarah atende ligações recebidas ou transfere, se está habilitada para sair, e o estado de registro no provedor de voz.
- **Teste** — ligar para o próprio celular e validar a linha inteira em um clique.
- **Saúde da linha** — ligações hoje, taxa de atendimento, marcações de spam. Taxa de atendimento caindo em um número é sinal de bloqueio pela operadora, e o operador precisa ver isso antes de queimar a base.
- **Rodízio** — distribuir o volume de saída entre vários números.
- **Comportamento no recebimento** — Sarah atende, transfere para uma pessoa, ou recado.

---

### 5.10 Campanhas

Discagem em lote.

**Montagem:** nome, público (filtro salvo de leads ou planilha), propósito,
playbook, número ou conjunto de números, janela de discagem, quantas ligações
simultâneas, política de retentativa por resultado (não atendeu → tentar de novo
em X horas; caixa postal → outro turno; ocupado → 30 minutos), data de início.

**Prévia obrigatória antes de disparar:** quantos leads entram, quantos são
descartados e por quê (bloqueados, sem telefone, duplicados, fora do público),
estimativa de duração e de custo. **Disparar 2.000 ligações sem essa tela é como
mandar e-mail em massa sem ver o destinatário.**

**Execução:** progresso ao vivo, fila, ligações ocupadas agora, resultados por
categoria, custo acumulado e custo por reunião marcada. Pausar, retomar e
cancelar a qualquer momento.

**Encerramento:** relatório com funil da campanha e comparação com campanhas
anteriores.

---

### 5.11 Cadências

Sequências de retomada, para o lead que não fechou nem morreu.

**Construtor:** um gatilho e uma lista de passos.
Gatilhos: entrou na etapa X · não compareceu · reunião realizada sem decisão ·
manual. Passos: esperar N horas → ligar com o propósito Y.

**Condições de saída** — o que interrompe a sequência: marcou reunião, pediu para
não ser contatado, foi para etapa de desfecho, um humano assumiu.

**Modelos prontos:** reengajar lead frio · resgatar quem faltou · acompanhar
depois da reunião.

**Acompanhamento:** inscrições ativas, em que passo cada uma está, próximo
disparo, histórico de execução com erros.

---

### 5.12 Configurações

- **Conta** — nome da empresa, fuso, dados que a Sarah usa no discurso, telefone de apoio.
- **Integrações** — um cartão por provedor mostrando estado real (conectado, saldo, cota consumida), campo para a chave e botão de testar. A chave, depois de salva, nunca mais é exibida.
- **Política de discagem** — janela horária por dia da semana, intervalo mínimo entre tentativas ao mesmo número, teto de tentativas por dia, gravação ligada ou desligada, texto do aviso de gravação.
- **Lista de bloqueio** — busca, inclusão manual, importação, motivo e origem de cada entrada, remoção com registro.
- **Privacidade** — prazo de retenção de áudio e de transcrição (com expurgo automático), exclusão dos dados de um lead sob solicitação, exportação dos dados de um lead, registro de consentimento.
- **Equipe** — convidar por link, definir papel, remover, ver último acesso.
- **Webhooks** — entrada (chave para receber leads) e saída (avisar um sistema externo quando uma reunião é marcada ou um lead é qualificado).
- **Auditoria** — quem mudou o quê e quando.

---

### 5.13 Configuração inicial

Assistente de oito passos, com checklist persistente que fica acessível até
terminar:

1. Boas-vindas e o que vai ser configurado.
2. Empresa — nome, fuso, o que vocês vendem.
3. Provedor de voz — chave e escolha da voz.
4. Telefonia — chave e conta.
5. Número — comprar novo ou importar existente.
6. A Sarah — identidade, primeira fala, playbook de descoberta gerado a partir da descrição do negócio.
7. Especialista e agenda — pelo menos um, com disponibilidade.
8. Ensaio e primeira ligação de teste para o próprio celular.

Pode pular e voltar. O checklist mostra o que falta e o que cada pendência
impede de funcionar.

---

## 6. As ferramentas da Sarah

Sete ferramentas. Ela as aciona **durante** a conversa, e cada uma existe para
impedir que ela invente algo.

| Ferramenta | Papel | Quando ela usa | Regra que a ferramenta impõe |
|---|---|---|---|
| **Consultar agenda** | Devolve horários realmente livres, já escritos em português para leitura em voz alta | Sempre antes de oferecer qualquer horário | Ela não pode oferecer horário que não veio daqui |
| **Agendar reunião** | Grava a reunião, dispara convite e evento no calendário | Depois de repetir horário, especialista e modalidade e ouvir o "sim" | Só aceita horário e especialista vindos da consulta anterior |
| **Confirmar presença** | Marca a reunião como confirmada | Só em ligação de lembrete, quando o lead confirma | Indisponível nos outros propósitos |
| **Remarcar ou cancelar** | Move ou cancela a reunião, registrando o motivo | Lembrete e resgate, quando o lead não pode | Remarcar exige horário vindo da consulta |
| **Registrar qualificação** | Grava etapa, temperatura, sentimento, dor e próximo passo | Obrigatória antes de encerrar em descoberta e retomada | Campo não confirmado vai vazio — inventar é proibido |
| **Transferir para pessoa** | Passa a ligação para um humano ou, se não houver ninguém, abre item na fila com o contexto | Lead pede, se irrita, ou toca em assunto fora do escopo | Ela nunca improvisa em tema sensível |
| **Registrar não perturbe** | Bloqueia o número na hora | Lead pede para não ser contatado | Efeito imediato, sem depender do fim da chamada |

Três regras valem para todas:

1. **A resposta volta pronta para ser falada.** A ferramenta devolve a frase em
   português; a Sarah lê. Ela não formata data, não converte fuso, não calcula
   duração — porque modelo de linguagem erra nisso e o erro vira reunião marcada
   no dia errado.
2. **Identificadores não passam pela conversa.** O vínculo com a chamada viaja
   por cabeçalho técnico. Pedir para um modelo memorizar um identificador de 36
   caracteres é garantir defeito.
3. **São endereços HTTP comuns.** Dá para testar as sete sem telefone, em
   integração contínua — o que mantém a parte mais crítica do produto sob rede de
   segurança.

---

## 7. As ferramentas externas e seus papéis

| Ferramenta | Papel exato | O que quebra sem ela |
|---|---|---|
| **Provedor de voz conversacional** (ElevenLabs Conversational AI) | O ouvido, o cérebro e a boca **durante** a ligação: reconhece a fala, decide o que responder, fala com voz natural, controla a vez de falar e aceita interrupção. Guarda o agente publicado e chama nossos webhooks de contexto e de ferramenta | Não há ligação |
| **Telefonia** (Twilio) | O número, a linha, o estado da chamada, a detecção de secretária eletrônica, a transferência para humano e o envio de confirmação por mensagem | Não há telefone |
| **Plataforma de dados** (Supabase) | Identidade e permissão, banco com isolamento por conta, guarda das gravações, as funções de servidor e o agendador das rotinas | Não há aplicação |
| **Claude** (`claude-opus-5` — US$ 5 por milhão de tokens de entrada, US$ 25 de saída) | Tudo que é raciocínio **fora** da ligação: ler a transcrição e classificar o lead quando a Sarah não chamou a ferramenta, escrever o resumo de passagem para o especialista, avaliar o sentimento, redigir a justificativa da avaliação e gerar o rascunho do playbook a partir da descrição do negócio | Classificação e resumos ficam manuais |
| **Calendário** (Google Calendar) | Ocupação real do especialista e criação do evento da reunião | A Sarah marca em cima de compromisso existente |
| **CRM** (HubSpot) | Espelha lead, qualificação e reunião no sistema onde o time comercial já trabalha | Dado duplicado e time trabalhando em duas telas |
| **E-mail transacional** | Convite da reunião, convite de equipe, aviso de saldo baixo | Ninguém recebe convite |

**Divisão de responsabilidade que não se mistura:** o provedor de voz decide
*o que dizer agora*; nossas ferramentas decidem *o que é verdade*. Horário livre,
etapa do funil, bloqueio e agenda são sempre resposta do nosso lado — nunca
opinião do modelo.

---

## 8. Rotinas de fundo

Oito rotinas. Todas com efeito visível na interface, para que o usuário confie
que o sistema está trabalhando.

| Rotina | Cadência | Efeito que o usuário percebe |
|---|---|---|
| **Resposta imediata a lead novo** | Contínua | Lead de formulário recebe ligação em minutos |
| **Lembrete de reunião** | 1 min | A Sarah liga 15 minutos antes |
| **Resgate de falta** | 5 min | Quem não apareceu recebe ligação de remarcação |
| **Avanço de cadência** | 5 min | Sequências caminham sozinhas |
| **Recuperação de chamada** | 2 min | Nenhuma ligação fica sem transcrição, mesmo se o provedor falhar em avisar |
| **Alimentação de campanha** | 1 min | A fila anda respeitando janela e simultaneidade |
| **Expurgo de mídia** | Diária | Áudio e transcrição somem no prazo de retenção configurado |
| **Vigia de saldo** | 15 min | Aviso antes de a operação parar por falta de crédito |

A tela de saúde mostra a última execução e o último erro de cada uma — rotina
silenciosamente morta é o defeito mais difícil de perceber nesse tipo de produto.

---

## 9. Estados que o design precisa cobrir

Fora do caminho feliz, estas são as telas que definem a qualidade percebida:

- **Conta nova, tudo vazio** — cada lista vazia precisa dizer o que fazer e levar até lá.
- **Configuração incompleta** — o que já funciona e o que está travado, com a pendência exata (sem número não há ligação; sem especialista não há agendamento).
- **Bloqueio de discagem** — motivo em português e a alternativa oferecida.
- **Falha de provedor** — crédito acabou, chave inválida, serviço fora. Precisa distinguir "configure isso" de "aguarde".
- **Publicação pendente** — a Sarah está no ar com uma versão anterior à que está na tela.
- **Processando** — chamada encerrada mas transcrição ainda chegando; é um estado normal de 10 a 60 segundos e precisa aparecer como tal, não como erro.
- **Lead bloqueado** — a ficha continua legível, mas as ações de discagem ficam desligadas com a explicação.
- **Permissão insuficiente** — o Operador vê a área do playbook, em leitura, sabendo a quem pedir.

---

## 10. Fora do escopo desta versão

Registrado para não voltar como surpresa: canal de WhatsApp e e-mail (a Sarah
desta versão só fala por telefone), caixa de entrada de mensagens de texto,
proposta comercial e contrato, cobrança e assinatura dentro do produto,
supervisor ouvindo a chamada ao vivo, e vários idiomas.

---

## 11. Decisões abertas

1. **Hospedagem da interface** — padrão de implantação da casa ou provedor de borda.
2. **O que a Sarah oferece** — produto, público e o que caracteriza um lead qualificado. Define os playbooks de descoberta e de retomada e a base de conhecimento; não bloqueia a construção da plataforma.
3. **Quem recebe a reunião** — um time comercial único ou um especialista por linha de produto. Define a regra de roteamento.
