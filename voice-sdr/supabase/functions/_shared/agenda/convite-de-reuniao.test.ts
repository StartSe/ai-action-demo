// O convite da reunião com a porta de e-mail e a escrita dubladas: os dois
// convites, o fuso de cada lado, a marca só depois do 2xx, a nova tentativa sem
// duplicar envio, o lead sem e-mail e a falha nos dois lados.
//
// O dublê da escrita guarda a linha da reunião em memória e a nova tentativa
// relê dela, como a rotina relê do banco: é assim que "não manda duas vezes"
// se prova pela contagem de idas ao provedor, e não pelo resultado final.

import { describe, expect, test } from 'vitest'

import { falhaDoEmail, type MensagemDeEmail, type PortaDeEmail } from '../email/email.ts'

import {
  ESPERA_SEM_EMAIL_EM_MINUTOS,
  MENSAGEM_SEM_EMAIL,
  RECUO_EM_MINUTOS,
  TETO_DE_TENTATIVAS,
  chaveDoConvite,
  conviteDesistiu,
  dobrarLinhaDoIcs,
  enviarConvitesDaReuniao,
  escaparTextoDoIcs,
  lerReuniaoParaConvite,
  montarIcs,
  situacaoDoConvite,
  uidDoConvite,
  type EntregaDoConvite,
  type LadoDoConvite,
  type PendenciaDoConvite,
  type PortaDoConviteDaReuniao,
  type ReuniaoParaConvite,
} from './convite-de-reuniao.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const AGORA = Date.UTC(2026, 9, 5, 13, 0, 0)
const MINUTO = 60_000

const EMAIL_DO_LEAD = 'marcos.zq7@fluxocargo.test'
const EMAIL_DO_ESPECIALISTA = 'ana.especialista@conta.test'
/** Valores improváveis e presentes: é o que a busca por vazamento precisa achar ou não achar. */
const RESUMO = 'Frota de 38 caminhões, dor na escala de rota; decisor é o sócio Qwertyuiop.'
const TELEFONE = '+5592988887777'

const SEM_ENTREGA: EntregaDoConvite = { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null }

function reuniao(extras: Partial<ReuniaoParaConvite> = {}): ReuniaoParaConvite {
  return {
    id: REUNIAO,
    account_id: CONTA,
    // 17h UTC: 13h em Manaus (UTC−4), 14h em São Paulo (UTC−3), 15h em Noronha (UTC−2).
    starts_at: '2026-10-06T17:00:00Z',
    ends_at: '2026-10-06T17:30:00Z',
    modality: 'video',
    notes: 'quer ver a integração',
    handoff_summary: { resumo: RESUMO },
    empresa: 'Rotas do Norte',
    assistente: 'Lia',
    // O fuso da conta é Noronha de propósito: nenhum dos dois convites pode usá-lo.
    fusoDaConta: 'America/Noronha',
    lead: {
      nome: 'Marcos Lima',
      email: EMAIL_DO_LEAD,
      telefone: TELEFONE,
      fuso: 'America/Manaus',
      empresa: 'Fluxo Cargo',
      cidade: 'Manaus',
      estado: 'AM',
      origem: 'intake',
      temperatura: 'quente',
      entrouEm: '2026-10-01T12:00:00Z',
      ultimaAtividade: '2026-10-05T12:40:00Z',
    },
    especialista: {
      nome: 'Ana Souza',
      email: EMAIL_DO_ESPECIALISTA,
      fuso: 'America/Sao_Paulo',
      sala: 'https://meet.exemplo.com/ana',
    },
    entregaDoLead: SEM_ENTREGA,
    entregaDoEspecialista: SEM_ENTREGA,
    ...extras,
  }
}

type Resposta = 'ok' | 'recusa' | 'fora_do_ar' | 'levanta'

/**
 * A linha em memória, a porta de e-mail que responde pela fila de respostas de
 * cada destinatário e a escrita que muda a linha. `passos` empilha o nome de
 * cada ida, para a ordem ser conferida inteira.
 */
function montar(inicial: ReuniaoParaConvite, respostas: Partial<Record<string, Resposta[]>> = {}) {
  let linha = inicial
  const enviados: MensagemDeEmail[] = []
  const passos: string[] = []
  const pendencias: [LadoDoConvite, PendenciaDoConvite][] = []
  const idas = new Map<string, number>()

  const email: PortaDeEmail = {
    async enviar(mensagem) {
      enviados.push(mensagem)
      passos.push(`enviar:${mensagem.para}`)
      const vez = idas.get(mensagem.para) ?? 0
      idas.set(mensagem.para, vez + 1)
      const fila = respostas[mensagem.para] ?? ['ok']
      const resposta = fila[Math.min(vez, fila.length - 1)] ?? 'ok'
      if (resposta === 'levanta') throw new Error('fetch failed: https://api.resend.com/emails re_chave_secreta')
      if (resposta === 'recusa') return falhaDoEmail('chave_invalida')
      if (resposta === 'fora_do_ar') return falhaDoEmail('provedor_indisponivel')
      return { ok: true, idDoEnvio: `envio-${enviados.length}` }
    },
  }

  const campo = (lado: LadoDoConvite): 'entregaDoLead' | 'entregaDoEspecialista' =>
    lado === 'lead' ? 'entregaDoLead' : 'entregaDoEspecialista'

  const porta: PortaDoConviteDaReuniao = {
    async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
      expect([contaId, reuniaoId]).toEqual([CONTA, REUNIAO])
      passos.push(`gravar:${lado}`)
      // O update é condicionado a `sent_at is null`, como no index.ts.
      if (linha[campo(lado)].enviadoEm !== null) return
      linha = { ...linha, [campo(lado)]: { ...linha[campo(lado)], enviadoEm, erro: null, proximaTentativa: null } }
    },
    async registrarPendenciaDoConvite(contaId, reuniaoId, lado, pendencia) {
      expect([contaId, reuniaoId]).toEqual([CONTA, REUNIAO])
      passos.push(`pendencia:${lado}`)
      pendencias.push([lado, pendencia])
      if (linha[campo(lado)].enviadoEm !== null) return
      linha = {
        ...linha,
        [campo(lado)]: {
          enviadoEm: null,
          tentativas: pendencia.tentativas,
          erro: pendencia.erro,
          proximaTentativa: pendencia.proximaTentativa,
        },
      }
    },
  }

  return {
    email,
    porta,
    enviados,
    passos,
    pendencias,
    idas,
    linha: () => linha,
    rodar: (agora = AGORA) => enviarConvitesDaReuniao({ reuniao: linha, email, porta, agora: () => agora }),
  }
}

function mensagemPara(enviados: readonly MensagemDeEmail[], para: string): MensagemDeEmail {
  const mensagem = enviados.find((item) => item.para === para)
  if (!mensagem) throw new Error(`nenhuma mensagem para ${para}`)
  return mensagem
}

describe('os dois convites', () => {
  test('um para cada lado, com textos diferentes e o anexo de calendário', async () => {
    const cenario = montar(reuniao())
    const desfecho = await cenario.rodar()

    expect(desfecho).toEqual({ lead: { situacao: 'enviado' }, especialista: { situacao: 'enviado' } })
    expect(cenario.enviados.map((m) => m.para).sort()).toEqual([EMAIL_DO_ESPECIALISTA, EMAIL_DO_LEAD].sort())

    const doLead = mensagemPara(cenario.enviados, EMAIL_DO_LEAD)
    const doEspecialista = mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA)
    expect(doLead.assunto).not.toBe(doEspecialista.assunto)
    expect(doLead.texto).not.toBe(doEspecialista.texto)
    for (const mensagem of [doLead, doEspecialista]) {
      expect(mensagem.anexos).toHaveLength(1)
      expect(mensagem.anexos[0]!.tipo).toMatch(/^text\/calendar/)
    }
  })

  test('o do lead diz quem vai atender, quando e por onde entrar', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const texto = mensagemPara(cenario.enviados, EMAIL_DO_LEAD).texto

    expect(texto).toMatch(/^Oi, Marcos Lima!/)
    expect(texto).toContain('Ana Souza')
    expect(texto).toContain('13h00 (horário de Manaus)')
    expect(texto).toContain('https://meet.exemplo.com/ana')
    expect(texto).toContain('Rotas do Norte')
  })

  test('o do lead se apresenta com o nome da assistente da conta, e sem nome não inventa um', async () => {
    const comNome = montar(reuniao())
    await comNome.rodar()
    const texto = mensagemPara(comNome.enviados, EMAIL_DO_LEAD).texto
    expect(texto).toContain('Aqui é Lia, da Rotas do Norte.')
    expect(texto).not.toMatch(/\bSarah\b/)

    const semNome = montar(reuniao({ assistente: null }))
    await semNome.rodar()
    const alternativo = mensagemPara(semNome.enviados, EMAIL_DO_LEAD).texto
    expect(alternativo).toContain('Aqui é a assistente da Rotas do Norte.')
    expect(alternativo).not.toMatch(/\bSarah\b/)
  })

  test('o do especialista traz o resumo de passagem e o histórico curto do lead', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const texto = mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA).texto

    expect(texto).toContain('Lead: Marcos Lima')
    expect(texto).toContain(RESUMO)
    expect(texto).toContain('Histórico do lead:')
    expect(texto).toContain('Empresa: Fluxo Cargo')
    expect(texto).toContain('Local: Manaus/AM')
    expect(texto).toContain('Origem: formulário')
    expect(texto).toContain('Temperatura: quente')
    expect(texto).toContain('Notas da marcação:')
  })

  test('o do lead não leva o resumo de passagem, e nenhum dos dois leva o telefone em reunião por vídeo', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const doLead = JSON.stringify(mensagemPara(cenario.enviados, EMAIL_DO_LEAD))
    const doEspecialista = JSON.stringify(mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA))

    expect(doLead).not.toContain('Qwertyuiop')
    expect(doLead).not.toContain(TELEFONE)
    expect(doEspecialista).not.toContain(TELEFONE)
  })

  test('em reunião por telefone o especialista recebe o número, e o lead ouve que vai receber a ligação', async () => {
    const cenario = montar(reuniao({ modality: 'telefone' }))
    await cenario.rodar()

    expect(mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA).texto).toContain(`Telefone do lead: ${TELEFONE}`)
    expect(mensagemPara(cenario.enviados, EMAIL_DO_LEAD).texto).toContain('te liga no número em que a gente conversou')
  })

  test('lead sem nome recebe a saudação inteira alternativa, sem marcador remendado', async () => {
    const base = reuniao()
    const cenario = montar(reuniao({ lead: { ...base.lead, nome: null } }))
    await cenario.rodar()
    const texto = mensagemPara(cenario.enviados, EMAIL_DO_LEAD).texto

    expect(texto).toMatch(/^Oi!\n/)
    expect(texto).not.toMatch(/Oi, !|null|undefined/)
    expect(mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA).texto).toContain('Lead: Lead sem nome')
  })
})

describe('o fuso de cada lado', () => {
  test('o lead lê no fuso dele, o especialista no dele, e nenhum no da conta', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const doLead = mensagemPara(cenario.enviados, EMAIL_DO_LEAD).texto
    const doEspecialista = mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA).texto

    expect(doLead).toContain('terça-feira, 6 de outubro de 2026, 13h00 (horário de Manaus)')
    expect(doEspecialista).toContain('terça-feira, 6 de outubro de 2026, 14h00 (horário de São Paulo)')
    for (const texto of [doLead, doEspecialista]) {
      expect(texto).not.toContain('15h00')
      expect(texto).not.toContain('Noronha')
    }
  })

  test('lead sem fuso lê no da conta, e o especialista continua no dele', async () => {
    const base = reuniao()
    const cenario = montar(reuniao({ lead: { ...base.lead, fuso: null } }))
    await cenario.rodar()

    expect(mensagemPara(cenario.enviados, EMAIL_DO_LEAD).texto).toContain('15h00 (horário de Fernando de Noronha)')
    expect(mensagemPara(cenario.enviados, EMAIL_DO_ESPECIALISTA).texto).toContain('14h00 (horário de São Paulo)')
  })
})

describe('o anexo em iCalendar', () => {
  test('tem o mesmo horário do evento, em UTC, e o mesmo UID nos dois lados', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const anexos = cenario.enviados.map((m) => m.anexos[0]!.conteudo)

    for (const ics of anexos) {
      expect(ics).toContain('\r\nDTSTART:20261006T170000Z\r\n')
      expect(ics).toContain('\r\nDTEND:20261006T173000Z\r\n')
      expect(ics).toContain(`\r\nUID:${uidDoConvite(REUNIAO)}\r\n`)
      expect(ics).toContain('\r\nMETHOD:PUBLISH\r\n')
      expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
      expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    }
  })

  test('nenhuma linha passa de 75 octetos, e a dobra não parte caractere', () => {
    const longo = 'Reunião com João Ávila, ação de logística. '.repeat(10)
    const ics = montarIcs({
      reuniaoId: REUNIAO,
      inicio: '2026-10-06T17:00:00Z',
      fim: '2026-10-06T17:30:00Z',
      titulo: longo,
      descricao: longo,
      local: null,
      carimbo: '2026-10-05T13:00:00Z',
    })
    const codificador = new TextEncoder()
    for (const linha of ics.split('\r\n')) {
      expect(codificador.encode(linha).length, linha).toBeLessThanOrEqual(75)
    }
    // Desdobrar devolve o texto original, com os acentos inteiros.
    const desdobrado = ics.replace(/\r\n /g, '')
    expect(desdobrado).toContain(`SUMMARY:${escaparTextoDoIcs(longo)}`)
    expect(dobrarLinhaDoIcs('curta')).toBe('curta')
  })

  test('escapa barra, ponto e vírgula, vírgula e quebra de linha', () => {
    expect(escaparTextoDoIcs('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })
})

describe('marca só depois do 2xx', () => {
  test('o envio vem antes da gravação, lado a lado, e os dois lados vão juntos', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()

    // Os dois envios saem antes de qualquer gravação: os lados não esperam um pelo outro.
    expect(cenario.passos).toEqual([
      `enviar:${EMAIL_DO_ESPECIALISTA}`,
      `enviar:${EMAIL_DO_LEAD}`,
      'gravar:especialista',
      'gravar:lead',
    ])
    expect(cenario.linha().entregaDoLead.enviadoEm).toBe(new Date(AGORA).toISOString())
  })

  test('recusa do provedor não grava envio: grava a tentativa, a frase e a próxima pelo recuo', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_LEAD]: ['recusa'] })
    const desfecho = await cenario.rodar()

    expect(desfecho.especialista).toEqual({ situacao: 'enviado' })
    expect(desfecho.lead.situacao).toBe('falhou')
    expect(cenario.passos).not.toContain('gravar:lead')
    expect(cenario.linha().entregaDoLead).toEqual({
      enviadoEm: null,
      tentativas: 1,
      erro: falhaDoEmail('chave_invalida').mensagem,
      proximaTentativa: new Date(AGORA + RECUO_EM_MINUTOS[0]! * MINUTO).toISOString(),
    })
  })

  test('exceção do adaptador é tentativa sem resposta, e a mensagem dela não chega à linha', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_ESPECIALISTA]: ['levanta'] })
    await cenario.rodar()

    const entrega = cenario.linha().entregaDoEspecialista
    expect(entrega.enviadoEm).toBeNull()
    expect(entrega.erro).toBe(falhaDoEmail('sem_resposta').mensagem)
    expect(JSON.stringify(cenario.pendencias)).not.toMatch(/resend|re_chave_secreta|fetch failed/)
  })

  test('recuo de 1, 5, 15 e 60 minutos, e no teto a próxima fica nula e o convite desiste', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_LEAD]: ['fora_do_ar'] })
    let agora = AGORA
    const esperas: (number | null)[] = []
    for (let vez = 1; vez <= TETO_DE_TENTATIVAS; vez++) {
      await cenario.rodar(agora)
      const entrega = cenario.linha().entregaDoLead
      expect(entrega.tentativas).toBe(vez)
      esperas.push(entrega.proximaTentativa === null ? null : (Date.parse(entrega.proximaTentativa) - agora) / MINUTO)
      agora = entrega.proximaTentativa === null ? agora + 24 * 60 * MINUTO : Date.parse(entrega.proximaTentativa)
    }

    expect(esperas).toEqual([...RECUO_EM_MINUTOS, null])
    expect(conviteDesistiu(cenario.linha().entregaDoLead)).toBe(true)

    // Passou do teto: nem a rotina de amanhã vai ao provedor.
    await cenario.rodar(agora)
    expect(cenario.idas.get(EMAIL_DO_LEAD)).toBe(TETO_DE_TENTATIVAS)
  })

  test('antes da próxima tentativa o lado espera, sem ida ao provedor', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_LEAD]: ['fora_do_ar', 'ok'] })
    await cenario.rodar(AGORA)
    const desfecho = await cenario.rodar(AGORA + 30_000)

    expect(desfecho.lead).toEqual({ situacao: 'aguardando' })
    expect(cenario.idas.get(EMAIL_DO_LEAD)).toBe(1)
  })
})

describe('nova tentativa sem duplicar envio', () => {
  test('rodar duas vezes depois do envio não manda outro convite a ninguém', async () => {
    const cenario = montar(reuniao())
    await cenario.rodar()
    const segunda = await cenario.rodar(AGORA + 10 * MINUTO)
    const terceira = await cenario.rodar(AGORA + 20 * MINUTO)

    expect(segunda).toEqual({ lead: { situacao: 'ja_enviado' }, especialista: { situacao: 'ja_enviado' } })
    expect(terceira).toEqual(segunda)
    expect(cenario.idas.get(EMAIL_DO_LEAD)).toBe(1)
    expect(cenario.idas.get(EMAIL_DO_ESPECIALISTA)).toBe(1)
  })

  test('a nova tentativa manda só o lado que faltou', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_LEAD]: ['fora_do_ar', 'ok'] })
    await cenario.rodar(AGORA)
    await cenario.rodar(AGORA + RECUO_EM_MINUTOS[0]! * MINUTO)
    await cenario.rodar(AGORA + 30 * MINUTO)

    expect(cenario.idas.get(EMAIL_DO_ESPECIALISTA)).toBe(1)
    expect(cenario.idas.get(EMAIL_DO_LEAD)).toBe(2)
    expect(cenario.linha().entregaDoLead.enviadoEm).not.toBeNull()
  })

  test('a chave de idempotência é da reunião, do lado e da tentativa, e não do relógio', async () => {
    const primeira = montar(reuniao())
    const segunda = montar(reuniao())
    await primeira.rodar(AGORA)
    await segunda.rodar(AGORA + 7_777)

    const chaves = (cenario: ReturnType<typeof montar>) => cenario.enviados.map((m) => m.chaveDeIdempotencia).sort()
    expect(chaves(primeira)).toEqual(chaves(segunda))
    expect(chaves(primeira)).toEqual(
      [chaveDoConvite(REUNIAO, 'especialista', 1), chaveDoConvite(REUNIAO, 'lead', 1)].sort(),
    )
  })
})

describe('lead sem e-mail', () => {
  test('não é erro: o do especialista sai e o do lead fica pendente com o motivo, sem contar tentativa', async () => {
    const base = reuniao()
    const cenario = montar(reuniao({ lead: { ...base.lead, email: null } }))
    const desfecho = await cenario.rodar()

    expect(desfecho.especialista).toEqual({ situacao: 'enviado' })
    expect(desfecho.lead.situacao).toBe('sem_email')
    expect(cenario.enviados.map((m) => m.para)).toEqual([EMAIL_DO_ESPECIALISTA])
    expect(cenario.linha().entregaDoLead).toEqual({
      enviadoEm: null,
      tentativas: 0,
      erro: MENSAGEM_SEM_EMAIL,
      proximaTentativa: new Date(AGORA + ESPERA_SEM_EMAIL_EM_MINUTOS * MINUTO).toISOString(),
    })
    expect(situacaoDoConvite(cenario.linha().entregaDoLead, false)).toBe('sem_email')
  })

  test('e-mail cadastrado depois faz o convite sair na passagem seguinte', async () => {
    const base = reuniao()
    const cenario = montar(reuniao({ lead: { ...base.lead, email: null } }))
    await cenario.rodar()
    const pendente = cenario.linha()
    const depois = montar({ ...pendente, lead: { ...pendente.lead, email: EMAIL_DO_LEAD } })
    await depois.rodar(AGORA + ESPERA_SEM_EMAIL_EM_MINUTOS * MINUTO)

    expect(depois.enviados.map((m) => m.para)).toEqual([EMAIL_DO_LEAD])
    expect(depois.linha().entregaDoLead.enviadoEm).not.toBeNull()
  })
})

describe('falha nos dois lados', () => {
  test('não levanta: a reunião segue e os dois convites ficam como nova tentativa', async () => {
    const cenario = montar(reuniao(), { [EMAIL_DO_LEAD]: ['fora_do_ar'], [EMAIL_DO_ESPECIALISTA]: ['recusa'] })
    const desfecho = await cenario.rodar()

    expect(desfecho.lead.situacao).toBe('falhou')
    expect(desfecho.especialista.situacao).toBe('falhou')
    expect(cenario.linha().entregaDoLead.tentativas).toBe(1)
    expect(cenario.linha().entregaDoEspecialista.tentativas).toBe(1)
    expect(cenario.passos.filter((passo) => passo.startsWith('gravar:'))).toEqual([])
  })

  test.each(['nao_configurado', 'remetente_invalido'] as const)(
    'conta com e-mail %s não conta tentativa: espera a configuração e diz o que fazer',
    async (motivo) => {
      const cenario = montar(reuniao())
      const desfecho = await enviarConvitesDaReuniao({
        reuniao: reuniao(),
        email: falhaDoEmail(motivo),
        porta: cenario.porta,
        agora: () => AGORA,
      })

      expect(desfecho.lead.situacao).toBe('email_nao_configurado')
      expect(desfecho.especialista.situacao).toBe('email_nao_configurado')
      for (const [, pendencia] of cenario.pendencias) {
        expect(pendencia.tentativas).toBe(0)
        expect(pendencia.erro).toBe(falhaDoEmail(motivo).mensagem)
        expect(pendencia.erro).toMatch(/Convite não enviado: .*Integrações/)
        expect(pendencia.proximaTentativa).toBe(new Date(AGORA + ESPERA_SEM_EMAIL_EM_MINUTOS * 60_000).toISOString())
      }
      // A tela lê a pendência pela frase gravada, e nunca como desistência.
      const gravada = { enviadoEm: null, tentativas: 0, erro: falhaDoEmail(motivo).mensagem, proximaTentativa: null }
      expect(situacaoDoConvite(gravada, true)).toBe('email_nao_configurado')
      expect(situacaoDoConvite({ ...gravada, erro: falhaDoEmail('sem_credito').mensagem }, true)).toBe('tentando')
    },
  )

  test('escrita que levanta num lado não impede o outro, e sobe depois', async () => {
    const cenario = montar(reuniao())
    const porta: PortaDoConviteDaReuniao = {
      ...cenario.porta,
      async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
        if (lado === 'especialista') throw new Error('banco fora do ar')
        return cenario.porta.gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm)
      },
    }

    await expect(
      enviarConvitesDaReuniao({ reuniao: reuniao(), email: cenario.email, porta, agora: () => AGORA }),
    ).rejects.toThrow('banco fora do ar')
    expect(cenario.passos).toContain('gravar:lead')
  })
})

describe('a leitura da linha e o estado para a tela', () => {
  test('lê a linha do PostgREST com os embutidos', () => {
    const lida = lerReuniaoParaConvite({
      id: REUNIAO,
      account_id: CONTA,
      starts_at: '2026-10-06T17:00:00+00:00',
      ends_at: '2026-10-06T17:30:00+00:00',
      modality: 'presencial',
      notes: null,
      handoff_summary: null,
      lead_invite_sent_at: null,
      lead_invite_attempts: 2,
      lead_invite_error: 'falhou',
      lead_invite_retry_at: '2026-10-05T13:15:00+00:00',
      specialist_invite_sent_at: '2026-10-05T13:00:00+00:00',
      specialist_invite_attempts: 0,
      specialist_invite_error: null,
      specialist_invite_retry_at: null,
      leads: { name: 'Marcos', email: EMAIL_DO_LEAD, timezone: null, phone_e164: TELEFONE },
      specialists: [{ name: 'Ana', email: EMAIL_DO_ESPECIALISTA, timezone: 'America/Manaus', room_url: null }],
      accounts: { name: 'Rotas do Norte', timezone: 'America/Sao_Paulo' },
    })

    expect(lida.modality).toBe('presencial')
    expect(lida.lead).toMatchObject({ nome: 'Marcos', email: EMAIL_DO_LEAD, fuso: null, telefone: TELEFONE })
    expect(lida.especialista).toEqual({ nome: 'Ana', email: EMAIL_DO_ESPECIALISTA, fuso: 'America/Manaus', sala: null })
    expect(lida.fusoDaConta).toBe('America/Sao_Paulo')
    expect(lida.entregaDoLead).toEqual({
      enviadoEm: null,
      tentativas: 2,
      erro: 'falhou',
      proximaTentativa: '2026-10-05T13:15:00+00:00',
    })
    expect(lida.entregaDoEspecialista.enviadoEm).toBe('2026-10-05T13:00:00+00:00')
  })

  test('situação de cada lado: enviado, sem e-mail, desistiu e tentando', () => {
    const enviado = { ...SEM_ENTREGA, enviadoEm: '2026-10-05T13:00:00Z' }
    const noTeto = { ...SEM_ENTREGA, tentativas: TETO_DE_TENTATIVAS, erro: 'x' }
    expect(situacaoDoConvite(enviado, true)).toBe('enviado')
    expect(situacaoDoConvite(enviado, false)).toBe('enviado')
    expect(situacaoDoConvite(SEM_ENTREGA, false)).toBe('sem_email')
    expect(situacaoDoConvite(noTeto, true)).toBe('desistiu')
    expect(situacaoDoConvite({ ...SEM_ENTREGA, tentativas: 1 }, true)).toBe('tentando')
  })
})
