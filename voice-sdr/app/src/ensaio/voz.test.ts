// A máquina de estados do modo voz e o microfone do navegador sobre uma
// `mediaDevices` dublada (US-115). jsdom não tem microfone: o que se prova
// aqui é a decisão, não a captura.

import { expect, test } from 'vitest'

import {
  avancarVoz,
  criarMicrofoneDoNavegador,
  permissaoDoErro,
  type EstadoDaVoz,
  type EventoDaVoz,
} from '@/ensaio/voz'

function percorrer(eventos: EventoDaVoz[], inicio: EstadoDaVoz | null = null) {
  const estados: (EstadoDaVoz | null)[] = []
  let atual = inicio
  for (const evento of eventos) {
    atual = avancarVoz(atual, evento)
    estados.push(atual)
  }
  return estados
}

test('o caminho feliz: pedindo permissão, ouvindo, falando, encerrado', () => {
  expect(
    percorrer([
      { tipo: 'pedir' },
      { tipo: 'permissao', resultado: 'liberado' },
      { tipo: 'conversa', estado: 'ouvindo' },
      { tipo: 'conversa', estado: 'falando' },
      { tipo: 'conversa', estado: 'ouvindo' },
      { tipo: 'encerrar' },
    ]),
  ).toEqual(['pedindo_permissao', 'conectando', 'ouvindo', 'falando', 'ouvindo', 'encerrado'])
})

test('negativa e falta de microfone são estados, e a conversa não os tira dali', () => {
  expect(percorrer([{ tipo: 'pedir' }, { tipo: 'permissao', resultado: 'negado' }])).toEqual([
    'pedindo_permissao',
    'sem_permissao',
  ])
  expect(
    percorrer([
      { tipo: 'pedir' },
      { tipo: 'permissao', resultado: 'sem_microfone' },
      { tipo: 'conversa', estado: 'ouvindo' },
      { tipo: 'encerrar' },
    ]),
  ).toEqual(['pedindo_permissao', 'sem_microfone', 'sem_microfone', 'sem_microfone'])
})

test('o microfone recusado já conectando também vira estado de tela', () => {
  expect(avancarVoz('conectando', { tipo: 'permissao', resultado: 'negado' })).toBe(
    'sem_permissao',
  )
  // Permissão fora do pedido não muda quem já está falando.
  expect(avancarVoz('falando', { tipo: 'permissao', resultado: 'negado' })).toBe('falando')
})

test('encerrado é terminal: evento atrasado do provedor não reabre o microfone', () => {
  expect(avancarVoz('encerrado', { tipo: 'conversa', estado: 'falando' })).toBe('encerrado')
  expect(avancarVoz('ouvindo', { tipo: 'conversa', estado: 'parada' })).toBe('encerrado')
  // Só um pedido novo recomeça.
  expect(avancarVoz('encerrado', { tipo: 'pedir' })).toBe('pedindo_permissao')
})

test('antes de começar, nada do provedor cria estado de voz', () => {
  expect(avancarVoz(null, { tipo: 'conversa', estado: 'ouvindo' })).toBeNull()
  expect(avancarVoz(null, { tipo: 'encerrar' })).toBeNull()
  expect(avancarVoz(null, { tipo: 'permissao', resultado: 'liberado' })).toBeNull()
})

test('o erro do navegador vira a permissão', () => {
  expect(permissaoDoErro(new DOMException('x', 'NotAllowedError'))).toBe('negado')
  expect(permissaoDoErro(new DOMException('x', 'NotFoundError'))).toBe('sem_microfone')
  expect(permissaoDoErro(new Error('rede'))).toBeNull()
  expect(permissaoDoErro('texto')).toBeNull()
})

test('o microfone do navegador solta a faixa assim que a permissão sai', async () => {
  let paradas = 0
  const faixa = { stop: () => (paradas += 1) }
  const midia = {
    getUserMedia: async () => ({ getTracks: () => [faixa] }) as unknown as MediaStream,
  }

  expect(await criarMicrofoneDoNavegador(midia).pedir()).toBe('liberado')
  expect(paradas).toBe(1)
})

test('o microfone do navegador traduz a recusa e a ausência', async () => {
  const recusa = (nome: string) => ({
    getUserMedia: async (): Promise<MediaStream> => {
      throw new DOMException('x', nome)
    },
  })

  expect(await criarMicrofoneDoNavegador(recusa('NotAllowedError')).pedir()).toBe('negado')
  expect(await criarMicrofoneDoNavegador(recusa('NotFoundError')).pedir()).toBe('sem_microfone')
  // Navegador sem `mediaDevices` (página fora de https, por exemplo).
  expect(await criarMicrofoneDoNavegador(null).pedir()).toBe('sem_microfone')
})
