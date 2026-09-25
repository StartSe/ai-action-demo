// Os números que a conta já tem na telefonia, para a tela oferecer em vez de
// pedir que alguém digite.
//
// Digitar número à mão erra de três jeitos que ninguém percebe na hora: um
// dígito trocado, o número de outra conta, ou um número que existe mas não
// atende voz. Os três só aparecem na primeira ligação que não completa. Listar
// o que o provedor de fato tem elimina os três de uma vez.
//
// Módulo portável: sem Deno, sem rede, sem banco. Quem fala com o provedor é o
// adaptador, por esta porta.

/**
 * Para onde o número aponta hoje, na telefonia. É o que será **sobrescrito**
 * quando a linha for registrada: o registro reaponta a voz para cá, e o que
 * quer que atendesse antes deixa de atender no mesmo instante.
 *
 * Por isso isto viaja até a tela. Numa conta com dez números, vários já estão
 * servindo a outra coisa — um fluxo de atendimento, um aplicativo, outro
 * produto —, e nada no número diz isso além do que ele aponta. Sem mostrar, a
 * escolha é às cegas e o estrago só aparece quando alguém liga para o número
 * antigo e cai no silêncio.
 */
export interface ApontamentoAtual {
  /** Para onde a chamada recebida vai hoje, se for para um endereço. */
  readonly enderecoDeVoz: string | null
  /** O aplicativo da telefonia que atende hoje, se for um. */
  readonly aplicativo: string | null
  /** Para onde vão os avisos de estado da chamada. */
  readonly enderecoDeEstado: string | null
}

/** Um número como o provedor o descreve. */
export interface NumeroDoProvedor {
  readonly e164: string
  /** O apelido que a pessoa deu ao número no painel do provedor. */
  readonly rotulo: string
  readonly atendeVoz: boolean
  /** O que o número faz hoje, e que o registro vai substituir. */
  readonly apontamento: ApontamentoAtual
}

export interface PortaDoCatalogo {
  /** O papel de quem pediu, ou null quando não é membro da conta. */
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** O usuário da sessão, ou null. */
  usuarioDaSessao(jwt: string): Promise<{ id: string } | null>
  /** As credenciais da telefonia desta conta, ou null quando não há. */
  credenciaisDaTelefonia(
    contaId: string,
  ): Promise<{ identificador: string; token: string } | null>
  /** Pergunta ao provedor quais números a conta tem. */
  numerosDoProvedor(credenciais: {
    identificador: string
    token: string
  }): Promise<NumeroDoProvedor[]>
  /** Os números que esta instalação já cadastrou, para marcar os repetidos. */
  numerosJaCadastrados(contaId: string): Promise<string[]>
}

export type MotivoDaRecusa =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'telefonia_nao_configurada'
  | 'provedor_recusou'
  | 'provedor_indisponivel'
  | 'falha_interna'

/** Um número já pronto para a tela desenhar. */
export interface NumeroOferecido extends NumeroDoProvedor {
  /** Já existe linha nesta instalação com este número. */
  readonly jaCadastrado: boolean
  /**
   * O número já atende alguma coisa hoje, e registrá-lo aqui vai substituir
   * isso. Decidido aqui, e não na tela, para a regra ter um dono só: a tela
   * desenha o aviso, não decide quando ele aparece.
   */
  readonly sobrescreveConfiguracao: boolean
}

/** Verdadeiro quando o número já aponta para alguma coisa na telefonia. */
export function temApontamento(a: ApontamentoAtual): boolean {
  return Boolean(a.enderecoDeVoz || a.aplicativo || a.enderecoDeEstado)
}

export type RespostaDoCatalogo =
  | { ok: true; numeros: NumeroOferecido[] }
  | { ok: false; motivo: MotivoDaRecusa; mensagem: string }

/** Quem pode ver os números da conta. Cadastrar linha é configuração. */
const PAPEIS_QUE_VEEM = new Set(['owner', 'admin'])

const PREFIXO_BEARER = /^Bearer\s+(.+)$/i

export const FRASES: Record<MotivoDaRecusa, string> = {
  metodo_invalido: 'Este endereço responde a POST.',
  conta_ausente: 'O pedido veio sem a conta a consultar.',
  sem_sessao: 'Entre de novo para ver os números da conta.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo.',
  sem_acesso: 'Você não participa desta conta.',
  papel_insuficiente:
    'Cadastrar linha é de quem administra a conta. Peça a quem administra.',
  telefonia_nao_configurada:
    'Cadastre a chave da telefonia em integrações antes de escolher o número.',
  provedor_recusou:
    'A telefonia recusou a consulta. Confira a chave em integrações.',
  provedor_indisponivel:
    'A telefonia não respondeu agora. Tente de novo em alguns minutos.',
  falha_interna: 'Não foi possível listar agora. Tente de novo.',
}

function recusa(motivo: MotivoDaRecusa): RespostaDoCatalogo {
  return { ok: false, motivo, mensagem: FRASES[motivo] }
}

export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

export interface PedidoDoCatalogo {
  readonly metodo: string
  readonly contaId: unknown
  readonly autorizacao: string | null
}

/**
 * A decisão inteira: confere quem pediu, resolve a credencial, pergunta ao
 * provedor e marca o que já está cadastrado. Nunca levanta.
 */
export async function atenderCatalogo(
  pedido: PedidoDoCatalogo,
  porta: PortaDoCatalogo,
): Promise<RespostaDoCatalogo> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_VEEM.has(papel)) return recusa('papel_insuficiente')

    const credenciais = await porta.credenciaisDaTelefonia(contaId)
    if (!credenciais) return recusa('telefonia_nao_configurada')

    const doProvedor = await porta.numerosDoProvedor(credenciais)
    const cadastrados = new Set(await porta.numerosJaCadastrados(contaId))

    // Quem não atende voz vai junto, marcado: some da lista seria pior, porque
    // quem procura o próprio número e não o acha conclui que a chave está errada.
    const numeros = doProvedor
      .map((n) => ({
        ...n,
        jaCadastrado: cadastrados.has(n.e164),
        // Número já cadastrado aqui não "sobrescreve" nada: quem aponta para
        // cá somos nós, e reapontar para o mesmo lugar não tira ninguém do ar.
        sobrescreveConfiguracao:
          !cadastrados.has(n.e164) && temApontamento(n.apontamento),
      }))
      .sort((a, b) => {
        if (a.jaCadastrado !== b.jaCadastrado) return a.jaCadastrado ? 1 : -1
        if (a.atendeVoz !== b.atendeVoz) return a.atendeVoz ? -1 : 1
        return a.e164 < b.e164 ? -1 : a.e164 > b.e164 ? 1 : 0
      })

    return { ok: true, numeros }
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : ''
    if (nome === 'TimeoutError' || nome === 'AbortError') {
      return recusa('provedor_indisponivel')
    }
    if (erro instanceof RecusaDoProvedor) return recusa(erro.motivo)
    return recusa('falha_interna')
  }
}

/** O adaptador levanta isto quando o provedor responde erro conhecido. */
export class RecusaDoProvedor extends Error {
  // Campo declarado e atribuído à mão, e não por propriedade de parâmetro: o
  // projeto compila com `erasableSyntaxOnly`, que recusa sintaxe que só o
  // TypeScript entende — é o que permite ao Node ler estes módulos direto.
  readonly motivo: MotivoDaRecusa

  constructor(motivo: MotivoDaRecusa) {
    super(motivo)
    this.name = 'RecusaDoProvedor'
    this.motivo = motivo
  }
}
