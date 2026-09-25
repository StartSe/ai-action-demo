// Tradução do que o provedor respondeu. Código bruto entra, frase em português
// sai, e o código bruto não segue adiante.
//
// Mora em `_shared/` porque a tabela é do produto, e não de uma função: quem
// pergunta ao provedor de voz, ao de telefonia ou ao calendário recebe os
// mesmos códigos e precisa da mesma distinção entre `erro` (a chave foi
// recusada, alguém tem que agir) e `indisponivel` (o provedor não respondeu,
// basta esperar). Uma segunda cópia desta lista se desencontraria no primeiro
// código novo, e o desencontro apareceria como duas telas dizendo coisas
// diferentes sobre a mesma falha.
//
// A regra é a mesma do aceite de convite: a decisão é de quem sabe (aqui, o
// provedor), a frase é da borda. `invalid_api_key` não diz nada a quem
// administra a conta; "a chave foi recusada, gere outra e substitua" diz.
// Registro de interface, não fala da Sarah: direto e declarativo
// (docs/padrao-de-interface.md seção 4).

/** Por que a verificação não passou. A tela escolhe o cartão por este motivo. */
export type MotivoDoProvedor =
  | 'chave_invalida'
  | 'sem_permissao'
  | 'sem_credito'
  | 'limite_de_taxa'
  | 'provedor_indisponivel'
  | 'sem_resposta'
  | 'falha_do_provedor'
  | 'sessao_desconectada'

export interface ErroTraduzido {
  readonly motivo: MotivoDoProvedor
  readonly mensagem: string
}

export const MENSAGENS_DO_PROVEDOR: Record<MotivoDoProvedor, string> = {
  chave_invalida:
    'A chave cadastrada foi recusada pelo provedor. Gere uma nova no painel dele e substitua aqui.',
  sem_permissao:
    'A chave é válida, mas não tem permissão para esta operação. Confira o escopo dela no painel do provedor.',
  sem_credito:
    'A conta no provedor está sem saldo. Recarregue no painel dele para voltar a operar.',
  limite_de_taxa:
    'O provedor recusou por excesso de chamadas. Aguarde alguns minutos e teste de novo.',
  provedor_indisponivel:
    'O provedor está fora do ar. A chave continua cadastrada, e o teste pode ser repetido depois.',
  sem_resposta:
    'O provedor não respondeu no tempo esperado. A chave continua cadastrada, e o teste pode ser repetido depois.',
  falha_do_provedor:
    'O provedor recusou a verificação e não informou o motivo. Confira a chave no painel dele e teste de novo.',
  sessao_desconectada:
    'A instância do WhatsApp está sem sessão com o celular. Leia o QR code no painel da Z-API e teste de novo.',
}

/**
 * Motivo que deixa a integração em `indisponivel` em vez de `erro`: o problema
 * é do provedor ou da rede, não da chave. A diferença importa porque `erro`
 * pede ação de quem administra a conta e `indisponivel` pede só paciência.
 */
const DO_PROVEDOR: ReadonlySet<MotivoDoProvedor> = new Set([
  'provedor_indisponivel',
  'sem_resposta',
])

export function eFalhaDoProvedor(motivo: MotivoDoProvedor): boolean {
  return DO_PROVEDOR.has(motivo)
}

/**
 * Códigos que os provedores usam, reduzidos a motivo. A lista é aberta de
 * propósito: o que não estiver aqui cai em `falha_do_provedor`, que é uma
 * frase honesta, e não o código cru vazando para a tela.
 */
const POR_CODIGO: ReadonlyArray<readonly [RegExp, MotivoDoProvedor]> = [
  // Z-API: instância sem sessão com o celular (`connected: false`).
  [/whatsapp[_\-\s]?not[_\-\s]?connected|not[_\-\s]?connected|disconnected/i, 'sessao_desconectada'],
  // Z-API: token de segurança (Client-Token) ausente ou errado.
  [/client[_\-\s]?token/i, 'chave_invalida'],
  [/invalid[_\-\s]?api[_\-\s]?key/i, 'chave_invalida'],
  [/authentication|unauthenticated|unauthorized|invalid[_\-\s]?token|invalid[_\-\s]?credential/i, 'chave_invalida'],
  [/invalid[_\-\s]?grant|expired[_\-\s]?token/i, 'chave_invalida'],
  [/forbidden|permission[_\-\s]?denied|insufficient[_\-\s]?scope|missing[_\-\s]?scope/i, 'sem_permissao'],
  [/quota[_\-\s]?exceeded|insufficient[_\-\s]?credit|payment[_\-\s]?required|out[_\-\s]?of[_\-\s]?credit|billing/i, 'sem_credito'],
  [/rate[_\-\s]?limit|too[_\-\s]?many[_\-\s]?requests|throttl/i, 'limite_de_taxa'],
  [/timeout|timed[_\-\s]?out|network|econn|fetch[_\-\s]?failed/i, 'sem_resposta'],
  [/unavailable|bad[_\-\s]?gateway|internal[_\-\s]?server|server[_\-\s]?error/i, 'provedor_indisponivel'],
]

/** Status HTTP quando o provedor não mandou código nenhum de que dê para partir. */
function porStatus(status: number): MotivoDoProvedor | null {
  if (status === 401) return 'chave_invalida'
  if (status === 403) return 'sem_permissao'
  if (status === 402) return 'sem_credito'
  if (status === 429) return 'limite_de_taxa'
  if (status >= 500) return 'provedor_indisponivel'
  return null
}

/**
 * Reduz o que veio do provedor a um motivo e à frase dele. O código bruto é
 * lido aqui e morre aqui: nada do que esta função devolve o carrega.
 */
export function traduzirErroDoProvedor(
  codigo: string | null | undefined,
  status?: number | null,
): ErroTraduzido {
  const motivo = motivoDe(codigo, status)
  return { motivo, mensagem: MENSAGENS_DO_PROVEDOR[motivo] }
}

function motivoDe(codigo: string | null | undefined, status: number | null | undefined): MotivoDoProvedor {
  // O código tem precedência sobre o status: um 400 com `invalid_api_key` diz
  // mais do que o 400 sozinho.
  const texto = codigo?.trim() ?? ''
  if (texto) {
    for (const [padrao, motivo] of POR_CODIGO) {
      if (padrao.test(texto)) return motivo
    }
  }

  if (typeof status === 'number' && Number.isFinite(status)) {
    const doStatus = porStatus(status)
    if (doStatus) return doStatus
  }

  return 'falha_do_provedor'
}
