// O retorno da autorização é o ponto mais exposto desta funcionalidade: ele
// chega pela barra de endereço, sem sessão, e diz qual conta ligar à telefonia
// de quem. O que se prova aqui é que nada disso se aceita pela palavra.

import { describe, expect, test } from 'vitest'

import {
  emitirEstado,
  lerEstado,
  lerRetornoDaAutorizacao,
  FRASES_DE_RECUSA,
  VALIDADE_DO_ESTADO_MS,
} from './autorizacao.ts'

const CHAVE = 'chave-do-servidor-para-teste'
const CONTA = '3b87ca29-b6cc-453d-b6b9-1b004b758767'
const USUARIO = '6d19aab1-b445-4f68-861e-bc9b8032cc1a'
const SUBCONTA = 'AC00000000000000000000000000000abc'
const AGORA = 1_790_000_000_000

describe('estado assinado', () => {
  test('o que foi emitido aqui volta legível', async () => {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)

    const leitura = await lerEstado(estado, CHAVE, AGORA + 1000)

    expect(leitura).toEqual({
      ok: true,
      estado: { contaId: CONTA, usuarioId: USUARIO, emitidoEm: AGORA },
    })
  })

  test('estado assinado com outra chave é recusado', async () => {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, 'outra', AGORA)

    await expect(lerEstado(estado, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'assinatura_invalida',
    })
  })

  test('mexer na carga sem reassinar é recusado', async () => {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)
    const [, assinatura] = estado.split('.')
    const outraConta = btoa(
      JSON.stringify({ contaId: 'conta-alheia', usuarioId: USUARIO, emitidoEm: AGORA }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await expect(lerEstado(`${outraConta}.${assinatura}`, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'assinatura_invalida',
    })
  })

  test('estado vencido é recusado', async () => {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)

    await expect(
      lerEstado(estado, CHAVE, AGORA + VALIDADE_DO_ESTADO_MS + 1),
    ).resolves.toEqual({ ok: false, motivo: 'estado_expirado' })
  })

  test('estado emitido no futuro também é recusado', async () => {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)

    await expect(lerEstado(estado, CHAVE, AGORA - 60_000)).resolves.toEqual({
      ok: false,
      motivo: 'estado_expirado',
    })
  })

  test.each([
    ['vazio', ''],
    ['só espaço', '   '],
    ['nulo', null],
  ])('estado %s é recusado por ausência', async (_caso, valor) => {
    await expect(lerEstado(valor, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'estado_ausente',
    })
  })

  test('estado sem ponto é malformado', async () => {
    await expect(lerEstado('semponto', CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'estado_malformado',
    })
  })
})

describe('retorno da autorização', () => {
  async function retorno(contaDoProvedor: string | null, quando = AGORA) {
    const estado = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)
    return lerRetornoDaAutorizacao({ estado, contaDoProvedor }, CHAVE, quando)
  }

  test('o caminho feliz devolve o que precisa ser gravado', async () => {
    await expect(retorno(SUBCONTA)).resolves.toEqual({
      ok: true,
      contaId: CONTA,
      usuarioId: USUARIO,
      contaDoProvedor: SUBCONTA,
    })
  })

  test('sem estado, o retorno não é aceito nem com subconta válida', async () => {
    await expect(
      lerRetornoDaAutorizacao({ estado: null, contaDoProvedor: SUBCONTA }, CHAVE, AGORA),
    ).resolves.toEqual({ ok: false, motivo: 'estado_ausente' })
  })

  test('subconta ausente é recusada mesmo com estado bom', async () => {
    await expect(retorno('')).resolves.toEqual({
      ok: false,
      motivo: 'conta_do_provedor_ausente',
    })
  })

  test.each([
    ['prefixo errado', 'XX0123456789abcdef0123456789abcdef'],
    ['curta demais', 'AC0123'],
    ['com caractere fora do hexadecimal', 'ACzz23456789abcdef0123456789abcdef'],
  ])('subconta %s é recusada', async (_caso, valor) => {
    await expect(retorno(valor)).resolves.toEqual({
      ok: false,
      motivo: 'conta_do_provedor_malformada',
    })
  })

  test('o estado é conferido antes da subconta', async () => {
    // Ordem importa: recusar por subconta um retorno cujo estado já é inválido
    // esconderia a tentativa de forjar a conta.
    await expect(
      lerRetornoDaAutorizacao(
        { estado: 'forjado.aqui', contaDoProvedor: SUBCONTA },
        CHAVE,
        AGORA,
      ),
    ).resolves.toEqual({ ok: false, motivo: 'assinatura_invalida' })
  })

  test('todo motivo de recusa tem frase em português', async () => {
    const motivos = Object.keys(FRASES_DE_RECUSA)

    expect(motivos).toHaveLength(6)
    for (const frase of Object.values(FRASES_DE_RECUSA)) {
      expect(frase.length).toBeGreaterThan(20)
      // Frase de bloqueio traz a saída, como manda a seção 5 do padrão.
      expect(frase).toMatch(/conect|tente|volte/i)
    }
  })
})
