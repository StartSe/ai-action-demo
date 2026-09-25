// As ações em lote da lista de leads (RF-112). Arquivo à parte de
// `leads.test.tsx` de propósito: aquele é sobre o recorte — busca, filtros e
// ordenação — e este é sobre o que se faz com o que o recorte trouxe. O
// auxiliar de montagem é outro porque aqui o papel de quem olha importa, e a
// equipe entra dublada em toda montagem.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { leads as copy } from '@/copy/leads'
import type { Equipe, Papel } from '@/equipe/tipos'
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

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
function comPapel(papelDoUsuario: Papel): Equipe {
  return {
    ...equipeDeExemplo(),
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: null,
      },
      {
        usuarioId: 'u-9',
        nome: 'Selma Dias',
        email: 'selma@aurora.com.br',
        papel: 'owner',
        ultimoAcesso: null,
      },
    ],
  }
}

async function abrirLeads(
  respostas: RespostasDeLeads = {},
  papel: Papel = 'operator',
  caminho = '/leads',
) {
  const servico = criarServicoDeLeadsDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: comPapel(papel) },
  })

  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    equipe,
    undefined,
    undefined,
    undefined,
    servico,
  )

  await screen.findByRole('heading', { name: copy.titulo })
  await screen.findByRole('table', { name: copy.tabela.rotulo })
  return { servico }
}

function linhas() {
  const tabela = screen.getByRole('table', { name: copy.tabela.rotulo })
  return within(tabela).getAllByRole('row').slice(1)
}

/** Marca a linha do lead pelo nome, como quem clica na caixa dela. */
function marcar(nome: string) {
  fireEvent.click(screen.getByLabelText(copy.lote.selecionarLead(nome)))
}

function botao(rotulo: string): HTMLButtonElement {
  return screen.getByRole('button', { name: rotulo }) as HTMLButtonElement
}

/** A barra de ações, para medir o que ela oferece sem pegar o resto da tela. */
function barra() {
  return within(screen.getByRole('region', { name: copy.lote.rotulo }))
}

describe('seleção', () => {
  it('conta o selecionado e a contagem fica visível mesmo em zero', async () => {
    await abrirLeads()

    expect(barra().getByText(copy.lote.selecionados(0))).toBeDefined()

    marcar('Marina Castro')
    expect(barra().getByText(copy.lote.selecionados(1))).toBeDefined()

    marcar('Bruno Tavares')
    expect(barra().getByText(copy.lote.selecionados(2))).toBeDefined()
  })

  it('a caixa do cabeçalho marca e desmarca tudo o que está no recorte', async () => {
    await abrirLeads()

    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))
    expect(barra().getByText(copy.lote.selecionados(4))).toBeDefined()

    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))
    expect(barra().getByText(copy.lote.selecionados(0))).toBeDefined()
  })

  it('lead que sai do recorte sai da seleção', async () => {
    // Sem a poda, a barra contaria um lead que ninguém está vendo — e a ação
    // seguinte o alcançaria.
    await abrirLeads()

    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))
    expect(barra().getByText(copy.lote.selecionados(4))).toBeDefined()

    fireEvent.change(screen.getByLabelText(copy.filtros.temperatura), {
      target: { value: 'quente' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(barra().getByText(copy.lote.selecionados(1))).toBeDefined()
  })
})

describe('quais ações aparecem', () => {
  it('não oferece cadência nem campanha, que são de fatias seguintes', async () => {
    await abrirLeads()
    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))

    const rotulos = barra()
      .getAllByRole('button')
      .map((botao) => botao.textContent)

    expect(rotulos).toEqual([
      copy.lote.acoes.bloquear,
      copy.lote.acoes.desbloquear,
      copy.lote.acoes.exportar,
      copy.lote.acoes.excluir,
    ])
    expect(barra().queryByText(/cadência|campanha/i)).toBeNull()
  })

  it('mesclar só aparece com exatamente dois selecionados', async () => {
    await abrirLeads()

    expect(barra().queryByRole('button', { name: copy.lote.acoes.mesclar })).toBeNull()

    marcar('Marina Castro')
    expect(barra().queryByRole('button', { name: copy.lote.acoes.mesclar })).toBeNull()

    marcar('Bruno Tavares')
    expect(barra().getByRole('button', { name: copy.lote.acoes.mesclar })).toBeDefined()

    marcar('Célia Prado')
    expect(barra().queryByRole('button', { name: copy.lote.acoes.mesclar })).toBeNull()
  })

  it('sem seleção, só exportar fica clicável', async () => {
    await abrirLeads()

    expect(botao(copy.lote.acoes.bloquear).disabled).toBe(true)
    expect(botao(copy.lote.acoes.excluir).disabled).toBe(true)
    expect(botao(copy.lote.acoes.exportar).disabled).toBe(false)
  })
})

describe('bloquear e desbloquear', () => {
  it('bloquear pede o motivo antes de gravar', async () => {
    const { servico } = await abrirLeads()
    marcar('Marina Castro')

    fireEvent.click(botao(copy.lote.acoes.bloquear))
    const dialogo = within(screen.getByRole('dialog'))

    // Motivo em branco não grava: o check da tabela amarra o par, e bloqueio
    // sem motivo não informa nada a quem revisar a lista.
    fireEvent.click(dialogo.getByRole('button', { name: copy.bloqueio.confirmar }))
    expect(await screen.findByText(copy.bloqueio.motivoObrigatorio)).toBeDefined()
    expect(servico.bloqueados).toHaveLength(0)

    fireEvent.change(dialogo.getByLabelText(copy.bloqueio.motivo), {
      target: { value: 'Pediu para não ser chamada.' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.bloqueio.confirmar }))

    await waitFor(() => expect(servico.bloqueados).toHaveLength(1))
    expect(servico.bloqueados[0]).toEqual({
      ids: ['l-1'],
      motivo: 'Pediu para não ser chamada.',
    })
  })

  it('bloquear grava um lead_event por lead', async () => {
    const { servico } = await abrirLeads()

    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))
    fireEvent.click(botao(copy.lote.acoes.bloquear))
    fireEvent.change(screen.getByLabelText(copy.bloqueio.motivo), {
      target: { value: 'Base comprada.' },
    })
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.bloqueio.confirmar,
      }),
    )

    await waitFor(() => expect(servico.eventos).toHaveLength(4))
    expect(servico.eventos.every((evento) => evento.kind === 'blocked')).toBe(true)
  })

  it('desbloquear não pergunta nada e grava o evento inverso', async () => {
    const { servico } = await abrirLeads()
    marcar('Célia Prado')

    fireEvent.click(botao(copy.lote.acoes.desbloquear))

    await waitFor(() => expect(servico.desbloqueados).toHaveLength(1))
    expect(servico.desbloqueados[0]?.ids).toEqual(['l-4'])
    expect(servico.eventos).toEqual([
      { id: 'l-4', kind: 'unblocked', actor: 'user' },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancelar fecha o diálogo sem gravar', async () => {
    const { servico } = await abrirLeads()
    marcar('Marina Castro')

    fireEvent.click(botao(copy.lote.acoes.bloquear))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.cancelar,
      }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(servico.bloqueados).toHaveLength(0)
  })
})

describe('excluir', () => {
  it('confirma dizendo quantos leads apaga e que não dá para desfazer', async () => {
    const { servico } = await abrirLeads()
    marcar('Marina Castro')
    marcar('Bruno Tavares')

    fireEvent.click(botao(copy.lote.acoes.excluir))

    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByText(copy.exclusao.aviso(2))).toBeDefined()
    expect(copy.exclusao.aviso(2)).toContain('irreversível')
    expect(servico.excluidos).toHaveLength(0)

    fireEvent.click(dialogo.getByRole('button', { name: copy.exclusao.confirmar }))

    await waitFor(() => expect(servico.excluidos).toHaveLength(1))
    expect(servico.excluidos[0]?.ids).toEqual(['l-1', 'l-2'])
  })

  it('a lista perde as linhas apagadas sem sair da tela', async () => {
    await abrirLeads()
    marcar('Marina Castro')

    fireEvent.click(botao(copy.lote.acoes.excluir))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.exclusao.confirmar,
      }),
    )

    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(screen.queryByText('Marina Castro')).toBeNull()
  })
})

describe('mesclar', () => {
  it('pergunta qual lead permanece e chama o RPC com os dois', async () => {
    const { servico } = await abrirLeads()
    marcar('Marina Castro')
    marcar('Bruno Tavares')

    fireEvent.click(botao(copy.lote.acoes.mesclar))
    const dialogo = within(screen.getByRole('dialog'))

    fireEvent.change(dialogo.getByLabelText(copy.mesclagem.escolha), {
      target: { value: 'l-2' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.mesclagem.confirmar }))

    await waitFor(() => expect(servico.mesclagens).toHaveLength(1))
    // Quem permanece é o destino; o outro é a origem, e é ele que sai da lista.
    expect(servico.mesclagens[0]).toEqual({ origem: 'l-1', destino: 'l-2' })
  })

  it('mostra o motivo quando o RPC recusa', async () => {
    await abrirLeads({ mesclar: { ok: false, motivo: 'ja-mesclado' } })
    marcar('Marina Castro')
    marcar('Bruno Tavares')

    fireEvent.click(botao(copy.lote.acoes.mesclar))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.mesclagem.confirmar,
      }),
    )

    expect(
      await screen.findByText(copy.falhasDaMesclagem['ja-mesclado']),
    ).toBeDefined()
  })
})

/**
 * O download é do navegador, e jsdom não o tem. O coto troca a criação do
 * endereço de objeto e o clique do âncora — o resto de `baixarTexto` roda de
 * verdade —, e guarda o que teria sido salvo. O clique precisa ser cotado
 * também: jsdom não entende o atributo `download` e trataria o âncora como
 * navegação, que ele também não implementa.
 */
function comDownload(): {
  salvos: { nome: string; tipo: string }[]
  restaurar: () => void
} {
  const salvos: { nome: string; tipo: string }[] = []
  const criar = URL.createObjectURL
  const revogar = URL.revokeObjectURL
  const clicar = HTMLAnchorElement.prototype.click

  let tipo = ''
  URL.createObjectURL = (objeto: Blob | MediaSource) => {
    tipo = (objeto as Blob).type
    return 'blob:leads'
  }
  URL.revokeObjectURL = () => {}
  HTMLAnchorElement.prototype.click = function estePorta(this: HTMLAnchorElement) {
    salvos.push({ nome: this.download, tipo })
  }

  return {
    salvos,
    restaurar: () => {
      URL.createObjectURL = criar
      URL.revokeObjectURL = revogar
      HTMLAnchorElement.prototype.click = clicar
    },
  }
}

describe('exportar', () => {
  it('manda o recorte da tela e não recarrega a lista', async () => {
    const { servico } = await abrirLeads({}, 'operator', '/leads?etapa=lost')
    await waitFor(() => expect(linhas()).toHaveLength(1))

    const consultas = servico.recortes.length
    fireEvent.click(botao(copy.lote.acoes.exportar))

    await waitFor(() => expect(servico.exportados).toHaveLength(1))
    expect(servico.exportados[0]?.etapa).toBe('lost')
    // "Sem recarregar a lista": exportar não muda linha nenhuma, e refazer a
    // consulta piscaria a tabela inteira por nada.
    expect(servico.recortes).toHaveLength(consultas)
  })

  it('não exige seleção, porque exporta o recorte e não o marcado', async () => {
    const { servico } = await abrirLeads()

    fireEvent.click(botao(copy.lote.acoes.exportar))

    await waitFor(() => expect(servico.exportados).toHaveLength(1))
    expect(servico.exportados[0]).toEqual({})
  })

  it('baixa o arquivo que a borda devolveu e diz quantos leads foram', async () => {
    const download = comDownload()
    try {
      await abrirLeads()

      fireEvent.click(botao(copy.lote.acoes.exportar))

      expect(await screen.findByText(copy.exportacao.pronta(4))).toBeDefined()
      // O nome vem da borda, que é quem sabe a data do arquivo.
      expect(download.salvos).toEqual([
        { nome: 'leads-2026-09-21.csv', tipo: 'text/csv;charset=utf-8' },
      ])
    } finally {
      download.restaurar()
    }
  })

  it('diz quantos leads o recorte deixou de fora quando bateu no teto', async () => {
    const download = comDownload()
    try {
      await abrirLeads({
        exportar: {
          ok: true,
          arquivo: {
            nome: 'leads-2026-09-21.csv',
            conteudo: 'nome\n',
            linhas: 50_000,
            foraDoArquivo: 1_200,
          },
        },
      })

      fireEvent.click(botao(copy.lote.acoes.exportar))

      // O número é o ponto: "alguns leads não couberam" manda conferir 50 mil
      // linhas para descobrir quais.
      expect(
        await screen.findByText(new RegExp(copy.exportacao.fora(1_200))),
      ).toBeDefined()
    } finally {
      download.restaurar()
    }
  })

  it('mostra o motivo quando a borda recusa', async () => {
    await abrirLeads({ exportar: { ok: false, motivo: 'recorte-vazio' } })

    fireEvent.click(botao(copy.lote.acoes.exportar))

    expect(
      await screen.findByText(copy.falhasDaExportacao['recorte-vazio']),
    ).toBeDefined()
  })
})

describe('resultado do lote', () => {
  it('lote inteiro é uma frase só', async () => {
    await abrirLeads()
    marcar('Célia Prado')

    fireEvent.click(botao(copy.lote.acoes.desbloquear))

    expect(await screen.findByText(copy.resultados.desbloquear(1, 1))).toBeDefined()
    expect(screen.queryByText(copy.resultados.recusados)).toBeNull()
  })

  it('lote parcial é resultado, com a lista de quem a política recusou', async () => {
    await abrirLeads({
      // A política alcançou dois dos três: o terceiro não voltou do banco.
      excluir: { ok: true, resultado: { feitos: ['l-1', 'l-2'], recusados: ['l-3'] } },
    })

    marcar('Marina Castro')
    marcar('Bruno Tavares')
    marcar('+5521977776666')

    fireEvent.click(botao(copy.lote.acoes.excluir))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.exclusao.confirmar,
      }),
    )

    const relato = await screen.findByRole('status')
    expect(within(relato).getByText(copy.resultados.excluir(2, 3))).toBeDefined()
    // Quem ficou de fora vem nomeado: o lead sem nome pelo telefone.
    const recusados = within(relato).getByRole('list', {
      name: copy.resultados.recusados,
    })
    expect(within(recusados).getByText('+5521977776666')).toBeDefined()
  })

  it('lote inteiramente recusado é falha, com a frase da escrita', async () => {
    // Nenhuma linha voltou: a RLS recusou tudo, e em silêncio.
    await abrirLeads({ excluir: { ok: false, motivo: 'sem-permissao' } })
    marcar('Marina Castro')

    fireEvent.click(botao(copy.lote.acoes.excluir))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.exclusao.confirmar,
      }),
    )

    expect(
      await screen.findByText(copy.falhasDaEscrita['sem-permissao']),
    ).toBeDefined()
    // A frase da escrita não é a da leitura: quem não pode alterar ainda vê.
    expect(copy.falhasDaEscrita['sem-permissao']).not.toBe(
      copy.falhas['sem-permissao'],
    )
  })
})

describe('papel de quem olha', () => {
  it('viewer vê a negativa, o motivo e a quem pedir acesso', async () => {
    await abrirLeads({}, 'viewer')

    const negativa = screen.getByRole('alert')
    expect(within(negativa).getByText(copy.lote.negativa.aviso)).toBeDefined()

    const administradores = within(negativa).getByRole('list', {
      name: copy.lote.negativa.pedirAcesso,
    })
    expect(within(administradores).getByText('Selma Dias')).toBeDefined()
  })

  it('viewer tem as ações de escrita desabilitadas, e exporta', async () => {
    await abrirLeads({}, 'viewer')
    fireEvent.click(screen.getByLabelText(copy.lote.selecionarTudo))

    expect(botao(copy.lote.acoes.bloquear).disabled).toBe(true)
    expect(botao(copy.lote.acoes.desbloquear).disabled).toBe(true)
    expect(botao(copy.lote.acoes.excluir).disabled).toBe(true)
    // Exportar continua: a política da exportação só cobra ser membro.
    expect(botao(copy.lote.acoes.exportar).disabled).toBe(false)
  })

  it('operador não vê negativa nenhuma', async () => {
    await abrirLeads({}, 'operator')

    expect(screen.queryByText(copy.lote.negativa.aviso)).toBeNull()
    expect(botao(copy.lote.acoes.exportar).disabled).toBe(false)
  })
})
