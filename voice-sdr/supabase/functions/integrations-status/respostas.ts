// O que o operador lê quando o pedido nem chega a consultar provedor, e com
// que status HTTP. As frases dos provedores ficam em `erros.ts`; aqui só as
// recusas decididas antes disso.

import { MENSAGENS_DO_PROVEDOR, type MotivoDoProvedor } from '../_shared/provedor/erros.ts'

/** Por que a integração não está pronta, sem que o provedor tenha sido ouvido. */
export type MotivoDaAusencia = 'sem_chave' | 'chave_incompleta' | 'plataforma_bloqueada'

/** Tudo o que pode explicar um provedor fora de `conectado`. */
export type MotivoDaFalha = MotivoDoProvedor | MotivoDaAusencia

/** Recusas do pedido inteiro, antes de qualquer provedor. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'provedor_desconhecido'
  | 'falha_interna'

export const MENSAGENS_DA_AUSENCIA: Record<MotivoDaAusencia, string> = {
  sem_chave:
    'Nenhuma chave cadastrada para este provedor. Cadastre a chave para ligar a integração.',
  // A frase nomeia o que falta; quem monta a resposta acrescenta a lista.
  chave_incompleta: 'A configuração está pela metade.',
  plataforma_bloqueada:
    'Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta.',
}

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas GET e POST.',
  conta_ausente: 'O pedido veio sem a conta a consultar.',
  sem_sessao: 'Entre na sua conta para ver o estado das integrações.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para ver o estado das integrações.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  provedor_desconhecido: 'Este provedor não existe na configuração da conta.',
  falha_interna:
    'Não foi possível consultar o estado das integrações agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  // 403 e não 404: dizer "não existe" para uma conta que existe não protege
  // nada de quem já tem o identificador, e a frase precisa ser verdadeira.
  sem_acesso: 403,
  provedor_desconhecido: 400,
  falha_interna: 500,
}

/** A frase de um motivo qualquer, venha ele do provedor ou da falta de chave. */
export function mensagemDaFalha(motivo: MotivoDaFalha, faltando: readonly string[] = []): string {
  if (motivo === 'chave_incompleta') {
    const lista = faltando.length > 0 ? ` Falta cadastrar: ${faltando.join(', ')}.` : ''
    return `${MENSAGENS_DA_AUSENCIA.chave_incompleta}${lista}`
  }
  if (motivo === 'sem_chave' || motivo === 'plataforma_bloqueada') {
    return MENSAGENS_DA_AUSENCIA[motivo]
  }
  return MENSAGENS_DO_PROVEDOR[motivo]
}
