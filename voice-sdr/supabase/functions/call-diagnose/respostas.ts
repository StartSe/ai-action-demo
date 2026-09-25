// O que quem pede o diagnóstico lê quando ele não acontece, e com que status
// HTTP.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Quem lê é quem
// administra a conta, na ficha da chamada.

export type MotivoDoDiagnostico =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'chamada_ausente'
  | 'chamada_inexistente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoDiagnostico, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta da chamada.',
  chamada_ausente: 'O pedido veio sem a chamada a analisar.',
  chamada_inexistente: 'Esta chamada não existe nesta conta.',
  sem_sessao: 'Entre na sua conta para analisar a ligação.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para analisar a ligação.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  // A análise propõe mudança na configuração da Sarah, e configuração é de
  // quem administra, como em call-review.
  papel_insuficiente:
    'Analisar a ligação propõe mudanças na configuração da assistente, e isso é tarefa de quem administra a conta. Peça a análise a quem administra.',
  falha_interna: 'Não foi possível analisar a ligação agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDoDiagnostico, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  chamada_ausente: 400,
  chamada_inexistente: 404,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  falha_interna: 500,
}

/**
 * Por que o texto do modelo não veio, quando não veio. O diagnóstico é gravado
 * assim mesmo: os achados das regras e os registros da ElevenLabs valem sem
 * modelo, e são o que o dono mais precisa ver.
 */
export type EstadoDoModelo = 'ok' | 'nao_conectado' | 'indisponivel' | 'ilegivel'

export const AVISOS_DO_MODELO: Record<Exclude<EstadoDoModelo, 'ok'>, string> = {
  nao_conectado:
    'As verificações abaixo não dependem de modelo. Para ter também a explicação e as sugestões, conecte um provedor de modelo em Integrações.',
  indisponivel:
    'O modelo da conta não respondeu, e a explicação ficou de fora. As verificações abaixo valem. Peça a análise de novo em alguns minutos.',
  ilegivel:
    'O modelo respondeu fora do formato esperado, e a explicação ficou de fora. As verificações abaixo valem. Peça a análise de novo.',
}

/** Onde se resolve o aviso, quando há onde. */
export const CAMINHO_DO_AVISO: Readonly<Partial<Record<EstadoDoModelo, string>>> = {
  nao_conectado: '/config/integracoes',
}

/** O título e a razão da proposta que as regras fazem sozinhas. */
export const PROPOSTA_DE_REPUBLICAR = {
  titulo: 'Publicar a assistente de novo',
  razao: (motivos: readonly string[]) =>
    `As verificações acharam o que uma publicação nova corrige: ${motivos.join(' ')}`,
}

/** O motivo que a trilha de auditoria recebe ao aplicar. O banco escreve o mesmo. */
export function motivoDaAplicacao(chamadaId: string): string {
  return `Aplicado do diagnóstico da chamada ${chamadaId}`
}
