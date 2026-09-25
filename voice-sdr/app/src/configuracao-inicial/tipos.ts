/**
 * O que a configuração inicial conhece. Espelha o que o banco calcula em
 * `onboarding_health` e guarda em `onboarding_state`
 * (supabase/migrations/20260921070000_configuracao_inicial.sql).
 *
 * A separação que sustenta a tela inteira vem de lá: **`pendente` é medido no
 * dado e `marcado` é declarado por quem configura.** Marcar o passo do número
 * não faz aparecer número. Os dois viajam juntos porque dizem coisas
 * diferentes, e é a diferença entre eles que vira "aguardando aprovação".
 */

/** Os oito passos do catálogo do servidor, na ordem do assistente. */
export type PassoId =
  | 'credenciais'
  | 'agente'
  | 'roteiro'
  | 'numero'
  | 'especialista'
  | 'agenda'
  | 'leads'
  | 'equipe'

/** O que uma pendência impede de funcionar. Os códigos são do catálogo. */
export type Bloqueio = 'ligacao' | 'agendamento' | 'campanha'

/**
 * O estado do passo, como o servidor o calcula em `onboarding_health`.
 *
 * `aguardando_aprovacao` é o caso dos dois passos que não se resolvem por quem
 * administra a conta: o número espera o pacote regulatório da operadora, e a
 * agenda espera a verificação do aplicativo OAuth do Google para escopo
 * sensível de calendário, que leva semanas (docs/revisao-tecnica.md P-04 e
 * O-03). Quem decide quais são é o catálogo do banco, não esta camada.
 */
export type EstadoMedido = 'pendente' | 'aguardando_aprovacao' | 'concluido'

export interface PassoMedido {
  passo: PassoId
  ordem: number
  /** Medido no dado. Nenhuma marcação o apaga. */
  pendente: boolean
  /** Declarado por quem configura. Diz que a pessoa passou por aqui. */
  marcado: boolean
  /**
   * A parte do produto que resolve este passo já existe neste ambiente. Falso
   * enquanto a fase que a constrói não chegou: o passo continua pendente, e a
   * tela não manda ninguém procurar uma página que ainda não existe.
   */
  disponivel: boolean
  bloqueia: Bloqueio[]
  /**
   * O estado que o servidor apurou juntando os três acima com o catálogo. A
   * tela não o recalcula: quem sabe que um passo espera alguém de fora é
   * `passos_de_configuracao`, não o arquivo de texto da interface.
   */
  estado: EstadoMedido
}

export interface ConfiguracaoInicial {
  passos: PassoMedido[]
  /** Passo em que o assistente parou. Null quando não há passo em curso. */
  passoAtual: PassoId | null
  /** O assistente foi fechado. O checklist continua enquanto houver pendência. */
  dispensada: boolean
  /**
   * A chamada com que o tutorial fez a primeira ligação de teste. Nula
   * enquanto o passo não foi feito. O passo não está no catálogo: é declarado,
   * e o id é também o endereço da ficha.
   */
  ligacaoDeTeste: string | null
}

/**
 * O progresso declarado, que é a única coisa que a tela escreve. A medição
 * não entra aqui: quem a calcula é o banco, e ela não se edita.
 */
export interface ProgressoDeclarado {
  passoAtual: PassoId | null
  marcados: PassoId[]
  dispensada: boolean
  ligacaoDeTeste: string | null
}

export type MotivoDeFalhaDaConfiguracao =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

export type CargaDaConfiguracao =
  | { ok: true; configuracao: ConfiguracaoInicial }
  | { ok: false; motivo: MotivoDeFalhaDaConfiguracao }

export type AcaoDaConfiguracao =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDaConfiguracao }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
export interface ServicoDeConfiguracaoInicial {
  /** Recalcula a medição e devolve o progresso declarado junto. */
  carregar(): Promise<CargaDaConfiguracao>
  /**
   * Grava o progresso declarado inteiro. É uma escrita só porque avançar,
   * pular e fechar mexem nos mesmos três campos, e mandar o estado completo
   * dispensa a tela de adivinhar o que o servidor já tinha.
   */
  salvar(progresso: ProgressoDeclarado): Promise<AcaoDaConfiguracao>
}
