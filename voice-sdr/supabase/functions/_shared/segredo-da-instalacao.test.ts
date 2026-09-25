// O segredo interno derivado da chave de serviço.
//
// O vetor é calculado fora do repositório (`printf 'sarah/tool-server-key/v1' |
// openssl dgst -sha256 -hmac 'chave-de-servico'`): comparar a função com ela
// mesma passaria verde com rótulo e chave trocados de lugar.

import { describe, expect, test } from 'vitest'

import { ROTULO_DA_CHAVE_DE_FERRAMENTAS, segredoDaInstalacao } from './segredo-da-instalacao.ts'

const VETOR = 'a9db1d098ca8e4e0052b48495e616ae6356139c2fcc7f8ba224edb929ca089a0'

describe('segredoDaInstalacao', () => {
  test('sem variável definida, deriva da chave de serviço pelo rótulo', async () => {
    const valor = await segredoDaInstalacao({
      definido: undefined,
      chaveDeServico: 'chave-de-servico',
      rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
    })
    expect(valor).toBe(VETOR)
  })

  test('a variável definida vence a derivação', async () => {
    const valor = await segredoDaInstalacao({
      definido: ' definida-pelo-dono ',
      chaveDeServico: 'chave-de-servico',
      rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
    })
    expect(valor).toBe('definida-pelo-dono')
  })

  test('rótulos diferentes dão segredos diferentes', async () => {
    const um = await segredoDaInstalacao({ definido: '', chaveDeServico: 'k', rotulo: 'a' })
    const outro = await segredoDaInstalacao({ definido: '', chaveDeServico: 'k', rotulo: 'b' })
    expect(um).not.toBe(outro)
  })

  test('sem chave de serviço devolve vazio, que a função recusa', async () => {
    expect(
      await segredoDaInstalacao({
        definido: null,
        chaveDeServico: '  ',
        rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
      }),
    ).toBe('')
  })
})
