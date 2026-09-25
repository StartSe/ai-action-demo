// As ferramentas da Sarah em linguagem humana, no que aconteceu na conversa.
//
// Uma tabela só para a ficha da chamada e para o ensaio (US-114): duas grafias
// da mesma ferramenta em duas telas seriam duas verdades. As chaves são as de
// `call_tool_invocations.tool`. Ferramenta fora da tabela aparece com o nome
// cru em vez de sumir com o registro: `call-finalize` grava qualquer
// `system:*` que o provedor executou, mesmo sem saber ler.
//
// `Map` e não objeto literal: a chave vem do banco, e `objeto['constructor']`
// acharia a função na cadeia de protótipos.

const NOMES: ReadonlyMap<string, string> = new Map([
  ['tool-availability', 'A assistente consultou a agenda'],
  ['tool-book-meeting', 'A assistente marcou a reunião'],
  ['tool-confirm-meeting', 'A assistente confirmou a reunião'],
  ['tool-reschedule', 'A assistente remarcou a reunião'],
  ['tool-qualify', 'A assistente registrou a qualificação'],
  ['tool-transfer', 'A assistente pediu a transferência para uma pessoa'],
  ['tool-dnc', 'A assistente bloqueou o número para novas ligações'],
  ['system:end_call', 'A assistente encerrou a ligação'],
  ['system:transfer_to_number', 'A assistente transferiu a ligação para outro número'],
  ['system:voicemail_detection', 'Caixa postal detectada'],
])

export function nomeDaFerramenta(ferramenta: string): string {
  return NOMES.get(ferramenta) ?? `Ferramenta ${ferramenta}`
}

// Os motivos de falha, pelo código que abre `call_tool_invocations.error`.
// O esqueleto das ferramentas (`_shared/tools/esqueleto.ts`) grava `codigo` ou
// `codigo: detalhe`; as recusas próprias vêm de cada ferramenta (tool-qualify,
// tool-dnc). O detalhe é diagnóstico técnico e não vai para a tela. O erro que
// o provedor registrou (`call-finalize/formato-do-provedor.ts`) é texto livre,
// sem código, e cai na frase genérica: a falha continua na lista, com o selo.
const MOTIVOS_DA_FALHA: ReadonlyMap<string, string> = new Map([
  ['proposito_errado', 'A ferramenta não faz parte deste tipo de ligação.'],
  ['campo_faltando', 'Faltou uma informação obrigatória no pedido da assistente.'],
  ['escrita_na_leitura', 'A ferramenta tentou gravar antes da hora e foi interrompida.'],
  ['falha_do_executor', 'A ferramenta não conseguiu consultar os dados.'],
  ['falha_do_efeito', 'A ferramenta decidiu, mas não conseguiu gravar o resultado.'],
  ['fala_vazia', 'A ferramenta não devolveu o que a assistente deveria dizer.'],
  ['identificador_na_fala', 'A resposta foi descartada porque expunha um identificador interno.'],
  ['prazo_estourado', 'A ferramenta demorou demais e a assistente seguiu sem a resposta.'],
  ['recusa_da_ferramenta', 'A ferramenta recusou o pedido.'],
  ['etapa_desconhecida', 'A etapa informada não existe no funil da conta.'],
  ['lead_ausente', 'A ligação não tem lead associado.'],
  ['regua_invalida', 'A régua de pontuação da conta está malformada.'],
  ['numero_desconhecido', 'O número desta ligação não foi reconhecido.'],
])

const CODIGO = /^[a-z][a-z_]*$/

export function motivoDaFalha(erro: string): string {
  const codigo = erro.split(':', 1)[0]?.trim() ?? ''
  return (CODIGO.test(codigo) ? MOTIVOS_DA_FALHA.get(codigo) : undefined)
    ?? 'O provedor registrou uma falha que esta ficha não sabe descrever.'
}
