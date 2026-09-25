// O que quem acionou a finalização lê quando ela não finalizou, e com que
// status HTTP.
//
// Quem lê é servidor — `call-events` e a varredura de recuperação —, e não
// gente, pela razão de `call-events/respostas.ts`: não é fala da Sarah nem
// rótulo de tela.
//
// **409 é resposta certa, e não falha.** A reivindicação não voltou linha
// porque outra passagem está finalizando esta chamada, ou porque ela já foi
// finalizada; `call-events` conta 409 como acionada, e o reenvio para ali.
//
// **503 é o que pede nova tentativa.** Provedor fora do ar, transcrição ainda
// em processamento, credencial ausente: a reivindicação fica de pé, expira em 5
// minutos, e a varredura tenta de novo — é exatamente o que a reivindicação
// permite (T-15).

/** Por que a finalização não aconteceu. */
export type MotivoDaFinalizacao =
  | 'metodo_invalido'
  | 'segredo_interno_invalido'
  | 'chamada_invalida'
  | 'ja_reivindicada'
  | 'sem_conversa'
  | 'credencial_indisponivel'
  | 'transcricao_indisponivel'
  | 'transcricao_pendente'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaFinalizacao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  segredo_interno_invalido: 'Segredo interno ausente ou inválido.',
  chamada_invalida: 'O corpo precisa trazer call_id com o identificador da chamada.',
  ja_reivindicada:
    'Esta chamada já está sendo finalizada por outra passagem, ou já foi finalizada.',
  sem_conversa:
    'Esta chamada não tem conversa no provedor de voz. Quem a fecha é a varredura de recuperação.',
  credencial_indisponivel:
    'A credencial do provedor de voz desta conta não está disponível. A finalização será tentada de novo.',
  transcricao_indisponivel:
    'O provedor de voz não devolveu a conversa agora. A finalização será tentada de novo.',
  transcricao_pendente:
    'O provedor de voz ainda está processando a conversa. A finalização será tentada de novo.',
  falha_interna: 'Não foi possível finalizar esta chamada agora. A finalização será tentada de novo.',
}

export const STATUS: Record<MotivoDaFinalizacao, number> = {
  metodo_invalido: 405,
  segredo_interno_invalido: 401,
  chamada_invalida: 400,
  ja_reivindicada: 409,
  // 422 e não 503: tentar de novo não faz a conversa aparecer.
  sem_conversa: 422,
  credencial_indisponivel: 503,
  transcricao_indisponivel: 503,
  transcricao_pendente: 503,
  falha_interna: 503,
}
