// O que quem conecta o modelo lê quando o passo não acontece (US-246).
//
// Registro de interface: direto e declarativo (docs/padrao-de-interface.md
// seção 4). Quem lê é quem administra a conta, na tela de integrações.

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

export type MotivoDaConexao =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'acao_invalida'
  | 'retorno_ausente'
  | 'retorno_invalido'
  | 'codigo_ausente'
  | 'estado_ausente'
  | 'estado_desconhecido'
  | 'conta_divergente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'provedor_recusou'
  | 'provedor_indisponivel'
  | 'resposta_ilegivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaConexao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta.',
  acao_invalida: 'O pedido veio sem um passo conhecido da conexão.',
  retorno_ausente: 'O pedido veio sem o endereço de retorno.',
  // O retorno vem do navegador, então passa por filtro: endereço de fora
  // levaria o código de autorização para outro site.
  retorno_invalido: 'O endereço de retorno não é desta aplicação.',
  codigo_ausente: 'O provedor não devolveu o código de autorização.',
  estado_ausente: 'O provedor não devolveu a marca desta autorização.',
  // Desconhecido, já usado e vencido levam à mesma frase de propósito: dizer
  // qual dos três foi ajudaria quem está tentando adivinhar uma marca.
  estado_desconhecido:
    'Esta autorização não vale mais. Comece a conexão de novo pela tela de integrações.',
  conta_divergente: 'Esta autorização foi aberta em outra conta.',
  sem_sessao: 'Entre na sua conta para conectar o modelo.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para conectar o modelo.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  // A frase nomeia o dono, e não "quem administra": é ele que o cofre exige, e
  // mandar alguém pedir ao administrador errado é mandar bater na porta errada.
  papel_insuficiente:
    'Conectar o provedor de modelo guarda uma credencial no cofre da conta, e isso é do dono. Peça a conexão a quem é dono da conta.',
  provedor_recusou:
    'O provedor recusou esta autorização. Ela pode ter passado do prazo de dez minutos. Comece de novo.',
  provedor_indisponivel: 'Não foi possível falar com o provedor agora. Tente de novo em alguns minutos.',
  resposta_ilegivel: 'O provedor respondeu fora do formato esperado e nada foi gravado.',
  falha_interna: 'Não foi possível concluir a conexão agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaConexao, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  acao_invalida: 400,
  retorno_ausente: 400,
  retorno_invalido: 400,
  codigo_ausente: 400,
  estado_ausente: 400,
  estado_desconhecido: 409,
  conta_divergente: 403,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  provedor_recusou: 502,
  provedor_indisponivel: 503,
  resposta_ilegivel: 502,
  falha_interna: 500,
}

/** O rótulo que a chave recebe no painel do provedor. */
export function rotuloDaChave(nomeDaConta: string): string {
  const limpo = nomeDaConta.trim()
  return limpo === '' ? NOME_DO_PRODUTO : `${NOME_DO_PRODUTO} — ${limpo}`
}
