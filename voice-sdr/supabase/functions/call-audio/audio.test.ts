// Provas de call-audio. Ambiente node, sem rede e sem banco: a porta é um
// `Proxy` que registra todo membro tocado, sobre duas contas em memória.
//
// O que este arquivo segura:
//
// 1. **A URL sai com validade curta**: cinco minutos pedidos ao Storage, e
//    nunca além do expurgo.
// 2. **Expurgada é 410 com a razão**, inclusive quando o arquivo ainda não foi
//    apagado; nunca houve gravação é 404 com outra frase.
// 3. **A conta vizinha recebe 404**, com o corpo idêntico ao da chamada que não
//    existe, e o Storage nem é chamado. A conferência é pela conta da linha: o
//    pedido não tem campo de conta para mentir.
// 4. **A credencial da instalação não sai**, nem ecoada dentro da URL.

import { describe, expect, test } from 'vitest'

import {
  atenderAudio,
  VALIDADE_DA_URL_EM_SEGUNDOS,
  type GravacaoDaChamada,
  type PedidoDaBorda,
  type PortaDoAudio,
  type RespostaDoAudio,
} from './audio.ts'

const CHAVE_DE_SERVICO = 'chave-de-servico-da-instalacao-0123456789'
const CONTA_A = '11111111-1111-4111-8111-111111111111'
const CONTA_B = '44444444-4444-4444-8444-444444444444'
const CHAMADA_A = '22222222-2222-4222-8222-222222222222'
const CHAMADA_B = '55555555-5555-4555-8555-555555555555'
const DESCONHECIDA = '66666666-6666-4666-8666-666666666666'
const MEMBRO_DE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const JWT_DE_A = 'jwt-do-membro-de-a'

const AGORA = '2026-03-20T10:00:00.000Z'
const DAQUI_A_30_DIAS = '2026-04-19T10:00:00.000Z'

function mais(instante: string, ms: number): string {
  return new Date(Date.parse(instante) + ms).toISOString()
}

interface Bancada {
  readonly porta: PortaDoAudio
  readonly tocados: string[]
  readonly assinaturas: { caminho: string; validade: number }[]
}

interface AjustesDaBancada {
  chamadaA?: Partial<GravacaoDaChamada>
  retencao?: number
  urlAssinada?: (caminho: string, validade: number) => string
  storageFalha?: boolean
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const tocados: string[] = []
  const assinaturas: { caminho: string; validade: number }[] = []

  const chamadas = new Map<string, GravacaoDaChamada>([
    [
      CHAMADA_A,
      {
        id: CHAMADA_A,
        account_id: CONTA_A,
        recording_path: `${CONTA_A}/${CHAMADA_A}.mp3`,
        recording_expires_at: DAQUI_A_30_DIAS,
        ...ajustes.chamadaA,
      },
    ],
    [
      CHAMADA_B,
      {
        id: CHAMADA_B,
        account_id: CONTA_B,
        recording_path: `${CONTA_B}/${CHAMADA_B}.mp3`,
        recording_expires_at: DAQUI_A_30_DIAS,
      },
    ],
  ])

  const real: PortaDoAudio = {
    async usuarioDaSessao(jwt) {
      return jwt === JWT_DE_A ? { id: MEMBRO_DE_A } : null
    },
    async gravacaoDaChamada(chamadaId) {
      return chamadas.get(chamadaId) ?? null
    },
    async papelNaConta(contaId, usuarioId) {
      return contaId === CONTA_A && usuarioId === MEMBRO_DE_A ? 'viewer' : null
    },
    async retencaoDaConta() {
      return ajustes.retencao ?? 90
    },
    async assinarGravacao(caminho, validade) {
      assinaturas.push({ caminho, validade })
      if (ajustes.storageFalha) throw new Error('storage fora do ar')
      return ajustes.urlAssinada
        ? ajustes.urlAssinada(caminho, validade)
        : `https://armazenamento.exemplo/assinado/${caminho}?token=token-do-arquivo&validade=${validade}`
    },
  }

  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })

  return { porta, tocados, assinaturas }
}

function pedido(ajustes: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return { metodo: 'POST', chamadaId: CHAMADA_A, autorizacao: `Bearer ${JWT_DE_A}`, ...ajustes }
}

function pedir(b: Bancada, ajustes: Partial<PedidoDaBorda> = {}, agora = AGORA): Promise<RespostaDoAudio> {
  return atenderAudio(pedido(ajustes), b.porta, { agora, segredosDaInstalacao: [CHAVE_DE_SERVICO] })
}

describe('a URL assinada', () => {
  test('sai com validade de cinco minutos, para o caminho da chamada', async () => {
    const b = bancada()
    const resposta = await pedir(b)

    expect(resposta.status).toBe(200)
    expect(VALIDADE_DA_URL_EM_SEGUNDOS).toBe(300)
    expect(b.assinaturas).toEqual([{ caminho: `${CONTA_A}/${CHAMADA_A}.mp3`, validade: 300 }])
    expect(resposta.corpo).toMatchObject({
      ok: true,
      chamadaId: CHAMADA_A,
      validadeEmSegundos: 300,
      expiraEm: mais(AGORA, 300_000),
    })
    if (resposta.corpo.ok) expect(resposta.corpo.url).toContain(`${CHAMADA_A}.mp3`)
  })

  test('nunca vale além do expurgo: a gravação que expira em 90 s recebe 90 s', async () => {
    const b = bancada({ chamadaA: { recording_expires_at: mais(AGORA, 90_000) } })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(200)
    expect(b.assinaturas.map((a) => a.validade)).toEqual([90])
    expect(resposta.corpo).toMatchObject({ validadeEmSegundos: 90, expiraEm: mais(AGORA, 90_000) })
  })

  test('Storage que recusa é 503 com frase, sem URL', async () => {
    const resposta = await pedir(bancada({ storageFalha: true }))
    expect(resposta.status).toBe(503)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'armazenamento_indisponivel' })
    expect(JSON.stringify(resposta.corpo)).not.toContain('storage fora do ar')
  })
})

describe('a gravação expurgada', () => {
  test('recording_path nulo depois do expurgo é 410 com a razão, e o Storage não é chamado', async () => {
    const b = bancada({ chamadaA: { recording_path: null, recording_expires_at: mais(AGORA, -1000) } })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(410)
    expect(resposta.corpo).toEqual({
      ok: false,
      motivo: 'gravacao_expurgada',
      mensagem: 'Esta gravação foi expurgada pelo prazo de retenção de 90 dias.',
    })
    expect(b.assinaturas).toEqual([])
  })

  test('prazo vencido com o arquivo ainda no balde também é 410: a retenção não espera a rotina', async () => {
    const b = bancada({ chamadaA: { recording_expires_at: AGORA } })
    const resposta = await pedir(b)

    expect(resposta.status).toBe(410)
    expect(b.assinaturas).toEqual([])
  })

  test('a frase leva o prazo da conta, e não um 90 fixo', async () => {
    const resposta = await pedir(
      bancada({ retencao: 30, chamadaA: { recording_path: null, recording_expires_at: mais(AGORA, -1) } }),
    )
    expect(resposta.corpo).toMatchObject({
      mensagem: 'Esta gravação foi expurgada pelo prazo de retenção de 30 dias.',
    })
  })

  test('caminho nulo sem data de expurgo é gravação que nunca houve: 404, e não "expurgada"', async () => {
    const resposta = await pedir(bancada({ chamadaA: { recording_path: null, recording_expires_at: null } }))
    expect(resposta.status).toBe(404)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'sem_gravacao' })
    expect(JSON.stringify(resposta.corpo)).not.toMatch(/expurgad/i)
  })
})

describe('a conta vizinha', () => {
  test('membro de A pedindo a chamada de B recebe 404, e não a URL', async () => {
    const b = bancada()
    const resposta = await pedir(b, { chamadaId: CHAMADA_B })

    expect(resposta.status).toBe(404)
    expect(JSON.stringify(resposta.corpo)).not.toContain(CONTA_B)
    expect(JSON.stringify(resposta.corpo)).not.toContain('.mp3')
    expect(b.assinaturas).toEqual([])
  })

  test('o 404 da vizinha é idêntico ao da chamada que não existe', async () => {
    const vizinha = await pedir(bancada(), { chamadaId: CHAMADA_B })
    const inexistente = await pedir(bancada(), { chamadaId: DESCONHECIDA })

    expect(vizinha.status).toBe(inexistente.status)
    expect(JSON.stringify(vizinha.corpo)).toBe(JSON.stringify(inexistente.corpo))
  })

  test('o vínculo é conferido contra a conta da linha', async () => {
    const b = bancada()
    await pedir(b, { chamadaId: CHAMADA_B })
    expect(b.tocados).toEqual(['usuarioDaSessao', 'gravacaoDaChamada', 'papelNaConta'])
  })
})

describe('a sessão e o pedido', () => {
  test('sem sessão, sessão inválida, chamada que não é uuid e método errado não chegam à chamada', async () => {
    const casos: [Partial<PedidoDaBorda>, number][] = [
      [{ autorizacao: null }, 401],
      [{ autorizacao: 'Bearer outro-jwt' }, 401],
      [{ chamadaId: 'nao-e-uuid' }, 400],
      [{ metodo: 'GET' }, 405],
    ]
    for (const [ajuste, status] of casos) {
      const b = bancada()
      const resposta = await pedir(b, ajuste)
      expect({ ajuste, status: resposta.status }).toEqual({ ajuste, status })
      expect(b.tocados).not.toContain('gravacaoDaChamada')
    }
  })
})

describe('a credencial nunca sai (US-013)', () => {
  test('URL que ecoa a chave de serviço derruba o pedido inteiro como falha_interna', async () => {
    const b = bancada({
      urlAssinada: (caminho) => `https://armazenamento.exemplo/${caminho}?apikey=${CHAVE_DE_SERVICO}`,
    })
    const resposta = await pedir(b)

    expect(b.assinaturas).toHaveLength(1)
    expect(resposta.status).toBe(500)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'falha_interna' })
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DE_SERVICO)
  })

  test('no caminho feliz, o corpo serializado não carrega a chave de serviço', async () => {
    const resposta = await pedir(bancada())
    expect(resposta.status).toBe(200)
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DE_SERVICO)
  })
})
