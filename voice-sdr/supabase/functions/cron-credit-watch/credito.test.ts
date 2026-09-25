// cron-credit-watch: o aviso abaixo do limiar, o silêncio acima, indisponível
// sem aviso, quatro passagens com um aviso só, o rearme depois da recarga, a
// conta sem provedor configurado em silêncio e o teto de 25 itens.
//
// A medição passa pelo `medirProvedores` de verdade (integrations-status); o
// dublado é a sondagem — a credencial e a resposta de cada provedor — e a
// porta do vigia. O dublê da porta guarda `provider_alerts` em memória, e
// `abrirAviso` é o `on conflict do nothing` sobre o único parcial ao pé da
// letra: devolve falso quando já há aviso aberto. A rede do SQL se prova em
// `testes/banco/vigia-de-credito.test.ts`.

import { describe, expect, test } from 'vitest'

import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'
import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'
import type { EstadoDoProvedor, PortaDeSondagem, RespostaDaSonda } from '../integrations-status/estado.ts'
import { PROVEDORES, type ProvedorId } from '../integrations-status/provedores.ts'

import {
  atenderRotina,
  LIMIAR_DA_COTA,
  lerProvedor,
  NOME_DA_ROTINA,
  vigiarCredito,
  type AvisoNovo,
  type ContaVigiada,
  type PortaDoVigia,
  type TipoDoAviso,
} from './credito.ts'

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const QUINZE_MINUTOS = 15 * 60_000
const SEGREDO = 'segredo-interno-da-instalacao'

function contaId(n: number): string {
  return `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`
}

/** O que cada provedor de uma conta responde. Ausente é provedor sem chave. */
type Provedores = Partial<Record<ProvedorId, RespostaDaSonda | 'lança'>>

function saldoDaTelefonia(dolares: number): RespostaDaSonda {
  return { ok: true, credito: { restante: dolares, total: null, unidade: 'USD' }, cota: null }
}

function voz(restante: number, total: number, emUso = 0, limite = 10): RespostaDaSonda {
  return {
    ok: true,
    credito: { restante, total, unidade: 'caracteres' },
    cota: { rotulo: 'sessões simultâneas', emUso, limite },
  }
}

/** A credencial de cada chave: valor improvável e presente, para a varredura de vazamento valer. */
function valorDaChave(conta: string, provedor: string, chave: string): string {
  return `valor-secreto-${provedor}-${chave}-${conta.slice(-4)}`
}

class Duble {
  /** Provedores por conta; mudar o valor entre passagens é a recarga. */
  readonly provedores = new Map<string, Provedores>()
  readonly limiares = new Map<string, number | null>()
  readonly avisos: (AvisoNovo & { alerted_at: string; rearmed_at: string | null })[] = []
  readonly aberturas: { aviso: AvisoNovo; abriu: boolean }[] = []
  readonly rearmes: string[] = []
  readonly sondadas: string[] = []
  readonly leiturasDeAbertos: string[] = []
  readonly limites: number[] = []
  readonly excecoes: AvisoNovo[] = []
  /** Faz a leitura de abertos mentir "nenhum", como a passagem sobreposta. */
  esquecerAbertos = false

  conta(n: number, provedores: Provedores, limiar: number | null = 1_000): string {
    const id = contaId(n)
    this.provedores.set(id, provedores)
    this.limiares.set(id, limiar)
    return id
  }

  abertos(conta: string) {
    return this.avisos.filter((aviso) => aviso.account_id === conta && aviso.rearmed_at === null)
  }

  readonly sondagem: PortaDeSondagem = {
    credencial: async (conta, provedor, chave): Promise<ResolucaoDeSegredo> => {
      const presente = this.provedores.get(conta)?.[provedor] !== undefined
      return presente
        ? { ok: true, valor: valorDaChave(conta, provedor, chave), origem: 'conta' }
        : { ok: false, motivo: 'ausente' }
    },
    sondar: async (provedor, credenciais) => {
      const conta = [...this.provedores.keys()].find((id) =>
        Object.values(credenciais).some((valor) => valor.endsWith(id.slice(-4))),
      )!
      this.sondadas.push(`${conta}:${provedor}`)
      const resposta = this.provedores.get(conta)?.[provedor]
      if (resposta === 'lança' || resposta === undefined) throw new Error('tempo esgotado')
      return resposta
    },
  }

  readonly porta: PortaDoVigia = {
    reivindicarContas: async (limite) => {
      this.limites.push(limite)
      return [...this.provedores.keys()].slice(0, limite).map(
        (id): ContaVigiada => ({ account_id: id, credit_alert_cents: this.limiares.get(id) ?? null }),
      )
    },
    avisosAbertos: async (conta) => {
      this.leiturasDeAbertos.push(conta)
      if (this.esquecerAbertos) return []
      return this.abertos(conta).map((aviso) => ({ provider: aviso.provider, kind: aviso.kind }))
    },
    abrirAviso: async (aviso, instante) => {
      const existe = this.abertos(aviso.account_id).some(
        (aberto) => aberto.provider === aviso.provider && aberto.kind === aviso.kind,
      )
      this.aberturas.push({ aviso, abriu: !existe })
      if (existe) return false
      this.avisos.push({ ...aviso, alerted_at: instante, rearmed_at: null })
      return true
    },
    rearmarAviso: async (conta, provedor, tipo, instante) => {
      this.rearmes.push(`${conta}:${provedor}:${tipo}`)
      const aberto = this.abertos(conta).find((aviso) => aviso.provider === provedor && aviso.kind === tipo)
      if (!aberto) return false
      aberto.rearmed_at = instante
      return true
    },
  }

  avisosDe(conta: string, tipo?: TipoDoAviso) {
    return this.avisos.filter((aviso) => aviso.account_id === conta && (tipo === undefined || aviso.kind === tipo))
  }
}

function portaDeExecucao() {
  const fins: LinhaDeFim[] = []
  const inicios: string[] = []
  const porta: PortaDeExecucao = {
    inserirExecucao: async (linha) => {
      inicios.push(linha.routine)
      return 'execucao-1'
    },
    concluirExecucao: async (_id, linha) => {
      fins.push(linha)
    },
    itensDasUltimasExecucoes: async () => [],
  }
  return { porta, fins, inicios }
}

async function rodar(duble: Duble, instante = AGORA, porta: PortaDoVigia = duble.porta) {
  const execucao = portaDeExecucao()
  const resultado = await vigiarCredito({
    porta,
    sondagem: duble.sondagem,
    execucao: execucao.porta,
    agora: () => instante,
  })
  return { resultado, ...execucao }
}

describe('o crédito em moeda', () => {
  test('abaixo do limiar abre um aviso com o provedor e o que para de funcionar', async () => {
    const duble = new Duble()
    const conta = duble.conta(1, { telefonia: saldoDaTelefonia(4.2) }, 1_000)

    const { resultado, fins, inicios } = await rodar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(inicios).toEqual([NOME_DA_ROTINA])
    expect(fins[0]).toMatchObject({ items: 1, error: null })

    const [aviso] = duble.avisosDe(conta)
    expect(duble.avisosDe(conta)).toHaveLength(1)
    expect(aviso).toMatchObject({ provider: 'telefonia', kind: 'credito' })
    const telefonia = PROVEDORES.find((provedor) => provedor.id === 'telefonia')!
    expect(aviso!.message).toContain(telefonia.rotulo)
    expect(aviso!.message).toContain(telefonia.fornecedor)
    expect(aviso!.message).toMatch(/US\$\s4,20/)
    expect(aviso!.message).toMatch(/US\$\s10,00/)
    expect(aviso!.message).toContain('nenhuma chamada sai e nenhuma entra')
    expect(aviso!.observed).toEqual({ restante_cents: 420, unidade: 'USD', limiar_cents: 1_000 })
  })

  test('acima do limiar não abre nada', async () => {
    const duble = new Duble()
    const conta = duble.conta(2, { telefonia: saldoDaTelefonia(25) }, 1_000)

    await rodar(duble)
    expect(duble.aberturas).toEqual([])
    expect(duble.avisosDe(conta)).toEqual([])
  })

  test('no limiar exato não abre: o aviso é para abaixo dele', async () => {
    const duble = new Duble()
    duble.conta(3, { telefonia: saldoDaTelefonia(10) }, 1_000)

    await rodar(duble)
    expect(duble.aberturas).toEqual([])
  })

  test('limiar nulo é conta sem aviso de crédito, mesmo com saldo zerado', async () => {
    const duble = new Duble()
    const conta = duble.conta(4, { telefonia: saldoDaTelefonia(0) }, null)

    await rodar(duble)
    expect(duble.avisosDe(conta, 'credito')).toEqual([])
  })
})

describe('o crédito em outra unidade', () => {
  test('caracteres não se comparam com centavos: vale a regra do cartão, menos de um décimo', async () => {
    const duble = new Duble()
    const baixa = duble.conta(10, { voz: voz(800, 10_000) }, 1_000_000)
    const folgada = duble.conta(11, { voz: voz(5_000, 10_000) }, 1)

    await rodar(duble)
    expect(duble.avisosDe(baixa, 'credito')).toHaveLength(1)
    expect(duble.avisosDe(baixa, 'credito')[0]!.message).toContain('800 de 10.000 caracteres')
    expect(duble.avisosDe(folgada, 'credito')).toEqual([])
  })
})

describe('a cota', () => {
  test(`passar de ${LIMIAR_DA_COTA * 100}% em uso abre aviso de cota, com ou sem limiar de crédito`, async () => {
    const duble = new Duble()
    const conta = duble.conta(20, { voz: voz(9_000, 10_000, 9, 10) }, null)

    await rodar(duble)
    const avisos = duble.avisosDe(conta)
    expect(avisos.map((aviso) => aviso.kind)).toEqual(['cota'])
    expect(avisos[0]!.message).toContain('9 de 10 sessões simultâneas')
    expect(avisos[0]!.message).toContain('a assistente não fala')
  })

  test('abaixo do limiar da cota fica em silêncio', async () => {
    const duble = new Duble()
    duble.conta(21, { voz: voz(9_000, 10_000, 8, 10) }, null)

    await rodar(duble)
    expect(duble.aberturas).toEqual([])
  })
})

describe('indisponível não é sem saldo', () => {
  test('provedor que não respondeu não abre aviso', async () => {
    const duble = new Duble()
    const conta = duble.conta(30, { telefonia: 'lança', voz: { ok: false, codigo: 'timeout' } }, 1_000)

    await rodar(duble)
    expect(duble.aberturas).toEqual([])
    expect(duble.avisosDe(conta)).toEqual([])
  })

  test('e não rearma o aviso aberto: não responder não é ter saldo de volta', async () => {
    const duble = new Duble()
    const conta = duble.conta(31, { telefonia: saldoDaTelefonia(1) }, 1_000)
    await rodar(duble)
    expect(duble.abertos(conta)).toHaveLength(1)

    duble.provedores.set(conta, { telefonia: 'lança' })
    await rodar(duble, AGORA + QUINZE_MINUTOS)
    expect(duble.rearmes).toEqual([])
    expect(duble.abertos(conta)).toHaveLength(1)

    // Volta a responder, ainda baixo: continua o mesmo aviso, sem repetir.
    duble.provedores.set(conta, { telefonia: saldoDaTelefonia(1) })
    await rodar(duble, AGORA + 2 * QUINZE_MINUTOS)
    expect(duble.avisosDe(conta)).toHaveLength(1)
  })

  test('a regra é do estado, não da falta de número: indisponível com crédito informado não tem leitura', () => {
    // integrations-status zera o crédito do provedor que não respondeu; a
    // leitura não depende disso, para um provedor que um dia informe saldo
    // velho junto da falha continuar sem aviso.
    const estado: EstadoDoProvedor = {
      provedor: 'telefonia',
      rotulo: 'Telefonia',
      fornecedor: 'Twilio',
      estado: 'indisponivel',
      configurado: true,
      conectado: false,
      credito: { restante: 0, total: null, unidade: 'USD', baixo: true },
      cota: { rotulo: 'canais', emUso: 10, limite: 10, esgotada: true },
      erro: null,
      chaves: [],
      chavesFaltando: [],
      caminhoDeConfiguracao: '/config/integracoes#telefonia',
      bloqueia: 'Não há número nem linha.',
      origem: 'conta',
    }
    const conta = { account_id: contaId(33), credit_alert_cents: 1_000 }
    expect(lerProvedor(estado, conta)).toEqual([])
    expect(lerProvedor({ ...estado, estado: 'conectado' }, conta).map((leitura) => leitura.alerta)).toEqual([true, true])
  })

  test('chave recusada é erro sem crédito lido, e também não avisa', async () => {
    const duble = new Duble()
    duble.conta(32, { telefonia: { ok: false, codigo: 'invalid_api_key', status: 401 } }, 1_000)

    await rodar(duble)
    expect(duble.aberturas).toEqual([])
  })
})

describe('um aviso por queda', () => {
  test('quatro passagens seguidas com crédito baixo geram um aviso', async () => {
    const duble = new Duble()
    const conta = duble.conta(40, { telefonia: saldoDaTelefonia(2) }, 1_000)

    for (let passagem = 0; passagem < 4; passagem += 1) {
      await rodar(duble, AGORA + passagem * QUINZE_MINUTOS)
    }

    expect(duble.avisosDe(conta)).toHaveLength(1)
    // Não é a rede do único que segura: a rotina lê o aviso aberto e nem tenta.
    expect(duble.aberturas).toHaveLength(1)
    expect(duble.leiturasDeAbertos).toEqual([conta, conta, conta, conta])
  })

  test('passagem sobreposta que leu "nenhum aberto" esbarra no único e não abre outro', async () => {
    const duble = new Duble()
    const conta = duble.conta(41, { telefonia: saldoDaTelefonia(2) }, 1_000)
    await rodar(duble)

    duble.esquecerAbertos = true
    await rodar(duble, AGORA + QUINZE_MINUTOS)
    expect(duble.aberturas.map((abertura) => abertura.abriu)).toEqual([true, false])
    expect(duble.avisosDe(conta)).toHaveLength(1)
  })

  test('a recarga rearma, e só a queda seguinte abre outro aviso', async () => {
    const duble = new Duble()
    const conta = duble.conta(42, { telefonia: saldoDaTelefonia(2) }, 1_000)
    await rodar(duble)

    duble.provedores.set(conta, { telefonia: saldoDaTelefonia(50) })
    await rodar(duble, AGORA + QUINZE_MINUTOS)
    expect(duble.rearmes).toEqual([`${conta}:telefonia:credito`])
    expect(duble.abertos(conta)).toEqual([])
    expect(duble.avisosDe(conta)[0]!.rearmed_at).toBe(new Date(AGORA + QUINZE_MINUTOS).toISOString())

    // Acima do limiar, sem aviso aberto: nem abre nem rearma de novo.
    await rodar(duble, AGORA + 2 * QUINZE_MINUTOS)
    expect(duble.rearmes).toHaveLength(1)

    duble.provedores.set(conta, { telefonia: saldoDaTelefonia(3) })
    await rodar(duble, AGORA + 3 * QUINZE_MINUTOS)
    expect(duble.avisosDe(conta)).toHaveLength(2)
    expect(duble.abertos(conta)).toHaveLength(1)
  })

  test('crédito e cota do mesmo provedor são avisos independentes', async () => {
    const duble = new Duble()
    const conta = duble.conta(43, { voz: voz(100, 10_000, 10, 10) }, 1_000)
    await rodar(duble)
    expect(duble.avisosDe(conta).map((aviso) => aviso.kind).sort()).toEqual(['cota', 'credito'])

    duble.provedores.set(conta, { voz: voz(100, 10_000, 1, 10) })
    await rodar(duble, AGORA + QUINZE_MINUTOS)
    expect(duble.rearmes).toEqual([`${conta}:voz:cota`])
    expect(duble.abertos(conta).map((aviso) => aviso.kind)).toEqual(['credito'])
  })
})

describe('conta sem nada configurado', () => {
  test('todos os provedores em nao_configurado: silêncio, sem sondar e sem ler avisos', async () => {
    const duble = new Duble()
    const conta = duble.conta(50, {}, 1_000)

    const { resultado } = await rodar(duble)
    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(duble.sondadas).toEqual([])
    expect(duble.leiturasDeAbertos).toEqual([])
    expect(duble.avisosDe(conta)).toEqual([])
  })
})

describe('o ponto de extensão da fila de exceções', () => {
  test('ausente em F2: o aviso abre sem ele', async () => {
    const duble = new Duble()
    duble.conta(60, { telefonia: saldoDaTelefonia(1) }, 1_000)
    expect('abrirExcecao' in duble.porta).toBe(false)

    const { resultado } = await rodar(duble)
    expect(resultado.ok).toBe(true)
    expect(duble.avisos).toHaveLength(1)
  })

  test('presente, é chamado só para o aviso que acabou de abrir', async () => {
    const duble = new Duble()
    duble.conta(61, { telefonia: saldoDaTelefonia(1) }, 1_000)
    const comFila: PortaDoVigia = {
      ...duble.porta,
      abrirExcecao: async (aviso) => {
        duble.excecoes.push(aviso)
      },
    }

    await rodar(duble, AGORA, comFila)
    await rodar(duble, AGORA + QUINZE_MINUTOS, comFila)
    expect(duble.excecoes).toHaveLength(1)
  })
})

describe('o valor da credencial não vai para o aviso', () => {
  test('rótulo de cota que ecoa a chave derruba a passagem sem abrir aviso', async () => {
    const duble = new Duble()
    const id = contaId(70)
    duble.conta(70, {
      voz: {
        ok: true,
        credito: null,
        cota: { rotulo: valorDaChave(id, 'voz', 'api_key'), emUso: 10, limite: 10 },
      },
    })

    const { resultado } = await rodar(duble)
    expect(resultado.ok).toBe(false)
    expect(duble.avisos).toEqual([])
  })
})

describe('o envelope', () => {
  test('pede no máximo 25 e vigia 25 de 30 contas', async () => {
    const duble = new Duble()
    for (let n = 0; n < 30; n += 1) duble.conta(100 + n, { telefonia: saldoDaTelefonia(1) })

    const { resultado } = await rodar(duble)
    expect(duble.limites).toEqual([25])
    expect(resultado).toMatchObject({ ok: true, itens: 25 })
    expect(new Set(duble.sondadas).size).toBe(25)
    expect(duble.avisos).toHaveLength(25)
  })

  test('reivindicação acima do teto encerra a passagem sem sondar nem avisar', async () => {
    const duble = new Duble()
    for (let n = 0; n < 26; n += 1) duble.conta(200 + n, { telefonia: saldoDaTelefonia(1) })
    const excede: PortaDoVigia = {
      ...duble.porta,
      reivindicarContas: async () =>
        [...duble.provedores.keys()].map((id) => ({ account_id: id, credit_alert_cents: 1_000 })),
    }

    const { resultado, fins } = await rodar(duble, AGORA, excede)
    expect(resultado.ok).toBe(false)
    expect(duble.sondadas).toEqual([])
    expect(duble.avisos).toEqual([])
    expect(fins[0]?.error).toMatch(/teto de 25/)
  })
})

describe('a borda', () => {
  function portasVigiadas() {
    const tocadas: string[] = []
    const vigiar = <T extends object>(nome: string): T =>
      new Proxy({} as T, {
        get(_alvo, membro) {
          tocadas.push(`${nome}.${String(membro)}`)
          return async () => {
            throw new Error('não devia ser chamada')
          }
        },
      })
    return {
      tocadas,
      pedido: {
        porta: vigiar<PortaDoVigia>('vigia'),
        sondagem: vigiar<PortaDeSondagem>('sondagem'),
        execucao: vigiar<PortaDeExecucao>('execucao'),
      },
    }
  }

  test.each([
    ['sem segredo', null],
    ['segredo errado', 'outro-segredo'],
  ])('%s: 401 antes de tocar em qualquer porta', async (_caso, segredo) => {
    const { tocadas, pedido } = portasVigiadas()
    const resposta = await atenderRotina({ metodo: 'POST', segredo }, pedido, { segredoInterno: SEGREDO })
    expect(resposta.status).toBe(401)
    expect(tocadas).toEqual([])
  })

  test('segredo interno ausente na instalação fecha o portão', async () => {
    const { tocadas, pedido } = portasVigiadas()
    const resposta = await atenderRotina({ metodo: 'POST', segredo: '' }, pedido, { segredoInterno: '' })
    expect(resposta.status).toBe(401)
    expect(tocadas).toEqual([])
  })

  test('método que não é POST é 405, sem tocar em porta', async () => {
    const { tocadas, pedido } = portasVigiadas()
    const resposta = await atenderRotina({ metodo: 'GET', segredo: SEGREDO }, pedido, { segredoInterno: SEGREDO })
    expect(resposta.status).toBe(405)
    expect(tocadas).toEqual([])
  })

  test('com o segredo, roda a passagem e responde 200', async () => {
    const duble = new Duble()
    duble.conta(300, { telefonia: saldoDaTelefonia(1) })
    const { porta: execucao } = portaDeExecucao()
    const resposta = await atenderRotina(
      { metodo: 'post', segredo: SEGREDO },
      { porta: duble.porta, sondagem: duble.sondagem, execucao, agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(200)
    expect(duble.avisos).toHaveLength(1)
  })
})
