// A tela de importação, em jsdom, com o serviço dublado.
//
// O caso central é o primeiro critério de aceite da F1 pelo lado da interface:
// mil linhas, trinta telefones malformados e cinquenta repetidos têm que
// aparecer como 920, 30 e 50 na prévia. A planilha vem do gerador da US-026
// (`@importacao/planilha-de-exemplo.ts`), o mesmo que a borda usa — os dois
// lados provam o mesmo cenário, e uma correção na receita corrige os dois.
//
// O dublê não escreve a prévia à mão: ele chama `atenderImportacao`, que é o
// código da borda, com a camada de dados em memória. O que falta entre a tela e
// o banco é a rede, e é só ela que o dublê substitui.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CAMPO_EM_PORTUGUES,
  importacaoDeLeads as copy,
} from '@/copy/leads-importar'
import type { Papel } from '@/equipe/tipos'
import { escreverCsv, TETO_DE_LINHAS } from '@/leads/planilha'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { planilhaDoExcel } from '@/testes/planilha-do-excel'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeLeadsDublado,
  type LeadDeExemplo,
  type RespostasDeLeads,
} from '@/testes/servico-de-leads-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import {
  gerarPlanilhaDeLeads,
  type ReceitaDaPlanilha,
} from '@importacao/planilha-de-exemplo.ts'
import type { PlanilhaLida } from '@importacao/previa.ts'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

/** A planilha do cenário escrita como o arquivo que alguém escolheria. */
function csvDe(planilha: PlanilhaLida): string {
  return escreverCsv(
    planilha.colunas,
    planilha.linhas.map((linha) =>
      planilha.colunas.map((coluna) => linha.celulas[coluna] ?? ''),
    ),
  )
}

async function abrirImportacao(
  respostas: RespostasDeLeads = { leads: [] },
  papel: Papel = 'operator',
) {
  const servico = criarServicoDeLeadsDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: equipeDeExemplo(papel) },
  })

  const { roteador } = await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/leads/importar',
    equipe,
    undefined,
    undefined,
    undefined,
    servico,
  )

  await screen.findByRole('heading', { name: copy.titulo })
  // O papel chega por consulta, e é ele que destrava o seletor de arquivo.
  await waitFor(() => expect(campoDeArquivo().disabled).toBe(false))

  return { servico, roteador }
}

function campoDeArquivo(): HTMLInputElement {
  return screen.getByLabelText(copy.arquivo.campo) as HTMLInputElement
}

/** Escolhe o arquivo e espera a tela terminar de ler e resumir a planilha. */
async function escolher(texto: string, nome = 'leads.csv') {
  const arquivo = new File([texto], nome, { type: 'text/csv' })
  fireEvent.change(campoDeArquivo(), { target: { files: [arquivo] } })
  await screen.findByText(nome)
}

function clicar(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}

function seletorDe(campo: keyof typeof CAMPO_EM_PORTUGUES): HTMLSelectElement {
  return screen.getByLabelText(CAMPO_EM_PORTUGUES[campo]) as HTMLSelectElement
}

/** Sobe a planilha, aceita o palpite de mapeamento e abre a prévia. */
async function verPrevia(texto: string) {
  await escolher(texto)
  clicar(copy.arquivo.seguir)
  clicar(copy.mapeamento.seguir)
  await screen.findByRole('region', { name: copy.previa.validos })
}

/** O número que um dos três grupos da prévia mostra. */
function quantasNoGrupo(titulo: string): string {
  const grupo = screen.getByRole('region', { name: titulo })
  const numero = within(grupo).getByText(/^\d+$/)
  return numero.textContent ?? ''
}

function cenario(receita: ReceitaDaPlanilha = {}) {
  const exemplo = gerarPlanilhaDeLeads(receita)
  return { ...exemplo, csv: csvDe(exemplo.planilha) }
}

describe('importação de planilha', () => {
  it('abre em /leads/importar, sob a casca que exige sessão, nos três passos', async () => {
    const { roteador } = await abrirImportacao()

    expect(roteador.state.location.pathname).toBe('/leads/importar')
    const trilha = screen.getByRole('list', { name: copy.titulo })
    expect(
      within(trilha)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1Arquivo', '2Colunas', '3Prévia'])
  })

  it('abre vazia, e o vazio diz o que fazer', async () => {
    await abrirImportacao()

    expect(screen.getByText(copy.arquivo.vazio.titulo)).toBeDefined()
    // O teto aparece antes de escolher o arquivo (D-08).
    expect(screen.getByText(copy.arquivo.formatos(TETO_DE_LINHAS))).toBeDefined()
  })

  it('a planilha do Excel entra direto, pela primeira aba (D-08)', async () => {
    await abrirImportacao()
    const bytes = await planilhaDoExcel([
      ['Nome', 'Telefone', 'Cidade'],
      ['Marina Castro', 5548999998888, 'Florianópolis'],
      ['Rui Prado', '(11) 98888-7777', 'São Paulo'],
    ])
    const arquivo = new File([bytes], 'base.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(campoDeArquivo(), { target: { files: [arquivo] } })

    expect(await screen.findByText('base.xlsx')).toBeDefined()
    expect(screen.getByText(copy.arquivo.lido(2, 3))).toBeDefined()
    expect(campoDeArquivo().accept).toContain('.xlsx')
  })

  it('o .xls antigo é recusado com a frase de como salvar (D-08)', async () => {
    const { servico } = await abrirImportacao()
    const arquivo = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1])], 'base.xls')
    fireEvent.change(campoDeArquivo(), { target: { files: [arquivo] } })

    expect(await screen.findByText(copy.falhasDaLeitura['xls-antigo'])).toBeDefined()
    expect(servico.previas).toHaveLength(0)
  })

  it('arquivo sem linha de dado é recusado antes de qualquer chamada', async () => {
    const { servico } = await abrirImportacao()

    const arquivo = new File(['Nome,Telefone'], 'vazia.csv', { type: 'text/csv' })
    fireEvent.change(campoDeArquivo(), { target: { files: [arquivo] } })

    expect(
      await screen.findByText(copy.falhasDaLeitura['sem-linhas']),
    ).toBeDefined()
    expect(servico.previas).toEqual([])
  })

  it('o palpite acerta as colunas do arquivo e diz o que fica de fora', async () => {
    await abrirImportacao()
    await escolher(cenario({ linhas: 5, invalidos: 1, duplicados: 1 }).csv)
    clicar(copy.arquivo.seguir)

    expect(seletorDe('nome').value).toBe('Nome Completo')
    expect(seletorDe('telefone').value).toBe('Telefone')
    expect(seletorDe('email').value).toBe('E-Mail')
    expect(seletorDe('empresa').value).toBe('Organização')
    expect(seletorDe('cidade').value).toBe('Município')
    expect(seletorDe('estado').value).toBe('UF')
    // `Observações` não corresponde a campo nenhum, e não ser campo não é erro.
    expect(screen.getByText(copy.mapeamento.ignoradas(['Observações']))).toBeDefined()
  })

  it('o mapeamento mostra as três primeiras linhas e acompanha a troca de destino', async () => {
    await abrirImportacao()
    await escolher(cenario({ linhas: 5, invalidos: 1, duplicados: 1 }).csv)
    clicar(copy.arquivo.seguir)

    const amostra = screen.getByRole('table', { name: copy.mapeamento.amostra })
    // Três linhas de dado, mais a do cabeçalho.
    expect(within(amostra).getAllByRole('row').length).toBe(4)
    expect(within(amostra).getByText('Lead 0001')).toBeDefined()

    fireEvent.change(seletorDe('nome'), { target: { value: 'Observações' } })

    await waitFor(() => {
      expect(
        within(
          screen.getByRole('table', { name: copy.mapeamento.amostra }),
        ).getByText('linha 0001 do arquivo de exemplo'),
      ).toBeDefined()
    })
  })

  it('sem coluna de telefone a prévia não é oferecida, e a tela diz por quê', async () => {
    await abrirImportacao()
    await escolher(cenario({ linhas: 5, invalidos: 1, duplicados: 1 }).csv)
    clicar(copy.arquivo.seguir)

    fireEvent.change(seletorDe('telefone'), { target: { value: '' } })

    await waitFor(() => {
      const seguir = screen.getByRole('button', {
        name: copy.mapeamento.seguir,
      }) as HTMLButtonElement
      expect(seguir.disabled).toBe(true)
    })
    expect(screen.getByText(copy.mapeamento.semTelefone)).toBeDefined()
  })

  /**
   * O critério de aceite da F1, pelo lado de quem olha a tela: mil linhas,
   * trinta telefones malformados, cinquenta repetidos, e os três números têm
   * que ser 920, 30 e 50.
   */
  it('mil linhas com 30 malformadas e 50 repetidas mostram 920, 30 e 50', async () => {
    await abrirImportacao()
    const { csv, numerosInvalidos } = cenario()

    await verPrevia(csv)

    expect(quantasNoGrupo(copy.previa.validos)).toBe('920')
    expect(quantasNoGrupo(copy.previa.invalidos)).toBe('30')
    expect(quantasNoGrupo(copy.previa.duplicados)).toBe('50')

    // Cada linha da lista traz o número dela no arquivo (RF-105).
    const invalidos = screen.getByRole('region', { name: copy.previa.invalidos })
    const primeira = numerosInvalidos[0] ?? 0
    expect(within(invalidos).getByText(copy.previa.linha(primeira))).toBeDefined()
  })

  it('a prévia lê e não grava, e a tela afirma isso', async () => {
    const { servico } = await abrirImportacao()

    await verPrevia(cenario({ linhas: 20, invalidos: 2, duplicados: 2 }).csv)

    expect(servico.previas.length).toBe(1)
    expect(servico.importacoes).toEqual([])
    expect(screen.getByText(copy.previa.semGravar)).toBeDefined()
  })

  it('a escolha do duplicado tem duas opções, e criar não é uma delas', async () => {
    await abrirImportacao()
    await verPrevia(cenario({ linhas: 20, invalidos: 2, duplicados: 2 }).csv)

    const escolha = screen.getByLabelText(copy.previa.decisao) as HTMLSelectElement
    expect([...escolha.options].map((opcao) => opcao.value)).toEqual([
      'ignorar',
      'atualizar',
    ])
    expect(screen.getByText(copy.previa.semCriar)).toBeDefined()
  })

  it('confirmada, grava o que a prévia prometeu e relata linha a linha', async () => {
    const { servico } = await abrirImportacao()
    const { csv } = cenario({ linhas: 20, invalidos: 2, duplicados: 2 })

    await verPrevia(csv)
    clicar(copy.previa.confirmar)

    await screen.findByText(copy.relatorio.titulo)

    expect(servico.importacoes.length).toBe(1)
    expect(servico.importacoes[0]?.aoDuplicar).toBe('ignorar')

    const resumo = screen.getByRole('status')
    // Dezesseis linhas boas viram lead, duas repetem no arquivo e duas estão
    // malformadas: é a mesma aritmética da prévia, agora do lado do banco.
    expect(resumo.textContent).toContain(`${copy.relatorio.criados} 16`)
    expect(resumo.textContent).toContain(`${copy.relatorio.ignorados} 2`)
    expect(resumo.textContent).toContain(`${copy.relatorio.atualizados} 0`)
    expect(resumo.textContent).toContain(`${copy.relatorio.erros} 2`)
    expect(
      within(screen.getByRole('list', { name: copy.relatorio.listaDeErros }))
        .getAllByRole('listitem').length,
    ).toBe(2)
    // jsdom não sabe criar endereço de objeto, e a tela diz isso em vez de
    // afirmar que baixou (`@/utilidades/download`).
    clicar(copy.relatorio.baixar)
    expect(await screen.findByText(copy.relatorio.semDownload)).toBeDefined()
  })

  it('telefone que já está na conta aparece como duplicado e pode atualizar o lead', async () => {
    const exemplo = cenario({ linhas: 6, invalidos: 1, duplicados: 1 })
    const telefone = exemplo.telefonesValidos[0] ?? ''
    const existente: LeadDeExemplo = {
      id: 'l-velho',
      nome: '',
      telefone,
      email: '',
      empresa: '',
      cidade: '',
      estado: '',
      etapa: null,
      temperatura: null,
      ultimaAtividade: null,
      criadoEm: new Date().toISOString(),
      bloqueado: false,
    }

    const { servico } = await abrirImportacao({ leads: [existente] })
    await verPrevia(exemplo.csv)

    // Quatro linhas com telefone bom, uma delas já na conta: três entram como
    // lead novo, e os dois tipos de duplicata somam dois.
    expect(quantasNoGrupo(copy.previa.validos)).toBe('3')
    expect(quantasNoGrupo(copy.previa.duplicados)).toBe('2')
    expect(screen.getByText(copy.previa.duplicadoNaBase)).toBeDefined()

    fireEvent.change(screen.getByLabelText(copy.previa.decisao), {
      target: { value: 'atualizar' },
    })
    clicar(copy.previa.confirmar)

    await screen.findByText(copy.relatorio.titulo)
    expect(servico.importacoes[0]?.aoDuplicar).toBe('atualizar')
    // O lead que já existia ganhou o nome que a planilha trouxe, e continua um
    // lead só: quem decide duplicata é o índice, não a prévia.
    const resumo = screen.getByRole('status')
    expect(resumo.textContent).toContain(`${copy.relatorio.criados} 3`)
    expect(resumo.textContent).toContain(`${copy.relatorio.atualizados} 1`)
  })

  it('espera da prévia é anunciada, e falha do servidor vira frase com saída', async () => {
    await abrirImportacao({
      leads: [],
      preverImportacao: { ok: false, motivo: 'sem-permissao' },
    })
    await escolher(cenario({ linhas: 5, invalidos: 1, duplicados: 1 }).csv)
    clicar(copy.arquivo.seguir)
    clicar(copy.mapeamento.seguir)

    expect(screen.getByRole('status').textContent).toContain(
      copy.previa.carregando,
    )

    const erro = await screen.findByRole('alert')
    expect(erro.textContent).toBe(copy.falhas['sem-permissao'])
  })

  it('quem só lê a conta abre a tela e não consegue escolher arquivo', async () => {
    const servico = criarServicoDeLeadsDublado({ leads: [] })
    const equipe = criarServicoDeEquipeDublado({
      carregar: { ok: true, equipe: equipeDeExemplo('viewer') },
    })

    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads/importar',
      equipe,
      undefined,
      undefined,
      undefined,
      servico,
    )

    expect(await screen.findByText(copy.leitura.aviso)).toBeDefined()
    expect(campoDeArquivo().disabled).toBe(true)
  })
})
