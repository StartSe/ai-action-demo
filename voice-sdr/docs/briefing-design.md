# Briefing de design — Sarah Voice SDR

Documento de entrada para quem vai desenhar as telas. É autossuficiente: não
pressupõe acesso ao código nem a nenhum outro documento.

Descreve **o produto, cada tela, cada componente recorrente e cada estado**. Não
prescreve cor, tipografia nem estilo visual — essas decisões são de quem desenha.
O que está aqui é o comportamento que o desenho precisa acomodar.

---

## 1. O que é o produto

A Sarah é uma SDR — pré-vendedora — que trabalha por telefone, sozinha. Ela liga
para leads, conversa em português com voz natural, entende se há encaixe com o
que a empresa vende, consulta a agenda real de um especialista humano, marca a
reunião, liga de novo 15 minutos antes para confirmar, resgata quem não
apareceu, e devolve tudo registrado: etapa do funil, resumo da conversa,
gravação e transcrição.

Quem usa a aplicação **não fica no telefone**. Configura a Sarah, olha o funil e
atende a fila de exceções — os casos em que a Sarah, corretamente, não seguiu
sozinha.

**A aplicação responde a duas perguntas o tempo todo: quantas reuniões saíram, e
quanto custou cada uma.** Todo o resto existe para explicar essas duas.

---

## 2. Quem usa, e como

| Papel | Como usa | Consequência para o desenho |
|---|---|---|
| **Operador** | Passa o dia na aplicação. Vive em três telas: Painel, Precisam de você, Funil | Densidade alta, poucos cliques, informação sem precisar abrir |
| **Administrador** | Entra para configurar a Sarah, playbooks, números, campanhas, e sai | Densidade baixa, explicação generosa, confirmação antes do irreversível |
| **Dono** | O administrador, mais credenciais e exclusão de dados | — |
| **Observador** | Só lê | Ações aparecem desabilitadas com o motivo, não somem |

O Operador é o usuário principal. Quando houver conflito entre a comodidade dele
e a do Administrador, ele ganha.

---

## 3. Princípios que o desenho precisa respeitar

1. **Número só existe se explicar reunião ou custo.** Métrica bonita que não
   move nenhuma das duas é ruído.
2. **Toda decisão da Sarah é auditável em dois cliques.** Do cartão do lead até
   ouvir o trecho exato da ligação em que ela decidiu aquilo.
3. **Exceção é cidadã de primeira classe.** O que deu errado tem tela própria,
   contador na navegação e ação em um clique. Não é aviso que some.
4. **Nada de identificador técnico na cara do usuário.** Nenhum código de 36
   caracteres, nenhum dado bruto de sistema. O detalhe técnico existe, mas atrás
   de um "ver detalhes", para quem está depurando.
5. **Bloqueio sempre explica e oferece saída.** "Não é possível ligar agora"
   está errado. "Fora da janela permitida — no horário do lead são 21h40. Agendar
   para amanhã às 9h?" está certo.
6. **O estado de publicação da Sarah é impossível de ignorar.** Editar o roteiro
   e esquecer de publicar é a falha número um dessa categoria de produto.
7. **Português de gente.** "Reunião marcada", não "meeting booked". "Não
   atendeu", não "no_answer".

---

## 4. Estrutura da aplicação

```
Entrar · Criar conta por convite · Recuperar senha

┌─ Configuração inicial (assistente de 8 passos + checklist persistente)

├─ OPERAÇÃO
│   Painel
│   Precisam de você        ← contador visível na navegação
│   Funil
│   Leads                   → ficha do lead
│   Chamadas                → ficha da chamada
│   Reuniões                → ficha da reunião
│
├─ MÁQUINA
│   Sarah                   → identidade · voz · playbooks · conhecimento · ensaio
│   Campanhas
│   Cadências
│   Números
│   Especialistas
│
└─ ADMINISTRAÇÃO
    Configurações           → conta · integrações · discagem · bloqueios ·
                              privacidade · equipe · webhooks · auditoria
```

---

## 5. O conceito central: propósito da chamada

Nenhuma ligação é genérica. **Toda chamada tem um propósito**, e ele aparece em
toda a interface — em cada linha de histórico, em cada filtro, em cada ficha.

| Propósito | O que a Sarah faz nessa ligação |
|---|---|
| **Descoberta** | Entende o contexto, qualifica, propõe reunião |
| **Lembrete** | Confirma presença 15 min antes; remarca se o lead não puder |
| **Resgate** | Lead faltou: acolhe sem cobrar e oferece novo horário |
| **Retomada** | Reabre assunto com quem esfriou, seguindo uma cadência |

São quatro valores fixos. Precisam de tratamento visual distinguível à
distância, porque o usuário vai varrer listas longas procurando um deles.

---

## 6. Componentes recorrentes

Desenhar uma vez, usar em toda parte.

| Componente | Onde aparece | O que precisa mostrar |
|---|---|---|
| **Selo de propósito** | Listas de chamada, fichas, filtros, campanhas, cadências | Um dos quatro valores acima |
| **Cartão de lead** | Kanban, listas, resultados de busca | Nome, telefone, pontuação 0–100, temperatura (quente/morno/frio), tempo parado, marca de "movido pela Sarah" |
| **Bloco de resumo** | Ficha do lead, ficha da reunião, ficha da chamada | Quatro campos: a dor relatada, se há encaixe, objeções levantadas, próximo passo combinado. Campo vazio aparece como vazio — nunca inventado |
| **Linha do tempo** | Ficha do lead, ficha da reunião | Eventos em ordem, com ícone por tipo, e distinção clara entre o que a Sarah fez e o que uma pessoa fez |
| **Linha de chamada** | Histórico, ficha do lead, campanhas | Propósito, data, duração, resultado, custo, nota da avaliação, botão de ouvir |
| **Reprodutor com transcrição** | Ficha da chamada, fila de exceções | Áudio + transcrição sincronizada; clicar numa fala salta o áudio; identificação de quem fala |
| **Indicador de publicação** | Toda a área da Sarah | Três estados: rascunho · publicada · **publicada com alterações pendentes** |
| **Cartão de provedor** | Configurações, assistente inicial, painel | Nome, estado real (conectado / saldo / cota consumida / não configurado), campo de chave, botão de testar |
| **Aviso de bloqueio** | Discador, ficha do lead, prévia de campanha | Motivo em português e a alternativa oferecida |
| **Cartão de métrica** | Painel | Valor, rótulo, comparação com o período anterior, e microexplicação do que o número significa |
| **Seletor de período** | Painel, relatórios, campanhas | Hoje · 7 · 30 · 90 dias |
| **Estado vazio instrutivo** | Toda lista | O que é essa tela, por que está vazia, e o botão que resolve |

---

## 7. As telas

Marcadas com **[núcleo]** as cinco que carregam o produto e devem ser desenhadas
primeiro.

---

### 7.1 Painel **[núcleo]**

**Objetivo:** em dez segundos, saber quanto entregamos, a que custo e se algo
está quebrado.

**Conteúdo, nesta ordem de importância:**
1. **Reuniões agendadas no período** — número grande, comparação com o período anterior.
2. **Custo por reunião agendada** — telefonia + voz + processamento, dividido pelas reuniões.
3. **Funil do período** — quantos leads em cada etapa e a taxa de passagem entre elas. Mostra onde trava.
4. **Ligações** — total, atendidas, taxa de atendimento, duração média.
5. **Reuniões** — marcadas, confirmadas, realizadas, faltas, taxa de comparecimento.
6. **Qualidade** — nota média da avaliação automática e distribuição de sentimento das conversas.
7. **Saúde** — créditos de telefonia e de voz, números ativos, automações rodando, último erro.
8. **Próximas reuniões** e **últimas ligações**, com atalho para ouvir.

**Ações:** trocar período; filtrar por origem e por campanha; ir para qualquer
bloco em detalhe.

**Estados:** conta recém-criada mostra o **checklist de configuração** no lugar
dos números — nunca uma parede de zeros.

---

### 7.2 Precisam de você **[núcleo]**

**Objetivo:** resolver, um a um, tudo que a Sarah decidiu não resolver sozinha.
É a tela que torna a autonomia honesta.

**O que entra na fila:**

| Situação | Ação esperada |
|---|---|
| Lead pediu para falar com uma pessoa e não havia ninguém | Retornar a ligação |
| Lead pediu para não ser contatado | Confirmar o bloqueio |
| Lead irritado ou reclamando | Ouvir e decidir |
| Chamada falhou repetidas vezes | Corrigir o telefone ou encerrar o lead |
| Reunião sem especialista disponível | Abrir horário ou reatribuir |
| Chamada reprovada na avaliação automática | Ouvir e ajustar o playbook |
| Crédito ou cota acabando | Recarregar |

**Cada item mostra:** quem é o lead, o que aconteceu, o trecho relevante da
transcrição, o áudio, e os botões de ação. Resolver tira da fila com registro de
quem resolveu.

**Ordenação por urgência.** Contador na navegação principal.

---

### 7.3 Funil

**Objetivo:** ver onde cada lead está e mover quando preciso.

Kanban com as etapas da conta — por padrão: novo, contatado, qualificado,
reunião marcada, ganho, perdido. Cartão de lead em cada coluna. Arrastar move e
registra como decisão humana.

**Conteúdo por coluna:** nome da etapa, contagem, e os cartões.
**Filtros:** período, origem, campanha.
**Configuração:** renomear etapa, reordenar, escolher cor, marcar quais são
desfecho. O nome é livre; o comportamento por trás não muda.

---

### 7.4 Leads — lista

**Busca** por nome, telefone ou e-mail.
**Filtros:** etapa, temperatura, origem, campanha, última atividade, tem reunião
marcada, bloqueado.
**Seleção múltipla** com ações em lote: inscrever em cadência, adicionar a
campanha, bloquear, exportar, excluir.
**Entrada de leads:** botão que abre os quatro caminhos — importar planilha,
cadastrar manualmente, copiar o endereço de captura automática, ou explicar que
ligações recebidas viram lead sozinhas.

---

### 7.5 Leads — ficha **[núcleo]**

A tela mais importante depois do Painel. Precisa contar a história inteira do
lead sem exigir navegação.

**Blocos:**
- **Identidade** — nome, telefone, e-mail, cidade e estado, empresa, origem, quando entrou.
- **Situação** — etapa, pontuação 0–100, temperatura, sentimento da última conversa.
- **Resumo** — o bloco de quatro campos (dor, encaixe, objeções, próximo passo). É isto que o especialista lê antes da reunião.
- **Linha do tempo** — ligações com áudio embutido, mudanças de etapa com autoria, reuniões marcadas/confirmadas/perdidas, entrada e saída de cadência, bloqueios, notas manuais.
- **O que vem a seguir** — próxima ligação agendada, passo pendente de cadência, reunião marcada.

**Ações:** ligar agora (escolhendo o propósito), inscrever em cadência, mover de
etapa, bloquear, escrever nota, mesclar com outro lead.

**Estados:** lead bloqueado mantém a ficha legível, com as ações de discagem
desligadas e o motivo à vista.

---

### 7.6 Importação de leads

Fluxo de três passos, sem gravar nada antes da confirmação:
1. **Enviar arquivo** — arrastar ou escolher.
2. **Mapear colunas** — associar cada coluna da planilha a um campo; escolher o que fazer com duplicados (ignorar, atualizar, criar novo).
3. **Prévia** — quantos válidos, quantos inválidos e por quê, linha a linha, com opção de baixar o relatório de erros.

---

### 7.7 Chamadas — histórico

**Lista** com direção, propósito, lead, duração, resultado, custo e nota.
**Filtros:** período, propósito, resultado, campanha, número, especialista.
**Busca dentro das transcrições** — encontrar "falou em orçamento" em duas mil
ligações é o que transforma histórico em inteligência comercial. Precisa de
lugar de destaque, com o trecho encontrado aparecendo no resultado.

---

### 7.8 Chamadas — ficha **[núcleo]**

Precisa dar para auditar uma ligação inteira sem sair dela.

- **Reprodutor com transcrição sincronizada** — ocupa o corpo da tela. Clicar numa fala salta o áudio. Falas identificadas por quem falou.
- **Cabeçalho** — lead, propósito, número usado, duração, custo, resultado, sentimento.
- **O que a Sarah fez**, em linguagem humana e em ordem: *"consultou a agenda de Estratégia → ofereceu 4 horários → agendou terça, 14h, com Marina"*. Cada passo ancorado no ponto da gravação em que aconteceu. O detalhe técnico fica atrás de "ver detalhes".
- **Avaliação automática** — cada critério com aprovado ou reprovado e a justificativa. Os critérios: avisou da gravação, identificou-se, qualificou de fato, não prometeu condição comercial, respeitou pedido de não contato.
- **Resultado registrado** — etapa, pontuação e resumo gerados pela chamada, com botão de **corrigir**. A correção humana fica gravada.

---

### 7.9 Discador

Escolher lead, propósito e número de origem, e ligar.

Quando a política bloqueia, a tela diz por quê e oferece a saída. Exemplos que o
desenho precisa acomodar: fora da janela permitida no horário do lead; número na
lista de bloqueio; última tentativa recente demais; teto diário atingido; número
inválido.

**Chamadas ao vivo:** lista das que estão acontecendo, com status e cronômetro,
e opção de encerrar. Em campanha, quantas linhas estão ocupadas.

---

### 7.10 Reuniões

**Agenda semanal** e **lista**, filtráveis por especialista e por status.
Status possíveis: marcada, confirmada, realizada, faltou, remarcada, cancelada.

**Ficha da reunião:** lead, especialista, horário, modalidade, link, status, e o
**resumo de passagem** — o que o especialista precisa saber antes de entrar.
Histórico completo: marcada na ligação X, confirmada na ligação Y, remarcada de
tal para tal horário e por quê.

**Ações manuais:** marcar realizada, marcar falta, cancelar com motivo,
reatribuir especialista, remarcar.

**O ciclo automático precisa estar visível na ficha** — o usuário deve entender,
sem perguntar, que às 13h45 a Sarah vai ligar para confirmar a reunião das 14h.

---

### 7.11 Sarah — Identidade

Como ela se apresenta: nome, empresa, o que oferece, o que **nunca** deve
afirmar, para quem transferir. Texto livre, com exemplos ao lado.

---

### 7.12 Sarah — Voz

- **Catálogo de vozes** com audição em português.
- **Ajustes** de velocidade e estabilidade.
- **Clonar voz** a partir de um áudio enviado.
- **Primeira fala** — a frase de abertura, com variáveis (nome do lead, empresa), ouvível ali mesmo com os valores preenchidos.

---

### 7.13 Sarah — Playbooks **[núcleo]**

A tela que decide se o produto é bom. Um roteiro por propósito (quatro), cada um
apresentado em **três camadas visualmente distintas**:

1. **Regras da casa — travadas.** Identificar-se, avisar que a ligação pode ser gravada, frases curtas, nunca prometer preço ou prazo, encerrar com cordialidade quando pedem para não ligar mais, parar e transferir diante de irritação. O usuário **vê** mas não edita. Precisa ficar claro que isso é proteção, não limitação arbitrária.
2. **Roteiro do propósito — editável por administrador, com aviso.** O passo a passo e quando usar cada ferramenta.
3. **Jeito da casa — livre.** Tom, vocabulário, contexto do negócio, exemplos de boas respostas.

**Versionamento:** histórico, comparação entre versões, e publicação explícita.
Um botão gera um primeiro rascunho a partir de uma descrição do negócio em
linguagem natural, para ninguém encarar página em branco.

**O indicador de publicação fica permanentemente visível nesta tela.**

---

### 7.14 Sarah — Base de conhecimento

Perguntas e respostas e documentos que a Sarah pode usar durante a conversa.
Lista, busca, adicionar, remover. Precisa comunicar a regra: **fora desta base,
a resposta obrigatória é "isso eu confirmo com o time e te retorno"** — porque
agente de voz que inventa é o defeito mais caro do produto.

---

### 7.15 Sarah — Ensaio

Conversar com a Sarah **antes de ela ligar para alguém de verdade**.

- Por **texto** e por **voz**, no navegador.
- Escolhendo um **perfil de lead simulado**: cético, sem tempo, interessado, irritado, número errado.
- Com as **ferramentas que ela chamou destacadas** no meio da conversa, para o administrador ver se o roteiro está funcionando.
- Com atalho para **corrigir o playbook** e ensaiar de novo, sem sair da tela.

---

### 7.16 Especialistas

Quem recebe as reuniões.

- **Cadastro:** nome, área, modalidades atendidas, duração padrão, teto de reuniões por dia, link da sala, e-mail.
- **Disponibilidade:** janelas por dia da semana, mais bloqueios pontuais.
- **Calendário conectado:** quando ligado, a ocupação real é lida do calendário da pessoa e a reunião marcada vira evento lá.
- **Antecedência:** mínima e máxima para agendamento.
- **Roteamento:** como escolher quem recebe — por área, rodízio entre disponíveis, ou fixo.

---

### 7.17 Números

- **Lista de linhas:** número, apelido, o que acontece quando alguém liga (Sarah atende / transfere / recado), se está habilitada para sair, estado de registro no provedor.
- **Teste em um clique:** ligar para o próprio celular e validar a linha inteira.
- **Saúde da linha:** ligações hoje, taxa de atendimento, marcações de spam. Taxa de atendimento caindo é sinal de bloqueio pela operadora — o usuário precisa ver antes de queimar a base.
- **Rodízio:** distribuir o volume de saída entre vários números.

---

### 7.18 Campanhas

**Lista** com status, progresso e resultado de cada campanha.

**Criação** (assistente): nome, público (filtro salvo de leads ou planilha),
propósito, número ou conjunto de números, janela de discagem, quantas ligações
simultâneas, política de retentativa por resultado, data de início.

**Prévia obrigatória antes de disparar:** quantos leads entram, quantos são
descartados e por quê, estimativa de duração e de custo. *Disparar duas mil
ligações sem essa tela é como enviar e-mail em massa sem ver o destinatário.*

**Execução:** progresso ao vivo, fila, ligações acontecendo agora, resultados por
categoria, custo acumulado e custo por reunião. Pausar, retomar, cancelar.

**Encerramento:** relatório com o funil da campanha e comparação com anteriores.

---

### 7.19 Cadências

**Construtor:** um gatilho e uma sequência de passos.
Gatilhos: entrou na etapa X · faltou à reunião · reunião realizada sem decisão ·
manual. Passos: esperar N horas → ligar com o propósito Y.

**Condições de saída** — o que interrompe: marcou reunião, pediu para não ser
contatado, chegou a etapa de desfecho, um humano assumiu.

**Modelos prontos:** reengajar lead frio · resgatar quem faltou · acompanhar
depois da reunião.

**Acompanhamento:** inscrições ativas, em que passo cada uma está, próximo
disparo, histórico com erros.

---

### 7.20 Configurações

Sete áreas:

1. **Conta** — nome da empresa, fuso, dados que a Sarah usa no discurso, telefone de apoio.
2. **Integrações** — um cartão por provedor com estado real, campo de chave e botão de testar. Chave salva nunca é exibida de novo.
3. **Política de discagem** — janela horária por dia da semana, intervalo mínimo entre tentativas, teto diário, gravação ligada ou desligada, texto do aviso de gravação.
4. **Lista de bloqueio** — busca, inclusão, importação, motivo e origem de cada entrada, remoção com registro.
5. **Privacidade** — prazo de retenção de áudio e transcrição com expurgo automático, exclusão dos dados de um lead sob solicitação, exportação, registro de consentimento.
6. **Equipe** — convidar por link, definir papel, remover, último acesso.
7. **Webhooks** — endereço e chave para receber leads de fora; avisos para sistemas externos quando uma reunião é marcada.

Mais o **registro de auditoria**: quem mudou o quê e quando.

---

### 7.21 Configuração inicial

Assistente de oito passos, com checklist persistente que fica acessível até
terminar:

1. Boas-vindas
2. Empresa — nome, fuso, o que vocês vendem
3. Provedor de voz — chave e escolha da voz
4. Telefonia — chave e conta
5. Número — comprar novo ou importar existente
6. A Sarah — identidade, primeira fala, roteiro gerado a partir da descrição do negócio
7. Especialista e agenda — pelo menos um, com disponibilidade
8. Ensaio e primeira ligação de teste para o próprio celular

Pode pular e voltar. O checklist mostra o que falta **e o que cada pendência
impede de funcionar** — sem número não há ligação, sem especialista não há
agendamento.

---

### 7.22 Autenticação

Entrar · criar conta a partir de convite · recuperar senha. Três telas simples,
mas são a primeira impressão do produto.

---

## 8. Estados que o desenho precisa cobrir

Fora do caminho feliz é onde a qualidade percebida se decide:

| Estado | O que precisa comunicar |
|---|---|
| **Conta nova, tudo vazio** | O que é a tela, e o botão que resolve |
| **Configuração incompleta** | O que já funciona, o que está travado, e qual pendência destrava |
| **Bloqueio de discagem** | Motivo em português e a alternativa |
| **Falha de provedor** | Distinguir "configure isso" de "aguarde, é temporário" |
| **Publicação pendente** | A Sarah está no ar com uma versão anterior à da tela |
| **Processando** | Chamada encerrada, transcrição chegando. Dura de 10 a 60 segundos e é **normal** — não pode parecer erro |
| **Lead bloqueado** | Ficha legível, discagem desligada, motivo à vista |
| **Sem permissão** | Área visível em leitura, com a quem pedir acesso |
| **Carregando** | Estrutura da tela já visível, dados preenchendo |

---

## 9. O que não fazer

- Não desenhar caixa de entrada de mensagens. Esta versão da Sarah **só fala por telefone** — não há WhatsApp, e-mail nem chat.
- Não colocar identificador técnico, dado bruto de sistema ou nome de provedor em tela de operação.
- Não usar zero como estado vazio.
- Não esconder o custo. Ele é métrica de produto, não detalhe de cobrança.
- Não tratar a fila de exceções como notificação. É trabalho, não aviso.
- Não deixar o roteiro da Sarah editável sem deixar óbvio que precisa publicar.

---

## 10. O que se espera de volta

1. As cinco telas de **[núcleo]** — Painel, Precisam de você, Ficha do lead, Ficha da chamada, Sarah → Playbooks — em resolução de trabalho, com os estados de vazio e de erro de cada uma.
2. Os **componentes recorrentes** da seção 6, desenhados uma vez e reaproveitáveis.
3. O restante das telas em nível de estrutura — o suficiente para a construção começar sem inventar.
4. Comportamento em tela estreita para as telas de operação. O Operador consulta o funil e a fila no celular; configuração e playbook são de computador.
