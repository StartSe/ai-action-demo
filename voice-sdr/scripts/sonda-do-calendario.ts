// A prova do adaptador do Google contra o Google de verdade, e o passo de
// `check:full` que a executa (`npm run check:calendario`).
//
// POR QUE ELA NÃO RODA NO LAÇO: ler e escrever num calendário real exige rede,
// o par do aplicativo OAuth, um token de renovação de uma agenda de prova e,
// para escopo sensível de calendário, o aplicativo verificado pelo Google
// (P-04, docs/esperas-externas.md). O laço de execução é em processo, sem
// container, sem rede e sem permissão do macOS (`CLAUDE.md`, "Validação: em
// processo, sem container"); a regra do adaptador já se prova ali, com o
// `buscar` dublado, em `supabase/functions/_shared/agenda/calendario.test.ts`.
// Esta sonda é a mesma porta contra a API de verdade, e **sai com zero quando
// SARAH_GOOGLE_CALENDAR_REFRESH_TOKEN está ausente**, que é o caso de toda
// máquina de desenvolvimento, de todo envio sem segredo e de todo ambiente
// enquanto a verificação do aplicativo não sai. Vermelho por falta de
// credencial ensinaria o time a ignorar a esteira.
//
// O QUE ELA COBRA, numa agenda de prova (nunca a de um especialista):
//   1. a ocupação dos próximos 7 dias volta em instantes UTC, com duração;
//   2. o evento de uma reunião de prova é criado com o id derivado dela;
//   3. criar de novo a mesma reunião devolve o mesmo id, e não um segundo evento;
//   4. a checagem ao vivo vê o horário do evento como tomado;
//   5. apagar o evento responde apagado, e apagar de novo também;
//   6. depois de apagar, a checagem ao vivo vê o horário livre.
// O evento vai para daqui a 30 dias, às 03h UTC, para não cruzar agenda de
// ninguém; e é apagado no fim mesmo quando um passo do meio falha.

import { randomUUID } from 'node:crypto'

import { criarCalendarioDoGoogle } from '../supabase/functions/_shared/agenda/calendario-google.ts'
import { janelaAbsoluta, type ResultadoDoCalendario } from '../supabase/functions/_shared/agenda/calendario.ts'

/** Sem esta variável a sonda não tem o que fazer, e sair com zero é o certo. */
const VARIAVEL_DO_TOKEN = 'SARAH_GOOGLE_CALENDAR_REFRESH_TOKEN'

const DIA_MS = 86_400_000

async function principal(): Promise<number> {
  const token = process.env[VARIAVEL_DO_TOKEN]?.trim()
  if (!token) {
    console.log(
      `sonda do calendário: ${VARIAVEL_DO_TOKEN} ausente, nada a provar. A prova contra o Google exige aplicativo OAuth verificado (P-04).`,
    )
    return 0
  }
  const clienteId = process.env.SARAH_GOOGLE_CLIENT_ID?.trim()
  const clienteSegredo = process.env.SARAH_GOOGLE_CLIENT_SECRET?.trim()
  if (!clienteId || !clienteSegredo) {
    console.error('sonda do calendário: com o token de prova, SARAH_GOOGLE_CLIENT_ID e SARAH_GOOGLE_CLIENT_SECRET são obrigatórios.')
    return 1
  }

  const porta = criarCalendarioDoGoogle({
    buscar: (url, pedido) => fetch(url, pedido),
    clienteId,
    clienteSegredo,
    tokenDeAtualizacao: token,
    agendaId: process.env.SARAH_GOOGLE_CALENDAR_ID?.trim() || 'primary',
    fuso: 'America/Sao_Paulo',
    prazoMs: 10_000,
  })

  let falhas = 0
  const passo = (nome: string, certo: boolean, detalhe = ''): void => {
    console.log(`${certo ? '✓' : '✗'} ${nome}${detalhe ? ` (${detalhe})` : ''}`)
    if (!certo) falhas += 1
  }
  const motivo = (resultado: ResultadoDoCalendario<unknown>): string => (resultado.ok ? '' : resultado.motivo)

  const agora = Date.now()
  const janela = janelaAbsoluta(new Date(agora).toISOString(), new Date(agora + 7 * DIA_MS).toISOString())
  const ocupacao = await porta.lerOcupacao(janela)
  passo(
    'ocupação dos próximos 7 dias em UTC',
    ocupacao.ok && ocupacao.valor.every((o) => o.inicio.endsWith('Z') && Date.parse(o.fim) > Date.parse(o.inicio)),
    ocupacao.ok ? `${ocupacao.valor.length} compromissos` : motivo(ocupacao),
  )

  const dia = new Date(agora + 30 * DIA_MS)
  dia.setUTCHours(3, 0, 0, 0)
  const inicio = dia.toISOString()
  const fim = new Date(dia.getTime() + 30 * 60_000).toISOString()
  const reuniao = {
    reuniaoId: randomUUID(),
    inicio,
    fim,
    titulo: 'Sonda do calendário do Voice SDR',
    descricao: 'Evento de prova do degrau 3. Pode ser apagado.',
    local: null,
  }

  let criado: string | null = null
  try {
    const primeira = await porta.criarEvento(reuniao)
    criado = primeira.ok ? primeira.valor.externalEventId : null
    passo('evento criado com o id derivado da reunião', criado !== null, motivo(primeira))

    const segunda = await porta.criarEvento(reuniao)
    passo('criar de novo devolve o mesmo evento', segunda.ok && segunda.valor.externalEventId === criado, motivo(segunda))

    const tomado = await porta.conferirHorario(inicio, fim)
    passo('checagem ao vivo vê o horário tomado', tomado.ok && !tomado.valor.livre, motivo(tomado))
  } finally {
    if (criado) {
      const apagado = await porta.apagarEvento(criado)
      passo('evento apagado', apagado.ok, motivo(apagado))
      const denovo = await porta.apagarEvento(criado)
      passo('apagar de novo também responde apagado', denovo.ok, motivo(denovo))
    }
  }

  const livre = await porta.conferirHorario(inicio, fim)
  passo('checagem ao vivo vê o horário livre depois de apagar', livre.ok && livre.valor.livre, motivo(livre))

  console.log(`sonda do calendário: ${falhas} falhas.`)
  return falhas === 0 ? 0 : 1
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(erro)
    process.exit(1)
  },
)
