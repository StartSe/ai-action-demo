// O que quem importa lê, e com que status HTTP.
//
// Um arquivo só, e é este, no mesmo desenho de `invite-accept/respostas.ts`: o
// resto da função produz código (`ddd_invalido`, `duplicado_na_base`,
// `sem_permissao`) e nunca frase. A razão é a de sempre nesta base — a decisão
// é de quem sabe, a frase é de quem exibe —, mas aqui ela tem um segundo
// efeito: o relatório de mil linhas carrega o código em cada linha e a frase
// **uma vez**, no dicionário que `frasesDosMotivos` monta. Frase por linha
// repetiria a mesma sentença mil vezes no corpo da resposta.
//
// Registro de interface, não fala da Sarah: direto e declarativo, dizendo o que
// aconteceu e o que fazer em seguida (docs/padrao-de-interface.md seção 4).

import type { MotivoDoRelatorio } from './confirmacao.ts'

/** Desfecho do pedido inteiro, quando ele chegou inteiro. */
export type MotivoAceito = 'previa_pronta' | 'importado'

/** Recusas decididas antes de qualquer linha ser lida. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'acao_invalida'
  | 'conta_ausente'
  | 'planilha_invalida'
  | 'arquivo_ausente'
  | 'escolha_invalida'
  | 'falha_interna'

export type MotivoDaImportacao = MotivoAceito | MotivoLocal

export const MENSAGENS: Record<MotivoDaImportacao, string> = {
  previa_pronta: 'Prévia pronta. Nada foi gravado ainda.',
  importado: 'Importação concluída. O relatório mostra o que entrou em cada linha.',

  metodo_invalido: 'Este endereço aceita apenas POST.',
  acao_invalida: 'Informe a ação do pedido: previa ou confirmar.',
  conta_ausente: 'O pedido chegou sem a conta em que a importação deve gravar.',
  planilha_invalida:
    'Não foi possível ler a planilha do pedido. Envie o arquivo outra vez.',
  arquivo_ausente:
    'A confirmação precisa do nome e do hash do arquivo, para registrar de onde cada lead veio.',
  escolha_invalida:
    'A escolha para telefone já cadastrado é ignorar, atualizar ou criar.',
  falha_interna:
    'Não foi possível concluir a importação agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaImportacao, number> = {
  // A prévia é leitura e a confirmação grava em lote: as duas respondem 200, e
  // o que aconteceu em cada linha está no corpo. 207 descreveria melhor o lote
  // parcial, mas nenhum cliente o trata diferente de 200 e a contagem por linha
  // já diz o que ele diria.
  previa_pronta: 200,
  importado: 200,

  metodo_invalido: 405,
  acao_invalida: 400,
  conta_ausente: 400,
  planilha_invalida: 400,
  arquivo_ausente: 400,
  escolha_invalida: 400,
  falha_interna: 500,
}

/**
 * A frase de cada motivo de linha, do telefone malformado ao que o banco
 * recusou. Ela não repete o código: quem lê o relatório precisa saber o que
 * fazer com a linha, e `celular_sem_nono_digito` não diz isso a ninguém.
 */
export const MENSAGENS_DA_LINHA: Record<MotivoDoRelatorio, string> = {
  // Vindas de `_shared/telefone.ts`, pela prévia.
  vazio: 'A célula de telefone está em branco.',
  sem_digitos: 'A célula de telefone não tem nenhum dígito.',
  comprimento_invalido:
    'O telefone não tem a quantidade de dígitos de um número brasileiro.',
  ddd_invalido: 'O código de área informado não existe no Brasil.',
  celular_sem_nono_digito:
    'Falta o nono dígito neste celular. Confira o número na origem da lista.',
  pais_nao_suportado:
    'Este número é de outro país. A importação aceita apenas números do Brasil.',
  coluna_nao_mapeada:
    'A planilha não tem coluna de telefone. Escolha uma no mapeamento e envie de novo.',

  // Decididas pela prévia sobre o arquivo e sobre a base.
  duplicado_no_arquivo:
    'Este telefone já aparece em uma linha anterior da planilha. Só a primeira entrou.',
  duplicado_na_base: 'Este telefone já estava cadastrado nesta conta.',

  // Códigos que `registrar_lead` levanta.
  telefone_invalido:
    'O banco recusou este telefone. Confira o número na planilha e importe outra vez.',
  duplicado_por_telefone:
    'Já existe lead com este telefone nesta conta. Escolha ignorar ou atualizar para seguir.',
  sem_permissao:
    'Seu papel nesta conta não permite gravar lead. Peça acesso a quem administra a conta.',
  etapa_invalida: 'A etapa escolhida não pertence ao funil desta conta.',
  lead_invalido: 'O banco não aceitou o formato desta linha.',
  opcao_invalida: 'O banco não reconheceu a escolha para telefone já cadastrado.',
  falha_ao_gravar:
    'A gravação desta linha falhou. Importe o arquivo de novo para tentar as que restaram.',
}

/**
 * O dicionário de frases dos motivos que apareceram, e só deles.
 *
 * A tela indexa o relatório por este mapa. Mandar as dezesseis frases sempre
 * seria mais simples de escrever e diria a quem lê a resposta que dezesseis
 * coisas aconteceram, quando aconteceram duas.
 */
export function frasesDosMotivos(
  motivos: Iterable<MotivoDoRelatorio>,
): Readonly<Partial<Record<MotivoDoRelatorio, string>>> {
  const frases: Partial<Record<MotivoDoRelatorio, string>> = {}
  for (const motivo of new Set(motivos)) frases[motivo] = MENSAGENS_DA_LINHA[motivo]
  return frases
}
