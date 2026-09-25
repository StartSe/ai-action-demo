# PRD: Sarah Voice SDR

**Projeto:** `toolkit-sarah-voice-sdr`
**Versão:** 1.1
**Status:** para aprovação
**Idioma do produto:** português do Brasil

---

## 1. Problema e oportunidade

Equipes comerciais perdem receita em três pontos previsíveis, e todos são de
telefone:

1. Lead novo esfria. Quem responde um anúncio quer falar agora. Se o retorno vem
   no dia seguinte, o lead já falou com outro. A operação humana não consegue
   responder em minutos, o dia inteiro, todo dia.
2. Base parada não é retomada. Milhares de leads antigos ficam num CRM sem
   ninguém para ligar. Ligar para todos é caro, e escolher quem vale a pena
   exige ligar antes.
3. Reunião marcada não vira reunião realizada. Entre 20% e 40% das reuniões
   agendadas viram falta. Ninguém confirma antes e ninguém resgata depois.

Os três exigem o mesmo trabalho: ligar, conversar, verificar encaixe, marcar,
lembrar e resgatar. Trabalho repetitivo, de roteiro, com critério objetivo de
sucesso, dentro da capacidade atual de um agente de voz em conversas curtas e de
escopo fechado.

Oportunidade: converter esse trabalho em capacidade instalada, sem depender de
contratar, treinar e reter pessoas para discar.

### Fronteira do produto

Entrega do produto: a reunião certa, com a pessoa certa, no calendário certo,
com contexto. Fora do escopo: call center virtual genérico, fechamento de venda
e condução de negociação.

---

## 2. Objetivos e métricas de sucesso

### Métrica norte

Reuniões realizadas por semana, e o custo de cada uma.

Agendamento é métrica intermediária. Reunião agendada que vira falta não tem
valor, e o número infla com insistência do agente: medir agendamento como
métrica norte cria incentivo para agendar com quem não comparece.

#### Como "realizada" é apurada

Marcação manual isolada é inviável como fonte: depende de alguém lembrar de
clicar. A apuração usa três fontes em cascata:

| Ordem | Fonte | Cobertura esperada | Requisito |
|---|---|---|---|
| 1ª | E-mail ao especialista logo após o horário, com dois botões (*compareceu* e *não compareceu*) resolvidos em um clique, sem login | 60% a 80% | RF-514 |
| 2ª | Fila do dia anterior na tela de reuniões: o que ninguém apurou aparece em destaque, com marcação em um clique | +10% a 20% | RF-515 |
| 3ª | Ligação de acompanhamento pós-reunião, que já existe como cadência: a Sarah pergunta ao lead como foi, apura pelo lado dele e ainda reabre o assunto | +5% a 15% | RF-517 |

Regras de apuração:

- Reunião sem apuração por nenhuma das três fontes recebe o estado `não apurada`.
- Inferência de comparecimento é proibida (princípio 1).
- O painel exibe a taxa de apuração ao lado da métrica norte.
- Taxa de apuração abaixo de 70% no período: o painel marca a métrica norte como não confiável e exibe, no lugar, reuniões agendadas com a taxa de comparecimento da amostra apurada (RF-518).

#### Definição de "conversa sem intervenção humana"

Conta como sem intervenção a chamada que termina sem os três eventos seguintes:
transferência para pessoa, item gerado na fila de exceções, e correção manual da
classificação nos 7 dias seguintes. Qualquer um dos três desqualifica a chamada.

### Metas de lançamento (primeiros 90 dias de uso real)

| Indicador | Meta | Por que importa |
|---|---|---|
| Reuniões realizadas / semana | ≥ 15 por operação (ver premissas abaixo) | Prova que a operação gera pipeline |
| Taxa de apuração das reuniões | ≥ 70% | Abaixo disso a métrica norte não é confiável e o painel avisa |
| Taxa de comparecimento | ≥ 70% | Prova que o ciclo de lembrete e resgate funciona |
| Custo por reunião realizada | ≤ 20% do custo de referência humano (fórmula abaixo) | É o argumento comercial do produto |
| Taxa de atendimento das ligações | ≥ 25% em base fria, ≥ 60% em lead de formulário | Abaixo disso o problema é número ou horário, e não roteiro |
| Conversas que chegam ao fim sem intervenção humana | ≥ 85% | Mede autonomia real, conforme a definição acima |
| Chamadas aprovadas na avaliação automática | ≥ 95% | Mede conformidade, e não simpatia |
| Tempo do lead entrar até a primeira ligação | ≤ 3 min quando a origem é formulário | É o que converte lead pago |
| Reclamações e pedidos de bloqueio | ≤ 2% das ligações | Passou disso, a operação está queimando marca |

#### Premissas da meta de volume

A meta de volume é por operação. O cálculo varia em uma ordem de grandeza
conforme a origem do lead. Entradas explícitas para recálculo:

| Entrada | Base fria (campanha) | Lead de formulário (resposta imediata) |
|---|---|---|
| Taxa de atendimento | 25% | 60% |
| Agendam, entre os atendidos | 10% | 35% |
| Comparecimento | 65% | 75% |
| Agendadas necessárias para 15 realizadas | 23 | 20 |
| Atendidas necessárias | 231 | 57 |
| Discagens necessárias por semana | ~925 | ~95 |
| Discagens por dia útil | ~185 | ~19 |
| Números necessários, a 100 discagens/dia por número | 2, com 3 recomendados | 1 |

Teto de 100 discagens diárias por número: limite operacional. Acima dele a
reputação do número cai, a operadora passa a marcar como spam e a taxa de
atendimento despenca (seção 12; RF-708 e RF-709).

Requisito decorrente: campanha em base fria exige no mínimo dois números, com
aviso na prévia da campanha antes do disparo.

As três taxas de entrada são estimativas, a substituir pelos valores medidos nas
primeiras quatro semanas.

#### Fórmula do custo de referência

A meta de custo é declarada como fórmula. Valor absoluto em reais neste
documento envelhece em um trimestre e não é revisado.

```
custo de referência por reunião  =  custo mensal carregado de um SDR humano
                                    ÷ reuniões realizadas por ele no mês

meta do produto                  =  telefonia + voz + modelo + infraestrutura
                                    por reunião realizada  ≤  20% do valor acima
```

Entrada pendente de confirmação: o custo mensal carregado do SDR e as reuniões
realizadas por ele no mês precisam ser preenchidos pelo responsável comercial
antes da aprovação deste documento. Enquanto estiverem vazios, a meta de custo
não é aferível e não deve ser citada em material comercial.

### Objetivos de produto

- **O1.** Operar um ciclo completo de pré-venda por voz sem humano no telefone.
- **O2.** Dar ao operador controle e visibilidade suficientes para confiar na máquina: ouvir qualquer ligação, entender por que ela disse o que disse, e parar tudo em um clique.
- **O3.** Impedir, por desenho, que o agente invente informação, ligue fora de hora, ligue para quem pediu para não ser incomodado ou marque em horário inexistente.
- **O4.** Permitir que um cliente configure a própria operação sozinho, com as próprias credenciais, em menos de uma hora.

---

## 3. Público e papéis

| Papel | Quem é | O que faz no produto | Restrições |
|---|---|---|---|
| Dono | Responsável pela operação comercial | Tudo, incluindo credenciais, exclusão de dados e encerramento da conta | Nenhuma |
| Administrador | Quem configura e ajusta a máquina | Sarah, playbooks, campanhas, números, especialistas, política de discagem, equipe | Não vê credencial salva e não exclui a conta |
| Operador | Quem trabalha o funil todo dia | Funil, leads, ligações manuais, fila de exceções, resultado de reunião | Não altera playbook, credenciais nem política de discagem |
| Observador | Liderança, cliente final, auditoria | Painel, funil, chamadas, relatórios | Somente leitura |

O Operador passa o dia na aplicação e define a ergonomia do produto. O
Administrador entra para configurar e sai.

---

## 4. Princípios do produto

Decisões fixas. Dúvida de implementação se resolve por elas.

1. Dado factual vem do sistema. Horário livre, etapa do funil, bloqueio, agenda
   e dado de lead são resposta do backend. O modelo define a forma da fala,
   nunca o conteúdo factual.
2. Toda ligação declara um propósito. O propósito determina o roteiro e o
   conjunto de ferramentas disponíveis. Ferramenta fora do propósito não é
   oferecida ao modelo.
3. A ferramenta devolve a frase pronta para leitura. O agente não formata data,
   não converte fuso e não calcula duração. Erro nessas operações produz reunião
   em horário incorreto.
4. Todo controle exposto na interface está ligado ao comportamento. Controle sem
   efeito é defeito, e não item de escopo futuro.
5. Ação irreversível gera registro com autor, hora e motivo. Cobre discagem,
   bloqueio e exclusão de dado.
6. A automação tem teto diário e parada de emergência, ambos acessíveis em um
   clique.
7. Ferramenta do agente é endereço HTTP com suíte de contrato desde o primeiro
   dia. Comportamento crítico sem teste automático não entra em produção.

---

## 5. Camadas de confiança

Cada requisito funcional carrega uma marca de camada. A marca indica a origem do
risco de construção, sem juízo sobre o mérito do requisito.

| Marca | Significado |
|---|---|
| `[precedente]` | Existe implementado e exercitado numa base de referência interna. O risco de construção é baixo porque o desenho já foi provado |
| `[parcial]` | Existe pela metade na referência. Parte é cópia de padrão conhecido, parte é nossa |
| `[aposta]` | Não existe na referência. É desenho nosso, risco nosso. Cada um traz a justificativa e a forma barata de validar |

As evidências estão no Apêndice A, que é material interno de planejamento e não
acompanha o produto.

Contagem: de 135 requisitos funcionais, 70 são `[precedente]`, 23 são
`[parcial]` e 42 são `[aposta]`.

Distribuição por área:

- `[precedente]`, núcleo mecânico: discar com guarda, publicar o agente, injetar contexto, finalizar a chamada, ferramentas de agenda, ciclo de lembrete e resgate, cadências, campanhas, cofre de credenciais, privacidade.
- `[aposta]`, camada de operação: ficha do lead com linha do tempo, fila de exceções, ensaio do agente, auditoria, freio de emergência, correção de classificação.
- `[aposta]`, camada de integração externa: calendário do especialista, recebimento de lead por endereço público, webhook de saída.

O risco de construção está concentrado nas camadas de operação e de integração
externa.

---

## 6. Escopo

### 6.1 Dentro

Ligação de saída e de entrada. Qualificação com registro no funil. Agenda e
agendamento. Confirmação e resgate de falta. Cadências de retomada. Discagem em
lote. Gravação, transcrição e avaliação de cada ligação. Configuração
autosserviço com credenciais do próprio cliente. Conformidade de discagem e
privacidade.

### 6.2 Fora, explicitamente

| Fora | Por quê |
|---|---|
| WhatsApp, SMS conversacional e e-mail como canal de conversa | Este produto fala por telefone. Multicanal duplica superfície e adianta problema que não temos. **Emenda de 2026-09-24:** a mensagem de ida com resposta fechada antes da ligação (aviso, aceite, horário, recusa) entra, e está em `docs/pre-contato.md`; conversa por texto continua fora |
| Caixa de entrada de mensagens | Consequência do item acima |
| Proposta, contrato, assinatura e cobrança | Quem fecha é a pessoa |
| Supervisor entrando na chamada ao vivo | Vale muito e custa muito. Fica para depois que a operação tiver volume |
| Clonagem de voz | Impressiona em demonstração e não move conversão. Clonar a voz de uma pessoa real ainda levanta questão de consentimento que não queremos responder no lançamento. Catálogo de vozes resolve |
| Vários idiomas | O mercado do lançamento é Brasil |
| Aplicativo móvel | A operação é de mesa |
| Teste A/B de playbook com divisão de tráfego | Só faz sentido com volume que ainda não existe |

---

## 7. Fatias de entrega

Oito fatias. Cada uma termina em entrega demonstrável e nenhuma depende de fatia
posterior. Ordem: provar a ligação cedo, escalar depois.

---

### F0. Fundação

**Entrega:** conta, acesso e dados isolados.

- Autenticação por e-mail e senha, com recuperação.
- Conta única por cliente, com papéis e convite por link.
- Isolamento por conta em todas as tabelas, verificado por teste.
- Cofre de credenciais por conta, cujo valor nunca chega ao navegador.
- Registro de auditoria gravando toda ação sensível.

**Critérios de aceite**
- [ ] Um usuário da conta A, autenticado, recebe zero linhas ao consultar qualquer tabela da conta B, comprovado por teste automatizado que roda no CI.
- [ ] Uma credencial salva pela interface não pode ser lida de volta por nenhuma chamada feita pelo navegador, e uma função de servidor lê a mesma credencial com sucesso.
- [ ] Convidar, aceitar convite, trocar papel e remover membro funcionam ponta a ponta.
- [ ] Papel Operador recebe negativa explícita ao tentar abrir a política de discagem.

---

### F1. Entrada de leads

**Entrega:** leads dentro do sistema, limpos e sem duplicata.

- Importação de planilha com mapeamento de colunas, normalização de telefone, detecção de duplicados com escolha, prévia e relatório de erro por linha.
- Cadastro manual.
- Recebimento de lead por endereço público com chave própria da conta.
- Lista de leads com busca, filtros, ordenação e ações em lote.
- Resolução de cidade, estado e fuso a partir do DDD.

**Critérios de aceite**
- [ ] Planilha com 1.000 linhas, 30 telefones malformados e 50 duplicados é importada mostrando exatamente esses números na prévia, e nada é gravado antes da confirmação.
- [ ] O mesmo arquivo importado duas vezes não cria lead duplicado.
- [ ] Uma requisição ao endereço público com a chave da conta cria o lead em menos de 2 s. Com chave errada recebe 401 e não cria nada.
- [ ] Um telefone de DDD 48 resulta em lead com fuso de Santa Catarina.

---

### F2. A ligação *(fatia decisiva)*

**Entrega:** a Sarah liga para um número de teste, conversa, e a chamada fica
registrada com gravação e transcrição.

- Agente: identidade, escolha de voz, primeira fala, playbook de descoberta.
- Publicação do agente no provedor de voz, com estado visível.
- Linha telefônica configurada, recebendo e ligando.
- Discador manual com propósito.
- Guarda de discagem completa.
- Contexto injetado no início de cada chamada.
- Pós-chamada em via dupla: aviso do provedor e varredura periódica.
- Gravação e transcrição na ficha da chamada.
- Duração máxima de chamada por conta.
- Freio de emergência e teto diário. Ficam aqui, e não na fatia seguinte, porque são inegociáveis antes do primeiro disparo de qualquer natureza.

**Critérios de aceite**
- [ ] Do painel, discar para um celular de teste: toca em até 8 s, a Sarah se apresenta com a primeira fala configurada e avisa que a chamada pode ser gravada.
- [ ] Encerrada a ligação, em até 60 s a ficha mostra duração, custo, gravação reproduzível e transcrição com identificação de quem falou.
- [ ] Desligar o aviso do provedor e repetir: a varredura periódica finaliza a chamada mesmo assim, em até 5 min, sem duplicar registro.
- [ ] Discar para um número na lista de bloqueio devolve recusa com o motivo em português e não consome crédito.
- [ ] Discar às 22h devolve recusa citando a janela permitida no fuso do lead.
- [ ] Chamada que atinge a duração máxima é encerrada pelo sistema, registrada como tal, e o custo para de correr.
- [ ] O freio de emergência encerra as chamadas em curso e impede novas discagens em até 10 s.

---

### F3. Controles de operação *(portão para lead real)*

**Entrega:** os três controles que tornam a autonomia aceitável.

- Ensaio: conversar com a Sarah por texto e por voz, sem telefone, com perfis de lead simulados.
- Transferir para humano, com destino configurado.
- Fila de exceções em versão mínima, cobrindo pedido de humano, pedido de bloqueio e falha repetida.
- Bloqueio imediato ao pedido de não perturbe.
- Encerramento cordial e marcação quando é pessoa errada.

**Critérios de aceite**
- [ ] No ensaio, uma conversa completa acontece sem telefone, e as ferramentas chamadas aparecem em ordem.
- [ ] Pedir "quero falar com uma pessoa" faz a Sarah transferir ou, não havendo quem atender, criar item na fila com o trecho da conversa e o áudio.
- [ ] Dizer "não me liga mais" bloqueia o número antes do fim da chamada, e a discagem seguinte para o mesmo número é recusada.
- [ ] Dizer "não é comigo, número errado" faz a Sarah encerrar em até duas falas e marcar o número, e a rediscagem é recusada.
- [ ] Resolver um item da fila registra autor e hora e o remove da lista.

> **Portão.** A F2 libera discagem apenas para números de teste cadastrados pela
> conta. Discagem para lead real exige a F3 completa. O portão é aplicado pelo
> sistema, e não por convenção de equipe.

---

### F4. O resultado
**Entrega:** a ligação move o funil sozinha.

- Ferramenta de qualificação, obrigatória antes de encerrar em descoberta.
- Classificação de retaguarda quando a ferramenta não foi chamada.
- Funil em quadro, com etapas configuráveis de identificador fixo.
- Ficha do lead com linha do tempo unificada.
- Sentimento por chamada.
- Avaliação automática por critérios objetivos.
- Correção humana da classificação.
- Fila de exceções completa, com limiares configuráveis.

**Critérios de aceite**
- [ ] Depois de uma ligação de descoberta, o lead aparece na etapa correta, com pontuação, temperatura e resumo da dor, sem ninguém digitar.
- [ ] Encerrando a ligação abruptamente antes da ferramenta de qualificação, a classificação de retaguarda produz o mesmo tipo de resultado em até 2 min, com confiança menor registrada.
- [ ] Renomear a coluna "Qualificado" para "Tem fit" não quebra nenhuma automação.
- [ ] A ficha do lead mostra, em ordem única, ligações com áudio, mudanças de etapa com autor, reuniões e bloqueios.
- [ ] Baixar o limiar de sentimento faz a chamada seguinte com aquele sentimento aparecer na fila; subir o limiar deixa de gerar item.
- [ ] Corrigir a classificação registra autor e hora e não é sobrescrita por processamento posterior.

---

### F5. A agenda

**Entrega:** a Sarah marca reunião em agenda real.

- Especialistas, disponibilidade semanal, bloqueios, teto diário e antecedência.
- Roteamento do especialista por área, rodízio ou fixo.
- Ferramentas de consultar agenda e agendar.
- Calendário externo conectado: ocupação lida e evento criado.
- Tela de reuniões com agenda e ficha.
- Convite por e-mail para lead e especialista.

**Critérios de aceite**
- [ ] A Sarah oferece somente horários que estão livres na disponibilidade e livres no calendário externo do especialista.
- [ ] Duas ligações simultâneas não marcam o mesmo horário para o mesmo especialista.
- [ ] Especialista com teto de 6 reuniões/dia atingido deixa de ser oferecido.
- [ ] Reunião marcada aparece no calendário do especialista em até 30 s e gera convite por e-mail para os dois lados.
- [ ] Antecedência mínima de 2 h impede a Sarah de oferecer horário daqui a 30 min.

---

### F6. A persistência

**Entrega:** o ciclo se fecha sozinho.

- Lembrete antes da reunião, com confirmação e remarcação na hora.
- Detecção de falta e resgate, com teto de tentativas.
- Cadências com gatilho, passos e condições de saída.
- Modelos prontos de cadência.
- Política de retentativa por resultado da ligação.

**Critérios de aceite**
- [ ] Reunião marcada para daqui a 20 min recebe ligação de lembrete na janela configurada, uma única vez, mesmo com a rotina rodando várias vezes.
- [ ] Confirmando no lembrete, a reunião fica confirmada; pedindo outro horário, é remarcada na mesma ligação.
- [ ] Reunião sem presença marcada gera ligação de resgate e, esgotadas as tentativas, move o lead para perdido com o motivo.
- [ ] Lead que agenda durante uma cadência sai da cadência imediatamente.
- [ ] Ligação sem atendimento é reprogramada conforme a política; caixa postal é reprogramada para outro turno.

---

### F7. A escala

**Entrega:** volume com controle.

- Campanhas com público, janela, simultaneidade e retentativa.
- Prévia obrigatória antes do disparo.
- Acompanhamento ao vivo, pausa e cancelamento.
- Custo acumulado e custo por reunião da campanha.
- Detecção de secretária eletrônica.
- Saúde e rodízio de números.
- Busca dentro das transcrições.
- Webhook de saída para sistema externo.

**Critérios de aceite**
- [ ] A prévia mostra quantos entram, quantos saem e por quê, com estimativa de duração e de custo, antes de qualquer discagem.
- [ ] Campanha de 200 leads respeita simultaneidade e janela; pausar interrompe em até 30 s sem perder a fila.
- [ ] Ligação atendida por secretária eletrônica é encerrada sem a Sarah falar o roteiro inteiro e é marcada como tal.
- [ ] Buscar uma expressão devolve as chamadas cujas transcrições a contêm, com o trecho destacado.
- [ ] Reunião marcada dispara chamada ao endereço externo configurado, com nova tentativa em caso de falha.

Regra de liberação: campanha em lote exige 50 ligações manuais com taxa de
conversão medida na conta. Campanha amplifica o roteiro vigente, inclusive
quando ele é ruim.

---

## 8. Requisitos funcionais

Numeração por área, estável e citável. A marca indica a camada de confiança.

### 8.1 Conta, acesso e segurança (RF-0xx)

| # | Requisito | Camada |
|---|---|---|
| RF-001 | O sistema deve autenticar por e-mail e senha, com recuperação por e-mail | `[precedente]` |
| RF-002 | Cada cliente opera dentro de uma conta; todo dado pertence a uma conta | `[precedente]` |
| RF-003 | O sistema deve suportar os papéis Dono, Administrador, Operador e Observador, com as restrições da seção 3 | `[parcial]`: a referência tem dois papéis; os quatro são nossos |
| RF-004 | Todo acesso a dado deve ser filtrado por conta na camada do banco, não na aplicação | `[precedente]` |
| RF-005 | Novos membros entram por convite com link e papel definido, revogável | `[precedente]` |
| RF-006 | Credenciais de provedor são guardadas cifradas por conta e nunca retornam ao navegador | `[precedente]` |
| RF-007 | A resolução de credencial segue cofre da conta, depois configuração do recurso, depois variável global | `[precedente]` |
| RF-008 | Ações sensíveis (discar, bloquear, excluir dado, alterar política e alterar credencial) são registradas com autor, hora e alvo | `[aposta]`: a referência registra apenas exportação de contatos. Validar: escrever o registro desde o primeiro dia, custa quase nada e é impossível reconstituir depois |
| RF-009 | O registro de auditoria é consultável na interface com filtro por autor, tipo e período | `[aposta]` |
| RF-010 | Toda conta tem um teto diário de ligações, configurável, que bloqueia discagem ao ser atingido | `[aposta]`: proteção contra erro de configuração e contra laço infinito de automação. Validar com um contador simples por conta e dia |
| RF-011 | Existe parada de emergência que encerra chamadas em curso e impede novas discagens, acessível em um clique | `[aposta]`: inegociável em produto que liga sozinho. Validar disparando durante uma campanha de teste |

### 8.2 Leads (RF-1xx)

| # | Requisito | Camada |
|---|---|---|
| RF-101 | Importar leads de planilha com mapeamento de colunas | `[precedente]` |
| RF-102 | Normalizar telefone para formato internacional, assumindo Brasil quando não houver país | `[precedente]` |
| RF-103 | Detectar duplicados na importação e permitir ignorar, atualizar ou criar | `[precedente]` |
| RF-104 | Exibir prévia com válidos, inválidos e duplicados antes de gravar qualquer linha | `[precedente]` |
| RF-105 | Devolver relatório de erro por linha ao fim da importação | `[parcial]`: a referência valida, mas não devolve relatório linha a linha |
| RF-106 | Cadastrar lead manualmente | `[precedente]` |
| RF-107 | Receber lead por endereço público, com chave por conta, criando o lead e podendo iniciar ligação | `[aposta]`: é o caminho de maior valor comercial e não existe na referência. Validar com um formulário de teste apontando para o endereço |
| RF-108 | Ligação recebida de número desconhecido cria lead com origem registrada | `[precedente]` |
| RF-109 | Resolver cidade, estado e fuso a partir do DDD no momento da criação | `[aposta]`: a coluna de fuso existe na referência mas não é preenchida a partir do DDD. Validar com tabela estática de DDD |
| RF-110 | Listar leads com busca por nome, telefone e e-mail | `[precedente]` |
| RF-111 | Filtrar por etapa, temperatura, origem, campanha, última atividade, com reunião e bloqueado | `[parcial]`: a referência filtra por menos dimensões |
| RF-112 | Selecionar vários leads e aplicar ação em lote: cadência, campanha, bloqueio, exportação, exclusão | `[parcial]` |
| RF-113 | Exibir ficha do lead com identidade, situação, resumo, linha do tempo unificada, próximas ações e ações disponíveis | `[aposta]`: a referência tem apenas lista, sem ficha nem linha do tempo. É a tela onde o Operador trabalha; sem ela o produto não é operável |
| RF-114 | Mesclar dois leads duplicados preservando histórico dos dois | `[precedente]` |
| RF-115 | Exportar leads filtrados | `[precedente]` |
| RF-116 | Registrar nota manual no lead | `[aposta]` |

### 8.3 Funil (RF-2xx)

| # | Requisito | Camada |
|---|---|---|
| RF-201 | Exibir quadro com uma coluna por etapa e os leads de cada uma | `[precedente]` |
| RF-202 | Mover lead entre etapas arrastando, registrando a mudança como decisão humana | `[precedente]` |
| RF-203 | Etapas têm identificador imutável e nome editável; toda automação referencia o identificador | `[aposta]`: na referência a automação procura a etapa **pelo nome em português**, e renomear a coluna quebra a classificação. Correção obrigatória, custo próximo de zero se feita no início |
| RF-204 | Marcar etapas como desfecho de ganho e de perda | `[precedente]` |
| RF-205 | Sinalizar no cartão quando a movimentação foi feita pelo agente | `[precedente]` |
| RF-206 | Filtrar o quadro por período, origem e campanha | `[parcial]` |
| RF-207 | Configurar etapas: criar, renomear, reordenar, definir cor | `[parcial]` |

### 8.4 O agente (RF-3xx)

| # | Requisito | Camada |
|---|---|---|
| RF-301 | Configurar identidade: nome, empresa, o que oferece, o que nunca afirmar, para quem transferir | `[precedente]` |
| RF-302 | Escolher voz de catálogo, com audição em português | `[precedente]` |
| RF-303 | Ajustar velocidade e estabilidade da fala | `[precedente]` |
| RF-304 | Definir a primeira fala com variáveis de lead e empresa, audível na configuração | `[precedente]` |
| RF-305 | Gerar rascunho de roteiro a partir de uma descrição do negócio em linguagem natural | `[precedente]` |
| RF-306 | Manter um playbook por propósito, em três camadas: regras da casa travadas, roteiro do propósito editável por administrador, e jeito da casa livre | `[parcial]`: a referência tem as regras travadas como constante de código, sem edição e sem versão |
| RF-307 | Versionar playbooks com histórico, comparação e publicação explícita | `[aposta]`: a referência tem tabelas de versão e um módulo cliente que **nenhum arquivo importa**. Na prática é nosso. Validar com versão simples: uma publicada por propósito, mais histórico. Sem árvore de ramificações |
| RF-308 | Registrar, em cada chamada, a versão de playbook usada | `[aposta]`: é o que permite explicar meses depois por que o agente disse algo |
| RF-309 | Restringir as ferramentas oferecidas ao agente conforme o propósito da chamada | `[aposta]`: na referência as cinco ferramentas são oferecidas em toda chamada, e a restrição é apenas instrução de texto no roteiro. Instrução de texto é sugestão; ausência de ferramenta é garantia |
| RF-310 | Manter base de conhecimento consultável pelo agente durante a conversa | `[precedente]` |
| RF-311 | Indicar estado de publicação: rascunho, publicado, ou publicado com alterações pendentes | `[parcial]`: a referência indica sincronizado, mas não detecta divergência |
| RF-312 | Ensaiar por texto e por voz, sem telefone, com perfis de lead simulados, mostrando as ferramentas chamadas | `[aposta]`: sem ensaio, o único jeito de ajustar roteiro é ligar para gente real. Validar com uma conversa de texto simples antes de investir na de voz |
| RF-313 | Publicar o agente no provedor de voz, propagando roteiro, voz, ferramentas, contexto e critérios de avaliação | `[precedente]` |
| RF-314 | Definir critérios objetivos de avaliação aplicados ao fim de cada chamada | `[precedente]` |

### 8.5 Ligações (RF-4xx)

| # | Requisito | Camada |
|---|---|---|
| RF-401 | Discar manualmente escolhendo lead, propósito e número de origem | `[precedente]` |
| RF-402 | Recusar discagem fora da janela permitida, informando a janela no fuso do lead | `[parcial]`: a referência usa o fuso da conta, não o do lead |
| RF-403 | Recusar discagem para número na lista de bloqueio | `[precedente]` |
| RF-404 | Recusar discagem antes do intervalo mínimo desde a última tentativa | `[precedente]` |
| RF-405 | Recusar discagem após o teto diário de tentativas ao mesmo número | `[precedente]` |
| RF-406 | Registrar toda tentativa, inclusive as recusadas, com o motivo | `[precedente]` |
| RF-407 | Toda recusa traz motivo em português e a alternativa possível | `[precedente]` |
| RF-408 | Injetar no início de cada chamada o contexto do lead, do propósito e da reunião em jogo | `[precedente]` |
| RF-409 | Atender ligações recebidas conforme o comportamento configurado: agente atende, transfere ou recado | `[precedente]` |
| RF-410 | Finalizar a chamada por aviso do provedor e, independentemente, por varredura periódica, de forma idempotente | `[precedente]` |
| RF-411 | Guardar gravação com acesso por endereço temporário, sem expor credencial | `[precedente]` |
| RF-412 | Guardar transcrição com identificação de quem falou | `[precedente]` |
| RF-413 | Listar chamadas com filtros por período, propósito, resultado, campanha, número e especialista | `[parcial]` |
| RF-414 | Exibir ficha da chamada com reprodutor, transcrição, ferramentas usadas em linguagem humana, avaliação e resultado | `[parcial]`: a referência mostra reprodutor e transcrição, sem as ferramentas nem a avaliação |
| RF-415 | Permitir corrigir manualmente a classificação de uma chamada, com registro | `[aposta]`: é o laço de realimentação que ensina onde o roteiro falha |
| RF-416 | Acompanhar chamadas em andamento e encerrá-las | `[precedente]` |
| RF-417 | Reprogramar tentativa conforme o resultado: sem atendimento, ocupado, caixa postal, número inválido | `[parcial]`: a referência tem a política dentro de campanha; deve valer para toda ligação |
| RF-418 | Detectar secretária eletrônica e encerrar sem executar o roteiro | `[aposta]`: atenção: a referência tem um **controle de interface que grava a preferência e nunca é lido na hora de discar**. Configuração morta é pior que ausência, porque o cliente acredita que está protegido |
| RF-419 | Buscar texto dentro das transcrições | `[aposta]`: transforma o histórico em inteligência comercial |
| RF-420 | Registrar quando o aviso de gravação foi dado, por chamada | `[aposta]`: a coluna existe na referência e nunca é preenchida |
| RF-421 | Definir duração máxima de chamada por conta; ao atingir, o sistema encerra, registra o motivo e interrompe o custo | `[parcial]`: a referência tem um teto por campanha e um limite fixo embutido na publicação do agente; teto por conta, com encerramento registrado, é nosso. É controle de custo direto: uma conversa que não termina é a forma mais silenciosa de queimar crédito |
| RF-422 | Ao identificar que fala com pessoa errada ou com terceiro, o agente encerra cordialmente em até duas falas, marca o número como incorreto e o sistema recusa rediscagem para ele | `[parcial]`: a categoria de número errado existe no mapeamento de resultado da referência, mas não impede nova discagem. Sem o bloqueio, a automação liga repetidamente para quem nunca foi o alvo, que é o caminho mais curto para reclamação |

### 8.6 Reuniões e especialistas (RF-5xx)

| # | Requisito | Camada |
|---|---|---|
| RF-501 | Cadastrar especialistas com nome, área, modalidades, duração padrão, link da sala e e-mail | `[parcial]`: a referência não guarda link nem e-mail |
| RF-502 | Definir disponibilidade semanal por especialista | `[precedente]` |
| RF-503 | Registrar bloqueios pontuais | `[precedente]` |
| RF-504 | Definir teto de reuniões por dia por especialista | `[aposta]`: sem isso o agente lota a agenda de uma pessoa |
| RF-505 | Definir antecedência mínima e máxima para agendamento | `[parcial]`: a referência só evita os 30 min seguintes |
| RF-506 | Rotear o especialista por área, por rodízio entre disponíveis, ou fixo | `[aposta]`: a referência filtra por área e não distribui carga |
| RF-507 | Conectar o calendário externo do especialista, lendo ocupação real | `[aposta]`: a referência tem a tabela e **nenhuma linha de código a usa**. Sem isso o agente marca em cima de compromisso existente, o que destrói a confiança do especialista no produto |
| RF-508 | Criar o evento da reunião no calendário do especialista | `[aposta]` |
| RF-509 | Enviar convite por e-mail a lead e especialista | `[aposta]` |
| RF-510 | Exibir agenda semanal e lista de reuniões, filtráveis | `[precedente]` |
| RF-511 | Exibir ficha da reunião com resumo de passagem para o especialista e histórico completo | `[parcial]` |
| RF-512 | Marcar manualmente reunião como realizada, falta ou cancelada com motivo | `[precedente]` |
| RF-513 | Impedir dois agendamentos simultâneos no mesmo horário do mesmo especialista | `[aposta]`: a referência checa conflito ao gerar horários, sem travar no momento da gravação |
| RF-514 | Enviar ao especialista, logo após o horário da reunião, um e-mail com dois botões (compareceu e não compareceu) resolvidos em um clique, sem login, por token de uso único com validade de 7 dias, com um lembrete se não houver resposta em 24 h | `[aposta]`: é a fonte primária da métrica norte. Sem ela, o número que define o sucesso do produto depende de alguém lembrar de clicar dentro da aplicação |
| RF-515 | Destacar, na tela de reuniões, as reuniões do dia anterior ainda não apuradas, com marcação em um clique | `[aposta]`: segunda fonte de apuração, de fricção mínima |
| RF-516 | Reunião que nenhuma fonte apurou fica com estado **não apurada** e nunca tem o desfecho inferido | `[aposta]`: inferir comparecimento violaria o princípio 1 e contaminaria a métrica que justifica o produto |
| RF-517 | A ligação de acompanhamento pós-reunião apura o comparecimento pelo lado do lead quando o especialista não respondeu | `[parcial]`: a cadência pós-reunião existe como modelo na referência; usá-la para apurar é nosso |
| RF-518 | Exibir a taxa de apuração ao lado da métrica norte e, quando ela cair abaixo do limiar configurado (padrão 70%), marcar a métrica norte como não confiável no período e exibir no lugar reuniões agendadas com a taxa de comparecimento da amostra apurada | `[aposta]`: é o que impede o produto de reportar com confiança um número que não tem lastro |

### 8.7 Automação (RF-6xx)

| # | Requisito | Camada |
|---|---|---|
| RF-601 | Ligar para lembrar da reunião antes do horário, em janela configurável, uma única vez | `[precedente]` |
| RF-602 | Confirmar presença na ligação de lembrete | `[precedente]` |
| RF-603 | Remarcar ou cancelar na ligação de lembrete | `[precedente]` |
| RF-604 | Detectar falta após o horário e disparar ligação de resgate | `[precedente]` |
| RF-605 | Limitar tentativas de resgate e mover o lead para perdido ao esgotar | `[precedente]` |
| RF-606 | Montar cadências com gatilho e passos de espera e ligação | `[precedente]` |
| RF-607 | Definir condições de saída da cadência: agendou, bloqueou, chegou a desfecho, humano assumiu | `[aposta]`: a referência não tem saída automática, o que faz o agente ligar para quem já agendou |
| RF-608 | Oferecer modelos prontos de cadência | `[precedente]` |
| RF-609 | Acompanhar inscrições ativas, passo atual, próximo disparo e erros | `[precedente]` |
| RF-610 | Ligar para lead recém-recebido dentro da janela de resposta configurada | `[aposta]`: decorre de RF-107 |
| RF-611 | Expurgar gravação e transcrição no prazo de retenção configurado | `[precedente]` |
| RF-612 | Avisar quando crédito ou cota de provedor cair abaixo do limite | `[precedente]` |
| RF-613 | Exibir a última execução e o último erro de cada rotina de fundo | `[aposta]`: rotina silenciosamente morta é o defeito mais difícil de perceber nesta categoria |

### 8.8 Campanhas (RF-7xx)

| # | Requisito | Camada |
|---|---|---|
| RF-701 | Criar campanha com nome, público, propósito, playbook, números, janela, simultaneidade, retentativa e início | `[precedente]` |
| RF-702 | Definir público por filtro salvo de leads ou por planilha | `[precedente]` |
| RF-703 | Exibir prévia com entrantes, descartados e motivo, mais estimativa de duração e custo, antes do disparo | `[parcial]`: a referência mostra válidos e inválidos, sem estimativa |
| RF-704 | Acompanhar execução ao vivo com fila, chamadas em curso e resultados | `[precedente]` |
| RF-705 | Pausar, retomar e cancelar campanha | `[precedente]` |
| RF-706 | Exibir custo acumulado e custo por reunião da campanha | `[aposta]` |
| RF-707 | Respeitar simultaneidade máxima e janela de discagem | `[precedente]` |
| RF-708 | Distribuir o volume entre vários números | `[aposta]` |
| RF-709 | Exibir saúde por número: volume, taxa de atendimento e sinal de bloqueio | `[aposta]`: taxa de atendimento caindo num número é bloqueio de operadora, e o operador precisa ver antes de queimar a base |

### 8.9 Conformidade e privacidade (RF-8xx)

| # | Requisito | Camada |
|---|---|---|
| RF-801 | Definir janela de discagem por dia da semana | `[precedente]` |
| RF-802 | Definir intervalo mínimo entre tentativas ao mesmo número | `[precedente]` |
| RF-803 | Definir teto de tentativas por dia por número | `[precedente]` |
| RF-804 | Manter lista de bloqueio com motivo e origem, com inclusão manual, importação e remoção registrada | `[precedente]` |
| RF-805 | Bloquear o número imediatamente ao pedido do interlocutor, durante a chamada | `[aposta]`: na referência o bloqueio depende da ferramenta de qualificação no fim; quem desliga antes continua sendo chamado. É exposição jurídica real |
| RF-806 | Ligar e desligar a gravação por conta, com o texto do aviso configurável | `[precedente]` |
| RF-807 | Definir prazo de retenção de gravação e de transcrição, com expurgo automático | `[precedente]` |
| RF-808 | Excluir todos os dados de um lead sob solicitação | `[precedente]` |
| RF-809 | Exportar todos os dados de um lead sob solicitação | `[parcial]` |
| RF-810 | Registrar o consentimento e o momento em que o aviso foi dado | `[aposta]` |

### 8.10 Painel e operação (RF-9xx)

| # | Requisito | Camada |
|---|---|---|
| RF-901 | Exibir reuniões realizadas e custo por reunião realizada no período | `[aposta]`: a referência não calcula custo nenhum no painel, embora guarde o custo de cada chamada |
| RF-902 | Exibir o funil do período com taxa de passagem entre etapas | `[parcial]` |
| RF-903 | Exibir ligações, atendidas, taxa de atendimento e duração média | `[precedente]` |
| RF-904 | Exibir reuniões marcadas, confirmadas, realizadas, faltas e taxa de comparecimento | `[precedente]` |
| RF-905 | Exibir nota média da avaliação e distribuição de sentimento | `[parcial]` |
| RF-906 | Exibir saúde: crédito, cota, números ativos e rotinas | `[parcial]` |
| RF-907 | Exibir próximas reuniões e últimas ligações | `[precedente]` |
| RF-908 | Manter fila de exceções com contexto, áudio e ação em um clique | `[aposta]`: a referência tem notificações e sino, sem fila de trabalho. É a tela que torna a autonomia honesta |
| RF-909 | Alimentar a fila com: pedido de humano, pedido de bloqueio, sentimento muito negativo, falha repetida de ligação, reunião sem especialista, chamada reprovada na avaliação e crédito baixo | `[aposta]` |
| RF-910 | Marcar item da fila como resolvido, com autor | `[aposta]` |
| RF-911 | Conduzir configuração inicial em assistente com checklist persistente, indicando o que cada pendência impede | `[precedente]` |
| RF-912 | Exigir uma ligação de teste bem-sucedida antes de liberar discagem em lote | `[aposta]`: impede que a primeira ligação de uma conta mal configurada seja para um cliente real |
| RF-913 | Exibir estado real de cada provedor: conectado, crédito, cota, com teste de conexão | `[precedente]` |
| RF-914 | Notificar sistema externo quando reunião é marcada ou lead é qualificado, com nova tentativa em caso de falha | `[aposta]`: a referência registra entregas de webhooks **recebidos**, o que é outra coisa |
| RF-915 | Os gatilhos da fila de exceções têm limiares configuráveis por conta, com padrões explícitos: sentimento agregado ≤ −0,5; 3 tentativas consecutivas sem sucesso para o mesmo número; 1 ou mais critérios de avaliação reprovados; crédito abaixo do valor definido | `[aposta]`: "sentimento muito negativo" e "falha repetida" são adjetivos, não valores. Sem limiar explícito e ajustável, a fila ou fica vazia ou vira ruído, e nos dois casos o operador para de olhar |

---

## 9. As ferramentas do agente

Sete ferramentas, acionadas durante a conversa. Função comum: impedir que o
agente produza informação não verificada. A coluna de camada refere-se à
ferramenta como especificada aqui.

| Ferramenta | Entrada | Devolve | Regra que impõe | Propósitos | Camada |
|---|---|---|---|---|---|
| Consultar agenda | Área ou especialista, duração, janela de busca | Até 4 horários livres, cada um com identificador, e a frase pronta para leitura | O agente não pode oferecer horário que não veio daqui | Todos | `[precedente]` |
| Agendar reunião | Identificador do especialista e do horário, modalidade, observações | Confirmação de gravação e a frase de confirmação pronta | Só aceita identificadores vindos da consulta anterior | Descoberta, retomada | `[precedente]` |
| Confirmar presença | Identificador da reunião | Frase de confirmação | Indisponível fora do lembrete | Lembrete | `[precedente]` |
| Remarcar ou cancelar | Identificador da reunião, ação, novo horário, motivo | Frase de confirmação | Remarcar exige horário vindo da consulta | Lembrete, resgate | `[precedente]` |
| Registrar qualificação | Etapa, temperatura, sentimento, dor, próxima ação, dados do lead | Confirmação curta | Campo não confirmado vai vazio; inventar é proibido | Descoberta, retomada, resgate | `[precedente]` |
| Transferir para pessoa | Motivo, urgência | Confirmação, ou aviso de que ninguém está disponível | O agente nunca improvisa em tema sensível | Todos | `[aposta]` |
| Registrar não perturbe | Motivo | Confirmação | Efeito imediato, sem esperar o fim da chamada | Todos | `[aposta]` |

### Contrato comum

1. Autenticação por segredo compartilhado em cabeçalho. Sem ele, a chamada é recusada.
2. Identificadores viajam por cabeçalho técnico, nunca pela conversa. Pedir a um modelo que memorize um identificador de 36 caracteres é garantir defeito.
3. A resposta traz a frase pronta em português, e o agente lê.
4. Resposta em até 2 s. Acima disso o silêncio na ligação fica perceptível e o interlocutor desliga.
5. Falha devolve frase de contorno, nunca erro técnico: *"deixa eu confirmar isso com o time e já te retorno"*.
6. São endereços HTTP comuns, com suíte de contrato no CI cobrindo carga válida, campo faltante, segredo inválido, conversa inexistente e horário já ocupado.

---

## 10. Provedores externos

| Provedor | Papel exato | O que quebra sem ele | Plano de contorno |
|---|---|---|---|
| Voz conversacional | Reconhece a fala, decide a resposta, fala, controla a vez e aceita interrupção. Guarda o agente publicado e chama nossos endereços de contexto e ferramenta | Não há ligação | Nenhum a curto prazo. É a dependência mais profunda do produto |
| Telefonia | Número, linha, estado da chamada, transferência para humano, detecção de secretária eletrônica | Não há telefone | Trocável com esforço médio; a camada de discagem é isolada por desenho |
| Plataforma de dados | Identidade, permissão, banco isolado por conta, guarda de gravações, funções de servidor e agendador | Não há aplicação | Nenhum |
| Modelo de linguagem (`claude-opus-5`, US$ 5 por milhão de tokens de entrada e US$ 25 de saída) | Raciocínio **fora** da ligação: classificar a transcrição quando a ferramenta não foi chamada, escrever o resumo de passagem, avaliar sentimento, redigir a justificativa da avaliação, gerar rascunho de roteiro | Classificação e resumos ficam manuais; a ligação continua funcionando | Degrada com elegância: a ferramenta de qualificação ao vivo já cobre o caso principal |
| Calendário | Ocupação real do especialista e criação do evento | O agente marca em cima de compromisso existente | Disponibilidade interna apenas, com risco de conflito |
| E-mail transacional | Convite de reunião, convite de equipe, aviso de crédito | Ninguém recebe convite | Envio manual |
| CRM, a partir da F7 | Espelha lead, qualificação e reunião onde o time já trabalha | Time olha duas telas | Exportação |

Divisão de responsabilidade (princípio 1): o provedor de voz produz a fala; as
ferramentas do sistema produzem o dado.

---

## 11. Requisitos não-funcionais

| # | Requisito | Alvo | Como se verifica |
|---|---|---|---|
| RNF-01 | Latência de turno na conversa | < 1,2 s do fim da fala do interlocutor ao início da resposta | Medição em 20 ligações de teste |
| RNF-02 | Interrupção funcionando | O agente para de falar em até 300 ms quando interrompido | Teste manual roteirizado |
| RNF-03 | Resposta das ferramentas do agente | < 2 s no percentil 95 | Métrica por endereço |
| RNF-04 | Resposta dos endereços chamados pelo provedor | < 3 s, sempre; acima disso o provedor corta a conexão | Alarme sobre o percentil 99 |
| RNF-05 | Confiabilidade do pós-chamada | ≥ 99% das chamadas com transcrição e classificação em até 5 min | Contador diário de chamadas sem finalização |
| RNF-06 | Idempotência | Toda rotina de fundo e todo webhook podem rodar duas vezes sem duplicar efeito | Teste executando cada rotina duas vezes seguidas |
| RNF-07 | Isolamento entre contas | Zero vazamento; regra no banco, não na aplicação | Teste automatizado de travessia entre contas no CI |
| RNF-08 | Segredo nunca no cliente | Nenhuma credencial de provedor acessível a partir do navegador | Revisão e teste negativo |
| RNF-09 | Retenção | Gravação e transcrição expurgadas no prazo configurado, padrão 90 dias | Verificação da rotina diária |
| RNF-10 | Exclusão sob solicitação | Dados de um lead apagados em até 15 dias corridos do pedido | Registro do pedido e do cumprimento |
| RNF-11 | Custo por ligação | Visível por chamada e somado por campanha e por período | Painel |
| RNF-12 | Teto de gasto | Conta para de discar ao atingir o teto configurado | Teste com teto baixo |
| RNF-13 | Capacidade | A simultaneidade máxima é parâmetro de conta, e o sistema impede configurá-la acima do **menor** entre: sessões simultâneas do contrato do provedor de voz, canais de telefonia contratados, e o que o teto de gasto por hora do RNF-12 comporta. Alvo verificado para o lançamento: **10 simultâneas por conta e 25 por instalação**, a revisar contra os números contratados antes da F7 | Teste de carga nos alvos de lançamento; revisão dos três limites contratuais registrada antes da F7 |
| RNF-14 | Migrações versionadas | Todo o schema reproduzível do zero a partir do repositório | `criar banco novo` em ambiente limpo no CI |
| RNF-15 | Acessibilidade | Navegação por teclado e contraste adequado nas telas de operação diária | Revisão nas telas de F3 e F4 |
| RNF-16 | Observabilidade | Toda chamada externa registrada com correlação por chamada telefônica | Consulta por identificador de chamada devolve a cadeia completa |

---

## 12. Riscos

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| O agente inventa informação | Perda de confiança, dano de marca, exposição jurídica | Alta sem mitigação | Ferramentas devolvendo frase pronta; base de conhecimento; regra explícita de "vou confirmar"; avaliação automática por chamada; ensaio antes de publicar |
| Interlocutor percebe que é máquina e se irrita | Reclamação, pedido de bloqueio | Média | Identificação honesta na abertura; aviso de gravação; transferência imediata a pedido; bloqueio imediato |
| Número marcado como spam pela operadora | Taxa de atendimento despenca | Alta com volume | Saúde por número, rodízio, tetos por dia, janela de horário |
| Dependência profunda do provedor de voz | Mudança de preço ou de API para a operação | Média | Camada de integração isolada; playbooks e contexto guardados do nosso lado, não no provedor |
| Configuração que não é lida | Cliente acredita estar protegido e não está | Alta, e já observada na referência em dois controles | Princípio 4; teste de contrato ligando cada controle ao comportamento |
| Custo por reunião acima do esperado | Produto sem argumento comercial | Média | Custo medido desde F2; teto por conta; revisão de roteiro para encurtar conversa |
| Falha silenciosa de rotina de fundo | Reuniões sem lembrete, leads sem ligação | Média | RF-613; alarme por rotina sem execução na janela esperada |
| Agenda do especialista em conflito | Especialista perde confiança e abandona | Alta sem calendário externo | RF-507 e RF-513 |
| Volume derruba a operação antes da qualidade estar pronta | Base queimada | Média | Regra de liberação de campanha: 50 ligações manuais medidas antes |

---

## 13. Perguntas em aberto

1. **O que a Sarah oferece, para quem, e o que caracteriza um lead qualificado?** Define o playbook de descoberta, a base de conhecimento e os critérios de pontuação. Não bloqueia F0 a F3; bloqueia F4.
2. **Quem recebe a reunião:** um time comercial único ou um especialista por linha de produto? Define a regra de roteamento (RF-506).
3. **Gravação:** padrão ligado ou desligado, e com qual texto de aviso? Define a abertura de toda ligação.
4. **Onde a interface é hospedada** e quem opera o ambiente.
5. **A conta é multiempresa desde o início** (produto vendido a terceiros) ou de uso interno? Muda o peso de F0 e da configuração autosserviço.
6. **Retenção padrão de gravação:** 30, 90 ou 180 dias?
7. **Existe integração obrigatória com o CRM já usado pelo time** na primeira versão, ou fica para F7?

---

## Apêndice A. Material interno de planejamento

> Não acompanha o produto. Existe para rastrear de onde veio cada julgamento de
> camada de confiança. Os caminhos citados são relativos a um repositório de
> referência interno.

### A.1 Evidências de `[precedente]`

| Assunto | Evidência |
|---|---|
| Publicação do agente no provedor | `supabase/functions/elevenlabs-agent-sync/index.ts`, 549 linhas compondo roteiro, voz, reconhecimento, turno, modelo, ferramentas, endereços de contexto e critérios de avaliação |
| Critérios de avaliação | mesmo arquivo, linhas 160-190: cinco critérios objetivos |
| Contexto no início da chamada | `supabase/functions/elevenlabs-personalization/index.ts` |
| Pós-chamada em via dupla | `supabase/functions/elevenlabs-events/index.ts` (aviso) + `voice-call-finalize/index.ts` (canônico, idempotente) + rotina de recuperação a cada 2 min |
| Guarda de discagem | `supabase/functions/_shared/voice/guard.ts`, com formato internacional, bloqueio, janela, intervalo, teto, registro da tentativa |
| Registro de tentativas | tabela `call_attempts_log` |
| Ferramentas de agenda e qualificação | `agent-tool-get-availability`, `agent-tool-schedule-meeting`, `agent-tool-confirm-meeting`, `agent-tool-reschedule-meeting`, `agent-tool-qualify-lead` |
| Mapeamento único de classificação | `supabase/functions/_shared/leads/resolve.ts` |
| Lembrete e resgate | `meeting-reminder-tick` (1 min, idempotente por marca de envio) e `meeting-noshow-tick` (5 min, com teto de tentativas) |
| Cadências | `cadence-tick` + tabelas `follow_up_cadences` / `follow_up_executions` + modelos em `src/lib/cadence-templates.ts` |
| Campanhas | `voice-campaign-start`, `voice-campaign-dispatch` (simultaneidade, retentativa), assistente de criação com prévia de planilha |
| Cofre de credenciais | `supabase/functions/_shared/secrets/vault.ts` + funções `set/get/list_account_secret` |
| Estado dos provedores | `supabase/functions/integrations-status/index.ts`, com crédito de telefonia e cota de voz; banner de alerta em `src/components/layout/UsageAlerts.tsx` |
| Base de conhecimento | `supabase/functions/elevenlabs-kb-add` + coluna `agent_personas.elevenlabs_knowledge_base_ids` + interface no editor de agente |
| Privacidade | função `lgpd_delete_contact` (usada em `src/lib/contacts.ts:26`), `data-deletion-request`, e `media-cleanup` diário com prazos por tipo de dado |
| Chamadas ao vivo | rota `src/routes/_authenticated/chat.tsx`, título "Ao vivo" |
| Geração de roteiro por IA | `src/components/personas/EditPersonaDialog.tsx:331` |
| Mesclagem e exportação de contatos | `contacts-merge`, `contact-export` |
| Configuração inicial | assistente de 8 passos + checklist persistente |

### A.2 Achados que justificam `[aposta]`: verificados nesta rodada

| Achado | Verificação |
|---|---|
| Nenhuma ferramenta de transferência para humano | As cinco ferramentas declaradas na publicação do agente não incluem transferência. Existem `voice-escalate` e `twilio-escalate-twiml`, acionados por regra de campanha e por um runtime próprio, e não pelo agente no meio da conversa. No roteiro, "direcione pra humano" é instrução de texto sem nada por trás |
| Nenhum recebimento público de lead | O único endereço público é gatilho de rotina. Lead entra por planilha ou ligação recebida |
| Nenhuma fila de exceções | Existem tabela de notificações, sino e avisos passageiros. Não há tela de trabalho |
| Nenhum ensaio | Só audição de voz. O laboratório de avaliação descrito na memória do projeto **não tem uma linha de código no repositório** |
| Versionamento de playbook órfão | As tabelas existem e `src/lib/prompts.ts` (243 linhas) **não é importado por nenhum arquivo**. Não há rota nem função de servidor |
| Calendário externo morto | `calendar_integrations` aparece apenas no arquivo de tipos gerado. `provider_event_id` é preenchido com um identificador local inventado, não com evento de calendário |
| Detecção de secretária eletrônica morta | A coluna `voice_campaigns.voicemail_detection` é **escrita** pelo formulário de campanha e por `voice-campaign-start`, e **nunca é lida** pelos despachantes de discagem. Controle de interface sem efeito |
| Consentimento morto | `voice_calls.consent_recorded_at` existe e nunca é preenchido |
| Palavras-chave de escalonamento mortas | `voice_campaigns.escalation_keywords` existe e nunca é lida |
| Etapa buscada pelo nome | `resolveStageIdByName` procura a etapa pelo texto em português. Renomear a coluna quebra a classificação |
| Fuso da conta, não do lead | `guard.ts` usa o fuso da conta com padrão fixo, embora `contacts.timezone` exista |
| Painel sem custo | `src/lib/dashboard-sdr.ts` não calcula nenhuma métrica de custo, embora `voice_calls.total_cost_cents` exista |
| Ficha de lead inexistente | `src/routes/_authenticated/contacts.tsx` é lista com filtros e exclusão; não há ficha nem linha do tempo |
| Auditoria quase inexistente | `audit_log` é escrito em um único lugar: exportação de contatos |
| Webhook de saída inexistente | `webhook_deliveries` registra entregas de webhooks **recebidos** de provedores |
| Sem migrações | Não existe pasta de migrações; o schema só vive no projeto remoto. As ~112 tabelas e funções só têm registro local no arquivo de tipos gerado |
| Sem testes automatizados | Apenas roteiro manual de aceite e um teste de carga |

### A.3 Ressalva sobre a palavra "precedente"

O repositório examinado tem 5 commits, e seu documento de entrada em produção
declara base vazia, sem contas e sem dados. O roteiro de aceite manual é
anterior e descreve ligações reais com aparelho físico: a linhagem foi
exercitada, e aquele recorte específico nunca operou com cliente.
Leitura da marca `[precedente]`: o desenho existe e foi escrito por quem
enfrentou o problema. A marca não equivale a validação em produção com volume.

### A.4 Mudanças feitas em relação à especificação funcional anterior

| Mudança | Razão |
|---|---|
| Métrica norte passou de reunião agendada para **reunião realizada** | Agendamento é inflável por insistência; comparecimento não é |
| Clonagem de voz saiu do escopo | Impressiona em demonstração, não move conversão, e levanta questão de consentimento |
| Busca em transcrições e rodízio de números foram para F7 | Só valem com volume |
| Reprodutor com transcrição sincronizada foi simplificado | Sincronização fina é cara e não é o que faz o produto funcionar. MVP: reprodutor e transcrição lado a lado |
| Versionamento de playbook foi simplificado | Uma versão publicada por propósito mais histórico. Árvore de ramificações e divisão de tráfego são problema de quem já tem volume |
| Entraram teto diário por conta e parada de emergência | Produto que liga sozinho precisa de freio, e não havia nenhum |
| Entraram teto diário e antecedência por especialista | Sem eles o agente lota a agenda de uma pessoa |
| Entrou trava contra agendamento simultâneo | Verificar conflito ao gerar horários não impede duas ligações concorrentes marcando o mesmo |
| Entrou exigência de ligação de teste antes de liberar lote | Impede que a primeira ligação de uma conta mal configurada seja para um cliente real |
| Restrição de ferramenta por propósito virou requisito de mecanismo | Instrução de texto é sugestão; ausência de ferramenta é garantia |
| Política de retentativa saiu de dentro de campanha e virou regra geral | Lembrete e resgate também precisam dela |
| Campanha ganhou regra de liberação por volume medido | Campanha amplifica o roteiro que existe, bom ou ruim |

### A.5 Correções da revisão de 21/09/2026

| Correção | Razão |
|---|---|
| A métrica norte ganhou mecanismo de apuração em três fontes, estado *não apurada* e degradação automática (RF-514 a RF-518) | A versão anterior elegia "reunião realizada" sem dizer quem marca. Dependia de RF-512, que é marcação manual. A métrica que define o sucesso do produto dependia de alguém lembrar de clicar. Trocar uma métrica inflável por uma não-coletável não é ganho |
| A meta de volume passou de "por número" para "por operação", com as premissas e a aritmética expostas | A conta anterior exigia ~185 discagens por dia no mesmo número, o que contradizia o risco de bloqueio por operadora listado na própria seção 12 e a existência do rodízio de números |
| A meta de custo virou fórmula com entrada pendente de preenchimento | "1/5 do custo de um SDR humano" não é aferível sem a linha de base declarada. Valor em reais dentro de um PRD envelhece em um trimestre |
| "Conversa sem intervenção humana" ganhou definição verificável | Era adjetivo, não critério |
| RNF-13 deixou de ser um número solto e virou restrição derivada de três limites reais | 200 simultâneas não derivava de nada: nem do contrato do provedor, nem dos canais de telefonia, nem do teto de gasto |
| A antiga F2 foi dividida em F2 (a ligação) e F3 (controles de operação), com portão explícito | A fatia acumulava treze entregas e não fecharia. O freio e o teto ficaram na F2 porque são inegociáveis antes do primeiro disparo; ensaio, transferência e fila ficaram na F3, que é pré-requisito aplicado pelo sistema para discar a lead real |
| Entraram RF-421 (duração máxima por conta) e RF-422 (pessoa errada) | Controle de custo direto e causa comum de reclamação, ambos ausentes |
| Entrou RF-915 (limiares configuráveis da fila) | Os gatilhos eram adjetivos. Fila sem limiar ajustável fica vazia ou vira ruído, e nos dois casos o operador para de olhar |
