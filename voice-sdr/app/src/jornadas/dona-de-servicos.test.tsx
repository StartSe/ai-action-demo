// Jornada da persona 1 (docs/personas.md): Carla, sócia de uma consultoria
// contábil com um vendedor só, que perde lead porque ninguém liga a tempo.
//
// Ela não sabe o que é OAuth nem E.164 e aceita dar uns trinta minutos para a
// configuração. O que ela precisa ver no primeiro dia é a assistente ligando
// para o celular dela, e depois o lead do site virando reunião na agenda do
// vendedor. Este arquivo anda por esse caminho com os dublês ligados entre si
// (`conta-da-jornada.ts`): fundação, o tutorial inteiro numa montagem só, a
// ligação de teste e o fecho.
//
// O que ficou de fora e por quê está em docs/validacao-por-persona.md.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JANELA_COMERCIAL } from '@compartilhado/discagem/casos-de-janela.ts'
import { nomeCurto } from '@voz/vozes-de-exemplo.ts'

import { autenticacao } from '@/copy/autenticacao'
import { aoVivo as copyDoAoVivo, discador as copyDoDiscador } from '@/copy/chamadas'
import { cadastroDeLead as copyDoCadastro } from '@/copy/leads'
import {
  BLOQUEIO_EM_PORTUGUES,
  configuracaoInicial as copyDaConfiguracao,
  PASSOS_EM_PORTUGUES,
} from '@/copy/configuracao-inicial'
import { diagnostico as copyDoDiagnostico } from '@/copy/diagnostico'
import { discagem as copyDaDiscagem } from '@/copy/discagem'
import { ligacaoAoLeadNovo as copyDaLigacaoAoLeadNovo } from '@/copy/ligacao-ao-lead-novo'
import { inicio as semNome, textosDoInicio } from '@/copy/inicio'
import { numeros as copyDosNumeros } from '@/copy/numeros'
import { VOZES_DE_EXEMPLO } from '@/configuracao-inicial/vozes-de-exemplo-geradas'
import { criarContaDaJornada } from '@/testes/conta-da-jornada'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  CHAMADA_ENCERRADA,
  chamadaAoVivo,
  criarServicoDeChamadasDublado,
  fichaDeExemplo,
  NUMERO_DE_TESTE,
} from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDeDiagnosticoDublado } from '@/testes/servico-de-diagnostico-dublado'
import { criarServicoDeDiscagemDublado } from '@/testes/servico-de-discagem-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDeLeadsDublado } from '@/testes/servico-de-leads-dublado'
import {
  criarServicoDeConfiguracaoDublado,
  passosConcluidos,
} from '@/testes/servico-de-configuracao-dublado'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
} from '@/testes/servico-de-integracoes-dublado'
import { criarServicoDaSarahDublado } from '@/testes/servico-da-sarah-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'carla@menezescontabil.com.br' }
// O dublê de chamadas decide a guarda pela lista de teste dele, que nasce com
// este número: é a mesma lista que a tela de discagem grava, como no banco.
const CELULAR_DA_CARLA = NUMERO_DE_TESTE
const LINHA_DA_TWILIO = '(11) 4000-2233'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

type Conta = ReturnType<typeof criarContaDaJornada>

async function montar(conta: Conta, caminho = '/configuracao-inicial') {
  return montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined,
    undefined,
    conta.integracoes,
    conta.configuracao,
    undefined,
    conta.sarah,
    conta.numeros,
    conta.chamadas,
    conta.discagem,
  )
}

function assistente(nome: string | null) {
  return within(screen.getByRole('dialog', { name: textosDoInicio(nome).rotulo }))
}

async function etapa(nome: string | null, titulo: string) {
  const dialogo = within(await screen.findByRole('dialog', { name: textosDoInicio(nome).rotulo }))
  expect(await dialogo.findByRole('heading', { name: titulo })).toBeDefined()
  return dialogo
}

async function seguir(nome: string) {
  const botao = assistente(nome).getByRole('button', { name: textosDoInicio(nome).seguir }) as HTMLButtonElement
  await waitFor(() => expect(botao.disabled).toBe(false))
  fireEvent.click(botao)
}

describe('Carla: da conta nova à primeira ligação', () => {
  it('a instalação virgem abre a fundação, e criar a conta leva direto ao tutorial', async () => {
    const copy = autenticacao.fundacao
    const servico = criarServicoDublado({ instalacaoSemDono: true })
    const { roteador } = await montarAplicacao(servico, '/entrar')
    const janela = within(await screen.findByRole('dialog'))

    const campos: [string, string][] = [
      [copy.nomeDaConta.rotulo, 'Menezes Contabilidade'],
      [copy.nomeDoDono.rotulo, 'Carla Menezes'],
      [copy.email.rotulo, SESSAO.email],
      [copy.senha.rotulo, 'contabil2026'],
      [copy.confirmacao.rotulo, 'contabil2026'],
    ]
    for (const [rotulo, valor] of campos) {
      fireEvent.change(janela.getByLabelText(rotulo), { target: { value: valor } })
    }
    fireEvent.click(janela.getByRole('button', { name: copy.acao }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/configuracao-inicial'))
    expect(servico.fundacoes).toEqual([
      expect.objectContaining({ nomeDaConta: 'Menezes Contabilidade', email: SESSAO.email }),
    ])
  })

  it('o tutorial inteiro numa visita: nome, conexões, negócio, publicar, número e a ligação de teste', async () => {
    const conta = criarContaDaJornada()
    await montar(conta)

    // 1. Boas-vindas, com o texto sem nome de fábrica. Atrás do cartão, a tela
    // não pode contar outro número de passos que não o da barra do cartão.
    let dialogo = await etapa(null, semNome.etapas.boasVindas.titulo)
    expect(copyDaConfiguracao.explicacao).not.toMatch(/oito|\b8\b/i)
    expect(dialogo.getByText(semNome.contagem(1, 14))).toBeDefined()
    expect(dialogo.getByText(semNome.boasVindas.potencial)).toBeDefined()
    fireEvent.click(dialogo.getByRole('button', { name: semNome.boasVindas.comecar }))

    // 2. O nome: daí em diante o texto a chama de Lia.
    dialogo = await etapa(null, semNome.etapas.nome.titulo)
    fireEvent.change(dialogo.getByLabelText(semNome.nome.rotulo), { target: { value: 'Lia' } })
    fireEvent.click(dialogo.getByRole('button', { name: semNome.nome.salvar }))
    const copy = textosDoInicio('Lia')
    await etapa('Lia', copy.etapas.plano.titulo)
    await seguir('Lia')

    // 3. O modelo: conectar leva ao OpenRouter; a volta conclui na mesma etapa.
    dialogo = await etapa('Lia', copy.etapas.modelo.titulo)
    const ir = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign: ir })
    fireEvent.click(dialogo.getByRole('button', { name: copy.modelo.conectar }))
    await waitFor(() => expect(ir).toHaveBeenCalledTimes(1))
    expect(String(ir.mock.calls[0]?.[0])).toMatch(/^https:\/\/openrouter\.ai\//)
    vi.unstubAllGlobals()
    cleanup()

    // A volta do OpenRouter é uma carga nova da aplicação, com o código na barra.
    vi.stubGlobal('location', {
      ...window.location,
      search: '?code=codigo-do-openrouter&state=marca-de-teste',
      pathname: '/configuracao-inicial',
    })
    await montar(conta)
    dialogo = await etapa('Lia', copy.etapas.modelo.titulo)
    expect(await dialogo.findByText(copy.modelo.conectado)).toBeDefined()
    expect(conta.base.conexoesDoModelo.map((passo) => passo.passo)).toEqual(['iniciar', 'concluir'])
    await seguir('Lia')

    // 4. A voz: a chave da ElevenLabs e uma das seis vozes.
    dialogo = await etapa('Lia', copy.etapas.voz.titulo)
    fireEvent.change(await dialogo.findByLabelText('chave da API'), { target: { value: 'sk_eleven_carla' } })
    fireEvent.click(dialogo.getByRole('button', { name: copy.chave.salvar }))
    const vozes = within(await dialogo.findByRole('region', { name: copy.vozes.titulo }))
    const escolhida = VOZES_DE_EXEMPLO[0]
    if (!escolhida) throw new Error('sem vozes de exemplo')
    fireEvent.click(vozes.getByRole('button', { name: `${copy.vozes.escolher} ${nomeCurto(escolhida)}` }))
    await seguir('Lia')

    // 5. A telefonia: as duas chaves da Twilio.
    dialogo = await etapa('Lia', copy.etapas.telefonia.titulo)
    fireEvent.change(dialogo.getByLabelText('identificador da conta'), { target: { value: 'AC00000000000000000000000000000abc' } })
    fireEvent.change(dialogo.getByLabelText('token de autenticação'), { target: { value: 'token-da-twilio' } })
    fireEvent.click(dialogo.getByRole('button', { name: copy.chave.salvar }))
    await seguir('Lia')

    // 6. O WhatsApp é opcional: seguir sem conectar.
    dialogo = await etapa('Lia', copy.etapas.whatsapp.titulo)
    expect(dialogo.getByText(copy.whatsappOpcional.aviso)).toBeDefined()
    await seguir('Lia')

    // 7. O negócio, por escrito, e as sugestões.
    dialogo = await etapa('Lia', copy.etapas.negocio.titulo)
    fireEvent.click(dialogo.getByRole('button', { name: new RegExp(copy.entrevista.escrever) }))
    fireEvent.change(dialogo.getByLabelText(copy.negocio.empresa.rotulo), { target: { value: 'Menezes Contabilidade' } })
    fireEvent.change(dialogo.getByLabelText(copy.negocio.descricao.rotulo), {
      target: { value: 'BPO financeiro e contabilidade consultiva para pequenas e médias empresas de serviço.' },
    })
    fireEvent.change(dialogo.getByLabelText(copy.negocio.bomCliente.rotulo), {
      target: { value: 'Faturamento acima de R$ 100 mil por mês e sem contador interno.' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.negocio.gerar }))
    const identidade = within(await dialogo.findByRole('region', { name: copy.sugestoes.etapas.identidade }))
    fireEvent.change(identidade.getByLabelText('Qual economia média vocês garantem?'), {
      target: { value: 'Não garantimos economia; o diagnóstico mostra onde há perda.' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.sugestoes.concluir }))

    // 8. O resumo grava tudo e nada vai ao ar.
    fireEvent.click(await dialogo.findByRole('button', { name: copy.resumo.concluir }))
    expect(conta.base.gravacoes.at(-1)).toMatchObject({ empresa: 'Menezes Contabilidade' })
    expect(conta.base.escolhas.at(-1)).toMatchObject({ vozId: escolhida.id })
    expect(conta.base.publicacoesDeVersao).toEqual([])

    // 9. Publicar leva o roteiro de descoberta ao ar, pelo código de agent-publish.
    dialogo = await etapa('Lia', copy.etapas.publicar.titulo)
    const rascunho = within(await dialogo.findByRole('region', { name: copy.publicar.rascunho }))
    fireEvent.click(rascunho.getByRole('button', { name: copy.publicar.publicar }))
    expect(await dialogo.findByText(copy.publicar.noAr)).toBeDefined()
    await seguir('Lia')

    // 10. O número: a tela de números embutida, com a linha já registrada.
    dialogo = await etapa('Lia', copy.etapas.numero.titulo)
    fireEvent.click(await dialogo.findByRole('button', { name: copyDosNumeros.cadastrar.abrir }))
    fireEvent.change(dialogo.getByLabelText(copyDosNumeros.cadastrar.numero), { target: { value: LINHA_DA_TWILIO } })
    fireEvent.change(dialogo.getByLabelText(copyDosNumeros.cadastrar.rotulo), { target: { value: 'Linha comercial' } })
    fireEvent.click(dialogo.getByRole('button', { name: copyDosNumeros.cadastrar.gravar }))
    expect(await dialogo.findByText(copy.numero.ligado)).toBeDefined()
    await seguir('Lia')

    // 11. A primeira ligação: cadastrar o celular como número de teste e ligar.
    dialogo = await etapa('Lia', copy.etapas.ligacao.titulo)
    const ligacao = copyDaConfiguracao.ligacao
    expect(await dialogo.findByText(ligacao.semNumero)).toBeDefined()
    fireEvent.change(dialogo.getByLabelText(copyDaDiscagem.numerosDeTeste.numero.rotulo), {
      target: { value: CELULAR_DA_CARLA },
    })
    fireEvent.change(dialogo.getByLabelText(copyDaDiscagem.numerosDeTeste.rotuloDoNumero.rotulo), {
      target: { value: 'Celular da Carla' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copyDaDiscagem.numerosDeTeste.acao }))
    const ligar = (await dialogo.findByRole('button', { name: ligacao.ligar })) as HTMLButtonElement
    await waitFor(() => expect(ligar.disabled).toBe(false))
    fireEvent.click(ligar)
    await waitFor(() => expect(conta.chamadas.pedidos).toHaveLength(1))
    expect(conta.chamadas.pedidos[0]).toMatchObject({ telefone: CELULAR_DA_CARLA, proposito: 'discovery' })

    // A chamada que call-place gravou é a primeira do dublê.
    conta.chamadas.empurrar([chamadaAoVivo(12, { chamadaId: 'ch-1', status: 'in_progress', leadId: null })])
    expect(await dialogo.findByText(copyDoAoVivo.status.in_progress ?? '')).toBeDefined()
    conta.chamadas.empurrar([])
    expect(await dialogo.findByRole('link', { name: ligacao.abrirFicha })).toBeDefined()
    await waitFor(() => expect(conta.configuracao.progressos.at(-1)?.ligacaoDeTeste).toBe('ch-1'))
    await seguir('Lia')

    // 12. O fecho.
    dialogo = await etapa('Lia', copy.etapas.pronto.titulo)
    expect(dialogo.getByRole('button', { name: copy.pronto.concluir })).toBeDefined()
  })

  it('o fecho não diz que está completa enquanto não há especialista para receber a reunião', async () => {
    // A Carla terminou o tutorial sem cadastrar o Rafael, o vendedor. A
    // assistente liga, mas não marca reunião com ninguém: o fecho precisa dizer
    // isso, senão a primeira ligação de lead real termina sem agenda.
    const passos = passosConcluidos().map((passo) =>
      passo.passo === 'especialista' || passo.passo === 'agenda'
        ? { ...passo, pendente: true, estado: 'pendente' as const }
        : passo,
    )
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/configuracao-inicial',
      undefined,
      undefined,
      criarServicoDeIntegracoesDublado({
        integracoes: integracoesDeExemplo().map((item) => ({
          ...item,
          estado: 'conectado' as const,
          configurado: true,
          conectado: true,
          erro: null,
        })),
      }),
      criarServicoDeConfiguracaoDublado({ passos, ligacaoDeTeste: 'ch-carla' }),
      undefined,
      criarServicoDaSarahDublado({
        modelo: {
          porta: 'openrouter',
          conectadoEm: '2026-09-25T10:00:00.000Z',
          finalDaChave: 'k9x2',
          escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
        },
      }),
    )

    const copy = textosDoInicio('Sarah')
    const dialogo = await etapa('Sarah', copy.etapas.pronto.titulo)
    const depois = within(dialogo.getByRole('region', { name: copy.pronto.depoisTitulo }))
    expect(depois.queryByText(copy.pronto.semPendencias)).toBeNull()
    expect(depois.getByText(PASSOS_EM_PORTUGUES.especialista.titulo)).toBeDefined()
    // E diz o que a falta custa: a conversa não vira reunião marcada.
    expect(depois.getAllByText(BLOQUEIO_EM_PORTUGUES.agendamento)).toHaveLength(2)
  })

  it('D-03: o fecho oferece ligar para o lead novo em minutos, opcional e com o custo dito', async () => {
    const discagem = criarServicoDeDiscagemDublado()
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/configuracao-inicial',
      undefined,
      undefined,
      criarServicoDeIntegracoesDublado({
        integracoes: integracoesDeExemplo().map((item) => ({
          ...item,
          estado: 'conectado' as const,
          configurado: true,
          conectado: true,
          erro: null,
        })),
      }),
      criarServicoDeConfiguracaoDublado({ passos: passosConcluidos(), ligacaoDeTeste: 'ch-carla' }),
      undefined,
      criarServicoDaSarahDublado({
        modelo: {
          porta: 'openrouter',
          conectadoEm: '2026-09-25T10:00:00.000Z',
          finalDaChave: 'k9x2',
          escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
        },
      }),
      undefined,
      undefined,
      discagem,
    )

    const copy = textosDoInicio('Sarah')
    const dialogo = await etapa('Sarah', copy.etapas.pronto.titulo)
    const oferta = within(await dialogo.findByRole('group', { name: copyDaLigacaoAoLeadNovo.titulo }))
    expect(oferta.getByText(copyDaLigacaoAoLeadNovo.tutorial.explicacao)).toBeDefined()

    fireEvent.click(oferta.getByRole('button', { name: copyDaLigacaoAoLeadNovo.ligar }))

    expect(await oferta.findByText(copyDaLigacaoAoLeadNovo.tutorial.ligada)).toBeDefined()
    expect(discagem.gravacoesDaLigacaoAoLeadNovo).toEqual([
      {
        configuracao: { ligada: true, prazoMinutos: 5 },
        motivo: copyDaLigacaoAoLeadNovo.motivo.padraoDoTutorial,
      },
    ])
  })
})

/** A conta da Carla depois da ligação de teste: o portão aberto para lead real. */
const PORTAO_ABERTO = {
  realDialing: true,
  primeiraChamadaDeTesteEm: '2026-09-25T15:30:00.000Z',
  numerosDeTeste: [NUMERO_DE_TESTE],
}

describe('Carla: a discagem para lead real', () => {
  it('a política de discagem mostra as duas condições sem falar de fase nem de portão', async () => {
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/config/discagem',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo('owner') } }),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      criarServicoDeDiscagemDublado(),
    )
    const titulo = await screen.findByRole('heading', { name: copyDaDiscagem.portao.titulo })
    const secao = titulo.closest('section') ?? titulo.parentElement?.parentElement
    await waitFor(() =>
      expect(secao?.textContent).toContain(copyDaDiscagem.portao.condicoes.primeira_chamada_de_teste.rotulo),
    )
    expect(secao?.textContent ?? '').not.toMatch(/\bfase\b|portão|fatia/i)
  })
})

describe('Carla: o primeiro lead de verdade', () => {
  it('antes da ligação de teste, o painel diz por que só liga para teste, sem falar de fase nem de portão', async () => {
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo('owner') } }),
      undefined, undefined, undefined, undefined, undefined, undefined,
      criarServicoDeChamadasDublado(),
    )
    const titulo = await screen.findByText(copyDoDiscador.portaoFechado.titulo)
    const aviso = titulo.parentElement?.textContent ?? ''
    expect(aviso).toContain(copyDoDiscador.portaoFechado.explicacao)
    // A Carla não sabe o que é fase do produto nem portão: são palavras da obra.
    expect(aviso).not.toMatch(/\bfase\b|portão|fatia/i)
  })

  async function cadastrarPelaTela(chamadas: ReturnType<typeof criarServicoDeChamadasDublado>) {
    const leads = criarServicoDeLeadsDublado()
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads/novo',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo('owner') } }),
      undefined,
      undefined,
      undefined,
      leads,
      undefined,
      undefined,
      chamadas,
    )
    await screen.findByRole('heading', { name: copyDoCadastro.titulo })
    const telefone = screen.getByLabelText(copyDoCadastro.campos.telefone) as HTMLInputElement
    await waitFor(() => expect(telefone.disabled).toBe(false))
    fireEvent.change(telefone, { target: { value: '(31) 98877-6655' } })
    fireEvent.change(screen.getByLabelText(copyDoCadastro.campos.nome), { target: { value: 'Otávio Lins' } })
    fireEvent.change(screen.getByLabelText(copyDoCadastro.campos.empresa), { target: { value: 'Lins Engenharia' } })
    fireEvent.change(screen.getByLabelText(copyDoCadastro.campos.origem), { target: { value: 'Indicação do Rafael' } })
    // O DDD 31 resolve Belo Horizonte, e é pelo fuso dele que a janela vale.
    await waitFor(() =>
      expect((screen.getByLabelText(copyDoCadastro.localidade.estado) as HTMLInputElement).value).toBe('MG'),
    )
    const gravar = screen.getByRole('button', { name: copyDoCadastro.gravar }) as HTMLButtonElement
    await waitFor(() => expect(gravar.disabled).toBe(false))
    fireEvent.click(gravar)
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/leads'))
    fireEvent.click(await screen.findByRole('link', { name: 'Otávio Lins' }))
    await screen.findByRole('heading', { level: 1, name: 'Otávio Lins' })
    return { leads, roteador }
  }

  it('cadastra o lead da indicação e liga da ficha dele, com o propósito de descoberta', async () => {
    const chamadas = criarServicoDeChamadasDublado({ discador: { portao: PORTAO_ABERTO } })
    const { leads } = await cadastrarPelaTela(chamadas)
    expect(leads.cadastrados[0]).toMatchObject({ telefone: '+5531988776655', estado: 'MG' })

    // O discador da ficha: o mesmo do painel, com o lead como destino.
    expect(await screen.findByRole('heading', { name: copyDoDiscador.titulo })).toBeDefined()
    fireEvent.click(await screen.findByRole('button', { name: copyDoDiscador.discar }))

    expect(await screen.findByText('A ligação foi para a linha e está discando.')).toBeDefined()
    expect(chamadas.pedidos).toEqual([
      expect.objectContaining({ telefone: '+5531988776655', proposito: 'discovery' }),
    ])
    expect(chamadas.pedidos[0]?.leadId).toMatch(/^l-novo-/)
  })

  it('às 21h a ligação não sai, e a ficha diz por quê e quando a janela abre', async () => {
    const chamadas = criarServicoDeChamadasDublado({
      discador: { portao: PORTAO_ABERTO },
      janela: JANELA_COMERCIAL,
      // Sexta, 21h em São Paulo: a janela comercial fecha às 18h.
      agora: () => '2026-10-03T00:00:00.000Z',
    })
    await cadastrarPelaTela(chamadas)

    fireEvent.click(await screen.findByRole('button', { name: copyDoDiscador.discar }))

    const recusa = await waitFor(() => {
      const alerta = screen
        .queryAllByRole('alert')
        .find((cada) => cada.textContent?.includes(copyDoDiscador.recusaTitulo))
      if (!alerta) throw new Error('sem recusa')
      return alerta
    })
    expect(recusa.textContent).toContain(copyDoDiscador.recusaTitulo)
    expect(recusa.textContent).toContain('fora da janela de discagem')
    expect(recusa.textContent).toContain('A janela abre de novo')
    expect(chamadas.ligacoes.size).toBe(0)
  })
})

describe('Carla: a ligação de teste encerrou cedo demais', () => {
  it('a ficha mostra o custo e a classificação, e o diagnóstico propõe, aplica e publica a correção do roteiro', async () => {
    const diagnostico = criarServicoDeDiagnosticoDublado()
    const sarah = criarServicoDaSarahDublado()
    const chamadas = criarServicoDeChamadasDublado({
      fichas: { [CHAMADA_ENCERRADA]: { ok: true, ficha: fichaDeExemplo() } },
    })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      `/chamadas/${CHAMADA_ENCERRADA}`,
      undefined, undefined, undefined, undefined, undefined,
      sarah,
      undefined,
      chamadas,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      diagnostico,
    )

    // O que ela quer saber primeiro: quanto custou e o que a assistente entendeu.
    expect(await screen.findByText('Quer ver uma demonstração na semana que vem.')).toBeDefined()

    const regiao = await screen.findByRole('region', { name: copyDoDiagnostico.titulo })
    fireEvent.click(await within(regiao).findByRole('button', { name: copyDoDiagnostico.analisar }))
    await within(regiao).findByRole('heading', { name: copyDoDiagnostico.achados.titulo })

    const nome = 'Não encerrar quando o lead só autoriza a conversa'
    fireEvent.click(within(within(regiao).getByRole('listitem', { name: nome })).getByRole('button', { name: copyDoDiagnostico.propostas.aplicar }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: copyDoDiagnostico.confirmar.confirmar }))
    await waitFor(() => expect(diagnostico.aplicadas).toHaveLength(1))

    // Aplicar não põe no ar: publicar é o segundo clique, e vai pelo playbook.
    expect(sarah.chamadasAoAgentPublish()).toBe(0)
    const aplicada = await within(regiao).findByRole('listitem', { name: nome })
    fireEvent.click(within(aplicada).getByRole('button', { name: copyDoDiagnostico.publicar.botao }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: copyDoDiagnostico.publicar.confirmar }))
    await waitFor(() => expect(sarah.publicacoesDeVersao).toHaveLength(1))
    expect(sarah.publicacoesDeVersao[0]).toMatchObject({ proposito: 'discovery' })
  })
})
