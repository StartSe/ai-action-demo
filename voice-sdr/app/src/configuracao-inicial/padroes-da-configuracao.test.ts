// O padrão que o assistente mostra é o padrão que o banco grava (US-253).
//
// `POLITICA_PADRAO`, `PRIVACIDADE_PADRAO`, `LIMIARES_PADRAO`, `PADRAO_DO_ESPECIALISTA` e
// `TEXTO_PADRAO_DA_CAMADA` espelham o `default` das colunas. Este teste lê o
// `default` no texto da migração e compara: mudar um lado sem o outro faz o
// assistente dizer "padrão" sobre um valor que a conta nova não tem.

import { describe, expect, it } from 'vitest'

import sqlDosLimiares from '../../../supabase/migrations/20260929100000_limiares_da_fila.sql?raw'
import sqlDaPolitica from '../../../supabase/migrations/20260921230000_politica_da_conta.sql?raw'
import sqlDosEspecialistas from '../../../supabase/migrations/20260921170000_especialistas.sql?raw'
import sqlDosPlaybooks from '../../../supabase/migrations/20260921220000_playbooks.sql?raw'

import { LIMIARES_PADRAO } from '@/conta/limiares'
import { POLITICA_PADRAO } from '@/discagem/politica'
import { PADRAO_DO_ESPECIALISTA } from '@/especialistas/regras'
import { PRIVACIDADE_PADRAO } from '@/privacidade/privacidade'
import { TEXTO_PADRAO_DA_CAMADA } from '@/sarah/playbooks'

/** O texto do `default` da coluna, até a vírgula, o fim da linha ou o `constraint`. */
function defaultDaColuna(sql: string, coluna: string): string {
  const achado = new RegExp(
    `\\b${coluna}\\s+[a-z]+(?:\\s+not null)?\\s+default\\s+('(?:[^']|'')*'(?:::[a-z]+)?|[^,\\s]+)`,
    'i',
  ).exec(sql)
  if (!achado?.[1]) throw new Error(`coluna ${coluna} sem default na migração`)
  return achado[1]
}

function numero(sql: string, coluna: string): number {
  return Number(defaultDaColuna(sql, coluna))
}

function textoOuNulo(sql: string, coluna: string): string | null {
  const bruto = defaultDaColuna(sql, coluna)
  if (bruto.toLowerCase() === 'null') return null
  return bruto.replace(/::[a-z]+$/i, '').slice(1, -1).replaceAll("''", "'")
}

describe('padrões da configuração, contra a migração', () => {
  it('a política de discagem é o default de account_settings', () => {
    const janela = JSON.parse(textoOuNulo(sqlDaPolitica, 'dialing_window') ?? 'null')

    expect(POLITICA_PADRAO).toEqual({
      janela,
      intervaloMinimoMinutos: numero(sqlDaPolitica, 'min_interval_minutes'),
      tentativasPorNumero: numero(sqlDaPolitica, 'daily_attempts_per_number'),
      tetoDiarioDeLigacoes: numero(sqlDaPolitica, 'daily_calls_cap'),
      tetoDeGastoCentavos: textoOuNulo(sqlDaPolitica, 'daily_spend_cap_cents'),
      duracaoMaximaSegundos: numero(sqlDaPolitica, 'max_duration_seconds'),
      simultaneidade: numero(sqlDaPolitica, 'max_concurrent'),
    })
  })

  it('a privacidade é o default de account_settings', () => {
    expect(PRIVACIDADE_PADRAO).toEqual({
      gravacaoLigada: defaultDaColuna(sqlDaPolitica, 'recording_enabled') === 'true',
      avisoDeGravacao: textoOuNulo(sqlDaPolitica, 'recording_notice_text'),
      retencaoDias: numero(sqlDaPolitica, 'retention_days'),
    })
  })

  it('os limiares da fila são o default de account_settings', () => {
    // O padrão que /config/conta escreve ao lado de cada campo.
    expect(LIMIARES_PADRAO).toEqual({
      pisoDeSentimento: numero(sqlDosLimiares, 'sentiment_floor'),
      tetoDeFalhas: numero(sqlDosLimiares, 'consecutive_failures_cap'),
      tetoDeCriterios: numero(sqlDosLimiares, 'failed_criteria_cap'),
      avisoDeCreditoCentavos: textoOuNulo(sqlDaPolitica, 'credit_alert_cents'),
    })
  })

  it('o especialista novo é o default de specialists', () => {
    expect(PADRAO_DO_ESPECIALISTA).toEqual({
      duracaoPadraoMin: numero(sqlDosEspecialistas, 'default_duration_min'),
      tetoDiario: numero(sqlDosEspecialistas, 'daily_cap'),
      antecedenciaMinimaMin: numero(sqlDosEspecialistas, 'min_notice_min'),
      antecedenciaMaximaDias: numero(sqlDosEspecialistas, 'max_notice_days'),
    })
  })

  it('as camadas 2 e 3 em branco são o default de playbook_versions', () => {
    expect(textoOuNulo(sqlDosPlaybooks, 'body_script')).toBe(TEXTO_PADRAO_DA_CAMADA)
    expect(textoOuNulo(sqlDosPlaybooks, 'body_house')).toBe(TEXTO_PADRAO_DA_CAMADA)
  })
})
