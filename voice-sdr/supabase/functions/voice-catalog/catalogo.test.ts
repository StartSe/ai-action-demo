// Provas do catálogo de vozes e da amostra da abertura. Ambiente node, sem rede
// e sem áudio: o provedor é dublado e **conta as chamadas**, que é o único jeito
// de o cache de 60 s ser verificável.
//
// O que este arquivo segura, e por que prosa não seguraria nenhuma:
//
// 1. **A amostra é a primeira fala real, interpolada.** O texto que vai ao
//    provedor é comparado com a abertura da conta preenchida — com uma frase de
//    catálogo no lugar, todas as outras asserções continuariam verdes.
// 2. **Nenhum marcador sobra.** A varredura é sobre a lista de marcadores que a
//    publicação e a chamada conhecem, mais um marcador inventado: o que ninguém
//    conhece some da frase em vez de ser lido em voz alta.
// 3. **Duas listagens seguidas fazem uma ida ao provedor, e depois do TTL fazem
//    duas.** O relógio é injetado; sem a contagem, uma versão sem cache nenhum
//    passaria verde em qualquer asserção sobre o resultado.
// 4. **A amostra não é cacheada.** Dois pedidos com velocidades diferentes são
//    duas sínteses, senão o ajuste deixa de ser audível.
// 5. **Os quatro estados.** `erro` e `indisponivel` saem de códigos diferentes
//    do provedor e não se confundem.
// 6. **A chave não sai no corpo.** Um nome de voz que a ecoasse derruba o
//    pedido inteiro.

import { describe, expect, test } from 'vitest'

import { MARCADORES_DA_CHAMADA, MARCADORES_DA_PUBLICACAO } from '../_shared/agente/compilador.ts'

import {
  criarCatalogoDeVozes,
  interpolarPrimeiraFala,
  resolverAjustes,
  LEAD_DE_EXEMPLO,
  TTL_DO_CATALOGO_MS,
  type AgenteDaConta,
  type CorpoDeRecusa,
  type CorpoDoCatalogo,
  type PedidoDeAmostra,
  type PortaDoCatalogo,
  type RespostaDaAmostra,
  type RespostaDaLista,
  type RespostaDoCatalogo,
} from './catalogo.ts'
import { AJUSTES_DE_VOZ, MODELO_DA_AMOSTRA } from './formato-do-provedor.ts'
import { MENSAGENS, MENSAGENS_DA_AMOSTRA, MENSAGENS_DA_AUSENCIA } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const USUARIO = '33333333-3333-4333-8333-333333333333'
const AUTORIZACAO = 'Bearer jwt-de-quem-escolhe-a-voz'
const CHAVE_DA_VOZ = 'chave-do-provedor-de-voz-que-nao-pode-sair'
const INSTANTE = '2026-09-22T12:00:00.000Z'

const AGENTE: AgenteDaConta = {
  name: 'Sarah',
  company_name: 'Vexo Tecnologia',
  never_claim: ['prazo de entrega'],
  voice_settings: { stability: 0.7 },
  first_message: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
}

/** A resposta do provedor, com os nomes dele. Duas em português, duas não. */
const VOZES_DO_PROVEDOR = {
  voices: [
    {
      voice_id: 'voz-brasileira',
      name: 'Helena',
      labels: { gender: 'female', accent: 'brazilian', description: 'calma' },
      preview_url: 'https://provedor.exemplo/helena.mp3',
      verified_languages: [{ language: 'pt-BR' }],
      settings: { stability: 0.8 },
    },
    {
      voice_id: 'voz-portuguesa',
      name: 'Rui',
      labels: { gender: 'male' },
      preview_url: null,
      fine_tuning: { language: 'pt' },
    },
    {
      voice_id: 'voz-inglesa',
      name: 'Grace',
      labels: { gender: 'female', accent: 'american' },
      verified_languages: [{ language: 'en-US' }],
    },
    // Voz sem identificador: ilegível, descartada, e nem por isso a lista cai.
    { name: 'Sem identificador', labels: {} },
  ],
}

interface AjustesDaPorta {
  readonly usuario?: { readonly id: string } | null
  readonly papel?: string | null
  readonly agente?: AgenteDaConta | null
  readonly credencial?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  /** O que o provedor responde ao listar. O padrão é o catálogo de exemplo. */
  readonly lista?: RespostaDaLista | Error
  readonly amostra?: RespostaDaAmostra | Error
}

interface Bancada {
  readonly porta: PortaDoCatalogo
  readonly listagens: string[]
  readonly sinteses: PedidoDeAmostra[]
}

function bancada(ajustes: AjustesDaPorta = {}): Bancada {
  const listagens: string[] = []
  const sinteses: PedidoDeAmostra[] = []

  const porta: PortaDoCatalogo = {
    async usuarioDaSessao() {
      return ajustes.usuario === undefined ? { id: USUARIO } : ajustes.usuario
    },
    async papelNaConta() {
      return ajustes.papel === undefined ? 'operator' : ajustes.papel
    },
    async agenteDaConta() {
      return ajustes.agente === undefined ? AGENTE : ajustes.agente
    },
    async credencial() {
      switch (ajustes.credencial ?? 'ok') {
        case 'ausente':
          return { ok: false, motivo: 'ausente' }
        case 'plataforma_bloqueada':
          return { ok: false, motivo: 'plataforma_bloqueada' }
        default:
          return { ok: true, valor: CHAVE_DA_VOZ, origem: 'conta' }
      }
    },
    async listarVozes(contaId) {
      listagens.push(contaId)
      const resposta = ajustes.lista ?? { ok: true, vozes: VOZES_DO_PROVEDOR, status: 200 }
      if (resposta instanceof Error) throw resposta
      return resposta
    },
    async sintetizarAmostra(pedido) {
      sinteses.push(pedido)
      const resposta = ajustes.amostra ?? {
        ok: true,
        audioBase64: 'YXVkaW8=',
        formato: 'audio/mpeg',
        status: 200,
      }
      if (resposta instanceof Error) throw resposta
      return resposta
    },
  }

  return { porta, listagens, sinteses }
}

interface Relogio {
  avancar(ms: number): void
}

function catalogoDeTeste(ajustes: AjustesDaPorta = {}): {
  readonly bancada: Bancada
  readonly relogio: Relogio
  pedir(pedido?: { vozId?: unknown; ajustes?: unknown }): Promise<RespostaDoCatalogo>
} {
  const montada = bancada(ajustes)
  let momento = 1_000
  const catalogo = criarCatalogoDeVozes({
    porta: montada.porta,
    agora: () => momento,
    instante: () => new Date(INSTANTE),
  })

  return {
    bancada: montada,
    relogio: { avancar: (ms) => void (momento += ms) },
    pedir: (pedido = {}) =>
      catalogo.atender({
        metodo: 'POST',
        contaId: CONTA,
        autorizacao: AUTORIZACAO,
        vozId: pedido.vozId,
        ajustes: pedido.ajustes,
      }),
  }
}

function corpoDoCatalogo(resposta: RespostaDoCatalogo): CorpoDoCatalogo {
  expect(resposta.corpo.ok).toBe(true)
  return resposta.corpo as CorpoDoCatalogo
}

function corpoDeRecusa(resposta: RespostaDoCatalogo): CorpoDeRecusa {
  expect(resposta.corpo.ok).toBe(false)
  return resposta.corpo as CorpoDeRecusa
}

describe('a lista de vozes', () => {
  test('só as que declaram português, e as ignoradas contadas', async () => {
    const { pedir } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.estado).toBe('conectado')
    expect(corpo.vozes.map((voz) => voz.id)).toEqual(['voz-brasileira', 'voz-portuguesa'])
    // A inglesa e a sem identificador. O número separa "o provedor não tem voz
    // em português" de "a biblioteca desta conta está vazia".
    expect(corpo.vozesIgnoradas).toBe(2)
  })

  test('o sotaque brasileiro basta, mesmo sem idioma declarado', async () => {
    const { pedir } = catalogoDeTeste({
      lista: {
        ok: true,
        vozes: { voices: [{ voice_id: 'so-sotaque', name: 'Bia', labels: { accent: 'brazilian' } }] },
      },
    })

    expect(corpoDoCatalogo(await pedir()).vozes).toHaveLength(1)
  })

  test('cada voz leva gênero percebido, prévia e as configurações aceitas', async () => {
    const { pedir } = catalogoDeTeste()

    const [helena, rui] = corpoDoCatalogo(await pedir()).vozes

    expect(helena?.nome).toBe('Helena')
    expect(helena?.genero).toBe('feminina')
    expect(helena?.sotaque).toBe('brazilian')
    expect(helena?.previa).toBe('https://provedor.exemplo/helena.mp3')
    expect(helena?.ajustesAceitos.map((ajuste) => ajuste.nome)).toEqual([
      'estabilidade',
      'similaridade',
      'velocidade',
    ])
    // O padrão de cada voz é o que o provedor declarou para ela: abrir o
    // controle em 0,5 faria a primeira audição soar diferente da voz escolhida.
    expect(helena?.ajustesAceitos[0]?.padrao).toBe(0.8)
    expect(rui?.genero).toBe('masculina')
    expect(rui?.ajustesAceitos[0]?.padrao).toBe(0.5)
  })

  test('nenhum nome de campo do provedor atravessa para a resposta', async () => {
    const { pedir } = catalogoDeTeste()

    const serializado = JSON.stringify(corpoDoCatalogo(await pedir()))

    for (const campo of ['voice_id', 'preview_url', 'similarity_boost', 'stability']) {
      expect(serializado).not.toContain(campo)
    }
  })
})

describe('os quatro estados do provedor', () => {
  test('conectado quando a chave existe e o provedor responde', async () => {
    const { pedir } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.estado).toBe('conectado')
    expect(corpo.erro).toBeNull()
  })

  test('nao_configurado quando não há chave', async () => {
    const { pedir, bancada } = catalogoDeTeste({ credencial: 'ausente' })

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.estado).toBe('nao_configurado')
    expect(corpo.erro?.mensagem).toBe(MENSAGENS_DA_AUSENCIA.sem_chave)
    expect(corpo.vozes).toEqual([])
    // Sem chave não se pergunta nada ao provedor.
    expect(bancada.listagens).toEqual([])
  })

  test('nao_configurado com a frase da plataforma bloqueada', async () => {
    const { pedir } = catalogoDeTeste({ credencial: 'plataforma_bloqueada' })

    expect(corpoDoCatalogo(await pedir()).erro?.mensagem).toBe(
      MENSAGENS_DA_AUSENCIA.plataforma_bloqueada,
    )
  })

  test('erro quando a chave é recusada', async () => {
    const { pedir } = catalogoDeTeste({
      lista: { ok: false, codigo: 'invalid_api_key', status: 401 },
    })

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.estado).toBe('erro')
    expect(corpo.erro?.motivo).toBe('chave_invalida')
    // O código do provedor morre na borda: quem administra lê o que fazer.
    expect(JSON.stringify(corpo)).not.toContain('invalid_api_key')
  })

  test('indisponivel quando o provedor não respondeu', async () => {
    const { pedir } = catalogoDeTeste({ lista: { ok: false, codigo: null, status: 503 } })

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.estado).toBe('indisponivel')
    expect(corpo.erro?.motivo).toBe('provedor_indisponivel')
  })

  test('exceção de rede é indisponivel, e não erro de chave', async () => {
    const { pedir } = catalogoDeTeste({ lista: new Error('econnreset') })

    // A distinção é a que interessa: `erro` mandaria conferir uma chave boa.
    expect(corpoDoCatalogo(await pedir()).estado).toBe('indisponivel')
  })
})

describe('o cache de 60 segundos', () => {
  test('duas listagens seguidas fazem uma ida ao provedor', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    const primeira = corpoDoCatalogo(await pedir())
    const segunda = corpoDoCatalogo(await pedir())

    expect(bancada.listagens).toHaveLength(1)
    expect(primeira.doCache).toBe(false)
    expect(segunda.doCache).toBe(true)
    expect(segunda.vozes).toEqual(primeira.vozes)
  })

  test('passado o prazo, o provedor é consultado de novo', async () => {
    const { pedir, bancada, relogio } = catalogoDeTeste()

    await pedir()
    relogio.avancar(TTL_DO_CATALOGO_MS + 1)
    const depois = corpoDoCatalogo(await pedir())

    expect(bancada.listagens).toHaveLength(2)
    expect(depois.doCache).toBe(false)
  })

  test('falha não fica guardada: o próximo pedido tenta de novo', async () => {
    // Catálogo indisponível cacheado por um minuto transforma "tente de novo"
    // em um minuto de mentira.
    const { pedir, bancada } = catalogoDeTeste({ lista: { ok: false, status: 503 } })

    await pedir()
    await pedir()

    expect(bancada.listagens).toHaveLength(2)
  })

  test('a amostra não é cacheada: cada ajuste é uma síntese', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    await pedir({ vozId: 'voz-brasileira', ajustes: { velocidade: 1 } })
    await pedir({ vozId: 'voz-brasileira', ajustes: { velocidade: 1.2 } })

    expect(bancada.listagens).toHaveLength(1)
    expect(bancada.sinteses).toHaveLength(2)
    expect(bancada.sinteses[1]?.ajustes.velocidade).toBe(1.2)
  })
})

describe('a amostra da primeira fala', () => {
  test('o que a voz diz é a abertura da conta, não uma frase de catálogo', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(await pedir({ vozId: 'voz-brasileira' }))

    const esperado = 'Oi, Marcos Ferreira? Aqui é a Sarah, da Vexo Tecnologia.'
    expect(corpo.amostra?.texto).toBe(esperado)
    // O pedido montado é o que este teste mede; o som é do CI.
    expect(bancada.sinteses[0]?.corpo.text).toBe(esperado)
    expect(bancada.sinteses[0]?.corpo.model_id).toBe(MODELO_DA_AMOSTRA)
    expect(bancada.sinteses[0]?.corpo.language_code).toBe('pt')
    expect(bancada.sinteses[0]?.vozId).toBe('voz-brasileira')
    expect(corpo.amostra?.audioBase64).toBe('YXVkaW8=')
    expect(corpo.amostra?.formato).toBe('audio/mpeg')
  })

  test('nenhum marcador é lido em voz alta', () => {
    const abertura = [...MARCADORES_DA_PUBLICACAO, ...MARCADORES_DA_CHAMADA, 'cargo_do_lead']
      .map((marcador) => `{${marcador}}`)
      .join(' ')

    const falado = interpolarPrimeiraFala(abertura, AGENTE)

    expect(falado).not.toMatch(/[{}]/)
    // O que a publicação sabe preencher vem da conta; o resto, da semente.
    expect(falado).toContain('Sarah')
    expect(falado).toContain('Vexo Tecnologia')
    expect(falado).toContain('prazo de entrega')
    expect(falado).toContain(LEAD_DE_EXEMPLO.nome_do_lead)
  })

  test('marcador desconhecido some sem deixar espaço nem vírgula órfã', () => {
    expect(interpolarPrimeiraFala('Oi, {cargo_do_lead}! Aqui é a {nome_do_agente}.', AGENTE)).toBe(
      'Oi! Aqui é a Sarah.',
    )
  })

  test('a conta sem lista de restrições não fala "undefined"', () => {
    const falado = interpolarPrimeiraFala('{nunca_afirmar}', { ...AGENTE, never_claim: [] })

    expect(falado).toBe('a conta não listou nada')
  })

  test('sem primeira fala escrita, a lista vem e a pendência explica', async () => {
    const { pedir, bancada } = catalogoDeTeste({ agente: { ...AGENTE, first_message: '   ' } })

    const corpo = corpoDoCatalogo(await pedir({ vozId: 'voz-brasileira' }))

    expect(corpo.vozes).toHaveLength(2)
    expect(corpo.amostra).toBeNull()
    expect(corpo.pendenciaDaAmostra?.motivo).toBe('sem_primeira_fala')
    expect(corpo.pendenciaDaAmostra?.mensagem).toBe(MENSAGENS_DA_AMOSTRA.sem_primeira_fala)
    expect(bancada.sinteses).toEqual([])
  })

  test('conta sem Sarah montada', async () => {
    const { pedir } = catalogoDeTeste({ agente: null })

    expect(corpoDoCatalogo(await pedir({ vozId: 'voz-brasileira' })).pendenciaDaAmostra?.motivo).toBe(
      'sem_agente',
    )
  })

  test('voz fora do catálogo em português não é sintetizada', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(await pedir({ vozId: 'voz-inglesa' }))

    expect(corpo.pendenciaDaAmostra?.motivo).toBe('voz_desconhecida')
    expect(bancada.sinteses).toEqual([])
  })

  test('provedor que recusa a síntese não derruba a lista', async () => {
    const { pedir } = catalogoDeTeste({
      amostra: { ok: false, codigo: 'invalid_api_key', status: 401 },
    })

    const corpo = corpoDoCatalogo(await pedir({ vozId: 'voz-brasileira' }))

    expect(corpo.estado).toBe('conectado')
    expect(corpo.vozes).toHaveLength(2)
    expect(corpo.pendenciaDaAmostra?.motivo).toBe('provedor_recusou')
  })

  test('provedor mudo na síntese vira pendência de indisponível', async () => {
    const { pedir } = catalogoDeTeste({ amostra: new Error('timeout') })

    expect(corpoDoCatalogo(await pedir({ vozId: 'voz-brasileira' })).pendenciaDaAmostra?.motivo).toBe(
      'provedor_indisponivel',
    )
  })

  test('sem voz pedida, nenhuma síntese e nenhuma pendência', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(await pedir())

    expect(corpo.amostra).toBeNull()
    expect(corpo.pendenciaDaAmostra).toBeNull()
    expect(bancada.sinteses).toEqual([])
  })
})

describe('velocidade e estabilidade', () => {
  test('o que a tela experimenta é o que o provedor recebe', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    const corpo = corpoDoCatalogo(
      await pedir({ vozId: 'voz-brasileira', ajustes: { velocidade: 1.1, estabilidade: 0.3 } }),
    )

    expect(corpo.amostra?.ajustes).toEqual({
      estabilidade: 0.3,
      similaridade: 0.75,
      velocidade: 1.1,
    })
    expect(bancada.sinteses[0]?.corpo.voice_settings).toEqual({
      stability: 0.3,
      similarity_boost: 0.75,
      speed: 1.1,
    })
  })

  test('sem pedido, valem os ajustes gravados na conta e depois o padrão', () => {
    const resolvidos = resolverAjustes(undefined, { stability: 0.9 })

    expect(resolvidos.estabilidade).toBe(0.9)
    expect(resolvidos.similaridade).toBe(0.75)
    expect(resolvidos.velocidade).toBe(1)
  })

  test('valor fora da faixa é aparado, não recusado', () => {
    const velocidade = AJUSTES_DE_VOZ.find((ajuste) => ajuste.nome === 'velocidade')

    const resolvidos = resolverAjustes({ velocidade: 9, estabilidade: -2 }, {})

    expect(resolvidos.velocidade).toBe(velocidade?.maximo)
    expect(resolvidos.estabilidade).toBe(0)
  })

  test('o que não é número e o que não é ajuste são ignorados', () => {
    const resolvidos = resolverAjustes({ velocidade: 'rápido', estilo: 0.4, estabilidade: '0.2' }, {})

    expect(resolvidos.velocidade).toBe(1)
    // Texto que é número passa: o corpo vem de um formulário, e `0.2` digitado
    // num campo chega como texto sem ninguém ter errado nada.
    expect(resolvidos.estabilidade).toBe(0.2)
    expect(Object.keys(resolvidos)).toEqual(['estabilidade', 'similaridade', 'velocidade'])
  })
})

describe('quem pode pedir', () => {
  const catalogo = () => criarCatalogoDeVozes({ porta: bancada().porta })

  test('método fora de GET e POST', async () => {
    const resposta = await catalogo().atender({
      metodo: 'DELETE',
      contaId: CONTA,
      autorizacao: AUTORIZACAO,
    })

    expect(resposta.status).toBe(405)
    expect(corpoDeRecusa(resposta).motivo).toBe('metodo_invalido')
  })

  test('pedido sem conta', async () => {
    const resposta = await catalogo().atender({
      metodo: 'GET',
      contaId: null,
      autorizacao: AUTORIZACAO,
    })

    expect(resposta.status).toBe(400)
    expect(corpoDeRecusa(resposta).mensagem).toBe(MENSAGENS.conta_ausente)
  })

  test('sem cabeçalho de sessão', async () => {
    const resposta = await catalogo().atender({
      metodo: 'GET',
      contaId: CONTA,
      autorizacao: null,
    })

    expect(resposta.status).toBe(401)
    expect(corpoDeRecusa(resposta).motivo).toBe('sem_sessao')
  })

  test('sessão que não vale mais', async () => {
    const catalogo = criarCatalogoDeVozes({ porta: bancada({ usuario: null }).porta })

    const resposta = await catalogo.atender({
      metodo: 'GET',
      contaId: CONTA,
      autorizacao: AUTORIZACAO,
    })

    expect(resposta.status).toBe(401)
    expect(corpoDeRecusa(resposta).motivo).toBe('sessao_invalida')
  })

  test('quem não é membro da conta', async () => {
    const catalogo = criarCatalogoDeVozes({ porta: bancada({ papel: null }).porta })

    const resposta = await catalogo.atender({
      metodo: 'GET',
      contaId: CONTA,
      autorizacao: AUTORIZACAO,
    })

    expect(resposta.status).toBe(403)
    expect(corpoDeRecusa(resposta).motivo).toBe('sem_acesso')
  })

  test('operador ouve: escolher a voz é configuração, mas ouvir é leitura', async () => {
    const { pedir } = catalogoDeTeste({ papel: 'operator' })

    expect(corpoDoCatalogo(await pedir()).estado).toBe('conectado')
  })
})

describe('a credencial não sai no corpo', () => {
  test('voz que ecoa a chave derruba o pedido inteiro', async () => {
    // É melhor não responder do que vazar: um provedor que devolvesse a chave
    // dentro de um nome de voz furaria a regra em silêncio.
    const { pedir } = catalogoDeTeste({
      lista: {
        ok: true,
        vozes: {
          voices: [
            { voice_id: 'voz-eco', name: `Helena ${CHAVE_DA_VOZ}`, labels: { accent: 'brazilian' } },
          ],
        },
      },
    })

    const resposta = await pedir()

    expect(resposta.status).toBe(500)
    expect(corpoDeRecusa(resposta).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_VOZ)
  })

  test('a chave chega ao provedor, que é para onde ela vai', async () => {
    const { pedir, bancada } = catalogoDeTeste()

    await pedir({ vozId: 'voz-brasileira' })

    expect(bancada.sinteses[0]?.credencial).toBe(CHAVE_DA_VOZ)
  })
})
