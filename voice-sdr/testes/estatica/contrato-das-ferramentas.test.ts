// A suíte de contrato das ferramentas contra as funções implantadas é o portão
// de produção da seção 9.2, e roda no degrau 3. Este teste cobra o que o laço
// consegue cobrar dela: que é alcançada por `check:full`, que não é alcançada
// por `check`, que sai com zero sem a credencial e que diz no topo por quê.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const CAMINHO = 'scripts/contrato-das-ferramentas.ts'
const suite = await readFile(fileURLToPath(new URL(`../../${CAMINHO}`, import.meta.url)), 'utf8')
const pacotes = await lerPacotes()

describe('a suíte de contrato das ferramentas', () => {
  test('é passo do degrau 3', () => {
    expect(comandosAlcancados('check:full', pacotes).join(' | ')).toContain(CAMINHO)
  })

  test('não entra no laço: pede rede, credencial e funções implantadas', () => {
    expect(comandosAlcancados('check', pacotes).join(' | ')).not.toContain(CAMINHO)
  })

  test('sai com zero sem o endereço das funções, e diz por quê no topo', () => {
    expect(suite).toMatch(/SARAH_TOOLS_BASE_URL/)
    expect(suite).toMatch(/return 0/)
    expect(suite.slice(0, suite.indexOf('import '))).toMatch(/POR QUE ELA NÃO RODA NO LAÇO/)
  })

  test('cobra os casos do contrato e o prazo da publicação', () => {
    for (const status of ['401', '404', '400', '200']) {
      expect(suite, `falta o caso de ${status}`).toMatch(new RegExp(`status: ${status}\\b`))
    }
    expect(suite).toMatch(/PRAZO_DE_FERRAMENTA_SEGUNDOS/)
    expect(suite).toMatch(/data,ok,speech/)
  })
})
