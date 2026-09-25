// O número é a chave natural do lead dentro da conta. Se duas escritas do mesmo
// telefone deixarem de colapsar no mesmo E.164, a duplicata passa pela
// importação e o mesmo lead recebe duas ligações; se um número bom for
// recusado, o lead some da planilha sem ninguém perceber. Por isso o teste
// cobre os dois lados: toda forma de escrever que o produto aceita, e todo
// motivo de recusa.

import { describe, expect, test } from 'vitest'

import {
  normalizarTelefone,
  type MotivoDeRecusa,
} from './telefone.ts'

/** O celular de Florianópolis que serve de referência em todo este arquivo. */
const REFERENCIA = '+5548999998888'

/**
 * Os 30 telefones malformados do primeiro critério de aceite da F1: a planilha
 * de 1.000 linhas leva exatamente estes, e a prévia precisa contar 30 erros.
 * A lista é exportada porque o teste da prévia de importação monta a planilha
 * com ela — duas listas se desencontrariam no primeiro ajuste.
 */
export function telefonesMalformadosDaF1(): readonly string[] {
  return [
    // vazio
    '',
    '   ',
    '\t\n',
    // sem_digitos
    'sem telefone',
    '(  ) -',
    'n/a',
    '+',
    // comprimento_invalido
    '4899',
    '9999-8888',
    '48 99999-88889',
    '+55 48 9',
    '5548',
    '1',
    '48999998888777',
    // ddd_invalido
    '(20) 99999-8888',
    '26 99999-8888',
    '30 3333-4444',
    '(36) 99999-8888',
    '39 3333-4444',
    '+55 52 99999-8888',
    '59 3333-4444',
    // celular_sem_nono_digito
    '48 8888-7777',
    '11 88888-7777',
    '48 9999-8888',
    '(21) 7777-6666',
    '+55 85 68888-7777',
    // pais_nao_suportado
    '+1 415 555 2671',
    '+351 912 345 678',
    '0044 20 7946 0958',
    '+54 9 11 2345-6789',
  ]
}

describe('formas de escrever o mesmo celular', () => {
  const formas = [
    '(48) 99999-8888',
    '48 99999-8888',
    '048999998888',
    '+55 48 99999-8888',
    '0055 48 999998888',
    '48999998888',
    '5548999998888',
    '+5548999998888',
    '48.99999.8888',
    '48/99999-8888',
    '  48 99999 8888  ',
    '(048) 99999-8888',
    '+55 (48) 99999-8888',
    '0 48 99999 8888',
  ]

  test.each(formas)('%j vira o mesmo E.164', (forma) => {
    const resultado = normalizarTelefone(forma)

    expect(resultado).toEqual({ ok: true, e164: REFERENCIA, ddd: '48' })
  })

  test('todas as formas colapsam num único número', () => {
    const numeros = new Set(
      formas.map((forma) => {
        const resultado = normalizarTelefone(forma)
        return resultado.ok ? resultado.e164 : `recusado:${forma}`
      }),
    )

    expect([...numeros]).toEqual([REFERENCIA])
  })
})

describe('números aceitos além da referência', () => {
  test('fixo de oito dígitos continua válido', () => {
    expect(normalizarTelefone('(11) 3333-4444')).toEqual({
      ok: true,
      e164: '+551133334444',
      ddd: '11',
    })
  })

  test('fixo com DDD pelo prefixo internacional', () => {
    expect(normalizarTelefone('0055 21 2555-1234')).toEqual({
      ok: true,
      e164: '+552125551234',
      ddd: '21',
    })
  })

  test('o DDD volta separado, para resolver cidade, estado e fuso', () => {
    const resultado = normalizarTelefone('+55 92 98888-7777')

    expect(resultado.ok && resultado.ddd).toBe('92')
  })

  test('DDD 55 não é confundido com o código do país', () => {
    expect(normalizarTelefone('(55) 99999-8888')).toEqual({
      ok: true,
      e164: '+5555999998888',
      ddd: '55',
    })
  })

  test('o menor e o maior DDD da tabela passam', () => {
    expect(normalizarTelefone('11 99999-8888').ok).toBe(true)
    expect(normalizarTelefone('99 99999-8888').ok).toBe(true)
  })
})

describe('cada motivo de recusa', () => {
  const casos: ReadonlyArray<readonly [string, string | null | undefined, MotivoDeRecusa]> = [
    ['cadeia vazia', '', 'vazio'],
    ['só espaço', '     ', 'vazio'],
    ['nulo', null, 'vazio'],
    ['indefinido', undefined, 'vazio'],
    ['texto sem número', 'ligar pelo WhatsApp', 'sem_digitos'],
    ['só pontuação', '(  ) ---/.', 'sem_digitos'],
    ['só o mais', '+', 'sem_digitos'],
    ['curto demais', '48 9999', 'comprimento_invalido'],
    ['longo demais', '48 99999-88887777', 'comprimento_invalido'],
    ['nove dígitos sem DDD', '999998888', 'comprimento_invalido'],
    ['país escrito e nada mais', '+55', 'comprimento_invalido'],
    ['DDD que nunca foi atribuído', '(20) 99999-8888', 'ddd_invalido'],
    ['DDD 52, vago desde sempre', '52 3333-4444', 'ddd_invalido'],
    ['zero da operadora descascado revela DDD vago', '05 99999-8888', 'ddd_invalido'],
    ['celular de nove dígitos começando em 8', '48 88888-7777', 'celular_sem_nono_digito'],
    ['celular antigo de oito dígitos', '48 9999-8888', 'celular_sem_nono_digito'],
    ['oito dígitos começando em 7', '21 7777-6666', 'celular_sem_nono_digito'],
    ['telefone dos Estados Unidos', '+1 415 555 2671', 'pais_nao_suportado'],
    ['telefone de Portugal', '+351 912 345 678', 'pais_nao_suportado'],
    ['internacional discado com 00', '0044 20 7946 0958', 'pais_nao_suportado'],
  ]

  test.each(casos)('%s devolve %s', (_nome, entrada, motivo) => {
    expect(normalizarTelefone(entrada)).toEqual({ ok: false, motivo })
  })

  test('país padrão diferente de BR é recusado em vez de adivinhado', () => {
    expect(normalizarTelefone('415 555 2671', { paisPadrao: 'US' })).toEqual({
      ok: false,
      motivo: 'pais_nao_suportado',
    })
  })

  test('país padrão BR explícito é o mesmo que omitir', () => {
    expect(normalizarTelefone('48 99999-8888', { paisPadrao: 'BR' })).toEqual(
      normalizarTelefone('48 99999-8888'),
    )
  })

  test('número escrito com +55 passa mesmo com outro país padrão', () => {
    const resultado = normalizarTelefone('+55 48 99999-8888', { paisPadrao: 'US' })

    expect(resultado.ok && resultado.e164).toBe(REFERENCIA)
  })
})

describe('os 30 telefones malformados da F1', () => {
  test('são trinta, sem repetição', () => {
    const lista = telefonesMalformadosDaF1()

    expect(lista).toHaveLength(30)
    expect(new Set(lista).size).toBe(30)
  })

  test('todos são recusados com motivo', () => {
    for (const telefone of telefonesMalformadosDaF1()) {
      const resultado = normalizarTelefone(telefone)

      expect(resultado.ok, `${JSON.stringify(telefone)} deveria ser recusado`).toBe(false)
      expect(resultado.ok === false && resultado.motivo).toBeTruthy()
    }
  })

  test('a lista exercita os seis motivos', () => {
    const motivos = new Set(
      telefonesMalformadosDaF1().map((telefone) => {
        const resultado = normalizarTelefone(telefone)
        return resultado.ok ? 'aceito' : resultado.motivo
      }),
    )

    expect([...motivos].sort()).toEqual([
      'celular_sem_nono_digito',
      'comprimento_invalido',
      'ddd_invalido',
      'pais_nao_suportado',
      'sem_digitos',
      'vazio',
    ])
  })
})

describe('contrato do retorno', () => {
  test('nunca devolve nulo nem número vazio', () => {
    const entradas = [...telefonesMalformadosDaF1(), '48 99999-8888', '11 3333-4444']

    for (const entrada of entradas) {
      const resultado = normalizarTelefone(entrada)

      expect(resultado).not.toBeNull()
      if (resultado.ok) {
        expect(resultado.e164).toMatch(/^\+55\d{10,11}$/)
        expect(resultado.ddd).toMatch(/^\d{2}$/)
      } else {
        expect(typeof resultado.motivo).toBe('string')
        expect(resultado.motivo).not.toBe('')
      }
    }
  })

  test('o motivo é código, nunca frase em português', () => {
    for (const telefone of telefonesMalformadosDaF1()) {
      const resultado = normalizarTelefone(telefone)

      expect(resultado.ok === false && resultado.motivo).toMatch(/^[a-z_]+$/)
    }
  })

  test('normalizar duas vezes dá o mesmo resultado', () => {
    const primeira = normalizarTelefone('(48) 99999-8888')
    expect(primeira.ok).toBe(true)

    const segunda = primeira.ok ? normalizarTelefone(primeira.e164) : primeira

    expect(segunda).toEqual(primeira)
  })
})

describe('a tabela de DDD é a mesma da resolução de fuso', () => {
  test('os 67 DDDs em uso passam pela normalização', () => {
    const recusados = []
    for (let ddd = 11; ddd <= 99; ddd += 1) {
      const resultado = normalizarTelefone(`${ddd} 99999-8888`)
      if (!resultado.ok) recusados.push(ddd)
    }

    expect(89 - recusados.length).toBe(67)
  })

  test('DDD inexistente conhecido é recusado por ddd_invalido', () => {
    for (const ddd of [20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90]) {
      expect(normalizarTelefone(`${ddd} 99999-8888`)).toEqual({
        ok: false,
        motivo: 'ddd_invalido',
      })
    }
  })
})
