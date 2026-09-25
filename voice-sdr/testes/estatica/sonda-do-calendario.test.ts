// A prova do adaptador do Google contra o Google de verdade roda no degrau 3, e
// só com aplicativo OAuth verificado (P-04). Este teste cobra o que o laço
// consegue cobrar dela: que é alcançada por `check:full`, que não é alcançada
// por `check`, que sai com zero sem a credencial, que diz no topo por quê e que
// exercita as quatro operações da porta pelo adaptador de produção.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const CAMINHO = 'scripts/sonda-do-calendario.ts'
const sonda = await readFile(fileURLToPath(new URL(`../../${CAMINHO}`, import.meta.url)), 'utf8')
const pacotes = await lerPacotes()

describe('a sonda do calendário', () => {
  test('é passo do degrau 3', () => {
    expect(comandosAlcancados('check:full', pacotes).join(' | ')).toContain(CAMINHO)
  })

  test('não entra no laço: pede rede, credencial e aplicativo verificado', () => {
    expect(comandosAlcancados('check', pacotes).join(' | ')).not.toContain(CAMINHO)
  })

  test('sai com zero sem o token de prova, e diz por quê no topo', () => {
    expect(sonda).toMatch(/SARAH_GOOGLE_CALENDAR_REFRESH_TOKEN/)
    expect(sonda).toMatch(/return 0/)
    const topo = sonda.slice(0, sonda.indexOf('import '))
    expect(topo).toMatch(/POR QUE ELA NÃO RODA NO LAÇO/)
    expect(topo).toMatch(/P-04/)
  })

  test('usa o adaptador de produção e as quatro operações da porta', () => {
    expect(sonda).toMatch(/criarCalendarioDoGoogle/)
    for (const operacao of ['lerOcupacao', 'conferirHorario', 'criarEvento', 'apagarEvento']) {
      expect(sonda, `a sonda não exercita ${operacao}`).toContain(`porta.${operacao}(`)
    }
  })
})
