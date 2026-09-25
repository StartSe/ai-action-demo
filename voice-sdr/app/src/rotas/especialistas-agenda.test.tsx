// A agenda na ficha do especialista (US-176, RF-502 e RF-503).
//
// Três asserções justificam o arquivo:
//
// 1. **A ordem das horas se recusa na tela, antes de chegar ao banco**, e a
//    sobreposição de bloqueio, que só o banco enxerga, volta como frase
//    dizendo qual bloqueio já cobre o intervalo.
// 2. **As horas aparecem no fuso do especialista, dito ao lado**, e com a
//    conta em outro fuso a tela mostra os dois (T-21).
// 3. **Sem faixa nenhuma a tela diz a consequência**: a Sarah não vai
//    oferecer horário para esta pessoa.
//
// As datas se ancoram no relógio: bloqueio com data fixa viraria passado no
// mês que vem e mudaria de lista.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { comum } from '@/copy/comum'
import { especialistas as copyDosEspecialistas } from '@/copy/especialistas'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import type { Equipe, Papel } from '@/equipe/tipos'
import { rotularNoFuso } from '@/especialistas/agenda'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import type { Bloqueio, FaixaSemanal } from '@/especialistas/tipos'
import { TelaDeEspecialistas } from '@/rotas/especialistas'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeEspecialistasDublado,
  especialistaDeExemplo,
  type RespostasDeEspecialistas,
  type ServicoDeEspecialistasDublado,
} from '@/testes/servico-de-especialistas-dublado'

const copy = copyDosEspecialistas.agenda
const DIA = 86_400_000

/** A data civil de daqui a `dias` dias, como o campo `date` a escreve. */
function data(dias: number): string {
  return new Date(Date.now() + dias * DIA).toISOString().slice(0, 10)
}

/** O instante de daqui a `dias` dias, como a tabela o guarda. */
function instante(dias: number): string {
  return new Date(Date.now() + dias * DIA).toISOString()
}

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

/** Monta a tela com um especialista e abre a ficha dele. */
async function abrirFicha(
  {
    faixas = [],
    bloqueios = [],
    ...respostas
  }: RespostasDeEspecialistas & { faixas?: FaixaSemanal[]; bloqueios?: Bloqueio[] } = {},
  papel: Papel = 'admin',
): Promise<ServicoDeEspecialistasDublado> {
  const servico = criarServicoDeEspecialistasDublado({
    especialistas: [especialistaDeExemplo()],
    agendas: { 'especialista-1': { faixas, bloqueios } },
    ...respostas,
  })
  const equipe = criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: comPapel(papel) } })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDeEquipe servico={equipe}>
        <ProvedorDeEspecialistas servico={servico}>
          <TelaDeEspecialistas />
        </ProvedorDeEspecialistas>
      </ProvedorDeEquipe>
    </QueryClientProvider>,
  )
  const abrir = papel === 'operator' ? copyDosEspecialistas.leitura.ver : copyDosEspecialistas.acoes.editar
  fireEvent.click(await screen.findByRole('button', { name: abrir }))
  return servico
}

function regiao(nome: string) {
  return screen.getByRole('region', { name: nome })
}

function novaFaixa(dia: string, inicio: string, fim: string) {
  const disponibilidade = regiao(copy.disponibilidade.titulo)
  fireEvent.change(within(disponibilidade).getByLabelText(copy.disponibilidade.dia), {
    target: { value: String(copy.dias.indexOf(dia as (typeof copy.dias)[number])) },
  })
  fireEvent.change(within(disponibilidade).getByLabelText(copy.disponibilidade.inicio), {
    target: { value: inicio },
  })
  fireEvent.change(within(disponibilidade).getByLabelText(copy.disponibilidade.fim), {
    target: { value: fim },
  })
}

function preencherBloqueio(dias: number, horaInicio: string, horaFim: string, motivo = '') {
  const bloqueios = regiao(copy.bloqueios.titulo)
  const campo = (rotulo: string, valor: string) =>
    fireEvent.change(within(bloqueios).getByLabelText(rotulo), { target: { value: valor } })
  campo(copy.bloqueios.dataInicio, data(dias))
  campo(copy.bloqueios.horaInicio, horaInicio)
  campo(copy.bloqueios.dataFim, data(dias))
  campo(copy.bloqueios.horaFim, horaFim)
  campo(copy.bloqueios.motivo, motivo)
}

function doDia(dia: string) {
  const lista = screen.getByRole('list', { name: copy.disponibilidade.rotuloDaLista })
  return within(lista).getByRole('listitem', { name: dia })
}

afterEach(cleanup)

test('sem faixa nenhuma, a ficha diz que a Sarah não vai oferecer horário', async () => {
  await abrirFicha()

  expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
  expect(screen.getByText(copy.vazio.explicacao)).toBeDefined()
})

test('acrescentar faixa manda o dia e as horas, e a faixa aparece no dia', async () => {
  const servico = await abrirFicha()
  await screen.findByText(copy.vazio.titulo)

  novaFaixa('Terça', '09:00', '12:00')
  fireEvent.click(screen.getByRole('button', { name: copy.disponibilidade.acrescentar }))

  await waitFor(() => expect(servico.escritasDaAgenda).toHaveLength(1))
  expect(servico.escritasDaAgenda[0]).toEqual({
    tipo: 'acrescentarFaixa',
    pedido: { especialistaId: 'especialista-1', diaDaSemana: 2, inicio: '09:00', fim: '12:00' },
  })
  expect(await screen.findByText(copy.disponibilidade.acrescentada)).toBeDefined()
  await waitFor(() =>
    expect(within(doDia('Terça')).getByText(copy.disponibilidade.faixa('09:00', '12:00'))).toBeDefined(),
  )
  // A hora é valor: leva `.val`.
  expect(
    within(doDia('Terça')).getByText(copy.disponibilidade.faixa('09:00', '12:00')).className,
  ).toContain('val')
  expect(within(doDia('Quarta')).getByText(copy.disponibilidade.semFaixa)).toBeDefined()
})

test('duas faixas no mesmo dia convivem, da mais cedo para a mais tarde', async () => {
  const servico = await abrirFicha()
  await screen.findByText(copy.vazio.titulo)

  novaFaixa('Terça', '14:00', '18:00')
  fireEvent.click(screen.getByRole('button', { name: copy.disponibilidade.acrescentar }))
  await screen.findByText(copy.disponibilidade.acrescentada)

  novaFaixa('Terça', '09:00', '12:00')
  fireEvent.click(screen.getByRole('button', { name: copy.disponibilidade.acrescentar }))

  await waitFor(() => expect(servico.escritasDaAgenda).toHaveLength(2))
  await waitFor(() =>
    expect(
      [...doDia('Terça').querySelectorAll('.val')].map((elemento) => elemento.textContent),
    ).toEqual([copy.disponibilidade.faixa('09:00', '12:00'), copy.disponibilidade.faixa('14:00', '18:00')]),
  )
})

test('remover faixa tira a faixa do dia', async () => {
  const servico = await abrirFicha({
    faixas: [
      { id: 'f-1', diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
      { id: 'f-2', diaDaSemana: 1, inicio: '14:00', fim: '18:00' },
    ],
  })

  fireEvent.click(
    await screen.findByRole('button', {
      name: copy.disponibilidade.rotuloDoRemover('Segunda', '09:00', '12:00'),
    }),
  )

  await waitFor(() =>
    expect(servico.escritasDaAgenda).toEqual([{ tipo: 'removerFaixa', id: 'f-1' }]),
  )
  expect(await screen.findByText(copy.disponibilidade.removida)).toBeDefined()
  await waitFor(() =>
    expect(within(doDia('Segunda')).queryByText(copy.disponibilidade.faixa('09:00', '12:00'))).toBeNull(),
  )
  expect(within(doDia('Segunda')).getByText(copy.disponibilidade.faixa('14:00', '18:00'))).toBeDefined()
})

test('fim antes do início é recusado na tela, com a frase do campo, sem ir ao banco', async () => {
  const servico = await abrirFicha()
  await screen.findByText(copy.vazio.titulo)

  novaFaixa('Segunda', '14:00', '09:00')

  expect(screen.getByText(copy.problemasDaFaixa.ordem)).toBeDefined()
  const acrescentar = screen.getByRole('button', { name: copy.disponibilidade.acrescentar })
  expect(acrescentar).toHaveProperty('disabled', true)
  fireEvent.click(acrescentar)
  expect(servico.escritasDaAgenda).toHaveLength(0)
})

test('bloqueio sobreposto vira frase dizendo qual bloqueio já cobre o intervalo', async () => {
  const existente: Bloqueio = {
    id: 'b-1',
    inicio: instante(5),
    fim: instante(5.5),
    motivo: 'Férias',
  }
  const servico = await abrirFicha({ bloqueios: [existente] })
  await screen.findByRole('list', { name: copy.bloqueios.rotuloDaLista })

  // O intervalo novo cobre o dia inteiro do bloqueio existente.
  const bloqueios = regiao(copy.bloqueios.titulo)
  const campo = (rotulo: string, valor: string) =>
    fireEvent.change(within(bloqueios).getByLabelText(rotulo), { target: { value: valor } })
  campo(copy.bloqueios.dataInicio, data(4))
  campo(copy.bloqueios.horaInicio, '00:00')
  campo(copy.bloqueios.dataFim, data(7))
  campo(copy.bloqueios.horaFim, '00:00')
  fireEvent.click(screen.getByRole('button', { name: copy.bloqueios.acrescentar }))

  await waitFor(() => expect(servico.escritasDaAgenda).toHaveLength(1))
  const intervalo = copy.bloqueios.intervalo(
    rotularNoFuso(existente.inicio, 'America/Sao_Paulo'),
    rotularNoFuso(existente.fim, 'America/Sao_Paulo'),
  )
  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.sobreposto(intervalo, 'Férias'))
  // Nunca o código nem a mensagem do Postgres.
  expect(alerta.textContent).not.toMatch(/23P01|exclusion|constraint/i)
})

test('bloqueio sem data ou com fim antes do início não vai ao banco', async () => {
  const servico = await abrirFicha()
  await screen.findByText(copy.vazio.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.bloqueios.acrescentar }))
  expect(screen.getByText(copy.problemasDoBloqueio.inicio)).toBeDefined()

  preencherBloqueio(3, '15:00', '10:00')
  expect(screen.getByText(copy.problemasDoBloqueio.ordem)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: copy.bloqueios.acrescentar }))
  expect(servico.escritasDaAgenda).toHaveLength(0)
})

test('bloqueio novo grava no fuso do especialista e entra na lista', async () => {
  const servico = await abrirFicha()
  await screen.findByText(copy.vazio.titulo)

  preencherBloqueio(3, '10:00', '12:00', 'Consulta')
  fireEvent.click(screen.getByRole('button', { name: copy.bloqueios.acrescentar }))

  await waitFor(() => expect(servico.escritasDaAgenda).toHaveLength(1))
  const escrita = servico.escritasDaAgenda[0]
  if (escrita?.tipo !== 'acrescentarBloqueio') throw new Error('devia gravar bloqueio')
  expect(escrita.pedido.motivo).toBe('Consulta')
  // São Paulo é UTC−3: as 10h digitadas são 13h em UTC.
  expect(escrita.pedido.inicio).toBe(`${data(3)}T13:00:00.000Z`)
  expect(await screen.findByText(copy.bloqueios.acrescentado)).toBeDefined()
  const lista = await screen.findByRole('list', { name: copy.bloqueios.rotuloDaLista })
  expect(within(lista).getByText('Consulta')).toBeDefined()
})

test('bloqueios do mais próximo ao mais distante, com o passado recolhido', async () => {
  await abrirFicha({
    bloqueios: [
      { id: 'longe', inicio: instante(40), fim: instante(41), motivo: 'Viagem' },
      { id: 'velho', inicio: instante(-10), fim: instante(-9), motivo: 'Congresso' },
      { id: 'perto', inicio: instante(2), fim: instante(3), motivo: 'Férias' },
    ],
  })

  const lista = await screen.findByRole('list', { name: copy.bloqueios.rotuloDaLista })
  expect(
    within(lista)
      .getAllByRole('listitem')
      .map((item) => within(item).queryByText(/Viagem|Férias/)?.textContent),
  ).toEqual(['Férias', 'Viagem'])
  expect(within(lista).queryByText('Congresso')).toBeNull()

  // O passado mora num `details` fechado.
  const resumo = screen.getByText(copy.bloqueios.passados(1))
  const recolhido = resumo.closest('details')
  expect(recolhido?.open).toBe(false)
  expect(within(recolhido!).getByText('Congresso')).toBeDefined()
})

test('as horas vêm no fuso do especialista, e com a conta em outro fuso a tela mostra os dois', async () => {
  const bloqueio: Bloqueio = { id: 'b-1', inicio: instante(2), fim: instante(2.25), motivo: null }
  await abrirFicha({
    especialistas: [especialistaDeExemplo({ fuso: 'America/Manaus' })],
    fusoDaConta: 'America/Sao_Paulo',
    bloqueios: [bloqueio],
  })

  expect(await screen.findByText(copy.fuso('America/Manaus'))).toBeDefined()
  expect(screen.getByText(copy.fusoDaConta('America/Sao_Paulo'))).toBeDefined()

  const lista = screen.getByRole('list', { name: copy.bloqueios.rotuloDaLista })
  expect(
    within(lista).getByText(
      copy.bloqueios.intervalo(
        rotularNoFuso(bloqueio.inicio, 'America/Manaus'),
        rotularNoFuso(bloqueio.fim, 'America/Manaus'),
      ),
    ),
  ).toBeDefined()
  expect(
    within(lista).getByText(
      copy.bloqueios.naConta(
        'America/Sao_Paulo',
        rotularNoFuso(bloqueio.inicio, 'America/Sao_Paulo'),
        rotularNoFuso(bloqueio.fim, 'America/Sao_Paulo'),
      ),
    ),
  ).toBeDefined()
})

test('com o mesmo fuso da conta, a tela não repete o horário', async () => {
  await abrirFicha({
    bloqueios: [{ id: 'b-1', inicio: instante(2), fim: instante(3), motivo: null }],
  })

  expect(await screen.findByText(copy.fuso('America/Sao_Paulo'))).toBeDefined()
  expect(screen.queryByText(copy.fusoDaConta('America/Sao_Paulo'))).toBeNull()
  expect(screen.queryByText(/^Na conta/)).toBeNull()
})

test('o operador lê a agenda com tudo travado e sabe a quem pedir', async () => {
  const servico = await abrirFicha(
    {
      faixas: [{ id: 'f-1', diaDaSemana: 1, inicio: '09:00', fim: '12:00' }],
      bloqueios: [{ id: 'b-1', inicio: instante(2), fim: instante(3), motivo: 'Férias' }],
    },
    'operator',
  )

  expect(await screen.findByText(copy.leitura)).toBeDefined()
  expect(within(doDia('Segunda')).getByText(copy.disponibilidade.faixa('09:00', '12:00'))).toBeDefined()
  expect(
    within(screen.getByRole('list', { name: copy.bloqueios.rotuloDaLista })).getByText('Férias'),
  ).toBeDefined()

  for (const [nomeDaRegiao, rotulos] of [
    [copy.disponibilidade.titulo, [copy.disponibilidade.dia, copy.disponibilidade.inicio, copy.disponibilidade.fim]],
    [
      copy.bloqueios.titulo,
      [copy.bloqueios.dataInicio, copy.bloqueios.horaInicio, copy.bloqueios.dataFim, copy.bloqueios.horaFim, copy.bloqueios.motivo],
    ],
  ] as const) {
    for (const rotulo of rotulos) {
      expect({ rotulo, travado: (within(regiao(nomeDaRegiao)).getByLabelText(rotulo) as HTMLInputElement).disabled }).toEqual({ rotulo, travado: true })
    }
  }
  expect(screen.queryByRole('button', { name: copy.disponibilidade.acrescentar })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.bloqueios.acrescentar })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.disponibilidade.remover })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()

  // A quem pedir acesso: a negativa da tela lista quem administra.
  const pedir = screen.getByRole('list', { name: comum.negativaPorPapel.pedirAcesso })
  expect(within(pedir).getByText('Selma Dias')).toBeDefined()
  expect(servico.escritasDaAgenda).toHaveLength(0)
})

test('escrita que a RLS filtrou vira frase, nunca sucesso', async () => {
  await abrirFicha({ gravacaoDaAgenda: { ok: false, motivo: 'recusada' } })
  await screen.findByText(copy.vazio.titulo)

  novaFaixa('Segunda', '09:00', '12:00')
  fireEvent.click(screen.getByRole('button', { name: copy.disponibilidade.acrescentar }))

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.falhas.recusada)
  expect(screen.queryByText(copy.disponibilidade.acrescentada)).toBeNull()
})

test('a faixa repetida que o banco recusa vira frase', async () => {
  await abrirFicha({ faixas: [{ id: 'f-1', diaDaSemana: 1, inicio: '09:00', fim: '12:00' }] })
  await screen.findByRole('list', { name: copy.disponibilidade.rotuloDaLista })

  novaFaixa('Segunda', '09:00', '11:00')
  fireEvent.click(screen.getByRole('button', { name: copy.disponibilidade.acrescentar }))

  expect((await screen.findByRole('alert')).textContent).toBe(copy.falhas['faixa-repetida'])
})

test('carregando a agenda mostra o esqueleto', async () => {
  await abrirFicha({ agendaPendente: true })

  const espera = await screen.findByText(copy.carregando)
  expect(espera.closest('[role="status"]')?.querySelector('.esqueleto')).not.toBeNull()
})

test('a agenda que não carrega diz o que fazer, e tentar de novo relê', async () => {
  const servico = await abrirFicha({ falhaDaAgenda: 'falha-de-comunicacao' })

  expect(await screen.findByText(copy.falha)).toBeDefined()
  const carregar = servico.carregarAgenda.bind(servico)
  let leituras = 0
  servico.carregarAgenda = (id) => {
    leituras += 1
    return carregar(id)
  }
  fireEvent.click(screen.getByRole('button', { name: copy.tentarDeNovo }))
  await waitFor(() => expect(leituras).toBe(1))
})
