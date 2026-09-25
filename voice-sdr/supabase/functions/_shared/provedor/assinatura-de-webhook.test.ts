// Provas da assinatura do webhook do provedor de voz.
//
// O que este arquivo segura:
//
// 1. **A assinatura legítima confere**, e a montada por `cabecalhoAssinado` é a
//    mesma que `conferirAssinaturaDoProvedor` recalcula — sem isso, o teste de
//    `call-init` estaria provando a si mesmo.
// 2. **Um byte a mais no corpo reprova.** É a propriedade inteira do módulo: a
//    assinatura cobre o corpo cru, e não o objeto parseado.
// 3. **O instante entra na conta.** O mesmo corpo com outro `t` reprova, e o
//    pedido antigo demais também — é o que impede a repetição tardia.
// 4. **Ausente, malformada, fora da janela e inválida saem pelo mesmo `false`.**
// 5. **Segredo vazio reprova**, em vez de assinar com chave em branco.
// 6. **O segredo anterior vale por 24 h depois da rotação, e não depois** (R-07).
//    Sem carimbo de rotação ele não vale nunca, porque valeria para sempre.

import { describe, expect, test } from 'vitest'

import {
  assinaturaDoProvedor,
  cabecalhoAssinado,
  conferirAssinaturaDoProvedor,
  JANELA_DE_ROTACAO_EM_SEGUNDOS,
  lerAssinaturaDoProvedor,
  lerInstanteDaRotacao,
  TOLERANCIA_EM_SEGUNDOS,
} from './assinatura-de-webhook.ts'

const SEGREDO = 'segredo-de-webhook-desta-instalacao'
const AGORA = 1_774_000_000
const CORPO = '{"conversation_id":"conv_1","dynamic_variables":{"call_id":"c1"}}'

async function conferir(ajustes: {
  corpo?: string
  assinatura?: string | null
  agora?: number
  segredo?: string | null
}): Promise<boolean> {
  return await conferirAssinaturaDoProvedor({
    segredo: ajustes.segredo === undefined ? SEGREDO : ajustes.segredo,
    corpo: ajustes.corpo ?? CORPO,
    assinatura:
      ajustes.assinatura === undefined ? await cabecalhoAssinado(SEGREDO, AGORA, CORPO) : ajustes.assinatura,
    agoraEmSegundos: ajustes.agora ?? AGORA,
  })
}

describe('lerAssinaturaDoProvedor', () => {
  test('lê as partes na ordem em que o provedor as escreve', () => {
    const hexadecimal = 'a'.repeat(64)
    expect(lerAssinaturaDoProvedor(`t=${AGORA},v0=${hexadecimal}`)).toEqual({
      instante: AGORA,
      valor: hexadecimal,
    })
  })

  test('não depende da ordem das partes e ignora as que não conhece', () => {
    const hexadecimal = 'b'.repeat(64)
    expect(lerAssinaturaDoProvedor(`v1=xyz, v0=${hexadecimal} , t=${AGORA}`)).toEqual({
      instante: AGORA,
      valor: hexadecimal,
    })
  })

  test('recusa o que não tem as duas partes ou tem forma errada', () => {
    expect(lerAssinaturaDoProvedor(null)).toBeNull()
    expect(lerAssinaturaDoProvedor('   ')).toBeNull()
    expect(lerAssinaturaDoProvedor(`t=${AGORA}`)).toBeNull()
    expect(lerAssinaturaDoProvedor(`v0=${'c'.repeat(64)}`)).toBeNull()
    expect(lerAssinaturaDoProvedor(`t=ontem,v0=${'c'.repeat(64)}`)).toBeNull()
    // Hexadecimal curto, maiúsculo ou com caractere de fora não é assinatura.
    expect(lerAssinaturaDoProvedor(`t=${AGORA},v0=${'c'.repeat(63)}`)).toBeNull()
    expect(lerAssinaturaDoProvedor(`t=${AGORA},v0=${'C'.repeat(64)}`)).toBeNull()
  })
})

describe('conferirAssinaturaDoProvedor', () => {
  test('a assinatura que o provedor calcularia confere', async () => {
    expect(await conferir({})).toBe(true)
  })

  test('um byte a mais no corpo reprova', async () => {
    expect(await conferir({ corpo: `${CORPO} ` })).toBe(false)
  })

  test('o mesmo corpo com outro instante reprova', async () => {
    const outra = await cabecalhoAssinado(SEGREDO, AGORA - 1, CORPO)
    // O cabeçalho diz `t=AGORA`, mas o valor foi calculado com `AGORA - 1`.
    const valor = outra.split('v0=')[1] ?? ''
    expect(await conferir({ assinatura: `t=${AGORA},v0=${valor}` })).toBe(false)
  })

  test('pedido velho demais reprova, e o da borda da janela ainda vale', async () => {
    expect(await conferir({ agora: AGORA + TOLERANCIA_EM_SEGUNDOS })).toBe(true)
    expect(await conferir({ agora: AGORA + TOLERANCIA_EM_SEGUNDOS + 1 })).toBe(false)
    // Relógio do provedor adiantado: a janela vale nos dois sentidos.
    expect(await conferir({ agora: AGORA - TOLERANCIA_EM_SEGUNDOS })).toBe(true)
    expect(await conferir({ agora: AGORA - TOLERANCIA_EM_SEGUNDOS - 1 })).toBe(false)
  })

  test('ausente, malformada e inválida saem pelo mesmo falso', async () => {
    expect(await conferir({ assinatura: null })).toBe(false)
    expect(await conferir({ assinatura: 'nem parece assinatura' })).toBe(false)
    expect(await conferir({ assinatura: `t=${AGORA},v0=${'d'.repeat(64)}` })).toBe(false)
  })

  test('segredo ausente reprova toda assinatura', async () => {
    expect(await conferir({ segredo: null })).toBe(false)
    expect(await conferir({ segredo: '   ' })).toBe(false)
  })

  test('assinar com segredo vazio levanta em vez de devolver valor', async () => {
    await expect(assinaturaDoProvedor('', AGORA, CORPO)).rejects.toThrow()
  })
})

describe('rotação do segredo (R-07)', () => {
  const ANTERIOR = 'segredo-de-antes-da-rotacao'
  const ROTACIONADO_EM = AGORA - 60 * 60

  async function comOAnterior(ajustes: {
    agora?: number
    rotacionadoEm?: number | null
    segredoAnterior?: string | null
  }): Promise<boolean> {
    const agora = ajustes.agora ?? AGORA
    return await conferirAssinaturaDoProvedor({
      segredo: SEGREDO,
      segredoAnterior: ajustes.segredoAnterior === undefined ? ANTERIOR : ajustes.segredoAnterior,
      rotacionadoEmSegundos: ajustes.rotacionadoEm === undefined ? ROTACIONADO_EM : ajustes.rotacionadoEm,
      corpo: CORPO,
      // Assinado no mesmo instante em que se confere: o que está em jogo aqui é
      // a janela da rotação, e não a tolerância de relógio.
      assinatura: await cabecalhoAssinado(ANTERIOR, agora, CORPO),
      agoraEmSegundos: agora,
    })
  }

  test('o segredo anterior confere dentro das 24 h', async () => {
    expect(await comOAnterior({})).toBe(true)
    expect(await comOAnterior({ agora: ROTACIONADO_EM + JANELA_DE_ROTACAO_EM_SEGUNDOS })).toBe(true)
  })

  test('o segredo anterior não confere depois das 24 h', async () => {
    expect(await comOAnterior({ agora: ROTACIONADO_EM + JANELA_DE_ROTACAO_EM_SEGUNDOS + 1 })).toBe(false)
  })

  test('sem carimbo de rotação, ou com carimbo no futuro, o anterior não vale', async () => {
    expect(await comOAnterior({ rotacionadoEm: null })).toBe(false)
    expect(await comOAnterior({ rotacionadoEm: AGORA + 1 })).toBe(false)
  })

  test('o atual continua valendo durante a rotação', async () => {
    expect(
      await conferirAssinaturaDoProvedor({
        segredo: SEGREDO,
        segredoAnterior: ANTERIOR,
        rotacionadoEmSegundos: ROTACIONADO_EM,
        corpo: CORPO,
        assinatura: await cabecalhoAssinado(SEGREDO, AGORA, CORPO),
        agoraEmSegundos: AGORA,
      }),
    ).toBe(true)
  })

  test('sem segredo anterior, a assinatura dele é só uma assinatura inválida', async () => {
    expect(await comOAnterior({ segredoAnterior: null })).toBe(false)
    expect(await comOAnterior({ segredoAnterior: '  ' })).toBe(false)
  })
})

describe('lerInstanteDaRotacao', () => {
  test('lê data ISO com fuso, em segundos', () => {
    expect(lerInstanteDaRotacao('2026-09-22T13:00:00Z')).toBe(Date.UTC(2026, 8, 22, 13) / 1000)
    expect(lerInstanteDaRotacao('2026-09-22T10:00:00-03:00')).toBe(Date.UTC(2026, 8, 22, 13) / 1000)
  })

  test('ausente, sem fuso ou ilegível é nulo, e nulo desliga o anterior', () => {
    expect(lerInstanteDaRotacao(null)).toBeNull()
    expect(lerInstanteDaRotacao('')).toBeNull()
    expect(lerInstanteDaRotacao('2026-09-22T13:00:00')).toBeNull()
    expect(lerInstanteDaRotacao('ontem')).toBeNull()
    expect(lerInstanteDaRotacao('2026-13-45T99:00:00Z')).toBeNull()
  })
})
