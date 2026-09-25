// O cartão do calendário na ficha do especialista (US-177, RF-507).
//
// Três asserções justificam o arquivo:
//
// 1. **O endereço iCal é o caminho padrão, e o OAuth do Google só aparece
//    configurado.** A tela pergunta a calendar-connect ao abrir; sem o
//    aplicativo do Google na instalação, não há botão nem espera.
// 2. **Desconectar diz a consequência antes de apagar**: a ocupação lida deixa
//    de valer e os horários saem só da disponibilidade interna.
// 3. **Sincronização parada não é agenda vazia**: a frase diz desde quando.
//
// As datas se ancoram no relógio: "há 3 horas" com instante fixo viraria
// "há 2 dias" na semana que vem.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { MENSAGENS_DO_CALENDARIO } from '@compartilhado/agenda/calendario.ts'

import { especialistas as copyDosEspecialistas } from '@/copy/especialistas'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import type { Equipe, Papel } from '@/equipe/tipos'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import type { ConexaoDoCalendario } from '@/especialistas/tipos'
import { TelaDeEspecialistas } from '@/rotas/especialistas'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import {
  ENDERECO_DE_AUTORIZACAO,
  criarServicoDeEspecialistasDublado,
  especialistaDeExemplo,
  type RespostasDeEspecialistas,
  type ServicoDeEspecialistasDublado,
} from '@/testes/servico-de-especialistas-dublado'

const copy = copyDosEspecialistas.cartaoDoCalendario
const MINUTO = 60_000

function haMinutos(minutos: number): string {
  return new Date(Date.now() - minutos * MINUTO).toISOString()
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
    ],
  }
}

/** Monta a tela com um especialista e abre a ficha dele. */
async function abrirFicha(
  { calendario, ...respostas }: RespostasDeEspecialistas & { calendario?: ConexaoDoCalendario } = {},
  papel: Papel = 'admin',
): Promise<ServicoDeEspecialistasDublado> {
  const servico = criarServicoDeEspecialistasDublado({
    especialistas: [especialistaDeExemplo(calendario ? { calendario } : {})],
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

function cartao() {
  return screen.getByRole('region', { name: copy.titulo })
}

/** Espera o selo do estado dentro do cartão. */
async function comEstado(estado: keyof typeof copy.estados) {
  await waitFor(() => expect(within(cartao()).getByText(copy.estados[estado])).toBeDefined())
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('conectado diz quando foi a última leitura, em linguagem relativa', async () => {
  const servico = await abrirFicha({
    calendario: { estado: 'conectado', provedor: 'google', sincronizadoEm: haMinutos(5) },
  })

  await comEstado('conectado')
  expect(within(cartao()).getByText(copy.sincronizado('há 5 minutos'))).toBeDefined()
  // Conectado não pergunta nada à borda: não há o que autorizar.
  expect(servico.preparos).toEqual([])
  expect(within(cartao()).getByRole('button', { name: copy.desconectar })).toBeDefined()
})

test('sem calendário, o cartão diz o risco e oferece o endereço iCal, com o Google ao lado quando configurado', async () => {
  await abrirFicha()

  await comEstado('nao_configurado')
  expect(within(cartao()).getByText(copy.semCalendario)).toBeDefined()
  expect(within(cartao()).getByLabelText(copy.ical.rotulo)).toBeDefined()
  expect(within(cartao()).getByRole('button', { name: copy.ical.salvar })).toBeDefined()
  // Onde achar o endereço nos três provedores.
  const lista = within(within(cartao()).getByRole('list', { name: copy.ical.ondeAchar }))
  for (const provedor of copy.ical.provedores) expect(lista.getByText(provedor.nome)).toBeDefined()
  expect(await within(cartao()).findByRole('button', { name: copy.conectar })).toBeDefined()
  expect(within(cartao()).queryByRole('button', { name: copy.desconectar })).toBeNull()
})

test('sem o aplicativo do Google configurado, a tela não oferece o OAuth nem fala em espera', async () => {
  const servico = await abrirFicha({
    preparo: { resultado: 'aguardando-google', mensagem: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario },
  })

  await waitFor(() => expect(servico.preparos).toEqual(['especialista-1']))
  await comEstado('nao_configurado')
  expect(within(cartao()).queryByRole('button', { name: copy.conectar })).toBeNull()
  expect(within(cartao()).queryByText(copy.estados.aguardando_google)).toBeNull()
  expect(within(cartao()).queryByText(MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario)).toBeNull()
  expect(within(cartao()).getByRole('button', { name: copy.ical.salvar })).toBeDefined()
})

test('salvar o endereço normaliza webcal, grava e mostra a espera da primeira leitura', async () => {
  const servico = await abrirFicha({ preparo: { resultado: 'indisponivel' } })

  await comEstado('nao_configurado')
  fireEvent.change(within(cartao()).getByLabelText(copy.ical.rotulo), {
    target: { value: '  webcal://p01-caldav.icloud.com/published/2/segredo  ' },
  })
  fireEvent.click(within(cartao()).getByRole('button', { name: copy.ical.salvar }))

  await waitFor(() =>
    expect(servico.enderecosIcal).toEqual([
      { especialistaId: 'especialista-1', endereco: 'https://p01-caldav.icloud.com/published/2/segredo' },
    ]),
  )
  expect(await within(cartao()).findByText(copy.ical.gravado)).toBeDefined()
  await comEstado('conectado')
  expect(within(cartao()).getByText(copy.primeiraLeitura)).toBeDefined()
  expect(within(cartao()).getByText(copy.fornecedor('ical'))).toBeDefined()
  expect(within(cartao()).getByRole('button', { name: copy.ical.trocar })).toBeDefined()
})

test('endereço fora do formato é recusado na tela, sem ir ao servidor', async () => {
  const servico = await abrirFicha()

  await comEstado('nao_configurado')
  fireEvent.click(within(cartao()).getByRole('button', { name: copy.ical.salvar }))
  expect(await within(cartao()).findByText(copy.ical.recusas.vazio)).toBeDefined()

  fireEvent.change(within(cartao()).getByLabelText(copy.ical.rotulo), { target: { value: 'http://agenda.test/a.ics' } })
  fireEvent.click(within(cartao()).getByRole('button', { name: copy.ical.salvar }))
  expect(await within(cartao()).findByText(copy.ical.recusas.formato)).toBeDefined()
  expect(servico.enderecosIcal).toEqual([])
})

test('endereço iCal que deixou de abrir pede para colar de novo, sem reconectar pelo Google', async () => {
  await abrirFicha({
    calendario: { estado: 'com-falha', provedor: 'ical', falha: MENSAGENS_DO_CALENDARIO.endereco_ical_recusado, sincronizadoEm: null },
  })

  await comEstado('erro')
  expect(within(cartao()).getByText(MENSAGENS_DO_CALENDARIO.endereco_ical_recusado)).toBeDefined()
  expect(within(cartao()).getByText(copy.erroDoIcal)).toBeDefined()
  expect(within(cartao()).getByRole('button', { name: copy.ical.trocar })).toBeDefined()
  expect(within(cartao()).queryByRole('button', { name: copy.reconectar })).toBeNull()
})

test('com erro, a frase do servidor aparece com o que fazer e o caminho de reconectar', async () => {
  await abrirFicha({
    calendario: {
      estado: 'com-falha',
      provedor: 'google',
      falha: MENSAGENS_DO_CALENDARIO.conexao_expirada,
      sincronizadoEm: haMinutos(60),
    },
  })

  await comEstado('erro')
  expect(within(cartao()).getByText(MENSAGENS_DO_CALENDARIO.conexao_expirada)).toBeDefined()
  expect(within(cartao()).getByText(copy.erro)).toBeDefined()
  expect(within(cartao()).getByRole('button', { name: copy.reconectar })).toBeDefined()
})

test('enquanto a borda responde, o endereço iCal já pode ser salvo', async () => {
  await abrirFicha({ preparoPendente: true })

  await comEstado('nao_configurado')
  expect(within(cartao()).getByRole('button', { name: copy.ical.salvar })).toBeDefined()
  expect(within(cartao()).queryByRole('button', { name: copy.conectar })).toBeNull()
})

test('conectar pergunta de novo à borda e abre o endereço que ela devolveu', async () => {
  const ir = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign: ir })
  const servico = await abrirFicha()

  await comEstado('nao_configurado')
  fireEvent.click(await within(cartao()).findByRole('button', { name: copy.conectar }))

  await waitFor(() => expect(ir).toHaveBeenCalledWith(ENDERECO_DE_AUTORIZACAO))
  // A sondagem e o clique: o `state` do endereço vence em dez minutos, e o
  // clique não reaproveita o da abertura.
  expect(servico.preparos).toHaveLength(2)
})

test('conectar quando a instalação perdeu o aplicativo do Google diz por quê e tira o botão', async () => {
  const ir = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign: ir })
  await abrirFicha({
    preparo: (vez) =>
      vez === 1
        ? { resultado: 'autorizar', url: ENDERECO_DE_AUTORIZACAO }
        : { resultado: 'aguardando-google', mensagem: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario },
  })

  fireEvent.click(await within(cartao()).findByRole('button', { name: copy.conectar }))

  expect(await within(cartao()).findByText(MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario)).toBeDefined()
  expect(within(cartao()).queryByRole('button', { name: copy.conectar })).toBeNull()
  await comEstado('nao_configurado')
  expect(ir).not.toHaveBeenCalled()
})

test('desconectar avisa a consequência antes e apaga o vínculo depois de confirmar', async () => {
  const servico = await abrirFicha({
    calendario: { estado: 'conectado', provedor: 'google', sincronizadoEm: haMinutos(3) },
  })

  await comEstado('conectado')
  fireEvent.click(within(cartao()).getByRole('button', { name: copy.desconectar }))

  const dialogo = screen.getByRole('dialog', { name: copy.confirmacao.titulo })
  expect(within(dialogo).getByText(copy.confirmacao.explicacao)).toBeDefined()
  // Nada foi apagado só por abrir a pergunta.
  expect(servico.desconexoes).toEqual([])

  fireEvent.click(within(dialogo).getByRole('button', { name: copy.confirmacao.confirmar }))

  await waitFor(() => expect(servico.desconexoes).toEqual(['especialista-1']))
  expect(await within(cartao()).findByText(copy.desconectado)).toBeDefined()
  // A lista relida mostra o especialista sem calendário, com o risco escrito.
  await comEstado('nao_configurado')
  expect(within(cartao()).getByText(copy.semCalendario)).toBeDefined()
})

test('desconexão recusada pela conta vira frase, e o vínculo continua', async () => {
  await abrirFicha({
    calendario: { estado: 'conectado', provedor: 'google', sincronizadoEm: haMinutos(3) },
    desconexao: { ok: false, motivo: 'recusada' },
  })

  await comEstado('conectado')
  fireEvent.click(within(cartao()).getByRole('button', { name: copy.desconectar }))
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: copy.confirmacao.confirmar }),
  )

  expect(
    await within(cartao()).findByText(copyDosEspecialistas.falhasDaGravacao.recusada),
  ).toBeDefined()
  await comEstado('conectado')
})

test('falha com a leitura parada diz que a sincronização parou e desde quando', async () => {
  await abrirFicha({
    calendario: {
      estado: 'com-falha',
      provedor: 'google',
      falha: MENSAGENS_DO_CALENDARIO.provedor_indisponivel,
      sincronizadoEm: haMinutos(180),
    },
  })

  await comEstado('indisponivel')
  expect(within(cartao()).getByText(copy.parou('há 3 horas'))).toBeDefined()
  // Parada não é agenda lida: a frase da última leitura boa não aparece.
  expect(within(cartao()).queryByText(copy.sincronizado('há 3 horas'))).toBeNull()
})

test('falha antes da primeira leitura diz que a ocupação nunca foi vista', async () => {
  await abrirFicha({
    calendario: {
      estado: 'com-falha',
      provedor: 'google',
      falha: MENSAGENS_DO_CALENDARIO.conexao_expirada,
      sincronizadoEm: null,
    },
  })

  await comEstado('erro')
  expect(within(cartao()).getByText(copy.parouAntesDaPrimeira)).toBeDefined()
})

test('quem não administra lê o estado sem conectar, e a tela não pergunta à borda', async () => {
  const servico = await abrirFicha({}, 'operator')

  await comEstado('nao_configurado')
  expect(within(cartao()).getByText(copy.leitura)).toBeDefined()
  expect(within(cartao()).queryByRole('button')).toBeNull()
  expect(servico.preparos).toEqual([])
})
