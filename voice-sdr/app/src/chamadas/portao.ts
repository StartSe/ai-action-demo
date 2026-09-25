// O portão da fatia no discador (US-074, L-03): enquanto ele estiver fechado,
// o discador só oferece número de teste da conta.
//
// Quem recusa de verdade é `guard_dial`, no passo 2, e esta regra não o
// substitui: a tela que a ignorasse continuaria sem conseguir ligar para lead
// real, porque a recusa é do sistema. O que ela evita é oferecer um número que
// vai ser recusado e deixar a pessoa descobrir isso depois do clique. O que
// falta para abrir vem de `@compartilhado/discagem/portao.ts`, a mesma regra que
// a borda usa para montar a frase da recusa.

import {
  faltaParaAbrir,
  type EstadoDoPortao,
  type FaltaNoPortao,
} from '@compartilhado/discagem/portao.ts'
import { normalizarTelefone } from '@compartilhado/telefone.ts'

/** O que a conta guarda sobre o portão, mais a lista de teste dela. */
export interface ContaNoPortao extends EstadoDoPortao {
  /** `account_test_numbers.phone_e164` da conta. */
  readonly numerosDeTeste: readonly string[]
}

export type DecisaoDoPortao =
  | {
      readonly ok: true
      readonly telefone: string
      /** Passou porque o portão está aberto, ou porque é número de teste. */
      readonly porque: 'portao_aberto' | 'numero_de_teste'
    }
  | { readonly ok: false; readonly motivo: 'telefone_invalido' }
  | {
      readonly ok: false
      readonly motivo: 'portao_fechado'
      /** O que falta para o portão abrir, para a tela dizer por quê. */
      readonly falta: readonly FaltaNoPortao[]
    }

/**
 * Se o discador pode oferecer este número. O número e a lista de teste passam
 * pela mesma normalização da borda, senão `(11) 99999-0001` escrito na tela
 * não casaria com `+5511999990001` gravado na lista.
 */
export function podeDiscarPara(numero: string, conta: ContaNoPortao): DecisaoDoPortao {
  const telefone = normalizarTelefone(numero)
  if (!telefone.ok) return { ok: false, motivo: 'telefone_invalido' }

  const falta = faltaParaAbrir(conta)
  if (falta.length === 0) return { ok: true, telefone: telefone.e164, porque: 'portao_aberto' }

  const deTeste = conta.numerosDeTeste.some((deTeste) => {
    const normalizado = normalizarTelefone(deTeste)
    return normalizado.ok && normalizado.e164 === telefone.e164
  })
  if (deTeste) return { ok: true, telefone: telefone.e164, porque: 'numero_de_teste' }

  return { ok: false, motivo: 'portao_fechado', falta }
}
