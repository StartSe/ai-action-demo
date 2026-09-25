# Decisão do agente: quatro publicações, uma por propósito

- **Código:** T-01
- **Decidida em:** 2026-09-21
- **Estado:** assumida-nao-verificada
- **Verifica:** `scripts/sonda-de-publicacao.ts`
- **Fatia:** F2
- **Última conferência:** 2026-09-21

`docs/revisao-tecnica.md` classifica **T-01** como BLOQUEADOR e **O-05** diz
quando a decisão precisa estar tomada: antes da F2, porque tomá-la depois refaz
a fatia inteira — tabela, `agent-publish`, `call-place` e `call-init`. Este
arquivo é a decisão escrita, e existe para que ninguém a redescubra lendo
migração.

## A decisão

A Sarah é publicada **quatro vezes no provedor de voz, uma por propósito**, e
cada publicação leva só o conjunto de ferramentas daquele propósito:

| Propósito | Chave | O que a Sarah faz |
|---|---|---|
| Descoberta | `discovery` | Primeiro contato: levanta a dor e confirma o interesse |
| Lembrete | `reminder` | Lembra a reunião marcada e confirma a presença |
| Resgate | `rescue` | Volta depois do não comparecimento e remarca |
| Retomada | `followup` | Retoma o lead que ficou no meio do caminho |

As chaves ficam em inglês, como os `stage_key` da F1; o rótulo em português
vem da interface.

Cada publicação guarda o seu **`published_hash`**: o sha-256 do que foi
compilado e enviado ao provedor. Quatro publicações são quatro resultados, e o
hash é o que responde "o que está no ar é o que está no banco?" para cada uma
separadamente.

O que a decisão compra é a garantia que **RF-309** pede: a restrição de
ferramentas por propósito passa a ser estrutural, e não instrução de texto no
roteiro. Com um agente só por conta, as sete ferramentas ficariam disponíveis
em toda chamada e a restrição viraria pedido educado ao modelo.

## Por que é suposição e não fato

Esta decisão é **SUPOSIÇÃO ASSUMIDA, e não verificada contra o provedor**.

A revisão técnica (T-01, O-05) pede um teste de meia hora antes de fechar:
tentar devolver o conjunto de ferramentas na resposta do webhook de início de
conversa e ver se o provedor aceita. Esse teste exige chave do provedor, rede e
um número real — três coisas que o laço de execução não tem, por regra
(`CLAUDE.md`, "Validação: em processo, sem container"). A sonda está escrita em
`scripts/sonda-de-publicacao.ts` e roda no degrau 3; até ela rodar, o que
sustenta a decisão é a documentação do provedor, que lista prompt, primeira
fala, idioma e voz como sobrescrevíveis pelo webhook de início, e **não** lista
o conjunto de ferramentas.

Assumir custa pouco e verificar tarde custa a fatia: o modelo de quatro
publicações funciona nos dois mundos — se o provedor aceitar a substituição, o
excesso é uma tabela com quatro linhas por conta em vez de uma.

## Consequências sobre o esquema

- **agents:** não tem `provider_agent_id`. A tabela guarda a identidade da
  Sarah (nome, empresa, oferta, `never_claim`, voz, primeira fala) e nada do
  provedor. Uma Sarah por conta, e o vínculo com o provedor mora na publicação.
- **agent_publications:** é a tabela que guarda `provider_agent_id` e
  `published_hash`, com `purpose`, `published_at` e `status`, única em
  (`agent_id`, `purpose`). É onde "publicado", "pendente" e "falha" se
  distinguem por propósito.
- **call-place:** escolhe a publicação pelo propósito no momento da discagem e
  passa o `provider_agent_id` daquela linha para a API de saída do provedor, que
  aceita o identificador do agente como parâmetro da chamada. `calls`
  referencia `agent_publication_id`, e não o agente.

## O que derruba a suposição

Se a sonda mostrar que **o provedor honra o conjunto de ferramentas devolvido
na resposta do webhook de início**, então:

- **T-01 cai de BLOQUEADOR para MENOR**: a restrição por propósito volta a ser
  sustentável com um agente só.
- Um agente por conta volta a servir, e a compilação passa a acontecer por
  chamada, no `call-init`, em vez de por publicação.
- `agent_publications` passa a ter **uma linha por conta** em vez de quatro:
  a coluna `purpose` deixa de ser parte do único e a tabela vira o registro de
  "o que está no ar", com um `published_hash` só.
- `call-place` para de escolher publicação por propósito; quem passa a carregar
  o propósito é o contexto do `call-init`.

Nada disso muda a interface nem o compilador do agente: os dois falam em
conjunto de ferramentas por propósito de qualquer jeito.

## A sonda

`scripts/sonda-de-publicacao.ts` é o teste de meia hora. Ela publica um agente
de teste, sobe um receptor de webhook, responde ao início da conversa com um
conjunto de ferramentas diferente do publicado e relata se o provedor honrou a
substituição. De passagem, ela mede as três premissas frágeis da seção 3 da
revisão que vencem nesta fatia:

- **P-01:** `response_timeout_secs` explícito em 5 s em cada ferramenta da
  publicação, com p95 e p99 do tempo de resposta medidos em 20 chamadas.
- **P-02:** o modelo de linguagem escolhido na publicação, lido de volta do
  provedor depois de publicar.
- **P-11:** `x-conversation-id` chegando por cabeçalho de ferramenta.

A sonda é **implementada e não executada** pelo laço: sem
`SARAH_ELEVENLABS_API_KEY` ela sai com zero e diz por quê. Quem a roda é o
degrau 3 (`npm run check:full`), com credencial, rede e um número de teste.
Quando ela rodar, o **Estado** do topo deste arquivo passa a `confirmada` ou
`derrubada`, com a data da corrida.

**Estados conhecidos:** `assumida-nao-verificada`, `confirmada`, `derrubada`.
