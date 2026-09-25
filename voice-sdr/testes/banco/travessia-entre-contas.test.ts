// Travessia entre contas: a prova de que um usuário da conta A não alcança
// nenhuma linha da conta B, tabela por tabela, varrendo o schema `public` pelo
// catálogo em vez de por uma lista escrita à mão.
//
// Duas escolhas dão a este arquivo a validade que a US-005 pede:
//
// 1. As tabelas vêm de `pg_class`, não de uma constante. Tabela nova de uma fase
//    seguinte entra na varredura sozinha, e, se ninguém disser como ela se liga
//    à conta, o primeiro teste reprova em vez de fingir cobertura.
// 2. Cada tabela é medida nos dois sentidos: A enxerga as próprias linhas **e**
//    recebe zero da conta B. Sem o primeiro lado, remover uma política passaria
//    despercebido — sem política, ninguém vê nada, e "zero linha da B" continua
//    verdadeiro. Os dois testes de regressão no fim do arquivo provam isso.
// 3. A exceção tem nome e razão escrita: tabela fechada ao cliente (RLS ligada
//    e nenhuma política, como `account_secrets`) entra em SEM_LEITURA_DE_CLIENTE
//    e troca o par de asserções por "não vê nem a própria", com conferência no
//    catálogo de que a política continua ausente.
//
// Roda em PGlite dentro de `npm run check` e, com SUPABASE_DB_URL definida,
// contra o Postgres real do CI. Referência: docs/PRD-implementacao.md seção 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import type { BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import {
  abrirBancoParaRls,
  descreverBancoParaRls,
  VARIAVEL_DE_CONEXAO,
} from '../auxiliares/banco-para-rls.ts'

/** PGlite em memória, e não o Postgres do CI: aqui mexer no esquema é barato. */
const BANCO_EFEMERO = process.env[VARIAVEL_DE_CONEXAO] === undefined

/** Marca desta execução: o que ela criar, ela apaga. */
const MARCA = `t${Date.now().toString(36)}`
const DOMINIO = 'travessia.test'

interface Conta {
  readonly rotulo: string
  readonly id: string
  readonly usuarioId: string
}

/** Onde estão, numa tabela, as linhas que pertencem a uma conta. */
interface Ligacao {
  readonly where: string
  readonly params: unknown[]
}

type Ligador = (conta: Conta) => Ligacao

/**
 * Tabela sem `account_id` precisa declarar aqui como se liga à conta. A razão
 * de cada isenção mora em `scripts/analise-de-migracoes.ts`; aqui mora a forma
 * de encontrar as linhas dela.
 */
const LIGACOES_DECLARADAS: Record<string, Ligador> = {
  // A própria conta: a linha "da conta A" é a conta A.
  accounts: (conta) => ({ where: 'id = $1', params: [conta.id] }),
  // Perfil não tem conta: é do usuário. A linha "da conta A" é a do membro dela.
  profiles: (conta) => ({ where: 'id = $1', params: [conta.usuarioId] }),
  // Configuração da instalação: nenhuma linha é de conta nenhuma, e por isso
  // a medida é a tabela inteira. Está em SEM_LEITURA_DE_CLIENTE, então o que
  // se cobra é que nenhuma conta enxergue linha alguma dela.
  app_config: () => ({ where: 'true', params: [] }),
}

/**
 * Tabelas fechadas ao cliente: RLS ligada e nenhuma política de leitura, nem
 * para o dono. A varredura não pode cobrar delas que a conta veja as próprias
 * linhas — o certo é justamente não ver — então elas trocam de teste: em vez do
 * par "vê a própria, não vê a vizinha", valem "não vê nenhuma das duas" mais a
 * conferência no catálogo de que a política continua ausente.
 *
 * Entrar aqui é decisão de projeto, não atalho para calar um teste: cada linha
 * diz por onde o dado sai, já que pelo cliente não sai.
 */
const SEM_LEITURA_DE_CLIENTE: Record<string, string> = {
  account_secrets:
    'classe Dono: o valor mora no Vault e só sai por get_account_secret, ' +
    'concedida a service_role. A tela usa list_account_secrets, que é metadado.',
  app_config:
    'configuração da instalação (T-26): endereço base das funções e nome do ' +
    'segredo no Vault. Só sai por disparar_rotina, que o pg_cron executa como dono.',
  model_auth_states:
    'o OAuth de modelo em voo (US-246): guarda o code_verifier do PKCE em ' +
    'claro, porque ele precisa voltar inteiro ao provedor e não há hash que ' +
    'sirva. Quem o lê é consumir_autorizacao_de_modelo, concedida a ' +
    'service_role; a linha vale dez minutos e serve uma vez.',
}

/** O caso comum: tabela de negócio se liga pela coluna account_id. */
const POR_ACCOUNT_ID: Ligador = (conta) => ({
  where: 'account_id = $1',
  params: [conta.id],
})

interface TabelaDePublic {
  readonly nome: string
  readonly temAccountId: boolean
}

let banco: BancoDeTeste
/** Todas as tabelas de `public`, como o catálogo as vê. */
let tabelas: TabelaDePublic[]
/** As que o cliente pode ler: onde o par "vê a própria, não vê a vizinha" vale. */
let tabelasLegiveis: TabelaDePublic[]
/** As declaradas em SEM_LEITURA_DE_CLIENTE, que ninguém lê pelo cliente. */
let tabelasFechadas: TabelaDePublic[]
let contaA: Conta
let contaB: Conta

beforeAll(async () => {
  banco = await abrirBancoParaRls()
  await banco.comoServico()

  tabelas = await lerTabelasDePublic()
  tabelasFechadas = tabelas.filter((tabela) => fechadaAoCliente(tabela))
  tabelasLegiveis = tabelas.filter((tabela) => !fechadaAoCliente(tabela))
  contaA = await montarConta('A')
  contaB = await montarConta('B')
}, 60_000)

afterAll(async () => {
  if (!banco) return
  await banco.comoServico()
  // Num banco efêmero isto é supérfluo; num Postgres real é o que impede a
  // execução de deixar sujeira para a próxima.
  await banco.sql.query('delete from public.accounts where name like $1', [
    `${MARCA} %`,
  ])
  await banco.sql.query('delete from auth.users where email like $1', [
    `%@${MARCA}.${DOMINIO}`,
  ])
  // O cofre some por cascata, mas o segredo no Vault não tem conta: sai pelo
  // nome, que carrega a marca desta execução.
  await banco.sql.query('delete from vault.secrets where name like $1', [
    `${MARCA}:%`,
  ])
  await banco.encerrar()
})

// Papel deixado por um teste anterior não contamina o próximo.
beforeEach(async () => {
  await banco.comoServico()
})

/** Conta com exatamente um usuário, dono dela. */
async function montarConta(rotulo: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`${MARCA} Conta ${rotulo}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${rotulo}`)

  const usuarioId = await banco.criarUsuario(
    `${rotulo.toLowerCase()}@${MARCA}.${DOMINIO}`,
    `Dono da conta ${rotulo}`,
  )
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner')`,
    [id, usuarioId],
  )

  // Um convite pendente por conta. A varredura cobra que cada conta enxergue
  // as próprias linhas em toda tabela, então tabela nova precisa de linha no
  // cenário. O hash é 64 hexadecimais quaisquer: aqui nada resolve token.
  await banco.sql.query(
    `insert into public.invitations (account_id, email, role, token_hash, invited_by)
     values ($1, $2, 'viewer', md5(random()::text) || md5(random()::text), $3)`,
    [id, `convidado.${rotulo.toLowerCase()}@${MARCA}.${DOMINIO}`, usuarioId],
  )

  // Uma credencial por conta. Vai direto pela tabela, e não por
  // set_account_secret, porque aqui a sessão é de serviço e o RPC exige o owner
  // em auth.uid(). O que a varredura mede é o alcance da tabela, não o RPC.
  await banco.sql.query(
    `insert into public.account_secrets (account_id, provider, key_name, secret_id)
     values ($1, 'elevenlabs', 'api_key',
             vault.create_secret('chave-de-cenario', $2, 'travessia entre contas'))`,
    [id, `${MARCA}:${rotulo}:elevenlabs:api_key`],
  )

  // Um lead por conta. O telefone é único por conta, então os dois podem ser
  // iguais; distintos deixam a mensagem de falha mais legível. A etapa vem do
  // gatilho, que resolve a etapa `new` do funil padrão.
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'cenario')
     returning id`,
    [
      id,
      `Lead da conta ${rotulo}`,
      `+551199000000${rotulo === 'A' ? '1' : '2'}`,
    ],
  )
  const leadId = leads[0]?.id
  if (!leadId) throw new Error(`Não foi possível criar o lead da conta ${rotulo}`)

  // Um evento por conta, pelo RPC e não por insert: `lead_events` não tem
  // política de escrita, e semear por insert direto seria semear por um
  // caminho que o produto não tem. A sessão aqui é de serviço, sem
  // `auth.uid()`, então o autor é declarado — é o que a borda faz.
  await banco.sql.query(
    `select public.registrar_evento_de_lead($1, 'lead_created', 'system', null, $2)`,
    [leadId, `lead da conta ${rotulo} cadastrado`],
  )
  // Um especialista por conta. O fuso vem do gatilho, e o insert mínimo é de
  // propósito: o que tem padrão de coluna não se repete aqui.
  await banco.sql.query(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[])`,
    [
      id,
      `${MARCA} Especialista ${rotulo}`,
      `especialista.${rotulo.toLowerCase()}@${MARCA}.${DOMINIO}`,
    ],
  )

  // Uma faixa de disponibilidade e um bloqueio por conta, pendurados no
  // especialista recém-criado. O horário do bloqueio é o mesmo nas duas contas
  // de propósito: a restrição de exclusão é por especialista, e se um dia ela
  // passar a valer entre contas, o cenário reprova aqui.
  const { rows: especialistas } = await banco.sql.query<{ id: string }>(
    'select id from public.specialists where account_id = $1',
    [id],
  )
  const especialistaId = especialistas[0]?.id
  if (!especialistaId) throw new Error(`conta ${rotulo} ficou sem especialista`)

  await banco.sql.query(
    `insert into public.specialist_availability
       (account_id, specialist_id, weekday, start_time, end_time)
     values ($1, $2, 2, '09:00', '12:00')`,
    [id, especialistaId],
  )

  await banco.sql.query(
    `insert into public.specialist_blocks
       (account_id, specialist_id, starts_at, ends_at, reason)
     values ($1, $2, '2026-10-01T09:00:00Z', '2026-10-01T11:00:00Z', 'cenário')`,
    [id, especialistaId],
  )

  // Um calendário externo e um bloco de ocupação por conta. O segredo do Vault
  // leva a marca da execução, como o do cofre, porque ele não tem conta e sai
  // pelo nome no afterAll. `specialist_busy_blocks` é classe Servidor: o
  // cliente lê e não escreve, então a varredura continua cobrando o par
  // "vê a própria, não vê a vizinha" — o que muda é quem a preenche.
  await banco.sql.query(
    `insert into public.specialist_calendars
       (account_id, specialist_id, provider, external_id, refresh_secret_id)
     values ($1, $2, 'google', 'agenda-principal',
             vault.create_secret('token-de-cenario', $3, 'travessia entre contas'))`,
    [id, especialistaId, `${MARCA}:${rotulo}:calendario`],
  )

  await banco.sql.query(
    `insert into public.specialist_busy_blocks
       (account_id, specialist_id, starts_at, ends_at, external_id)
     values ($1, $2, '2026-10-01T14:00:00Z', '2026-10-01T15:00:00Z', 'evento-de-cenario')`,
    [id, especialistaId],
  )

  // Uma Sarah por conta, com a publicação de descoberta. A publicação nasce
  // pendente de propósito: é o estado em que `agent-publish` a cria, antes de
  // falar com o provedor, e o que a varredura mede é o alcance da linha e não
  // o que o provedor devolveu.
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    `insert into public.agents (account_id, name, company_name)
     values ($1, 'Sarah', $2)
     returning id`,
    [id, `${MARCA} Empresa ${rotulo}`],
  )
  const agenteId = agentes[0]?.id
  if (!agenteId) throw new Error(`conta ${rotulo} ficou sem agente`)

  const { rows: publicacoes } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery')
     returning id`,
    [id, agenteId],
  )
  const publicacaoId = publicacoes[0]?.id
  if (!publicacaoId) throw new Error(`conta ${rotulo} ficou sem publicação`)

  // Os quatro playbooks e as quatro versões draft não se semeiam: nascem com a
  // conta, pelo gatilho da migração de playbooks, e a ausência de insert aqui é
  // o que prova o gatilho. O que se cria é uma versão **publicada** de
  // descoberta, porque publicar move o ponteiro do playbook e escreve na
  // trilha — e é o caminho que a tela de playbooks vai ter.
  await banco.sql.query(
    `insert into public.playbook_versions
       (account_id, playbook_id, status, body_script, change_note)
     select $1, p.id, 'published', $2, 'cenário de travessia'
       from public.playbooks as p
      where p.account_id = $1 and p.purpose = 'discovery'`,
    [id, `Bom dia, aqui é a Sarah, da conta ${rotulo}.`],
  )

  // Um número de teste por conta. É a lista que o passo 2 da guarda consulta
  // enquanto o portão da fatia está fechado (L-03), e o número é diferente nas
  // duas de propósito: com o mesmo nos dois lados, a travessia passaria mesmo
  // se a leitura viesse da conta errada.
  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, $3)`,
    [
      id,
      `+551198000000${rotulo === 'A' ? '1' : '2'}`,
      `Número de teste da conta ${rotulo}`,
    ],
  )

  // Uma linha telefônica por conta, com número diferente nos dois lados pela
  // mesma razão do número de teste: é por `e164` que a ligação recebida acha a
  // linha, e o mesmo número nas duas contas deixaria a travessia passar mesmo
  // se a leitura viesse da conta errada.
  await banco.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, $2, $3)`,
    [
      id,
      `+551140000000${rotulo === 'A' ? '1' : '2'}`,
      `Linha da conta ${rotulo}`,
    ],
  )

  // Uma entrada da base de conhecimento por conta, já indexada, pelo RPC que
  // knowledge-sync chama depois do 2xx: o documento é o mesmo nos dois lados
  // de propósito, porque o único é por conta, e é a travessia que diz se a
  // leitura veio da conta certa.
  const { rows: entradas } = await banco.sql.query<{ id: string }>(
    `insert into public.knowledge_entries (account_id, question, answer, tags)
     values ($1, $2, 'Sim, em até cinco dias úteis.', '{entrega}')
     returning id`,
    [id, `Vocês entregam para a conta ${rotulo}?`],
  )
  await banco.sql.query(
    `select public.marcar_conhecimento_indexado($1, 'documento-de-cenario', $2)`,
    [entradas[0]?.id, 'c'.repeat(64)],
  )  // Uma conexão de telefonia por conta, com identificador de subconta diferente
  // nos dois lados. Entra pelo RPC e não por insert direto porque a tabela não
  // tem política de escrita: semear por insert seria semear por um caminho que o
  // produto não tem. A sessão aqui é de serviço, que é quem a borda usa ao
  // receber o retorno do provedor.
  await banco.sql.query('select public.registrar_conexao_de_telefonia($1, $2)', [
    id,
    `AC${(rotulo === 'A' ? 'a' : 'b').repeat(32)}`,
  ])

  // Um bloqueio ativo por conta, com número diferente nos dois lados: é por
  // (conta, número) que o passo 3 da guarda procura, e o mesmo telefone nas
  // duas deixaria a travessia passar mesmo se a leitura viesse da conta errada.
  await banco.sql.query(
    `insert into public.dnc_entries (account_id, phone_e164, reason, source)
     values ($1, $2, $3, 'lead_request')`,
    [
      id,
      `+551197000000${rotulo === 'A' ? '1' : '2'}`,
      `Pediu para não ser chamado — conta ${rotulo}`,
    ],
  )

  // Um consentimento por conta. Entra por insert de serviço e não por política
  // de cliente, e isso é o próprio contrato da tabela: `consent_records` é da
  // classe Servidor, e quem escreve é call-finalize. Se alguém criar uma
  // política de insert para o cliente, o teste da migração é que reprova; aqui
  // o que se mede é a leitura, que a conta vizinha não pode alcançar.
  await banco.sql.query(
    `insert into public.consent_records (account_id, kind, granted, evidence)
     values ($1, 'recording', true, $2::jsonb)`,
    [id, JSON.stringify({ conta: rotulo })],
  )

  // Uma chamada por conta, por insert de serviço: `calls` é da classe Servidor
  // e não tem política de escrita de cliente. A chave de idempotência leva o
  // rótulo da conta porque o único é por (conta, chave) — igual nos dois lados
  // entraria do mesmo jeito, mas a mensagem de falha ficaria ilegível.
  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key, to_number)
     values ($1, $2, 'discovery', 'outbound', $3, $4)
     returning id`,
    [
      id,
      leadId,
      `${MARCA}:travessia:${rotulo}`,
      `+551196000000${rotulo === 'A' ? '1' : '2'}`,
    ],
  )
  const chamadaId = chamadas[0]?.id
  if (!chamadaId) throw new Error(`Sem chamada na conta ${rotulo}`)

  // Uma reunião por conta (US-160), marcada na chamada acima e com o
  // especialista da própria conta. O horário é o mesmo nos dois lados: a
  // restrição de exclusão é por especialista, e os dois são diferentes.
  await banco.sql.query(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, booked_call_id)
     values ($1, $2, $3, '2026-10-06T17:00:00Z', '2026-10-06T17:30:00Z', 'video', $4)`,
    [id, leadId, especialistaId, chamadaId],
  )

  // Uma oferta de horário por conta (US-162). Classe Servidor: insert de
  // serviço, que é como tool-availability grava.
  await banco.sql.query(
    `insert into public.call_slot_offers
       (account_id, call_id, position, specialist_id, starts_at, ends_at)
     values ($1, $2, 1, $3, '2026-10-06T18:00:00Z', '2026-10-06T18:30:00Z')`,
    [id, chamadaId, especialistaId],
  )

  // A porta do modelo por conta, com modelo diferente nos dois lados: é por ele
  // que a resolução decide com quem falar, e o mesmo nos dois deixaria a
  // travessia passar mesmo se a leitura viesse da conta errada. A conexão entra
  // pelo RPC de serviço, que é o caminho do produto; a escolha do modelo vai
  // direto pela tabela, e não por escolher_modelo_da_conta, pela razão de
  // set_account_secret logo acima — o RPC exige o administrador em auth.uid() e
  // aqui a sessão é de serviço. O que a varredura mede é o alcance da tabela.
  await banco.sql.query('select public.concluir_conexao_de_modelo($1, $2, $3::jsonb, $4)', [
    id,
    'openrouter',
    JSON.stringify({ final: rotulo === 'A' ? 'aaaa' : 'bbbb' }),
    usuarioId,
  ])
  await banco.sql.query(
    'update public.model_settings set model_for_review = $2 where account_id = $1',
    [id, rotulo === 'A' ? 'anthropic/claude-opus-5' : 'google/gemini-3-pro'],
  )

  // Um ensaio por conta (US-247). Entra pelo RPC de serviço, que é o caminho do
  // produto: a tabela não tem política de escrita, e o ensaio nasce junto com
  // a chamada dele. A persona é diferente nos dois lados porque é ela que a
  // ficha mostra — a mesma nas duas deixaria a travessia passar mesmo se a
  // leitura viesse da conta errada. A publicação é a da própria conta: não
  // existe ensaio sem publicação (US-098, T-16).
  await banco.sql.query(
    `select public.abrir_ensaio($1, 'discovery', 'text', $2::jsonb, $3, $4, null)`,
    [
      id,
      JSON.stringify({ nome: `Persona da conta ${rotulo}` }),
      usuarioId,
      publicacaoId,
    ],
  )

  // Uma revisão de chamada por conta, com o questionário e as duas famílias de
  // proposta. Insert de serviço porque as três tabelas são da classe Servidor:
  // quem escreve é a borda call-review. O texto é diferente nos dois lados
  // porque é ele que a ficha mostra — igual nas duas deixaria a travessia
  // passar mesmo se a leitura viesse da conta errada.
  const { rows: revisoes } = await banco.sql.query<{ id: string }>(
    `insert into public.call_reviews (account_id, call_id, purpose, analysis)
     values ($1, $2, 'discovery', $3::jsonb)
     returning id`,
    [id, chamadaId, JSON.stringify({ resumo: `O lead da conta ${rotulo} pediu para repetir.` })],
  )
  const revisaoId = revisoes[0]?.id
  if (!revisaoId) throw new Error(`Sem revisão na conta ${rotulo}`)

  await banco.sql.query(
    `insert into public.call_review_questions (account_id, review_id, position, question, why)
     values ($1, $2, 1, $3, $4)`,
    [
      id,
      revisaoId,
      `Existe faixa de preço pública na conta ${rotulo}?`,
      `O lead da conta ${rotulo} perguntou o preço e ficou sem resposta.`,
    ],
  )

  // As duas famílias, para a travessia cobrir as duas formas do check: a que
  // se aplica carrega texto, a que encaminha carrega caminho e ação.
  await banco.sql.query(
    `insert into public.call_review_changes
       (account_id, review_id, position, kind, title, rationale, body)
     values ($1, $2, 1, 'script', $3, $4, $5)`,
    [
      id,
      revisaoId,
      `Abrir dizendo de onde fala — conta ${rotulo}`,
      `O lead da conta ${rotulo} pediu para repetir a abertura.`,
      `1. Diga que fala da conta ${rotulo}.\n2. Pergunte pela operação.`,
    ],
  )
  await banco.sql.query(
    `insert into public.call_review_changes
       (account_id, review_id, position, kind, title, rationale, path, path_action)
     values ($1, $2, 2, 'voice', $3, $4, '/sarah/voz', $5)`,
    [
      id,
      revisaoId,
      `Testar outra voz — conta ${rotulo}`,
      `O interlocutor da conta ${rotulo} não entendeu a Sarah.`,
      `Ouça as prévias e troque a voz da conta ${rotulo}.`,
    ],
  )

  // Um diagnóstico de chamada por conta, por insert de serviço: classe
  // Servidor, quem grava é a borda call-diagnose. A causa é diferente nos dois
  // lados porque é ela que a ficha mostra — igual nas duas deixaria a
  // travessia passar mesmo se a leitura viesse da conta errada.
  await banco.sql.query(
    `insert into public.call_diagnoses
       (account_id, call_id, purpose, findings, cause, diagnosis, model_status, proposals, created_by)
     values ($1, $2, 'discovery', '[]'::jsonb, $3, $4, 'ok', $5::jsonb, $6)`,
    [
      id,
      chamadaId,
      `A Sarah da conta ${rotulo} encerrou cedo.`,
      `O lead da conta ${rotulo} disse "pode sim" e a ligação caiu.`,
      JSON.stringify([
        { id: 'p1', alvo: 'republicar', titulo: `Publicar a conta ${rotulo}`, razao: 'x', antes: null, depois: null, origem: 'regra', estado: 'pendente' },
      ]),
      usuarioId,
    ],
  )

  // Uma parcela de custo por conta, por insert de serviço pelo mesmo motivo:
  // `call_costs` é da classe Servidor. O valor é diferente nos dois lados
  // porque é a soma desta tabela que vira o teto de gasto do dia — valores
  // iguais deixariam a travessia passar mesmo se a soma viesse da conta errada.
  await banco.sql.query(
    `insert into public.call_costs
       (account_id, call_id, component, amount_cents, source)
     values ($1, $2, 'telephony', $3, $4)`,
    [
      id,
      chamadaId,
      rotulo === 'A' ? 137 : 911,
      `cenario-de-travessia-${rotulo}`,
    ],
  )

  // Uma tentativa de discagem por conta, por insert de serviço: `call_attempts`
  // é da classe Servidor e não tem política de escrita de cliente. O desfecho é
  // de recusa de propósito — é a linha que a US-051 exige que exista mesmo
  // quando a ligação não sai, e a que faz o teto diário significar alguma coisa.
  await banco.sql.query(
    `insert into public.call_attempts
       (account_id, lead_id, phone_e164, outcome, actor, source)
     values ($1, $2, $3, 'daily_per_number', 'system', $4)`,
    [
      id,
      leadId,
      `+551195000000${rotulo === 'A' ? '1' : '2'}`,
      `cenario-de-travessia-${rotulo}`,
    ],
  )

  // Uma invocação de ferramenta por conta, por insert de serviço:
  // `call_tool_invocations` é da classe Servidor e quem escreve são as próprias
  // ferramentas e call-finalize. A ferramenta é diferente nos dois lados porque
  // é por ela que a ficha diz o que a Sarah acionou — a mesma nas duas deixaria
  // a travessia passar mesmo se a leitura viesse da conta errada.
  await banco.sql.query(
    `insert into public.call_tool_invocations
       (account_id, call_id, tool, request)
     values ($1, $2, $3, $4::jsonb)`,
    [
      id,
      chamadaId,
      rotulo === 'A' ? 'tool-qualify' : 'system:end_call',
      JSON.stringify({ conta: rotulo }),
    ],
  )

  // Um item de fila por conta, por insert de serviço: `dial_queue` é da classe
  // Servidor e quem enfileira são as rotinas produtoras. A referência da fonte
  // é o próprio lead de cada conta, que já é diferente nos dois lados — o único
  // é por (conta, fonte, referência, tentativa), e referência igual nas duas
  // entraria do mesmo jeito, mas a mensagem de falha ficaria ilegível.
  await banco.sql.query(
    `insert into public.dial_queue
       (account_id, lead_id, purpose, source, source_ref)
     values ($1, $2, 'discovery', 'stl', $3)`,
    [id, leadId, leadId],
  )

  // Um lead ignorado pelo fala-rápido por conta, por insert de serviço:
  // `speed_to_lead_skips` é da classe Servidor e quem registra é
  // `cron-speed-to-lead`. Razões diferentes nos dois lados, para a mensagem de
  // falha dizer de qual conta veio a linha.
  await banco.sql.query(
    `insert into public.speed_to_lead_skips (lead_id, account_id, reason, detail)
     values ($1, $2, $3, $4)`,
    [leadId, id, rotulo === 'A' ? 'outside_window' : 'blocked', `ignorado na conta ${rotulo}`],
  )

  // Um aviso de provedor e a marca do vigia por conta, por insert de serviço:
  // as duas são da classe Servidor e quem escreve é `cron-credit-watch`.
  // Provedores diferentes nos dois lados, para a falha dizer de qual conta veio.
  await banco.sql.query(
    `insert into public.provider_alerts (account_id, provider, kind, message)
     values ($1, $2, 'credito', $3)`,
    [id, rotulo === 'A' ? 'telefonia' : 'voz', `crédito baixo na conta ${rotulo}`],
  )
  await banco.sql.query(
    `insert into public.provider_watch (account_id, claimed_at) values ($1, now())`,
    [id],
  )

  // Uma execução de rotina e uma chamada externa por conta: as duas são da
  // classe Servidor e quem escreve são as rotinas e as funções de borda. A
  // execução nasce e se fecha pelas funções de `job_runs`, que são o caminho
  // das rotinas desde a F6, e não por insert direto. A linha de conta nula —
  // a passagem da instalação — não entra aqui de propósito: ela não é de
  // conta nenhuma, e a varredura mede o que cada conta vê da outra. Que ela
  // não seja vista por ninguém é prova de `observabilidade.test.ts`.
  const { rows: execucao } = await banco.sql.query<{ id: string }>(
    `select public.abrir_execucao_de_rotina($1, $2, now()) as id`,
    [id, rotulo === 'A' ? 'cron-dial' : 'cron-cadence'],
  )
  await banco.sql.query(
    `select public.fechar_execucao_de_rotina($1, $2, null, now())`,
    [execucao[0]!.id, rotulo === 'A' ? 4 : 9],
  )

  await banco.sql.query(
    `insert into public.integration_events
       (account_id, direction, provider, endpoint, correlation_id)
     values ($1, 'outbound', 'telefonia', $2, $3)`,
    [id, rotulo === 'A' ? '/Calls' : '/Messages', `${chamadaId}`],
  )

  // Um item na fila de exceções por conta, preso ao lead e à chamada da mesma
  // conta. Entra por insert de serviço, que é o caminho das ferramentas; a
  // inclusão manual do operador é prova de `fila-de-excecoes.test.ts`. Gêneros
  // diferentes nos dois lados, para a falha dizer de qual conta veio a linha.
  await banco.sql.query(
    `insert into public.exception_items (account_id, kind, lead_id, call_id, context)
     values ($1, $2, $3, $4, $5)`,
    [
      id,
      rotulo === 'A' ? 'human_requested' : 'dnc_requested',
      leadId,
      chamadaId,
      JSON.stringify({ recorte: `pedido na conta ${rotulo}` }),
    ],
  )

  // Uma conversa de WhatsApp e uma mensagem por conta, pelos RPCs da borda:
  // as duas tabelas são da classe Servidor e quem escreve é whatsapp-inbound.
  // Textos diferentes nos dois lados, para a falha dizer de qual conta veio.
  const { rows: conversas } = await banco.sql.query<{ conversation_id: string }>(
    `select conversation_id from public.abrir_conversa_do_whatsapp($1, $2, $3, 'discovery', 'lead')`,
    [id, `+551199000000${rotulo === 'A' ? '1' : '2'}`, leadId],
  )
  await banco.sql.query(
    `select public.registrar_mensagem_do_whatsapp($1, $2, 'in', 'lead', null, $3, null, $4, 'recebida')`,
    [id, conversas[0]?.conversation_id, `mensagem da conta ${rotulo}`, `ZAPI-${rotulo}`],
  )

  // Um critério de avaliação próprio por conta, além dos três da semente, que
  // nascem com a conta pelo gatilho (US-142). Chaves diferentes nos dois
  // lados, para a falha dizer de qual conta veio a linha.
  await banco.sql.query(
    `insert into public.evaluation_criteria (account_id, key, label, obrigatorio, como, position)
     values ($1, $2, $3, false, 'modelo', 10)`,
    [id, rotulo === 'A' ? 'criterio_da_conta_a' : 'criterio_da_conta_b', `Critério da conta ${rotulo}`],
  )

  // `call_live` não se insere aqui, e a ausência do insert é o ponto, como em
  // `account_settings`: a linha nasce do gatilho em `calls`, e a chamada acima
  // nasce em `queued`, que é um dos três estados vivos. Se alguém trocar o
  // gatilho por escrita de borda, a varredura reprova sozinha — a conta
  // deixaria de enxergar a própria chamada em curso.

  // `account_settings` não se insere aqui, e a ausência do insert é o ponto: a
  // linha nasce com a conta, pelo gatilho da migração de roteamento. Se alguém
  // trocar o gatilho por um insert de cliente, a varredura reprova sozinha — a
  // conta deixaria de enxergar a própria linha. O que entra é um update, para a
  // política de discagem de cada conta ser diferente: teto igual nas duas
  // deixaria a travessia passar mesmo se a leitura viesse da conta errada.
  await banco.sql.query(
    `update public.account_settings
        set daily_calls_cap = $2, dialing_window = $3::jsonb, sentiment_floor = $4
      where account_id = $1`,
    [
      id,
      rotulo === 'A' ? 300 : 150,
      JSON.stringify(
        rotulo === 'A'
          ? { '1': { start: '09:00', end: '18:00' } }
          : { '2': { start: '08:00', end: '12:00' } },
      ),
      rotulo === 'A' ? -0.3 : -0.7,
    ],
  )

  // Uma linha de auditoria por conta. `audit_log` não se semeia por insert — o
  // cliente não escreve nela, e o teste não deveria ser a exceção: a linha nasce
  // do gatilho, mudando uma configuração da conta.
  await banco.sql.query(
    'update public.accounts set timezone = $2 where id = $1',
    [id, 'America/Fortaleza'],
  )

  return { rotulo, id, usuarioId }
}

/** Tabelas de negócio do schema público, direto do catálogo. */
async function lerTabelasDePublic(): Promise<TabelaDePublic[]> {
  const { rows } = await banco.sql.query<{
    nome: string
    tem_account_id: boolean
  }>(
    `select c.relname as nome,
            exists (
              select 1
                from pg_attribute as a
               where a.attrelid = c.oid
                 and a.attname = 'account_id'
                 and a.attnum > 0
                 and not a.attisdropped
            ) as tem_account_id
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relispartition = false
      order by c.relname`,
  )
  return rows.map((linha) => ({
    nome: linha.nome,
    temAccountId: linha.tem_account_id,
  }))
}

function fechadaAoCliente(tabela: TabelaDePublic): boolean {
  return tabela.nome in SEM_LEITURA_DE_CLIENTE
}

function ligadorDe(tabela: TabelaDePublic): Ligador | null {
  const declarado = LIGACOES_DECLARADAS[tabela.nome]
  if (declarado) return declarado
  return tabela.temAccountId ? POR_ACCOUNT_ID : null
}

/** Quantas linhas da conta alvo a sessão atual consegue enxergar. */
async function contarVisiveis(
  tabela: TabelaDePublic,
  alvo: Conta,
): Promise<number> {
  const ligador = ligadorDe(tabela)
  if (!ligador) throw new Error(`${tabela.nome} sem ligação declarada`)
  const ligacao = ligador(alvo)
  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.${tabela.nome} where ${ligacao.where}`,
    ligacao.params,
  )
  return rows[0]?.total ?? 0
}

/** Nome da política de leitura da tabela, que os testes de regressão derrubam. */
async function politicaDeLeitura(tabela: string): Promise<string> {
  const { rows } = await banco.sql.query<{ policyname: string }>(
    `select policyname
       from pg_policies
      where schemaname = 'public'
        and tablename = $1
        and cmd in ('SELECT', 'ALL')`,
    [tabela],
  )
  const nome = rows[0]?.policyname
  if (!nome) throw new Error(`${tabela} não tem política de leitura`)
  return nome
}

/** Roda a manobra e desfaz tudo o que ela fizer, inclusive o DDL. */
async function descartando(manobra: () => Promise<void>): Promise<void> {
  await banco.sql.query('begin')
  try {
    await manobra()
  } finally {
    await banco.comoServico()
    await banco.sql.query('rollback')
  }
}

// Alicerce -------------------------------------------------------------------

test(`o cenário tem duas contas com um usuário cada, em ${descreverBancoParaRls()}`, async () => {
  expect(contaA.id).not.toBe(contaB.id)
  expect(contaA.usuarioId).not.toBe(contaB.usuarioId)

  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total
       from public.account_members
      where account_id in ($1, $2)`,
    [contaA.id, contaB.id],
  )
  expect(rows[0]?.total).toBe(2)
})

test('toda tabela de public diz como se liga à conta', () => {
  expect(tabelas.length).toBeGreaterThan(0)

  const orfas = tabelas.filter((tabela) => ligadorDe(tabela) === null)
  expect(
    orfas.map((tabela) => tabela.nome),
    'tabela sem account_id e sem entrada em LIGACOES_DECLARADAS: a varredura ' +
      'não sabe quais linhas dela são de qual conta, e passaria por cima dela',
  ).toEqual([])
})

/**
 * As quatro tabelas que a F1 traz. A varredura é de catálogo e as pegaria
 * sozinha, mas tabela que o cenário não semeia sai da lista de legíveis sem
 * ruído nenhum — e aí o par "vê a própria, não vê a vizinha" deixa de ser
 * medido nela. Esta asserção é o ponto de checagem da fase: as quatro estão na
 * varredura, e do lado em que os dois sentidos são cobrados.
 */
const TABELAS_DA_F1 = ['pipelines', 'pipeline_stages', 'leads', 'lead_events']

test('as quatro tabelas da F1 entram na varredura pelo lado dos dois sentidos', () => {
  const legiveis = tabelasLegiveis.map((tabela) => tabela.nome)

  for (const nome of TABELAS_DA_F1) {
    expect(
      legiveis,
      `${nome} ficou fora da varredura de leitura: ou a migração sumiu, ou a ` +
        'tabela entrou em SEM_LEITURA_DE_CLIENTE e os dois sentidos deixaram ' +
        'de ser cobrados nela',
    ).toContain(nome)
  }
})

/**
 * As dezenove tabelas que a F2 traz (US-093). Mesma razão da lista da F1: o
 * catálogo as pega sozinho, mas só esta asserção diz de que lado cada uma está.
 * As que o cliente lê cobram os dois sentidos; a que não lê precisa estar em
 * SEM_LEITURA_DE_CLIENTE, com a razão escrita.
 */
const TABELAS_DA_F2 = [
  'agents',
  'agent_publications',
  'playbooks',
  'playbook_versions',
  'knowledge_entries',
  'account_settings',
  'account_test_numbers',
  'phone_lines',
  'dnc_entries',
  'consent_records',
  'calls',
  'call_attempts',
  'call_costs',
  'call_tool_invocations',
  'call_live',
  'dial_queue',
  'job_runs',
  'integration_events',
  'app_config',
]

test('as dezenove tabelas da F2 entram na varredura, cada uma do seu lado', () => {
  const legiveis = tabelasLegiveis.map((tabela) => tabela.nome)
  const fechadas = tabelasFechadas.map((tabela) => tabela.nome)

  for (const nome of TABELAS_DA_F2) {
    expect(
      legiveis.includes(nome) || fechadas.includes(nome),
      `${nome} não está na varredura: a migração sumiu ou o catálogo não a vê`,
    ).toBe(true)
  }
  expect(
    TABELAS_DA_F2.filter((nome) => fechadas.includes(nome)),
    'tabela da F2 passou para SEM_LEITURA_DE_CLIENTE (ou saiu de lá): os dois ' +
      'sentidos deixaram de ser cobrados nela, ou passaram a ser sem razão escrita',
  ).toEqual(['app_config'])
})

/**
 * A tabela que a F4 cria e as quatro que ela amplia (US-151). A criada precisa
 * estar do lado dos dois sentidos; as ampliadas já estavam, e continuar lá é o
 * que prova que coluna nova não abriu caminho para a conta vizinha.
 */
const TABELAS_DA_F4 = {
  criadas: ['evaluation_criteria'],
  ampliadas: ['exception_items', 'pipeline_stages', 'calls', 'account_settings'],
}

test('as tabelas que a F4 criou e ampliou entram na varredura pelo lado dos dois sentidos', () => {
  const legiveis = tabelasLegiveis.map((tabela) => tabela.nome)

  for (const nome of [...TABELAS_DA_F4.criadas, ...TABELAS_DA_F4.ampliadas]) {
    expect(
      legiveis,
      `${nome} ficou fora da varredura de leitura: ou a migração sumiu, ou a ` +
        'tabela entrou em SEM_LEITURA_DE_CLIENTE e os dois sentidos deixaram ' +
        'de ser cobrados nela',
    ).toContain(nome)
  }
})

/**
 * As sete tabelas que a F5 traz (US-184). Todas são legíveis por membro, até
 * as duas da classe Servidor (`specialist_busy_blocks` e `call_slot_offers`):
 * a tela mostra a ocupação e a ficha da chamada mostra o que foi oferecido.
 * Nenhuma pode ir para SEM_LEITURA_DE_CLIENTE sem que esta lista acuse.
 */
const TABELAS_DA_F5 = [
  'specialists',
  'specialist_availability',
  'specialist_blocks',
  'specialist_calendars',
  'specialist_busy_blocks',
  'meetings',
  'call_slot_offers',
]

test('as sete tabelas da F5 entram na varredura pelo lado dos dois sentidos', () => {
  const legiveis = tabelasLegiveis.map((tabela) => tabela.nome)

  for (const nome of TABELAS_DA_F5) {
    expect(
      legiveis,
      `${nome} ficou fora da varredura de leitura: ou a migração sumiu, ou a ` +
        'tabela entrou em SEM_LEITURA_DE_CLIENTE e os dois sentidos deixaram ' +
        'de ser cobrados nela',
    ).toContain(nome)
  }
})

/**
 * As duas tabelas do canal de WhatsApp. Classe Servidor, legíveis por membro:
 * a tela da conversa lê as duas pelo cliente.
 */
const TABELAS_DO_WHATSAPP = ['whatsapp_conversations', 'whatsapp_messages']

test('as duas tabelas do WhatsApp entram na varredura pelo lado dos dois sentidos', () => {
  const legiveis = tabelasLegiveis.map((tabela) => tabela.nome)
  for (const nome of TABELAS_DO_WHATSAPP) {
    expect(legiveis, `${nome} ficou fora da varredura de leitura`).toContain(nome)
  }
})

test('cada conta lê o próprio limiar de sentimento, e não o da vizinha', async () => {
  for (const [dona, piso] of [
    [contaA, -0.3],
    [contaB, -0.7],
  ] as const) {
    await banco.comoUsuario(dona.usuarioId)
    const { rows } = await banco.sql.query<{ account_id: string; sentiment_floor: string }>(
      'select account_id, sentiment_floor from public.account_settings',
    )
    expect(rows.map((linha) => linha.account_id)).toEqual([dona.id])
    expect(Number(rows[0]?.sentiment_floor)).toBe(piso)
  }
  await banco.comoServico()
})

// Travessia ------------------------------------------------------------------

test('o usuário de cada conta enxerga as linhas da própria conta em toda tabela', async () => {
  expect(tabelasLegiveis.length).toBeGreaterThan(0)

  for (const dona of [contaA, contaB]) {
    await banco.comoUsuario(dona.usuarioId)
    for (const tabela of tabelasLegiveis) {
      expect(
        await contarVisiveis(tabela, dona),
        `${dona.rotulo} não enxerga a própria linha em ${tabela.nome}; ` +
          'ou a política de leitura sumiu, ou o cenário não cria linha nessa tabela',
      ).toBeGreaterThan(0)
    }
  }
})

test('o usuário da conta A recebe zero linha da conta B em toda tabela', async () => {
  await banco.comoUsuario(contaA.usuarioId)
  for (const tabela of tabelas) {
    expect(
      await contarVisiveis(tabela, contaB),
      `A atravessou para a conta B em ${tabela.nome}`,
    ).toBe(0)
  }
})

test('o usuário da conta B recebe zero linha da conta A em toda tabela', async () => {
  await banco.comoUsuario(contaB.usuarioId)
  for (const tabela of tabelas) {
    expect(
      await contarVisiveis(tabela, contaA),
      `B atravessou para a conta A em ${tabela.nome}`,
    ).toBe(0)
  }
})

test('sessão anônima recebe zero linha das duas contas em toda tabela', async () => {
  await banco.comoAnonimo()
  for (const tabela of tabelas) {
    for (const conta of [contaA, contaB]) {
      expect(
        await contarVisiveis(tabela, conta),
        `anônimo alcançou ${tabela.nome} da conta ${conta.rotulo}`,
      ).toBe(0)
    }
  }
})

// Tabela fechada ao cliente ---------------------------------------------------

test('a tabela declarada fechada não tem política de leitura no catálogo', async () => {
  for (const tabela of tabelasFechadas) {
    const { rows } = await banco.sql.query<{ policyname: string }>(
      `select policyname
         from pg_policies
        where schemaname = 'public'
          and tablename = $1
          and cmd in ('SELECT', 'ALL')`,
      [tabela.nome],
    )
    expect(
      rows.map((linha) => linha.policyname),
      `${tabela.nome} está em SEM_LEITURA_DE_CLIENTE e ganhou política de ` +
        'leitura: ou a política sobra, ou a declaração está velha e a tabela ' +
        'deveria voltar para a varredura normal',
    ).toEqual([])
  }
})

test('a tabela fechada não devolve linha nem para a própria conta', async () => {
  for (const conta of [contaA, contaB]) {
    await banco.comoUsuario(conta.usuarioId)
    for (const tabela of tabelasFechadas) {
      expect(
        await contarVisiveis(tabela, conta),
        `${tabela.nome} ficou legível pelo cliente da conta ${conta.rotulo}; ` +
          SEM_LEITURA_DE_CLIENTE[tabela.nome],
      ).toBe(0)
    }
  }
})

// Regressão ------------------------------------------------------------------
// Estas duas provam que os testes acima têm dente. Mexem no esquema, então só
// rodam no banco efêmero: no Postgres do CI, um rollback que falhasse deixaria
// a tabela aberta para a execução seguinte.

test.runIf(BANCO_EFEMERO)(
  'sem a política de leitura, a conta deixa de enxergar as próprias linhas',
  async () => {
    expect(banco.efemero, 'derrubar política só em banco descartável').toBe(true)
    for (const tabela of tabelasLegiveis) {
      const politica = await politicaDeLeitura(tabela.nome)
      await descartando(async () => {
        await banco.sql.query(
          `drop policy "${politica}" on public.${tabela.nome}`,
        )
        await banco.comoUsuario(contaA.usuarioId)
        expect(
          await contarVisiveis(tabela, contaA),
          `${tabela.nome} continuou legível sem a política ${politica}: ` +
            'a varredura não estaria medindo a política',
        ).toBe(0)
      })
    }
  },
)

test.runIf(BANCO_EFEMERO)(
  'com a leitura afrouxada para using (true), a travessia acontece e é vista',
  async () => {
    expect(banco.efemero, 'afrouxar política só em banco descartável').toBe(true)
    for (const tabela of tabelasLegiveis) {
      const politica = await politicaDeLeitura(tabela.nome)
      await descartando(async () => {
        await banco.sql.query(
          `alter policy "${politica}" on public.${tabela.nome} using (true)`,
        )
        await banco.comoUsuario(contaA.usuarioId)
        expect(
          await contarVisiveis(tabela, contaB),
          `${tabela.nome} seguiu isolada com a política ${politica} em ` +
            'using (true): a varredura não olharia para o vazamento',
        ).toBeGreaterThan(0)
      })
    }
  },
)
