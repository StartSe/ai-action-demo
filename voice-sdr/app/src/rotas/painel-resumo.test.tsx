// O painel lendo `dashboard_summary` (US-144).
//
// O dublê devolve o `jsonb` do RPC e o passa por `lerResumo`, a leitura do
// serviço de verdade. Quatro asserções justificam o arquivo:
//
// - **Uma chamada por período.** A tela não soma nada: pede o resumo uma vez
//   e desenha o que voltou; trocar o período pede de novo, uma vez.
// - **A métrica norte conta só reunião com desfecho.** A que passou sem
//   desfecho aparece ao lado, com a frase de marcar em Reuniões.
// - **Indisponível nunca vira zero.** A instalação sem a migração
//   20261013100000 ainda nega o número, e o cartão diz por quê.
// - **Renomear etapa não muda número.** O funil casa pela key.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { painel as copy } from '@/copy/painel'
import { CARTOES_DE_REUNIAO } from '@/painel/cartoes'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDoPainelDublado,
  resumoBrutoDeExemplo,
  reunioesDeInstalacaoAntiga,
  type RespostasDoPainel,
} from '@/testes/servico-do-painel-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

async function abrir(respostas: RespostasDoPainel = {}) {
  const painel = criarServicoDoPainelDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/',
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
    undefined,
    undefined,
    undefined,
    painel,
  )
  return painel
}

function cartao(nome: string) {
  return screen.getByRole('group', { name: nome })
}

function valores(elemento: HTMLElement) {
  return [...elemento.querySelectorAll('.val')].map((valor) => valor.textContent)
}

afterEach(cleanup)

describe('/ — os números do período', () => {
  it('mostra a espera enquanto o resumo não chega', async () => {
    await abrir({ pendente: true })

    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('diz a falha quando o resumo não volta', async () => {
    await abrir({ falha: 'falha-de-comunicacao' })

    const alerta = await screen.findByText(copy.falhas['falha-de-comunicacao'])
    expect(alerta.closest('[role="alert"]')).toBeTruthy()
  })

  it('sem ligação no período, o vazio leva ao discador', async () => {
    await abrir()

    const ir = await screen.findByRole('link', { name: copy.vazio.acao })
    expect(ir.getAttribute('href')).toBe('#discador')
    expect(document.getElementById('discador')).toBeTruthy()
    expect(screen.getByText(copy.vazio.titulo)).toBeTruthy()
    expect(screen.queryByRole('group', { name: copy.ligacoes.cartoes.total })).toBeNull()
  })

  it('com operação, os cartões mostram os números do RPC em .val', async () => {
    await abrir({ resumo: resumoBrutoDeExemplo() })

    await screen.findByRole('group', { name: copy.ligacoes.cartoes.total })
    expect(valores(cartao(copy.ligacoes.cartoes.total))).toEqual(['48'])
    expect(valores(cartao(copy.ligacoes.cartoes.atendidas))).toEqual(['30'])
    expect(valores(cartao(copy.ligacoes.cartoes.taxaDeAtendimento))).toEqual(['62,5%'])
    expect(valores(cartao(copy.ligacoes.cartoes.duracaoMedia))).toEqual(['02:22'])
    expect(valores(cartao(copy.qualidade.nota))).toEqual(['7,6'])
    expect(within(cartao(copy.qualidade.nota)).getByText(copy.qualidade.avaliadas(26))).toBeTruthy()
    expect(valores(cartao(copy.qualidade.sentimento))).toEqual(['14', '9', '4', '3'])

    const custo = screen.getByRole('table', { name: copy.custo.titulo })
    expect(valores(custo)).toEqual(['R$ 1,50', 'R$ 18,40', 'US$ 2,12', 'US$ 9,35', 'R$ 19,90', 'US$ 11,47'].map((valor) => valor.replace(' ', ' ')))
    expect(within(custo).getByText(copy.custo.total('USD'))).toBeTruthy()
  })

  it('a métrica norte mostra as reuniões realizadas e diz quantas estão sem desfecho', async () => {
    await abrir({ resumo: resumoBrutoDeExemplo() })

    const norte = await screen.findByRole('group', { name: copy.norte.titulo })
    expect(valores(norte)).toEqual(['5'])
    expect(within(norte).getByText(copy.norte.semApuracao(2))).toBeTruthy()
    expect(within(norte).queryByText(copy.norte.degradada, { exact: false })).toBeNull()
  })

  it('com a apuração abaixo de 70%, a métrica norte avisa que pode estar abaixo do real', async () => {
    const bruto = resumoBrutoDeExemplo()
    await abrir({
      resumo: { ...bruto, apuracao: { taxa_de_apuracao: '0.5', degradacao_da_metrica_norte: true } },
    })

    const norte = await screen.findByRole('group', { name: copy.norte.titulo })
    expect(norte.textContent).toContain(copy.norte.degradada)
  })

  it('os cartões de reunião mostram os números do RPC e o custo por reunião por moeda', async () => {
    await abrir({ resumo: resumoBrutoDeExemplo() })
    await screen.findByRole('group', { name: copy.norte.titulo })

    const esperados: Record<(typeof CARTOES_DE_REUNIAO)[number], string> = {
      marcadas: '9',
      confirmadas: '4',
      faltas: '1',
      taxaDeComparecimento: '83,3%',
      semApuracao: '2',
      proximasReunioes: '3',
      taxaDeApuracao: '75%',
    }
    for (const nome of CARTOES_DE_REUNIAO) {
      expect({ nome, valores: valores(cartao(copy.reunioes.cartoes[nome])) }).toEqual({
        nome,
        valores: [esperados[nome]],
      })
    }
    const custo = cartao(copy.reunioes.custo.rotulo)
    expect(valores(custo)[0]).toMatch(/^R\$\s3,98 \+ US\$\s2,29$/)
    expect(document.body.textContent).not.toContain(copy.indisponivel.selo)
  })

  it('a instalação sem a atualização mostra o número como ainda não aparece, nunca zero', async () => {
    await abrir({ resumo: { ...resumoBrutoDeExemplo(), ...reunioesDeInstalacaoAntiga() } })

    const norte = await screen.findByRole('group', { name: copy.norte.titulo })
    expect(valores(norte)).toEqual([])
    expect(within(norte).getByText(copy.indisponivel.selo)).toBeTruthy()
    expect(within(norte).getByText(copy.indisponivel.explicacao)).toBeTruthy()
    expect(norte.textContent).not.toMatch(/\d/)
    for (const nome of CARTOES_DE_REUNIAO) {
      const elemento = cartao(copy.reunioes.cartoes[nome])
      expect(valores(elemento)).toEqual([])
    }
    // A frase é de cliente: nada de etapa de construção.
    expect(document.body.textContent).not.toMatch(/fase|fatia|etapa seguinte/i)
  })

  it('faz uma chamada só por período, e trocar o período pede de novo uma vez', async () => {
    const servico = await abrir({ resumo: resumoBrutoDeExemplo() })
    await screen.findByRole('group', { name: copy.ligacoes.cartoes.total })
    expect(servico.pedidos).toHaveLength(1)

    fireEvent.change(screen.getByLabelText(copy.periodo.rotulo), { target: { value: 'hoje' } })

    await waitFor(() => expect(servico.pedidos).toHaveLength(2))
    await screen.findByRole('group', { name: copy.ligacoes.cartoes.total })
    expect(servico.pedidos).toHaveLength(2)
    const [seteDias, hoje] = servico.pedidos
    expect(hoje?.ate).toBe(seteDias?.ate)
    expect(Date.parse(hoje?.ate ?? '') - Date.parse(hoje?.de ?? '')).toBeLessThanOrEqual(25 * 3600_000)
  })
})

describe('/ — o funil do período', () => {
  async function linhasDoFunil(rotulos: Partial<Record<string, string>> = {}) {
    await abrir({ resumo: resumoBrutoDeExemplo(rotulos) })
    const tabela = await screen.findByRole('table', { name: copy.funil.titulo })
    const linhas = within(tabela)
      .getAllByRole('row')
      .slice(1)
      .map((linha) => within(linha).getAllByRole('cell').map((celula) => celula.textContent))
    cleanup()
    return linhas
  }

  it('mostra o rótulo atual e a taxa de passagem de cada etapa', async () => {
    const linhas = await linhasDoFunil()

    expect(linhas).toEqual([
      ['Novo', '40', copy.funil.semPassagem],
      ['Contatado', '20', '50%'],
      ['Qualificado', '8', '40%'],
      ['Reunião marcada', '0', '0%'],
      ['Perdido', '3', copy.funil.semPassagem],
    ])
  })

  it('renomear a etapa troca o rótulo e não muda número nenhum', async () => {
    const antes = await linhasDoFunil()
    const depois = await linhasDoFunil({ qualified: 'Tem fit' })

    expect(depois.map(([, ...numeros]) => numeros)).toEqual(antes.map(([, ...numeros]) => numeros))
    expect(depois[2]?.[0]).toBe('Tem fit')
    expect(antes[2]?.[0]).toBe('Qualificado')
  })
})
