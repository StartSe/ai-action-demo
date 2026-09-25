// Provas do atendimento da ligação recebida. Ambiente node, sem rede e sem
// banco: a camada de dados é dublada, e o dublê **conta as leituras** — é o
// único jeito de "não toca no banco antes de validar a assinatura" virar
// conferência em vez de promessa.
//
// O que este arquivo segura:
//
// 1. **Os três casos de assinatura devolvem a mesma resposta, byte a byte.**
//    Ausente, malformada e inválida são comparadas entre si com igualdade
//    profunda, e nenhuma delas chega a consultar o número chamado.
// 2. **Os três comportamentos de entrada.** `forward` disca para `forward_to`,
//    `voicemail` fala o recado e encerra, e `agent` que chegou aqui por
//    divergência de configuração não vira erro: quem ligou ouve português.
// 3. **O recado sai de `_shared/speech/`.** As frases do documento são
//    comparadas com as constantes de lá, e não com literais repetidos aqui —
//    com o texto copiado, o teste passaria verde com a fala escrita dentro da
//    função, que é justamente o que a convenção proíbe.
// 4. **Empresa com `&` no nome não derruba o documento.** É o caso real do
//    escape de XML, e sem ele a operadora recusa o documento inteiro.

import { describe, expect, test } from 'vitest'

import { FALAS_DE_ATENDIMENTO_RECEBIDO } from '../_shared/speech/atendimento-recebido.ts'
import { assinaturaDaTelefonia, type ParDoCorpo } from '../_shared/telefonia/assinatura.ts'

import {
  atenderChamadaRecebida,
  interpolarFala,
  RECUSA_DE_ASSINATURA,
  RECUSA_DE_METODO,
  type LinhaChamada,
  type PortaDoAtendimento,
  type RespostaDoAtendimento,
} from './atendimento.ts'
import { TIPO_DO_DOCUMENTO } from './documento.ts'

const TOKEN = 'token-da-telefonia-da-conta'
const TOKEN_DA_INSTALACAO = 'token-da-telefonia-da-instalacao'
const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA_CONTA = '22222222-2222-4222-8222-222222222222'
const URL_BASE = 'https://projeto.supabase.co/functions/v1/inbound-twiml'
const URL_CHAMADA = `${URL_BASE}?conta=${CONTA}`
const NUMERO_DA_LINHA = '+5548999990000'
const NUMERO_DE_QUEM_LIGOU = '+5511988887777'
const DESTINO = '+5548988881111'

const PARES: readonly ParDoCorpo[] = [
  ['CallSid', 'CA00000000000000000000000000000001'],
  ['From', NUMERO_DE_QUEM_LIGOU],
  ['To', NUMERO_DA_LINHA],
]

function linha(ajustes: Partial<LinhaChamada> = {}): LinhaChamada {
  return {
    account_id: CONTA,
    e164: NUMERO_DA_LINHA,
    inbound_behavior: 'voicemail',
    forward_to: null,
    agent_name: 'Sarah',
    company_name: 'Fábrica de Parafusos',
    ...ajustes,
  }
}

interface Bancada {
  readonly porta: PortaDoAtendimento
  /** Números lidos. É a leitura que nunca acontece antes da assinatura. */
  readonly consultados: string[]
  /** Contas cujo token foi lido no cofre. */
  readonly cofresLidos: string[]
}

/** O cofre de cada conta. Por padrão, só a conta da linha tem token. */
type Cofres = Readonly<Record<string, string | null | Error>>

function bancada(
  resultado: LinhaChamada | null | Error,
  cofres: Cofres = { [CONTA]: TOKEN },
): Bancada {
  const consultados: string[] = []
  const cofresLidos: string[] = []
  return {
    consultados,
    cofresLidos,
    porta: {
      async tokenDaConta(contaId) {
        cofresLidos.push(contaId)
        const valor = cofres[contaId] ?? null
        if (valor instanceof Error) throw valor
        return valor
      },
      async linhaChamada(e164) {
        consultados.push(e164)
        if (resultado instanceof Error) throw resultado
        return resultado
      },
    },
  }
}

async function atender(
  bancadaDeTeste: Bancada,
  ajustes: {
    readonly assinatura?: string | null
    readonly metodo?: string
    readonly pares?: readonly ParDoCorpo[]
    /** A URL que a operadora chamou. Por padrão, a que leva a conta. */
    readonly url?: string
    /** O token com que o pedido foi assinado. Por padrão, o da conta. */
    readonly assinadoCom?: string
    readonly tokenDaInstalacao?: string | null
  } = {},
): Promise<RespostaDoAtendimento> {
  const pares = ajustes.pares ?? PARES
  const url = ajustes.url ?? URL_CHAMADA
  const assinatura =
    ajustes.assinatura === undefined
      ? await assinaturaDaTelefonia(ajustes.assinadoCom ?? TOKEN, url, pares)
      : ajustes.assinatura

  return atenderChamadaRecebida(
    { metodo: ajustes.metodo ?? 'POST', url, pares, assinatura },
    bancadaDeTeste.porta,
    {
      tokenDaInstalacao:
        ajustes.tokenDaInstalacao === undefined ? null : ajustes.tokenDaInstalacao,
    },
  )
}

describe('a assinatura', () => {
  test('ausente, malformada e inválida devolvem a mesma resposta', async () => {
    const ausente = bancada(linha())
    const malformada = bancada(linha())
    const invalida = bancada(linha())

    const respostas = [
      await atender(ausente, { assinatura: null }),
      await atender(malformada, { assinatura: 'isto-nao-e-uma-assinatura' }),
      await atender(invalida, { assinatura: 'GvWf1cFY/Q7PnoempGyD5oXAezc=' }),
    ]

    for (const resposta of respostas) {
      expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
      expect(resposta.status).toBe(401)
    }
    // Iguais entre si, e não só iguais à constante: é a igualdade entre os três
    // que impede a resposta de contar qual deles chegou perto.
    expect(JSON.stringify(respostas[0])).toBe(JSON.stringify(respostas[1]))
    expect(JSON.stringify(respostas[1])).toBe(JSON.stringify(respostas[2]))
  })

  test('nenhum dos três casos toca no banco', async () => {
    const ausente = bancada(linha())
    const malformada = bancada(linha())
    const invalida = bancada(linha())

    await atender(ausente, { assinatura: null })
    await atender(malformada, { assinatura: 'x' })
    await atender(invalida, { assinatura: 'GvWf1cFY/Q7PnoempGyD5oXAezc=' })

    expect(ausente.consultados).toEqual([])
    expect(malformada.consultados).toEqual([])
    expect(invalida.consultados).toEqual([])
  })

  test('conta inexistente, conta sem token e cofre fora do ar recusam igual à assinatura errada', async () => {
    const semConta = bancada(linha(), {})
    const semToken = bancada(linha(), { [CONTA]: null })
    const cofreCaido = bancada(linha(), { [CONTA]: new Error('cofre fora do ar') })
    const assinaturaErrada = bancada(linha())

    const respostas = [
      await atender(semConta),
      await atender(semToken),
      await atender(cofreCaido),
      await atender(assinaturaErrada, { assinadoCom: 'outro-token' }),
    ]

    for (const resposta of respostas) {
      expect(JSON.stringify(resposta)).toBe(JSON.stringify(RECUSA_DE_ASSINATURA))
    }
    for (const teste of [semConta, semToken, cofreCaido, assinaturaErrada]) {
      expect(teste.consultados).toEqual([])
    }
  })

  test('o token conferido é o do cofre da conta do endereço', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(teste.cofresLidos).toEqual([CONTA])
  })

  test('a conta entra na URL assinada: trocar a conta no endereço reprova', async () => {
    // Assinado para a conta certa, entregue com outra conta no endereço. A
    // outra conta até tem token, e o dela não confere com o pedido.
    const teste = bancada(linha(), { [CONTA]: TOKEN, [OUTRA_CONTA]: 'token-da-outra' })
    const assinatura = await assinaturaDaTelefonia(TOKEN, URL_CHAMADA, PARES)

    const resposta = await atender(teste, {
      url: `${URL_BASE}?conta=${OUTRA_CONTA}`,
      assinatura,
    })

    expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
    expect(teste.consultados).toEqual([])
  })

  test('conta malformada no endereço recusa sem ler cofre nenhum', async () => {
    const teste = bancada(linha())
    const url = `${URL_BASE}?conta=nao-e-uuid`

    const resposta = await atender(teste, { url })

    expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
    expect(teste.cofresLidos).toEqual([])
    expect(teste.consultados).toEqual([])
  })

  test('com o próprio token, o número de outra conta não é atendido', async () => {
    // A outra conta assina com o token dela um pedido para o número desta.
    const teste = bancada(linha({ inbound_behavior: 'forward', forward_to: DESTINO }), {
      [OUTRA_CONTA]: 'token-da-outra',
    })

    const resposta = await atender(teste, {
      url: `${URL_BASE}?conta=${OUTRA_CONTA}`,
      assinadoCom: 'token-da-outra',
    })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).not.toContain(DESTINO)
    expect(resposta.corpo).not.toContain('Fábrica de Parafusos')
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende)
  })
})

describe('o webhook cadastrado antes de o endereço levar a conta', () => {
  test('sem a variável da instalação, é recusado como os outros', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste, { url: URL_BASE, tokenDaInstalacao: null })

    expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
    expect(teste.cofresLidos).toEqual([])
    expect(teste.consultados).toEqual([])
  })

  test('com a variável da instalação, confere com ela', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste, {
      url: URL_BASE,
      assinadoCom: TOKEN_DA_INSTALACAO,
      tokenDaInstalacao: TOKEN_DA_INSTALACAO,
    })

    expect(resposta.status).toBe(200)
    expect(teste.cofresLidos).toEqual([])
  })

  test('endereço com a conta nunca aceita o token da instalação', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste, {
      assinadoCom: TOKEN_DA_INSTALACAO,
      tokenDaInstalacao: TOKEN_DA_INSTALACAO,
    })

    expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
  })

  test('assinatura de outro corpo não vale para este', async () => {
    const teste = bancada(linha())
    const deOutraLigacao = await assinaturaDaTelefonia(TOKEN, URL_CHAMADA, [
      ['CallSid', 'CA00000000000000000000000000000002'],
      ['From', NUMERO_DE_QUEM_LIGOU],
      ['To', NUMERO_DA_LINHA],
    ])

    const resposta = await atender(teste, { assinatura: deOutraLigacao })

    expect(resposta).toEqual(RECUSA_DE_ASSINATURA)
  })

  test('a assinatura certa passa e a leitura acontece uma vez', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(teste.consultados).toEqual([NUMERO_DA_LINHA])
  })
})

describe('os três comportamentos de entrada', () => {
  test('forward avisa e disca para forward_to', async () => {
    const teste = bancada(linha({ inbound_behavior: 'forward', forward_to: DESTINO }))

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(resposta.tipo).toBe(TIPO_DO_DOCUMENTO)
    expect(resposta.corpo).toContain(`>${DESTINO}</Dial>`)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.avisoDeEncaminhamento)
    // O identificador de quem chama é a própria linha: um número qualquer vindo
    // da rede não é da conta, e a operadora recusaria a discagem.
    expect(resposta.corpo).toContain(`callerId="${NUMERO_DA_LINHA}"`)
    expect(resposta.corpo).not.toContain(NUMERO_DE_QUEM_LIGOU)
    expect(resposta.corpo).not.toContain('<Hangup/>')
  })

  test('voicemail fala o recado de speech/ e encerra', async () => {
    const teste = bancada(linha({ inbound_behavior: 'voicemail' }))

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    for (const frase of FALAS_DE_ATENDIMENTO_RECEBIDO.recadoDaLinha) {
      expect(resposta.corpo).toContain(frase)
    }
    expect(resposta.corpo).toContain('<Hangup/>')
    // Dar o recado não é gravar recado: não há gravação nenhuma no documento.
    expect(resposta.corpo).not.toContain('<Record')
    expect(resposta.corpo).not.toContain('<Dial')
  })

  test('agent que chega aqui ouve português, não erro da operadora', async () => {
    const teste = bancada(linha({ inbound_behavior: 'agent' }))

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende)
    expect(resposta.corpo).toContain('<Hangup/>')
  })

  test('forward sem destino cai na frase, e não no silêncio', async () => {
    const teste = bancada(linha({ inbound_behavior: 'forward', forward_to: null }))

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende)
    expect(resposta.corpo).not.toContain('<Dial')
  })
})

describe('a linha que não se reconhece', () => {
  test('número desconhecido encerra com a frase, sem apresentar conta nenhuma', async () => {
    const teste = bancada(null)

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade)
  })

  test('banco fora do ar não vira 500 no ouvido de quem ligou', async () => {
    const teste = bancada(new Error('conexão recusada'))

    const resposta = await atender(teste)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende)
    // Nada do erro interno chega ao documento.
    expect(resposta.corpo).not.toContain('conexão recusada')
  })

  test('número chamado fora de E.164 nem é consultado', async () => {
    const pares: readonly ParDoCorpo[] = [
      ['CallSid', 'CA00000000000000000000000000000003'],
      ['To', 'anonymous'],
    ]
    const teste = bancada(linha())

    const resposta = await atender(teste, { pares })

    expect(resposta.status).toBe(200)
    expect(teste.consultados).toEqual([])
  })
})

describe('o texto do documento', () => {
  test('a conta sem Sarah montada cumprimenta em vez de ler marcador vazio', async () => {
    const teste = bancada(linha({ agent_name: null, company_name: null }))

    const resposta = await atender(teste)

    expect(resposta.corpo).toContain(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade)
    expect(resposta.corpo).not.toContain('{nome_do_agente}')
    expect(resposta.corpo).not.toContain('{empresa}')
    // O buraco que a limpeza por expressão regular deixaria.
    expect(resposta.corpo).not.toMatch(/Aqui é a\s*,/)
  })

  test('empresa com & no nome não quebra o documento', async () => {
    const teste = bancada(linha({ company_name: 'Silva & Filhos' }))

    const resposta = await atender(teste)

    expect(resposta.corpo).toContain('Silva &amp; Filhos')
    // O `&` cru é o que faria a operadora recusar o documento inteiro.
    expect(resposta.corpo).not.toContain('Silva & Filhos')
  })

  test('a apresentação cita o nome e a empresa da conta', async () => {
    const teste = bancada(linha())

    const resposta = await atender(teste)

    expect(resposta.corpo).toContain(
      interpolarFala(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacao, {
        nome_do_agente: 'Sarah',
        empresa: 'Fábrica de Parafusos',
      }),
    )
  })

  test('nenhuma fala do documento está escrita dentro da função', async () => {
    const teste = bancada(linha({ inbound_behavior: 'voicemail' }))

    const resposta = await atender(teste)

    // Cada frase falada do documento tem que sair de `_shared/speech/`. A
    // varredura é sobre o documento pronto: frase nova escrita na função
    // apareceria aqui sem estar na lista.
    const faladas = [...resposta.corpo.matchAll(/<Say[^>]*>([^<]*)<\/Say>/g)].map(
      (achado) => achado[1] ?? '',
    )
    const doRepositorio = new Set<string>([
      FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade,
      FALAS_DE_ATENDIMENTO_RECEBIDO.avisoDeEncaminhamento,
      FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende,
      ...FALAS_DE_ATENDIMENTO_RECEBIDO.recadoDaLinha,
      interpolarFala(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacao, {
        nome_do_agente: 'Sarah',
        empresa: 'Fábrica de Parafusos',
      }),
    ])

    expect(faladas.length).toBeGreaterThan(0)
    for (const frase of faladas) expect(doRepositorio).toContain(frase)
  })
})

test('só POST é atendido', async () => {
  const teste = bancada(linha())

  const resposta = await atender(teste, { metodo: 'GET' })

  expect(resposta).toEqual(RECUSA_DE_METODO)
  expect(teste.consultados).toEqual([])
})
