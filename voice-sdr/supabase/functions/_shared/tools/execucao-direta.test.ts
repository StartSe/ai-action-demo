import { expect, test } from 'vitest'

import { executarFerramentaDireto } from './execucao-direta.ts'
import type { ChamadaDaFerramenta, ExecutorDaFerramenta } from './esqueleto.ts'

const CHAMADA: ChamadaDaFerramenta = {
  id: '22222222-2222-4222-8222-222222222222',
  account_id: '11111111-1111-4111-8111-111111111111',
  purpose: 'discovery',
  direction: 'whatsapp',
  lead_id: null,
}

interface Escrita {
  gravar(valor: string): void
}

function rodar(executor: ExecutorDaFerramenta<Escrita, string>, entrada: Record<string, unknown> = {}, gravados: string[] = []) {
  return executarFerramentaDireto({
    executor,
    contaId: CHAMADA.account_id,
    chamada: CHAMADA,
    entrada,
    escrita: { gravar: (valor) => gravados.push(valor) },
    obrigatorios: [{ chave: 'reason', nome: 'motivo' }],
  })
}

test('a ordem é ler, memoria, efeitos, e o efeito pode trocar a resposta', async () => {
  const ordem: string[] = []
  const gravados: string[] = []
  const resultado = await rodar(
    {
      async ler() {
        ordem.push('ler')
        return { data: { a: 1 }, speech: 'lido', plano: 'x' }
      },
      async memoria(contexto) {
        ordem.push('memoria')
        contexto.escrita.gravar('memoria')
      },
      async efeitos(contexto, leitura) {
        ordem.push('efeitos')
        contexto.escrita.gravar(String(leitura.plano))
        return { ok: false, data: { b: 2 }, speech: 'trocado', erro: 'horario_ocupado' }
      },
    },
    { reason: 'teste' },
    gravados,
  )
  expect(ordem).toEqual(['ler', 'memoria', 'efeitos'])
  expect(gravados).toEqual(['memoria', 'x'])
  expect(resultado).toEqual({ ok: false, data: { b: 2 }, speech: 'trocado', erro: 'horario_ocupado' })
})

test('a leitura que escreve cai, e campo obrigatório faltando nem lê', async () => {
  const leituras: number[] = []
  const escreveNaLeitura: ExecutorDaFerramenta<Escrita, string> = {
    async ler(contexto) {
      leituras.push(1)
      contexto.escrita.gravar('proibido')
      return { data: null, speech: 'x' }
    },
  }
  expect((await rodar(escreveNaLeitura, { reason: 'x' })).erro).toMatch(/^escrita_na_leitura/)
  expect(await rodar(escreveNaLeitura, {})).toMatchObject({ ok: false, erro: 'campo_faltando: reason' })
  expect(leituras).toHaveLength(1)
})

test('fala com identificador e exceção do efeito viram falha em código', async () => {
  expect(
    (await rodar({ ler: async () => ({ data: null, speech: `sua conversa ${CHAMADA.id}` }) }, { reason: 'x' })).erro,
  ).toBe('fala_invalida')
  expect(
    (
      await rodar(
        {
          ler: async () => ({ data: null, speech: 'ok' }),
          efeitos: async () => {
            throw new Error('banco fora')
          },
        },
        { reason: 'x' },
      )
    ).erro,
  ).toBe('falha_do_efeito: banco fora')
})
