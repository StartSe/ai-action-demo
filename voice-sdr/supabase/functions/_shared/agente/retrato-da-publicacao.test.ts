import { describe, expect, test } from 'vitest'

import { lerRetrato, montarRetrato, VERSAO_DO_RETRATO } from './retrato-da-publicacao.ts'

const ENTRADA = {
  identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: ' ', nuncaAfirmar: ['desconto'] },
  playbook: { playbookVersionId: 'p-1', versao: 3, camadaDois: 'Descubra a dor.', camadaTres: '' },
  aberturaDoWhatsapp: ' Oi, {nome_do_lead}! ',
  jeitoDoWhatsapp: null,
}

describe('o retrato do que foi ao ar', () => {
  test('ida e volta pelo jsonb devolve a mesma assistente', () => {
    const retrato = montarRetrato(ENTRADA)
    expect(retrato.versao).toBe(VERSAO_DO_RETRATO)
    expect(lerRetrato(JSON.parse(JSON.stringify(retrato)))).toEqual({
      identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: null, nuncaAfirmar: ['desconto'] },
      playbook: ENTRADA.playbook,
      aberturaDoWhatsapp: 'Oi, {nome_do_lead}!',
      jeitoDoWhatsapp: null,
    })
  })

  test('sem retrato, ou com retrato torto, não há assistente publicada', () => {
    const bom = montarRetrato(ENTRADA)
    const tortos: unknown[] = [
      null,
      undefined,
      'texto',
      [],
      { ...bom, versao: 99 },
      { ...bom, identidade: { ...bom.identidade, nome: ' ' } },
      { ...bom, identidade: { ...bom.identidade, empresa: null } },
      { ...bom, roteiro: { ...bom.roteiro, playbook_version_id: '' } },
      { ...bom, roteiro: { ...bom.roteiro, versao: 'dois' } },
      { ...bom, roteiro: { ...bom.roteiro, camada_dois: null } },
      { versao: 1 },
    ]
    for (const bruto of tortos) expect(lerRetrato(bruto)).toBeNull()
  })

  test('a parte do WhatsApp ausente vale os padrões', () => {
    const semWhatsapp: Record<string, unknown> = { ...montarRetrato(ENTRADA) }
    delete semWhatsapp.whatsapp
    expect(lerRetrato(semWhatsapp)).toMatchObject({ aberturaDoWhatsapp: null, jeitoDoWhatsapp: null })
  })
})
