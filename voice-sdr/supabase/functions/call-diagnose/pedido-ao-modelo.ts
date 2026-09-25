// O pedido ao modelo da conta e a leitura do que ele devolve.
//
// **SÓ OS FATOS COLETADOS.** O modelo recebe a transcrição, os metadados da
// ElevenLabs, a configuração viva do agente, o que está gravado em cada alvo e
// os achados das regras — e a instrução de não concluir nada além disso. Um
// diagnóstico que inventasse causa mandaria o dono mexer onde não dói.
//
// **O ESQUEMA É ESTRITO**, porque `_shared/modelo/openrouter.ts` o manda com
// `strict: true`: todo campo presente, sem tipo livre. Por isso a proposta tem
// um campo por forma de valor (`texto`, `lista`, `numero`, `ajustes`), todos
// anuláveis, e o crivo de `propostas.ts` escolhe o que o alvo lê.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { AJUSTES_DE_VOZ } from '../voice-catalog/formato-do-provedor.ts'

import { ALVOS, CAMPOS_DA_POLITICA, MAXIMO_DE_PROPOSTAS, type EstadoAtual } from './propostas.ts'
import type { Achado, FatosDoDiagnostico } from './regras.ts'

/** Quantos turnos da conversa entram no pedido. Ligação de teste cabe inteira. */
export const TURNOS_NO_PEDIDO = 80

/** Tamanho de cada fala e do prompt do agente no pedido. */
const TAMANHO_DA_FALA = 600
const TAMANHO_DO_PROMPT = 8_000
const TAMANHO_DO_ROTEIRO = 4_000

export interface TextoDoPedido {
  readonly sistema: string
  readonly mensagem: string
  readonly esquema: Readonly<Record<string, unknown>>
}

export interface LeituraDoModelo {
  readonly causaProvavel: string
  readonly diagnostico: string
  readonly propostas: readonly unknown[]
}

const SISTEMA = [
  'Você diagnostica ligações de uma assistente virtual de voz em português, que roda na ElevenLabs.',
  'Recebe os fatos coletados de uma ligação: a transcrição, os metadados que a ElevenLabs registrou, a configuração viva do agente, o que está gravado em cada nível de configuração e os achados das verificações automáticas.',
  'Conclua só a partir desses fatos. Não invente evento, campo ou valor que não esteja neles. Se os fatos não bastam para dizer a causa, diga isso.',
  'Escreva em português, frases diretas, para quem administra a conta e não é técnico.',
  '`causa_provavel`: uma frase com a causa mais provável de a ligação ter terminado como terminou.',
  '`diagnostico`: até oito frases explicando o que aconteceu, citando o trecho ou o campo que sustenta cada afirmação.',
  `\`propostas\`: até ${MAXIMO_DE_PROPOSTAS} correções. Cada uma muda um alvo só, da lista fechada, e traz o valor novo inteiro no campo da forma daquele alvo; os outros campos de valor vão nulos.`,
  'Alvos de texto (`identidade.*` menos `nunca_afirmar`, `roteiro.<proposito>`, `jeito_da_casa.<proposito>`, `privacidade.aviso_de_gravacao`) usam `texto`, com o texto novo completo e não um trecho.',
  '`identidade.nunca_afirmar` usa `lista`, com a lista completa.',
  `\`voz.ajustes\` usa \`ajustes\`, com ${AJUSTES_DE_VOZ.map((ajuste) => `${ajuste.nome} de ${ajuste.minimo} a ${ajuste.maximo}`).join(', ')}; nulo no ajuste que não muda.`,
  `\`politica.*\` usa \`numero\`, inteiro: ${Object.entries(CAMPOS_DA_POLITICA)
    .map(([campo, faixa]) => `${campo} de ${faixa.minimo} a ${faixa.maximo}`)
    .join(', ')}. A duração máxima é em segundos.`,
  '`republicar` não leva valor: use quando o que está gravado já está certo e o agente no ar ficou diferente, ou quando o problema some com uma publicação nova.',
  'Marcadores aceitos no texto: {nome_do_lead}, {nome_do_agente}, {empresa}. Nunca use chaves duplas. Nunca prometa horário no roteiro.',
  'Não proponha mudança que os fatos não sustentem. Lista vazia de propostas é resposta válida.',
].join('\n')

export function montarPedidoDoDiagnostico(
  fatos: FatosDoDiagnostico,
  achados: readonly Achado[],
  estado: EstadoAtual,
): TextoDoPedido {
  const { conversa, agente } = fatos
  const dados = {
    chamada: {
      proposito: fatos.chamada.proposito,
      direcao: fatos.chamada.direcao,
      estado: fatos.chamada.status,
      motivo_do_fim_registrado: fatos.chamada.motivoDoFim,
      duracao_seg: fatos.chamada.duracaoSeg,
    },
    conversa_na_elevenlabs: conversa
      ? {
          estado: conversa.status,
          motivo_do_fim: conversa.motivoDoFim,
          erro: conversa.erro,
          duracao_seg: conversa.duracaoSeg,
          variaveis_recebidas_no_inicio: conversa.variaveis,
          primeira_fala_sobreposta: conversa.primeiraFalaSobreposta,
          leitura_do_provedor: { sucesso: conversa.sucessoSegundoOProvedor, resumo: conversa.resumoDoProvedor },
          transcricao: conversa.turnos.slice(0, TURNOS_NO_PEDIDO).map((turno) => ({
            quem: turno.quem === 'agent' ? 'assistente' : 'lead',
            segundo: turno.segundo,
            fala: turno.texto.slice(0, TAMANHO_DA_FALA),
          })),
          ferramentas_chamadas: conversa.invocacoes.map((invocacao) => ({
            nome: invocacao.nome,
            segundo: invocacao.segundo,
            parametros: invocacao.parametros,
            resultado: invocacao.resultado,
            com_erro: invocacao.comErro,
          })),
        }
      : { indisponivel: fatos.falhaDaConversa },
    agente_no_ar: agente
      ? {
          idioma: agente.idioma,
          llm: agente.llm,
          primeira_fala: agente.primeiraFala,
          prompt: agente.prompt?.slice(0, TAMANHO_DO_PROMPT) ?? null,
          voz: { id: agente.vozId, modelo: agente.modeloDeVoz, ajustes: agente.ajustesDeVoz },
          turno: { espera_seg: agente.tempoDeTurnoSeg, silencio_para_encerrar_seg: agente.silencioParaEncerrarSeg },
          duracao_maxima_seg: agente.duracaoMaximaSeg,
          ferramentas: agente.ferramentas,
          valores_iniciais_de_variaveis: agente.placeholders,
          aviso_de_inicio_ligado: agente.webhookDeInicioLigado,
        }
      : { indisponivel: fatos.falhaDoAgente },
    avisos_da_conta_na_elevenlabs: fatos.configuracaoDasConversas,
    gravado_aqui: {
      identidade: estado.identidade,
      roteiro_e_jeito_da_casa_do_proposito: estado.roteiros[fatos.chamada.proposito]
        ? {
            roteiro: estado.roteiros[fatos.chamada.proposito]?.roteiro.slice(0, TAMANHO_DO_ROTEIRO),
            jeito_da_casa: estado.roteiros[fatos.chamada.proposito]?.jeitoDaCasa.slice(0, TAMANHO_DO_ROTEIRO),
          }
        : null,
      voz: estado.voz,
      politica: estado.politica,
      aviso_de_gravacao: estado.avisoDeGravacao,
    },
    achados_das_verificacoes: achados.map((achado) => ({
      codigo: achado.codigo,
      severidade: achado.severidade,
      titulo: achado.titulo,
      evidencia: achado.evidencia,
    })),
  }

  return {
    sistema: SISTEMA,
    mensagem: `Fatos da ligação, em JSON:\n${JSON.stringify(dados, null, 2)}`,
    esquema: ESQUEMA,
  }
}

const anulavel = (tipo: string) => ({ type: [tipo, 'null'] })

export const ESQUEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  additionalProperties: false,
  required: ['causa_provavel', 'diagnostico', 'propostas'],
  properties: {
    causa_provavel: { type: 'string' },
    diagnostico: { type: 'string' },
    propostas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['alvo', 'titulo', 'razao', 'texto', 'lista', 'numero', 'ajustes'],
        properties: {
          alvo: { type: 'string', enum: [...ALVOS] },
          titulo: { type: 'string' },
          razao: { type: 'string' },
          texto: anulavel('string'),
          lista: { type: ['array', 'null'], items: { type: 'string' } },
          numero: anulavel('integer'),
          ajustes: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: AJUSTES_DE_VOZ.map((ajuste) => ajuste.nome),
            properties: Object.fromEntries(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, anulavel('number')])),
          },
        },
      },
    },
  },
}

/** Lê a resposta. Nulo quando não é o JSON pedido: aí nada se grava do modelo. */
export function lerRespostaDoModelo(texto: string): LeituraDoModelo | null {
  let dado: unknown
  try {
    dado = JSON.parse(texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return null
  }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return null
  const { causa_provavel: causa, diagnostico, propostas } = dado as Record<string, unknown>
  if (typeof causa !== 'string' || causa.trim() === '') return null
  if (typeof diagnostico !== 'string' || diagnostico.trim() === '') return null
  return {
    causaProvavel: causa.trim().slice(0, 500),
    diagnostico: diagnostico.trim().slice(0, 4_000),
    propostas: Array.isArray(propostas) ? propostas : [],
  }
}
