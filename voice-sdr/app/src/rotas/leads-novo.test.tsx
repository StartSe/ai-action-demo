import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { campoDeFuso as copyDoFuso } from '@/copy/fuso'
import { cadastroDeLead as copy, RECUSA_DO_TELEFONE } from '@/copy/leads'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeLeadsDublado,
  type RespostasDeLeads,
} from '@/testes/servico-de-leads-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import type { Papel } from '@/equipe/tipos'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function abrirCadastro(
  respostas: RespostasDeLeads = {},
  papel: Papel = 'operator',
) {
  const servico = criarServicoDeLeadsDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: equipeDeExemplo(papel) },
  })

  const { roteador } = await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/leads/novo',
    equipe,
    undefined,
    undefined,
    undefined,
    servico,
  )

  await screen.findByRole('heading', { name: copy.titulo })
  // O papel chega por consulta, e é ele que destrava os campos.
  await waitFor(() => expect(campoTelefone().disabled).toBe(false))

  return { servico, roteador }
}

function campoTelefone(): HTMLInputElement {
  return screen.getByLabelText(copy.campos.telefone) as HTMLInputElement
}

function digitarTelefone(texto: string) {
  fireEvent.change(campoTelefone(), { target: { value: texto } })
}

function preencher(rotulo: string, texto: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: texto } })
}

/** O valor de um campo de texto. Sem jest-dom nesta base: é a propriedade. */
function valorDe(rotulo: string): string {
  return (screen.getByLabelText(rotulo) as HTMLInputElement).value
}

function botaoDeGravar(): HTMLButtonElement {
  return screen.getByRole('button', { name: copy.gravar }) as HTMLButtonElement
}

describe('cadastro manual de lead', () => {
  it('abre em /leads/novo, sob a casca que exige sessão', async () => {
    const { roteador } = await abrirCadastro()

    expect(roteador.state.location.pathname).toBe('/leads/novo')
    expect(screen.getByRole('heading', { name: copy.titulo })).toBeDefined()
  })

  it('normaliza o telefone enquanto se digita e mostra o E.164 na fonte de valor', async () => {
    await abrirCadastro()

    digitarTelefone('(48) 99999-8888')

    const numero = await screen.findByText('+5548999998888')
    expect(numero.className).toContain('val')
  })

  it('a mesma escrita em outro formato dá o mesmo número gravado', async () => {
    await abrirCadastro()

    digitarTelefone('048999998888')
    expect(await screen.findByText('+5548999998888')).toBeDefined()
  })

  it('resolve cidade, estado e fuso pelo DDD, preenchidos e editáveis', async () => {
    await abrirCadastro()

    digitarTelefone('(48) 99999-8888')

    await waitFor(() => {
      expect(valorDe(copy.localidade.cidade)).toBe('Florianópolis')
    })
    expect(valorDe(copy.localidade.estado)).toBe('SC')
    expect(valorDe(copy.localidade.fuso)).toBe('America/Sao_Paulo')
    // A tela diz de onde veio, para o palpite não passar por dado conferido.
    expect(screen.getByText(copy.localidade.doDdd('48'))).toBeDefined()

    preencher(copy.localidade.cidade, 'Palhoça')
    expect(valorDe(copy.localidade.cidade)).toBe('Palhoça')
  })

  it('o fuso é um seletor pelo nome: o DDD 68 escolhe o Acre, e a troca grava a zona (D-09)', async () => {
    const { servico } = await abrirCadastro()

    const fuso = screen.getByRole('combobox', { name: copy.localidade.fuso }) as HTMLSelectElement
    // Sem telefone ainda, o seletor pede a escolha em vez de mostrar um fuso.
    expect(fuso.value).toBe('')
    expect(fuso.selectedOptions[0]?.textContent).toBe(copyDoFuso.escolha)

    digitarTelefone('(68) 99999-8888')
    await waitFor(() => expect(fuso.value).toBe('America/Rio_Branco'))
    expect(fuso.selectedOptions[0]?.textContent).toBe(copyDoFuso.nomes['America/Rio_Branco'])

    fireEvent.change(fuso, { target: { value: 'America/Manaus' } })
    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())
    await waitFor(() => expect(servico.cadastrados).toHaveLength(1))
    expect(servico.cadastrados[0]).toMatchObject({ estado: 'AC', fuso: 'America/Manaus' })
  })

  it('a cidade corrigida à mão sobrevive à troca do telefone', async () => {
    await abrirCadastro()

    digitarTelefone('(48) 99999-8888')
    await waitFor(() => {
      expect(valorDe(copy.localidade.cidade)).toBe('Florianópolis')
    })

    preencher(copy.localidade.cidade, 'Palhoça')
    digitarTelefone('(11) 98888-7777')

    await waitFor(() => expect(valorDe(copy.localidade.estado)).toBe('SP'))
    expect(valorDe(copy.localidade.cidade)).toBe('Palhoça')
  })

  it('telefone malformado mostra o motivo em português e trava a gravação', async () => {
    await abrirCadastro()

    digitarTelefone('(20) 99999-8888')

    expect(
      await screen.findByText(RECUSA_DO_TELEFONE.ddd_invalido),
    ).toBeDefined()
    expect(botaoDeGravar().disabled).toBe(true)
  })

  it('cada recusa do normalizador tem a sua própria frase', async () => {
    await abrirCadastro()

    digitarTelefone('(48) 89999-8888')
    expect(
      await screen.findByText(RECUSA_DO_TELEFONE.celular_sem_nono_digito),
    ).toBeDefined()

    digitarTelefone('+351 912 345 678')
    expect(
      await screen.findByText(RECUSA_DO_TELEFONE.pais_nao_suportado),
    ).toBeDefined()
  })

  it('campo em branco não acusa erro, mas também não deixa gravar', async () => {
    await abrirCadastro()

    expect(screen.queryByText(RECUSA_DO_TELEFONE.vazio)).toBeNull()
    expect(botaoDeGravar().disabled).toBe(true)
  })

  it('grava pelo serviço com o telefone normalizado e o resto do formulário', async () => {
    const { servico } = await abrirCadastro()

    digitarTelefone('(48) 98888-7777')
    preencher(copy.campos.nome, 'Marina Castro')
    preencher(copy.campos.email, 'marina@aurora.com.br')
    preencher(copy.campos.empresa, 'Aurora Logística')
    preencher(copy.campos.origem, 'Indicação da Renata')
    fireEvent.change(screen.getByLabelText(copy.campos.etapa), {
      target: { value: 'qualified' },
    })

    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())

    await waitFor(() => expect(servico.cadastrados).toHaveLength(1))
    expect(servico.cadastrados[0]).toEqual({
      telefone: '+5548988887777',
      nome: 'Marina Castro',
      email: 'marina@aurora.com.br',
      empresa: 'Aurora Logística',
      origem: 'Indicação da Renata',
      etapa: 'qualified',
      cidade: 'Florianópolis',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
  })

  it('o lead nasce com um lead_created assinado por quem cadastrou', async () => {
    const { servico } = await abrirCadastro()

    digitarTelefone('(48) 98888-7777')
    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())

    await waitFor(() => expect(servico.cadastrados).toHaveLength(1))
    expect(servico.eventos).toHaveLength(1)
    expect(servico.eventos[0]?.kind).toBe('lead_created')
    expect(servico.eventos[0]?.actor).toBe('user')
  })

  it('gravado, leva para a lista filtrada pelo número recém-cadastrado', async () => {
    const { roteador } = await abrirCadastro()

    digitarTelefone('(48) 98888-7777')
    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())

    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/leads'),
    )
    expect(roteador.state.location.search).toMatchObject({
      termo: '+5548988887777',
    })
  })

  it('telefone já cadastrado mostra o lead existente e não deixa gravar', async () => {
    const { servico } = await abrirCadastro()

    // `+5548999998888` é da Marina, o primeiro lead de exemplo.
    digitarTelefone('(48) 99999-8888')

    expect(await screen.findByText(copy.duplicado.titulo)).toBeDefined()
    expect(screen.getByText(/Marina Castro/)).toBeDefined()
    expect(botaoDeGravar().disabled).toBe(true)

    // A procura saiu com o E.164, e nada foi gravado.
    expect(servico.procurados).toContain('+5548999998888')
    expect(servico.cadastrados).toHaveLength(0)
  })

  it('o lead existente vem com o caminho até ele', async () => {
    await abrirCadastro()

    digitarTelefone('(48) 99999-8888')

    const link = await screen.findByRole('link', { name: copy.duplicado.abrir })
    expect(link.getAttribute('href')).toContain('%2B5548999998888')
  })

  it('duplicado gravado entre a procura e o clique volta como recusa nomeada', async () => {
    // A procura não acha nada e a gravação recusa: é a corrida que o índice
    // único resolve no banco, e a tela precisa contá-la sem falar em índice.
    const { servico } = await abrirCadastro({
      procurar: { ok: true, lead: null },
      cadastrar: { ok: false, motivo: 'duplicado' },
    })

    digitarTelefone('(48) 98888-7777')
    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())

    expect(await screen.findByText(copy.falhas.duplicado)).toBeDefined()
    expect(servico.cadastrados).toHaveLength(1)
  })

  it('recusa do servidor vira frase, e nenhuma mensagem de Postgres aparece', async () => {
    await abrirCadastro({ cadastrar: { ok: false, motivo: 'sem-permissao' } })

    digitarTelefone('(48) 98888-7777')
    await waitFor(() => expect(botaoDeGravar().disabled).toBe(false))
    fireEvent.click(botaoDeGravar())

    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeDefined()
  })

  it('quem acompanha em leitura vê a negativa e a quem pedir acesso', async () => {
    const servico = criarServicoDeLeadsDublado()
    const equipe = criarServicoDeEquipeDublado({
      carregar: { ok: true, equipe: equipeDeExemplo('viewer') },
    })

    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads/novo',
      equipe,
      undefined,
      undefined,
      undefined,
      servico,
    )

    expect(await screen.findByText(copy.leitura.aviso)).toBeDefined()
    expect(botaoDeGravar().disabled).toBe(true)
    expect(campoTelefone().disabled).toBe(true)
  })

  it('as etapas do funil viram opções, com "sem etapa" à frente', async () => {
    await abrirCadastro()

    const seletor = screen.getByLabelText(copy.campos.etapa) as HTMLSelectElement

    await waitFor(() => expect(seletor.options.length).toBeGreaterThan(1))
    expect(seletor.options[0]?.textContent).toBe(copy.campos.semEtapa)
    expect(seletor.value).toBe('')
    expect(
      [...seletor.options].map((opcao) => opcao.value),
    ).toContain('qualified')
  })
})
