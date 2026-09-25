// O freio de emergência (RF-011) na casca: um clique, uma confirmação que diz
// o que vai acontecer, e o estado "discagem pausada" em toda tela.
//
// "Em toda tela" se prova percorrendo telas de trilhas diferentes, e não
// olhando o painel: o aviso mora na casca justamente para não depender da tela
// que está aberta. A verificação visual (o aviso não some atrás de nada, o
// botão cabe na barra estreita) é do degrau 3.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { freio as copy } from '@/copy/chamadas'
import type { Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeChamadasDublado,
  type RespostasDeChamadas,
} from '@/testes/servico-de-chamadas-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const PUXADO = {
  em: '2026-09-23T15:40:00.000Z',
  por: 'Selma Dias',
  motivo: 'Reclamação de cliente sobre o horário',
}

/** Uma tela de cada trilha, mais o painel. */
const TELAS = ['/', '/leads', '/numeros', '/sarah/identidade', '/config/equipe', '/config/auditoria']

async function abrir(
  caminho: string,
  respostas: RespostasDeChamadas = {},
  papel: Papel = 'admin',
) {
  const chamadas = criarServicoDeChamadasDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    chamadas,
  )
  return chamadas
}

function avisoDePausa() {
  return screen.queryByRole('status', { name: copy.pausada.rotulo })
}

afterEach(cleanup)

describe('o freio de emergência', () => {
  it.each(TELAS)('está ao alcance em %s', async (caminho) => {
    await abrir(caminho)

    expect(await screen.findByRole('button', { name: copy.acionar })).toBeTruthy()
  })

  it('um clique abre a confirmação, que diz o que vai acontecer', async () => {
    const chamadas = await abrir('/leads')

    fireEvent.click(await screen.findByRole('button', { name: copy.acionar }))

    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(copy.confirmar.titulo)).toBeTruthy()
    expect(within(dialogo).getByText(copy.confirmar.explicacao)).toBeTruthy()
    // Nada acontece antes da confirmação.
    expect(chamadas.paradas).toEqual([])
  })

  it('confirmar exige o motivo, para e troca o botão pelo aviso de discagem pausada', async () => {
    const chamadas = await abrir('/numeros')

    fireEvent.click(await screen.findByRole('button', { name: copy.acionar }))
    const dialogo = screen.getByRole('dialog')
    const parar = within(dialogo).getByRole('button', {
      name: copy.confirmar.acao,
    }) as HTMLButtonElement
    expect(parar.disabled).toBe(true)

    fireEvent.change(within(dialogo).getByLabelText(copy.confirmar.motivo), {
      target: { value: 'Lista errada importada' },
    })
    fireEvent.click(parar)

    await waitFor(() => expect(avisoDePausa()).toBeTruthy())
    expect(chamadas.paradas).toEqual(['Lista errada importada'])
    expect(avisoDePausa()?.textContent).toContain('Motivo: Lista errada importada')
    expect(screen.queryByRole('button', { name: copy.acionar })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancelar não para nada', async () => {
    const chamadas = await abrir('/')

    fireEvent.click(await screen.findByRole('button', { name: copy.acionar }))
    fireEvent.click(screen.getByRole('button', { name: copy.confirmar.cancelar }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chamadas.paradas).toEqual([])
    expect(avisoDePausa()).toBeNull()
  })

  it.each<Papel>(['operator', 'viewer'])(
    'para %s, o botão existe desligado e a razão fica escrita',
    async (papel) => {
      await abrir('/', {}, papel)

      const botao = (await screen.findByRole('button', { name: copy.acionar })) as HTMLButtonElement
      expect(botao.disabled).toBe(true)
      expect(screen.getByText(copy.soAdmin)).toBeTruthy()
    },
  )
})

describe('a discagem pausada', () => {
  it.each(TELAS)('fica visível em %s, com quem pausou, quando e o motivo', async (caminho) => {
    await abrir(caminho, { freio: PUXADO })

    await waitFor(() => expect(avisoDePausa()).toBeTruthy())
    const texto = avisoDePausa()?.textContent ?? ''
    expect(texto).toContain(copy.pausada.titulo)
    expect(texto).toContain(copy.pausada.quem('Selma Dias'))
    expect(texto).toMatch(/23\/09\/2026/)
    expect(texto).toContain(copy.pausada.motivo(PUXADO.motivo))
  })

  it('retomar é ação separada, de admin, e pede confirmação com motivo', async () => {
    const chamadas = await abrir('/leads', { freio: PUXADO })

    fireEvent.click(await screen.findByRole('button', { name: copy.pausada.retomar }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(copy.confirmarRetomada.titulo)).toBeTruthy()
    expect(chamadas.retomadas).toEqual([])

    fireEvent.change(within(dialogo).getByLabelText(copy.confirmarRetomada.motivo), {
      target: { value: 'Lista corrigida' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: copy.confirmarRetomada.acao }))

    await waitFor(() => expect(avisoDePausa()).toBeNull())
    expect(chamadas.retomadas).toEqual(['Lista corrigida'])
    expect(await screen.findByRole('button', { name: copy.acionar })).toBeTruthy()
  })

  it('quem não administra vê a pausa e não tem como retomar', async () => {
    await abrir('/', { freio: PUXADO }, 'operator')

    await waitFor(() => expect(avisoDePausa()).toBeTruthy())
    expect(screen.queryByRole('button', { name: copy.pausada.retomar })).toBeNull()
    expect(within(avisoDePausa() as HTMLElement).getByText(copy.pausada.soAdminRetoma)).toBeTruthy()
  })
})
