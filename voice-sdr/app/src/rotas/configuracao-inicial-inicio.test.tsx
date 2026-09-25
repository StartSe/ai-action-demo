// O assistente de abertura é o tutorial inteiro: /configuracao-inicial abre um
// cartão no meio da tela, na primeira coisa que falta.
//
// O que se prova: quando ele abre e quando não; que a etapa começa na primeira
// conexão que falta; que salvar uma chave passa pelo serviço de integrações e
// libera o seguir; que o negócio pede as sugestões pelo serviço da Sarah; que as
// sugestões aparecem já conferidas pela borda (o dublê passa por
// `atenderSugestao`), editáveis, com as perguntas; que o resumo segue para a
// publicação; e que pular grava a dispensa e leva ao painel.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { configuracaoInicial as copyDaConfiguracao } from '@/copy/configuracao-inicial'
import { inicio as semNome, textosDoInicio } from '@/copy/inicio'
import { PERMISSOES_DA_ELEVENLABS, textoDaInstrucao } from '@/copy/instrucoes-das-chaves'
import { nomeCurto } from '@voz/vozes-de-exemplo.ts'

import { CHAVE_DAS_SUGESTOES } from '@/configuracao-inicial/inicio'
import { VOZES_DE_EXEMPLO } from '@/configuracao-inicial/vozes-de-exemplo-geradas'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeConfiguracaoDublado,
  passosDeExemplo,
} from '@/testes/servico-de-configuracao-dublado'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
} from '@/testes/servico-de-integracoes-dublado'
import {
  SUGESTOES_DE_EXEMPLO,
  criarServicoDaSarahDublado,
  identidadeDeExemplo,
  type RespostasDaSarah,
  vozDeExemplo,
} from '@/testes/servico-da-sarah-dublado'
import { criarServicoDaContaDublado } from '@/testes/servico-da-conta-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

/** A conta dos dublês já tem a assistente com nome: o texto a chama por ele. */
const copy = textosDoInicio('Sarah')

/** A conta que ainda não respondeu a primeira pergunta do tutorial. */
const SEM_ASSISTENTE: RespostasDaSarah = { sarah: { identidade: null, publicacao: 'rascunho' } }

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/** Os passos do assistente com as credenciais ainda por fazer. */
function passosSemCredenciais() {
  return passosDeExemplo().map((passo) =>
    passo.passo === 'credenciais'
      ? { ...passo, pendente: true, marcado: false, estado: 'pendente' as const }
      : passo,
  )
}

const MODELO_CONECTADO = {
  porta: 'openrouter' as const,
  conectadoEm: '2026-09-24T10:00:00.000Z',
  finalDaChave: 'a1b2',
  escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
}

/** Voz e telefonia conectadas: com o modelo, o assistente abre no negócio. */
function integracoesConectadas() {
  return integracoesDeExemplo().map((item) =>
    item.provedor === 'voz' || item.provedor === 'telefonia'
      ? { ...item, estado: 'conectado' as const, configurado: true, conectado: true, erro: null }
      : item,
  )
}

/** Voz e telefonia sem chave: o assistente abre na voz depois do modelo. */
function integracoesSemChave() {
  return integracoesDeExemplo().map((item) =>
    item.provedor === 'voz' || item.provedor === 'telefonia'
      ? {
          ...item,
          estado: 'nao_configurado' as const,
          configurado: false,
          conectado: false,
          chaves: item.chaves.map((chave) => ({ ...chave, preenchida: false })),
        }
      : item,
  )
}

async function abrir(opcoes: {
  passos?: ReturnType<typeof passosDeExemplo>
  modeloConectado?: boolean
  integracoes?: ReturnType<typeof integracoesDeExemplo>
  sarah?: RespostasDaSarah
  /** O nome da conta dado na fundação (D-10). */
  nomeDaConta?: string
} = {}) {
  const configuracao = criarServicoDeConfiguracaoDublado({
    passos: opcoes.passos ?? passosSemCredenciais(),
  })
  const integracoes = criarServicoDeIntegracoesDublado({
    integracoes: opcoes.integracoes ?? integracoesDeExemplo(),
  })
  const sarah = criarServicoDaSarahDublado({
    ...(opcoes.modeloConectado === false ? {} : { modelo: MODELO_CONECTADO }),
    ...opcoes.sarah,
  })
  const { roteador } = await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/configuracao-inicial',
    undefined,
    undefined,
    integracoes,
    configuracao,
    undefined,
    sarah,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    criarServicoDaContaDublado({ nomeDaConta: opcoes.nomeDaConta ?? null }),
  )
  await screen.findByRole('heading', { level: 1 })
  return { configuracao, integracoes, sarah, roteador }
}

type DentroDoAssistente = ReturnType<typeof within>

describe('quando o assistente abre', () => {
  it('com as credenciais pendentes, abre o assistente e não a configuração completa', async () => {
    await abrir({ modeloConectado: false })

    expect(await screen.findByRole('dialog', { name: copy.rotulo })).toBeDefined()
    expect(screen.queryByRole('dialog', { name: copyDaConfiguracao.titulo })).toBeNull()
  })

  it('com as credenciais resolvidas e a Sarah sem identidade, abre no negócio, e não há outro tutorial', async () => {
    await abrir({ passos: passosDeExemplo(), integracoes: integracoesConectadas() })

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    expect(await dialogo.findByRole('heading', { name: copy.etapas.negocio.titulo })).toBeDefined()
    expect(screen.queryByRole('dialog', { name: copyDaConfiguracao.titulo })).toBeNull()
  })
})

describe('as etapas de conexão', () => {
  it('sem nada feito, abre nas boas-vindas, pergunta o nome e o plano vem antes do modelo', async () => {
    const { sarah } = await abrir({
      modeloConectado: false,
      integracoes: integracoesSemChave(),
      sarah: SEM_ASSISTENTE,
    })

    const dialogo = within(await screen.findByRole('dialog', { name: semNome.rotulo }))
    expect(
      await dialogo.findByRole('heading', { name: semNome.etapas.boasVindas.titulo }),
    ).toBeDefined()
    // Antes do nome, o texto diz "a assistente".
    expect(dialogo.getByText(semNome.boasVindas.potencial)).toBeDefined()
    expect(semNome.boasVindas.potencial).not.toContain('Sarah')
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')

    fireEvent.click(dialogo.getByRole('button', { name: semNome.boasVindas.comecar }))
    expect(await dialogo.findByRole('heading', { name: semNome.etapas.nome.titulo })).toBeDefined()
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')
    expect(dialogo.getByText(semNome.nome.porQue)).toBeDefined()
    const campo = dialogo.getByLabelText(semNome.nome.rotulo) as HTMLInputElement
    // Sem nome de fábrica: o campo nasce vazio, com o exemplo no marcador.
    expect(campo.value).toBe('')
    expect(campo.getAttribute('placeholder')).toBe(semNome.nome.exemplo)
    const salvar = dialogo.getByRole('button', { name: semNome.nome.salvar }) as HTMLButtonElement
    expect(salvar.disabled).toBe(true)

    fireEvent.change(campo, { target: { value: '  Ana ' } })
    fireEvent.click(salvar)

    // O que vai ao serviço é o que foi escrito; aparar é do serviço.
    await waitFor(() => expect(sarah.nomes).toEqual(['  Ana ']))
    const comNome = textosDoInicio('Ana')
    expect(await dialogo.findByRole('heading', { name: comNome.etapas.plano.titulo })).toBeDefined()
    // Daí em diante o tutorial chama a assistente pelo nome escolhido.
    for (const item of comNome.plano.itens) expect(dialogo.getByText(item.frase)).toBeDefined()
    expect(comNome.plano.itens[1]?.frase).toContain('A Ana conversa com você')

    fireEvent.click(dialogo.getByRole('button', { name: comNome.seguir }))
    expect(await dialogo.findByRole('heading', { name: comNome.etapas.modelo.titulo })).toBeDefined()
  })

  it('com as conexões feitas e sem nome, abre na pergunta do nome, e a voz passa a usar o nome', async () => {
    const { sarah } = await abrir({
      passos: passosDeExemplo(),
      integracoes: integracoesConectadas(),
      sarah: SEM_ASSISTENTE,
    })

    const dialogo = within(await screen.findByRole('dialog', { name: semNome.rotulo }))
    expect(await dialogo.findByRole('heading', { name: semNome.etapas.nome.titulo })).toBeDefined()
    // O seguir do rodapé não existe aqui: quem segue é o botão de gravar.
    expect(dialogo.queryByRole('button', { name: semNome.seguir })).toBeNull()

    fireEvent.change(dialogo.getByLabelText(semNome.nome.rotulo), { target: { value: 'Ana' } })
    fireEvent.click(dialogo.getByRole('button', { name: semNome.nome.salvar }))
    await waitFor(() => expect(sarah.nomes).toEqual(['Ana']))

    const comNome = textosDoInicio('Ana')
    await dialogo.findByRole('heading', { name: comNome.etapas.plano.titulo })
    fireEvent.click(dialogo.getByRole('button', { name: comNome.seguir }))
    fireEvent.click(await dialogo.findByRole('button', { name: comNome.seguir }))
    expect(await dialogo.findByRole('heading', { name: comNome.etapas.voz.titulo })).toBeDefined()
    expect(dialogo.getByText('Conecte a ElevenLabs e escolha como a Ana soa.')).toBeDefined()
  })

  it('nome recusado pelo servidor fica na etapa e diz por quê', async () => {
    await abrir({
      passos: passosDeExemplo(),
      integracoes: integracoesConectadas(),
      sarah: { ...SEM_ASSISTENTE, salvarNome: { ok: false, motivo: 'sem-permissao' } },
    })

    const dialogo = within(await screen.findByRole('dialog', { name: semNome.rotulo }))
    await dialogo.findByRole('heading', { name: semNome.etapas.nome.titulo })
    fireEvent.change(dialogo.getByLabelText(semNome.nome.rotulo), { target: { value: 'Ana' } })
    fireEvent.click(dialogo.getByRole('button', { name: semNome.nome.salvar }))

    expect(within(await dialogo.findByRole('alert')).getByText(semNome.nome.semPermissao)).toBeDefined()
    expect(dialogo.getByRole('heading', { name: semNome.etapas.nome.titulo })).toBeDefined()
  })

  it('sem modelo e com a voz já conectada, abre no modelo, com o ChatGPT em breve e o seguir desligado', async () => {
    await abrir({ modeloConectado: false })

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    expect(await dialogo.findByRole('heading', { name: copy.etapas.modelo.titulo })).toBeDefined()
    expect(dialogo.getByText(copy.modelo.emBreve)).toBeDefined()
    expect(dialogo.getByRole('button', { name: copy.modelo.conectar })).toBeDefined()
    expect((dialogo.getByRole('button', { name: copy.seguir }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4')
  })

  it('com o modelo conectado e a voz sem chave, abre na voz', async () => {
    await abrir({ integracoes: integracoesSemChave() })

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    expect(
      await dialogo.findByRole('heading', { name: copy.etapas.voz.titulo }),
    ).toBeDefined()
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5')
  })

  it('salvar a chave da voz grava pelo serviço de integrações e libera o seguir', async () => {
    const { integracoes } = await abrir({ integracoes: integracoesSemChave() })

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    const campo = await dialogo.findByLabelText('chave da API')
    fireEvent.change(campo, { target: { value: 'sk_nova' } })
    fireEvent.click(dialogo.getByRole('button', { name: copy.chave.salvar }))

    // Com a chave conectada, aparecem as seis vozes de exemplo; o seguir só
    // liga depois de escolher uma.
    const vozes = within(await dialogo.findByRole('region', { name: copy.vozes.titulo }))
    expect(dialogo.getByText(copy.chave.conectado)).toBeDefined()
    expect(integracoes.gravacoes).toEqual([{ provedor: 'voz', valores: { api_key: 'sk_nova' } }])
    expect(vozes.getAllByRole('button', { name: new RegExp(`^${copy.vozes.escolher} `) })).toHaveLength(6)
    expect((dialogo.getByRole('button', { name: copy.seguir }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    const primeira = VOZES_DE_EXEMPLO[0]
    if (!primeira) throw new Error('sem vozes de exemplo')
    fireEvent.click(vozes.getByRole('button', { name: `${copy.vozes.escolher} ${nomeCurto(primeira)}` }))
    expect(
      vozes.getByRole('button', { name: `${copy.vozes.escolher} ${nomeCurto(primeira)}` }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect((dialogo.getByRole('button', { name: copy.seguir }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(vozes.getByText(copy.vozes.aviso)).toBeDefined()

    fireEvent.click(dialogo.getByRole('button', { name: copy.seguir }))
    expect(
      await dialogo.findByRole('heading', { name: copy.etapas.telefonia.titulo }),
    ).toBeDefined()
  })
})

describe('o negócio e as sugestões', () => {
  async function chegarNoNegocio(sarah?: RespostasDaSarah, nomeDaConta?: string) {
    const servicos = await abrir({ integracoes: integracoesConectadas(), sarah, nomeDaConta })
    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    await dialogo.findByRole('heading', { name: copy.etapas.negocio.titulo })
    // A conversa com a assistente é a primeira escolha; aqui é o caminho escrito.
    fireEvent.click(dialogo.getByRole('button', { name: new RegExp(copy.entrevista.escrever) }))
    return { ...servicos, dialogo }
  }

  function preencher(dialogo: DentroDoAssistente) {
    fireEvent.change(dialogo.getByLabelText(copy.negocio.empresa.rotulo), {
      target: { value: 'Aurora Energia' },
    })
    fireEvent.change(dialogo.getByLabelText(copy.negocio.descricao.rotulo), {
      target: { value: 'Usinas solares por assinatura para indústrias de médio porte no Sul.' },
    })
  }

  /** A assistente com nome e sem empresa: o que a primeira pergunta do tutorial grava. */
  const SEM_EMPRESA: RespostasDaSarah = {
    sarah: { identidade: { ...identidadeDeExemplo(), empresa: '' }, publicacao: 'rascunho' },
  }

  it('a empresa nasce com o nome da conta da fundação, e não é pedida duas vezes (D-10)', async () => {
    const { dialogo, sarah } = await chegarNoNegocio(SEM_EMPRESA, 'Aurora Energia')

    const empresa = dialogo.getByLabelText(copy.negocio.empresa.rotulo) as HTMLInputElement
    await waitFor(() => expect(empresa.value).toBe('Aurora Energia'))

    // Mexer na descrição não apaga a empresa sugerida.
    fireEvent.change(dialogo.getByLabelText(copy.negocio.descricao.rotulo), {
      target: { value: 'Usinas solares por assinatura para indústrias de médio porte no Sul.' },
    })
    expect(empresa.value).toBe('Aurora Energia')
    fireEvent.click(dialogo.getByRole('button', { name: copy.negocio.gerar }))
    await waitFor(() => expect(sarah.pedidosDeSugestao).toHaveLength(1))
    expect(sarah.pedidosDeSugestao[0]?.empresa).toBe('Aurora Energia')
  })

  it('a empresa já gravada vence o nome da conta, e apagada de propósito continua vazia (D-10)', async () => {
    // A identidade de exemplo já tem a empresa gravada.
    const { dialogo } = await chegarNoNegocio(undefined, 'Aurora Energia')

    const empresa = dialogo.getByLabelText(copy.negocio.empresa.rotulo) as HTMLInputElement
    await waitFor(() => expect(empresa.value).toBe(identidadeDeExemplo().empresa))
    fireEvent.change(empresa, { target: { value: '' } })
    expect(empresa.value).toBe('')
  })

  it('com as três conexões feitas, abre no negócio, e gerar só liga com a descrição completa', async () => {
    const { dialogo } = await chegarNoNegocio()

    const gerar = dialogo.getByRole('button', { name: copy.negocio.gerar }) as HTMLButtonElement
    expect(gerar.disabled).toBe(true)
    fireEvent.change(dialogo.getByLabelText(copy.negocio.descricao.rotulo), {
      target: { value: 'Vendo energia.' },
    })
    expect(dialogo.getByText(copy.negocio.curta(26))).toBeDefined()

    preencher(dialogo)
    expect(gerar.disabled).toBe(false)
  })

  it('gerar pede pelo serviço da Sarah e mostra as sugestões por etapa, editáveis', async () => {
    const { dialogo, sarah } = await chegarNoNegocio()
    preencher(dialogo)
    fireEvent.click(dialogo.getByRole('button', { name: copy.negocio.gerar }))

    const identidade = within(
      await dialogo.findByRole('region', { name: copy.sugestoes.etapas.identidade }),
    )
    expect(sarah.pedidosDeSugestao).toEqual([
      {
        empresa: 'Aurora Energia',
        descricao: 'Usinas solares por assinatura para indústrias de médio porte no Sul.',
        bomCliente: '',
      },
    ])

    const oferta = identidade.getByLabelText(copy.sugestoes.campos.oferta ?? '') as HTMLTextAreaElement
    expect(oferta.value).toBe('Energia solar por assinatura, sem investimento inicial.')
    fireEvent.change(oferta, { target: { value: 'Energia 20% mais barata.' } })
    expect(oferta.value).toBe('Energia 20% mais barata.')

    // As perguntas do que falta, com o exemplo como marcador do campo.
    const pergunta = identidade.getByLabelText('Qual economia média vocês garantem?')
    expect(pergunta.getAttribute('placeholder')).toBe('Entre 15% e 20% na conta')

    for (const etapa of SUGESTOES_DE_EXEMPLO.etapas) {
      const nome = copy.sugestoes.etapas[etapa.etapa as keyof typeof copy.sugestoes.etapas]
      expect(dialogo.getByRole('region', { name: nome })).toBeDefined()
    }
    // 9: o WhatsApp opcional entrou entre a telefonia e o negócio.
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('9')
  })

  async function chegarNoResumo(sarah?: RespostasDaSarah) {
    const servicos = await chegarNoNegocio(sarah)
    const { dialogo } = servicos
    preencher(dialogo)
    fireEvent.click(dialogo.getByRole('button', { name: copy.negocio.gerar }))
    const identidade = within(
      await dialogo.findByRole('region', { name: copy.sugestoes.etapas.identidade }),
    )
    // A pessoa responde uma das perguntas: ela vai para a base de conhecimento.
    fireEvent.change(identidade.getByLabelText('Qual economia média vocês garantem?'), {
      target: { value: 'Entre 15% e 20% na conta de luz.' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.sugestoes.concluir }))
    await dialogo.findByRole('button', { name: copy.resumo.concluir })
    return servicos
  }

  it('aplicar grava a identidade, o roteiro como rascunho e as respostas na base', async () => {
    const { dialogo, sarah } = await chegarNoResumo()

    expect(sarah.gravacoes).toHaveLength(1)
    expect(sarah.gravacoes[0]).toMatchObject({
      nome: 'Sarah',
      empresa: 'Aurora Energia',
      oferta: 'Energia solar por assinatura, sem investimento inicial.',
    })
    expect(sarah.rascunhos).toEqual([
      expect.objectContaining({ proposito: 'discovery', roteiro: expect.stringContaining('conta de luz') }),
    ])
    expect(sarah.entradasGravadas).toEqual([
      expect.objectContaining({
        pergunta: 'Qual economia média vocês garantem?',
        resposta: 'Entre 15% e 20% na conta de luz.',
      }),
    ])
    // Nada foi publicado: publicar é da pessoa.
    expect(sarah.publicacoesDeVersao).toEqual([])

    const identidade = within(dialogo.getByRole('region', { name: copy.resumo.partes.identidade }))
    expect(identidade.getByText(copy.resumo.estados.aplicado)).toBeDefined()
    expect(
      within(dialogo.getByRole('region', { name: copy.resumo.partes.roteiro })).getByText(
        copy.resumo.estados.rascunho,
      ),
    ).toBeDefined()
    expect(
      within(dialogo.getByRole('region', { name: copy.resumo.partes.especialista })).getByText(
        copy.resumo.estados.para_fazer,
      ),
    ).toBeDefined()
    // 10: o WhatsApp opcional entrou entre a telefonia e o negócio.
    expect(dialogo.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10')
    // Sem voz escolhida neste caminho, a parte da voz fica sem sugestão.
    expect(
      within(dialogo.getByRole('region', { name: copy.resumo.partes.voz })).getByText(
        copy.resumo.estados.nada,
      ),
    ).toBeDefined()
  })

  it('o resumo não guarda o negócio no navegador e segue para a publicação', async () => {
    const { dialogo } = await chegarNoResumo()

    // Sem conta na chave, o negócio desta conta ficaria para a próxima que
    // entrasse na mesma aba.
    expect(window.localStorage.getItem(CHAVE_DAS_SUGESTOES)).toBeNull()

    fireEvent.click(dialogo.getByRole('button', { name: copy.resumo.concluir }))
    expect(await dialogo.findByRole('heading', { name: copy.etapas.publicar.titulo })).toBeDefined()
    expect(await dialogo.findByText(copy.publicar.porQue)).toBeDefined()
  })

  it('sem voz escolhida, publicar diz o que falta e não deixa publicar', async () => {
    const { dialogo, sarah } = await chegarNoResumo()
    fireEvent.click(dialogo.getByRole('button', { name: copy.resumo.concluir }))

    const falta = within(await dialogo.findByRole('alert'))
    expect(falta.getByText(copy.publicar.faltas.voz)).toBeDefined()
    const botao = dialogo.getByRole('button', { name: copy.publicar.publicar }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(falta.getByRole('button', { name: copy.publicar.escolherVoz }))
    expect(await dialogo.findByRole('heading', { name: copy.etapas.voz.titulo })).toBeDefined()
    expect(sarah.publicacoesDeVersao).toEqual([])
  })

  it('publicar leva o rascunho que o resumo gravou ao ar, pelo serviço da Sarah', async () => {
    const { dialogo, sarah } = await chegarNoResumo({
      voz: { ...vozDeExemplo(), vozEscolhida: 'voz-clara' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copy.resumo.concluir }))

    const rascunho = within(await dialogo.findByRole('region', { name: copy.publicar.rascunho }))
    expect(rascunho.getByText(/conta de luz/)).toBeDefined()
    fireEvent.click(rascunho.getByRole('button', { name: copy.publicar.publicar }))

    await waitFor(() => expect(sarah.publicacoesDeVersao).toHaveLength(1))
    expect(sarah.publicacoesDeVersao[0]).toMatchObject({ proposito: 'discovery', nota: copy.publicar.nota })
    expect(await dialogo.findByText(copy.publicar.noAr)).toBeDefined()
  })

  it('alterar uma parte abre a tela dela', async () => {
    const { dialogo } = await chegarNoResumo()

    const alterar = within(
      dialogo.getByRole('region', { name: copy.resumo.partes.identidade }),
    ).getByRole('link', { name: copy.resumo.alterar })
    expect(alterar.getAttribute('href')).toBe('/sarah/identidade')
  })

  it('resposta do modelo sem nada aproveitável vira a frase da borda, sem sair do negócio', async () => {
    const configuracao = criarServicoDeConfiguracaoDublado({ passos: passosSemCredenciais() })
    const integracoes = criarServicoDeIntegracoesDublado({ integracoes: integracoesConectadas() })
    const sarah = criarServicoDaSarahDublado({
      modelo: MODELO_CONECTADO,
      textoDasSugestoes: JSON.stringify({ etapas: [] }),
    })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/configuracao-inicial',
      undefined,
      undefined,
      integracoes,
      configuracao,
      undefined,
      sarah,
    )
    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    await dialogo.findByRole('heading', { name: copy.etapas.negocio.titulo })
    fireEvent.click(dialogo.getByRole('button', { name: new RegExp(copy.entrevista.escrever) }))
    preencher(dialogo)
    fireEvent.click(dialogo.getByRole('button', { name: copy.negocio.gerar }))

    expect(await dialogo.findByRole('alert')).toBeDefined()
    expect(dialogo.getByRole('heading', { name: copy.etapas.negocio.titulo })).toBeDefined()
  })
})

it('pular grava a dispensa e leva ao painel, que não reabre o tutorial na mesma visita', async () => {
  const { configuracao, roteador } = await abrir({ modeloConectado: false })
  const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))

  fireEvent.click(dialogo.getByRole('button', { name: copy.pular }))

  await waitFor(() => expect(roteador.state.location.pathname).toBe('/'))
  expect(configuracao.progressos.at(-1)?.dispensada).toBe(true)
  await waitFor(() => expect(screen.queryByRole('dialog', { name: copy.rotulo })).toBeNull())
  expect(roteador.state.location.pathname).toBe('/')
})

/** O texto que o campo aponta por `aria-describedby`. */
function descricaoDoCampo(campo: HTMLElement): string {
  return (campo.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

describe('as instruções de preenchimento', () => {
  it('o campo da ElevenLabs diz onde achar a chave e lista as permissões dela', async () => {
    await abrir({ integracoes: integracoesSemChave() })

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    const campo = await dialogo.findByLabelText('chave da API')
    expect(descricaoDoCampo(campo)).toBe(textoDaInstrucao('voz', 'api_key'))
    expect(dialogo.getByText(copy.chave.permissoesDaVoz)).toBeDefined()
    for (const permissao of PERMISSOES_DA_ELEVENLABS) {
      expect(dialogo.getByText(permissao)).toBeDefined()
    }
  })

  it('os dois campos da Twilio dizem onde achar o valor e o formato', async () => {
    const gravada = VOZES_DE_EXEMPLO[0]
    if (!gravada) throw new Error('sem vozes de exemplo')
    const integracoes = criarServicoDeIntegracoesDublado({
      integracoes: integracoesDeExemplo().map((item) =>
        item.provedor === 'telefonia'
          ? {
              ...item,
              estado: 'nao_configurado' as const,
              configurado: false,
              conectado: false,
              chaves: item.chaves.map((chave) => ({ ...chave, preenchida: false })),
            }
          : item,
      ),
    })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/configuracao-inicial',
      undefined,
      undefined,
      integracoes,
      criarServicoDeConfiguracaoDublado({ passos: passosSemCredenciais() }),
      undefined,
      criarServicoDaSarahDublado({
        modelo: MODELO_CONECTADO,
        voz: { ...vozDeExemplo(), vozEscolhida: gravada.id },
      }),
    )

    const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
    await dialogo.findByRole('heading', { name: copy.etapas.telefonia.titulo })
    expect(descricaoDoCampo(dialogo.getByLabelText('identificador da conta'))).toBe(
      textoDaInstrucao('telefonia', 'account_sid'),
    )
    expect(descricaoDoCampo(dialogo.getByLabelText('token de autenticação'))).toBe(
      textoDaInstrucao('telefonia', 'auth_token'),
    )
    // A lista de permissões é da ElevenLabs, e não aparece na Twilio.
    expect(dialogo.queryByText(copy.chave.permissoesDaVoz)).toBeNull()
  })
})

it('a voz que a conta já gravou vem marcada, e o seguir já libera', async () => {
  const gravada = VOZES_DE_EXEMPLO[0]
  if (!gravada) throw new Error('sem vozes de exemplo')
  const configuracao = criarServicoDeConfiguracaoDublado({ passos: passosSemCredenciais() })
  const integracoes = criarServicoDeIntegracoesDublado({
    integracoes: integracoesDeExemplo().map((item) =>
      item.provedor === 'telefonia'
        ? { ...item, estado: 'nao_configurado' as const, configurado: false, conectado: false }
        : item,
    ),
  })
  const sarah = criarServicoDaSarahDublado({
    modelo: MODELO_CONECTADO,
    voz: { ...vozDeExemplo(), vozEscolhida: gravada.id },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/configuracao-inicial',
    undefined,
    undefined,
    integracoes,
    configuracao,
    undefined,
    sarah,
  )
  const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
  // Abre na telefonia (a que falta); a voz fica um passo atrás.
  await dialogo.findByRole('heading', { name: copy.etapas.telefonia.titulo })
  fireEvent.click(dialogo.getByRole('button', { name: copy.voltar }))

  const vozes = within(await dialogo.findByRole('region', { name: copy.vozes.titulo }))
  expect(
    vozes.getByRole('button', { name: `${copy.vozes.escolher} ${nomeCurto(gravada)}` }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect((dialogo.getByRole('button', { name: copy.seguir }) as HTMLButtonElement).disabled).toBe(false)
})

it('outra voz lista as vozes da ElevenLabs da conta, com busca e a prévia do provedor', async () => {
  const configuracao = criarServicoDeConfiguracaoDublado({ passos: passosSemCredenciais() })
  const integracoes = criarServicoDeIntegracoesDublado({ integracoes: integracoesSemChave() })
  const catalogo = vozDeExemplo().catalogo
  const sarah = criarServicoDaSarahDublado({
    modelo: MODELO_CONECTADO,
    voz: {
      ...vozDeExemplo(),
      catalogo: {
        ...catalogo,
        vozes: catalogo.vozes.map((item) =>
          item.id === 'voz-clara' ? { ...item, previa: 'https://exemplo.test/clara.mp3' } : item,
        ),
      },
    },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/configuracao-inicial',
    undefined,
    undefined,
    integracoes,
    configuracao,
    undefined,
    sarah,
  )
  const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
  await dialogo.findByRole('heading', { name: copy.etapas.voz.titulo })
  fireEvent.change(await dialogo.findByLabelText('chave da API'), { target: { value: 'sk_nova' } })
  fireEvent.click(dialogo.getByRole('button', { name: copy.chave.salvar }))
  const sugeridas = within(await dialogo.findByRole('region', { name: copy.vozes.titulo }))

  fireEvent.click(sugeridas.getByRole('button', { name: copy.vozes.outra }))

  const daConta = within(await dialogo.findByRole('region', { name: copy.vozes.daConta }))
  expect(await daConta.findByText('Clara')).toBeDefined()
  expect(daConta.getByText('Bento')).toBeDefined()
  // A prévia do provedor aparece onde existe; onde não existe, diz que não há.
  expect(daConta.getByRole('button', { name: `${copy.vozes.ouvir} Clara` })).toBeDefined()
  expect(daConta.getByText(copy.vozes.semPrevia)).toBeDefined()

  fireEvent.change(daConta.getByLabelText(copy.vozes.buscar), { target: { value: 'ben' } })
  expect(daConta.queryByText('Clara')).toBeNull()

  fireEvent.click(daConta.getByRole('button', { name: `${copy.vozes.escolher} Bento` }))
  expect(
    daConta.getByRole('button', { name: `${copy.vozes.escolher} Bento` }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect((dialogo.getByRole('button', { name: copy.seguir }) as HTMLButtonElement).disabled).toBe(false)
})
