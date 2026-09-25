// O que esta tela precisa provar (US-147, RF-113, RF-116, quarto critério da
// F4): os quatro estados, a identidade com o telefone em `.val`, a situação e o
// resumo, e a linha do tempo como **uma** lista em ordem decrescente que mistura
// ligação, mudança de etapa com autor, bloqueio e nota.
//
// Três asserções justificam o arquivo. O dublê entrega os eventos fora de
// ordem, e é a tela que os ordena: uma lista que saísse na ordem de chegada
// cairia aqui. Renomear a etapa depois de mover o lead não muda o que o item
// antigo diz. E o áudio é pedido a `call-audio` só no toque; gravação expurgada
// é frase, não reprodutor.
//
// Ouvir o áudio de verdade é do degrau 3: jsdom não toca mídia.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ficha as copyDaChamada } from '@/copy/chamadas'
import { lead as copy } from '@/copy/lead'
import type { EventoDoLead, LigacaoDoLead } from '@/leads/linha-do-tempo'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeChamadasDublado,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeLeadsDublado,
  FUNIL_DO_DUBLE,
  leadsDeExemplo,
  type RespostasDeLeads,
  type ServicoDeLeadsDublado,
} from '@/testes/servico-de-leads-dublado'
import { conversaDeExemplo, criarServicoDeWhatsappDublado } from '@/testes/servico-de-whatsapp-dublado'
import type { Papel } from '@/equipe/tipos'
import type { ServicoDeWhatsapp } from '@/whatsapp/tipos'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const LIGACAO: LigacaoDoLead = {
  id: 'c-1',
  direcao: 'outbound',
  proposito: 'discovery',
  iniciadaEm: '2026-09-10T14:00:00Z',
  duracaoSeg: 184,
  motivoDoFim: 'completed',
  caminhoDaGravacao: 'c-1/c-1.mp3',
  gravacaoExpiraEm: '2099-01-01T00:00:00Z',
}

const EXPURGADA: LigacaoDoLead = {
  ...LIGACAO,
  id: 'c-2',
  iniciadaEm: '2026-08-01T14:00:00Z',
  caminhoDaGravacao: null,
  gravacaoExpiraEm: '2026-09-01T00:00:00Z',
}

function evento(parcial: Partial<EventoDoLead> & Pick<EventoDoLead, 'id' | 'kind' | 'ocorridoEm'>): EventoDoLead {
  return { ator: 'user', autorId: 'u-2', chamadaId: null, payload: {}, ...parcial }
}

/** Os eventos de Marina, entregues fora de ordem de propósito. */
const EVENTOS_DA_MARINA: EventoDoLead[] = [
  evento({ id: 'e-ligacao', kind: 'call', ocorridoEm: '2026-09-10T14:00:00Z', ator: 'agent', autorId: null, chamadaId: 'c-1' }),
  evento({ id: 'e-nota', kind: 'note', ocorridoEm: '2026-09-12T09:00:00Z', payload: { texto: 'Pediu proposta por escrito.' } }),
  evento({
    id: 'e-etapa',
    kind: 'stage_change',
    ocorridoEm: '2026-09-10T14:05:00Z',
    ator: 'agent',
    autorId: null,
    payload: { de: { key: 'new', label: 'Novo' }, para: { key: 'qualified', label: 'Qualificado' } },
  }),
  evento({ id: 'e-bloqueio', kind: 'blocked', ocorridoEm: '2026-09-11T09:00:00Z', payload: { motivo: 'Pediu uma pausa' } }),
  evento({ id: 'e-antiga', kind: 'call', ocorridoEm: '2026-08-01T14:00:00Z', ator: 'agent', autorId: null, chamadaId: 'c-2' }),
]

function comMarina(extra: RespostasDeLeads = {}): RespostasDeLeads {
  const leads = leadsDeExemplo().map((lead) =>
    lead.id === 'l-1'
      ? {
          ...lead,
          fuso: 'America/Sao_Paulo',
          pontuacao: 78,
          briefing: { dor: 'Planilha manual de rotas', fit: 'Frota de 40 caminhões', proximaAcao: 'Reunião com o diretor' },
        }
      : lead,
  )
  return {
    leads,
    linhasDoTempo: { 'l-1': EVENTOS_DA_MARINA },
    ligacoes: [LIGACAO, EXPURGADA],
    ...extra,
  }
}

async function abrir(
  respostas: RespostasDeLeads = comMarina(),
  id = 'l-1',
  opcoes: { papel?: Papel; leads?: ServicoDeLeadsDublado; chamadas?: ServicoDeChamadasDublado } = {},
) {
  const leads = opcoes.leads ?? criarServicoDeLeadsDublado(respostas)
  const chamadas = opcoes.chamadas ?? criarServicoDeChamadasDublado()
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: equipeDeExemplo(opcoes.papel ?? 'operator') },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    `/leads/${id}`,
    equipe,
    undefined,
    undefined,
    undefined,
    leads,
    undefined,
    undefined,
    chamadas,
  )
  return { leads, chamadas }
}

async function linhaDoTempo(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: copy.linhaDoTempo.lista })
}

function itens(lista: HTMLElement): HTMLElement[] {
  return within(lista).getAllByRole('listitem').filter((item) => item.parentElement === lista)
}

/** O `dd` de um campo, achado pelo `dt`. */
function campo(titulo: string): HTMLElement {
  const termo = screen.getByText(titulo, { selector: 'dt' })
  const valor = termo.nextElementSibling
  if (!(valor instanceof HTMLElement)) throw new Error(`campo sem valor: ${titulo}`)
  return valor
}

afterEach(cleanup)

describe('/leads/$id — os quatro estados', () => {
  it('carregando', async () => {
    await abrir({ fichaPendente: true })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('falha do servidor vira caixa de erro com a frase', async () => {
    await abrir({ fichaFalha: true })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('lead que não existe diz isso e leva à lista', async () => {
    await abrir(comMarina(), 'l-nao-existe')
    expect(await screen.findByText(copy.naoEncontrado.titulo)).toBeTruthy()
    const elo = screen.getByRole('link', { name: copy.naoEncontrado.acao })
    expect(elo.getAttribute('href')).toBe('/leads')
  })

  it('lead sem evento nenhum vê o vazio dizendo que a linha começa na primeira ligação', async () => {
    await abrir(comMarina(), 'l-2')
    expect(await screen.findByText(copy.linhaDoTempo.vazia.titulo)).toBeTruthy()
    expect(screen.getByText(copy.linhaDoTempo.vazia.explicacao)).toBeTruthy()
    expect(copy.linhaDoTempo.vazia.explicacao).toMatch(/primeira ligação/)
    expect(screen.queryByRole('list', { name: copy.linhaDoTempo.lista })).toBeNull()
  })
})

describe('/leads/$id — identidade, situação e resumo', () => {
  it('mostra quem é, com o telefone na classe .val', async () => {
    await abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Marina Castro' })).toBeTruthy()
    const telefone = campo(copy.identidade.telefone)
    expect(telefone.textContent).toBe('+5548999998888')
    expect(telefone.querySelector('.val')?.textContent).toBe('+5548999998888')
    expect(campo(copy.identidade.empresa).textContent).toBe('Aurora Logística')
    expect(campo(copy.identidade.cidade).textContent).toBe('Florianópolis')
    expect(campo(copy.identidade.estado).textContent).toBe('SC')
    // O fuso pelo nome, não pela zona IANA (D-09).
    expect(campo(copy.identidade.fuso).textContent).toBe('Horário de Brasília')
  })

  it('mostra etapa, temperatura, pontuação e bloqueio', async () => {
    await abrir()
    await screen.findByRole('heading', { level: 1, name: 'Marina Castro' })
    expect(campo(copy.situacao.etapa).textContent).toBe('Qualificado')
    expect(campo(copy.situacao.temperatura).textContent).toBe('Quente')
    expect(campo(copy.situacao.pontuacao).textContent).toBe('78')
    expect(campo(copy.situacao.bloqueio).textContent).toBe(copy.situacao.livre)
  })

  it('o resumo é o briefing, e o que nenhuma ligação confirmou é dito', async () => {
    await abrir()
    await screen.findByRole('heading', { level: 1, name: 'Marina Castro' })
    expect(campo(copy.resumo.dor).textContent).toBe('Planilha manual de rotas')
    expect(campo(copy.resumo.fit).textContent).toBe('Frota de 40 caminhões')
    expect(campo(copy.resumo.objecoes).textContent).toBe(copy.resumo.naoConfirmado)
    expect(campo(copy.resumo.proximaAcao).textContent).toBe('Reunião com o diretor')
  })
})

describe('/leads/$id — a linha do tempo é uma lista só', () => {
  it('mistura ligação, etapa, bloqueio e nota em ordem decrescente, numa lista', async () => {
    await abrir()
    const lista = await linhaDoTempo()
    expect(screen.getAllByRole('list', { name: copy.linhaDoTempo.lista })).toHaveLength(1)
    expect(itens(lista).map((item) => item.dataset.tipo)).toEqual([
      'nota',
      'bloqueio',
      'etapa',
      'ligacao',
      'ligacao',
    ])
  })

  it('a mudança de etapa diz de onde, para onde e quem', async () => {
    await abrir()
    const lista = await linhaDoTempo()
    const etapa = itens(lista).find((item) => item.dataset.tipo === 'etapa')!
    expect(etapa.textContent).toContain('De Novo para Qualificado')
    expect(etapa.textContent).toContain(copy.linhaDoTempo.autor.agent)
    const nota = itens(lista).find((item) => item.dataset.tipo === 'nota')!
    expect(nota.textContent).toContain('Pediu proposta por escrito.')
    expect(nota.textContent).toContain(copy.linhaDoTempo.autor.user('Caio Moreira'))
  })

  it('renomear a etapa não reescreve o item antigo', async () => {
    const leads = criarServicoDeLeadsDublado(comMarina({ linhasDoTempo: {} }))
    await abrir(undefined, 'l-2', { leads })

    // Bruno está em Novo: move para Qualificado pela ficha.
    const seletor = (await screen.findByRole('combobox', { name: copy.acoes.etapa })) as HTMLSelectElement
    fireEvent.change(seletor, { target: { value: 'qualified' } })
    fireEvent.click(screen.getByRole('button', { name: copy.acoes.mover }))
    expect(await screen.findByText(copy.acoes.movido('Qualificado'))).toBeTruthy()
    expect(leads.movimentos).toEqual([{ leadId: 'l-2', chave: 'qualified', ator: 'user' }])

    const renomeada = await leads.configurarEtapas(FUNIL_DO_DUBLE, [
      { id: 'e-qualified', rotulo: 'Tem fit', posicao: 2, cor: null },
    ])
    expect(renomeada.ok).toBe(true)

    cleanup()
    await abrir(undefined, 'l-2', { leads })
    const lista = await linhaDoTempo()
    // A situação é de agora; a história é de então.
    expect(campo(copy.situacao.etapa).textContent).toBe('Tem fit')
    const [item] = itens(lista)
    expect(item!.dataset.tipo).toBe('etapa')
    expect(item!.textContent).toContain('De Novo para Qualificado')
    expect(item!.textContent).not.toContain('Tem fit')
    expect(item!.textContent).toContain(copy.linhaDoTempo.autor.user('Renata Alves'))
  })
})

describe('/leads/$id — nota manual', () => {
  it('registra pela ficha e entra na linha do tempo com o autor', async () => {
    const { leads } = await abrir()
    const campoDaNota = (await screen.findByLabelText(copy.nota.rotulo)) as HTMLTextAreaElement
    const botao = screen.getByRole('button', { name: copy.nota.registrar }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)

    fireEvent.change(campoDaNota, { target: { value: '  Ligar de novo na segunda.  ' } })
    fireEvent.click(botao)

    expect(await screen.findByText(copy.nota.registrada)).toBeTruthy()
    expect(leads.notas).toEqual([{ leadId: 'l-1', texto: 'Ligar de novo na segunda.' }])
    const lista = await linhaDoTempo()
    await waitFor(() => {
      const [primeiro] = itens(lista)
      expect(primeiro!.dataset.tipo).toBe('nota')
      expect(primeiro!.textContent).toContain('Ligar de novo na segunda.')
      expect(primeiro!.textContent).toContain(copy.linhaDoTempo.autor.user('Renata Alves'))
    })
    expect(campoDaNota.value).toBe('')
  })

  it('nota recusada fica no campo, com a frase', async () => {
    await abrir(comMarina({ registrarNota: { ok: false, motivo: 'sem-permissao' } }))
    const campoDaNota = (await screen.findByLabelText(copy.nota.rotulo)) as HTMLTextAreaElement
    fireEvent.change(campoDaNota, { target: { value: 'Não vai.' } })
    fireEvent.click(screen.getByRole('button', { name: copy.nota.registrar }))
    expect(await screen.findByText(copy.nota.falhas['sem-permissao'])).toBeTruthy()
    expect(campoDaNota.value).toBe('Não vai.')
  })
})

describe('/leads/$id — áudio', () => {
  it('a gravação só é pedida a call-audio no toque', async () => {
    const { chamadas } = await abrir()
    const lista = await linhaDoTempo()
    const ligacao = itens(lista).find((item) => item.dataset.tipo === 'ligacao')!
    expect(chamadas.pedidosDeAudio).toEqual([])

    fireEvent.click(within(ligacao).getByRole('button', { name: copyDaChamada.gravacao.ouvir }))
    const audio = await within(ligacao).findByLabelText(copyDaChamada.gravacao.reprodutor)
    expect(chamadas.pedidosDeAudio).toEqual(['c-1'])
    expect(audio.getAttribute('src')).toContain('token=assinado')
  })

  it('gravação expurgada pela retenção é frase, não reprodutor', async () => {
    await abrir()
    const lista = await linhaDoTempo()
    const antiga = itens(lista).at(-1)!
    expect(antiga.dataset.tipo).toBe('ligacao')
    expect(antiga.textContent).toContain(copy.linhaDoTempo.gravacaoExpurgada)
    expect(within(antiga).queryByRole('button', { name: copyDaChamada.gravacao.ouvir })).toBeNull()
  })

  it('o item da ligação leva à ficha da chamada', async () => {
    await abrir()
    const lista = await linhaDoTempo()
    const ligacao = itens(lista).find((item) => item.dataset.tipo === 'ligacao')!
    const elo = within(ligacao).getByRole('link', { name: copy.linhaDoTempo.abrirChamada })
    expect(elo.getAttribute('href')).toBe('/chamadas/c-1')
  })
})

describe('/leads/$id — ações e papel', () => {
  it('bloquear pede motivo e entra na linha do tempo', async () => {
    const { leads } = await abrir()
    const bloquear = (await screen.findByRole('button', { name: copy.acoes.bloquear })) as HTMLButtonElement
    expect(bloquear.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(copy.acoes.motivoDoBloqueio), {
      target: { value: 'Pediu para não ligar' },
    })
    fireEvent.click(bloquear)
    expect(await screen.findByText(copy.acoes.bloqueado)).toBeTruthy()
    expect(leads.bloqueados).toEqual([{ ids: ['l-1'], motivo: 'Pediu para não ligar' }])
    expect(await screen.findByRole('button', { name: copy.acoes.desbloquear })).toBeTruthy()
  })

  it('quem só observa lê a ficha sem ação nenhuma e sabe a quem pedir', async () => {
    await abrir(undefined, 'l-1', { papel: 'viewer' })
    await linhaDoTempo()
    expect(await screen.findByText(copy.acoes.soLeitura)).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.nota.registrar })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.acoes.mover })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.acoes.bloquear })).toBeNull()
  })
})

describe('/leads — a lista leva à ficha', () => {
  it('o nome do lead abre /leads/$id', async () => {
    const leads = criarServicoDeLeadsDublado(comMarina())
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads',
      undefined,
      undefined,
      undefined,
      undefined,
      leads,
    )
    fireEvent.click(await screen.findByRole('link', { name: 'Marina Castro' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/leads/l-1'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Marina Castro' })).toBeTruthy()
  })
})

/** Monta a ficha com o serviço de WhatsApp no lugar; os demais são os padrões. */
async function abrirComWhatsapp(
  whatsapp: ServicoDeWhatsapp,
  respostas: RespostasDeLeads = comMarina(),
  papel: Papel = 'operator',
) {
  const equipe = criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } })
  const leads = criarServicoDeLeadsDublado(respostas)
  return montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/leads/l-1',
    equipe,
    undefined,
    undefined,
    undefined,
    leads,
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
    whatsapp,
  )
}

describe('/leads/$id — conversar pelo WhatsApp', () => {
  it('com o canal desligado, a ficha não oferece o botão', async () => {
    const whatsapp = criarServicoDeWhatsappDublado({ canal: { habilitado: false, modo: 'teste', preContato: false, textoDoPreContato: null } })
    await abrirComWhatsapp(whatsapp)

    await linhaDoTempo()
    expect(screen.queryByText(copy.whatsapp.conversar)).toBeNull()
  })

  it('com o canal ligado e sem conversa, iniciar abre a conversa nova', async () => {
    const whatsapp = criarServicoDeWhatsappDublado({
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
    })
    const { roteador } = await abrirComWhatsapp(whatsapp)

    const botao = await screen.findByRole('button', { name: copy.whatsapp.conversar })
    fireEvent.click(botao)

    await waitFor(() => expect(roteador.state.location.pathname).toMatch(/^\/conversas\/w-/))
    expect(whatsapp.acoes).toEqual([{ leadId: 'l-1', acao: 'iniciar', texto: undefined }])
  })

  it('com uma conversa ativa, mostra o elo para ela em vez do botão', async () => {
    const conversa = conversaDeExemplo({ leadId: 'l-1', status: 'humano' })
    const whatsapp = criarServicoDeWhatsappDublado({
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
      conversas: [conversa],
    })
    await abrirComWhatsapp(whatsapp)

    const elo = await screen.findByRole('link', { name: copy.whatsapp.verConversa })
    expect(elo.getAttribute('href')).toBe(`/conversas/${conversa.id}`)
    expect(screen.queryByRole('button', { name: copy.whatsapp.conversar })).toBeNull()
  })

  it('conversa encerrada não conta como ativa: o botão de iniciar volta a aparecer', async () => {
    const conversa = conversaDeExemplo({ leadId: 'l-1', status: 'encerrada' })
    const whatsapp = criarServicoDeWhatsappDublado({
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
      conversas: [conversa],
    })
    await abrirComWhatsapp(whatsapp)

    expect(await screen.findByRole('button', { name: copy.whatsapp.conversar })).toBeTruthy()
  })

  it('a linha do tempo mostra a ação de WhatsApp com o elo para a conversa', async () => {
    const whatsapp = criarServicoDeWhatsappDublado()
    await abrirComWhatsapp(
      whatsapp,
      comMarina({
        linhasDoTempo: {
          'l-1': [
            ...EVENTOS_DA_MARINA,
            evento({
              id: 'e-whatsapp',
              kind: 'whatsapp',
              ocorridoEm: '2026-09-13T09:00:00Z',
              ator: 'agent',
              autorId: null,
              payload: { acao: 'iniciada', conversation_id: 'w-9' },
            }),
          ],
        },
      }),
    )

    const lista = await linhaDoTempo()
    expect(within(lista).getByText(copy.linhaDoTempo.acaoDoWhatsapp.iniciada)).toBeTruthy()
    const elo = within(lista).getByRole('link', { name: copy.linhaDoTempo.abrirConversa })
    expect(elo.getAttribute('href')).toBe('/conversas/w-9')
  })
})
