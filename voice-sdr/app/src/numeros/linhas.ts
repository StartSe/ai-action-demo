// As decisões da tela de números, puras e testadas à parte.
//
// Duas delas são o motivo do arquivo:
//
// 1. **Encaminhar sem destino é recusado aqui e no banco.** O check
//    `phone_lines_encaminhamento_com_destino` já recusa, mas a recusa do banco
//    chega como falha genérica depois de a pessoa enviar. A tela recusa antes,
//    no campo, dizendo o que falta: comportamento que aponta para lugar nenhum
//    é a configuração morta que o PRD proíbe.
// 2. **Saúde sem medida não é zero.** `health` nasce `{}` e fica assim até
//    `cron-line-health` (F7) medir cinquenta tentativas. Mostrar "0%" de
//    atendimento para uma linha que nunca discou diz que ela está queimada; a
//    leitura só vira número quando o retrato tem o que medir.

import {
  normalizarTelefone,
  type MotivoDeRecusa,
} from '@compartilhado/telefone.ts'

import type {
  ComportamentoDeEntrada,
  DadosDoCadastro,
  LinhaTelefonica,
} from '@/numeros/tipos'

/** Os campos do formulário, como a pessoa escreveu. */
export interface CamposDoCadastro {
  numero: string
  rotulo: string
  comportamento: ComportamentoDeEntrada
  destino: string
}

export const CADASTRO_EM_BRANCO: CamposDoCadastro = {
  numero: '',
  rotulo: '',
  comportamento: 'agent',
  destino: '',
}

export type RecusaDoCampo = MotivoDeRecusa | 'destino_obrigatorio'

export interface RecusasDoCadastro {
  numero?: MotivoDeRecusa
  rotulo?: 'vazio'
  destino?: RecusaDoCampo
}

export type CadastroValidado =
  | { ok: true; dados: DadosDoCadastro }
  | { ok: false; recusas: RecusasDoCadastro }

/**
 * Normaliza o número e o destino por `@compartilhado/telefone.ts`, a mesma
 * régua do lead: é este número que vai no `from` da chamada, e o check da
 * coluna é o mesmo de `leads.phone_e164`.
 */
export function validarCadastro(campos: CamposDoCadastro): CadastroValidado {
  const recusas: RecusasDoCadastro = {}

  const numero = normalizarTelefone(campos.numero)
  if (!numero.ok) recusas.numero = numero.motivo

  const rotulo = campos.rotulo.trim()
  if (rotulo === '') recusas.rotulo = 'vazio'

  let encaminharPara: string | null = null
  if (campos.comportamento === 'forward') {
    if (campos.destino.trim() === '') {
      recusas.destino = 'destino_obrigatorio'
    } else {
      const destino = normalizarTelefone(campos.destino)
      if (destino.ok) encaminharPara = destino.e164
      else recusas.destino = destino.motivo
    }
  }

  if (!numero.ok || Object.keys(recusas).length > 0) {
    return { ok: false, recusas }
  }

  return {
    ok: true,
    dados: {
      e164: numero.e164,
      rotulo,
      comportamento: campos.comportamento,
      encaminharPara,
    },
  }
}

/**
 * Tentativas que a janela de `cron-line-health` exige antes de a taxa dizer
 * alguma coisa (R-04; a rotina está na tabela de rotinas do PRD de
 * implementação).
 */
export const TENTATIVAS_PARA_MEDIR = 50

export type LeituraDaSaude =
  | { medida: false }
  | { medida: true; taxaDeAtendimento: number; tentativas: number }

/**
 * Lê o retrato de `health`. O formato é o que `cron-line-health` vai
 * escrever na F7 (`answer_rate` entre 0 e 1, `attempts` inteiro); tudo que não
 * casar com ele, inclusive o `{}` de nascença, é "ainda sem histórico". Na
 * dúvida a tela cala, porque um número inventado aqui é pior do que nenhum.
 */
export function leituraDaSaude(saude: unknown): LeituraDaSaude {
  if (typeof saude !== 'object' || saude === null || Array.isArray(saude)) {
    return { medida: false }
  }

  const { answer_rate: taxa, attempts: tentativas } = saude as Record<
    string,
    unknown
  >

  if (
    typeof taxa !== 'number' ||
    !Number.isFinite(taxa) ||
    taxa < 0 ||
    taxa > 1 ||
    typeof tentativas !== 'number' ||
    !Number.isInteger(tentativas) ||
    tentativas < TENTATIVAS_PARA_MEDIR
  ) {
    return { medida: false }
  }

  return { medida: true, taxaDeAtendimento: taxa, tentativas }
}

/** O selo do cartão. */
export type EstadoDaLinha = 'ativa' | 'aguardando_operadora' | 'desligada'

/**
 * Desligada vence tudo: é ato de gente e diz por que a linha não disca nem
 * atende. Fora isso, número sem registro no provedor é o que espera a
 * operadora, e é estado normal (P-04), não erro.
 */
export function estadoDaLinha(linha: LinhaTelefonica): EstadoDaLinha {
  if (!linha.ligada) return 'desligada'
  if (!linha.registradaNoProvedor) return 'aguardando_operadora'
  return 'ativa'
}
