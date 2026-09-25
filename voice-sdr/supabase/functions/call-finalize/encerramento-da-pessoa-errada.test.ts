import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  CRITERIO_DO_ENCERRAMENTO,
  FALA_DA_SARAH,
  LIMITE_DE_FALAS_NA_PESSOA_ERRADA,
  divergenciaGravada,
  medirEncerramentoDaPessoaErrada,
} from './encerramento-da-pessoa-errada.ts'
import { ENCERRAMENTOS_DE_EXEMPLO } from './encerramentos-de-exemplo.ts'
import { ADAPTADORES_DE_CONVERSA, lerConversa, type ConversaDoProvedor } from './formato-do-provedor.ts'
import { TRANSCRICOES_DE_EXEMPLO } from './transcricoes-de-exemplo.ts'

function ler(corpo: unknown, formato: string): ConversaDoProvedor {
  const conversa = lerConversa(corpo, formato)
  if (!conversa) throw new Error('fixture ilegível')
  return conversa
}

describe('os cinco casos do critério', () => {
  test.each(ENCERRAMENTOS_DE_EXEMPLO.map((exemplo) => [exemplo.nome, exemplo] as const))('%s', (_nome, exemplo) => {
    expect(medirEncerramentoDaPessoaErrada(ler(exemplo.corpo, exemplo.formato), FALA_DA_SARAH)).toEqual(
      exemplo.esperado,
    )
  })

  test('cada fixture declara um formato que tem adaptador', () => {
    for (const exemplo of ENCERRAMENTOS_DE_EXEMPLO) {
      expect({ nome: exemplo.nome, temAdaptador: ADAPTADORES_DE_CONVERSA.has(exemplo.formato) }).toEqual({
        nome: exemplo.nome,
        temAdaptador: true,
      })
    }
  })

  test('as fixtures cobrem os dois lados do limite, e o caso sem end_call e o sem wrong_number', () => {
    const medidas = ENCERRAMENTOS_DE_EXEMPLO.map((exemplo) => exemplo.esperado)
    const aplicadas = medidas.flatMap((m) => (m.aplica ? [m] : []))
    expect(aplicadas.some((m) => m.falas === LIMITE_DE_FALAS_NA_PESSOA_ERRADA && m.conforme)).toBe(true)
    expect(aplicadas.some((m) => m.falas === LIMITE_DE_FALAS_NA_PESSOA_ERRADA + 1 && !m.conforme)).toBe(true)
    expect(aplicadas.some((m) => !m.encerrouComEndCall)).toBe(true)
    expect(medidas.some((m) => !m.aplica)).toBe(true)
  })
})

describe('a régua', () => {
  const base = ENCERRAMENTOS_DE_EXEMPLO.find((exemplo) => exemplo.nome === 'encerrou na fala seguinte')!

  test('o que conta como fala da Sarah vem do parâmetro', () => {
    const conversa = ler(base.corpo, base.formato)
    // Contando também o interlocutor, o "Tudo bem." entra e a conta passa do limite.
    const qualquerTurno = medirEncerramentoDaPessoaErrada(conversa, () => true)
    expect(qualquerTurno).toMatchObject({ aplica: true, falas: 3, conforme: false })
    expect(medirEncerramentoDaPessoaErrada(conversa, FALA_DA_SARAH)).toMatchObject({ falas: 2, conforme: true })
  })

  test('end_call que voltou com erro não encerrou', () => {
    const conversa = ler(base.corpo, base.formato)
    const comErro: ConversaDoProvedor = {
      ...conversa,
      invocacoes: conversa.invocacoes.map((invocacao) =>
        invocacao.nome === 'end_call' ? { ...invocacao, erro: 'ocupado' } : invocacao,
      ),
    }
    expect(medirEncerramentoDaPessoaErrada(comErro, FALA_DA_SARAH)).toMatchObject({
      aplica: true,
      encerrouComEndCall: false,
    })
  })

  test('a pessoa errada de transcricoes-de-exemplo, com tool-dnc e end_call no mesmo turno, é uma fala', () => {
    const exemplo = TRANSCRICOES_DE_EXEMPLO.find((t) => t.nome.startsWith('pessoa errada'))!
    expect(medirEncerramentoDaPessoaErrada(ler(exemplo.corpo, exemplo.formato), FALA_DA_SARAH)).toEqual({
      aplica: true,
      falas: 1,
      conforme: true,
      encerrouComEndCall: true,
    })
  })

  test('nenhuma outra transcrição de exemplo se aplica', () => {
    const outras = TRANSCRICOES_DE_EXEMPLO.filter((t) => !t.nome.startsWith('pessoa errada'))
    for (const exemplo of outras) {
      expect({ nome: exemplo.nome, ...medirEncerramentoDaPessoaErrada(ler(exemplo.corpo, exemplo.formato), FALA_DA_SARAH) })
        .toEqual({ nome: exemplo.nome, aplica: false })
    }
  })
})

describe('o que se grava', () => {
  test('a divergência leva o número medido, o limite e o requisito', () => {
    expect(CRITERIO_DO_ENCERRAMENTO).toBe('encerramento_pessoa_errada')
    expect(divergenciaGravada({ aplica: true, falas: 3, conforme: false, encerrouComEndCall: false })).toEqual({
      conforme: false,
      falas: 3,
      limite: LIMITE_DE_FALAS_NA_PESSOA_ERRADA,
      encerrou_com_end_call: false,
      requisito: 'RF-422',
    })
  })
})

describe('o fonte do módulo', () => {
  const fonte = readFileSync(new URL('./encerramento-da-pessoa-errada.ts', import.meta.url), 'utf8')
  const codigo = fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/'[^'\n]*'/g, "''")

  test('o limite é um número só, na constante ao lado de RF-422', () => {
    // Zero é "nenhum", não régua; qualquer outro número fora da constante é uma
    // segunda cópia do limite.
    const numeros = (codigo.match(/(?<![\w.])\d+(?![\w.])/g) ?? []).filter((n) => n !== '0')
    expect(numeros).toEqual(['2'])
    const posicao = fonte.indexOf('export const LIMITE_DE_FALAS_NA_PESSOA_ERRADA = 2\n')
    expect(posicao).toBeGreaterThan(0)
    expect(fonte.slice(Math.max(0, posicao - 250), posicao)).toContain('RF-422')
  })

  test('não cita o formato do provedor', () => {
    expect(codigo).not.toMatch(/time_in_call_secs|tool_calls|tool_results|params_as_json|'user'|role/)
  })
})
