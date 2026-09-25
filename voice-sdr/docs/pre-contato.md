# Pré-contato: o aceite antes da ligação

> Decisão de 2026-09-24. Emenda a seção 6.2 de `docs/PRD.md`. Base: pesquisa de
> técnicas, regras e provedores feita na mesma data (fontes no fim).
>
> **Estado: adiado pelo dono em 2026-09-24.** O desenho fica, a construção não
> tem prioridade. O provedor de WhatsApp está em aberto (seção 5).

## 1. O problema

Lead que atende número desconhecido e descobre no meio da conversa que fala com
uma IA desliga, e desliga cedo. O único experimento de campo sério sobre isso
(Luo et al., *Marketing Science* 2019, 6.255 clientes) mediu a queda: revelar o
bot **antes** da conversa, numa ligação fria, levou a compra de 23,7% para
4,8%, e todos os 563 desligamentos rápidos do estudo ficaram nesse grupo. O
efeito diminuía com revelação tardia e com cliente que já conhecia IA.

Esconder que é IA não é saída: o CDC (art. 6º, III, e art. 37) já basta para um
Procon tratar como enganosa a IA que se passa por gente, o PL 2338/2023 prevê
informação prévia, e o dono quer justamente acabar com a quebra de expectativa.

**A decisão é mover a revelação para uma mensagem que o lead aceita antes da
ligação.** Ele chega à conversa sabendo e tendo concordado. Que isso recupera a
conversão é hipótese — por isso a medição com grupo de controle é parte do
produto, e não um extra (seção 6).

## 2. O que entra e o que continua fora

A seção 6.2 do PRD continua valendo para **conversa** por WhatsApp, SMS ou
e-mail: a Sarah não conversa por texto, e não há caixa de entrada. O que entra
é **mensagem de ida com resposta fechada**: aviso, pedido de aceite, escolha de
horário, recusa. Cada resposta vira um de cinco estados, nunca um diálogo. Uma
resposta em texto livre não recebe resposta automática; ela vai para a fila de
exceções como "o lead escreveu", com o texto.

Esse corte é o que impede o incidente que a Nina registrou no próprio código
(`persona-auto-reply`: mais de cem respostas por minuto de um modelo
respondendo a si mesmo).

## 3. Os três modos, por conta

| Modo | O que faz | Para quem |
|---|---|---|
| `desligado` (padrão) | Nada muda: speed-to-lead disca direto | Quem ainda não configurou provedor de mensagem |
| `aviso` | Manda a mensagem e liga depois da espera, com ou sem resposta, se o lead não recusou | Lead de formulário (inbound): preserva o speed-to-lead |
| `aceite` | Só disca depois de "pode ligar" ou de um horário escolhido | Lista importada, e conta que prefere volume menor e conversa melhor |

O padrão é `desligado` porque ligar a funcionalidade exige provedor de mensagem
configurado; o tutorial e a tela de pré-contato explicam o que cada modo faz e
recomendam `aviso` para formulário.

Lead de lista importada sem opt-in de WhatsApp **nunca** recebe WhatsApp (regra
da Meta) e, em `aviso`, cai para `aceite` por e-mail: o legítimo interesse
(LGPD art. 7º, IX, guia da ANPD de fev/2024) sustenta pedir permissão, e não
sustenta ligar para lista fria sem aviso.

## 4. O fluxo

1. **Lead chega.** Formulário ou importação. A origem e o opt-in por canal ficam
   registrados em `consent_records` (`kind='contact'`), com a prova.
2. **Mensagem.** Em até 10 s, pelo primeiro canal disponível na ordem da conta
   (WhatsApp → SMS → e-mail). Todo texto diz: o nome da empresa, que a Sarah é
   assistente virtual com IA, por que vai ligar, e como recusar.
3. **Resposta fechada.** `pode ligar agora`, `mais tarde`, um dos dois horários
   oferecidos, ou `não quero`.
   - **Pode ligar**: entra na fila com prioridade, e a ligação sai em até 60 s.
   - **Mais tarde**: a Sarah oferece dois horários concretos dentro da janela
     de discagem, no fuso do lead, e um "outro horário" que gera link.
   - **Horário escolhido**: item agendado em `dial_queue`, lembrete 5 min antes
     ("ligo em 5 minutos, tudo certo?"), e a ligação abre com "no horário que
     você marcou".
   - **Não quero** (ou NAO, SAIR, PARAR, STOP): bloqueio imediato em
     `dnc_entries` com `source='pre_contact'`, confirmação curta, e nenhum outro
     canal é tentado.
4. **Sem resposta.** Em `aviso`, liga depois da espera (padrão 120 s). Em
   `aceite`, tenta o próximo canal. Teto: três tentativas de contato em cinco
   dias, depois encerra e registra.
5. **A ligação.** A primeira fala confirma o combinado: "Oi, Ana, aqui é a
   Sarah, assistente virtual da Aurora, como combinamos pelo WhatsApp". O
   `consent_records` de `ai_disclosure` aponta para a mensagem aceita como prova.
6. **Depois da ligação.** Fica para a F6 (cadência): o resumo por mensagem é o
   que o estudo da Velocify associou a mais conversão, mas é mensagem de
   conversa, e entra junto da cadência.

## 5. Canais e provedores

- **WhatsApp: em aberto.** Três caminhos, e o dono cogita o Z-API:
  - **Cloud API oficial da Meta**: template aprovado, botões de resposta
    rápida, cobrança por mensagem, sem risco de banimento; exige opt-in e
    verificação da empresa.
  - **Z-API** (serviço brasileiro sobre o WhatsApp Web, pago por instância):
    conecta por QR code em minutos, sem template nem aprovação, custo fixo.
    Não é oficial: a Meta pode banir o número por disparo em volume, e não há
    garantia de entrega nem botão de template (resposta vira texto, que o
    desenho da seção 4 já trata como resposta fechada por palavra).
  - **Evolution API**, o que a Nina usa: mesmo modelo do Z-API, auto-hospedado.
  A porta de mensagem (`_shared/mensagem/`) é a mesma para os três; a escolha
  é um adaptador. Com Z-API, o volume por número precisa de teto baixo por
  conta, e a tela precisa dizer o risco em uma linha.
  Template da categoria `utility`, com botões de resposta rápida. A Meta
  reclassifica para `marketing` o template com tom de venda ("agende",
  "oferta", "promoção"), e a diferença de preço é de cerca de sete vezes (≈ R$
  0,05 contra ≈ R$ 0,35): os textos têm teste que reprova essas palavras.
  A resposta do lead abre a janela de 24 h, e as mensagens seguintes (horários,
  confirmação) saem sem custo.
- **SMS: Twilio**, porque a credencial já existe e o opt-out por STOP já é
  tratado por ela. Broker nacional com short code (Zenvia) entrega melhor e
  custa menos; a porta é a mesma, e trocar é implementar outro adaptador.
- **E-mail: Resend**, transacional, só para o pedido de permissão e registro.
- **Ligação pelo próprio WhatsApp** (Calling API, disponível no Brasil desde
  jul/2025, com pedido de permissão e 72 h para ligar) fica **fora desta
  fatia**: exige trocar o transporte da voz, e a ElevenLabs a oferece como
  integração à parte. Está anotada como o próximo passo natural, porque mostra
  o nome verificado da empresa em vez de um número desconhecido.

## 6. Medição, que é parte do produto

- **Grupo de controle**: uma fração dos leads (padrão 10%, até 50%) não recebe
  mensagem e é discada como hoje. A escolha é determinística pelo id do lead,
  para a mesma pessoa não mudar de grupo entre tentativas.
- **Sinais por lead**: canal, envio, entrega, leitura, tempo até a resposta,
  tipo de resposta, tempo do lead até a discagem, atendimento, duração,
  desligamento em menos de 10 s, pedido de humano, reunião marcada, recusa.
- **No painel**: taxa de aceite, e atendimento e conversa **com aceite contra o
  grupo de controle**. É esse número que diz se a decisão da seção 1 estava
  certa.

## 7. Regras do Brasil que o desenho respeita

- **0303 não é mais obrigatório** (Anatel, 7/ago/2025) e tende a derrubar o
  atendimento. Não usar. O que vale é a autenticação de chamadas (Res. 777),
  obrigatória para todas as empresas em out/2028.
- **Horário**: as mensagens obedecem à mesma janela de discagem da conta, no
  fuso do lead. Padrão recomendado, o mais restritivo das leis estaduais: dias
  úteis das 9h às 18h, sábado das 10h às 16h, domingo nunca.
- **Não Me Perturbe** nacional só obriga telecom e consignado; as listas
  estaduais valem conforme cada lei. Fica como pendência de integração, fora
  desta fatia.
- **Chamadas abusivas** (mais de 100 mil por dia): fora da escala do
  lançamento.

## 8. O que ficou para depois, e por quê

| Fica | Razão |
|---|---|
| Ligação pelo WhatsApp (Calling API) | Troca o transporte da voz; é fatia própria |
| Resumo pós-ligação por mensagem | É conversa; entra com a cadência (F6) |
| Consulta às listas estaduais de bloqueio | Integração por estado, sem API única |
| Origem Verificada (nome e logo na tela do celular) | Depende da operadora oferecer ao cliente |

## Fontes

- Luo, Tong, Fang e Qu, "Machines versus Humans", *Marketing Science*, 2019 — https://pubsonline.informs.org/doi/10.1287/mksc.2019.1192
- Anatel, revogação do 0303 — https://agenciabrasil.ebc.com.br/geral/noticia/2025-08/anatel-revoga-obrigatoriedade-do-uso-do-prefixo-0303-em-ligacoes
- Anatel, autenticação de chamadas — https://www.gov.br/anatel/pt-br/regulado/acompanhamento-e-controle/autenticacao-e-identificacao-de-chamadas
- ANPD, guia do legítimo interesse — https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf
- PL 2338/2023 — https://www25.senado.leg.br/web/atividade/materias/-/materia/157233
- Meta: opt-in, categorias, preços e Calling API — https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in · https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization · https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing · https://developers.facebook.com/documentation/business-messaging/whatsapp/calling
- Speed-to-lead (Oldroyd/InsideSales; HBR 2011) — https://www.expertise.ai/stats/speed-to-lead-statistics
- Velocify, texto antes e depois do contato (fornecedor) — https://velocify.com/blog/press-release/study-finds-text-messaging-can-boost-sales-by-328-percent/
- ElevenLabs e WhatsApp — https://elevenlabs.io/docs/eleven-agents/whatsapp
