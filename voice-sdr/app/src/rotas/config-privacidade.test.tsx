// A US-089: gravação, aviso e retenção, pelo dono. Três coisas se provam aqui
// além do formulário: desligar a gravação não é dado por feito enquanto o
// agente não for republicado (L-18), reduzir o prazo diz quantas chamadas o
// expurgo vai alcançar antes de salvar, e admin vê em leitura com a negativa.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { privacidade as copy } from '@/copy/privacidade'
import type { Equipe, Papel } from '@/equipe/tipos'
import type { ServicoDePrivacidade } from '@/privacidade/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDaSarahDublado,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDePrivacidadeDublado,
  privacidadeDeExemplo,
  type RespostasDePrivacidade,
  type ServicoDePrivacidadeDublado,
} from '@/testes/servico-de-privacidade-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
function comPapel(papelDoUsuario: Papel): Equipe {
  return {
    ...equipeDeExemplo(),
    papelDoUsuario,
    membros: [
      { usuarioId: 'u-1', nome: 'Renata Alves', email: 'renata@aurora.com.br', papel: papelDoUsuario, ultimoAcesso: null },
      { usuarioId: 'u-8', nome: 'Caio Prado', email: 'caio@aurora.com.br', papel: 'admin', ultimoAcesso: null },
      { usuarioId: 'u-9', nome: 'Selma Dias', email: 'selma@aurora.com.br', papel: 'owner', ultimoAcesso: null },
    ],
  }
}

interface Cenario {
  papel?: Papel
  privacidade?: RespostasDePrivacidade | ServicoDePrivacidade
}

async function abrir(cenario: Cenario = {}) {
  const privacidade =
    cenario.privacidade &&
    'salvar' in cenario.privacidade &&
    typeof cenario.privacidade.salvar === 'function'
      ? (cenario.privacidade as ServicoDePrivacidadeDublado)
      : criarServicoDePrivacidadeDublado(cenario.privacidade as RespostasDePrivacidade | undefined)
  const sarahDublada = criarServicoDaSarahDublado()
  // Republicar é `agent-publish`, pelo serviço da Sarah. Do ponto de vista da
  // privacidade, o efeito é o que está no ar passar a ser o que está gravado.
  const sarah: ServicoDaSarahDublado = {
    ...sarahDublada,
    async republicar() {
      const resultado = await sarahDublada.republicar()
      if (resultado.ok && 'publicar' in privacidade) privacidade.publicar()
      return resultado
    },
  }

  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/privacidade',
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: comPapel(cenario.papel ?? 'owner') } }),
    undefined,
    undefined,
    undefined,
    undefined,
    sarah,
    undefined,
    undefined,
    undefined,
    undefined,
    privacidade,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return { privacidade, sarah: sarahDublada }
}

function campoDaRetencao(): HTMLInputElement {
  return within(screen.getByRole('group', { name: copy.rotulos.retencaoDias })).getByLabelText(
    copy.rotulos.retencaoDias,
  ) as HTMLInputElement
}

function digitar(elemento: HTMLElement, valor: string) {
  fireEvent.change(elemento, { target: { value: valor } })
}

async function salvarCom(motivo: string) {
  digitar(screen.getByLabelText(copy.motivo.rotulo), motivo)
  fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
}

describe('os quatro estados', () => {
  it('carregando', async () => {
    const pendurado: ServicoDePrivacidade = {
      carregar: () => new Promise(() => {}),
      contarForaDoPrazo: () => new Promise(() => {}),
      salvar: () => new Promise(() => {}),
    }
    await abrir({ privacidade: pendurado })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('falha', async () => {
    await abrir({ privacidade: { carregar: { ok: false, motivo: 'falha-de-comunicacao' } } })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('vazio', async () => {
    await abrir({ privacidade: { carregar: { ok: true, privacidade: null } } })
    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
  })

  it('a privacidade, com o padrão de 90 dias e o expurgo irreversível escritos', async () => {
    await abrir()
    await screen.findByRole('button', { name: copy.salvar })
    expect(campoDaRetencao().value).toBe('90')
    expect(screen.getByText(copy.retencao.padrao)).toBeTruthy()
    const explicacao = screen.getByText(copy.retencao.explicacao).textContent ?? ''
    expect(explicacao).toMatch(/irreversível/)
    expect(explicacao).toMatch(/armazenamento/)
    expect(explicacao).toMatch(/provedor de voz/)
    expect(screen.getByText(copy.gravacao.ligada)).toBeTruthy()
  })
})

describe('o aviso de gravação', () => {
  it('a prévia mostra a frase padrão e acompanha o texto digitado', async () => {
    await abrir()
    const previa = within(await screen.findByRole('region', { name: copy.aviso.previa }))
    expect(previa.getByText(/Oi, Marcos Ferreira\? Aqui é a Sarah, da Vexo Tecnologia/)).toBeTruthy()

    digitar(screen.getByLabelText(copy.rotulos.avisoDeGravacao), 'Oi, {nome_do_lead}. A {empresa} grava esta ligação.')
    expect(previa.getByText('Oi, Marcos Ferreira. A Vexo Tecnologia grava esta ligação.')).toBeTruthy()
  })

  it('com a gravação desligada, a prévia diz que não há aviso', async () => {
    await abrir()
    fireEvent.click(await screen.findByLabelText(copy.gravacao.ligar))
    const previa = within(screen.getByRole('region', { name: copy.aviso.previa }))
    expect(previa.getByText(copy.aviso.semAviso)).toBeTruthy()
  })

  it('apagar o texto da conta volta à frase padrão, e vai ao RPC como nulo', async () => {
    const { privacidade } = await abrir({
      privacidade: { privacidade: { ...privacidadeDeExemplo(), avisoDeGravacao: 'Gravamos.' } },
    })
    digitar(await screen.findByLabelText(copy.rotulos.avisoDeGravacao), '')
    await salvarCom('volta ao padrão')
    await screen.findByText(copy.confirmacao.titulo)
    expect(privacidade.gravacoes).toEqual([
      { mudancas: { avisoDeGravacao: null }, motivo: 'volta ao padrão' },
    ])
  })
})

describe('desligar a gravação exige republicar (L-18)', () => {
  it('desligar diz que exige republicar, e depois de salvar a tela mostra que o provedor ainda grava', async () => {
    const { privacidade } = await abrir()
    fireEvent.click(await screen.findByLabelText(copy.gravacao.ligar))
    expect(screen.getByText(copy.gravacao.exigeRepublicar)).toBeTruthy()

    await salvarCom('pedido do jurídico')
    const pendencia = await screen.findByRole('region', { name: copy.gravacao.noPainel.titulo })
    expect(within(pendencia).getByText(copy.gravacao.noPainel.explicacao)).toBeTruthy()
    expect(screen.queryByText(copy.gravacao.desligada)).toBeNull()
    expect(privacidade.gravacoes).toEqual([
      { mudancas: { gravacaoLigada: false }, motivo: 'pedido do jurídico' },
    ])
  })

  it('o botão da própria tela chama agent-publish, e só então a gravação aparece desligada', async () => {
    const { sarah } = await abrir({
      privacidade: { privacidade: { ...privacidadeDeExemplo(), gravacaoLigada: false } },
    })
    const pendencia = within(await screen.findByRole('region', { name: copy.gravacao.noPainel.titulo }))
    fireEvent.click(pendencia.getByRole('button', { name: copy.gravacao.republicar }))

    expect(await screen.findByText(copy.gravacao.desligada)).toBeTruthy()
    expect(sarah.chamadasAoAgentPublish()).toBe(1)
    expect(screen.queryByRole('region', { name: copy.gravacao.noPainel.titulo })).toBeNull()
  })

  it('desligada e já republicada não mostra pendência', async () => {
    await abrir({
      privacidade: {
        privacidade: { ...privacidadeDeExemplo(), gravacaoLigada: false },
        noAr: { gravacaoLigada: false },
      },
    })
    expect(await screen.findByText(copy.gravacao.desligada)).toBeTruthy()
    expect(screen.queryByRole('region', { name: copy.gravacao.noPainel.titulo })).toBeNull()
  })
})

describe('o prazo de retenção', () => {
  it('reduzir mostra quantas chamadas serão expurgadas antes de salvar, e pede a confirmação', async () => {
    const { privacidade } = await abrir({
      privacidade: { chamadasTerminadasHaDias: [10, 40, 60, 95] },
    })
    await screen.findByRole('button', { name: copy.salvar })
    digitar(campoDaRetencao(), '30')

    expect(await screen.findByText(copy.retencao.foraDoPrazo(3, 30))).toBeTruthy()
    expect(copy.retencao.foraDoPrazo(3, 30)).toMatch(/^3 chamadas passam do prazo de 30 dias/)

    await salvarCom('pedido do jurídico')
    expect(await screen.findByText(copy.confirmarExpurgo)).toBeTruthy()
    expect(privacidade.gravacoes).toEqual([])

    fireEvent.click(screen.getByLabelText(copy.retencao.confirmar))
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    await screen.findByText(copy.confirmacao.titulo)
    expect(privacidade.gravacoes).toEqual([
      { mudancas: { retencaoDias: 30 }, motivo: 'pedido do jurídico' },
    ])
    expect(screen.getByText('Prazo de retenção: 90 dias → 30 dias')).toBeTruthy()
  })

  it('aumentar não conta nada e salva direto', async () => {
    const { privacidade } = await abrir()
    await screen.findByRole('button', { name: copy.salvar })
    digitar(campoDaRetencao(), '180')
    await salvarCom('auditoria anual')
    await screen.findByText(copy.confirmacao.titulo)
    expect(privacidade.contagens).toEqual([])
    expect(privacidade.gravacoes).toEqual([{ mudancas: { retencaoDias: 180 }, motivo: 'auditoria anual' }])
  })

  it('prazo fora da faixa é recusado antes do servidor', async () => {
    const { privacidade } = await abrir()
    await screen.findByRole('button', { name: copy.salvar })
    digitar(campoDaRetencao(), '0')
    await salvarCom('teste')
    expect(await screen.findByText(copy.retencao.erros['fora-da-faixa'])).toBeTruthy()
    expect(privacidade.gravacoes).toEqual([])
  })

  it('sem motivo não salva', async () => {
    const { privacidade } = await abrir()
    await screen.findByRole('button', { name: copy.salvar })
    digitar(campoDaRetencao(), '120')
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.motivo.faltando)).toBeTruthy()
    expect(privacidade.gravacoes).toEqual([])
  })
})

describe('papel: a classe Dono', () => {
  it('admin vê em leitura, com a negativa e a quem pedir, sem controle de alteração', async () => {
    const { privacidade } = await abrir({
      papel: 'admin',
      privacidade: { privacidade: { ...privacidadeDeExemplo(), gravacaoLigada: false } },
    })

    const negativa = await screen.findByText(copy.leitura.aviso)
    const caixa = within(negativa.closest('[role="alert"]') as HTMLElement)
    const donos = caixa.getByRole('list', { name: copy.leitura.pedirAcesso })
    expect(within(donos).getByText(/Selma Dias/)).toBeTruthy()
    expect(within(donos).queryByText(/Caio Prado/)).toBeNull()

    // O estado medido vale para quem lê também: o provedor ainda grava.
    expect(await screen.findByRole('region', { name: copy.gravacao.noPainel.titulo })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.gravacao.republicar })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.salvar })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('Prazo de retenção')).toBeTruthy()
    expect(privacidade.gravacoes).toEqual([])
  })

  it('nenhum controle de exclusão ou exportação de dados de lead aparece', async () => {
    await abrir()
    await screen.findByRole('button', { name: copy.salvar })
    const conteudo = screen.getByRole('main')
    expect(within(conteudo).queryByRole('button', { name: /exclu|apagar|export/i })).toBeNull()
  })
})

describe('a falha de gravação', () => {
  it('diz o motivo e mantém o que foi digitado', async () => {
    await abrir({ privacidade: { salvar: { ok: false, motivo: 'sem-permissao' } } })
    await screen.findByRole('button', { name: copy.salvar })
    digitar(campoDaRetencao(), '120')
    await salvarCom('teste')
    await waitFor(() => expect(screen.getByText(copy.falhas['sem-permissao'])).toBeTruthy())
    expect(campoDaRetencao().value).toBe('120')
  })
})
