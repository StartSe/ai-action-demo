// O que quem exporta lê quando não recebe arquivo, e com que status HTTP.
//
// Mesmo desenho de `leads-import/respostas.ts` e de `invite-accept/respostas.ts`:
// o resto da função produz código (`teto_atingido`, `recorte_vazio`) e nunca
// frase. Aqui a separação tem um motivo a mais — o caso de sucesso devolve um
// arquivo, e o relatório dele viaja em cabeçalho, onde texto com acento não
// cabe. O código vai no cabeçalho; a frase fica aqui e em `app/src/copy/leads.ts`.
//
// Registro de interface, não fala da Sarah: direto e declarativo, dizendo o que
// aconteceu e o que fazer em seguida (docs/padrao-de-interface.md seção 4).

/** Desfechos em que sai arquivo. */
export type MotivoAceito = 'exportado' | 'teto_atingido'

/** Recusas, todas antes ou no lugar do arquivo. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'filtro_invalido'
  | 'recorte_vazio'
  | 'sem_permissao'
  | 'falha_ao_registrar'
  | 'falha_interna'

export type MotivoDaExportacao = MotivoAceito | MotivoLocal

export const MENSAGENS: Record<MotivoDaExportacao, string> = {
  exportado: 'Exportação concluída. O arquivo tem os leads do recorte atual.',
  // A frase diz o número que falta e o que fazer com ele. "Alguns leads não
  // couberam" mandaria a pessoa conferir 50 mil linhas para descobrir quais.
  teto_atingido:
    'O recorte tem mais leads do que cabe em uma exportação. O arquivo traz os primeiros; estreite o recorte por etapa ou por período de atividade e exporte o restante.',

  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido chegou sem a conta de onde os leads seriam exportados.',
  filtro_invalido:
    'Um dos filtros do recorte chegou em formato que não dá para aplicar. Refaça a busca na lista e exporte de novo.',
  recorte_vazio:
    'Nenhum lead atende a este recorte. Ajuste os filtros na lista e exporte de novo.',
  sem_permissao:
    'Seu acesso não alcança os leads desta conta. Peça acesso a quem administra a conta.',
  falha_ao_registrar:
    'A exportação não foi registrada na trilha de auditoria e, por isso, não foi concluída. Tente de novo em alguns minutos.',
  falha_interna:
    'Não foi possível exportar agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaExportacao, number> = {
  // Os dois entregam arquivo, e o que os separa está no cabeçalho de relatório.
  // 206 descreveria melhor o recorte cortado, mas 206 é conversa de faixa de
  // bytes e faria cliente de HTTP tentar pedir o resto.
  exportado: 200,
  teto_atingido: 200,

  metodo_invalido: 405,
  conta_ausente: 400,
  filtro_invalido: 400,
  // 404: o arquivo pedido não existe para este recorte. Não é erro de quem
  // pediu nem falha do servidor, e a tela trata como estado vazio.
  recorte_vazio: 404,
  sem_permissao: 403,
  falha_ao_registrar: 500,
  falha_interna: 500,
}
