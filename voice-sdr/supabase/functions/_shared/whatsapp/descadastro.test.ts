import { expect, test } from 'vitest'

import { ePedidoDeDescadastro } from './descadastro.ts'

test.each([
  'parar',
  'PARAR',
  'Sair.',
  'stop',
  'Não quero',
  'não quero mais!',
  'Descadastrar',
  'por favor me descadastra',
  'Não quero mais receber mensagem de vocês',
  'para de me mandar isso',
  'me tira da lista',
  'Me remova da sua lista, obrigado',
  'não me mandem mais nada',
])('"%s" é pedido de descadastro', (texto) => {
  expect(ePedidoDeDescadastro(texto)).toBe(true)
})

test.each([
  'Oi, quero saber o preço',
  'quero sair da planilha e usar um sistema',
  'Não quero agora, talvez mês que vem',
  'para quando seria?',
  '',
  null,
])('"%s" não é', (texto) => {
  expect(ePedidoDeDescadastro(texto)).toBe(false)
})
