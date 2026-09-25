// O catálogo de números existe para duas coisas, e a segunda é a que evita
// estrago: oferecer em vez de pedir que se digite, e avisar quando o número
// escolhido já atende alguma outra coisa hoje.

import { describe, expect, test, vi } from 'vitest'

import {
  atenderCatalogo,
  temApontamento,
  FRASES,
  RecusaDoProvedor,
  type NumeroDoProvedor,
  type PortaDoCatalogo,
  type RespostaDoCatalogo,
} from './catalogo.ts'

const CONTA = '3b87ca29-b6cc-453d-b6b9-1b004b758767'
const USUARIO = '6d19aab1-b445-4f68-861e-bc9b8032cc1a'

const SEM_APONTAMENTO = {
  enderecoDeVoz: null,
  aplicativo: null,
  enderecoDeEstado: null,
}

function numero(
  e164: string,
  extras: Partial<NumeroDoProvedor> = {},
): NumeroDoProvedor {
  return {
    e164,
    rotulo: `Linha ${e164}`,
    atendeVoz: true,
    apontamento: SEM_APONTAMENTO,
    ...extras,
  }
}

function porta(sobreposicoes: Partial<PortaDoCatalogo> = {}): PortaDoCatalogo {
  return {
    usuarioDaSessao: async () => ({ id: USUARIO }),
    papelNaConta: async () => 'owner',
    credenciaisDaTelefonia: async () => ({
      identificador: 'ACxxxx',
      token: 'segredo',
    }),
    numerosDoProvedor: async () => [numero('+551150390652')],
    numerosJaCadastrados: async () => [],
    ...sobreposicoes,
  }
}

function pedido(extras: Record<string, unknown> = {}) {
  return {
    metodo: 'POST',
    contaId: CONTA,
    autorizacao: 'Bearer jwt-de-teste',
    ...extras,
  }
}

function recusa(resposta: RespostaDoCatalogo) {
  if (resposta.ok) throw new Error('esperava recusa')
  return resposta
}

function aceite(resposta: RespostaDoCatalogo) {
  if (!resposta.ok) throw new Error(`esperava aceite, veio ${resposta.motivo}`)
  return resposta
}

describe('quem pode ver', () => {
  test('o dono vê a lista', async () => {
    const r = aceite(await atenderCatalogo(pedido(), porta()))
    expect(r.numeros).toHaveLength(1)
  })

  test('o operador não vê, e a frase diz a quem pedir', async () => {
    const r = recusa(
      await atenderCatalogo(pedido(), porta({ papelNaConta: async () => 'operator' })),
    )
    expect(r.motivo).toBe('papel_insuficiente')
    expect(r.mensagem).toMatch(/administra/i)
  })

  test('quem não é da conta recebe recusa própria', async () => {
    const r = recusa(
      await atenderCatalogo(pedido(), porta({ papelNaConta: async () => null })),
    )
    expect(r.motivo).toBe('sem_acesso')
  })

  test('sem sessão não se lê conta nenhuma', async () => {
    const tocou = vi.fn()
    const r = recusa(
      await atenderCatalogo(
        pedido({ autorizacao: null }),
        porta({ papelNaConta: tocou as never }),
      ),
    )
    expect(r.motivo).toBe('sem_sessao')
    expect(tocou).not.toHaveBeenCalled()
  })
})

describe('sem telefonia configurada', () => {
  test('a recusa manda cadastrar a chave, e não fala com o provedor', async () => {
    const perguntou = vi.fn()
    const r = recusa(
      await atenderCatalogo(
        pedido(),
        porta({
          credenciaisDaTelefonia: async () => null,
          numerosDoProvedor: perguntou as never,
        }),
      ),
    )
    expect(r.motivo).toBe('telefonia_nao_configurada')
    expect(r.mensagem).toMatch(/integrações/i)
    expect(perguntou).not.toHaveBeenCalled()
  })
})

describe('o aviso de sobrescrita', () => {
  test('número que já aponta para alguma coisa avisa que será substituído', async () => {
    const r = aceite(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => [
            numero('+551150390652', {
              apontamento: {
                enderecoDeVoz: 'https://outro-produto.exemplo/atende',
                aplicativo: null,
                enderecoDeEstado: null,
              },
            }),
          ],
        }),
      ),
    )

    expect(r.numeros[0]?.sobrescreveConfiguracao).toBe(true)
    expect(r.numeros[0]?.apontamento.enderecoDeVoz).toBe(
      'https://outro-produto.exemplo/atende',
    )
  })

  test('número livre não avisa nada', async () => {
    const r = aceite(await atenderCatalogo(pedido(), porta()))
    expect(r.numeros[0]?.sobrescreveConfiguracao).toBe(false)
  })

  test('número que já é nosso não avisa: reapontar para cá não tira ninguém do ar', async () => {
    const r = aceite(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => [
            numero('+551150390652', {
              apontamento: {
                enderecoDeVoz: 'https://nosso.exemplo/inbound',
                aplicativo: null,
                enderecoDeEstado: null,
              },
            }),
          ],
          numerosJaCadastrados: async () => ['+551150390652'],
        }),
      ),
    )

    expect(r.numeros[0]?.jaCadastrado).toBe(true)
    expect(r.numeros[0]?.sobrescreveConfiguracao).toBe(false)
  })

  test('aplicativo e endereço de estado também contam como apontamento', () => {
    expect(temApontamento(SEM_APONTAMENTO)).toBe(false)
    expect(
      temApontamento({ ...SEM_APONTAMENTO, aplicativo: 'AP123' }),
    ).toBe(true)
    expect(
      temApontamento({ ...SEM_APONTAMENTO, enderecoDeEstado: 'https://x.exemplo' }),
    ).toBe(true)
  })
})

describe('a ordem da lista', () => {
  test('livre primeiro, sem voz depois, já cadastrado por último', async () => {
    const r = aceite(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => [
            numero('+5511111111111'),
            numero('+5522222222222', { atendeVoz: false }),
            numero('+5533333333333'),
          ],
          numerosJaCadastrados: async () => ['+5511111111111'],
        }),
      ),
    )

    expect(r.numeros.map((n) => n.e164)).toEqual([
      '+5533333333333', // livre e com voz
      '+5522222222222', // sem voz, mas ainda escolhível
      '+5511111111111', // já cadastrado
    ])
  })

  test('número sem voz continua na lista, marcado', async () => {
    // Sumir com ele é pior: quem procura o próprio número e não o acha conclui
    // que a chave está errada.
    const r = aceite(
      await atenderCatalogo(
        pedido(),
        porta({ numerosDoProvedor: async () => [numero('+55111', { atendeVoz: false })] }),
      ),
    )
    expect(r.numeros).toHaveLength(1)
    expect(r.numeros[0]?.atendeVoz).toBe(false)
  })
})

describe('falha do provedor', () => {
  test('tempo esgotado vira indisponível, não erro de chave', async () => {
    const estourou = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    const r = recusa(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => {
            throw estourou
          },
        }),
      ),
    )
    expect(r.motivo).toBe('provedor_indisponivel')
  })

  test('recusa do provedor manda conferir a chave', async () => {
    const r = recusa(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => {
            throw new RecusaDoProvedor('provedor_recusou')
          },
        }),
      ),
    )
    expect(r.motivo).toBe('provedor_recusou')
    expect(r.mensagem).toMatch(/chave/i)
  })

  test('erro desconhecido não vaza para a tela', async () => {
    const r = recusa(
      await atenderCatalogo(
        pedido(),
        porta({
          numerosDoProvedor: async () => {
            throw new Error('ECONNRESET na linha 42 do socket interno')
          },
        }),
      ),
    )
    expect(r.motivo).toBe('falha_interna')
    expect(JSON.stringify(r)).not.toMatch(/ECONNRESET|socket/i)
  })
})

test('todo motivo tem frase, e nenhuma frase carrega o código', () => {
  for (const [motivo, frase] of Object.entries(FRASES)) {
    expect(frase.length).toBeGreaterThan(15)
    expect(frase).not.toContain(motivo)
  }
})
