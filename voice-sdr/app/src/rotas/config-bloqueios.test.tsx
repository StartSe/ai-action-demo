// O que esta tela precisa provar: os quatro estados e os dois vazios, a
// inclusão com o número normalizado, a importação que só grava depois da
// prévia, a remoção que exige motivo e deixa a linha no recorte de removidos, a
// reinclusão sem conflito, o filtro por estado e origem e a leitura para o
// viewer.
//
// Duas asserções justificam o arquivo. Digitar `(48) 99999-8888` tem que chegar
// ao serviço como `+5548999998888`, senão o bloqueio não pega na hora de
// discar. E remover tem que deixar o bloqueio na lista de removidos, com quem
// removeu e por quê: a linha que some não responde a pergunta que RF-804 faz.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Bloqueio } from '@/bloqueios/tipos'
import { comum } from '@/copy/comum'
import { bloqueios as copy, ORIGEM_DO_BLOQUEIO } from '@/copy/bloqueios'
import { RECUSA_DO_TELEFONE } from '@/copy/leads'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  bloqueioDeExemplo,
  criarServicoDeBloqueiosDublado,
  type RespostasDeBloqueios,
  type ServicoDeBloqueiosDublado,
} from '@/testes/servico-de-bloqueios-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const CAMINHO = '/config/bloqueios'

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

async function montar(bloqueios: ServicoDeBloqueiosDublado, papel: Papel) {
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    CAMINHO,
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: comPapel(papel) } }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    bloqueios,
  )
}

async function abrir(
  respostas: RespostasDeBloqueios = {},
  papel: Papel = 'operator',
): Promise<ServicoDeBloqueiosDublado> {
  const bloqueios = criarServicoDeBloqueiosDublado(respostas)
  await montar(bloqueios, papel)
  return bloqueios
}

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

async function tabela(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: copy.tabela.rotulo })
}

function linhaDe(tabelaDaTela: HTMLElement, e164: string): HTMLElement {
  const linha = within(tabelaDaTela).getByText(e164).closest('tr')
  if (!linha) throw new Error(`linha de ${e164} não encontrada`)
  return linha
}

const ATIVO = (): Bloqueio =>
  bloqueioDeExemplo({
    e164: '+5511988887777',
    motivo: 'Pediu para sair da lista',
    incluidoPor: 'u-9',
  })

afterEach(cleanup)

describe('/config/bloqueios', () => {
  describe('os quatro estados', () => {
    it('espera com a frase do que está carregando', async () => {
      const bloqueios = criarServicoDeBloqueiosDublado()
      bloqueios.carregar = () => new Promise(() => {})
      await montar(bloqueios, 'operator')

      expect(await screen.findByText(copy.carregando)).toBeTruthy()
    })

    it('falha com a frase do motivo', async () => {
      await abrir({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })

      const alerta = await screen.findByRole('alert')
      expect(alerta.textContent).toBe(copy.falhas['falha-de-comunicacao'])
    })

    it('conta sem nenhum bloqueio tem o vazio da lista', async () => {
      await abrir()

      expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
      expect(screen.queryByText(copy.semResultado.titulo)).toBeNull()
    })

    it('recorte sem resultado tem o vazio próprio, não o da conta', async () => {
      await abrir({ bloqueios: [ATIVO()] })
      await tabela()

      fireEvent.change(screen.getByLabelText(copy.filtros.estado), {
        target: { value: 'removido' },
      })

      expect(await screen.findByText(copy.semResultado.titulo)).toBeTruthy()
      expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
    })

    it('a lista desenha número, motivo, origem, quem incluiu e quando', async () => {
      await abrir({
        bloqueios: [
          ATIVO(),
          bloqueioDeExemplo({
            e164: '+5521977776666',
            motivo: 'Atendeu outra pessoa',
            origem: 'wrong_number',
            incluidoPor: null,
          }),
        ],
      })

      const lista = await tabela()
      const cabecalhos = within(lista)
        .getAllByRole('columnheader')
        .map((th) => th.textContent)
      expect(cabecalhos).toEqual([
        copy.tabela.numero,
        copy.tabela.motivo,
        copy.tabela.origem,
        copy.tabela.incluidoPor,
        copy.tabela.incluidoEm,
        copy.tabela.acao,
      ])

      const manual = linhaDe(lista, '+5511988887777')
      expect(within(manual).getByText('+5511988887777').className).toContain('val')
      expect(within(manual).getByText('Selma Dias')).toBeTruthy()
      expect(within(manual).getByText(ORIGEM_DO_BLOQUEIO.manual)).toBeTruthy()

      const errado = linhaDe(lista, '+5521977776666')
      expect(within(errado).getByText('Número errado, marcado na ligação')).toBeTruthy()
      expect(within(errado).getByText(copy.tabela.sarah)).toBeTruthy()
    })

    it('diz o efeito imediato: a guarda recusa antes de gastar crédito', async () => {
      await abrir()

      expect(await screen.findByText(copy.efeito)).toBeTruthy()
    })
  })

  describe('incluir', () => {
    it('grava o número normalizado, e não como foi digitado', async () => {
      const bloqueios = await abrir()

      fireEvent.click(await screen.findByRole('button', { name: copy.incluir.abrir }))
      preencher(copy.incluir.numero, '(48) 99999-8888')
      preencher(copy.incluir.motivo, 'Pediu por e-mail')
      fireEvent.click(screen.getByRole('button', { name: copy.incluir.gravar }))

      expect((await screen.findByRole('status')).textContent).toBe(
        copy.incluir.feito('+5548999998888'),
      )
      expect(bloqueios.inclusoes).toEqual([
        { e164: '+5548999998888', motivo: 'Pediu por e-mail' },
      ])
      expect(within(await tabela()).getByText('+5548999998888')).toBeTruthy()
    })

    it('número que não se normaliza é recusado no campo e não vai ao servidor', async () => {
      const bloqueios = await abrir()

      fireEvent.click(await screen.findByRole('button', { name: copy.incluir.abrir }))
      preencher(copy.incluir.numero, '(48) 8888-777')
      preencher(copy.incluir.motivo, 'Pediu')
      fireEvent.click(screen.getByRole('button', { name: copy.incluir.gravar }))

      expect(await screen.findByText(RECUSA_DO_TELEFONE.comprimento_invalido)).toBeTruthy()
      expect(bloqueios.inclusoes).toEqual([])
    })

    it('número já bloqueado mostra a frase da recusa', async () => {
      await abrir({ bloqueios: [ATIVO()] })

      fireEvent.click(await screen.findByRole('button', { name: copy.incluir.abrir }))
      preencher(copy.incluir.numero, '11 98888-7777')
      preencher(copy.incluir.motivo, 'De novo')
      fireEvent.click(screen.getByRole('button', { name: copy.incluir.gravar }))

      expect(await screen.findByText(copy.falhas['ja-bloqueado'])).toBeTruthy()
    })

    it('o número removido entra de novo sem conflito', async () => {
      const bloqueios = await abrir({
        bloqueios: [
          bloqueioDeExemplo({
            e164: '+5548999998888',
            removidoEm: '2026-09-21T10:00:00.000Z',
            removidoPor: 'u-9',
            motivoDaRemocao: 'Era engano',
          }),
        ],
      })

      fireEvent.click(await screen.findByRole('button', { name: copy.incluir.abrir }))
      preencher(copy.incluir.numero, '48 99999-8888')
      preencher(copy.incluir.motivo, 'Pediu de novo')
      fireEvent.click(screen.getByRole('button', { name: copy.incluir.gravar }))

      expect((await screen.findByRole('status')).textContent).toBe(
        copy.incluir.feito('+5548999998888'),
      )
      expect(bloqueios.linhas.filter((linha) => linha.e164 === '+5548999998888')).toHaveLength(2)
    })
  })

  describe('importar', () => {
    const LISTA = ['telefone', '(48) 99999-8888', '11 98888-7777', '1234', '21 97777-6666'].join(
      '\n',
    )

    it('mostra válidos, inválidos e já bloqueados, e não grava antes de confirmar', async () => {
      const bloqueios = await abrir({ bloqueios: [ATIVO()] })

      fireEvent.click(await screen.findByRole('button', { name: copy.importar.abrir }))
      preencher(copy.importar.lista, LISTA)
      preencher(copy.importar.motivo, 'Lista do jurídico')
      fireEvent.click(screen.getByRole('button', { name: copy.importar.prever }))

      const resumo = await screen.findByRole('list', { name: copy.importar.previa.titulo })
      expect(within(resumo).getByText(copy.importar.previa.lidas(4))).toBeTruthy()
      expect(within(resumo).getByText(copy.importar.previa.validos(2))).toBeTruthy()
      expect(within(resumo).getByText(copy.importar.previa.invalidos(1))).toBeTruthy()
      expect(within(resumo).getByText(copy.importar.previa.jaBloqueados(1))).toBeTruthy()

      const recusadas = screen.getByRole('list', { name: copy.importar.previa.rotuloDosInvalidos })
      expect(recusadas.textContent).toContain('1234')
      expect(recusadas.textContent).toContain(RECUSA_DO_TELEFONE.comprimento_invalido)

      // A prévia não escreve nada.
      expect(bloqueios.importacoes).toEqual([])
      expect(bloqueios.linhas).toHaveLength(1)

      fireEvent.click(
        screen.getByRole('button', { name: copy.importar.previa.confirmar(2) }),
      )

      expect((await screen.findByRole('status')).textContent).toBe(copy.importar.feito(2))
      expect(bloqueios.importacoes).toEqual([{ texto: LISTA, motivo: 'Lista do jurídico' }])

      const lista = await tabela()
      const importada = linhaDe(lista, '+5548999998888')
      expect(within(importada).getByText(ORIGEM_DO_BLOQUEIO.import)).toBeTruthy()
    })

    it('sem motivo, a importação não chega à prévia', async () => {
      const bloqueios = await abrir()

      fireEvent.click(await screen.findByRole('button', { name: copy.importar.abrir }))
      preencher(copy.importar.lista, LISTA)
      fireEvent.click(screen.getByRole('button', { name: copy.importar.prever }))

      expect(await screen.findByText(copy.importar.semMotivo)).toBeTruthy()
      expect(bloqueios.previas).toEqual([])
    })

    it('lê a lista de um arquivo', async () => {
      await abrir()

      fireEvent.click(await screen.findByRole('button', { name: copy.importar.abrir }))
      const arquivo = new File(['numero\n48 99999-8888\n'], 'lista.csv', { type: 'text/csv' })
      fireEvent.change(screen.getByLabelText(copy.importar.arquivo), {
        target: { files: [arquivo] },
      })

      await waitFor(() =>
        expect((screen.getByLabelText(copy.importar.lista) as HTMLTextAreaElement).value).toContain(
          '48 99999-8888',
        ),
      )
    })
  })

  describe('remover', () => {
    it('exige motivo, é update e deixa o bloqueio no recorte de removidos', async () => {
      const bloqueios = await abrir({ bloqueios: [ATIVO()] })

      fireEvent.click(
        within(await tabela()).getByRole('button', {
          name: copy.tabela.removerRotulo('+5511988887777'),
        }),
      )

      const dialogo = screen.getByRole('dialog')
      const confirmar = within(dialogo).getByRole('button', { name: copy.remover.confirmar })
      expect((confirmar as HTMLButtonElement).disabled).toBe(true)

      fireEvent.change(within(dialogo).getByLabelText(copy.remover.motivo), {
        target: { value: 'O cliente pediu para voltar' },
      })
      expect((confirmar as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(confirmar)

      expect((await screen.findByRole('status')).textContent).toBe(
        copy.remover.feito('+5511988887777'),
      )
      expect(bloqueios.remocoes).toEqual([
        { id: bloqueios.linhas[0]!.id, motivo: 'O cliente pediu para voltar' },
      ])
      expect(await screen.findByText(copy.semResultado.titulo)).toBeTruthy()

      fireEvent.change(screen.getByLabelText(copy.filtros.estado), {
        target: { value: 'removido' },
      })

      const removidos = await tabela()
      const linha = linhaDe(removidos, '+5511988887777')
      expect(within(linha).getByText('O cliente pediu para voltar')).toBeTruthy()
      // Incluído por Selma, removido por quem está na sessão.
      expect(within(linha).getByText('Selma Dias')).toBeTruthy()
      expect(within(linha).getByText('Renata Alves')).toBeTruthy()
      expect(
        within(removidos)
          .getAllByRole('columnheader')
          .map((th) => th.textContent),
      ).toContain(copy.tabela.motivoDaRemocao)
    })
  })

  describe('filtros', () => {
    it('a origem recorta a lista e o pedido chega ao serviço', async () => {
      const bloqueios = await abrir({
        bloqueios: [
          ATIVO(),
          bloqueioDeExemplo({
            e164: '+5521977776666',
            origem: 'wrong_number',
            incluidoPor: null,
          }),
        ],
      })
      await tabela()

      fireEvent.change(screen.getByLabelText(copy.filtros.origem), {
        target: { value: 'wrong_number' },
      })

      await waitFor(() => {
        expect(screen.queryByText('+5511988887777')).toBeNull()
      })
      expect(within(await tabela()).getByText('+5521977776666')).toBeTruthy()
      expect(bloqueios.recortes.at(-1)).toEqual({ estado: 'ativo', origem: 'wrong_number' })
    })
  })

  describe('papel', () => {
    it('o viewer lê a lista com a negativa explícita e sem ação de escrita', async () => {
      await abrir({ bloqueios: [ATIVO()] }, 'viewer')

      const lista = await tabela()
      expect(within(lista).getByText('+5511988887777')).toBeTruthy()

      const negativa = screen.getByRole('alert')
      expect(negativa.textContent).toContain(copy.leitura.aviso)
      expect(negativa.textContent).toContain(comum.negativaPorPapel.pedirAcesso)

      expect(screen.queryByRole('button', { name: copy.incluir.abrir })).toBeNull()
      expect(screen.queryByRole('button', { name: copy.importar.abrir })).toBeNull()
      expect(
        within(lista)
          .getAllByRole('columnheader')
          .map((th) => th.textContent),
      ).not.toContain(copy.tabela.acao)
    })
  })
})
