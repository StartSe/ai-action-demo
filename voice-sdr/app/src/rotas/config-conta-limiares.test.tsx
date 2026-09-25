// /config/conta: os limiares da fila (US-150). A tela grava configuração e não
// decide nada sobre a fila; o que se cobra aqui é o que ela manda ao serviço,
// o que ela recusa antes de mandar e o que ela diz de cada limiar.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CAMPOS_DOS_LIMIARES, LIMIARES_PADRAO, type LimiaresDaFila } from '@/conta/limiares'
import { configConta } from '@/copy/config-conta'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDaContaDublado,
  type RespostasDaConta,
} from '@/testes/servico-da-conta-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = configConta.limiares

afterEach(cleanup)

/** A equipe de exemplo com uma administradora além de quem olha. */
function equipeCom(papel: Papel): Equipe {
  const equipe = equipeDeExemplo(papel)
  return {
    ...equipe,
    membros: [
      ...equipe.membros,
      {
        usuarioId: 'u-3',
        nome: 'Lia Prado',
        email: 'lia@aurora.com.br',
        papel: 'admin',
        ultimoAcesso: null,
      },
    ],
  }
}

async function abrir(papel: Papel, respostas: RespostasDaConta = {}) {
  const conta = criarServicoDaContaDublado({ papel, ...respostas })
  await montarAplicacao(
    criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'renata@aurora.com.br' } }),
    '/config/conta',
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeCom(papel) } }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    conta,
  )
  const secao = within(await screen.findByRole('region', { name: copy.rotulo }))
  if (!respostas.limiaresPendentes) {
    await waitFor(() => expect(secao.queryByText(copy.carregando)).toBeNull())
  }
  return { conta, secao }
}

function grupo(secao: ReturnType<typeof within>, rotulo: string) {
  return within(secao.getByRole('group', { name: rotulo }))
}

function campo(secao: ReturnType<typeof within>, rotulo: string): HTMLInputElement {
  // O grupo tem o mesmo nome: o campo se acha pelo papel.
  return secao.getByRole('textbox', { name: rotulo }) as HTMLInputElement
}

function botao(secao: ReturnType<typeof within>): HTMLButtonElement {
  return secao.getByRole('button', { name: copy.salvar }) as HTMLButtonElement
}

describe('limiares da fila em /config/conta', () => {
  it('cada limiar mostra o padrão, o valor em uso e o que ele dispara', async () => {
    const gravados: LimiaresDaFila = {
      pisoDeSentimento: -0.3,
      tetoDeFalhas: 4,
      tetoDeCriterios: 2,
      avisoDeCreditoCentavos: 5000,
    }
    const { secao } = await abrir('admin', { limiares: gravados })

    // O `R$` do Intl vem com espaço não quebrável: a asserção usa `\s`.
    const esperado: Record<string, { padrao: string; atual: string | RegExp; campo: string }> = {
      pisoDeSentimento: { padrao: '-0,50', atual: '-0,30', campo: '-0,3' },
      tetoDeFalhas: { padrao: '3', atual: '4', campo: '4' },
      tetoDeCriterios: { padrao: '1', atual: '2', campo: '2' },
      avisoDeCreditoCentavos: { padrao: copy.semAviso, atual: /^Em uso: R\$\s50,00$/, campo: '50' },
    }
    for (const chave of CAMPOS_DOS_LIMIARES) {
      const { rotulo, dispara } = copy.campos[chave]
      const dentro = grupo(secao, rotulo)
      expect({ chave, padrao: dentro.getByText(copy.padrao(esperado[chave]!.padrao)).textContent }).toEqual({
        chave,
        padrao: copy.padrao(esperado[chave]!.padrao),
      })
      const atual = esperado[chave]!.atual
      expect(dentro.getByText(typeof atual === 'string' ? copy.atual(atual) : atual)).toBeDefined()
      expect(dentro.getByText(dispara)).toBeDefined()
      expect({ chave, valor: campo(dentro, rotulo).value }).toEqual({ chave, valor: esperado[chave]!.campo })
    }
  })

  it('diz que a mudança vale para as chamadas seguintes e não reescreve a fila', async () => {
    const { secao } = await abrir('admin')
    expect(secao.getByText(copy.vigencia)).toBeDefined()
    expect(copy.vigencia).toMatch(/chamadas seguintes/)
    expect(copy.vigencia).toMatch(/já estão na fila continuam/)
  })

  it('baixar e subir o piso de sentimento manda o valor novo ao serviço, nas duas vezes', async () => {
    const { conta, secao } = await abrir('admin')
    const piso = campo(secao, copy.campos.pisoDeSentimento.rotulo)

    fireEvent.change(piso, { target: { value: '-0,8' } })
    fireEvent.click(botao(secao))
    await waitFor(() => expect(conta.pedidosDeLimiares).toHaveLength(1))
    expect(conta.pedidosDeLimiares[0]).toEqual({ ...LIMIARES_PADRAO, pisoDeSentimento: -0.8 })
    expect(await secao.findByText(copy.salvo)).toBeDefined()
    expect(grupo(secao, copy.campos.pisoDeSentimento.rotulo).getByText(copy.atual('-0,80'))).toBeDefined()

    fireEvent.change(piso, { target: { value: '-0,2' } })
    fireEvent.click(botao(secao))
    await waitFor(() => expect(conta.pedidosDeLimiares).toHaveLength(2))
    expect(conta.pedidosDeLimiares[1]).toEqual({ ...LIMIARES_PADRAO, pisoDeSentimento: -0.2 })
    await waitFor(() =>
      expect(grupo(secao, copy.campos.pisoDeSentimento.rotulo).getByText(copy.atual('-0,20'))).toBeDefined(),
    )

    // A trilha é do gatilho de auditoria: duas trocas, cada uma com o antes.
    expect(conta.trilhaDosLimiares.map((troca) => troca.antes.pisoDeSentimento)).toEqual([-0.5, -0.8])
  })

  it('valor fora do domínio é recusado com a frase e desliga o botão até voltar ao domínio', async () => {
    const { conta, secao } = await abrir('admin')
    const casos: [keyof typeof copy.campos, string][] = [
      ['pisoDeSentimento', '-1,5'],
      ['tetoDeFalhas', '0'],
      ['tetoDeCriterios', '1,5'],
      ['avisoDeCreditoCentavos', '0'],
    ]

    for (const [chave, torto] of casos) {
      const { rotulo, foraDoDominio } = copy.campos[chave]
      const entrada = campo(secao, rotulo)
      const original = entrada.value
      fireEvent.change(entrada, { target: { value: torto } })
      expect({ chave, frase: grupo(secao, rotulo).getByText(foraDoDominio).textContent }).toEqual({
        chave,
        frase: foraDoDominio,
      })
      expect({ chave, desligado: botao(secao).disabled }).toEqual({ chave, desligado: true })
      fireEvent.click(botao(secao))
      fireEvent.change(entrada, { target: { value: original } })
      expect(grupo(secao, rotulo).queryByText(foraDoDominio)).toBeNull()
    }
    expect(conta.pedidosDeLimiares).toEqual([])
  })

  it('crédito em branco é "sem aviso de crédito", e vai ao serviço como nulo, nunca zero', async () => {
    const { conta, secao } = await abrir('admin', {
      limiares: { ...LIMIARES_PADRAO, avisoDeCreditoCentavos: 5000 },
    })
    const credito = grupo(secao, copy.campos.avisoDeCreditoCentavos.rotulo)
    expect(credito.getByText(copy.creditoEmBranco)).toBeDefined()

    fireEvent.change(campo(secao, copy.campos.avisoDeCreditoCentavos.rotulo), { target: { value: '' } })
    expect(botao(secao).disabled).toBe(false)
    fireEvent.click(botao(secao))

    await waitFor(() => expect(conta.pedidosDeLimiares).toHaveLength(1))
    expect(conta.pedidosDeLimiares[0]?.avisoDeCreditoCentavos).toBeNull()
    await waitFor(() => expect(credito.getByText(copy.atual(copy.semAviso))).toBeDefined())
  })

  it('sem mudança não há o que salvar', async () => {
    const { secao } = await abrir('owner')
    expect(botao(secao).disabled).toBe(true)
    expect(secao.getByText(copy.semMudanca)).toBeDefined()
  })

  it('o check do banco continua sendo a fronteira: a recusa do servidor aparece', async () => {
    const conta = criarServicoDaContaDublado({ papel: 'admin' })
    // O banco recusa mesmo com a tela aceitando: o dublê aplica os checks, e
    // aqui a tela é contornada chamando o serviço com um valor fora.
    expect(await conta.definirLimiares({ ...LIMIARES_PADRAO, tetoDeFalhas: 0 })).toEqual({
      ok: false,
      motivo: 'fora-do-dominio',
    })
    expect(conta.trilhaDosLimiares).toEqual([])
  })

  it.each<Papel>(['operator', 'viewer'])('%s vê os valores e não os campos, com a negativa e quem concede', async (papel) => {
    const { secao } = await abrir(papel, {
      limiares: { ...LIMIARES_PADRAO, tetoDeFalhas: 5 },
    })

    const negativa = secao.getByRole('alert')
    expect(within(negativa).getByText(copy.negativa)).toBeDefined()
    expect(within(negativa).getByText('Lia Prado')).toBeDefined()

    expect(secao.queryAllByRole('textbox')).toEqual([])
    expect(secao.queryByRole('button', { name: copy.salvar })).toBeNull()
    for (const chave of CAMPOS_DOS_LIMIARES) {
      expect(grupo(secao, copy.campos[chave].rotulo).getByText(copy.campos[chave].dispara)).toBeDefined()
    }
    expect(grupo(secao, copy.campos.tetoDeFalhas.rotulo).getByText(copy.atual('5'))).toBeDefined()
    expect(secao.getByText(copy.vigencia)).toBeDefined()
  })

  it('o servidor recusando a gravação mostra a frase dele e não finge ter salvo', async () => {
    // A tela acha que é admin; o banco não concorda (papel trocado no meio).
    const conta = criarServicoDaContaDublado({ papel: 'operator' })
    await montarAplicacao(
      criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'renata@aurora.com.br' } }),
      '/config/conta',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeCom('admin') } }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      conta,
    )
    const secao = within(await screen.findByRole('region', { name: copy.rotulo }))
    fireEvent.change(await secao.findByRole('textbox', { name: copy.campos.tetoDeFalhas.rotulo }), {
      target: { value: '4' },
    })
    fireEvent.click(botao(secao))

    expect(await secao.findByText(copy.falhasAoSalvar['sem-permissao'])).toBeDefined()
    expect(secao.queryByText(copy.salvo)).toBeNull()
    expect(grupo(secao, copy.campos.tetoDeFalhas.rotulo).getByText(copy.atual('3'))).toBeDefined()
  })

  describe('os quatro estados', () => {
    it('carregando', async () => {
      const { secao } = await abrir('admin', { limiaresPendentes: true })
      expect(secao.getByText(copy.carregando)).toBeDefined()
    })

    it('falha', async () => {
      const { secao } = await abrir('admin', { falhaNosLimiares: 'falha-de-comunicacao' })
      expect(await secao.findByText(copy.falhas['falha-de-comunicacao'])).toBeDefined()
    })

    it('vazio: a conta sem linha de configuração', async () => {
      const { secao } = await abrir('admin', { limiares: null })
      expect(await secao.findByText(copy.vazio.titulo)).toBeDefined()
      expect(secao.queryByRole('button', { name: copy.salvar })).toBeNull()
    })

    it('preenchido', async () => {
      const { secao } = await abrir('admin')
      expect(await secao.findByRole('button', { name: copy.salvar })).toBeDefined()
    })
  })
})
