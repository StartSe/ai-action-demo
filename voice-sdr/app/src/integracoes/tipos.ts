/**
 * O que a tela de integrações conhece. Espelha o corpo que a função de borda
 * `integrations-status` devolve (supabase/functions/integrations-status), mas é
 * declarado aqui de propósito: só `supabase/functions/_shared/` é importável
 * pela interface, e o contrato de tela não deve depender do arquivo da borda.
 *
 * A regra do cofre atravessa este arquivo inteiro: **nenhum tipo daqui carrega
 * o valor de uma credencial.** O que existe é `preenchida`, que diz que há
 * valor, nunca qual.
 */

/** Os provedores que a conta liga. A ordem da tela é a ordem da resposta. */
export type ProvedorId = 'voz' | 'telefonia' | 'calendario' | 'email' | 'whatsapp'

/**
 * Os estados que o servidor observa. `testando` não está aqui porque não é
 * observação nenhuma: é o intervalo em que o pedido viaja, e quem o conhece é
 * a tela (`EstadoDoCartao`, em `cartao.ts`).
 */
export type EstadoDaIntegracao =
  | 'conectado'
  | 'nao_configurado'
  | 'erro'
  | 'indisponivel'

/** Uma chave exigida pelo provedor: nome no cofre, rótulo e se já há valor. */
export interface ChaveDoProvedor {
  nome: string
  rotulo: string
  /** Existe valor resolvido. Nunca diz qual, e a tela não tem como perguntar. */
  preenchida: boolean
}

export interface CreditoDoProvedor {
  restante: number
  /** Null quando o provedor não expõe o total contratado. */
  total: number | null
  unidade: string
  /** Menos de um décimo do total, ou nada. */
  baixo: boolean
}

export interface CotaDoProvedor {
  rotulo: string
  emUso: number
  limite: number
  esgotada: boolean
}

/**
 * A frase já vem pronta da borda, em português: quem conhece o código bruto do
 * provedor é ela, e o código morre lá. A tela mostra `mensagem` e usa `motivo`
 * só como chave de teste e de registro.
 */
export interface FalhaDoProvedor {
  motivo: string
  mensagem: string
}

export interface Integracao {
  provedor: ProvedorId
  /** Nome da função no produto, em português. */
  rotulo: string
  /** Quem entrega o serviço hoje. */
  fornecedor: string
  estado: EstadoDaIntegracao
  configurado: boolean
  conectado: boolean
  credito: CreditoDoProvedor | null
  cota: CotaDoProvedor | null
  erro: FalhaDoProvedor | null
  chaves: ChaveDoProvedor[]
  /** O que deixa de funcionar enquanto este provedor não estiver conectado. */
  bloqueia: string
}

export type MotivoDeFalhaDasIntegracoes =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

export type CargaDasIntegracoes =
  | { ok: true; integracoes: Integracao[] }
  | { ok: false; motivo: MotivoDeFalhaDasIntegracoes }

/** Resultado de testar um provedor só: o estado novo daquele cartão. */
export type TesteDaIntegracao =
  | { ok: true; integracao: Integracao }
  | { ok: false; motivo: MotivoDeFalhaDasIntegracoes }

export type GravacaoDaChave =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDasIntegracoes }

/**
 * O endereço público de entrada de leads (`lead-intake`, RF-107) e a chave que
 * o autentica. A chave em claro nunca volta: o banco guarda só o hash, e o que
 * a tela sabe depois é quando ela foi gerada.
 */
export interface EntradaDeLeads {
  /** `<projeto>/functions/v1/lead-intake`. Nulo quando a cópia não sabe o projeto. */
  endereco: string | null
  /** Quando a chave vigente foi gerada. Nulo enquanto a conta não tem chave. */
  geradaEm: string | null
}

export type CargaDaEntradaDeLeads =
  | { ok: true; entrada: EntradaDeLeads }
  | { ok: false; motivo: MotivoDeFalhaDasIntegracoes }

/** A chave nova, em claro, na única vez em que ela existe fora do formulário de quem integra. */
export type GiroDaChaveDeEntrada =
  | { ok: true; chave: string; geradaEm: string }
  | { ok: false; motivo: MotivoDeFalhaDasIntegracoes }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
export interface ServicoDeIntegracoes {
  /** Estado de todos os provedores, na ordem do catálogo do servidor. */
  carregar(): Promise<CargaDasIntegracoes>
  /** Pergunta de novo, só a este provedor. É o botão de testar. */
  testar(provedor: ProvedorId): Promise<TesteDaIntegracao>
  /**
   * Grava as chaves informadas no cofre da conta. O que não vier no mapa fica
   * como estava: campo em branco é "não mexi", nunca "apague".
   */
  salvar(
    provedor: ProvedorId,
    valores: Record<string, string>,
  ): Promise<GravacaoDaChave>
  /** O endereço público de entrada de leads e quando a chave foi gerada. */
  carregarEntradaDeLeads(): Promise<CargaDaEntradaDeLeads>
  /**
   * Gera a chave no navegador, grava só o hash por `girar_chave_de_entrada` e
   * devolve a chave em claro para ser copiada uma vez. A anterior deixa de valer.
   */
  girarChaveDeEntrada(): Promise<GiroDaChaveDeEntrada>
}
