// O que o convidado lê quando o link não funciona, e com que status HTTP.
//
// Estas frases são interface, não fala da Sarah: diretas e declarativas, cada
// uma dizendo o que aconteceu e o que fazer em seguida. Ficam do lado do
// servidor porque quem responde ao link é a função de borda
// (docs/padrao-de-interface.md seção 4).

import type { CodigoDoBanco } from './aceite.ts'

/** Recusas decididas antes de o banco ser consultado. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'token_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'falha_interna'

export type MotivoDoAceite = CodigoDoBanco | MotivoLocal

export const MENSAGENS: Record<MotivoDoAceite, string> = {
  aceito: 'Convite aceito. Você já faz parte da equipe.',
  ja_membro:
    'Você já faz parte desta equipe. O convite foi encerrado e seu papel continua o mesmo.',
  ja_aceito:
    'Este convite já foi usado. Entre com seu e-mail e senha para acessar a conta.',
  expirado:
    'Este convite expirou. Peça um novo link a quem administra a conta.',
  revogado:
    'Este convite foi cancelado por quem administra a conta. Peça um novo link.',
  nao_encontrado:
    'Este link de convite não é válido. Confira se ele foi copiado por inteiro.',
  email_divergente:
    'Este convite é para outro e-mail. Entre com o endereço que recebeu o convite.',
  usuario_desconhecido:
    'Não foi possível identificar sua conta de acesso. Entre de novo e repita.',

  metodo_invalido: 'Este endereço aceita apenas POST.',
  token_ausente: 'O link de convite veio sem o token. Abra o link do e-mail outra vez.',
  sem_sessao: 'Entre ou crie sua conta de acesso para aceitar o convite.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo e abra o link do convite.',
  falha_interna: 'Não foi possível aceitar o convite agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDoAceite, number> = {
  aceito: 200,
  ja_membro: 200,
  // O convite existe e está íntegro, mas o estado dele impede a operação.
  ja_aceito: 409,
  // 410 Gone: o recurso existiu e não vale mais, e nenhuma tentativa muda isso.
  expirado: 410,
  revogado: 410,
  nao_encontrado: 404,
  // 403 e não 404: esconder a existência do convite de quem já tem o link não
  // protege nada, e a frase precisa dizer qual é a saída.
  email_divergente: 403,
  usuario_desconhecido: 401,

  metodo_invalido: 405,
  token_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  falha_interna: 500,
}
