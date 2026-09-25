import {
  JANELA_DO_LEMBRETE_PADRAO,
  POLITICA_PADRAO,
  RESGATE_PADRAO,
  TURNOS_PADRAO,
} from '@compartilhado/automacao/padroes.ts'

import type {
  AutomacaoDaConta,
  CargaDaAutomacao,
  GravacaoDaAutomacao,
  ServicoDeAutomacao,
} from '@/automacao/tipos'

/** Os padrões das colunas, lidos do mesmo arquivo que o teste de banco compara. */
export function automacaoDeExemplo(): AutomacaoDaConta {
  return {
    lembreteInicioMinutos: JANELA_DO_LEMBRETE_PADRAO.inicioEmMinutos,
    lembreteFimMinutos: JANELA_DO_LEMBRETE_PADRAO.fimEmMinutos,
    retentativaTeto: POLITICA_PADRAO.tetoDeTentativas,
    retentativaRecuosMinutos: [...POLITICA_PADRAO.recuosEmMinutos],
    retentativaOcupadoMinutos: POLITICA_PADRAO.recuoOcupadoEmMinutos,
    turnos: TURNOS_PADRAO.map((turno) => ({ ...turno })),
    resgateTeto: RESGATE_PADRAO.tetoDeTentativas,
    resgateRecuoMinutos: RESGATE_PADRAO.recuoEmMinutos,
  }
}

export interface RespostasDeAutomacao {
  carregar?: CargaDaAutomacao | (() => Promise<CargaDaAutomacao>)
  salvar?: GravacaoDaAutomacao
}

export interface ServicoDeAutomacaoDublado extends ServicoDeAutomacao {
  readonly gravacoes: Array<{ mudancas: Partial<AutomacaoDaConta>; motivo: string }>
}

/** Guarda a automação em memória e aplica só o que veio, como o RPC. */
export function criarServicoDeAutomacaoDublado(respostas: RespostasDeAutomacao = {}): ServicoDeAutomacaoDublado {
  const gravacoes: ServicoDeAutomacaoDublado['gravacoes'] = []
  let automacao = automacaoDeExemplo()
  return {
    gravacoes,
    async carregar() {
      const resposta = respostas.carregar
      if (typeof resposta === 'function') return resposta()
      if (resposta) return resposta
      return { ok: true, automacao }
    },
    async salvar(mudancas, motivo) {
      gravacoes.push({ mudancas, motivo })
      if (respostas.salvar) return respostas.salvar
      automacao = { ...automacao, ...mudancas }
      return { ok: true, automacao }
    },
  }
}
