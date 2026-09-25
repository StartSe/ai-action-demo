// O que esta tela precisa provar: os quatro estados, a ficha de RF-414 com a
// transcrição por quem falou, o custo por componente, o aviso de gravação com
// o instante, o áudio pedido só no toque e a gravação expurgada dita em
// palavras.
//
// Duas asserções justificam o arquivo. Componente sem preço não é zero: a
// telefonia chega minutos depois do fim, e "R$ 0,00" diria que a ligação saiu
// de graça (T-20, P-07). E a ficha não espera a classificação: duração, custo
// e transcrição aparecem com o aviso de "processando" ao lado (P-03), porque
// esperar tudo para mostrar algo é o que estoura os 60 s do critério da F2.
//
// Ouvir o áudio de verdade é do degrau 3 e da revisão humana: jsdom não toca
// mídia. O teste mede o pedido a `call-audio` e o `src` do reprodutor.
//
// Da F4 (US-148): a correção da classificação manda a chave da etapa e o
// motivo a `corrigir_classificacao`, e a carga posterior que traz dado de
// retaguarda não desfaz o que a correção gravou — o dublê aplica a trava da
// US-129 como o banco. É o sexto critério de aceite da F4 pelo lado da tela.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { CargaDaFicha, FichaDaChamada } from '@/chamadas/tipos'
import {
  avaliacao as copyDaAvaliacao,
  correcao as copyDaCorrecao,
  fonte as copyDaFonte,
} from '@/copy/chamada'
import { ficha as copy, MOTIVO_DO_FIM } from '@/copy/chamadas'
import { comum } from '@/copy/comum'
import { motivoDaFalha } from '@/copy/ferramentas'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  CHAMADA_ENCERRADA,
  criarServicoDeChamadasDublado,
  fichaDeExemplo,
  QUEM_CORRIGE,
  type RespostasDeChamadas,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

async function abrir(
  respostas: RespostasDeChamadas = {},
  id = CHAMADA_ENCERRADA,
  opcoes: { papel?: Papel; equipe?: Equipe; chamadas?: ServicoDeChamadasDublado } = {},
): Promise<ServicoDeChamadasDublado> {
  const chamadas = opcoes.chamadas ?? criarServicoDeChamadasDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: opcoes.equipe ?? equipeDeExemplo(opcoes.papel ?? 'operator') },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    `/chamadas/${id}`,
    equipe,
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

function comFicha(mudanca: Partial<FichaDaChamada> = {}): RespostasDeChamadas {
  const carga: CargaDaFicha = { ok: true, ficha: fichaDeExemplo(mudanca) }
  return { fichas: { [CHAMADA_ENCERRADA]: carga } }
}

async function regiao(nome: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: nome })
}

/** O `dd` de um campo, achado pelo `dt` dentro da região. */
function campo(dentro: HTMLElement, titulo: string): HTMLElement {
  const termo = within(dentro).getByText(titulo, { selector: 'dt' })
  const valor = termo.nextElementSibling
  if (!(valor instanceof HTMLElement)) throw new Error(`campo sem valor: ${titulo}`)
  return valor
}

afterEach(cleanup)

describe('/chamadas/:id — os quatro estados', () => {
  it('carregando', async () => {
    await abrir({ fichaPendente: true })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('falha do servidor vira caixa de erro com a frase', async () => {
    await abrir({
      fichas: { [CHAMADA_ENCERRADA]: { ok: false, motivo: 'falha-de-comunicacao' } },
    })
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toBe(copy.falhas['falha-de-comunicacao'])
  })

  it('chamada de outra conta ou inexistente é não encontrada, com saída', async () => {
    await abrir({}, '4f1c2a3b-0000-4000-8000-0000000000ff')
    expect(await screen.findByText(copy.naoEncontrada.titulo)).toBeTruthy()
    const saida = screen.getByRole('link', { name: copy.naoEncontrada.acao })
    expect(saida.getAttribute('href')).toBe('/')
  })

  it('conteúdo: o título diz o propósito e com quem', async () => {
    await abrir(comFicha())
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Descoberta com Paula Siqueira' }),
    ).toBeTruthy()
  })
})

describe('/chamadas/:id — resumo e custo', () => {
  it('duração em .val e resultado em português', async () => {
    await abrir(comFicha({ motivoDoFim: 'no_answer' }))
    const resumo = await regiao(copy.resumo)
    const duracao = campo(resumo, copy.duracao)
    expect(duracao.textContent).toBe('02:05')
    expect(duracao.querySelector('.val')).not.toBeNull()
    expect(campo(resumo, copy.resultado).textContent).toBe('Não atendeu')
  })

  it('a lista fechada de end_reason inteira está traduzida', () => {
    expect(MOTIVO_DO_FIM).toEqual({
      completed: 'Encerrada normalmente',
      voicemail: 'Caixa postal',
      max_duration: 'Duração máxima atingida',
      dial_lost: 'Perdida na discagem',
      provider_lost: 'Provedor caiu',
      canceled: 'Cancelada',
      no_answer: 'Não atendeu',
      busy: 'Ocupado',
      invalid_number: 'Número inválido',
      transferred: 'Transferida',
    })
  })

  it('custo por componente em .val, e o que não chegou é aguardando preço, nunca zero', async () => {
    await abrir(comFicha())
    const custo = await regiao(copy.custo.titulo)

    const voz = campo(custo, copy.custo.componentes.voice)
    expect(voz.querySelector('.val')?.textContent).toMatch(/^US\$\s0,35$/)
    expect(campo(custo, copy.custo.componentes.model).textContent).toMatch(/^US\$\s0,12$/)

    for (const componente of ['telephony', 'infra'] as const) {
      const semPreco = campo(custo, copy.custo.componentes[componente])
      expect(semPreco.textContent).toBe(copy.custo.aguardandoPreco)
      expect(semPreco.textContent).not.toMatch(/0,00/)
    }

    const total = campo(custo, copy.custo.total)
    expect(total.querySelector('.val')?.textContent).toMatch(/^US\$\s0,47$/)
    expect(total.textContent).toContain(copy.custo.parcial(2))
  })
})

describe('/chamadas/:id — transcrição, ferramentas e aviso', () => {
  it('cada turno diz quem falou e o instante em .val, em duas colunas', async () => {
    await abrir(comFicha())
    const lista = await screen.findByRole('list', { name: copy.transcricao.lista })
    const turnos = within(lista).getAllByRole('listitem')

    expect(
      turnos.map((turno) => ({
        quem: turno.getAttribute('data-quem'),
        coluna: turno.className.includes('col-start-2') ? 2 : 1,
        instante: turno.querySelector('.val')?.textContent,
      })),
    ).toEqual([
      { quem: 'agent', coluna: 1, instante: '00:04' },
      { quem: 'lead', coluna: 2, instante: '00:09' },
      { quem: 'agent', coluna: 1, instante: '02:01' },
    ])
    expect(within(turnos[1]!).getByText(copy.transcricao.lead)).toBeTruthy()
    expect(within(turnos[1]!).getByText('Tudo bem, pode falar.')).toBeTruthy()
  })

  it('as ferramentas de sistema aparecem em linguagem humana, com o instante', async () => {
    await abrir(
      comFicha({
        ferramentas: [
          { ferramenta: 'system:voicemail_detection', em: '2026-09-22T17:00:02.000Z', erro: null },
          { ferramenta: 'system:end_call', em: '2026-09-22T17:02:03.000Z', erro: null },
        ],
      }),
    )
    const ferramentas = await regiao(copy.ferramentas.titulo)
    const itens = within(ferramentas).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual([
      '00:02Caixa postal detectada',
      '02:03A assistente encerrou a ligação',
    ])
    expect(ferramentas.textContent).not.toContain('system:')
  })

  it('o aviso de gravação mostra o instante da conversa', async () => {
    await abrir(comFicha())
    const gravacao = await regiao(copy.gravacao.titulo)
    const aviso = campo(gravacao, copy.aviso.titulo)
    expect(aviso.textContent).toBe('Dado aos 00:04 da conversa.')
    expect(aviso.querySelector('.val')?.textContent).toBe('00:04')
  })

  it('aviso não registrado é não localizado, nunca dado', async () => {
    await abrir(comFicha({ avisoDeGravacaoEm: null }))
    const gravacao = await regiao(copy.gravacao.titulo)
    expect(campo(gravacao, copy.aviso.titulo).textContent).toBe(copy.aviso.naoLocalizado)
  })
})

describe('/chamadas/:id — gravação', () => {
  it('o áudio é pedido no toque, e não ao abrir a ficha', async () => {
    const chamadas = await abrir(comFicha())
    const gravacao = await regiao(copy.gravacao.titulo)
    expect(chamadas.pedidosDeAudio).toEqual([])

    fireEvent.click(within(gravacao).getByRole('button', { name: copy.gravacao.ouvir }))

    const reprodutor = await within(gravacao).findByLabelText(copy.gravacao.reprodutor)
    expect(chamadas.pedidosDeAudio).toEqual([CHAMADA_ENCERRADA])
    expect(reprodutor.getAttribute('src')).toBe(
      `https://armazenamento.exemplo/recordings/${CHAMADA_ENCERRADA}.mp3?token=assinado`,
    )
  })

  it('o 410 de call-audio troca o reprodutor pela frase', async () => {
    const frase = 'Esta gravação foi expurgada pelo prazo de retenção de 90 dias.'
    await abrir({
      ...comFicha(),
      audio: { ok: false, motivo: 'gravacao_expurgada', mensagem: frase },
    })
    const gravacao = await regiao(copy.gravacao.titulo)
    fireEvent.click(within(gravacao).getByRole('button', { name: copy.gravacao.ouvir }))

    expect(await within(gravacao).findByText(frase)).toBeTruthy()
    expect(within(gravacao).queryByRole('button', { name: copy.gravacao.ouvir })).toBeNull()
    expect(within(gravacao).queryByLabelText(copy.gravacao.reprodutor)).toBeNull()
  })

  it('gravação já expurgada mostra a razão e a data, sem reprodutor nem pedido', async () => {
    const chamadas = await abrir(
      comFicha({ caminhoDaGravacao: null, gravacaoExpiraEm: '2026-09-20T15:00:00.000Z' }),
    )
    const gravacao = await regiao(copy.gravacao.titulo)
    expect(within(gravacao).getByText(copy.gravacao.expurgada('20/09/2026'))).toBeTruthy()
    expect(within(gravacao).queryByRole('button', { name: copy.gravacao.ouvir })).toBeNull()
    expect(chamadas.pedidosDeAudio).toEqual([])
  })

  it('outra recusa de call-audio mantém o botão, com a frase', async () => {
    const frase = 'O armazenamento das gravações não respondeu. Tente de novo em alguns minutos.'
    await abrir({
      ...comFicha(),
      audio: { ok: false, motivo: 'armazenamento_indisponivel', mensagem: frase },
    })
    const gravacao = await regiao(copy.gravacao.titulo)
    fireEvent.click(within(gravacao).getByRole('button', { name: copy.gravacao.ouvir }))

    expect((await within(gravacao).findByRole('alert')).textContent).toBe(frase)
    expect(within(gravacao).getByRole('button', { name: copy.gravacao.ouvir })).toBeTruthy()
  })
})

describe('/chamadas/:id — classificação', () => {
  it('processando: a ficha desenha duração, custo e transcrição sem esperar a classificação', async () => {
    await abrir(comFicha({ origemDaClassificacao: null, classificacao: {}, sentimento: null }))

    const aviso = await screen.findByText(copy.classificacao.processando)
    expect(aviso.getAttribute('role')).toBe('status')
    expect(campo(await regiao(copy.resumo), copy.duracao).textContent).toBe('02:05')
    expect(await regiao(copy.custo.titulo)).toBeTruthy()
    expect(screen.getByRole('list', { name: copy.transcricao.lista })).toBeTruthy()
  })

  it('pronta: etapa, sentimento em .val e de onde veio', async () => {
    await abrir(comFicha())
    const classificacao = await regiao(copy.classificacao.titulo)
    // O rótulo da etapa pela chave, nunca a chave crua.
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Qualificado')
    const sentimento = campo(classificacao, copy.classificacao.sentimento)
    expect(sentimento.textContent).toBe('Positivo 0,60')
    expect(sentimento.querySelector('.val')).not.toBeNull()
    expect(
      within(classificacao).getByText('Classificada depois da conversa, com confiança de 72%.'),
    ).toBeTruthy()
    expect(classificacao.textContent).not.toMatch(/backfill|qualified/)
    expect(screen.queryByText(copy.classificacao.processando)).toBeNull()
  })

  it('registrada na conversa, pela ferramenta', async () => {
    await abrir(comFicha({ origemDaClassificacao: 'tool', confiancaDaClassificacao: null }))
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(within(classificacao).getByText(copyDaFonte.conversa)).toBeTruthy()
  })

  it('processando: o bloco de classificação diz o estado, e não fica vazio', async () => {
    await abrir(comFicha({ origemDaClassificacao: null, classificacao: {}, sentimento: null }))
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(within(classificacao).getByText(copy.classificacao.aguardando)).toBeTruthy()
  })

  it('chamada em andamento diz isso, sem transcrição nem classificação ainda', async () => {
    await abrir(
      comFicha({
        status: 'in_progress',
        turnos: [],
        ferramentas: [],
        origemDaClassificacao: null,
        motivoDoFim: null,
        duracaoSeg: null,
      }),
    )
    const resumo = await regiao(copy.resumo)
    expect(within(resumo).getByText(copy.emAndamento)).toBeTruthy()
    expect(screen.getByText(copy.transcricao.emAndamento)).toBeTruthy()
    await waitFor(() => expect(screen.getByText(copy.classificacao.emAndamento)).toBeTruthy())
  })
})

describe('/chamadas/:id — ferramentas que falharam', () => {
  it('a falha fica na lista, com o selo e o motivo em português', async () => {
    const erro = 'falha_do_efeito: insert or update on table "dnc_list" violates foreign key'
    await abrir(
      comFicha({
        ferramentas: [
          { ferramenta: 'tool-dnc', em: '2026-09-22T17:01:00.000Z', erro },
          { ferramenta: 'system:end_call', em: '2026-09-22T17:02:03.000Z', erro: null },
        ],
      }),
    )
    const ferramentas = await regiao(copy.ferramentas.titulo)
    const itens = within(ferramentas).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    const falha = itens[0]!
    expect(falha.getAttribute('data-falhou')).toBe('sim')
    expect(within(falha).getByText(copy.ferramentas.falhou)).toBeTruthy()
    expect(falha.textContent).toContain(motivoDaFalha(erro))
    expect(falha.textContent).not.toContain('dnc_list')
    expect(itens[1]!.getAttribute('data-falhou')).toBeNull()
  })
})

describe('/chamadas/:id — avaliação por critério', () => {
  it('cada critério com o rótulo da conta, aprovado ou não, e a evidência', async () => {
    await abrir(
      comFicha({
        notaDaAvaliacao: 5,
        criteriosDaConta: [
          { chave: 'aviso_gravacao', rotulo: 'Avisou da gravação' },
          { chave: 'orcamento', rotulo: 'Perguntou o orçamento' },
        ],
        itensDaAvaliacao: [
          { criterio: 'orcamento', aprovado: false, evidencia: 'Não houve pergunta sobre verba.' },
          { criterio: 'aviso_gravacao', aprovado: true, evidencia: 'essa ligação é gravada' },
          { criterio: 'nada_fora_da_base', aprovado: null, evidencia: null },
        ],
      }),
    )
    const avaliacao = await regiao(copy.avaliacao.titulo)
    expect(campo(avaliacao, copy.avaliacao.nota).textContent).toBe('5,0')
    const lista = within(avaliacao).getByRole('list', { name: copyDaAvaliacao.criterios })
    const itens = within(lista).getAllByRole('listitem')
    expect(
      itens.map((item) => ({
        criterio: item.getAttribute('data-criterio'),
        texto: item.textContent,
      })),
    ).toEqual([
      {
        criterio: 'aviso_gravacao',
        texto: `Avisou da gravação${copyDaAvaliacao.aprovado}${copyDaAvaliacao.evidencia}: essa ligação é gravada`,
      },
      {
        criterio: 'orcamento',
        texto: `Perguntou o orçamento${copyDaAvaliacao.reprovado}${copyDaAvaliacao.evidencia}: Não houve pergunta sobre verba.`,
      },
      {
        criterio: 'nada_fora_da_base',
        texto: `Não afirmou nada fora da base de conhecimento${copyDaAvaliacao.semDecisao}${copyDaAvaliacao.evidencia}: ${copyDaAvaliacao.semEvidencia}`,
      },
    ])
  })

  it('sem avaliação, só a frase de que ainda não foi avaliada', async () => {
    await abrir(comFicha())
    const avaliacao = await regiao(copy.avaliacao.titulo)
    expect(within(avaliacao).getByText(copy.avaliacao.semNota)).toBeTruthy()
    expect(within(avaliacao).queryByRole('list')).toBeNull()
  })
})

/** Abre o formulário de correção dentro do bloco de classificação. */
async function abrirCorrecao(): Promise<HTMLElement> {
  const classificacao = await regiao(copy.classificacao.titulo)
  fireEvent.click(await within(classificacao).findByRole('button', { name: copyDaCorrecao.abrir }))
  return within(classificacao).getByRole('form', { name: copyDaCorrecao.titulo })
}

function botaoGravar(formulario: HTMLElement): HTMLButtonElement {
  return within(formulario).getByRole('button', { name: copyDaCorrecao.gravar }) as HTMLButtonElement
}

const CORRIGIDA = /^Corrigida por Renata Alves em \d{2}\/\d{2} às \d{2}h\d{2}\.$/

describe('/chamadas/:id — correção da classificação', () => {
  it('sem motivo o botão fica desligado, e a frase diz por quê', async () => {
    await abrir(comFicha())
    const formulario = await abrirCorrecao()
    expect(botaoGravar(formulario).disabled).toBe(true)
    expect(within(formulario).getByText(copyDaCorrecao.semMotivo)).toBeTruthy()

    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: '   ' },
    })
    expect(botaoGravar(formulario).disabled).toBe(true)

    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: 'Ela disse que já fechou com outro fornecedor.' },
    })
    expect(botaoGravar(formulario).disabled).toBe(false)
    expect(within(formulario).queryByText(copyDaCorrecao.semMotivo)).toBeNull()
  })

  it('oferece as etapas pelo rótulo e envia a chave, com o motivo', async () => {
    const chamadas = await abrir(comFicha())
    const formulario = await abrirCorrecao()
    const seletor = within(formulario).getByLabelText(copyDaCorrecao.etapa) as HTMLSelectElement

    expect([...seletor.options].map((opcao) => opcao.textContent)).toEqual([
      'Novo',
      'Contatado',
      'Qualificado',
      'Reunião marcada',
      'Ganho',
      'Perdido',
    ])
    expect(seletor.value).toBe('qualified')

    fireEvent.change(seletor, { target: { value: 'lost' } })
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: '  Já fechou com outro fornecedor.  ' },
    })
    fireEvent.click(botaoGravar(formulario))

    await waitFor(() => expect(chamadas.correcoes).toHaveLength(1))
    expect(chamadas.correcoes[0]).toEqual({
      chamadaId: CHAMADA_ENCERRADA,
      classificacao: {
        stage_key: 'lost',
        summary: 'Quer ver uma demonstração na semana que vem.',
      },
      motivo: 'Já fechou com outro fornecedor.',
    })
    expect(JSON.stringify(chamadas.correcoes[0])).not.toContain('Perdido')
  })

  it('gravada, a ficha mostra a etapa nova, o autor e a hora', async () => {
    await abrir(comFicha())
    const formulario = await abrirCorrecao()
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.etapa), {
      target: { value: 'won' },
    })
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: 'Fechou na própria ligação.' },
    })
    fireEvent.click(botaoGravar(formulario))

    const classificacao = await regiao(copy.classificacao.titulo)
    expect(await within(classificacao).findByText(copyDaCorrecao.gravada)).toBeTruthy()
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Ganho')
    expect(within(classificacao).getByText(CORRIGIDA)).toBeTruthy()
    expect(within(classificacao).queryByText(/confiança/)).toBeNull()
    expect(within(classificacao).queryByRole('form')).toBeNull()
  })

  it('SEXTO CRITÉRIO DA F4: a carga posterior com dado de retaguarda não desfaz a correção', async () => {
    const chamadas = await abrir(comFicha())
    const formulario = await abrirCorrecao()
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.etapa), {
      target: { value: 'won' },
    })
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: 'Fechou na própria ligação.' },
    })
    fireEvent.click(botaoGravar(formulario))
    await screen.findByText(copyDaCorrecao.gravada)

    // A retaguarda roda depois e tenta gravar a leitura do modelo por cima.
    chamadas.retaguarda(CHAMADA_ENCERRADA, {
      classificacao: { stage_key: 'lost', summary: 'Sem interesse.' },
      origemDaClassificacao: 'backfill',
      confiancaDaClassificacao: 0.91,
      sentimento: -0.8,
      duracaoSeg: 130,
    })

    cleanup()
    await abrir({}, CHAMADA_ENCERRADA, { chamadas })

    const classificacao = await regiao(copy.classificacao.titulo)
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Ganho')
    expect(within(classificacao).getByText(CORRIGIDA)).toBeTruthy()
    expect(campo(classificacao, copy.classificacao.sentimento).textContent).toBe('Positivo 0,60')
    expect(classificacao.textContent).not.toContain('Sem interesse.')
    // O que não é classificação passa: a trava é da correção, não da linha.
    expect(campo(await regiao(copy.resumo), copy.duracao).textContent).toBe('02:10')
  })

  it('sem correção, a mesma carga posterior traz a retaguarda: a trava é que segura', async () => {
    const chamadas = criarServicoDeChamadasDublado(comFicha())
    chamadas.retaguarda(CHAMADA_ENCERRADA, {
      classificacao: { stage_key: 'lost', summary: 'Sem interesse.' },
      confiancaDaClassificacao: 0.91,
    })
    await abrir({}, CHAMADA_ENCERRADA, { chamadas })
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Perdido')
    expect(within(classificacao).getByText(copyDaFonte.retaguarda(91))).toBeTruthy()
  })

  it('recusa do servidor fica no formulário, com a frase, e nada muda', async () => {
    await abrir({ ...comFicha(), correcao: { ok: false, motivo: 'classificacao-invalida' } })
    const formulario = await abrirCorrecao()
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: 'Etapa errada.' },
    })
    fireEvent.click(botaoGravar(formulario))

    const alerta = await within(formulario).findByRole('alert')
    expect(alerta.textContent).toBe(copyDaCorrecao.falhas['classificacao-invalida'])
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Qualificado')
  })

  it('enquanto grava, o botão diz isso e não aceita segundo clique', async () => {
    const chamadas = await abrir({ ...comFicha(), segurarCorrecao: true })
    const formulario = await abrirCorrecao()
    fireEvent.change(within(formulario).getByLabelText(copyDaCorrecao.motivo), {
      target: { value: 'Etapa errada.' },
    })
    fireEvent.click(botaoGravar(formulario))
    const gravando = (await within(formulario).findByRole('button', {
      name: copyDaCorrecao.gravando,
    })) as HTMLButtonElement
    expect(gravando.disabled).toBe(true)
    fireEvent.click(gravando)
    chamadas.liberarCorrecao()
    await screen.findByText(copyDaCorrecao.gravada)
    expect(chamadas.correcoes).toHaveLength(1)
  })

  it('viewer vê a classificação e a negativa com quem concede acesso, sem controle', async () => {
    const equipe = equipeDeExemplo('viewer')
    equipe.membros.push({
      usuarioId: 'u-3',
      nome: 'Otávio Prado',
      email: 'otavio@aurora.com.br',
      papel: 'admin',
      ultimoAcesso: null,
    })
    await abrir(comFicha(), CHAMADA_ENCERRADA, { equipe })
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(campo(classificacao, copy.classificacao.etapa).textContent).toBe('Qualificado')
    expect(await within(classificacao).findByText(copyDaCorrecao.soLeitura)).toBeTruthy()
    const quem = within(classificacao).getByRole('list', { name: comum.negativaPorPapel.pedirAcesso })
    expect(quem.textContent).toContain('Otávio Prado')
    expect(quem.textContent).not.toContain('Renata Alves')
    expect(within(classificacao).queryByRole('button', { name: copyDaCorrecao.abrir })).toBeNull()
  })

  it('chamada em andamento ou sem conversa não oferece correção', async () => {
    await abrir(comFicha({ origemDaClassificacao: null, classificacao: {}, turnos: [] }))
    const classificacao = await regiao(copy.classificacao.titulo)
    expect(within(classificacao).getByText(copy.classificacao.semConversa)).toBeTruthy()
    expect(within(classificacao).queryByRole('button')).toBeNull()
  })

  it('quem corrige no dublê é quem está na sessão', () => {
    expect(QUEM_CORRIGE).toBe(equipeDeExemplo().membros[0]!.nome)
  })
})
