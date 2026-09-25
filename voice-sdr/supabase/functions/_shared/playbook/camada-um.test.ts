// Provas da camada 1. Ambiente node, sem rede e sem banco: a camada 1 é
// constante portável, e o que se mede aqui é o texto dela.
//
// Três coisas se cobram, e as três existem porque prosa não segura nenhuma:
//
// 1. **A variante sem agenda não promete horário** (O-06). A varredura é por
//    expressão regular sobre as falas de fechamento, e não por leitura: quem
//    acrescentar "te mando um convite pra amanhã" cai aqui, ainda que a frase
//    esteja perfeita no resto.
// 2. **A variante com agenda oferece horário.** Sem este lado, apagar a oferta
//    passaria calado e a F5 herdaria um fechamento que não convida a nada.
// 3. **O corpo não muda sem a versão subir** (RF-308). É o que faz
//    `calls.playbook_version_id` significar alguma coisa meses depois.

import { describe, expect, test } from 'vitest'

import { hashEmHexadecimal, pareceHashEmHexadecimal } from '../hash-de-segredo.ts'
import {
  FECHAMENTO_DE_DESCOBERTA,
  FERRAMENTA_DE_AGENDA,
  REGRA_DA_QUALIFICACAO,
  HISTORICO_DA_CAMADA_UM,
  PROPOSITOS,
  REGRAS_DA_CASA,
  VARIANTES,
  VERSAO_DA_CAMADA_UM,
  assinaturaDaCamadaUm,
  compilarCamadaUm,
  escolherVariante,
  montarCamadaUm,
  regrasDoProposito,
  textoCanonicoDaCamadaUm,
} from './camada-um.ts'
import { CATALOGO_DE_FERRAMENTAS, FERRAMENTAS_DE_SISTEMA } from '../agente/compilador.ts'
import { prometeHorario } from '../agente/rascunho-de-roteiro.ts'
import { FALAS_DE_DESCOBERTA } from '../speech/discovery.ts'
import { ROTEIRO_DE_DESCOBERTA_PROVISORIO } from './roteiro-de-descoberta.ts'

/**
 * Promessa de horário, por palavra. A lista está no critério de aceite da
 * US-044 e é deliberadamente ampla: "agenda" pega "agendar", e "marcar" pega
 * "remarcar". Fala de fechamento sem agenda que precise de uma destas palavras
 * é fala que precisa de ferramenta que a F2 não tem.
 */
const PROMESSA_DE_HORARIO = /horário|agenda|marcar|agendar|reunião/i

/**
 * Promessa de compromisso sem usar nenhuma daquelas palavras. Existe porque a
 * varredura por palavra tem um buraco que a própria regressão da história
 * encontrou: "te mando um convite para amanhã às 14h" não contém "horário",
 * "agenda", "marcar" nem "reunião", e mesmo assim é exatamente a promessa que a
 * F2 não cumpre. O que caracteriza a promessa é o **instante combinado**, então
 * o segundo crivo procura hora de relógio, dia nomeado, e as duas palavras com
 * que um compromisso chega depois da ligação.
 *
 * `dia` sozinho fica de fora de propósito: "qual período do dia" é a pergunta
 * que a variante sem agenda precisa fazer.
 */
const PROMESSA_DE_COMPROMISSO =
  /\d{1,2}\s?h\b|\d{1,2}:\d{2}|amanhã|hoje|segunda-feira|terça|quarta|quinta|sexta|sábado|domingo|convite|confirmação/i

describe('escolherVariante', () => {
  test('sem tool-availability no conjunto, a variante é sem_agenda', () => {
    expect(escolherVariante([])).toBe('sem_agenda')
    expect(escolherVariante(['end_call', 'transfer_to_number', 'voicemail_detection'])).toBe(
      'sem_agenda',
    )
    expect(escolherVariante(['tool-qualify', 'tool-dnc', 'tool-transfer'])).toBe('sem_agenda')
  })

  test('com tool-availability no conjunto, a variante é com_agenda', () => {
    expect(escolherVariante([FERRAMENTA_DE_AGENDA])).toBe('com_agenda')
    expect(escolherVariante(['tool-qualify', FERRAMENTA_DE_AGENDA, 'end_call'])).toBe('com_agenda')
  })

  test('o conjunto de ferramentas da F2 leva descoberta ao fechamento sem agenda', () => {
    // As três de sistema do provedor, que é tudo o que a F2 publica (US-060).
    const ferramentasDaF2 = ['end_call', 'transfer_to_number', 'voicemail_detection']
    const texto = compilarCamadaUm('discovery', ferramentasDaF2)

    expect(texto).toContain(FECHAMENTO_DE_DESCOBERTA.sem_agenda.chave)
    expect(texto).not.toContain(FECHAMENTO_DE_DESCOBERTA.com_agenda.chave)
  })
})

describe('fechamento de descoberta', () => {
  test.each(FECHAMENTO_DE_DESCOBERTA.sem_agenda.falas)(
    'a fala sem agenda não promete horário: %s',
    (fala) => {
      expect(fala).not.toMatch(PROMESSA_DE_HORARIO)
      expect(fala).not.toMatch(PROMESSA_DE_COMPROMISSO)
    },
  )

  test('a instrução da variante sem agenda também não oferece horário', () => {
    // A instrução cita o que a Sarah NÃO faz, então ela fala de agenda de
    // propósito. O que ela não pode é conter fala pronta que ofereça horário,
    // e por isso a varredura é das falas; aqui se cobra só que a instrução
    // proíba, para que apagá-la derrube alguma coisa.
    const instrucao = FECHAMENTO_DE_DESCOBERTA.sem_agenda.instrucao
    expect(instrucao).toMatch(/não ofereça/i)
    expect(instrucao).toMatch(/não prometa/i)
  })

  test('a variante com agenda oferece horário, senão a F5 herda um fechamento mudo', () => {
    const falas = FECHAMENTO_DE_DESCOBERTA.com_agenda.falas
    expect(falas.some((fala) => /horário/i.test(fala))).toBe(true)
    expect(falas.some((fala) => PROMESSA_DE_HORARIO.test(fala))).toBe(true)
  })

  test('as duas variantes existem e são falas diferentes', () => {
    expect(FECHAMENTO_DE_DESCOBERTA.sem_agenda.falas).not.toEqual(
      FECHAMENTO_DE_DESCOBERTA.com_agenda.falas,
    )
  })

  test('só descoberta tem fechamento com variante', () => {
    for (const proposito of PROPOSITOS) {
      const comAgenda = regrasDoProposito(proposito, 'com_agenda', false)
      const semAgenda = regrasDoProposito(proposito, 'sem_agenda', false)
      if (proposito === 'discovery') {
        expect(comAgenda).not.toEqual(semAgenda)
      } else {
        expect(comAgenda).toEqual(semAgenda)
      }
    }
  })
})

describe('regras travadas', () => {
  const porChave = new Map(REGRAS_DA_CASA.map((regra) => [regra.chave, regra]))

  test.each([
    ['aviso_de_gravacao', ['RF-420', 'RF-810']],
    ['nunca_afirmar', ['RF-301']],
    ['nao_perturbe', ['RF-805', 'R-02']],
    ['pedido_de_humano', ['RF-909']],
    ['pessoa_errada', ['RF-422', 'T-02']],
  ])('a regra %s está na camada 1 e cita os requisitos dela', (chave, requisitos) => {
    const regra = porChave.get(chave)
    expect(regra, `regra ${chave} sumiu da camada 1`).toBeDefined()
    expect(regra?.requisitos).toEqual(requisitos)
    expect(regra?.falas.length).toBeGreaterThan(0)
  })

  test('as cinco valem nos quatro propósitos', () => {
    for (const proposito of PROPOSITOS) {
      const chaves = regrasDoProposito(proposito, 'sem_agenda', false).map((regra) => regra.chave)
      for (const chave of porChave.keys()) expect(chaves).toContain(chave)
    }
  })

  test('pessoa errada encerra em até duas falas (RF-422)', () => {
    expect(porChave.get('pessoa_errada')?.falas.length).toBeLessThanOrEqual(2)
  })

  test('o aviso de gravação é a primeira regra, porque é a primeira fala', () => {
    expect(REGRAS_DA_CASA[0]?.chave).toBe('aviso_de_gravacao')
  })

  test('toda regra entra inteira no texto compilado', () => {
    const texto = montarCamadaUm('discovery', 'sem_agenda', true)
    for (const regra of regrasDoProposito('discovery', 'sem_agenda', true)) {
      expect(texto).toContain(regra.instrucao)
      for (const fala of regra.falas) expect(texto).toContain(fala)
    }
  })
})

describe('as três regras da F3', () => {
  const porChave = new Map(REGRAS_DA_CASA.map((regra) => [regra.chave, regra]))
  const instrucao = (chave: string): string => {
    const regra = porChave.get(chave)
    if (regra === undefined) throw new Error(`regra ${chave} sumiu da camada 1`)
    return regra.instrucao
  }

  test('as ferramentas citadas existem no catálogo ou entre as de sistema', () => {
    // Nome de ferramenta errado na instrução é ferramenta que o modelo nunca
    // acha, e o sintoma é a Sarah prometendo o que ninguém executa.
    const conhecidas = new Set<string>([
      ...CATALOGO_DE_FERRAMENTAS.map((ferramenta) => ferramenta.nome),
      ...FERRAMENTAS_DE_SISTEMA,
    ])
    for (const regra of [...REGRAS_DA_CASA, REGRA_DA_QUALIFICACAO]) {
      for (const citada of regra.instrucao.match(/\btool-[a-z-]+|\bend_call\b/g) ?? []) {
        expect(conhecidas, `${regra.chave} cita ${citada}`).toContain(citada)
      }
    }
  })

  test('não perturbe chama tool-dnc, promete e encerra, e a promessa vale com a ferramenta em falha', () => {
    const texto = instrucao('nao_perturbe')
    expect(texto).toContain("tool-dnc com reason='lead_request'")
    expect(texto).toMatch(/prometa o bloqueio em voz alta/i)
    expect(texto).toContain('end_call')
    expect(texto).toMatch(/mesmo que tool-dnc falhe/i)
    expect(texto.indexOf('tool-dnc')).toBeLessThan(texto.indexOf('end_call'))
  })

  test('pessoa errada chama tool-dnc com wrong_number e depois end_call', () => {
    const texto = instrucao('pessoa_errada')
    const dnc = texto.indexOf("tool-dnc com reason='wrong_number'")
    expect(dnc).toBeGreaterThanOrEqual(0)
    expect(texto.indexOf('end_call')).toBeGreaterThan(dnc)
    expect(texto).toMatch(/no máximo duas falas/i)
  })

  test('pedido de humano chama tool-transfer e lê a frase que ela devolve, sem improvisar', () => {
    const texto = instrucao('pedido_de_humano')
    expect(texto).toContain('tool-transfer')
    expect(texto).toMatch(/leia a frase que ela devolver/i)
    expect(texto).toMatch(/tema sensível/i)
    expect(texto).toMatch(/não prometa prazo/i)
  })

  test('a promessa do bloqueio não some ao juntar as regras', () => {
    // `bloqueio_que_falhou` (versão 1) cobria só a falha; `nao_perturbe` cobre
    // o pedido inteiro. Uma regra à parte para a falha ensinaria o modelo a
    // tratar o caso comum de outro jeito.
    expect(porChave.has('bloqueio_que_falhou')).toBe(false)
  })

  test.each([...PROPOSITOS])('o texto de %s leva os três blocos', (proposito) => {
    const texto = compilarCamadaUm(proposito, [])
    for (const chave of ['nao_perturbe', 'pedido_de_humano', 'pessoa_errada']) {
      expect(texto).toContain(`## ${chave} (`)
      expect(texto).toContain(instrucao(chave))
    }
  })
})

describe('versão da camada 1', () => {
  test('o hash do texto compilado bate com o declarado para a versão corrente', async () => {
    const declarado = HISTORICO_DA_CAMADA_UM.get(VERSAO_DA_CAMADA_UM)
    expect(declarado, `versão ${VERSAO_DA_CAMADA_UM} não está no histórico`).toBeDefined()
    expect(await assinaturaDaCamadaUm()).toBe(declarado)
  })

  test('a versão corrente é a maior do histórico, e o histórico não tem buraco', () => {
    const versoes = [...HISTORICO_DA_CAMADA_UM.keys()].sort((a, b) => a - b)
    expect(versoes).toEqual(versoes.map((_, indice) => indice + 1))
    expect(versoes.at(-1)).toBe(VERSAO_DA_CAMADA_UM)
  })

  test('duas versões nunca compartilham hash: subir a versão sem mexer no corpo reprova', () => {
    const hashes = [...HISTORICO_DA_CAMADA_UM.values()]
    expect(new Set(hashes).size).toBe(hashes.length)
    for (const hash of hashes) expect(pareceHashEmHexadecimal(hash)).toBe(true)
  })

  test('a versão viaja dentro do texto, então subi-la muda o hash', async () => {
    const texto = textoCanonicoDaCamadaUm()
    expect(texto).toContain(`camada 1, versão ${VERSAO_DA_CAMADA_UM}`)

    const comOutraVersao = texto.replaceAll(
      `camada 1, versão ${VERSAO_DA_CAMADA_UM}`,
      `camada 1, versão ${VERSAO_DA_CAMADA_UM + 1}`,
    )
    expect(await hashEmHexadecimal(comOutraVersao)).not.toBe(await assinaturaDaCamadaUm())
  })

  test('o texto canônico cobre os quatro propósitos, as duas variantes e a qualificação', () => {
    const texto = textoCanonicoDaCamadaUm()
    for (const proposito of PROPOSITOS) {
      for (const variante of VARIANTES) {
        expect(texto).toContain(`<<${proposito}/${variante}/sem_qualificacao>>`)
        expect(texto).toContain(`<<${proposito}/${variante}/com_qualificacao>>`)
      }
    }
  })

  test('compilar duas vezes o mesmo dado dá o mesmo texto', () => {
    expect(compilarCamadaUm('discovery', [])).toBe(compilarCamadaUm('discovery', []))
  })
})

describe('a qualificação antes de encerrar (US-138)', () => {
  const comQualificacao = ['tool-transfer', 'tool-dnc', 'tool-qualify']

  test('entra em descoberta quando tool-qualify está no conjunto, antes do fechamento', () => {
    const chaves = regrasDoProposito('discovery', 'sem_agenda', true).map((regra) => regra.chave)
    expect(chaves.slice(-2)).toEqual([
      REGRA_DA_QUALIFICACAO.chave,
      FECHAMENTO_DE_DESCOBERTA.sem_agenda.chave,
    ])

    const texto = compilarCamadaUm('discovery', comQualificacao)
    expect(texto).toContain(`## ${REGRA_DA_QUALIFICACAO.chave} (`)
    expect(texto).toContain(REGRA_DA_QUALIFICACAO.instrucao)
  })

  test('fica de fora quando a ferramenta não está publicada', () => {
    // A F3 publica só tool-transfer e tool-dnc: instruir a chamar tool-qualify
    // ali seria mandar o modelo prometer o que ninguém executa.
    const texto = compilarCamadaUm('discovery', ['tool-transfer', 'tool-dnc'])
    expect(texto).not.toContain(REGRA_DA_QUALIFICACAO.chave)
  })

  test.each(PROPOSITOS.filter((p) => p !== 'discovery'))(
    'não entra em %s, nem com a ferramenta no conjunto',
    (proposito) => {
      expect(compilarCamadaUm(proposito, comQualificacao)).not.toContain(REGRA_DA_QUALIFICACAO.chave)
    },
  )

  test('manda qualificar antes de end_call e diz as exceções', () => {
    const texto = REGRA_DA_QUALIFICACAO.instrucao
    expect(texto).toMatch(/obrigatório/i)
    expect(texto.indexOf('tool-qualify')).toBeGreaterThanOrEqual(0)
    expect(texto.indexOf('end_call')).toBeGreaterThan(texto.indexOf('tool-qualify'))
    expect(texto).toMatch(/não perturbe e pessoa errada/i)
  })
})

describe('nenhuma fala de descoberta promete horário nem data (O-06)', () => {
  // Da F2 à F4 não existe ferramenta de agenda. Tudo o que a Sarah diz em
  // descoberta, fora do fechamento com agenda da F5, passa pelos três crivos:
  // o por palavra, o de instante combinado e o do rascunho de roteiro.
  const falas = [
    ...FALAS_DE_DESCOBERTA.abertura,
    ...FALAS_DE_DESCOBERTA.levantamentoDaDor,
    ...FALAS_DE_DESCOBERTA.fechamento.sem_agenda,
    ...REGRA_DA_QUALIFICACAO.falas,
  ]

  test.each(falas)('%s', (fala) => {
    expect(fala).not.toMatch(PROMESSA_DE_HORARIO)
    expect(fala).not.toMatch(PROMESSA_DE_COMPROMISSO)
    expect(prometeHorario(fala)).toBe(false)
  })

  test.each(ROTEIRO_DE_DESCOBERTA_PROVISORIO.split('\n'))('o roteiro provisório também: %s', (linha) => {
    expect(prometeHorario(linha)).toBe(false)
    expect(linha).not.toMatch(PROMESSA_DE_COMPROMISSO)
  })
})
