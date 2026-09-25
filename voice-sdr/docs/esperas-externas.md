# Esperas externas

Três pedidos desta operação não dependem de código: dependem de um terceiro
responder. A seção 11 de `PRD-implementacao.md` manda abri-los na F0, e a
revisão técnica diz por quê em **O-03** e **P-04** — pacote regulatório de
telefonia e verificação do aplicativo OAuth levam de dias a semanas, e o
domínio de e-mail precisa de DNS verificado antes do primeiro convite de
equipe. Aberto na F5, o prazo do terceiro vira prazo do produto.

Este arquivo é o estado dessas três esperas. Ele existe porque pendência que
mora em conversa envelhece calada: `testes/estatica/esperas-externas.test.ts`
lê as seções abaixo e reprova quando falta estado, data do pedido ou data da
última conferência, ou quando o estado sai dos quatro valores conhecidos.

Nenhum agente de execução fecha uma destas esperas. Abrir protocolo em
operadora, enviar pedido de verificação ao Google e publicar registro de DNS
exigem credencial e documento da empresa e decisão de terceiro. O laço mantém
o arquivo; quem fecha é quem recebe a resposta.

**Estados conhecidos:** `nao-aberta`, `aguardando`, `aprovada`, `recusada`.
**Datas em ISO** (`aaaa-mm-dd`), para que o teste as leia sem ambiguidade;
`nao-registrada` quando ainda não há o que datar.

## Telefonia: pacote regulatório

- **Pedido:** pacote regulatório para compra de número brasileiro — CNPJ,
  endereço da empresa e documento societário enviados à operadora, na conta da
  plataforma.
- **A quem:** operadora de telefonia (provedor de números).
- **Data do pedido:** nao-registrada
- **Prazo informado:** nao-registrado
- **Estado:** nao-aberta
- **Última conferência:** 2026-09-21
- **Destrava:** F5
- **Protocolo:** nao-registrado
- **Nota:** enquanto o pedido estiver em `aguardando`, o passo "Número da
  operação" da configuração inicial mostra a espera como estado normal, não
  como erro (`app/src/copy/configuracao-inicial.ts`, `numero.aprovacao`).

## Google: verificação do aplicativo OAuth

- **Pedido:** verificação do aplicativo OAuth para o escopo sensível de
  calendário, necessário para conectar a agenda do especialista.
- **A quem:** Google (revisão de aplicativos OAuth).
- **Data do pedido:** nao-registrada
- **Prazo informado:** nao-registrado
- **Estado:** nao-aberta
- **Última conferência:** 2026-09-21
- **Destrava:** F5
- **Protocolo:** nao-registrado
- **Nota:** a verificação leva semanas e é o item de maior prazo dos três.

## E-mail: DNS do domínio de envio

- **Pedido:** verificação do domínio de envio no provedor de e-mail
  transacional — registros SPF, DKIM e retorno publicados no DNS do domínio.
- **A quem:** Resend, com o registro publicado por quem administra o DNS.
- **Data do pedido:** nao-registrada
- **Prazo informado:** nao-registrado
- **Estado:** nao-aberta
- **Última conferência:** 2026-09-21
- **Destrava:** F0
- **Protocolo:** nao-registrado
- **Nota:** esta é a espera que bloqueia a fatia atual, e não a F5: sem domínio
  verificado o primeiro convite de equipe da F0 não sai.

---

## Como atualizar

Conferiu o estado de uma espera? Mude **Última conferência** para a data de
hoje, mesmo que nada mais tenha mudado — é essa data que mostra se o arquivo
está vivo. Chegou resposta? Mude **Estado** para `aprovada` ou `recusada` e
registre o protocolo. Pedido enviado? **Estado** vira `aguardando`, e
**Data do pedido** e **Prazo informado** deixam de ser `nao-registrada`.

A história US-038 só fecha quando as três respostas chegarem.
