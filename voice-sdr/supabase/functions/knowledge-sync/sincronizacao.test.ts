// Provas da sincronização da base de conhecimento. Ambiente node, sem rede e
// sem banco: o provedor e a camada de dados são dublados, e a tabela em memória
// do dublê aplica o que os RPCs aplicariam, para a segunda passagem ler o que a
// primeira gravou.
//
// O que este arquivo segura:
//
// 1. **Duas passagens seguidas: a segunda não envia, não atualiza e não
//    remove.** O dublê conta as idas ao provedor por operação; asserção sobre o
//    estado final passaria verde com uma versão que reenvia tudo.
// 2. **Falha por entrada.** A entrada que o provedor recusa sai com erro e
//    motivo, e as outras seguem indexadas.
// 3. **`indexed_at` só depois do 2xx.** O dublê empilha a ordem dos passos, e
//    a marcação nunca aparece antes do envio nem depois de uma recusa.
// 4. **Remoção que falha não apaga a linha.** A entrada fica marcada, com o
//    motivo, e a passagem seguinte tenta de novo.
// 5. **As quatro publicações recebem a lista inteira**, e a que não existe lá
//    fora é dita, não pulada em silêncio.

import { describe, expect, test } from 'vitest'

import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import { MENSAGENS, MENSAGENS_DA_ENTRADA } from './respostas.ts'
import {
  atenderSincronizacao,
  documentoDaEntrada,
  hashDoDocumento,
  TAMANHO_MAXIMO_DO_NOME,
  type CorpoDaSincronizacao,
  type CorpoDeRecusa,
  type EntradaDaBase,
  type EventoDeIntegracao,
  type PedidoDeAnexo,
  type PedidoDeEnvio,
  type PedidoDeRemocao,
  type PortaDaSincronizacao,
  type PublicacaoDaConta,
  type RespostaDaSincronizacao,
  type RespostaDoEnvio,
} from './sincronizacao.ts'

const CONTA = 'conta-Aurora-7f3e'
const USUARIO = 'usuario-Admin-91cd'
const AUTORIZACAO = 'Bearer jwt-de-quem-sincroniza'
const CHAVE_DA_VOZ = 'chave-do-provedor-de-voz-que-nao-pode-sair'

interface LinhaEmMemoria {
  id: string
  question: string
  answer: string
  provider_doc_id: string | null
  indexed_hash: string | null
  indexed_at: string | null
  sync_error: string | null
  removed_at: string | null
}

interface AjustesDaBancada {
  readonly papel?: string | null
  readonly usuario?: { readonly id: string } | null
  readonly credencial?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  readonly publicacoes?: readonly PublicacaoDaConta[]
  readonly envio?: (pedido: PedidoDeEnvio) => RespostaDoEnvio | undefined
  readonly remocao?: (pedido: PedidoDeRemocao) => EnvelopeDoProvedor | undefined
  readonly anexo?: (pedido: PedidoDeAnexo) => EnvelopeDoProvedor | undefined
  /** Roda dentro de `enviarDocumento`, depois de o documento nascer. */
  readonly duranteOEnvio?: (pedido: PedidoDeEnvio, linhas: Map<string, LinhaEmMemoria>) => void
  readonly marcacaoFalha?: boolean
  readonly apagarFalha?: boolean
  readonly eventoFalha?: boolean
}

interface Bancada {
  readonly porta: PortaDaSincronizacao
  readonly linhas: Map<string, LinhaEmMemoria>
  readonly envios: PedidoDeEnvio[]
  readonly remocoes: PedidoDeRemocao[]
  readonly anexos: PedidoDeAnexo[]
  readonly eventos: EventoDeIntegracao[]
  /** A ordem dos passos, com a entrada: `enviar:e1`, `marcarIndexada:e1`. */
  readonly passos: string[]
  /** Os documentos que existem no provedor agora. */
  readonly noProvedor: Set<string>
}

function publicadas(): PublicacaoDaConta[] {
  return PROPOSITOS.map((proposito) => ({ purpose: proposito, provider_agent_id: `agente-${proposito}` }))
}

function bancada(entradas: readonly Partial<LinhaEmMemoria>[], ajustes: AjustesDaBancada = {}): Bancada {
  const linhas = new Map<string, LinhaEmMemoria>()
  for (const [indice, entrada] of entradas.entries()) {
    const id = entrada.id ?? `e${indice + 1}`
    linhas.set(id, {
      id,
      question: `Pergunta ${id}?`,
      answer: `Resposta ${id}.`,
      provider_doc_id: null,
      indexed_hash: null,
      indexed_at: null,
      sync_error: null,
      removed_at: null,
      ...entrada,
    })
  }

  const envios: PedidoDeEnvio[] = []
  const remocoes: PedidoDeRemocao[] = []
  const anexos: PedidoDeAnexo[] = []
  const eventos: EventoDeIntegracao[] = []
  const passos: string[] = []
  const noProvedor = new Set<string>(
    [...linhas.values()].map((linha) => linha.provider_doc_id).filter((id): id is string => id !== null),
  )
  let sequencia = 0

  const porta: PortaDaSincronizacao = {
    async usuarioDaSessao() {
      return ajustes.usuario === undefined ? { id: USUARIO } : ajustes.usuario
    },
    async papelNaConta() {
      return ajustes.papel === undefined ? 'admin' : ajustes.papel
    },
    async credencial() {
      if (ajustes.credencial === 'ausente') return { ok: false, motivo: 'ausente' }
      if (ajustes.credencial === 'plataforma_bloqueada') return { ok: false, motivo: 'plataforma_bloqueada' }
      return { ok: true, valor: CHAVE_DA_VOZ, origem: 'conta' }
    },
    async entradasDaConta() {
      return [...linhas.values()].map((linha): EntradaDaBase => ({
        id: linha.id,
        question: linha.question,
        answer: linha.answer,
        provider_doc_id: linha.provider_doc_id,
        indexed_hash: linha.indexed_hash,
        removed_at: linha.removed_at,
      }))
    },
    async publicacoesDaConta() {
      return ajustes.publicacoes ?? publicadas()
    },
    async enviarDocumento(pedido) {
      envios.push(pedido)
      passos.push(`enviar:${pedido.entradaId}`)
      const resposta = ajustes.envio?.(pedido) ?? {
        ok: true,
        status: 200,
        documentoId: `doc-${++sequencia}`,
        endpoint: 'convai/knowledge-base/text',
      }
      if (resposta.ok && resposta.documentoId) noProvedor.add(resposta.documentoId)
      ajustes.duranteOEnvio?.(pedido, linhas)
      return resposta
    },
    async removerDocumento(pedido) {
      remocoes.push(pedido)
      passos.push(`remover:${pedido.documentoId}`)
      const resposta = ajustes.remocao?.(pedido) ?? { ok: true, status: 200 }
      if (resposta.ok) noProvedor.delete(pedido.documentoId)
      return resposta
    },
    async anexarDocumentos(pedido) {
      anexos.push(pedido)
      passos.push(`anexar:${pedido.proposito}`)
      return ajustes.anexo?.(pedido) ?? { ok: true, status: 200 }
    },
    async marcarIndexada(entradaId, documentoId, hash) {
      passos.push(`marcarIndexada:${entradaId}`)
      if (ajustes.marcacaoFalha) throw new Error('escrita recusada')
      const linha = linhas.get(entradaId)
      if (!linha) return false
      linha.provider_doc_id = documentoId
      linha.indexed_hash = hash
      linha.indexed_at = '2026-09-23T12:00:00.000Z'
      linha.sync_error = null
      return true
    },
    async marcarDesindexada(entradaId) {
      passos.push(`marcarDesindexada:${entradaId}`)
      const linha = linhas.get(entradaId)
      if (!linha) return false
      linha.provider_doc_id = null
      linha.indexed_hash = null
      linha.indexed_at = null
      linha.sync_error = null
      return true
    },
    async marcarErro(entradaId, motivo) {
      passos.push(`marcarErro:${entradaId}`)
      const linha = linhas.get(entradaId)
      if (!linha) return false
      linha.sync_error = motivo
      return true
    },
    async apagarEntrada(entradaId) {
      passos.push(`apagar:${entradaId}`)
      if (ajustes.apagarFalha) throw new Error('exclusão recusada')
      const linha = linhas.get(entradaId)
      if (!linha || linha.removed_at === null) return false
      linhas.delete(entradaId)
      return true
    },
    async registrarEventoDeIntegracao(evento) {
      if (ajustes.eventoFalha) throw new Error('registro recusado')
      eventos.push(evento)
    },
  }

  return { porta, linhas, envios, remocoes, anexos, eventos, passos, noProvedor }
}

function sincronizar(
  banca: Bancada,
  pedido: Partial<{ metodo: string; contaId: unknown; autorizacao: string | null }> = {},
): Promise<RespostaDaSincronizacao> {
  return atenderSincronizacao(
    {
      metodo: pedido.metodo ?? 'POST',
      contaId: 'contaId' in pedido ? pedido.contaId : CONTA,
      autorizacao: 'autorizacao' in pedido ? (pedido.autorizacao ?? null) : AUTORIZACAO,
    },
    banca.porta,
  )
}

function relatorio(resposta: RespostaDaSincronizacao): CorpoDaSincronizacao {
  if (!resposta.corpo.ok) throw new Error(`esperava relatório, veio ${resposta.corpo.motivo}`)
  return resposta.corpo
}

function recusa(resposta: RespostaDaSincronizacao): CorpoDeRecusa {
  if (resposta.corpo.ok) throw new Error('esperava recusa, veio relatório')
  return resposta.corpo
}

function contagem(banca: Bancada) {
  return { envios: banca.envios.length, remocoes: banca.remocoes.length, anexos: banca.anexos.length }
}

function zerar(banca: Bancada): void {
  banca.envios.length = 0
  banca.remocoes.length = 0
  banca.anexos.length = 0
  banca.eventos.length = 0
  banca.passos.length = 0
}

const RECUSADO: RespostaDoEnvio = { ok: false, status: 401, codigo: 'invalid_api_key' }
const FORA_DO_AR: EnvelopeDoProvedor = { ok: false, status: 503, codigo: 'service_unavailable' }

// Envio ------------------------------------------------------------------------

describe('envio', () => {
  test('as entradas sem documento vão ao provedor e voltam indexadas', async () => {
    const banca = bancada([{}, {}, {}])

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.enviadas).toBe(3)
    expect(corpo.erros).toBe(0)
    expect(banca.envios.map((pedido) => pedido.entradaId)).toEqual(['e1', 'e2', 'e3'])
    for (const linha of banca.linhas.values()) {
      expect(linha.provider_doc_id).toMatch(/^doc-/)
      expect(linha.indexed_at).not.toBeNull()
      expect(linha.indexed_hash).toBe(await hashDoDocumento(documentoDaEntrada(linha)))
    }
  })

  test('o documento leva pergunta e resposta, e o nome é a pergunta encurtada', async () => {
    const pergunta = `Vocês entregam em Manaus ${'e em outras capitais '.repeat(10)}?`
    const banca = bancada([{ question: pergunta, answer: 'Sim, em até cinco dias úteis.' }])

    await sincronizar(banca)

    const documento = banca.envios[0]?.documento
    expect(documento?.texto).toContain(pergunta.trim())
    expect(documento?.texto).toContain('Sim, em até cinco dias úteis.')
    expect(documento?.nome.length).toBe(TAMANHO_MAXIMO_DO_NOME)
    expect(documento?.nome.endsWith('…')).toBe(true)
  })

  test('o hash cobre o documento, não as etiquetas: só pergunta e resposta o mudam', async () => {
    const base = await hashDoDocumento(documentoDaEntrada({ question: 'P?', answer: 'R.' }))
    expect(await hashDoDocumento(documentoDaEntrada({ question: 'P?', answer: 'R.' }))).toBe(base)
    expect(await hashDoDocumento(documentoDaEntrada({ question: 'P?', answer: 'R!' }))).not.toBe(base)
    expect(await hashDoDocumento(documentoDaEntrada({ question: 'P!', answer: 'R.' }))).not.toBe(base)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
  })

  test('cada envio vira evento de integração com a entrada na correlação', async () => {
    const banca = bancada([{}, {}])

    await sincronizar(banca)

    const envios = banca.eventos.filter((evento) => evento.request.operacao === 'enviar')
    expect(envios.map((evento) => evento.correlation_id)).toEqual(['e1', 'e2'])
    for (const evento of envios) {
      expect(evento).toMatchObject({ account_id: CONTA, direction: 'outbound', provider: 'voz', status_code: 200 })
    }
    // O conteúdo da entrada não entra em tabela de observabilidade: só tamanhos.
    expect(JSON.stringify(banca.eventos)).not.toContain('Resposta e1.')
  })
})

// indexed_at só depois do 2xx ------------------------------------------------------

describe('a marca de indexada', () => {
  test('vem depois do envio, nunca antes', async () => {
    const banca = bancada([{}])

    await sincronizar(banca)

    expect(banca.passos.slice(0, 2)).toEqual(['enviar:e1', 'marcarIndexada:e1'])
  })

  test('não é gravada quando o provedor recusa', async () => {
    const banca = bancada([{}], { envio: () => RECUSADO })

    const corpo = relatorio(await sincronizar(banca))

    expect(banca.passos).not.toContain('marcarIndexada:e1')
    expect(banca.linhas.get('e1')?.indexed_at).toBeNull()
    expect(corpo.entradas[0]).toEqual({
      entradaId: 'e1',
      estado: 'erro',
      motivo: 'envio_recusado',
      mensagem: MENSAGENS_DA_ENTRADA.envio_recusado,
    })
    expect(banca.linhas.get('e1')?.sync_error).toBe('envio_recusado')
  })

  test('não é gravada com 2xx sem identificador de documento', async () => {
    const banca = bancada([{}], { envio: () => ({ ok: true, status: 200, documentoId: '  ' }) })

    const corpo = relatorio(await sincronizar(banca))

    expect(banca.passos).not.toContain('marcarIndexada:e1')
    expect(corpo.entradas[0]?.estado).toBe('erro')
  })

  test('provedor fora do ar é indisponível, não recusa', async () => {
    const banca = bancada([{}], { envio: () => FORA_DO_AR })

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]?.motivo).toBe('envio_indisponivel')
  })

  test('marcação que falha tira de volta o documento recém-criado', async () => {
    const banca = bancada([{}], { marcacaoFalha: true })

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]?.motivo).toBe('falha_ao_gravar')
    expect(banca.passos.slice(0, 3)).toEqual(['enviar:e1', 'marcarIndexada:e1', 'remover:doc-1'])
    // Nada fica lá fora sem ponteiro aqui.
    expect(banca.noProvedor.size).toBe(0)
  })
})

// Falha por entrada ------------------------------------------------------------------

describe('falha por entrada', () => {
  test('a entrada recusada no meio de vinte não trava as outras', async () => {
    const banca = bancada(
      Array.from({ length: 20 }, (_, indice) => ({ id: `e${indice + 1}` })),
      { envio: (pedido) => (pedido.entradaId === 'e7' ? RECUSADO : undefined) },
    )

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.enviadas).toBe(19)
    expect(corpo.erros).toBe(1)
    const comErro = corpo.entradas.filter((entrada) => entrada.estado === 'erro')
    expect(comErro.map((entrada) => entrada.entradaId)).toEqual(['e7'])
    expect(banca.linhas.get('e8')?.provider_doc_id).not.toBeNull()
    // Os desfechos somam as entradas, como qualquer relatório de lote.
    expect(corpo.enviadas + corpo.atualizadas + corpo.removidas + corpo.inalteradas + corpo.erros).toBe(20)
  })

  test('a entrada que falhou vai de novo na passagem seguinte, e só ela', async () => {
    let recusar = true
    const banca = bancada([{}, {}], {
      envio: (pedido) => (pedido.entradaId === 'e2' && recusar ? RECUSADO : undefined),
    })

    await sincronizar(banca)
    recusar = false
    zerar(banca)
    const corpo = relatorio(await sincronizar(banca))

    expect(banca.envios.map((pedido) => pedido.entradaId)).toEqual(['e2'])
    expect(corpo.entradas.map((entrada) => entrada.estado)).toEqual(['inalterada', 'enviada'])
    expect(banca.linhas.get('e2')?.sync_error).toBeNull()
  })
})

// Idempotência -------------------------------------------------------------------------

describe('idempotência', () => {
  test('a segunda passagem seguida não envia, não atualiza e não remove nada', async () => {
    const banca = bancada([{}, {}, {}, { removed_at: '2026-09-23T10:00:00Z' }])

    await sincronizar(banca)
    const documentosDaPrimeira = [...banca.noProvedor]
    const anexoDaPrimeira = banca.anexos.at(-1)?.documentos
    zerar(banca)

    const corpo = relatorio(await sincronizar(banca))

    // A contagem é a prova: um laço que reenviasse tudo terminaria no mesmo
    // estado final e passaria em qualquer asserção sobre ele.
    expect(contagem(banca)).toEqual({ envios: 0, remocoes: 0, anexos: 4 })
    expect(corpo.inalteradas).toBe(3)
    expect(corpo.enviadas + corpo.atualizadas + corpo.removidas + corpo.erros).toBe(0)
    expect([...banca.noProvedor]).toEqual(documentosDaPrimeira)
    // O anexo vai de novo, com a mesma lista: substituir pelo mesmo é nada.
    expect(banca.anexos.at(-1)?.documentos).toEqual(anexoDaPrimeira)
    // E nenhuma marca é regravada.
    expect(banca.passos.filter((passo) => passo.startsWith('marcar'))).toEqual([])
  })

  test('mudar só a etiqueta não reenvia: o documento é o mesmo', async () => {
    const banca = bancada([{}])
    await sincronizar(banca)
    zerar(banca)

    // A etiqueta não está na linha que a porta lê, e é esse o ponto: o hash
    // cobre o que vai ao provedor.
    await sincronizar(banca)

    expect(contagem(banca).envios).toBe(0)
  })
})

// Atualização ----------------------------------------------------------------------------

describe('atualização', () => {
  test('a entrada que mudou depois de indexada sai e volta com documento novo', async () => {
    const banca = bancada([{}, {}])
    await sincronizar(banca)
    const antigo = banca.linhas.get('e1')?.provider_doc_id
    banca.linhas.get('e1')!.answer = 'Resposta corrigida.'
    zerar(banca)

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas.map((entrada) => entrada.estado)).toEqual(['atualizada', 'inalterada'])
    // Remove o antigo antes de criar o novo: na falha da remoção, nada nasce
    // lá fora sem ponteiro aqui.
    expect(banca.passos.slice(0, 4)).toEqual([
      `remover:${antigo}`,
      'marcarDesindexada:e1',
      'enviar:e1',
      'marcarIndexada:e1',
    ])
    expect(banca.envios[0]?.documento.texto).toContain('Resposta corrigida.')
    expect(banca.linhas.get('e1')?.provider_doc_id).not.toBe(antigo)
    expect(banca.noProvedor.has(antigo!)).toBe(false)
  })

  test('remoção do antigo que falha mantém o documento antigo e não envia o novo', async () => {
    const banca = bancada([{}])
    await sincronizar(banca)
    const antigo = banca.linhas.get('e1')!.provider_doc_id!
    banca.linhas.get('e1')!.answer = 'Resposta corrigida.'
    zerar(banca)

    const falhando = bancadaComRemocao(banca, () => FORA_DO_AR)
    const corpo = relatorio(await sincronizar(falhando))

    expect(corpo.entradas[0]?.motivo).toBe('remocao_indisponivel')
    expect(falhando.envios).toEqual([])
    expect(banca.linhas.get('e1')?.provider_doc_id).toBe(antigo)
    // A Sarah continua lendo a versão anterior, e o anexo diz isso.
    expect(falhando.anexos[0]?.documentos.map((documento) => documento.id)).toEqual([antigo])
  })
})

/** A mesma tabela em memória, com o provedor respondendo outra coisa na remoção. */
function bancadaComRemocao(
  origem: Bancada,
  remocao: (pedido: PedidoDeRemocao) => EnvelopeDoProvedor,
): Bancada {
  const nova = bancada([], { remocao })
  for (const [id, linha] of origem.linhas) nova.linhas.set(id, linha)
  for (const documento of origem.noProvedor) nova.noProvedor.add(documento)
  return nova
}

// Remoção ----------------------------------------------------------------------------------

describe('remoção', () => {
  test('a entrada marcada sai no provedor e depois aqui, na mesma passagem', async () => {
    const banca = bancada([{}, {}])
    await sincronizar(banca)
    const documento = banca.linhas.get('e1')!.provider_doc_id!
    banca.linhas.get('e1')!.removed_at = '2026-09-23T11:00:00Z'
    zerar(banca)

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]).toMatchObject({ entradaId: 'e1', estado: 'removida' })
    expect(banca.passos.slice(0, 2)).toEqual([`remover:${documento}`, 'apagar:e1'])
    expect(banca.linhas.has('e1')).toBe(false)
    expect(banca.noProvedor.has(documento)).toBe(false)
    // E o documento removido não vai no anexo.
    for (const anexo of banca.anexos) {
      expect(anexo.documentos.map((item) => item.id)).not.toContain(documento)
    }
  })

  test('remoção remota que falha deixa a linha marcada, com o motivo', async () => {
    const banca = bancada(
      [{ provider_doc_id: 'doc-antigo', indexed_hash: 'a'.repeat(64), removed_at: '2026-09-23T11:00:00Z' }],
      { remocao: () => ({ ok: false, status: 401, codigo: 'invalid_api_key' }) },
    )

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]).toEqual({
      entradaId: 'e1',
      estado: 'erro',
      motivo: 'remocao_recusada',
      mensagem: MENSAGENS_DA_ENTRADA.remocao_recusada,
    })
    expect(banca.passos).not.toContain('apagar:e1')
    expect(banca.linhas.get('e1')?.removed_at).not.toBeNull()
    expect(banca.linhas.get('e1')?.sync_error).toBe('remocao_recusada')
    // Enquanto o documento está lá, a Sarah o lê, e o anexo não mente sobre isso.
    expect(banca.anexos[0]?.documentos.map((item) => item.id)).toEqual(['doc-antigo'])
  })

  test('404 na remoção conta como removido: o provedor já não tem o documento', async () => {
    const banca = bancada(
      [{ provider_doc_id: 'doc-sumido', indexed_hash: 'a'.repeat(64), removed_at: '2026-09-23T11:00:00Z' }],
      { remocao: () => ({ ok: false, status: 404, codigo: 'document_not_found' }) },
    )

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]?.estado).toBe('removida')
    expect(banca.linhas.has('e1')).toBe(false)
  })

  test('entrada marcada que nunca foi enviada sai sem ir ao provedor', async () => {
    const banca = bancada([{ removed_at: '2026-09-23T11:00:00Z' }])

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.removidas).toBe(1)
    expect(banca.remocoes).toEqual([])
  })

  test('exclusão da linha que falha depois do 2xx se refaz na passagem seguinte', async () => {
    const banca = bancada(
      [{ provider_doc_id: 'doc-antigo', indexed_hash: 'a'.repeat(64), removed_at: '2026-09-23T11:00:00Z' }],
      { apagarFalha: true },
    )

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]?.motivo).toBe('falha_ao_gravar')
    expect(banca.linhas.has('e1')).toBe(true)
  })

  test('marca desfeita enquanto o documento saía volta a entrada a pendente', async () => {
    const banca = bancada(
      [{ provider_doc_id: 'doc-antigo', indexed_hash: 'a'.repeat(64), removed_at: '2026-09-23T11:00:00Z' }],
      {
        remocao: () => {
          banca.linhas.get('e1')!.removed_at = null
          return { ok: true, status: 200 }
        },
      },
    )

    await sincronizar(banca)

    // A linha fica, e não aponta mais para o documento que saiu.
    expect(banca.linhas.get('e1')?.provider_doc_id).toBeNull()
    zerar(banca)
    await sincronizar(banca)
    expect(banca.envios.map((pedido) => pedido.entradaId)).toEqual(['e1'])
  })

  test('entrada apagada no meio do envio tem o documento novo removido de volta', async () => {
    const banca = bancada([{}], {
      duranteOEnvio: (pedido, linhas) => {
        linhas.delete(pedido.entradaId)
      },
    })

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.entradas[0]?.estado).toBe('removida')
    expect(banca.noProvedor.size).toBe(0)
  })
})

// As quatro publicações ---------------------------------------------------------------------

describe('as quatro publicações', () => {
  test('cada propósito publicado recebe a lista inteira dos documentos vigentes', async () => {
    const banca = bancada([{}, {}, {}])

    const corpo = relatorio(await sincronizar(banca))

    expect(banca.anexos.map((anexo) => anexo.proposito)).toEqual([...PROPOSITOS])
    const vigentes = [...banca.linhas.values()].map((linha) => linha.provider_doc_id)
    for (const anexo of banca.anexos) {
      expect(anexo.providerAgentId).toBe(`agente-${anexo.proposito}`)
      expect(anexo.documentos.map((documento) => documento.id)).toEqual(vigentes)
    }
    expect(corpo.publicacoes.map((publicacao) => publicacao.estado)).toEqual([
      'anexada',
      'anexada',
      'anexada',
      'anexada',
    ])
    expect(corpo.publicacoes.every((publicacao) => publicacao.documentos === 3)).toBe(true)
  })

  test('remover a última entrada anexa a lista vazia, em vez de pular o anexo', async () => {
    const banca = bancada([{ provider_doc_id: 'doc-1', indexed_hash: 'a'.repeat(64), removed_at: '2026-09-23T11:00:00Z' }])

    await sincronizar(banca)

    expect(banca.anexos.map((anexo) => anexo.documentos)).toEqual([[], [], [], []])
  })

  test('o anexo vem depois de todas as entradas', async () => {
    const banca = bancada([{}, {}])

    await sincronizar(banca)

    const primeiroAnexo = banca.passos.findIndex((passo) => passo.startsWith('anexar:'))
    const ultimoEnvio = banca.passos.map((passo) => passo.startsWith('enviar:')).lastIndexOf(true)
    expect(primeiroAnexo).toBeGreaterThan(ultimoEnvio)
  })

  test('o propósito sem agente lá fora é dito, e não vai ao provedor', async () => {
    const banca = bancada([{}], {
      publicacoes: [
        { purpose: 'discovery', provider_agent_id: 'agente-discovery' },
        { purpose: 'reminder', provider_agent_id: null },
      ],
    })

    const corpo = relatorio(await sincronizar(banca))

    expect(banca.anexos.map((anexo) => anexo.proposito)).toEqual(['discovery'])
    const estados = Object.fromEntries(corpo.publicacoes.map((item) => [item.proposito, item.estado]))
    expect(estados).toEqual({
      discovery: 'anexada',
      reminder: 'sem_publicacao',
      rescue: 'sem_publicacao',
      followup: 'sem_publicacao',
    } satisfies Record<Proposito, string>)
  })

  test('anexo recusado num propósito não impede os outros', async () => {
    const banca = bancada([{}], {
      anexo: (pedido) => (pedido.proposito === 'rescue' ? FORA_DO_AR : undefined),
    })

    const corpo = relatorio(await sincronizar(banca))

    expect(banca.anexos).toHaveLength(4)
    const rescue = corpo.publicacoes.find((item) => item.proposito === 'rescue')
    expect(rescue).toMatchObject({ estado: 'erro', motivo: 'anexo_indisponivel' })
    expect(corpo.publicacoes.filter((item) => item.estado === 'anexada')).toHaveLength(3)
  })

  test('cada anexo vira evento de integração', async () => {
    const banca = bancada([{}])

    await sincronizar(banca)

    const anexos = banca.eventos.filter((evento) => evento.request.operacao === 'anexar')
    expect(anexos.map((evento) => evento.request.purpose)).toEqual([...PROPOSITOS])
    expect(anexos.every((evento) => evento.correlation_id === null)).toBe(true)
  })
})

// Registro ---------------------------------------------------------------------------------

describe('registro', () => {
  test('toda ida ao provedor vira uma linha de integration_events', async () => {
    const banca = bancada([{}, { removed_at: '2026-09-23T11:00:00Z', provider_doc_id: 'd', indexed_hash: 'a'.repeat(64) }])

    await sincronizar(banca)

    expect(banca.eventos).toHaveLength(banca.envios.length + banca.remocoes.length + banca.anexos.length)
  })

  test('registro que falha não desfaz a sincronização, e o corpo conta', async () => {
    const banca = bancada([{}], { eventoFalha: true })

    const corpo = relatorio(await sincronizar(banca))

    expect(corpo.enviadas).toBe(1)
    expect(corpo.semRegistro).toBe(5)
  })
})

// Portão -------------------------------------------------------------------------------------

describe('portão', () => {
  test.each([
    ['metodo_invalido', { metodo: 'GET' }],
    ['conta_ausente', { contaId: '  ' }],
    ['sem_sessao', { autorizacao: null }],
  ] as const)('%s antes de qualquer leitura', async (motivo, pedido) => {
    const banca = bancada([{}])

    const resposta = await sincronizar(banca, pedido)

    expect(recusa(resposta).motivo).toBe(motivo)
    expect(banca.passos).toEqual([])
  })

  test('sessão vencida é 401', async () => {
    const resposta = await sincronizar(bancada([{}], { usuario: null }))
    expect(resposta.status).toBe(401)
    expect(recusa(resposta).motivo).toBe('sessao_invalida')
  })

  test('quem não é membro recebe 403 sem acesso', async () => {
    const resposta = await sincronizar(bancada([{}], { papel: null }))
    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('sem_acesso')
  })

  test('operador recebe a negativa com a frase de quem concede, e nada vai ao provedor', async () => {
    const banca = bancada([{}], { papel: 'operator' })

    const resposta = await sincronizar(banca)

    expect(resposta.status).toBe(403)
    expect(recusa(resposta)).toEqual({
      ok: false,
      motivo: 'papel_insuficiente',
      mensagem: MENSAGENS.papel_insuficiente,
    })
    expect(contagem(banca)).toEqual({ envios: 0, remocoes: 0, anexos: 0 })
  })

  test.each(['owner', 'admin'])('%s sincroniza', async (papel) => {
    const resposta = await sincronizar(bancada([{}], { papel }))
    expect(resposta.status).toBe(200)
  })

  test('sem credencial de voz é 409 com o caminho de Integrações', async () => {
    const resposta = await sincronizar(bancada([{}], { credencial: 'ausente' }))
    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('sem_credencial_de_voz')
  })

  test('credencial da plataforma bloqueada tem motivo próprio', async () => {
    const resposta = await sincronizar(bancada([{}], { credencial: 'plataforma_bloqueada' }))
    expect(recusa(resposta).motivo).toBe('credencial_da_plataforma_bloqueada')
  })

  test('a chave do provedor chega ao pedido e nunca à resposta', async () => {
    const banca = bancada([{}, { removed_at: '2026-09-23T11:00:00Z', provider_doc_id: 'd', indexed_hash: 'a'.repeat(64) }])

    const resposta = await sincronizar(banca)

    expect(banca.envios[0]?.credencial).toBe(CHAVE_DA_VOZ)
    expect(banca.remocoes[0]?.credencial).toBe(CHAVE_DA_VOZ)
    expect(banca.anexos[0]?.credencial).toBe(CHAVE_DA_VOZ)
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_VOZ)
    // Nem no registro de integração, que é tabela lida por quem opera.
    expect(JSON.stringify(banca.eventos)).not.toContain(CHAVE_DA_VOZ)
  })

  test('código bruto do provedor não sai no corpo', async () => {
    const banca = bancada([{}], { envio: () => RECUSADO })

    const resposta = await sincronizar(banca)

    expect(JSON.stringify(resposta.corpo)).not.toContain('invalid_api_key')
  })
})
