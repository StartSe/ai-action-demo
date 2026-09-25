import { aplicarRecorte, preverImportacao, remocaoDoBloqueio } from '@/bloqueios/lista'
import type {
  Bloqueio,
  CargaDosBloqueios,
  EscritaDoBloqueio,
  InclusaoDeBloqueio,
  OrigemDoBloqueio,
  RecorteDeBloqueios,
  ResultadoDaImportacao,
  ResultadoDaPrevia,
  ServicoDeBloqueios,
} from '@/bloqueios/tipos'

export interface RespostasDeBloqueios {
  /** Quando presente, o dublê devolve isto e ignora a lista em memória. */
  carregar?: CargaDosBloqueios
  bloqueios?: Bloqueio[]
  /** Recusa a escrita, para provar a frase de cada motivo. */
  incluir?: EscritaDoBloqueio
  remover?: EscritaDoBloqueio
  /** Quem a sessão é, para o dublê carimbar a autoria como o gatilho faz. */
  usuarioId?: string
}

export interface ServicoDeBloqueiosDublado extends ServicoDeBloqueios {
  /** Todo recorte pedido, na ordem: prova o filtro que a tela mandou. */
  readonly recortes: RecorteDeBloqueios[]
  readonly inclusoes: InclusaoDeBloqueio[]
  readonly previas: string[]
  readonly importacoes: { texto: string; motivo: string }[]
  readonly remocoes: { id: string; motivo: string }[]
  /** A lista inteira em memória, ativos e removidos. */
  readonly linhas: Bloqueio[]
}

let sequencia = 0

export function bloqueioDeExemplo(extras: Partial<Bloqueio> = {}): Bloqueio {
  sequencia += 1
  return {
    id: `b-${sequencia}`,
    e164: '+5548999998888',
    motivo: 'Pediu por e-mail para não receber ligação',
    origem: 'manual',
    observacao: null,
    incluidoPor: 'u-1',
    incluidoEm: new Date(Date.now() - 86_400_000).toISOString(),
    removidoEm: null,
    removidoPor: null,
    motivoDaRemocao: null,
    ...extras,
  }
}

function novo(
  e164: string,
  motivo: string,
  origem: OrigemDoBloqueio,
  usuarioId: string,
): Bloqueio {
  return bloqueioDeExemplo({
    e164,
    motivo,
    origem,
    incluidoPor: usuarioId,
    incluidoEm: new Date().toISOString(),
  })
}

/**
 * Dublê da lista de bloqueio. Guarda as linhas em memória e decide com os
 * mesmos módulos que o serviço usa: o recorte por `aplicarRecorte`, a prévia
 * por `preverImportacao` e a remoção pelas colunas de `remocaoDoBloqueio`. Recusa
 * o segundo bloqueio ativo do mesmo número, como o único parcial do banco. O
 * dublê substitui a rede, não a decisão.
 */
export function criarServicoDeBloqueiosDublado(
  respostas: RespostasDeBloqueios = {},
): ServicoDeBloqueiosDublado {
  const recortes: RecorteDeBloqueios[] = []
  const inclusoes: InclusaoDeBloqueio[] = []
  const previas: string[] = []
  const importacoes: { texto: string; motivo: string }[] = []
  const remocoes: { id: string; motivo: string }[] = []
  const linhas: Bloqueio[] = [...(respostas.bloqueios ?? [])]
  const usuarioId = respostas.usuarioId ?? 'u-1'

  function ativos(): string[] {
    return linhas.filter((linha) => linha.removidoEm === null).map((linha) => linha.e164)
  }

  return {
    recortes,
    inclusoes,
    previas,
    importacoes,
    remocoes,
    linhas,

    carregar(recorte): Promise<CargaDosBloqueios> {
      recortes.push(recorte)
      if (respostas.carregar) return Promise.resolve(respostas.carregar)
      return Promise.resolve({
        ok: true,
        bloqueios: aplicarRecorte(linhas, recorte),
        haBloqueios: linhas.length > 0,
      })
    },

    incluir(inclusao): Promise<EscritaDoBloqueio> {
      inclusoes.push(inclusao)
      if (respostas.incluir) return Promise.resolve(respostas.incluir)
      if (!/^\+[1-9][0-9]{7,14}$/.test(inclusao.e164)) {
        return Promise.resolve({ ok: false, motivo: 'valor-recusado' })
      }
      if (ativos().includes(inclusao.e164)) {
        return Promise.resolve({ ok: false, motivo: 'ja-bloqueado' })
      }
      linhas.unshift(novo(inclusao.e164, inclusao.motivo, 'manual', usuarioId))
      return Promise.resolve({ ok: true })
    },

    preverImportacao(texto): Promise<ResultadoDaPrevia> {
      previas.push(texto)
      return Promise.resolve({ ok: true, previa: preverImportacao(texto, ativos()) })
    },

    importar(texto, motivo): Promise<ResultadoDaImportacao> {
      importacoes.push({ texto, motivo })
      const previa = preverImportacao(texto, ativos())
      for (const e164 of previa.validos) {
        linhas.unshift(novo(e164, motivo.trim(), 'import', usuarioId))
      }
      return Promise.resolve({ ok: true, gravados: previa.validos.length, previa })
    },

    remover(id, motivo): Promise<EscritaDoBloqueio> {
      remocoes.push({ id, motivo })
      if (respostas.remover) return Promise.resolve(respostas.remover)

      const linha = linhas.find((item) => item.id === id && item.removidoEm === null)
      if (!linha) return Promise.resolve({ ok: false, motivo: 'sem-permissao' })

      const colunas = remocaoDoBloqueio(motivo, new Date())
      linha.removidoEm = colunas.removed_at
      linha.motivoDaRemocao = colunas.removal_reason
      linha.removidoPor = usuarioId
      return Promise.resolve({ ok: true })
    },
  }
}
