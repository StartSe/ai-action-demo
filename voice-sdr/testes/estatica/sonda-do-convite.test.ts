// A prova do convite contra o Resend de verdade roda no degrau 3, e só com a
// chave e o domínio de envio verificado (O-03). Este teste cobra o que o laço
// consegue cobrar dela: que é alcançada por `check:full`, que não é alcançada
// por `check`, que sai com zero sem a chave, que diz no topo por quê e que usa
// o adaptador e o convite de produção.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const CAMINHO = 'scripts/sonda-do-convite.ts'
const sonda = await readFile(fileURLToPath(new URL(`../../${CAMINHO}`, import.meta.url)), 'utf8')
const pacotes = await lerPacotes()

describe('a sonda do convite', () => {
  test('é passo do degrau 3', () => {
    expect(comandosAlcancados('check:full', pacotes).join(' | ')).toContain(CAMINHO)
  })

  test('não entra no laço: pede rede, chave e domínio verificado', () => {
    expect(comandosAlcancados('check', pacotes).join(' | ')).not.toContain(CAMINHO)
  })

  test('sai com zero sem a chave, e diz por quê no topo', () => {
    expect(sonda).toMatch(/SARAH_RESEND_API_KEY/)
    expect(sonda).toMatch(/return 0/)
    const topo = sonda.slice(0, sonda.indexOf('import '))
    expect(topo).toMatch(/POR QUE ELA NÃO RODA NO LAÇO/)
    expect(topo).toMatch(/O-03/)
  })

  test('usa o adaptador de produção, o convite de produção e a mesma chave de idempotência duas vezes', () => {
    expect(sonda).toMatch(/criarEmailDoResend\(/)
    expect(sonda).toMatch(/montarConvite\(/)
    expect(sonda.match(/porta\.enviar\(mensagem\)/g)).toHaveLength(2)
  })
})
