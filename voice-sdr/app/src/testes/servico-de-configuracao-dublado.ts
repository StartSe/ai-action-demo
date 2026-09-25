import type {
  AcaoDaConfiguracao,
  CargaDaConfiguracao,
  EstadoMedido,
  PassoId,
  PassoMedido,
  ProgressoDeclarado,
  ServicoDeConfiguracaoInicial,
} from '@/configuracao-inicial/tipos'

/**
 * Os passos que esperam alguém de fora, como em `passos_de_configuracao`: a
 * operadora libera o número, o Google verifica o aplicativo do calendário. O
 * dublê repete a regra do servidor para que marcar um passo aqui mude o
 * estado como muda lá.
 */
const ESPERAM_APROVACAO: readonly PassoId[] = ['numero', 'agenda']

function estadoMedido(passo: PassoMedido, marcado: boolean): EstadoMedido {
  if (!passo.pendente) return 'concluido'
  if (marcado && ESPERAM_APROVACAO.includes(passo.passo)) {
    return 'aguardando_aprovacao'
  }
  return 'pendente'
}

export interface RespostasDaConfiguracao {
  /** Quando presente, o dublê devolve isto e ignora os passos. */
  carregar?: CargaDaConfiguracao
  passos?: PassoMedido[]
  passoAtual?: PassoId | null
  dispensada?: boolean
  /** A chamada da primeira ligação de teste, já declarada. */
  ligacaoDeTeste?: string | null
  /** Recusa a escrita, para provar a frase de permissão. */
  salvar?: AcaoDaConfiguracao
  /**
   * A medição de agora, lida a cada carga. É o que faz o passo ficar
   * resolvido depois que a tela embutida grava no dublê dela: o teste diz
   * qual gravação resolve qual passo, como o banco diria.
   */
  medir?: () => Partial<Record<PassoId, boolean>>
}

export interface ServicoDeConfiguracaoDublado
  extends ServicoDeConfiguracaoInicial {
  /** Todo progresso gravado, na ordem. É o que prova o que cada botão manda. */
  readonly progressos: ProgressoDeclarado[]
  /** Quantas vezes a medição foi pedida. */
  readonly cargas: number
}

/**
 * O retrato de uma conta nova em F0: as chaves já entraram, o número foi
 * pedido à operadora e está esperando, a equipe ainda não foi convidada, e o
 * resto depende de tela que as fases seguintes constroem. Um cenário só cobre
 * os quatro estados do passo.
 */
export function passosDeExemplo(): PassoMedido[] {
  return [
    {
      passo: 'credenciais',
      ordem: 1,
      pendente: false,
      marcado: true,
      disponivel: true,
      bloqueia: ['ligacao'],
      estado: 'concluido',
    },
    {
      passo: 'agente',
      ordem: 2,
      pendente: true,
      marcado: false,
      disponivel: false,
      bloqueia: ['ligacao'],
      estado: 'pendente',
    },
    {
      passo: 'roteiro',
      ordem: 3,
      pendente: true,
      marcado: false,
      disponivel: false,
      bloqueia: ['ligacao'],
      estado: 'pendente',
    },
    {
      passo: 'numero',
      ordem: 4,
      pendente: true,
      marcado: true,
      disponivel: false,
      bloqueia: ['ligacao'],
      estado: 'aguardando_aprovacao',
    },
    {
      passo: 'especialista',
      ordem: 5,
      pendente: true,
      marcado: false,
      disponivel: false,
      bloqueia: ['agendamento'],
      estado: 'pendente',
    },
    {
      passo: 'agenda',
      ordem: 6,
      pendente: true,
      marcado: false,
      disponivel: false,
      bloqueia: ['agendamento'],
      estado: 'pendente',
    },
    {
      passo: 'leads',
      ordem: 7,
      pendente: true,
      marcado: false,
      disponivel: false,
      bloqueia: ['campanha'],
      estado: 'pendente',
    },
    {
      passo: 'equipe',
      ordem: 8,
      pendente: true,
      marcado: false,
      disponivel: true,
      bloqueia: [],
      estado: 'pendente',
    },
  ]
}

/**
 * Conta pronta. É o padrão do dublê de propósito: tela que não é desta
 * história não deve ganhar um checklist na barra lateral por acidente.
 */
export function passosConcluidos(): PassoMedido[] {
  return passosDeExemplo().map((passo) => ({
    ...passo,
    pendente: false,
    disponivel: true,
    estado: 'concluido' as const,
  }))
}

export function criarServicoDeConfiguracaoDublado(
  respostas: RespostasDaConfiguracao = {},
): ServicoDeConfiguracaoDublado {
  const passos = respostas.passos ?? passosConcluidos()

  // O dublê guarda o declarado e devolve o medido com a marcação de agora: é
  // a mesma separação do banco, e é o que faz "marcar não apaga pendência"
  // valer no teste como vale em produção.
  let marcados: PassoId[] = passos
    .filter((passo) => passo.marcado)
    .map((passo) => passo.passo)
  let passoAtual: PassoId | null =
    respostas.passoAtual === undefined
      ? (passos.find((passo) => passo.pendente)?.passo ?? null)
      : respostas.passoAtual
  let dispensada = respostas.dispensada ?? false
  let ligacaoDeTeste = respostas.ligacaoDeTeste ?? null

  const progressos: ProgressoDeclarado[] = []
  let cargas = 0

  return {
    progressos,
    get cargas() {
      return cargas
    },

    carregar(): Promise<CargaDaConfiguracao> {
      cargas += 1
      if (respostas.carregar) return Promise.resolve(respostas.carregar)

      const medida = respostas.medir?.() ?? {}

      return Promise.resolve({
        ok: true,
        configuracao: {
          passos: passos.map((original) => {
            const passo = {
              ...original,
              pendente: medida[original.passo] ?? original.pendente,
            }
            const marcado = marcados.includes(passo.passo)
            return { ...passo, marcado, estado: estadoMedido(passo, marcado) }
          }),
          passoAtual,
          dispensada,
          ligacaoDeTeste,
        },
      })
    },

    salvar(progresso): Promise<AcaoDaConfiguracao> {
      progressos.push(progresso)
      if (respostas.salvar) return Promise.resolve(respostas.salvar)

      marcados = [...progresso.marcados]
      passoAtual = progresso.passoAtual
      dispensada = progresso.dispensada
      ligacaoDeTeste = progresso.ligacaoDeTeste
      return Promise.resolve({ ok: true })
    },
  }
}
