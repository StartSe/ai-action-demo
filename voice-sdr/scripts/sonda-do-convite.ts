// A prova do convite da reunião contra o Resend de verdade, e o passo de
// `check:full` que a executa (`npm run check:convite`).
//
// POR QUE ELA NÃO RODA NO LAÇO: mandar e-mail de verdade exige rede, a chave do
// provedor de e-mail transacional e um domínio de envio com DNS verificado
// (O-03, docs/esperas-externas.md). O laço de execução é em processo, sem
// container, sem rede e sem permissão do macOS (`CLAUDE.md`, "Validação: em
// processo, sem container"); a regra do convite já se prova ali, com a porta
// de e-mail dublada, em `supabase/functions/_shared/agenda/convite-de-reuniao.test.ts`
// e `supabase/functions/_shared/email/email-resend.test.ts`. Esta sonda é o
// mesmo adaptador contra a API de verdade, e **sai com zero quando
// SARAH_RESEND_API_KEY está ausente**, que é o caso de toda máquina de
// desenvolvimento e de todo envio sem segredo. Vermelho por falta de credencial
// ensinaria o time a ignorar a esteira.
//
// O QUE ELA COBRA, com um destinatário de prova (nunca um lead):
//   1. o convite de uma reunião de prova sai com 2xx, com o anexo .ics;
//   2. mandar de novo com a mesma chave de idempotência também responde 2xx, e
//      o provedor devolve o mesmo envio, e não um segundo e-mail.

import { randomUUID } from 'node:crypto'

import { montarConvite, type ReuniaoParaConvite } from '../supabase/functions/_shared/agenda/convite-de-reuniao.ts'
import { criarEmailDoResend } from '../supabase/functions/_shared/email/email-resend.ts'

/** Sem esta variável a sonda não tem o que fazer, e sair com zero é o certo. */
const VARIAVEL_DA_CHAVE = 'SARAH_RESEND_API_KEY'

async function principal(): Promise<number> {
  const chave = process.env[VARIAVEL_DA_CHAVE]?.trim()
  if (!chave) {
    console.log(
      `sonda do convite: ${VARIAVEL_DA_CHAVE} ausente, nada a provar. O envio de verdade exige a chave e o domínio de envio verificado (O-03).`,
    )
    return 0
  }
  const remetente = process.env.SARAH_EMAIL_REMETENTE?.trim()
  const destino = process.env.SARAH_EMAIL_SONDA_DESTINO?.trim()
  if (!remetente || !destino) {
    console.error('sonda do convite: com a chave, SARAH_EMAIL_REMETENTE e SARAH_EMAIL_SONDA_DESTINO são obrigatórios.')
    return 1
  }

  const porta = criarEmailDoResend({ buscar: (url, pedido) => fetch(url, pedido), chave, remetente, prazoMs: 10_000 })
  const agora = Date.now()
  const inicio = new Date(agora + 30 * 86_400_000)
  inicio.setUTCHours(3, 0, 0, 0)
  const semEntrega = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }
  const reuniao: ReuniaoParaConvite = {
    id: randomUUID(),
    account_id: randomUUID(),
    starts_at: inicio.toISOString(),
    ends_at: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    modality: 'video',
    notes: null,
    handoff_summary: 'Convite de prova do degrau 3. Pode ser apagado.',
    empresa: 'Sonda do Voice SDR',
    assistente: null,
    fusoDaConta: 'America/Sao_Paulo',
    lead: {
      nome: 'Sonda',
      email: destino,
      telefone: null,
      fuso: 'America/Sao_Paulo',
      empresa: null,
      cidade: null,
      estado: null,
      origem: null,
      temperatura: null,
      entrouEm: null,
      ultimaAtividade: null,
    },
    especialista: { nome: 'Especialista de prova', email: destino, fuso: 'America/Manaus', sala: null },
    entregaDoLead: semEntrega,
    entregaDoEspecialista: semEntrega,
  }

  let falhas = 0
  const passo = (nome: string, certo: boolean, detalhe = ''): void => {
    console.log(`${certo ? '✓' : '✗'} ${nome}${detalhe ? ` (${detalhe})` : ''}`)
    if (!certo) falhas += 1
  }

  const mensagem = montarConvite(reuniao, 'lead', destino, agora)
  const primeira = await porta.enviar(mensagem)
  passo('convite enviado com 2xx', primeira.ok, primeira.ok ? '' : primeira.motivo)

  const segunda = await porta.enviar(mensagem)
  passo(
    'a mesma chave de idempotência devolve o mesmo envio',
    primeira.ok && segunda.ok && segunda.idDoEnvio === primeira.idDoEnvio,
    segunda.ok ? '' : segunda.motivo,
  )

  console.log(`sonda do convite: ${falhas} falhas.`)
  return falhas === 0 ? 0 : 1
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(erro)
    process.exit(1)
  },
)
