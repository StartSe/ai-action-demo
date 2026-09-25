# Personas de quem compra a Voice SDR

Três pessoas concretas, escolhidas pelo que muda na configuração e na
demonstração: o tamanho do time, de onde vem o lead e quanto de operação ela
aceita assumir. Cada uma tem uma jornada testada (`app/src/jornadas/` e
`testes/jornadas/`), e o que falhou nela está em
[`validacao-por-persona.md`](validacao-por-persona.md). O roteiro de quem
apresenta a solução está em
[`roteiro-de-apresentacao.md`](roteiro-de-apresentacao.md).

A assistente não tem nome de fábrica: cada cliente escolhe. Nos exemplos, ela
se chama Lia (persona 1), Ana (persona 2) e Bia (persona 3).

---

## 1. Carla, dona de empresa de serviços B2B com um vendedor só

**Quem é.** Carla Menezes, sócia-diretora da Menezes Contabilidade, uma
consultoria de BPO financeiro e contabilidade consultiva para pequenas e médias
empresas de serviço. Doze pessoas, um vendedor (Rafael) que também faz o
pós-venda. Uns 60 leads por mês, metade do formulário do site e metade de
indicação.

**Dor.** O lead chega às 11h e o Rafael liga no dia seguinte, quando liga.
Quem pediu orçamento de contabilidade pediu para três escritórios; o primeiro
que retorna leva a reunião. Ela sabe que perde negócio por demora e não tem
orçamento para um SDR (R$ 4 a 5 mil por mês com encargos, mais o tempo de
treinar).

**Métrica que importa.**

| métrica | hoje | o que ela quer ver |
| --- | --- | --- |
| tempo até o primeiro contato | de 1 a 2 dias | minutos, dentro do horário comercial |
| reuniões realizadas por mês | 8 a 10 | o dobro, sem contratar |
| custo por reunião realizada | o salário do Rafael dividido por 10 | abaixo de R$ 150, e sabendo quanto é |

**Objeções.**

- "O cliente vai perceber que é robô e vai achar desrespeito."
- "E se ela falar besteira de preço? Contabilidade não tem preço de tabela."
- "Não tenho tempo de configurar. Quanto tempo leva?"
- "Isso é legal? Gravar ligação, LGPD."
- "Quem paga as contas de ElevenLabs, Twilio, OpenRouter? Quanto dá por mês?"

**O que ela precisa ver funcionando no primeiro dia.**

1. A assistente ligando para o celular dela, com a voz escolhida, dizendo o
   nome da empresa e conduzindo como um lead de verdade seria conduzido.
2. A ficha dessa ligação: gravação, transcrição, o que a assistente entendeu,
   quanto custou.
3. Um lead de indicação cadastrado à mão recebendo a ligação pela ficha dele.
4. A reunião aparecendo com quem vai atender (o Rafael), com o resumo que ele
   lê antes de entrar.

**O limite do que ela aceita configurar.** Uns 30 a 45 minutos, numa sessão,
com alguém ao lado. Ela cria as contas nos provedores se alguém disser qual
botão clicar, cola chaves, escolhe voz ouvindo e escreve o negócio em três
frases. Não escreve roteiro do zero, não entende "E.164", "OAuth", "fuso
America/Sao_Paulo", "webhook", e não vai criar aplicativo no Google Cloud
para conectar calendário.

---

## 2. Marcos, gerente comercial com consultores por segmento e inbound de anúncio

**Quem é.** Marcos Tavares, gerente comercial da Sol do Vale Energia, uma
integradora de energia solar residencial e comercial em Santa Catarina e no
Paraná. Quatro consultores técnicos (dois residenciais, um comercial e agro,
um de usinas), duas SDRs humanas sobrecarregadas. Uns 600 leads por mês de
formulário de anúncio (Meta e Google), com pico no começo da semana.

**Dor.** Lead de anúncio esfria em minutos: quem clicou num anúncio de
energia solar clicou em outros três. As SDRs atendem em ordem de chegada e
não dão conta do pico de segunda; metade dos leads recebe a primeira ligação
depois de 24 horas. Os consultores reclamam de reunião com quem não tem
telhado próprio ou tem conta de luz de R$ 150.

**Métrica que importa.**

| métrica | hoje | o que ele quer ver |
| --- | --- | --- |
| lead contatado em até 5 minutos | menos de 20% | acima de 80% no horário comercial |
| reunião qualificada (conta acima de R$ 300, telhado próprio) | metade das marcadas | quase todas |
| comparecimento | 60% | acima de 75%, com lembrete e resgate |
| custo por reunião realizada | não mede | um número por semana, no painel |

**Objeções.**

- "Como o formulário do site chega nela? Tenho RD Station e landing page."
- "Cada consultor atende uma área. Ela sabe mandar para o certo?"
- "Ela vai marcar em cima de visita que o consultor já tem na agenda?"
- "E quando o cliente pede para falar com gente, ou fica bravo?"
- "Como eu sei que ela está qualificando direito? Quero ouvir as ligações."
- "Isso integra com o meu CRM?"

**O que ele precisa ver funcionando no primeiro dia.**

1. O formulário da landing page gerando uma ligação em minutos.
2. A reunião marcada com o consultor da área certa, no horário livre dele.
3. A fila "Precisam de você" com o pedido de humano, o trecho da conversa e o
   telefone para retornar.
4. A ficha da ligação com a qualificação (dor, encaixe, objeções) e o
   diagnóstico quando a ligação foi mal.
5. O painel da semana com reuniões marcadas e custo por reunião.

**O limite do que ele aceita configurar.** Aceita cadastrar consultores,
áreas, horários e roteamento; aceita colar um endereço e uma chave no
formulário do site se alguém der os dois prontos; aceita revisar o roteiro de
descoberta e publicar. Não programa integração, não mexe em banco, e não vai
esperar semanas de aprovação do Google para ter agenda.

---

## 3. Juliana, coordenadora de operação de pré-vendas de alto volume

**Quem é.** Juliana Prado, coordenadora de pré-vendas da Escola Técnica
Horizonte, rede de cursos técnicos noturnos e EAD. Base de 20 mil contatos
antigos (interessados que não se matricularam, ex-alunos, eventos), três
turnos de operação, um número de WhatsApp comercial que o time inteiro usa.
Campanhas de captação duas vezes por ano.

**Dor.** A base parada não vira matrícula porque ninguém liga para 20 mil
pessoas. Quando o time tenta, queima número (a operadora marca como spam),
liga fora do horário e recebe reclamação no Procon, e perde o controle do
custo. Ela precisa de volume com freio.

**Métrica que importa.**

| métrica | hoje | o que ela quer ver |
| --- | --- | --- |
| contatos atendidos por hora | 15 por pessoa | centenas, respeitando janela e limites |
| taxa de atendimento por número | não sabe | por linha, para trocar número antes de queimar |
| custo por reunião ou matrícula | não mede | antes de disparar (estimativa) e depois (real) |
| reclamação e pedido de não perturbe | chega por e-mail | bloqueio imediato e registrado |

**Objeções.**

- "Se eu importar a lista errada, como paro tudo?"
- "Não posso ligar fora do horário nem para quem pediu para sair."
- "Meu WhatsApp é o comercial. Não quero a IA respondendo aluno antigo e
  fornecedor enquanto eu testo."
- "Quanto custa uma campanha de 5 mil ligações? Quero ver antes."
- "Número marcado como spam: vocês resolvem?"
- "Tenho a base em Excel."

**O que ela precisa ver funcionando no primeiro dia.**

1. A importação de uma planilha grande com prévia: quantos entram, quantos
   estão com telefone quebrado, quantos repetidos, antes de gravar.
2. O freio de emergência: um clique para parar tudo, com motivo, visível em
   toda tela.
3. A política de discagem: janela por dia da semana, intervalo, tetos.
4. O WhatsApp em modo de teste: só os números de teste conversam.
5. Zerar o ambiente do piloto e começar de novo.

**O limite do que ela aceita configurar.** Bastante: política de discagem,
limiares da fila, números, lista de bloqueio, modo do WhatsApp, equipe com
papéis. O que ela não aceita é disparar lote sem prévia de custo, nem depender
de alguém de tecnologia para parar a operação.

**O que ela não encontra nesta versão.** Campanha (discagem em lote com prévia
de custo) e cadência (sequência de retomada) estão anunciadas na barra lateral
como "em breve". Hoje ela liga lead a lead pelo discador; a importação e a
política já estão prontas para quando a campanha chegar.
