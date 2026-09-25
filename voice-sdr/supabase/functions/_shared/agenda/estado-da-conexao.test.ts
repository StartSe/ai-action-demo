// O `state` do OAuth do calendário é a única credencial da volta pública. O que
// se prova aqui é que nada nele se aceita pela palavra.

import { createHmac } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import { emitirEstado } from '../../telephony-connect/autorizacao.ts'

import { emitirEstadoDaConexao, lerEstadoDaConexao, VALIDADE_DO_ESTADO_MS } from './estado-da-conexao.ts'

const CHAVE = 'chave-do-servidor-para-teste'
const CONTA = '3b87ca29-b6cc-453d-b6b9-1b004b758767'
const OUTRA_CONTA = '9c1e1d0a-4f2b-4b8e-9a51-0d6f8e2c7a10'
const ESPECIALISTA = 'a4e0f3c1-2b7d-4e59-8c16-5f9a0b3d7e21'
const USUARIO = '6d19aab1-b445-4f68-861e-bc9b8032cc1a'
const AGORA = 1_790_000_000_000

function base64url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url')
}

describe('state do calendário', () => {
  test('o que foi emitido aqui volta legível', async () => {
    const estado = await emitirEstadoDaConexao(
      { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
      CHAVE,
      AGORA,
    )

    await expect(lerEstadoDaConexao(estado, CHAVE, AGORA + 1000)).resolves.toEqual({
      ok: true,
      estado: { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO, emitidoEm: AGORA },
    })
  })

  test('assinado com outra chave é recusado', async () => {
    const estado = await emitirEstadoDaConexao(
      { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
      'outra-chave-qualquer',
      AGORA,
    )

    await expect(lerEstadoDaConexao(estado, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'assinatura_invalida',
    })
  })

  test('trocar a conta na carga sem reassinar é recusado', async () => {
    const estado = await emitirEstadoDaConexao(
      { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
      CHAVE,
      AGORA,
    )
    const [, assinatura] = estado.split('.')
    const alheia = base64url(JSON.stringify({ p: 'calendario', c: OUTRA_CONTA, e: ESPECIALISTA, u: USUARIO, t: AGORA }))

    await expect(lerEstadoDaConexao(`${alheia}.${assinatura}`, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'assinatura_invalida',
    })
  })

  test('vencido e emitido no futuro são recusados', async () => {
    const estado = await emitirEstadoDaConexao(
      { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
      CHAVE,
      AGORA,
    )

    await expect(lerEstadoDaConexao(estado, CHAVE, AGORA + VALIDADE_DO_ESTADO_MS)).resolves.toMatchObject({ ok: true })
    await expect(lerEstadoDaConexao(estado, CHAVE, AGORA + VALIDADE_DO_ESTADO_MS + 1)).resolves.toEqual({
      ok: false,
      motivo: 'estado_expirado',
    })
    await expect(lerEstadoDaConexao(estado, CHAVE, AGORA - 1)).resolves.toEqual({
      ok: false,
      motivo: 'estado_expirado',
    })
  })

  test('o state da telefonia, assinado com a mesma chave, não serve aqui', async () => {
    const daTelefonia = await emitirEstado({ contaId: CONTA, usuarioId: USUARIO }, CHAVE, AGORA)

    await expect(lerEstadoDaConexao(daTelefonia, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'estado_malformado',
    })
  })

  test('carga completa com outro propósito, assinada com a mesma chave, não serve aqui', async () => {
    // Assinada com o HMAC do Node, fora do módulo: a receita não se confere
    // com ela mesma.
    const carga = base64url(JSON.stringify({ p: 'telefonia', c: CONTA, e: ESPECIALISTA, u: USUARIO, t: AGORA }))
    const assinatura = createHmac('sha256', CHAVE).update(carga).digest('base64url')

    await expect(lerEstadoDaConexao(`${carga}.${assinatura}`, CHAVE, AGORA)).resolves.toEqual({
      ok: false,
      motivo: 'estado_malformado',
    })
    const legitima = base64url(JSON.stringify({ p: 'calendario', c: CONTA, e: ESPECIALISTA, u: USUARIO, t: AGORA }))
    const assinaturaLegitima = createHmac('sha256', CHAVE).update(legitima).digest('base64url')
    await expect(lerEstadoDaConexao(`${legitima}.${assinaturaLegitima}`, CHAVE, AGORA)).resolves.toMatchObject({
      ok: true,
    })
  })

  test.each([
    [null, 'estado_ausente'],
    ['', 'estado_ausente'],
    ['sem-ponto', 'estado_malformado'],
    ['a.b.c', 'estado_malformado'],
  ] as const)('%j é recusado como %s', async (valor, motivo) => {
    await expect(lerEstadoDaConexao(valor, CHAVE, AGORA)).resolves.toEqual({ ok: false, motivo })
  })

  test('sem chave do servidor nada é emitido e nada confere', async () => {
    const estado = await emitirEstadoDaConexao(
      { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
      CHAVE,
      AGORA,
    )

    await expect(
      emitirEstadoDaConexao({ contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO }, ' ', AGORA),
    ).rejects.toThrow('chave do servidor ausente')
    await expect(lerEstadoDaConexao(estado, '', AGORA)).resolves.toEqual({ ok: false, motivo: 'assinatura_invalida' })
  })
})
