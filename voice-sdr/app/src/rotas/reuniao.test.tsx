// O que esta tela precisa provar (US-180, RF-511): a ficha completa com o
// resumo de passagem em blocos (nunca JSON), o histórico com as duas ligações
// e o link para cada ficha de chamada, a reunião marcada à mão como caso
// normal, o estado de cada entrega com o que fazer quando falhou, e o mesmo
// "não encontrada" para a reunião que não existe, a de outra conta e a de
// ensaio.

import { TETO_DE_TENTATIVAS as TETO_DO_CONVITE } from '@compartilhado/agenda/convite-de-reuniao.ts'
import { TETO_DE_TENTATIVAS as TETO_DO_EVENTO } from '@compartilhado/agenda/evento-da-reuniao.ts'
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { reunioes } from '@/copy/reunioes'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeReunioesDublado,
  fichaDaReuniao,
  reuniaoDaLista,
  type RespostasDeReunioes,
  type ServicoDeReunioesDublado,
} from '@/testes/servico-de-reunioes-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = reunioes.ficha
const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

async function abrir(respostas: RespostasDeReunioes, caminho = '/reunioes/r-1'): Promise<ServicoDeReunioesDublado> {
  const servico = criarServicoDeReunioesDublado(respostas)
  // Os dezessete serviços entre o caminho e as reuniões ficam no dublê padrão.
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined, // equipe
    undefined, // auditoria
    undefined, // integrações
    undefined, // configuração inicial
    undefined, // leads
    undefined, // Sarah
    undefined, // números
    undefined, // chamadas
    undefined, // discagem
    undefined, // bloqueios
    undefined, // privacidade
    undefined, // especialistas
    undefined, // ensaio
    undefined, // fila
    undefined, // conta
    undefined, // diagnóstico
    undefined, // painel
    servico,
  )
  return servico
}

function secao(nome: string): HTMLElement {
  return screen.getByRole('region', { name: nome })
}

afterEach(cleanup)

describe('/reunioes/:id', () => {
  it('ficha completa: lead, especialista, horário nos dois fusos, modalidade, sala e estado', async () => {
    const servico = await abrir({ fichas: [fichaDaReuniao()] })

    expect(await screen.findByRole('heading', { name: copy.cabecalho('Carla Menezes', 'Ana Ribeiro') })).toBeTruthy()
    expect(servico.fichasPedidas).toEqual(['r-1'])

    const dados = secao(copy.dados.titulo)
    expect(within(dados).getByText('Aurora Logística')).toBeTruthy()
    expect(within(dados).getByText('carla@aurora.com.br')).toBeTruthy()
    expect(within(dados).getByText('+5581999990000')).toBeTruthy()
    expect(within(dados).getByText(reunioes.estados.confirmed)).toBeTruthy()
    expect(within(dados).getByText(reunioes.modalidades.video)).toBeTruthy()
    expect(within(dados).getByRole('link', { name: copy.dados.abrirSala }).getAttribute('href')).toBe(
      'https://meet.example.com/ana-ribeiro',
    )
    // 17h UTC é 14h em São Paulo e em Recife: o mesmo relógio, com os dois fusos escritos.
    expect(within(dados).getAllByText('qui 01/10, 14:00 a 14:30')).toHaveLength(2)
    expect(within(dados).getByText(copy.dados.noFusoDoEspecialista('America/Sao_Paulo'))).toBeTruthy()
    expect(within(dados).getByText(copy.dados.noFusoDoLead('America/Recife'))).toBeTruthy()
    expect(within(dados).queryByText(copy.dados.motivoDoCancelamento)).toBeNull()
  })

  it('o horário muda de relógio quando o lead está em outro fuso', async () => {
    await abrir({ fichas: [fichaDaReuniao({ fusoDoLead: 'America/Manaus' })] })
    const dados = await screen.findByRole('region', { name: copy.dados.titulo })
    expect(within(dados).getByText('qui 01/10, 14:00 a 14:30')).toBeTruthy()
    expect(within(dados).getByText('qui 01/10, 13:00 a 13:30')).toBeTruthy()
  })

  it('o resumo de passagem aparece em blocos com rótulo, nunca como JSON', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          resumoDePassagem: {
            canal_preferido: 'WhatsApp',
            pain: 'A fila de atendimento chega a dois dias.',
            objecoes: ['Preço', 'Integração com o CRM próprio'],
          },
        }),
      ],
    })

    const resumo = await screen.findByRole('region', { name: copy.resumo.titulo })
    expect(within(resumo).getByText(copy.resumo.campos.dor)).toBeTruthy()
    expect(within(resumo).getByText('A fila de atendimento chega a dois dias.')).toBeTruthy()
    expect(within(resumo).getByText(copy.resumo.campos.objecoes)).toBeTruthy()
    expect(within(resumo).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Preço',
      'Integração com o CRM próprio',
    ])
    expect(within(resumo).getByText('Canal preferido')).toBeTruthy()
    expect(within(resumo).getByText(copy.resumo.apoio)).toBeTruthy()
    // Nenhum vestígio da forma crua.
    expect(resumo.textContent).not.toMatch(/[{}[\]"]|canal_preferido|pain/)
  })

  it('histórico em ordem única, com o link para a ficha de cada ligação', async () => {
    await abrir({ fichas: [fichaDaReuniao()] })

    const historico = await screen.findByRole('region', { name: copy.historico.titulo })
    const passos = within(historico).getAllByRole('listitem')
    expect(passos.map((passo) => passo.textContent)).toEqual([
      `seg 28/09 11:00${copy.historico.passos['marcada-na-ligacao']}${copy.historico.abrirChamada}`,
      `qua 30/09 10:00${copy.historico.passos['confirmada-na-ligacao']}${copy.historico.abrirChamada}`,
    ])
    const links = within(historico).getAllByRole('link', { name: copy.historico.abrirChamada })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/chamadas/c-1', '/chamadas/c-2'])
  })

  it('ficha sem chamada vinculada: marcada manualmente, sem link e sem resumo, como caso normal', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          estado: 'scheduled',
          origem: 'manual',
          chamadaDaMarcacao: null,
          chamadaDaConfirmacao: null,
          confirmadaEm: null,
          chamadas: [],
          resumoDePassagem: null,
        }),
      ],
    })

    const historico = await screen.findByRole('region', { name: copy.historico.titulo })
    expect(within(historico).getAllByRole('listitem').map((passo) => passo.textContent)).toEqual([
      `seg 28/09 11:05${copy.historico.passos['marcada-manualmente']}`,
    ])
    expect(within(historico).queryByRole('link')).toBeNull()
    expect(within(secao(copy.resumo.titulo)).getByText(copy.resumo.vazio)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ligação que não existe mais fica no histórico sem link, dizendo por quê', async () => {
    await abrir({ fichas: [fichaDaReuniao({ chamadas: [{ id: 'c-2', iniciadaEm: '2026-09-30T13:00:00Z' }] })] })
    const historico = await screen.findByRole('region', { name: copy.historico.titulo })
    expect(within(historico).getByText(copy.historico.chamadaIndisponivel)).toBeTruthy()
    expect(within(historico).getAllByRole('link')).toHaveLength(1)
  })

  it('convite pendente: o lado sem envio diz o estado, as tentativas, o erro e o que fazer', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          conviteDoLead: {
            enviadoEm: null,
            tentativas: 2,
            erro: 'O provedor de e-mail recusou o endereço.',
            proximaTentativa: '2026-09-28T14:20:00Z',
          },
        }),
      ],
    })

    const lead = await screen.findByRole('listitem', { name: copy.entregas.conviteDoLead })
    expect(within(lead).getByText(copy.entregas.estadosDoConvite.tentando)).toBeTruthy()
    expect(within(lead).getByText(copy.entregas.tentativas(2))).toBeTruthy()
    expect(within(lead).getByText(copy.entregas.ultimoErro('O provedor de e-mail recusou o endereço.'))).toBeTruthy()
    expect(within(lead).getByText(copy.entregas.proximaTentativa('seg 28/09 11:20'))).toBeTruthy()
    expect(within(lead).getByText(reunioes.marcas['convite-lead-tentando'].oQueFazer)).toBeTruthy()

    const especialista = screen.getByRole('listitem', { name: copy.entregas.conviteDoEspecialista })
    expect(within(especialista).getByText(copy.entregas.estadosDoConvite.enviado)).toBeTruthy()
    expect(within(especialista).getByText(copy.entregas.enviadoEm('seg 28/09 09:00'))).toBeTruthy()
  })

  it('lead sem e-mail e convite desistido dizem o que fazer', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          lead: { ...fichaDaReuniao().lead, temEmail: false, email: null },
          conviteDoLead: { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null },
          conviteDoEspecialista: {
            enviadoEm: null,
            tentativas: TETO_DO_CONVITE,
            erro: 'Caixa cheia.',
            proximaTentativa: null,
          },
        }),
      ],
    })

    const lead = await screen.findByRole('listitem', { name: copy.entregas.conviteDoLead })
    expect(within(lead).getByText(copy.entregas.estadosDoConvite['sem-email'])).toBeTruthy()
    expect(within(lead).getByText(reunioes.marcas['convite-lead-sem-email'].oQueFazer)).toBeTruthy()
    const especialista = screen.getByRole('listitem', { name: copy.entregas.conviteDoEspecialista })
    expect(within(especialista).getByText(copy.entregas.estadosDoConvite.desistiu)).toBeTruthy()
    expect(within(especialista).getByText(reunioes.marcas['convite-especialista-desistiu'].oQueFazer)).toBeTruthy()
  })

  it('evento de calendário falhado: não criado, com o erro da borda e o que fazer', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          evento: {
            externoId: null,
            tentativas: TETO_DO_EVENTO,
            erro: 'O Google recusou o evento.',
            proximaTentativa: null,
          },
        }),
      ],
    })

    const evento = await screen.findByRole('listitem', { name: copy.entregas.evento })
    expect(within(evento).getByText(copy.entregas.estadosDoEvento.desistiu)).toBeTruthy()
    expect(within(evento).getByText(copy.entregas.ultimoErro('O Google recusou o evento.'))).toBeTruthy()
    expect(within(evento).getByText(reunioes.marcas['evento-desistiu'].oQueFazer)).toBeTruthy()
  })

  it('reunião cancelada mostra o motivo, e a falha de entrega dela não pede nada', async () => {
    await abrir({
      fichas: [
        fichaDaReuniao({
          estado: 'canceled',
          motivoDoCancelamento: 'O lead pediu para desmarcar.',
          evento: { externoId: null, tentativas: TETO_DO_EVENTO, erro: 'Falhou.', proximaTentativa: null },
        }),
      ],
    })

    const dados = await screen.findByRole('region', { name: copy.dados.titulo })
    expect(within(dados).getByText(reunioes.estados.canceled)).toBeTruthy()
    expect(within(dados).getByText('O lead pediu para desmarcar.')).toBeTruthy()
    const evento = screen.getByRole('listitem', { name: copy.entregas.evento })
    expect(within(evento).queryByText(reunioes.marcas['evento-desistiu'].oQueFazer)).toBeNull()
  })

  it.each([
    ['inexistente', '/reunioes/r-nenhuma'],
    ['de outra conta', '/reunioes/r-outra-conta'],
    ['de ensaio', '/reunioes/r-ensaio'],
  ])('reunião %s dá o mesmo "não encontrada"', async (_caso, caminho) => {
    // A de outra conta não está entre as guardadas: a RLS não a devolve. A de
    // ensaio está, e é a regra da visão que a tira.
    await abrir({ fichas: [fichaDaReuniao({ id: 'r-ensaio', origem: 'ensaio' })] }, caminho)

    expect(await screen.findByRole('heading', { name: copy.naoEncontrada.titulo })).toBeTruthy()
    expect(screen.getByText(copy.naoEncontrada.explicacao)).toBeTruthy()
    expect(screen.getByRole('link', { name: copy.naoEncontrada.acao }).getAttribute('href')).toBe('/reunioes')
  })

  it('carregando e falha de comunicação', async () => {
    await abrir({ fichaPendente: true })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
    cleanup()

    await abrir({ carregarFicha: { ok: false, motivo: 'falha-de-comunicacao' } })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('a lista liga o nome do lead à ficha', async () => {
    await abrir({ reunioes: [reuniaoDaLista()] }, '/reunioes?vista=lista&periodo=tudo')
    const link = await screen.findByRole('link', { name: 'Carla Menezes' })
    expect(link.getAttribute('href')).toBe('/reunioes/r-1')
  })
})
