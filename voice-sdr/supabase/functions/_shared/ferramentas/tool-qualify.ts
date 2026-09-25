// O descritor de tool-qualify (US-137, RF-203, RF-309, seção 5 de
// docs/PRD-implementacao.md).
//
// **Os propósitos são a restrição.** A ferramenta existe no agente de
// descoberta, de retomada e de resgate, e não existe no de lembrete: lembrar
// reunião marcada não reclassifica o lead. A seção 5 lista também
// "pós-reunião", que ainda não é propósito próprio — L-07 deixou ao PRD de
// produto decidir entre um quinto propósito e o roteiro de `followup` que
// ramifica por "tem reunião recente", e até lá a pós-reunião é a retomada. O
// teste deste arquivo lê a linha da tabela da seção 5 e cobra que a lista seja
// exatamente essa: acrescentar propósito sem pensar reprova ali.
//
// **meeting_outcome é declarado e ignorado.** O campo entra no esquema porque
// o contrato da seção 5 o tem, e só vale quando o contexto da chamada traz
// `meeting_id`; o vínculo da chamada com a reunião é da F5, e até ele existir
// `qualificacao.ts` não tem a que atribuir o comparecimento.
//
// **Os critérios vêm da régua provisória.** DEPENDE DA PERGUNTA 1 EM ABERTO
// (seção 13 de docs/PRD.md): as chaves que o modelo responde saem de
// `REGUA_DE_EXEMPLO`, e trocar a régua troca a descrição daqui junto.
//
// Módulo portável: sem `Deno`, sem rede, sem banco.

import { CHAVES_CANONICAS } from '../qualificacao/etapa.ts'
import { REGUA_DE_EXEMPLO, TEMPERATURAS } from '../qualificacao/pontuacao.ts'

import { PRAZO_DE_FERRAMENTA_SEGUNDOS, type DescritorDeFerramenta } from './descritor.ts'

/** As etapas que uma conversa pode produzir. `new` é de quem ainda não falou. */
const ETAPAS_DA_CONVERSA = CHAVES_CANONICAS.filter((chave) => chave !== 'new')

export const DESFECHOS_DA_REUNIAO = ['attended', 'no_show', 'unknown'] as const

export const DESCRITOR_DA_QUALIFICACAO = {
  nome: 'tool-qualify',
  propositos: ['discovery', 'rescue', 'followup'],
  prazoDeRespostaSegundos: PRAZO_DE_FERRAMENTA_SEGUNDOS,
  descricao:
    'Chame antes de encerrar, quando já souber em que pé a pessoa está. Registra a etapa do funil, os critérios confirmados e o resumo da conversa. Mande só o que a pessoa confirmou; o que ela não disse fica de fora. Leia a frase devolvida.',
  campos: [
    {
      chave: 'stage_key',
      descricao: 'A etapa em que a conversa deixou a pessoa.',
      obrigatorio: true,
      valores: ETAPAS_DA_CONVERSA,
    },
    {
      chave: 'criterios',
      descricao: `Objeto com true quando a pessoa confirmou, false quando a resposta desqualifica e null quando não foi perguntado, para cada critério: ${REGUA_DE_EXEMPLO.criterios
        .map((criterio) => criterio.key)
        .join(', ')}.`,
      obrigatorio: false,
      tipo: 'object',
    },
    {
      chave: 'temperature',
      descricao: 'Sua impressão do quanto a pessoa serve. A pontuação final sai dos critérios.',
      obrigatorio: false,
      valores: TEMPERATURAS,
    },
    {
      chave: 'sentiment',
      descricao: 'Como a conversa correu, de -1 (muito mal) a 1 (muito bem).',
      obrigatorio: false,
      tipo: 'number',
    },
    { chave: 'pain', descricao: 'A dor que a pessoa descreveu, nas palavras dela.', obrigatorio: false },
    { chave: 'fit', descricao: 'Por que a oferta serve ou não serve, em uma frase.', obrigatorio: false },
    { chave: 'objections', descricao: 'As objeções que a pessoa levantou.', obrigatorio: false },
    { chave: 'next_action', descricao: 'O próximo passo combinado com a pessoa.', obrigatorio: false },
    {
      chave: 'meeting_outcome',
      descricao: 'Só em ligação depois de reunião: se a pessoa compareceu.',
      obrigatorio: false,
      valores: DESFECHOS_DA_REUNIAO,
    },
  ],
} as const satisfies DescritorDeFerramenta
