import { atenderDiagnostico, paraTela, type DiagnosticoNaTela } from '@diagnostico/diagnostico.ts'
import { criarPortaEmMemoria, type OpcoesDaPortaEmMemoria } from '@diagnostico/porta-em-memoria.ts'

import { diagnostico as copy } from '@/copy/diagnostico'
import type { ResultadoDaDecisao, ServicoDeDiagnostico } from '@/diagnostico/tipos'

export interface RespostasDoDiagnostico {
  /** O diagnóstico já gravado quando a ficha abre. */
  readonly existente?: DiagnosticoNaTela | null
  /** A porta em memória da borda: o provedor, o modelo, o papel. */
  readonly borda?: OpcoesDaPortaEmMemoria
  /** Segura a análise sem responder, para o teste ver o estado de espera. */
  readonly analisePendente?: boolean
  /** O SQLSTATE com que o banco recusa a próxima aplicação. */
  readonly recusaAoAplicar?: string
  /** A carga que falha. */
  readonly cargaFalha?: boolean
}

export interface ServicoDeDiagnosticoDublado extends ServicoDeDiagnostico {
  readonly analises: string[]
  readonly aplicadas: { diagnosticoId: string; propostaId: string }[]
  readonly descartadas: { diagnosticoId: string; propostaId: string }[]
}

/**
 * O dublê do diagnóstico. A análise passa por `atenderDiagnostico` de verdade,
 * com a porta em memória de `@diagnostico/porta-em-memoria.ts`: o que a tela
 * mostra é o que a borda concluiria sobre a fixture da ElevenLabs, e não uma
 * resposta escrita para o teste. O que ele substitui é a rede e o banco.
 *
 * A decisão marca a proposta em memória, como o RPC marca a linha, e a carga
 * seguinte lê o estado novo.
 */
export function criarServicoDeDiagnosticoDublado(
  respostas: RespostasDoDiagnostico = {},
): ServicoDeDiagnosticoDublado {
  const analises: string[] = []
  const aplicadas: { diagnosticoId: string; propostaId: string }[] = []
  const descartadas: { diagnosticoId: string; propostaId: string }[] = []
  let atual: DiagnosticoNaTela | null = respostas.existente ?? null
  let recusaAoAplicar = respostas.recusaAoAplicar

  function marcar(propostaId: string, estado: 'aplicada' | 'descartada', versaoId: string | null) {
    if (!atual) return
    atual = {
      ...atual,
      propostas: atual.propostas.map((proposta) =>
        proposta.id === propostaId
          ? { ...proposta, estado, decididaEm: '2026-09-24T13:10:00.000Z', versaoId }
          : proposta,
      ),
    }
  }

  function decisao(diagnosticoId: string, propostaId: string): ResultadoDaDecisao | null {
    const proposta = atual?.id === diagnosticoId ? atual.propostas.find((item) => item.id === propostaId) : undefined
    if (!proposta) return { ok: false, mensagem: copy.recusas.P0002 ?? copy.falhaGenerica }
    if (proposta.estado !== 'pendente') return { ok: false, mensagem: copy.recusas['55000'] ?? copy.falhaGenerica }
    return null
  }

  return {
    analises,
    aplicadas,
    descartadas,

    async carregar() {
      if (respostas.cargaFalha) return { ok: false, mensagem: copy.falhaDaCarga }
      return { ok: true, diagnostico: atual }
    },

    async analisar(chamadaId) {
      analises.push(chamadaId)
      if (respostas.analisePendente) return new Promise(() => {})
      const memoria = criarPortaEmMemoria(respostas.borda)
      const resposta = await atenderDiagnostico(
        { metodo: 'POST', autorizacao: 'Bearer dublê', contaId: 'conta-1', chamadaId },
        memoria.porta,
      )
      if (!resposta.corpo.ok) return { ok: false, mensagem: resposta.corpo.mensagem }
      // Relido pela mesma tradução da carga, como a tela veria depois de recarregar.
      const gravado = memoria.gravados.at(-1)
      atual = gravado ? paraTela(gravado) : resposta.corpo.diagnostico
      return { ok: true, diagnostico: atual }
    },

    async aplicar(diagnosticoId, propostaId) {
      const recusa = decisao(diagnosticoId, propostaId)
      if (recusa) return recusa
      if (recusaAoAplicar) {
        const codigo = recusaAoAplicar
        recusaAoAplicar = undefined
        return { ok: false, mensagem: copy.recusas[codigo] ?? copy.falhaGenerica }
      }
      aplicadas.push({ diagnosticoId, propostaId })
      const proposta = atual?.propostas.find((item) => item.id === propostaId)
      const eRoteiro = proposta?.alvo.startsWith('roteiro.') || proposta?.alvo.startsWith('jeito_da_casa.')
      const versaoId = eRoteiro ? `v-diagnostico-${aplicadas.length}` : null
      marcar(propostaId, 'aplicada', versaoId)
      return { ok: true, versaoId, versao: eRoteiro ? 2 : null }
    },

    async descartar(diagnosticoId, propostaId) {
      const recusa = decisao(diagnosticoId, propostaId)
      if (recusa) return recusa
      descartadas.push({ diagnosticoId, propostaId })
      marcar(propostaId, 'descartada', null)
      return { ok: true, versaoId: null, versao: null }
    },
  }
}
