// O que quem pediu para zerar o ambiente lê quando não zerou, e com que status.
// Registro de interface (docs/padrao-de-interface.md seção 4).

export type MotivoDoReset =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'desligado'
  | 'varias_contas'
  | 'confirmacao_errada'
  | 'falha_interna'

/** A palavra que a pessoa digita para confirmar. */
export const PALAVRA_DE_CONFIRMACAO = 'ZERAR'

export const MENSAGENS: Record<MotivoDoReset, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta.',
  sem_sessao: 'Entre na sua conta para zerar o ambiente.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente: 'Só o dono da conta pode zerar o ambiente.',
  desligado:
    'Zerar o ambiente está desligado nesta instalação: SARAH_PERMITE_ZERAR_AMBIENTE está definida com um valor diferente de sim. Para ligar, troque o valor para sim no Supabase, em Edge Functions, Secrets.',
  varias_contas:
    'Esta instalação tem mais de uma conta, e zerar apagaria todas. Para zerar mesmo assim, crie SARAH_PERMITE_ZERAR_AMBIENTE com o valor sim no Supabase, em Edge Functions, Secrets.',
  confirmacao_errada: `Digite ${PALAVRA_DE_CONFIRMACAO} para confirmar.`,
  falha_interna: 'Não foi possível zerar o ambiente agora. Nada foi apagado no banco.',
}

export const STATUS: Record<MotivoDoReset, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  desligado: 403,
  varias_contas: 403,
  confirmacao_errada: 400,
  falha_interna: 500,
}
