# Referência de integrações

Contratos de API já exercitados numa base de referência interna, extraídos para
não se descobrir de novo por tentativa e erro. É material de consulta, não
especificação: o que vale como requisito está em `docs/PRD.md` e em
`docs/PRD-implementacao.md`. Onde esta referência contradisser o PRD, o PRD
ganha.

Nada aqui foi copiado como código. O que se aproveita é o conhecimento
operacional: qual endpoint, qual carga, em que ordem, e onde costuma falhar.

---

## 1. Voz: ElevenLabs Conversational AI

Autenticação por cabeçalho `xi-api-key`. Base `https://api.elevenlabs.io`.

### 1.1 Publicar o agente

```
POST  /v1/convai/agents/create
PATCH /v1/convai/agents/{agent_id}
```

O corpo é o mesmo nos dois. O que importa do formato:

| Caminho na carga | O que é |
|---|---|
| `conversational_config.agent.prompt.prompt` | o prompt de sistema, onde entram as camadas 1, 2 e 3 |
| `conversational_config.agent.first_message` | a primeira fala |
| `conversational_config.agent.language` | `"pt"` |
| `conversational_config.agent.dynamic_variables.dynamic_variable_placeholders` | os nomes das variáveis que a chamada vai injetar |
| `conversational_config.tts.voice_id` | a voz escolhida |
| `conversational_config.conversation.max_duration_seconds` | duração máxima; a referência usa 600 |
| `conversational_config.agent.prompt.llm` | o modelo dentro da chamada |

**Uma publicação por propósito** (T-01): o conjunto de ferramentas muda por
propósito, e é a publicação que amarra ferramenta a agente. Guardar o hash do
que foi publicado permite detectar edição feita fora da plataforma.

### 1.2 Registrar o número

```
POST  /v1/convai/phone-numbers/create
PATCH /v1/convai/phone-numbers/{phone_number_id}
```

```json
{ "phone_number": "+55...", "label": "...", "provider": "twilio",
  "sid": "<twilio account sid>", "token": "<twilio auth token>" }
```

A ElevenLabs passa a falar com a Twilio por conta própria. O `phone_number_id`
devolvido é o que a discagem usa, e precisa ser guardado na linha da linha
telefônica.

### 1.3 Discar

```
POST /v1/convai/twilio/outbound-call
```

```json
{ "agent_id": "...", "agent_phone_number_id": "...", "to_number": "+55...",
  "conversation_initiation_client_data": { "dynamic_variables": { ... } } }
```

**Este é o caminho curto.** Não é preciso montar TwiML, abrir WebSocket de mídia
nem fazer relay de áudio: a integração nativa cuida disso. O contexto do lead
entra por `dynamic_variables`, e é por aí que a nossa injeção de contexto se
encaixa.

Pré-condições: número registrado (1.2) e agente publicado (1.1).

**Resiliência, aprendida na referência:** em 5xx ou estouro de tempo da
ElevenLabs, cair para discagem direta pela Twilio **reusando a mesma linha de
chamada já criada**. A linha nasce antes de tocar no provedor — nunca depois —,
senão uma chamada que o provedor iniciou e o banco não registrou vira chamada
órfã, cobrada e invisível. Tempo limite usado lá: 15 s.

### 1.4 Ensaio no navegador

```
GET /v1/convai/conversation/get_signed_url?agent_id=...
```

Devolve URL assinada para conversar com o **agente publicado** — que é
exatamente a decisão T-16: ensaiar contra o que vai ao ar, e não contra um
segundo tempo de execução.

### 1.5 Depois da chamada

```
GET /v1/convai/conversations/{conversation_id}
```

Traz transcrição com identificação de quem falou, e é a fonte para reaplicar
ferramenta que falhou durante a chamada.

### 1.6 Outros

```
GET /v1/user/subscription   crédito e cota (a sonda de integrações já usa)
POST /v1/voices/add          clonagem de voz
```

---

## 2. Telefonia: Twilio

Base `https://api.twilio.com/2010-04-01/Accounts/{sid}`, autenticação básica.

```
GET  /IncomingPhoneNumbers.json          números que a conta já tem
POST /IncomingPhoneNumbers.json          comprar número
GET  /Balance.json                        saldo
GET  /Calls/{call_sid}.json               estado da chamada
GET  /Recordings/{recording_sid}.mp3      gravação
```

Também usados na referência: `lookups.twilio.com` para validar número, e
`intelligence.twilio.com` para transcrição.

**Número dos Estados Unidos sai na hora e não exige pacote regulatório.** É o
caminho para exercitar os critérios de aceite da ligação antes de a aprovação
brasileira sair: toca, a Sarah fala, a ficha fecha com duração, custo, gravação
e transcrição. Nada disso depende de o número ser brasileiro.

---

## 3. WhatsApp

Dois caminhos, e a diferença é jurídica antes de ser técnica.

### 3.1 Oficial — Meta Cloud API

Base `https://graph.facebook.com`. Envio:

```json
{ "messaging_product": "whatsapp", "to": "...", "type": "text",
  "text": { "body": "..." } }
```

A mesma base serve DM de Instagram e Messenger, o que permite um cliente comum e
um adaptador fino por canal. A referência faz exatamente isso.

**Custos de entrada:** conta de negócio verificada, número dedicado que deixa de
funcionar no aplicativo comum, templates aprovados para iniciar conversa, e a
janela de 24 horas — fora dela, só template. A verificação leva semanas e
pertence à mesma lista de esperas externas do regulatório de telefonia e do
OAuth de calendário.

### 3.2 Não oficial — provedor de sessão

Viola os Termos de Serviço do WhatsApp. O número pode ser banido sem aviso, e a
quebra costuma vir de atualização do WhatsApp, não de erro próprio. Serve para
prova de conceito com número descartável; não se defende num contrato com
cliente.

Operacionalmente exige o que a referência resolveu com cinco funções: provisionar
instância, ler QR, conferir estado, reconectar e apagar. É **serviço com estado**:
a sessão mora em disco e não sobrevive a instância efêmera.

### 3.3 O que muda em relação à voz

Ferramenta é a mesma; o ritmo é outro. Três padrões que a voz não ensina:

- **Agrupar mensagens antes de responder.** Três mensagens em oito segundos são
  um pensamento só. Responder cada uma é o jeito mais rápido de parecer robô.
- **Fila de saída com ritmo controlado.** Disparo em rajada derruba o número. Em
  voz o limite é o teto diário; aqui é cadência por segundo.
- **Conversa é longa e assíncrona.** Uma chamada dura minutos e termina; uma
  conversa se estende por dias com lacunas de horas. Não há finalização por
  webhook mais varredura: há inatividade.

---

## 4. Decisões que esta referência sustenta

- **Canal é adaptador, cérebro é um só.** As sete ferramentas do agente são as
  mesmas em voz e em texto. O que muda é quem as chama e em que ritmo.
- **Uma porta de canal, vários adaptadores.** A referência tem voz, WhatsApp
  oficial, WhatsApp de sessão, Instagram e Messenger pendurados na mesma
  abstração. Funciona.
- **A chave da conversa precisa ser neutra.** Amarrar ferramenta e oferta de
  horário ao identificador da chamada fecha a porta para texto. Decidir isso
  depois obriga a refazer as fatias que já dependem dela.
- **Agente enxuto, canal separado.** Na referência o laço de resposta cabe em
  pouco mais de duzentas linhas porque canal, ferramentas e agente são coisas
  distintas. A versão monolítica do mesmo problema passa de mil e oitocentas.
