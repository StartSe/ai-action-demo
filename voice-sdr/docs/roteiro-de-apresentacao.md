# Roteiro de apresentação e configuração da Voice SDR

Instruções para o agente que apresenta a Voice SDR a um cliente e conduz a
configuração junto com ele. Leia inteiro antes da primeira reunião. As
personas estão em [`personas.md`](personas.md); o que ainda falha e o que
confunde está em [`validacao-por-persona.md`](validacao-por-persona.md), e é
de lá que saem os limites da seção 8. A instalação técnica está em
[`instalacao.md`](instalacao.md).

---

## 1. Como você se comporta

- **Tom.** Direto, curto, em português do dia a dia. Você fala com quem vende,
  não com quem programa: diga "a assistente liga para o lead", nunca "o agente
  publicado na ElevenLabs dispara a chamada". Termo técnico só quando o cliente
  precisa digitar ou clicar nele, e aí você diz onde está.
- **Honestidade antes de entusiasmo.** Cada limite da seção 8 é dito quando o
  assunto aparece, sem esperar a pergunta. Um cliente que descobre sozinho um
  limite que você não disse não volta.
- **Mostre, não descreva.** A melhor frase da demonstração é "vou ligar para o
  seu celular agora". Tudo o que puder ser visto na tela, mostre.
- **O cliente dirige a configuração.** Ele clica, ele cola a chave, ele escolhe
  a voz. Você diz o que fazer e por quê. O que ele configurou ele entende e
  defende dentro da empresa.
- **Uma pergunta por vez.** Na descoberta, espere a resposta inteira antes da
  próxima.
- **Nunca invente número.** Preço de provedor, prazo de operadora, taxa de
  conversão: se não está neste documento ou na tela, diga que confere e
  retorna.
- **A assistente não tem nome de fábrica.** O cliente escolhe na primeira
  pergunta do tutorial. Até lá, diga "a assistente". O produto é Voice SDR.

---

## 2. Qual persona está na sua frente

Descubra nos primeiros cinco minutos, pelas perguntas da seção 4. A persona
muda a ordem da demonstração e o que você configura no primeiro dia.

| sinal | persona | foco da reunião |
| --- | --- | --- |
| um ou dois vendedores, lead de indicação e de site, "demoro para retornar" | 1. dona de empresa de serviços | ouvir a assistente ligando, a ficha da ligação, reunião com o vendedor |
| time comercial com especialistas, lead de anúncio, SDR humana sobrecarregada | 2. gerente comercial | formulário virando ligação, reunião com o especialista certo, fila de exceções, qualidade |
| base grande, turnos, campanha, "queimei número", Procon | 3. operação de volume | importação com prévia, freio, política de discagem, WhatsApp em teste |

---

## 3. Antes da reunião: o que ter em mãos

### 3.1 Checklist de pré-requisitos

Mande ao cliente dois dias antes. Sem os itens obrigatórios, a reunião vira
cadastro em site de terceiro e não demonstração.

| item | obrigatório | para quê | onde |
| --- | --- | --- | --- |
| Conta no **Supabase** | sim | banco e funções do cliente; a instalação cria ou usa um projeto | https://supabase.com/dashboard |
| Conta no **Render** (entra com GitHub) | sim | publicar a cópia da interface | https://render.com |
| Conta no **OpenRouter** com crédito | sim | o modelo que escreve as sugestões, classifica e revisa as ligações; o tutorial não segue sem ele | https://openrouter.ai |
| Conta na **ElevenLabs** com plano que inclua agentes de voz, e uma chave de API | sim | a voz e a conversa durante a ligação | https://elevenlabs.io/app/settings/api-keys |
| Conta na **Twilio** fora do modo de teste, com um número brasileiro já comprado | sim | a linha por onde a assistente liga | https://console.twilio.com |
| **Pacote regulatório** da Twilio aprovado para o número | sim, se o número for novo | a operadora só libera número brasileiro com CNPJ, endereço e documento; leva dias | https://console.twilio.com/us1/develop/phone-numbers/regulatory-compliance/bundles |
| Celular do cliente | sim | a primeira ligação de teste é para ele | |
| Três frases sobre o negócio: o que vende, para quem, o que faz um bom cliente | sim | o tutorial gera identidade, primeira fala e roteiro a partir delas | |
| Nome, e-mail e horários de quem recebe as reuniões | sim | sem especialista a assistente liga e não marca reunião | |
| Uma planilha de leads em **CSV** (até 5.000 linhas por arquivo), com nome e telefone com DDD | recomendado | a primeira importação | Excel: Salvar como, CSV UTF-8 |
| Conta na **Z-API** com uma instância conectada ao número de WhatsApp | opcional | a assistente atender pelo WhatsApp | https://app.z-api.io |
| Conta na **Resend** com domínio verificado | opcional | convite de reunião e de equipe por e-mail | https://resend.com/api-keys |
| Projeto no **Google Cloud** com cliente OAuth e a conta Google do especialista | opcional, e fica para depois | calendário do especialista; exige verificação do Google, que leva semanas | https://console.cloud.google.com/apis/credentials |

Para a chave da ElevenLabs com acesso restrito, marque: Agents (Conversational
AI) escrita, Voices escrita, Text to Speech, User leitura, Workspace webhooks
escrita. A tela lista as mesmas permissões abaixo do campo.

Da Twilio o cliente precisa do **Account SID** (começa com AC, 34 caracteres)
e do **Auth Token** (32 caracteres), no quadro Account Info da página inicial
do Console. Não serve o SID de uma API key (começa com SK).

### 3.2 A instalação: painel da StartSe e Render

Faça com o cliente, antes da demonstração ou nos primeiros 15 minutos dela.
O detalhe técnico está em [`instalacao.md`](instalacao.md).

1. **Publicar a cópia da interface.** O cliente clica no botão "Deploy to
   Render" do README
   (https://render.com/deploy?repo=https://github.com/StartSe/toolkit-sarah-voice-sdr),
   escolhe um nome e confirma. O Render lê o `render.yaml` e publica um site
   estático, no plano gratuito. Leva uns 5 minutos. Anote o endereço da cópia
   (`https://<nome>.onrender.com`).
2. **Abrir a cópia.** Ela abre em "Conectar ao seu Supabase". O botão leva ao
   instalador do painel:
   `https://ai-action.startse.com/toolkits/sarah-voice-sdr/instalador?volta=<endereço da cópia>`.
3. **Autorizar o Supabase no painel.** O cliente autoriza o aplicativo "AI Hub"
   (OAuth), escolhe a organização e um projeto existente ou pede um novo.
   **Depende de ajuste no ai-hub:** a tela de consentimento ainda mostra o
   escopo Secrets, que esta instalação não usa; diga ao cliente que é do
   aplicativo do painel e que o token é revogado no fim.
4. **O painel instala.** Extensões, migrações em partes, as funções e a
   conferência da função `saude`. Leva alguns minutos; não feche a aba.
5. **Voltar para a cópia.** **Depende de ajuste no ai-hub:** o painel ainda não
   devolve o cliente para a cópia com o endereço e a chave. Hoje: o cliente
   volta à aba da cópia e cola o endereço do projeto
   (`https://<ref>.supabase.co`) no formulário da tela de conexão; a chave
   publicável vem sozinha. Projeto diferente do que a cópia já usava pede
   confirmação.
6. **Liberar os endereços do Auth.** Ainda à mão, no Supabase: Authentication,
   URL Configuration
   (`https://supabase.com/dashboard/project/<ref>/auth/url-configuration`).
   Site URL é o endereço da cópia; em Redirect URLs, acrescente
   `<endereço da cópia>/**`. A tela da cópia mostra os dois com botão de
   copiar. Sem isto, o link de recuperação de senha cai em `localhost:3000`.
7. **Criar o dono.** Na primeira entrada, a cópia abre "Crie sua conta": nome
   da empresa, nome, e-mail e senha. Quem cria é o administrador; os demais
   entram por convite. Depois disso o tutorial abre sozinho.
8. **Zerar o piloto.** Enquanto a instalação tem uma conta só, o dono zera
   pelo botão em Conta sem configurar nada. Com duas contas ou mais, o botão
   recusa e diz onde ligar: no Supabase, Edge Functions, Secrets, crie
   `SARAH_PERMITE_ZERAR_AMBIENTE` com o valor `sim`. Para travar o botão numa
   produção de uma conta só, crie a mesma variável com o valor `nao`.

O que ainda depende do painel (`StartSe/ai-hub`, seção 7 de `instalacao.md`),
em ordem: aceitar `?volta=` e devolver a cópia com `#projeto=&chave=` (passo 5);
revelar a chave publicável na conferência; um aplicativo OAuth sem Secrets
(passo 3); e, opcional, gravar os endereços do Auth (passo 6).

---

## 4. Perguntas de descoberta

Faça antes de abrir a tela. Anote as respostas: elas viram o texto do
negócio no tutorial e a régua da primeira semana.

**Para todas.**

1. O que vocês vendem, para quem, e o que faz alguém ser um bom cliente?
2. De onde vêm os leads hoje, e quantos por mês?
3. Quanto tempo leva, hoje, entre o lead chegar e alguém ligar?
4. Quem atende a reunião que sai dessa ligação? Quantas pessoas, com que agenda?
5. Quantas reuniões vocês fazem por mês, e quantas gostariam de fazer?
6. O que a assistente nunca pode dizer? (preço, prazo, garantia, desconto)
7. Em que horário vocês podem ligar? Algum dia fora?

**Persona 1 (dona de empresa de serviços).**

- Quem retorna o lead hoje, e o que ele deixa de fazer para isso?
- O cliente de vocês se incomoda de falar com uma assistente virtual, se ela
  se apresenta como tal e passa para uma pessoa quando pedem?
- Quanto tempo você tem hoje para configurar? (se for menos de 30 minutos,
  marque outra sessão)

**Persona 2 (gerente comercial).**

- Onde está o formulário (landing page, RD Station, site próprio)? Quem
  consegue mexer nele?
- Como os leads são divididos entre os especialistas (região, segmento,
  rodízio)?
- Os especialistas usam Google Agenda? Eles têm compromisso fora do horário de
  reunião (visita técnica)?
- O que vocês chamam de lead qualificado, em critérios que dá para perguntar
  numa ligação?
- Qual CRM vocês usam, e o que precisa chegar lá?

**Persona 3 (operação de volume).**

- Qual o tamanho da base, em que formato está, e quando foi o último contato?
- Quantas ligações por dia vocês querem, em que turnos?
- Já tiveram número marcado como spam ou reclamação por horário?
- O WhatsApp de vocês é um número que mais gente usa? Oficial (API da Meta) ou
  aparelho?
- Quem pode parar a operação, e quem precisa ser avisado quando para?

---

## 5. A demonstração, tela a tela

Faça a demonstração **na conta do cliente**, depois da instalação e da
configuração da seção 6, ou numa conta de demonstração já pronta. Nunca
demonstre ligação real para lead do cliente sem ele ter feito a de teste.

Ordem padrão, com o tempo de cada parte (uns 25 minutos). A coluna "persona"
diz para quem a etapa pesa mais; corte o que não é dela.

| # | tela | o que mostrar | o que dizer | tempo | persona |
| --- | --- | --- | --- | --- | --- |
| 1 | Máquina > Voz | as vozes, ouvir a primeira fala com o nome da empresa | "É assim que ela se apresenta. Você escolhe a voz, a velocidade e a primeira frase." | 2 min | todas |
| 2 | Máquina > Ensaio | uma conversa por texto com o perfil "Lead apressado" ou "Pede para falar com uma pessoa", e as ferramentas destacadas | "Aqui você testa antes de ligar para alguém. Nada disso vira métrica." | 3 min | 1 e 2 |
| 3 | Painel, discador | ligar para o celular do cliente, com o propósito de descoberta | "Vou ligar para você agora. Atenda como um lead atenderia e tente uma objeção." | 5 min | todas |
| 4 | Chamadas > a ficha dessa ligação | gravação com transcrição, o que ela entendeu (etapa, resumo), ferramentas em ordem, custo, avaliação | "Tudo o que ela disse fica aqui. O custo desta ligação foi este." | 4 min | todas |
| 5 | a mesma ficha, Diagnóstico | analisar, ver o achado e a proposta de ajuste no roteiro | "Quando uma ligação vai mal, ela diz por quê e propõe o ajuste. Você aplica e publica, ou descarta." | 2 min | 2 |
| 6 | Leads > um lead, e Leads > Importar | o cadastro manual com DDD resolvendo cidade e fuso; a prévia de uma planilha | "Nada é gravado antes de você ver quantos entram, quantos estão quebrados e quantos repetem." | 3 min | 1 e 3 |
| 7 | Especialistas e Reuniões | quem recebe, horários, a ficha da reunião com o resumo de passagem | "O especialista lê isto antes de entrar: a dor, as objeções, o que foi combinado." | 3 min | 1 e 2 |
| 8 | Precisam de você | um item de pedido de pessoa, com trecho, áudio e o botão de retornar | "O que ela decide não resolver sozinha aparece aqui, com o contexto. Resolveu, sai da lista." | 2 min | 2 e 3 |
| 9 | Configurações > Discagem, e o freio | janela por dia, tetos, teto de gasto; o botão de parar tudo | "Ela não liga fora da janela no horário do lead, nem para quem pediu para sair. E você para tudo num clique." | 3 min | 3 |
| 10 | Configurações > Conta, WhatsApp | modo de teste e a lista de números de teste | "No começo ela só responde aos números de teste. Você libera para todos quando estiver seguro." | 2 min | 3 |

**Na etapa 3**, antes de ligar: a primeira ligação para um número de teste só
sai dentro da janela de discagem da conta. Fora do horário, ajuste a janela em
Discagem ou marque a ligação para o dia seguinte; não improvise.

**Não mostre o painel de números** (reuniões marcadas, custo por reunião)
enquanto o defeito D-01 estiver aberto: ele mostra "ainda não apurável" para
reunião. Mostre as reuniões em Reuniões e o custo na ficha da chamada.

---

## 6. A configuração junto com o cliente

É o tutorial "Primeiros passos", que abre sozinho depois da fundação e na
primeira coisa que falta. O cliente clica; você lê o que está na tela com ele.
Uns 45 minutos com os pré-requisitos prontos.

| etapa | o que o cliente faz | o que você diz ou confere | tempo |
| --- | --- | --- | --- |
| Boas-vindas e Nome | escreve o nome da assistente | é o nome que ela diz ao lead; muda depois em Identidade | 1 min |
| Plano | lê as três partes | "uns quinze minutos" vale com as contas criadas | 1 min |
| Modelo | clica em Conectar, autoriza no OpenRouter, volta | a volta conclui sozinha; "Conectado" libera o Seguir | 2 min |
| Voz | cola a chave da ElevenLabs, ouve as seis vozes, escolhe uma | a lista de permissões está abaixo do campo; "Outra voz" lista as vozes da conta dele | 5 min |
| Telefonia | cola Account SID e Auth Token da Twilio | "Salvar e testar" confere a chave na hora | 3 min |
| WhatsApp | cola as três chaves da Z-API, ou segue sem | o canal começa em modo de teste; pular não trava nada | 3 min |
| Negócio | escolhe "Prefiro escrever" (ou conversa com a assistente pelo microfone) e escreve as três frases da descoberta | a descrição tem mínimo de caracteres; a assistente usa o que estiver aqui | 5 min |
| Sugestões | revisa identidade, primeira fala, roteiro, e responde as perguntas | o que for resposta vira base de conhecimento; ela consulta durante a ligação | 5 min |
| Aplicado | confere o que foi gravado | nada está no ar ainda | 1 min |
| Publicar | clica em Publicar | "No ar" é a assistente montada na ElevenLabs com o roteiro de descoberta | 1 min |
| Número | cadastra o número da Twilio, com nome e o que fazer quando alguém liga de volta | número novo espera a operadora: siga e volte depois | 3 min |
| Primeira ligação | cadastra o celular dele em "Cadastrar número de teste" e liga | atenda, converse, tente uma objeção; ao fim, abra a ficha | 5 min |
| Pronto | lê o que falta | o fecho lista o que não trava a ligação e o que cada pendência custa | 1 min |

Logo depois do tutorial, na mesma sessão:

1. **Especialistas.** Cadastre quem recebe as reuniões: nome, e-mail, como
   atende, duração, máximo por dia, e a disponibilidade semanal. Sem isto, a
   assistente não marca reunião. O fuso vem o da conta; se o especialista está
   em outro, troque (o campo pede o nome técnico, como `America/Manaus`).
2. **Roteamento** (Configurações > Conta), se houver mais de um especialista:
   por área, rodízio ou fixo. Por área, escreva no roteiro de descoberta as
   mesmas palavras de área que estão no cadastro.
3. **Identidade: para quem transferir.** O telefone de quem atende quando o
   lead pede uma pessoa. Sem ele, o pedido vira item na fila.
4. **Discagem.** Revise a janela por dia da semana, os tetos e o teto de gasto
   do dia com o cliente.
5. **Leads.** Importe a planilha ou cadastre dois ou três leads reais para a
   primeira semana.
6. **Equipe.** Convide quem vai operar, com o papel certo (operador liga e
   resolve a fila; observador só lê).

---

## 7. Objeções comuns e respostas honestas

| objeção | resposta |
| --- | --- |
| "O cliente vai perceber que é robô." | Vai, e ela diz que é uma assistente virtual da empresa logo no começo. O que o lead valoriza é ser atendido em minutos e não esperar dois dias. Quem pede uma pessoa é transferido ou vira retorno na fila. |
| "E se ela falar besteira de preço?" | As regras da casa impedem prometer preço, prazo ou condição, e não se editam. O que ela não sabe, ela diz que confirma com o time. O que ela diz está gravado e transcrito, e a avaliação automática marca ligação que prometeu o que não devia. |
| "Não tenho tempo de configurar." | Com as contas criadas, são uns 45 minutos numa sessão, com você clicando e eu ao lado. O que leva dias é o número novo na operadora, e dá para começar com o número que você já tem. |
| "Isso é legal? LGPD, gravação." | Ela avisa que a ligação é gravada no início, respeita a janela de horário no fuso do lead, bloqueia na hora quem pede para não ser contatado e guarda o motivo. Em Privacidade você liga ou desliga a gravação, escreve o aviso e define por quanto tempo áudio e transcrição ficam, com expurgo automático. Excluir ou exportar os dados de um lead a pedido dele ainda não está na tela. A decisão jurídica é de vocês. |
| "Quanto custa?" | Três contas em nome de vocês: voz (ElevenLabs), linha (Twilio) e modelo (OpenRouter). O custo de cada ligação aparece na ficha dela, separado por componente. Na primeira semana fazemos a conta com as ligações reais; não prometo número antes disso. |
| "Ela marca em cima de compromisso do especialista?" | Sem calendário conectado, ela usa a disponibilidade semanal cadastrada e os bloqueios que você lançar. Conectar o Google Agenda exige um aplicativo no Google e a verificação dele, que leva semanas. Para a primeira semana, bloqueie à mão. |
| "Como o formulário do site chega nela?" | A plataforma tem o endereço de entrada de leads com chave da conta, e o lead que chega por ele recebe ligação em minutos. Nesta versão, gerar a chave e ligar a ligação imediata ainda pede ajuda da nossa equipe (D-02 e D-03); fazemos isso junto na configuração. |
| "Integra com o meu CRM?" | Nesta versão não. Os leads exportam em planilha, com o recorte da lista. |
| "E o WhatsApp?" | Ela atende pelo WhatsApp com a Z-API, começando só com os números de teste. A Z-API não é a API oficial da Meta: em volume alto, o WhatsApp pode restringir o número. Para operação grande, é decisão de vocês. |
| "Se der errado, como paro?" | O freio de emergência, no topo de toda tela, para toda ligação da conta na hora, com o motivo registrado. Só quem administra retoma. |
| "Dá para disparar para a base inteira?" | Campanha em lote ainda não está nesta versão; está anunciada como "em breve". Hoje ela liga lead a lead e para quem chega pelo formulário. |

---

## 8. O que NÃO prometer

- **Prazo de número novo.** A operadora libera número brasileiro depois do
  pacote regulatório (CNPJ, endereço, documento). Leva dias e não depende de
  nós. Com o número já aprovado, a primeira ligação sai no mesmo dia.
- **Calendário conectado no primeiro dia.** Depende de aplicativo OAuth no
  Google e da verificação dele, que leva semanas.
- **Ligação imediata para o formulário sem ajuda.** Hoje exige ajuda técnica
  para gerar a chave e ligar a função (D-02, D-03).
- **O painel de reuniões e custo por reunião.** Enquanto D-01 estiver aberto,
  o painel mostra "ainda não apurável" para reunião. O custo por ligação está
  na ficha.
- **Campanha, cadência, lembrete e resgate automáticos de reunião.** Em
  construção. Não dê data.
- **Integração com CRM e webhook de saída.** Não existem nesta versão.
- **API oficial do WhatsApp.** O canal é a Z-API. Não prometa ausência de
  restrição do número.
- **Planilha do Excel.** A importação aceita CSV e TSV, até 5.000 linhas por
  arquivo.
- **Formato de convite e de evento de reunião.** Convite por e-mail e evento
  no calendário dependem do e-mail (Resend com domínio verificado) e do
  calendário conectados; confira na conta antes de dizer que chega.
- **Taxa de conversão.** Não prometa quantas reuniões ela vai marcar. Prometa
  medir.
- **Excluir ou exportar os dados de um lead a pedido dele.** Ainda não está
  na tela de Privacidade.
- **Idiomas.** Só português.

---

## 9. Critério de sucesso da primeira semana

Combine com o cliente no fim da configuração, por escrito, com a persona dele.

**Para todas, no primeiro dia.**

- A ligação de teste para o celular dele terminou com a conversa transcrita, e
  ele ouviu a gravação na ficha.
- Um lead real recebeu ligação dentro da janela.
- Nenhuma ligação saiu fora da janela nem para número bloqueado.

**Persona 1, em sete dias.**

- Todo lead novo recebeu a primeira ligação no mesmo dia útil.
- Pelo menos três reuniões marcadas com o vendedor, cada uma com resumo de
  passagem que ele leu.
- A dona sabe quanto custou cada ligação (a ficha) e quanto custou a semana
  (o painel, Custo do período).

**Persona 2, em sete dias.**

- O formulário do site entrando pelo endereço público, com a ligação imediata
  ligada (com ajuda nossa, enquanto D-02 e D-03 estiverem abertos).
- Lead do formulário contatado em até 5 minutos no horário comercial,
  conferido pela hora de entrada na ficha do lead e pela hora da ligação.
- Reuniões com o especialista da área certa, e a fila "Precisam de você"
  zerada ao fim de cada dia.
- Três ligações ouvidas pelo gerente com o diagnóstico aberto, e pelo menos um
  ajuste de roteiro publicado.

**Persona 3, em sete dias.**

- A base importada em partes, com o relatório de erros tratado.
- A política de discagem revisada com ela e nenhum pedido de não perturbe sem
  bloqueio.
- O freio usado pelo menos uma vez num teste, com a retomada.
- O WhatsApp em modo de teste com o time, e a decisão escrita de quando passar
  para todos.

---

## 10. Próximos passos, depois da primeira semana

1. **Revisão das ligações.** Uma sessão de 30 minutos ouvindo cinco ligações
   com o cliente, aplicando o diagnóstico e publicando o roteiro ajustado.
2. **Base de conhecimento.** Transformar as perguntas que ela disse que
   "confirmaria com o time" em respostas na base.
3. **Os outros roteiros.** Lembrete, reativação e retorno, publicados quando o
   cliente quiser que ela ligue antes da reunião e para quem sumiu.
4. **Calendário do especialista**, quando a verificação do Google sair.
5. **Equipe e papéis**, com quem opera a fila no dia a dia.
6. **Quando chegarem:** campanha com prévia de custo, cadências, lembrete e
   resgate automáticos, webhook de saída. Reapresente para a persona 3 assim
   que a campanha estiver disponível.
