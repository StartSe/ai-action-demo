import { gerarChaveDeEntrada, hashDaChaveDeEntrada } from '@compartilhado/chave-de-entrada'
import type {
  CargaDaEntradaDeLeads,
  CargaDasIntegracoes,
  GiroDaChaveDeEntrada,
  GravacaoDaChave,
  Integracao,
  ProvedorId,
  ServicoDeIntegracoes,
  TesteDaIntegracao,
} from '@/integracoes/tipos'

export interface Gravacao {
  provedor: ProvedorId
  valores: Record<string, string>
}

export interface RespostasDeIntegracoes {
  /** Quando presente, o dublê devolve isto e ignora as integrações. */
  carregar?: CargaDasIntegracoes
  integracoes?: Integracao[]
  /** Recusa a gravação, para provar a frase de permissão. */
  salvar?: GravacaoDaChave
  /**
   * Segura as respostas de `testar` e `salvar` até `liberar()`. É o que deixa
   * o teste ver o cartão em `testando`, que por definição só existe enquanto o
   * pedido está em voo.
   */
  segurar?: boolean
  /** O endereço público e a chave vigente. Padrão: endereço de exemplo, sem chave. */
  entrada?: { endereco?: string | null; geradaEm?: string | null }
  /** Recusa o giro da chave, para provar a frase de permissão. */
  girar?: Extract<GiroDaChaveDeEntrada, { ok: false }>
}

/** O endereço de exemplo do dublê, no formato que `enderecoDaEntrada` monta. */
export const ENDERECO_DE_ENTRADA_DE_EXEMPLO =
  'https://abcdefghijklmnop.supabase.co/functions/v1/lead-intake'

export interface ServicoDeIntegracoesDublado extends ServicoDeIntegracoes {
  /** Todo teste pedido, na ordem, para provar que o botão recortou um só. */
  readonly testes: ProvedorId[]
  readonly gravacoes: Gravacao[]
  /** Os hashes gravados por `girarChaveDeEntrada`, como o banco os guarda. */
  readonly hashesDaEntrada: string[]
  /** Solta o que estiver segurado. Sem `segurar`, não faz nada. */
  liberar(): void
}

/**
 * Os quatro provedores, um em cada estado do servidor. Assim um único cenário
 * cobre todos os selos da tela sem o teste ter de montar cada um à mão.
 */
export function integracoesDeExemplo(): Integracao[] {
  return [
    {
      provedor: 'voz',
      rotulo: 'Voz conversacional',
      fornecedor: 'ElevenLabs',
      estado: 'conectado',
      configurado: true,
      conectado: true,
      credito: { restante: 12000, total: 100000, unidade: 'créditos', baixo: false },
      cota: { rotulo: 'Sessões simultâneas', emUso: 3, limite: 10, esgotada: false },
      erro: null,
      chaves: [{ nome: 'api_key', rotulo: 'chave da API', preenchida: true }],
      bloqueia:
        'A assistente não fala: sem este provedor não há agente publicado nem ligação.',
    },
    {
      provedor: 'telefonia',
      rotulo: 'Telefonia',
      fornecedor: 'Twilio',
      estado: 'erro',
      configurado: true,
      conectado: false,
      credito: null,
      cota: null,
      erro: {
        motivo: 'credencial_invalida',
        mensagem: 'A chave cadastrada foi recusada pelo provedor. Cadastre a chave atual.',
      },
      chaves: [
        { nome: 'account_sid', rotulo: 'identificador da conta', preenchida: true },
        { nome: 'auth_token', rotulo: 'token de autenticação', preenchida: true },
      ],
      bloqueia: 'Não há número nem linha: nenhuma chamada sai e nenhuma entra.',
    },
    {
      provedor: 'calendario',
      rotulo: 'Calendário',
      fornecedor: 'Google Calendar',
      estado: 'nao_configurado',
      configurado: false,
      conectado: false,
      credito: null,
      cota: null,
      erro: {
        motivo: 'chave_incompleta',
        mensagem:
          'A configuração está pela metade. Falta cadastrar: autorização do calendário.',
      },
      chaves: [
        { nome: 'client_id', rotulo: 'identificador do aplicativo', preenchida: true },
        { nome: 'client_secret', rotulo: 'segredo do aplicativo', preenchida: true },
        { nome: 'refresh_token', rotulo: 'autorização do calendário', preenchida: false },
      ],
      bloqueia:
        'A assistente não agenda: sem ocupação real ela marcaria em cima de compromisso existente.',
    },
    {
      provedor: 'email',
      rotulo: 'E-mail transacional',
      fornecedor: 'Resend',
      estado: 'indisponivel',
      configurado: true,
      conectado: false,
      credito: null,
      cota: null,
      erro: {
        motivo: 'provedor_indisponivel',
        mensagem: 'O provedor não respondeu. Teste de novo em alguns minutos.',
      },
      chaves: [
        { nome: 'api_key', rotulo: 'chave da API', preenchida: true },
        { nome: 'remetente', rotulo: 'remetente (nome e e-mail)', preenchida: true },
      ],
      bloqueia:
        'O convite da reunião não sai: a reunião fica marcada, com o convite não enviado até o e-mail ser configurado.',
    },
  ]
}

/**
 * Dublê do serviço de integrações. Guarda as integrações em memória e as
 * atualiza na gravação: chave salva vira `preenchida` e o provedor passa a
 * conectado, que é o que o teste precisa ver depois de salvar e testar.
 */
export function criarServicoDeIntegracoesDublado(
  respostas: RespostasDeIntegracoes = {},
): ServicoDeIntegracoesDublado {
  const testes: ProvedorId[] = []
  const gravacoes: Gravacao[] = []
  const estado = new Map<ProvedorId, Integracao>(
    (respostas.integracoes ?? integracoesDeExemplo()).map((item) => [
      item.provedor,
      item,
    ]),
  )

  const presas: (() => void)[] = []
  const hashesDaEntrada: string[] = []
  let geradaEm = respostas.entrada?.geradaEm ?? null

  /** Resolve agora, ou só quando `liberar()` for chamado. */
  function talvezSegurar<T>(valor: T): Promise<T> {
    if (!respostas.segurar) return Promise.resolve(valor)
    return new Promise<T>((resolver) => presas.push(() => resolver(valor)))
  }

  return {
    testes,
    gravacoes,
    hashesDaEntrada,

    carregarEntradaDeLeads(): Promise<CargaDaEntradaDeLeads> {
      const endereco =
        respostas.entrada && 'endereco' in respostas.entrada
          ? (respostas.entrada.endereco ?? null)
          : ENDERECO_DE_ENTRADA_DE_EXEMPLO
      return Promise.resolve({ ok: true, entrada: { endereco, geradaEm } })
    },

    async girarChaveDeEntrada(): Promise<GiroDaChaveDeEntrada> {
      if (respostas.girar) return respostas.girar
      const chave = gerarChaveDeEntrada()
      hashesDaEntrada.push(await hashDaChaveDeEntrada(chave))
      geradaEm = new Date().toISOString()
      return { ok: true, chave, geradaEm }
    },

    liberar() {
      const pendentes = presas.splice(0, presas.length)
      for (const soltar of pendentes) soltar()
    },

    carregar(): Promise<CargaDasIntegracoes> {
      if (respostas.carregar) return Promise.resolve(respostas.carregar)
      return Promise.resolve({ ok: true, integracoes: [...estado.values()] })
    },

    testar(provedor): Promise<TesteDaIntegracao> {
      testes.push(provedor)
      const integracao = estado.get(provedor)
      if (!integracao) {
        return talvezSegurar<TesteDaIntegracao>({
          ok: false,
          motivo: 'falha-de-comunicacao',
        })
      }
      return talvezSegurar<TesteDaIntegracao>({ ok: true, integracao })
    },

    salvar(provedor, valores): Promise<GravacaoDaChave> {
      gravacoes.push({ provedor, valores })
      if (respostas.salvar) return talvezSegurar(respostas.salvar)

      const anterior = estado.get(provedor)
      if (anterior) {
        estado.set(provedor, {
          ...anterior,
          estado: 'conectado',
          configurado: true,
          conectado: true,
          erro: null,
          chaves: anterior.chaves.map((chave) => ({
            ...chave,
            preenchida: chave.preenchida || chave.nome in valores,
          })),
        })
      }

      return talvezSegurar<GravacaoDaChave>({ ok: true })
    },
  }
}
