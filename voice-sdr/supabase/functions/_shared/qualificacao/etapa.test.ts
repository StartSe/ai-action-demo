import { describe, expect, test } from 'vitest'

import {
  CHAVES_CANONICAS,
  DESFECHO_PARA_ETAPA,
  resolverEtapa,
  type EtapaDoCatalogo,
} from './etapa.ts'

const PADRAO: readonly EtapaDoCatalogo[] = [
  { key: 'new', label: 'Novo', is_won: false, is_lost: false },
  { key: 'contacted', label: 'Contatado', is_won: false, is_lost: false },
  { key: 'qualified', label: 'Qualificado', is_won: false, is_lost: false },
  { key: 'meeting_booked', label: 'Reunião marcada', is_won: false, is_lost: false },
  { key: 'won', label: 'Ganho', is_won: true, is_lost: false },
  { key: 'lost', label: 'Perdido', is_won: false, is_lost: true },
]

const ENTRADAS = [...Object.keys(DESFECHO_PARA_ETAPA), ...CHAVES_CANONICAS, 'proposta', 'Qualificado']

describe('resolverEtapa', () => {
  test.each(Object.entries(DESFECHO_PARA_ETAPA))('%s vira %s', (desfecho, chave) => {
    expect(resolverEtapa(desfecho, PADRAO)).toEqual({ ok: true, stageKey: chave })
  })

  test.each(CHAVES_CANONICAS)('a chave %s passa como ela mesma', (chave) => {
    expect(resolverEtapa(chave, PADRAO)).toEqual({ ok: true, stageKey: chave })
  })

  test('renomear todos os rótulos não muda nenhuma saída (terceiro critério da F4)', () => {
    const renomeado = PADRAO.map((etapa, i) => ({ ...etapa, label: `Coluna ${i} — Tem fit` }))
    for (const entrada of ENTRADAS) {
      expect(resolverEtapa(entrada, renomeado)).toEqual(resolverEtapa(entrada, PADRAO))
    }
  })

  test('o rótulo nunca é aceito no lugar da chave', () => {
    expect(resolverEtapa('Qualificado', PADRAO)).toEqual({ ok: false, motivo: 'desfecho_desconhecido' })
    expect(resolverEtapa('Tem fit', PADRAO.map((e) => ({ ...e, label: 'Tem fit' })))).toEqual({
      ok: false,
      motivo: 'desfecho_desconhecido',
    })
  })

  test('catálogo sem a etapa alvo devolve motivo, e não cai na vizinha', () => {
    const semQualificado = PADRAO.filter((e) => e.key !== 'qualified')
    expect(resolverEtapa('qualificado', semQualificado)).toEqual({
      ok: false,
      motivo: 'etapa_ausente_no_catalogo',
    })
    expect(resolverEtapa('qualified', semQualificado)).toEqual({
      ok: false,
      motivo: 'etapa_ausente_no_catalogo',
    })
    expect(resolverEtapa('qualificado', [])).toEqual({ ok: false, motivo: 'etapa_ausente_no_catalogo' })
  })

  test('desfecho desconhecido é recusado', () => {
    for (const desfecho of ['', 'quase_qualificado', 'constructor', '__proto__', 'QUALIFIED']) {
      expect(resolverEtapa(desfecho, PADRAO)).toEqual({ ok: false, motivo: 'desfecho_desconhecido' })
    }
  })

  test('etapa própria da conta é aceita pela chave', () => {
    const comPropria = [
      ...PADRAO,
      { key: 'proposta_enviada', label: 'Proposta enviada', is_won: false, is_lost: false },
    ]
    expect(resolverEtapa('proposta_enviada', comPropria)).toEqual({ ok: true, stageKey: 'proposta_enviada' })
    expect(resolverEtapa('proposta_enviada', PADRAO)).toEqual({ ok: false, motivo: 'desfecho_desconhecido' })
  })

  test('o módulo não cita Deno nem importa da rede', async () => {
    const { readFile } = await import('node:fs/promises')
    const fonte = await readFile(new URL('./etapa.ts', import.meta.url), 'utf8')
    expect(fonte).not.toMatch(/\bDeno\./)
    expect(fonte).not.toMatch(/from ['"](https?:|npm:|jsr:)/)
  })
})
