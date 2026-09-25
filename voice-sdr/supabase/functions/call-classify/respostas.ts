// O que quem acionou a classificação lê quando ela não classificou, e com que
// status HTTP.
//
// Quem lê é servidor — `call-finalize` e, depois, `cron-call-recovery` —, e não
// gente: não é fala da Sarah nem rótulo de tela.
//
// **503 é o que pede nova tentativa.** Modelo fora do ar, resposta que não se
// lê, banco que caiu: a chamada fica com `classification_source` nulo, a ficha
// continua em "processando" (P-03), e quem tenta de novo é `cron-call-recovery`.
// **409 é resposta certa**: outra passagem classificou primeiro, está
// classificando agora, ou uma pessoa corrigiu a classificação. **404 e 422 são definitivos**: a chamada não existe,
// ou não tem transcrição, e tentar de novo não muda isso.

/** Por que a classificação não aconteceu. */
export type MotivoDaClassificacao =
  | 'metodo_invalido'
  | 'segredo_interno_invalido'
  | 'chamada_invalida'
  | 'chamada_inexistente'
  | 'sem_transcricao'
  | 'ja_corrigida'
  | 'ja_classificada'
  | 'ja_reivindicada'
  | 'modelo_nao_conectado'
  | 'modelo_indisponivel'
  | 'resposta_ilegivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaClassificacao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  segredo_interno_invalido: 'Segredo interno ausente ou inválido.',
  chamada_invalida: 'O corpo precisa trazer call_id com o identificador da chamada.',
  chamada_inexistente: 'Esta chamada não existe.',
  sem_transcricao: 'Esta chamada não tem transcrição para ler.',
  ja_corrigida: 'A classificação desta chamada foi corrigida por uma pessoa e não é refeita.',
  ja_classificada: 'Esta chamada já foi classificada por outra passagem.',
  ja_reivindicada: 'Outra passagem está classificando esta chamada agora.',
  // Não é falha: é configuração que falta. A classificação é de retaguarda, e
  // quem lê esta frase é `call-finalize` no registro — não uma tela.
  modelo_nao_conectado:
    'A conta não tem provedor de modelo conectado, então a classificação não foi feita. Conecte em Integrações.',
  modelo_indisponivel:
    'O modelo de classificação não respondeu agora. A classificação será tentada de novo.',
  resposta_ilegivel:
    'O modelo de classificação respondeu fora do formato combinado. A classificação será tentada de novo.',
  falha_interna: 'Não foi possível classificar esta chamada agora. A classificação será tentada de novo.',
}

export const STATUS: Record<MotivoDaClassificacao, number> = {
  metodo_invalido: 405,
  segredo_interno_invalido: 401,
  chamada_invalida: 400,
  chamada_inexistente: 404,
  // Definitiva: sem transcrição não há o que ler, e a recuperação desiste na hora.
  sem_transcricao: 422,
  ja_corrigida: 409,
  ja_classificada: 409,
  // A outra via chegou no mesmo segundo (US-140): é a via dupla funcionando.
  ja_reivindicada: 409,
  modelo_nao_conectado: 428,
  modelo_indisponivel: 503,
  resposta_ilegivel: 503,
  falha_interna: 503,
}
