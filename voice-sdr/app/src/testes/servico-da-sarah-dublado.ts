import { LINHAS_DA_SEMENTE } from '@compartilhado/qualificacao/avaliacao.ts'
import { PROPOSITOS } from '@compartilhado/playbook/camada-um.ts'
import {
  atenderPublicacao,
  pendenciaDosWebhooks,
  type CorpoDaPublicacao,
  type PortaDePublicacao,
  type PublicacaoNoBanco,
} from '@publicacao/publicacao.ts'
import {
  criarWorkspaceDublado,
  portaDoWorkspace,
  type WorkspaceDublado,
} from '@publicacao/workspace-dublado.ts'

import {
  atenderEntrevista,
  type AgenteDaEntrevista,
  type PortaDaEntrevista,
} from '@entrevista/entrevista.ts'
import { atenderSugestao, type PortaDaSugestao } from '@sugestoes/sugestoes.ts'

import { IDENTIDADE_EM_BRANCO, previaDaPrimeiraFala } from '@/sarah/identidade'
import type {
  AberturaDoEnsaio,
  AjustesDeVoz,
  CargaDaSarah,
  CargaDaVozDaSarah,
  CargaDoCatalogo,
  CargaDoConhecimento,
  CargaDoModelo,
  CargaDosPlaybooks,
  CatalogoDeVozes,
  EncerramentoDoEnsaio,
  EntradaDeConhecimento,
  EscolhaDeVoz,
  EstadoDaSarah,
  EstadoDaVozDaSarah,
  EstadoDePublicacao,
  EstadoDoModelo,
  EstadoDosPlaybooks,
  GravacaoDaEntrada,
  GravacaoDaIdentidade,
  GravacaoDaVoz,
  GravacaoDoRascunho,
  IdentidadeDaSarah,
  InicioDaConexao,
  PedidoDeEntrada,
  PedidoDePublicacao,
  PedidoDeRascunho,
  PlaybookDoProposito,
  Proposito,
  PublicacaoDoPlaybook,
  RascunhoGerado,
  RemocaoDaEntrada,
  RespostaDaAmostra,
  ResultadoDaConexao,
  ServicoDaSarah,
  SincronizacaoDoConhecimento,
  ContextoDoNegocio,
  EntrevistaAberta,
  EntrevistaEncerrada,
  SugestoesGeradas,
  VersaoDoPlaybook,
  VozDoCatalogo,
} from '@/sarah/tipos'

export interface RespostasDaSarah {
  /** Quando presente, o dublê devolve isto e ignora o estado em memória. */
  carregar?: CargaDaSarah
  /** De qual modelo a conta fala. Sem isto, a porta da plataforma sem escolha. */
  modelo?: EstadoDoModelo
  /** A carga do modelo nunca volta, para provar o estado de carregando. */
  modeloPendente?: boolean
  /** A leitura do estado do modelo falha, como quando a tabela não existe. */
  modeloFalha?: boolean
  /** O que `abrirEnsaio` responde. Sem isto, uma sessão de exemplo (US-247). */
  aberturaDoEnsaio?: AberturaDoEnsaio
  /** O que `encerrarEnsaio` responde. Sem isto, encerrado com dois turnos. */
  encerramentoDoEnsaio?: EncerramentoDoEnsaio
  /** As entradas da base de conhecimento. Sem isto, a conta começa vazia. */
  conhecimento?: EntradaDeConhecimento[]
  /** A carga do conhecimento nunca volta, para provar o estado de carregando. */
  conhecimentoPendente?: boolean
  /** Recusa a carga, para provar a frase de falha. */
  conhecimentoFalha?: boolean
  /** O que a sincronização responde. Sem isto, tudo indexado. */
  sincronizacao?: SincronizacaoDoConhecimento
  /** O que `iniciarConexaoDoModelo` responde. Sem isto, uma URL de exemplo. */
  inicioDaConexao?: InicioDaConexao
  /** O que os passos de conexão respondem. Sem isto, sucesso. */
  conexao?: ResultadoDaConexao
  /** O catálogo do provedor. Sem isto, dois modelos de exemplo. */
  catalogo?: CargaDoCatalogo
  /** O estado inicial. Sem ele, a conta já tem uma Sarah escrita. */
  sarah?: EstadoDaSarah
  /** Recusa a gravação, para provar a frase de permissão. */
  salvar?: GravacaoDaIdentidade
  /** Recusa a gravação do nome, na primeira pergunta do tutorial. */
  salvarNome?: GravacaoDaIdentidade
  /**
   * O estado de publicação que a gravação devolve. O padrão é
   * `alteracoes_pendentes`, que é o que acontece de verdade quando se muda a
   * identidade de uma Sarah publicada.
   */
  publicacaoAposGravar?: EstadoDePublicacao
  /**
   * Segura as respostas até `liberar()`. É o que deixa o teste ver a tela em
   * carregamento, que por definição só existe enquanto o pedido está em voo.
   */
  segurar?: boolean

  /** Quando presente, o dublê devolve isto no lugar do catálogo em memória. */
  carregarVoz?: CargaDaVozDaSarah
  /** O estado inicial da voz. Sem ele, a conta tem Sarah e catálogo conectado. */
  voz?: EstadoDaVozDaSarah
  /** Resposta fixa da audição, para provar pendência e falha. */
  amostra?: RespostaDaAmostra
  /** Recusa a escolha da voz, para provar a frase de permissão. */
  salvarVoz?: GravacaoDaVoz
  /** O estado de publicação que escolher a voz devolve. */
  publicacaoAposEscolherVoz?: EstadoDePublicacao

  /** Quando presente, o dublê devolve isto no lugar dos roteiros em memória. */
  carregarPlaybooks?: CargaDosPlaybooks
  /** Os roteiros iniciais. Sem eles, os quatro propósitos têm versão no ar. */
  playbooks?: EstadoDosPlaybooks
  /** Propósitos que o provedor de voz recusa ao publicar. */
  provedorRecusa?: readonly Proposito[]
  /** O cadastro do webhook de fim na ElevenLabs falha, e a publicação traz a pendência. */
  webhooksFalham?: boolean
  /** O que o gerador de rascunho (US-063) devolve. */
  rascunhoGerado?: RascunhoGerado
  /**
   * O texto que o modelo devolve às sugestões do assistente de abertura. O
   * dublê passa o pedido por `atenderSugestao`, o mesmo código da borda, e só
   * o modelo é de mentira: a tela vê as sugestões já conferidas.
   */
  textoDasSugestoes?: string
  /** Quando presente, devolve isto sem passar pela borda. */
  sugestoes?: SugestoesGeradas
  /**
   * A conversa da entrevista como o provedor a devolve. Sem ela, uma conversa
   * de exemplo com duas respostas; `null` é a transcrição ainda processando.
   */
  conversaDaEntrevista?: { quem: 'agent' | 'lead'; texto: string }[] | null
  /** A ElevenLabs recusa abrir a entrevista (sem chave). */
  entrevistaSemVoz?: boolean
  /** A voz escolhida não está na conta do provedor, nem na biblioteca dele. */
  vozForaDaConta?: boolean
}

/** O que o modelo de mentira responde às sugestões, com as quatro etapas. */
export const SUGESTOES_DE_EXEMPLO = {
  etapas: [
    {
      etapa: 'identidade',
      campos: [
        { campo: 'nome_do_agente', valor: 'Sarah', porque: 'Curto e fácil de ouvir ao telefone.' },
        {
          campo: 'oferta',
          valor: 'Energia solar por assinatura, sem investimento inicial.',
          porque: 'É o que tira a objeção de custo logo de saída.',
        },
        {
          campo: 'primeira_fala',
          valor:
            'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, assistente virtual da {empresa}. Vi seu pedido pelo site. Tem dois minutos?',
          porque: 'Diz quem é e por que liga, em uma frase.',
        },
      ],
      perguntas: [
        { pergunta: 'Qual economia média vocês garantem?', exemplo: 'Entre 15% e 20% na conta' },
      ],
    },
    {
      etapa: 'roteiro',
      campos: [
        {
          campo: 'roteiro_de_descoberta',
          valor: '1. Confirme o valor médio da conta de luz.\n2. Pergunte se o telhado é próprio.',
          porque: 'São os dois critérios do bom cliente.',
        },
      ],
      perguntas: [{ pergunta: 'Quem decide a compra na empresa?', exemplo: 'O diretor financeiro' }],
    },
    {
      etapa: 'especialista',
      campos: [{ campo: 'duracao_em_minutos', valor: '30', porque: 'Tempo de uma proposta inicial.' }],
      perguntas: [{ pergunta: 'A reunião é por vídeo ou presencial?', exemplo: 'Por vídeo' }],
    },
    {
      etapa: 'leads',
      campos: [
        {
          campo: 'perfil_do_lead',
          valor: 'Indústria com conta acima de R$ 30 mil por mês.',
          porque: 'É o corte do bom cliente.',
        },
      ],
      perguntas: [{ pergunta: 'De onde vêm os contatos hoje?', exemplo: 'Formulário do site' }],
    },
  ],
}

export interface ServicoDaSarahDublado extends ServicoDaSarah {
  /** Toda identidade gravada, na ordem. É o que prova o que foi ao banco. */
  readonly gravacoes: IdentidadeDaSarah[]
  /** Todo nome gravado pela primeira pergunta do tutorial, na ordem. */
  readonly nomes: string[]
  /**
   * Toda amostra pedida, na ordem. jsdom não toca áudio, então é aqui que se
   * prova que o pedido saiu com a voz e os ajustes que estavam na tela.
   */
  readonly audicoes: EscolhaDeVoz[]
  /** Toda voz escolhida, na ordem. */
  readonly escolhas: EscolhaDeVoz[]
  /** Todo rascunho salvo, na ordem. */
  readonly rascunhos: PedidoDeRascunho[]
  /** Toda versão publicada no banco, na ordem. */
  readonly publicacoesDeVersao: PedidoDePublicacao[]
  /** Cada passo do OAuth do modelo que a tela pediu, na ordem (US-246). */
  readonly conexoesDoModelo: { passo: string; retorno?: string; codigo?: string; estado?: string }[]
  /** Cada escolha de modelo por tarefa, na ordem. */
  readonly escolhasDeModelo: { tarefa: string; modelo: string | null }[]
  /** Cada ensaio aberto, na ordem, com o que a tela pediu (US-247). */
  readonly ensaiosAbertos: {
    proposito: string
    modo: string
    perfil: string
  }[]
  /** Cada encerramento pedido, na ordem. */
  readonly ensaiosEncerrados: { ensaioId: string; conversaId: string | null }[]
  /** Cada entrada gravada, na ordem (US-085). */
  readonly entradasGravadas: PedidoDeEntrada[]
  /** Cada remoção pedida, na ordem. */
  readonly entradasRemovidas: string[]
  /** Cada contexto que o assistente de abertura mandou para as sugestões. */
  readonly pedidosDeSugestao: ContextoDoNegocio[]
  /** O agente que cada abertura de entrevista pediu ao provedor, na ordem. */
  readonly agentesDaEntrevista: AgenteDaEntrevista[]
  /** Cada passo da entrevista que a tela pediu, na ordem. */
  readonly entrevistas: {
    passo: 'abrir' | 'encerrar'
    agenteId?: string
    conversaId?: string
    vozId?: string | null
  }[]
  /** Quantas sincronizações a tela pediu. */
  sincronizacoes(): number
  /**
   * Quantas vezes `agent-publish` foi chamado. É o que prova que salvar não
   * publica: o rascunho pode ir ao banco sem nenhuma ida ao provedor.
   */
  readonly chamadasAoAgentPublish: () => number
  liberar(): void
}

/** A Sarah do cenário de demonstração (docs/padrao-de-interface.md seção 5). */
export function identidadeDeExemplo(): IdentidadeDaSarah {
  return {
    nome: 'Sarah',
    empresa: 'Vexo Tecnologia',
    oferta: 'roteirização para transportadoras de 20 a 200 veículos',
    nuncaAfirmar: ['garantia de resultado', 'preço fechado'],
    destinoDeTransferencia: '+55 11 3030-1020',
    primeiraFala:
      'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Você tem um minuto?',
    aberturaDoWhatsapp: '',
    jeitoNaVoz: '',
    jeitoNoWhatsapp: '',
  }
}

export function sarahDeExemplo(): EstadoDaSarah {
  return { identidade: identidadeDeExemplo(), publicacao: 'publicado' }
}

/**
 * Os três ajustes de RF-303 com a faixa do provedor, como `voice-catalog` os
 * manda por voz. O padrão vem da voz, e não da tela: uma voz que nasce com
 * estabilidade 0,8 abre o controle em 0,8.
 */
function ajustesAceitos(
  padroes: AjustesDeVoz = {},
): VozDoCatalogo['ajustesAceitos'] {
  return [
    {
      nome: 'estabilidade',
      rotulo: 'estabilidade',
      explicacao: 'Quanto mais alta, mais igual a voz soa de uma frase para a outra.',
      minimo: 0,
      maximo: 1,
      padrao: padroes.estabilidade ?? 0.5,
      passo: 0.05,
    },
    {
      nome: 'similaridade',
      rotulo: 'similaridade',
      explicacao: 'Quanto mais alta, mais perto da voz original do catálogo.',
      minimo: 0,
      maximo: 1,
      padrao: padroes.similaridade ?? 0.75,
      passo: 0.05,
    },
    {
      nome: 'velocidade',
      rotulo: 'velocidade',
      explicacao: 'A pressa da fala. Acima de 1 ela fala mais rápido que o normal.',
      minimo: 0.7,
      maximo: 1.2,
      padrao: padroes.velocidade ?? 1,
      passo: 0.05,
    },
  ]
}

/** Duas vozes em português, que é o que o filtro da borda deixa passar. */
export function catalogoDeExemplo(): CatalogoDeVozes {
  return {
    estado: 'conectado',
    vozes: [
      {
        id: 'voz-clara',
        nome: 'Clara',
        genero: 'feminina',
        sotaque: 'brazilian',
        descricao: 'Firme e clara, boa para abertura fria.',
        previa: null,
        ajustesAceitos: ajustesAceitos(),
      },
      {
        id: 'voz-bento',
        nome: 'Bento',
        genero: 'masculina',
        sotaque: 'brazilian',
        descricao: 'Grave e pausado.',
        previa: null,
        ajustesAceitos: ajustesAceitos({ estabilidade: 0.8 }),
      },
    ],
    vozesIgnoradas: 3,
    erro: null,
  }
}

/** A conta do cenário: Sarah escrita, catálogo no ar e nenhuma voz escolhida. */
export function vozDeExemplo(): EstadoDaVozDaSarah {
  return {
    temIdentidade: true,
    vozEscolhida: null,
    ajustes: {},
    catalogo: catalogoDeExemplo(),
    publicacao: 'publicado',
  }
}

function versao(
  proposito: Proposito,
  numero: number,
  estado: VersaoDoPlaybook['estado'],
  roteiro: string,
  nota: string | null,
): VersaoDoPlaybook {
  return {
    id: `${proposito}-v${numero}`,
    versao: numero,
    estado,
    roteiro,
    jeitoDaCasa: estado === 'draft' ? '' : 'Trate quem atende por você.',
    nota,
    publicadaEm: estado === 'draft' ? null : `2026-09-0${numero}T12:00:00.000Z`,
    criadaEm: `2026-09-0${numero}T11:00:00.000Z`,
  }
}

/**
 * Os quatro roteiros do cenário. Descoberta tem duas versões publicadas e um
 * rascunho por cima, para haver histórico a comparar; os outros três têm uma
 * versão no ar cada.
 */
export function playbooksDeExemplo(): EstadoDosPlaybooks {
  return {
    playbooks: PROPOSITOS.map((proposito): PlaybookDoProposito => {
      if (proposito !== 'discovery') {
        return {
          proposito,
          versoes: [versao(proposito, 1, 'published', `Roteiro de ${proposito}.`, 'Primeira versão.')],
        }
      }
      return {
        proposito,
        versoes: [
          versao(
            proposito,
            3,
            'draft',
            'Pergunte quantos veículos a frota tem.\nPergunte onde a rota trava hoje.\nPergunte o melhor horário para o especialista ligar.',
            null,
          ),
          versao(
            proposito,
            2,
            'published',
            'Pergunte quantos veículos a frota tem.\nPergunte o melhor horário para o especialista ligar.',
            'Pergunta de horário no fim.',
          ),
          versao(proposito, 1, 'archived', 'Pergunte quantos veículos a frota tem.', 'Primeira versão.'),
        ],
      }
    }),
    publicacao: 'publicado',
    foraDaPlataforma: [],
  }
}

/**
 * A porta de `agent-publish` em memória. O relatório dos quatro propósitos sai
 * de `atenderPublicacao`, o mesmo código que a borda roda: uma resposta escrita
 * à mão casaria com a tela por construção, e "três publicados e um em falha"
 * deixaria de provar alguma coisa.
 */
function portaEmMemoria(
  identidade: () => IdentidadeDaSarah | null,
  vozId: () => string | null,
  roteiros: () => EstadoDosPlaybooks,
  registradas: Map<string, PublicacaoNoBanco>,
  recusados: readonly Proposito[],
  workspace: WorkspaceDublado,
): PortaDePublicacao {
  return {
    ...portaDoWorkspace(workspace),
    usuarioDaSessao: async () => ({ id: 'u-1' }),
    papelNaConta: async () => 'admin',
    agenteDaConta: async () => {
      const atual = identidade()
      if (!atual) return null
      return {
        id: 'agente-1',
        name: atual.nome,
        company_name: atual.empresa || null,
        offer_line: atual.oferta || null,
        never_claim: atual.nuncaAfirmar,
        voice_id: vozId(),
        voice_settings: {},
        first_message: atual.primeiraFala || null,
        whatsapp_first_message: atual.aberturaDoWhatsapp || null,
        voice_channel_style: atual.jeitoNaVoz || null,
        whatsapp_channel_style: atual.jeitoNoWhatsapp || null,
      }
    },
    politicaDaConta: async () => ({
      max_duration_seconds: 600,
      recording_enabled: true,
      recording_notice_text: null,
      retention_days: 180,
    }),
    criteriosDeAvaliacao: async () => LINHAS_DA_SEMENTE,
    roteirosPublicados: async () =>
      roteiros().playbooks.flatMap((playbook) => {
        const noAr = playbook.versoes.find((item) => item.estado === 'published')
        return noAr
          ? [
              {
                purpose: playbook.proposito,
                playbook_version_id: noAr.id,
                version: noAr.versao,
                body_script: noAr.roteiro,
                body_house: noAr.jeitoDaCasa,
              },
            ]
          : []
      }),
    publicacoesRegistradas: async () => [...registradas.values()],
    credencial: async () => ({ ok: true, valor: 'chave-de-teste', origem: 'conta' }),
    chaveDoServidorDeFerramentas: () => 'chave-do-servidor-de-teste',
    publicarNoProvedor: async (pedido) =>
      recusados.includes(pedido.proposito)
        ? { ok: false, status: 401, codigo: 'invalid_api_key' }
        : { ok: true, status: 200, providerAgentId: `provedor-${pedido.proposito}` },
    gravarPublicacao: async (linha) => {
      registradas.set(linha.proposito, {
        purpose: linha.proposito,
        status: linha.status,
        published_hash: linha.publishedHash,
        provider_agent_id: linha.providerAgentId,
        channel_snapshot: linha.retrato,
      })
    },
    gravarRetrato: async (pedido) => {
      const linha = registradas.get(pedido.proposito)
      if (linha) registradas.set(pedido.proposito, { ...linha, channel_snapshot: pedido.retrato })
    },
    registrarEventoDeIntegracao: async () => {},
  }
}

/**
 * Dublê do serviço da Sarah. Guarda a identidade em memória e devolve na
 * gravação o estado de publicação combinado: salvar muda o banco e não põe no
 * ar, e é isso que a tela precisa poder dizer.
 */
export function criarServicoDaSarahDublado(
  respostas: RespostasDaSarah = {},
): ServicoDaSarahDublado {
  const gravacoes: IdentidadeDaSarah[] = []
  const nomes: string[] = []
  const audicoes: EscolhaDeVoz[] = []
  const escolhas: EscolhaDeVoz[] = []
  const rascunhos: PedidoDeRascunho[] = []
  const publicacoesDeVersao: PedidoDePublicacao[] = []
  const conexoesDoModelo: { passo: string; retorno?: string; codigo?: string; estado?: string }[] = []
  const escolhasDeModelo: { tarefa: string; modelo: string | null }[] = []
  const ensaiosAbertos: ServicoDaSarahDublado['ensaiosAbertos'] = []
  const ensaiosEncerrados: ServicoDaSarahDublado['ensaiosEncerrados'] = []
  const entradasGravadas: PedidoDeEntrada[] = []
  const entradasRemovidas: string[] = []
  const pedidosDeSugestao: ContextoDoNegocio[] = []
  const entrevistas: ServicoDaSarahDublado['entrevistas'] = []
  const agentesDaEntrevista: AgenteDaEntrevista[] = []
  let entradas: EntradaDeConhecimento[] = [...(respostas.conhecimento ?? [])]
  let sincronizacoes = 0
  const registradas = new Map<string, PublicacaoNoBanco>()
  // O workspace da ElevenLabs da conta, o mesmo entre publicações: a segunda
  // encontra os webhooks da primeira, como no provedor.
  const workspace = criarWorkspaceDublado()
  if (respostas.webhooksFalham) workspace.falhas.add('POST workspace/webhooks')
  let chamadasAoAgentPublish = 0
  let roteiros: EstadoDosPlaybooks = respostas.playbooks ?? playbooksDeExemplo()
  let estado: EstadoDaSarah = respostas.sarah ?? sarahDeExemplo()
  let voz: EstadoDaVozDaSarah = respostas.voz ?? vozDeExemplo()

  const presas: (() => void)[] = []

  /** A borda da entrevista com o provedor e o modelo em memória. */
  function portaDaEntrevista(): PortaDaEntrevista {
    const conversa =
      respostas.conversaDaEntrevista === undefined
        ? [
            { quem: 'agent' as const, texto: 'Oi! Aqui é a Sarah.' },
            { quem: 'lead' as const, texto: 'A empresa é a Aurora Energia.' },
            { quem: 'agent' as const, texto: 'O que vocês vendem?' },
            { quem: 'lead' as const, texto: 'Usinas solares por assinatura para indústrias.' },
          ]
        : respostas.conversaDaEntrevista
    return {
      usuarioDaSessao: async () => ({ id: 'u-1' }),
      papelNaConta: async () => 'admin',
      modeloDaConta: async () => ({
        porta: 'openrouter',
        modelo: 'anthropic/claude-opus-5',
        escolhidoPelaConta: false,
      }),
      perguntarAoModelo: async () => ({
        ok: true,
        codigo: null,
        status: 200,
        endpoint: 'chat/completions',
        texto: respostas.textoDasSugestoes ?? JSON.stringify(SUGESTOES_DE_EXEMPLO),
      }),
      registrarEventoDeIntegracao: async () => {},
      nomeDoAgente: async () => estado.identidade?.nome || null,
      garantirVoz: async (_conta, vozId) =>
        respostas.vozForaDaConta ? { estado: 'fora_da_biblioteca' } : { estado: 'na_conta', vozId },
      criarAgente: async (_conta, agente) => {
        agentesDaEntrevista.push(agente)
        return respostas.entrevistaSemVoz
          ? { ok: false, semCredencial: true }
          : { ok: true, valor: 'agente-da-entrevista' }
      },
      pedirSessaoAssinada: async () => ({ ok: true, valor: 'wss://assinada.exemplo' }),
      lerConversa: async () => (conversa === null ? { pronta: false } : { pronta: true, turnos: conversa }),
      apagarAgente: async () => {},
      esperar: async () => {},
    }
  }

  function talvezSegurar<T>(valor: T): Promise<T> {
    if (!respostas.segurar) return Promise.resolve(valor)
    return new Promise<T>((resolver) => presas.push(() => resolver(valor)))
  }

  function trocarVersoes(
    proposito: Proposito,
    mudar: (versoes: readonly VersaoDoPlaybook[]) => VersaoDoPlaybook[],
  ) {
    roteiros = {
      ...roteiros,
      playbooks: roteiros.playbooks.map((playbook) =>
        playbook.proposito === proposito
          ? { ...playbook, versoes: mudar(playbook.versoes) }
          : playbook,
      ),
    }
  }

  async function chamarAgentPublish(
    versaoPublicada: number | null,
  ): Promise<PublicacaoDoPlaybook> {
    chamadasAoAgentPublish += 1
    const resposta = await atenderPublicacao(
      { metodo: 'POST', contaId: 'conta-1', autorizacao: 'Bearer jwt-de-teste' },
      portaEmMemoria(
        () => estado.identidade,
        () => voz.vozEscolhida ?? 'voz-clara',
        () => roteiros,
        registradas,
        respostas.provedorRecusa ?? [],
        workspace,
      ),
      { enderecoDasFerramentas: 'https://exemplo.supabase.co/functions/v1' },
    )

    if (!resposta.corpo.ok) {
      return {
        ok: true,
        relatorio: {
          versaoPublicada,
          propositos: [],
          recusa: resposta.corpo.mensagem,
          publicacao: roteiros.publicacao,
          pendenciaDosWebhooks: null,
        },
      }
    }

    const corpo: CorpoDaPublicacao = resposta.corpo
    // Republicar corrige o que foi mudado no painel do provedor: o que sobe
    // agora é a nossa configuração, nos propósitos que foram.
    const foram = new Set(
      corpo.propositos
        .filter((item) => item.estado !== 'falha')
        .map((item) => item.proposito),
    )
    roteiros = {
      ...roteiros,
      publicacao: corpo.estado,
      foraDaPlataforma: roteiros.foraDaPlataforma.filter((item) => !foram.has(item)),
      noAr: [...foram],
    }
    return {
      ok: true,
      relatorio: {
        versaoPublicada,
        propositos: corpo.propositos,
        recusa: null,
        publicacao: corpo.estado,
        pendenciaDosWebhooks: pendenciaDosWebhooks(corpo),
      },
    }
  }

  return {
    gravacoes,
    nomes,
    audicoes,
    escolhas,
    rascunhos,
    publicacoesDeVersao,
    chamadasAoAgentPublish: () => chamadasAoAgentPublish,
    conexoesDoModelo,
    escolhasDeModelo,
    ensaiosAbertos,
    ensaiosEncerrados,
    entradasGravadas,
    entradasRemovidas,
    pedidosDeSugestao,
    entrevistas,
    agentesDaEntrevista,
    sincronizacoes: () => sincronizacoes,

    // A base de conhecimento (US-085).
    async carregarConhecimento(recorte): Promise<CargaDoConhecimento> {
      if (respostas.conhecimentoPendente) return new Promise<CargaDoConhecimento>(() => {})
      if (respostas.conhecimentoFalha) return { ok: false, motivo: 'falha-de-comunicacao' }

      // O recorte é aplicado aqui, como o banco faria: sem isto, o teste do
      // filtro passaria mesmo com a consulta ignorando o termo.
      const termo = recorte.termo?.trim().toLowerCase()
      const filtradas = entradas.filter((entrada) => {
        if (recorte.etiqueta && !entrada.etiquetas.includes(recorte.etiqueta)) return false
        if (!termo) return true
        return (
          entrada.pergunta.toLowerCase().includes(termo) ||
          entrada.resposta.toLowerCase().includes(termo)
        )
      })

      const etiquetas = new Set<string>()
      for (const entrada of entradas) for (const etiqueta of entrada.etiquetas) etiquetas.add(etiqueta)

      return {
        ok: true,
        conhecimento: {
          entradas: filtradas,
          // O total é da conta inteira, e não do recorte.
          totalDaConta: entradas.length,
          truncada: false,
          etiquetas: [...etiquetas].sort(),
        },
      }
    },

    async salvarEntrada(pedido): Promise<GravacaoDaEntrada> {
      entradasGravadas.push(pedido)
      const nova: EntradaDeConhecimento = {
        id: pedido.id ?? `entrada-${entradas.length + 1}`,
        pergunta: pedido.pergunta,
        resposta: pedido.resposta,
        etiquetas: pedido.etiquetas,
        origem: 'manual',
        documento: null,
        indexadaEm: null,
        erro: null,
        removidaEm: null,
        alteradaDepoisDeIndexada: false,
        atualizadaEm: new Date().toISOString(),
      }
      entradas = pedido.id
        ? entradas.map((entrada) => (entrada.id === pedido.id ? { ...entrada, ...nova } : entrada))
        : [nova, ...entradas]
      return { ok: true }
    },

    async removerEntrada(id): Promise<RemocaoDaEntrada> {
      entradasRemovidas.push(id)
      const alvo = entradas.find((entrada) => entrada.id === id)
      // A que nunca chegou ao provedor some; a indexada é marcada.
      if (alvo && alvo.documento === null) {
        entradas = entradas.filter((entrada) => entrada.id !== id)
        return { ok: true, desfecho: 'apagada' }
      }
      entradas = entradas.map((entrada) =>
        entrada.id === id ? { ...entrada, removidaEm: new Date().toISOString() } : entrada,
      )
      return { ok: true, desfecho: 'marcada' }
    },

    async sincronizarConhecimento(): Promise<SincronizacaoDoConhecimento> {
      sincronizacoes += 1
      return (
        respostas.sincronizacao ?? {
          ok: true,
          relatorio: { entradas: [], publicacoes: [], recusa: null },
        }
      )
    },

    // O ensaio (US-247).
    async abrirEnsaio(pedido): Promise<AberturaDoEnsaio> {
      ensaiosAbertos.push({
        proposito: pedido.proposito,
        modo: pedido.modo,
        perfil: pedido.perfil,
      })
      return (
        respostas.aberturaDoEnsaio ?? {
          ok: true,
          ensaioId: 'ensaio-1',
          chamadaId: 'chamada-do-ensaio',
          urlAssinada: 'wss://provedor.test/conversa?token=assinado',
          modo: pedido.modo,
          variaveis: { nome_do_lead: 'Pessoa de Ensaio', contexto_do_lead: '' },
          primeiraFala: 'Oi, Pessoa de Ensaio? Aqui é a Sarah.',
        }
      )
    },

    async encerrarEnsaio(ensaioId, conversaId): Promise<EncerramentoDoEnsaio> {
      ensaiosEncerrados.push({ ensaioId, conversaId })
      return (
        respostas.encerramentoDoEnsaio ?? {
          ok: true,
          chamadaId: 'chamada-do-ensaio',
          turnos: 2,
        }
      )
    },

    // O ciclo do modelo (US-246).
    async carregarModelo(): Promise<CargaDoModelo> {
      if (respostas.modeloPendente) return new Promise<CargaDoModelo>(() => {})
      if (respostas.modeloFalha) return { ok: false, motivo: 'falha-de-comunicacao' }
      return {
        ok: true,
        estado:
          respostas.modelo ?? {
            porta: 'platform',
            conectadoEm: null,
            finalDaChave: null,
            escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
          },
      }
    },

    async iniciarConexaoDoModelo(retorno) {
      conexoesDoModelo.push({ passo: 'iniciar', retorno })
      // A URL leva `state`, como a que a borda monta: é de lá que a tela tira
      // a marca para guardar no navegador. Um dublê sem ela deixaria passar
      // uma tela que nunca guarda marca nenhuma.
      return (
        respostas.inicioDaConexao ?? {
          ok: true,
          url: `https://openrouter.ai/auth?callback_url=${encodeURIComponent(retorno)}&state=marca-de-teste`,
        }
      )
    },

    async concluirConexaoDoModelo(codigo, estado) {
      conexoesDoModelo.push({ passo: 'concluir', codigo, estado })
      return respostas.conexao ?? { ok: true }
    },

    async desconectarModelo() {
      conexoesDoModelo.push({ passo: 'desconectar' })
      return respostas.conexao ?? { ok: true }
    },

    async carregarCatalogoDeModelos(): Promise<CargaDoCatalogo> {
      return (
        respostas.catalogo ?? {
          ok: true,
          modelos: [
            { id: 'anthropic/claude-opus-5', nome: 'Claude Opus 5', contexto: 200_000, precoDeEntrada: '0.000015', precoDeSaida: '0.000075', entradas: ['text', 'image', 'file'] },
            { id: 'google/gemini-3-pro', nome: 'Gemini 3 Pro', contexto: 1_000_000, precoDeEntrada: null, precoDeSaida: null, entradas: ['text', 'image', 'audio', 'video'] },
          ],
        }
      )
    },

    async escolherModelo(tarefa, modelo) {
      escolhasDeModelo.push({ tarefa, modelo })
      return respostas.conexao ?? { ok: true }
    },

    liberar() {
      const pendentes = presas.splice(0, presas.length)
      for (const soltar of pendentes) soltar()
    },

    carregarIdentidade(): Promise<CargaDaSarah> {
      if (respostas.carregar) return talvezSegurar(respostas.carregar)
      return talvezSegurar<CargaDaSarah>({ ok: true, sarah: estado })
    },

    salvarIdentidade(identidade): Promise<GravacaoDaIdentidade> {
      gravacoes.push(identidade)
      if (respostas.salvar) return talvezSegurar(respostas.salvar)

      const publicacao =
        respostas.publicacaoAposGravar ??
        (estado.publicacao === 'rascunho' ? 'rascunho' : 'alteracoes_pendentes')
      estado = { identidade, publicacao }

      return talvezSegurar<GravacaoDaIdentidade>({ ok: true, publicacao })
    },

    salvarNome(nome): Promise<GravacaoDaIdentidade> {
      nomes.push(nome)
      if (respostas.salvarNome) return talvezSegurar(respostas.salvarNome)

      // Como o `upsert` do serviço de verdade: a conta nova nasce só com o
      // nome, e a que já tinha identidade troca o nome e guarda o resto.
      const identidade = { ...(estado.identidade ?? IDENTIDADE_EM_BRANCO), nome: nome.trim() }
      estado = { ...estado, identidade }
      voz = { ...voz, temIdentidade: true }
      return talvezSegurar<GravacaoDaIdentidade>({ ok: true, publicacao: estado.publicacao })
    },

    carregarVoz(): Promise<CargaDaVozDaSarah> {
      if (respostas.carregarVoz) return talvezSegurar(respostas.carregarVoz)
      return talvezSegurar<CargaDaVozDaSarah>({ ok: true, voz })
    },

    ouvirAmostra(pedido): Promise<RespostaDaAmostra> {
      audicoes.push(pedido)
      if (respostas.amostra) return talvezSegurar(respostas.amostra)

      const daLista = voz.catalogo.vozes.some((item) => item.id === pedido.vozId)
      if (!daLista) {
        return talvezSegurar<RespostaDaAmostra>({
          ok: true,
          amostra: null,
          pendencia: {
            motivo: 'voz_desconhecida',
            mensagem:
              'Esta voz não está mais no catálogo em português do provedor. Escolha uma da lista ao lado.',
          },
        })
      }

      return talvezSegurar<RespostaDaAmostra>({
        ok: true,
        amostra: {
          vozId: pedido.vozId,
          // A abertura da conta, interpolada pelo mesmo módulo que a borda usa:
          // o que se lê na tela de identidade e o que se ouve aqui são o mesmo
          // texto, e uma frase escrita à mão aqui casaria por construção.
          texto: previaDaPrimeiraFala(estado.identidade ?? identidadeDeExemplo()),
          ajustes: pedido.ajustes,
          formato: 'audio/mpeg',
          audioBase64: somFalso(pedido),
        },
        pendencia: null,
      })
    },

    salvarVoz(escolha): Promise<GravacaoDaVoz> {
      escolhas.push(escolha)
      if (respostas.salvarVoz) return talvezSegurar(respostas.salvarVoz)

      const publicacao =
        respostas.publicacaoAposEscolherVoz ??
        (voz.publicacao === 'rascunho' ? 'rascunho' : 'alteracoes_pendentes')
      voz = {
        ...voz,
        vozEscolhida: escolha.vozId,
        ajustes: escolha.ajustes,
        publicacao,
      }

      return talvezSegurar<GravacaoDaVoz>({ ok: true, publicacao })
    },

    carregarPlaybooks(): Promise<CargaDosPlaybooks> {
      if (respostas.carregarPlaybooks) return talvezSegurar(respostas.carregarPlaybooks)
      return talvezSegurar<CargaDosPlaybooks>({ ok: true, playbooks: roteiros })
    },

    salvarRascunho(pedido): Promise<GravacaoDoRascunho> {
      rascunhos.push(pedido)
      const playbook = roteiros.playbooks.find((item) => item.proposito === pedido.proposito)
      const maisNova = playbook?.versoes[0]

      // O mesmo desenho do serviço de verdade: o rascunho em edição é
      // atualizado; sem rascunho, nasce a versão seguinte.
      const salva: VersaoDoPlaybook =
        maisNova?.estado === 'draft'
          ? { ...maisNova, roteiro: pedido.roteiro, jeitoDaCasa: pedido.jeitoDaCasa }
          : {
              id: `${pedido.proposito}-v${(maisNova?.versao ?? 0) + 1}`,
              versao: (maisNova?.versao ?? 0) + 1,
              estado: 'draft',
              roteiro: pedido.roteiro,
              jeitoDaCasa: pedido.jeitoDaCasa,
              nota: null,
              publicadaEm: null,
              criadaEm: '2026-09-20T12:00:00.000Z',
            }

      trocarVersoes(pedido.proposito, (versoes) =>
        maisNova?.estado === 'draft' ? [salva, ...versoes.slice(1)] : [salva, ...versoes],
      )
      return talvezSegurar<GravacaoDoRascunho>({ ok: true, versao: salva })
    },

    async publicarPlaybook(pedido): Promise<PublicacaoDoPlaybook> {
      publicacoesDeVersao.push(pedido)
      let numero: number | null = null
      trocarVersoes(pedido.proposito, (versoes) =>
        versoes.map((item) => {
          if (item.id === pedido.versaoId) {
            numero = item.versao
            return {
              ...item,
              estado: 'published',
              nota: pedido.nota,
              publicadaEm: '2026-09-20T12:30:00.000Z',
            }
          }
          return item.estado === 'published' ? { ...item, estado: 'archived' } : item
        }),
      )
      return talvezSegurar(await chamarAgentPublish(numero))
    },

    async republicar(): Promise<PublicacaoDoPlaybook> {
      return talvezSegurar(await chamarAgentPublish(null))
    },

    async sugerirConfiguracao(contexto): Promise<SugestoesGeradas> {
      pedidosDeSugestao.push(contexto)
      if (respostas.sugestoes) return talvezSegurar(respostas.sugestoes)

      const porta: PortaDaSugestao = {
        usuarioDaSessao: async () => ({ id: 'u-1' }),
        papelNaConta: async () => 'admin',
        modeloDaConta: async () => ({
          porta: 'openrouter',
          modelo: 'anthropic/claude-opus-5',
          escolhidoPelaConta: false,
        }),
        perguntarAoModelo: async () => ({
          ok: true,
          codigo: null,
          status: 200,
          endpoint: 'chat/completions',
          texto: respostas.textoDasSugestoes ?? JSON.stringify(SUGESTOES_DE_EXEMPLO),
        }),
        registrarEventoDeIntegracao: async () => {},
        nomeDoAgente: async () => estado.identidade?.nome || null,
      }
      const resposta = await atenderSugestao(
        { metodo: 'POST', autorizacao: 'Bearer dublê', contaId: 'c-1', contexto },
        porta,
      )
      return talvezSegurar<SugestoesGeradas>(
        resposta.corpo.ok
          ? { ok: true, etapas: resposta.corpo.etapas }
          : { ok: false, mensagem: resposta.corpo.mensagem },
      )
    },

    async abrirEntrevista(voz): Promise<EntrevistaAberta> {
      entrevistas.push(voz ? { passo: 'abrir', vozId: voz.id } : { passo: 'abrir' })
      const resposta = await atenderEntrevista(
        {
          metodo: 'POST',
          autorizacao: 'Bearer dublê',
          contaId: 'c-1',
          acao: 'abrir',
          vozId: voz?.id ?? null,
          vozNome: voz?.nome ?? null,
        },
        portaDaEntrevista(),
      )
      const corpo = resposta.corpo
      return talvezSegurar<EntrevistaAberta>(
        corpo.ok && 'urlAssinada' in corpo
          ? { ok: true, agenteId: corpo.agenteId, urlAssinada: corpo.urlAssinada }
          : { ok: false, mensagem: corpo.ok ? null : corpo.mensagem },
      )
    },

    async encerrarEntrevista(agenteId, conversaId): Promise<EntrevistaEncerrada> {
      entrevistas.push({ passo: 'encerrar', agenteId, conversaId })
      const resposta = await atenderEntrevista(
        {
          metodo: 'POST',
          autorizacao: 'Bearer dublê',
          contaId: 'c-1',
          acao: 'encerrar',
          agenteId,
          conversaId,
        },
        portaDaEntrevista(),
      )
      const corpo = resposta.corpo
      if (corpo.ok && 'etapas' in corpo) return talvezSegurar<EntrevistaEncerrada>({ ok: true, etapas: corpo.etapas })
      return talvezSegurar<EntrevistaEncerrada>({
        ok: false,
        mensagem: corpo.ok ? null : corpo.mensagem,
        pendente: !corpo.ok && corpo.motivo === 'transcricao_pendente',
      })
    },

    gerarRascunho(proposito): Promise<RascunhoGerado> {
      return talvezSegurar<RascunhoGerado>(
        respostas.rascunhoGerado ?? {
          ok: true,
          roteiro: `Rascunho gerado para ${proposito}.\nPergunte a dor principal.`,
        },
      )
    },
  }
}

/**
 * Não é áudio: jsdom não toca som, e o que o teste mede é que a fonte mudou
 * quando o ajuste mudou. Determinístico de propósito — mesma escolha, mesma
 * fonte.
 */
function somFalso(pedido: EscolhaDeVoz): string {
  const ajustes = Object.entries(pedido.ajustes)
    .sort(([um], [outro]) => um.localeCompare(outro))
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join(',')
  return btoa(`${pedido.vozId}|${ajustes}`)
}
