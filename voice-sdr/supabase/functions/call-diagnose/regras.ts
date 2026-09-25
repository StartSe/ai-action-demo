// As verificações determinísticas do diagnóstico: o que se conclui dos fatos
// sem modelo nenhum.
//
// **A TABELA É DADO.** Cada regra é uma linha de `REGRAS`, com código,
// severidade, título, sugestão, o alvo que a correção mexe (quando há um) e a
// função que olha os fatos e devolve a evidência — ou nulo, quando não se
// aplica. Regra nova entra na lista e nasce com teste em `regras.test.ts`, que
// varre a tabela e cobra um caso positivo por código.
//
// **A EVIDÊNCIA É O FATO, COM O TEXTO DO PROVEDOR.** "Encerrada por erro do
// modelo" sem o `termination_reason` ao lado manda quem lê confiar no
// diagnóstico; com ele, quem lê confere. O texto cru do provedor entra na
// evidência entre aspas, e é por isso que a leitura de `formato-do-provedor.ts`
// guarda o motivo inteiro.
//
// **O QUE A REGRA NÃO SABE, ELA NÃO CONCLUI.** Conversa que não veio do
// provedor não vira "encerrada sem motivo": vira o achado de conversa
// indisponível, e as regras que dependem dela ficam caladas. Bloco ausente
// (C6) não é bloco vazio. Ferramenta cadastrada por referência sem nome (A2)
// impede a conclusão de "ferramenta inexistente".
//
// Registro de texto: título e sugestão são interface — diretos, declarativos,
// sem travessão (docs/padrao-de-interface.md seção 4). Quem lê é quem
// administra a conta, na ficha da chamada.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  ferramentasDeSistemaDaFatia,
  ferramentasDoProposito,
} from '../_shared/agente/compilador.ts'
import type { Proposito } from '../_shared/playbook/camada-um.ts'
import { FUNCAO_DO_INICIO } from '../_shared/provedor/webhooks-da-conta.ts'

import {
  sentidoDoMotivo,
  type AgenteLido,
  type ConfiguracaoDasConversasLida,
  type ConversaLida,
} from './formato-do-provedor.ts'
import type { Alvo } from './propostas.ts'

export type Severidade = 'erro' | 'aviso' | 'info'

/** Por que a conversa ou o agente não vieram do provedor. */
export type FalhaDaLeitura = 'sem_identificador' | 'sem_chave' | 'nao_encontrada' | 'recusada' | 'indisponivel'

/** Tudo o que as regras e o modelo olham. A borda monta; nada aqui lê de fora. */
export interface FatosDoDiagnostico {
  readonly chamada: {
    readonly id: string
    readonly status: string
    readonly motivoDoFim: string | null
    readonly direcao: string
    readonly duracaoSeg: number | null
    readonly proposito: Proposito
  }
  readonly publicacao: { readonly agenteNoProvedor: string | null; readonly status: string | null } | null
  readonly conversa: ConversaLida | null
  readonly falhaDaConversa: FalhaDaLeitura | null
  readonly agente: AgenteLido | null
  readonly falhaDoAgente: FalhaDaLeitura | null
  readonly configuracaoDasConversas: ConfiguracaoDasConversasLida | null
  /** O que a publicação deveria ter posto no ar, pelo que está gravado aqui. */
  readonly esperado: {
    readonly vozId: string | null
    readonly duracaoMaximaSeg: number | null
  }
}

export interface Achado {
  readonly codigo: CodigoDoAchado
  readonly severidade: Severidade
  readonly titulo: string
  readonly evidencia: string
  readonly sugestao: string
  readonly alvo: Alvo | null
}

interface Regra {
  readonly codigo: string
  readonly severidade: Severidade
  readonly titulo: string
  readonly sugestao: string
  readonly alvo: Alvo | null
  readonly verificar: (fatos: FatosDoDiagnostico) => string | null
}

/** Uma conversa com até este número de falas do lead é curta. */
export const TURNOS_DE_CONVERSA_CURTA = 2

/** Abaixo disto, o tempo de espera do turno corta quem ainda está pensando. */
export const TEMPO_DE_TURNO_MINIMO_SEG = 3

/** Abaixo disto, o silêncio desliga a ligação antes de o lead responder. */
export const SILENCIO_MINIMO_SEG = 10

/** Tamanho de uma fala citada na evidência. */
const TAMANHO_DA_CITACAO = 160

/** O idioma da Sarah (RF-302). O provedor escreve `pt` ou `pt-BR`. */
const IDIOMA_ESPERADO = /^pt\b/i

/** Marcador nosso (`{nome_do_lead}`) ou do provedor (`{{nome}}`), inteiro ou pela metade. */
const MARCADOR_CRU = /\{\{?\s*[A-Za-z_][A-Za-z0-9_]*\s*\}?\}/

/** Marcador do provedor, com o nome da variável. */
const VARIAVEL_DO_PROVEDOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** O que a própria plataforma preenche. */
const PREFIXO_DO_SISTEMA = 'system__'

/** O que um resultado de ferramenta diz quando a ferramenta falhou sem `is_error`. */
const FALHA_NO_RESULTADO = /\b(401|403|404|408|429|5\d\d|unauthori[sz]ed|forbidden|not found|timed? ?out|timeout|error)\b/i

export const REGRAS = [
  {
    codigo: 'sem_publicacao',
    severidade: 'erro',
    titulo: 'O propósito desta ligação não tem agente publicado.',
    sugestao: 'Publique a assistente em Playbooks antes de ligar de novo.',
    alvo: 'republicar',
    verificar: (fatos) =>
      fatos.publicacao?.agenteNoProvedor ? null : 'Não há identificador do agente do provedor para este propósito.',
  },
  {
    codigo: 'conversa_indisponivel',
    severidade: 'aviso',
    titulo: 'Os registros desta ligação não vieram da ElevenLabs.',
    sugestao: 'Confira a chave da ElevenLabs em Integrações e peça a análise de novo.',
    alvo: null,
    verificar: (fatos) => (fatos.conversa ? null : evidenciaDaFalha('conversa', fatos.falhaDaConversa)),
  },
  {
    codigo: 'agente_indisponivel',
    severidade: 'aviso',
    titulo: 'A configuração viva do agente não veio da ElevenLabs.',
    sugestao: 'Confira a chave da ElevenLabs em Integrações. Se o agente foi apagado lá, publique a assistente de novo.',
    alvo: 'republicar',
    verificar: (fatos) =>
      fatos.agente || !fatos.publicacao?.agenteNoProvedor ? null : evidenciaDaFalha('agente', fatos.falhaDoAgente),
  },
  {
    codigo: 'conversa_falhou',
    severidade: 'erro',
    titulo: 'A ElevenLabs registrou a conversa como falha.',
    sugestao: 'Leia o motivo ao lado: ele diz qual parte da configuração parou a conversa.',
    alvo: null,
    verificar: ({ conversa }) =>
      conversa?.status === 'failed'
        ? `Estado da conversa: "failed"${conversa.erro ? `. Erro: ${descreverErro(conversa.erro)}` : ''}.`
        : null,
  },
  {
    codigo: 'chamada_sem_fechamento',
    severidade: 'erro',
    titulo: 'A ElevenLabs encerrou a conversa, e o aviso de fim não chegou aqui.',
    sugestao: 'Publique a assistente de novo para recadastrar o aviso de fim. Sem ele a ficha fica sem transcrição e sem desfecho.',
    alvo: 'republicar',
    verificar: ({ conversa, chamada }) =>
      conversa &&
      (conversa.status === 'done' || conversa.status === 'failed') &&
      chamada.status !== 'ended' &&
      chamada.status !== 'failed'
        ? `A conversa está "${conversa.status}" na ElevenLabs, e a chamada continua "${chamada.status}" aqui.`
        : null,
  },
  {
    codigo: 'conversa_no_ar',
    severidade: 'info',
    titulo: 'A conversa ainda não terminou na ElevenLabs.',
    sugestao: 'Espere a ligação terminar e peça a análise de novo.',
    alvo: null,
    verificar: ({ conversa }) =>
      conversa && (conversa.status === 'initiated' || conversa.status === 'in-progress' || conversa.status === 'processing')
        ? `Estado da conversa: "${conversa.status}".`
        : null,
  },
  {
    codigo: 'encerrada_por_erro_do_modelo',
    severidade: 'erro',
    titulo: 'A ligação caiu por erro do modelo de linguagem do agente.',
    sugestao: 'Confira o modelo escolhido no agente e o saldo da conta que o paga. Depois publique a assistente de novo.',
    alvo: 'republicar',
    verificar: ({ conversa }) => {
      if (!conversa) return null
      const motivo = sentidoDoMotivo(conversa.motivoDoFim)
      const doErro = sentidoDoMotivo(conversa.erro?.razao ?? null)
      if (motivo !== 'erro_do_modelo' && doErro !== 'erro_do_modelo') return null
      return evidenciaDoMotivo(conversa)
    },
  },
  {
    codigo: 'falha_no_webhook_de_inicio',
    severidade: 'erro',
    titulo: 'O aviso de início da conversa falhou, e a assistente começou sem o contexto do lead.',
    sugestao: 'Publique a assistente de novo para recadastrar o aviso de início. Se persistir, confira o endereço de call-init na ElevenLabs.',
    alvo: 'republicar',
    verificar: ({ conversa, agente }) => {
      if (!conversa) return null
      const motivo = sentidoDoMotivo(conversa.motivoDoFim)
      const doErro = sentidoDoMotivo(conversa.erro?.razao ?? null)
      if (motivo === 'webhook_de_inicio' || doErro === 'webhook_de_inicio') return evidenciaDoMotivo(conversa)
      // Com o webhook ligado, `call-init` sempre devolve `call_id`. O bloco
      // presente sem ele é o webhook que não respondeu (C6).
      if (agente?.webhookDeInicioLigado === true && conversa.variaveis !== null && !('call_id' in conversa.variaveis)) {
        return 'O agente pede o contexto ao aviso de início, e a conversa começou sem a variável call_id que ele devolve.'
      }
      return null
    },
  },
  {
    codigo: 'encerrada_por_end_call_cedo',
    severidade: 'erro',
    titulo: 'A própria assistente desligou com a ferramenta de encerrar logo no começo.',
    sugestao: 'Diga no roteiro quando encerrar e quando não encerrar. Resposta curta do lead, como "pode sim", é para seguir a conversa.',
    alvo: null,
    verificar: ({ conversa }) => {
      if (!conversa) return null
      const falasDoLead = contarFalasDoLead(conversa)
      if (falasDoLead > TURNOS_DE_CONVERSA_CURTA) return null
      const encerrar = conversa.invocacoes.find((invocacao) => invocacao.nome === 'end_call')
      const pelaFerramenta = sentidoDoMotivo(conversa.motivoDoFim) === 'end_call'
      if (!encerrar && !pelaFerramenta) return null
      const ultimaDoLead = [...conversa.turnos].reverse().find((turno) => turno.quem === 'lead')
      const razao = typeof encerrar?.parametros.reason === 'string' ? ` Razão dada pela assistente: "${citar(encerrar.parametros.reason)}".` : ''
      return (
        `A ferramenta end_call foi chamada${encerrar ? ` aos ${encerrar.segundo} s` : ''} depois de ` +
        `${falasDoLead} ${falasDoLead === 1 ? 'fala' : 'falas'} do lead` +
        `${ultimaDoLead ? `, a última: "${citar(ultimaDoLead.texto)}"` : ''}.${razao}` +
        `${conversa.motivoDoFim ? ` Motivo do provedor: "${conversa.motivoDoFim}".` : ''}`
      )
    },
  },
  {
    codigo: 'encerrada_por_silencio',
    severidade: 'aviso',
    titulo: 'A ligação foi encerrada por silêncio.',
    sugestao: 'Aumente o tempo de silêncio antes de encerrar no agente, ou confira se o áudio do lead chegou.',
    alvo: null,
    verificar: ({ conversa }) =>
      conversa && sentidoDoMotivo(conversa.motivoDoFim) === 'silencio' ? evidenciaDoMotivo(conversa) : null,
  },
  {
    codigo: 'encerrada_por_duracao_maxima',
    severidade: 'aviso',
    titulo: 'A ligação bateu na duração máxima.',
    sugestao: 'Aumente a duração máxima em Discagem se as conversas boas estão sendo cortadas.',
    alvo: 'politica.duracao_maxima',
    verificar: ({ conversa, chamada }) => {
      if (chamada.motivoDoFim === 'max_duration') return 'A chamada foi marcada como encerrada pela duração máxima.'
      return conversa && sentidoDoMotivo(conversa.motivoDoFim) === 'duracao_maxima' ? evidenciaDoMotivo(conversa) : null
    },
  },
  {
    codigo: 'desligada_pelo_lead',
    severidade: 'info',
    titulo: 'Quem desligou foi o lead.',
    sugestao: 'Leia as últimas falas: o que a assistente disse antes pode ter afastado o lead.',
    alvo: null,
    verificar: ({ conversa }) =>
      conversa && sentidoDoMotivo(conversa.motivoDoFim) === 'desligado_pelo_lead' ? evidenciaDoMotivo(conversa) : null,
  },
  {
    codigo: 'ferramenta_com_erro',
    severidade: 'erro',
    titulo: 'Uma ferramenta chamada na ligação devolveu erro.',
    sugestao: 'Publique a assistente de novo para renovar o segredo das ferramentas. Se persistir, confira em Integrações.',
    alvo: 'republicar',
    verificar: ({ conversa }) => {
      if (!conversa) return null
      const falhas = conversa.invocacoes.filter(
        (invocacao) => invocacao.comErro || (invocacao.resultado !== null && FALHA_NO_RESULTADO.test(invocacao.resultado)),
      )
      if (falhas.length === 0) return null
      return falhas
        .map((invocacao) => `${invocacao.nome} aos ${invocacao.segundo} s: "${citar(invocacao.resultado ?? 'erro sem descrição')}"`)
        .join('; ')
    },
  },
  {
    codigo: 'ferramenta_inexistente',
    severidade: 'erro',
    titulo: 'A assistente chamou uma ferramenta que o agente no ar não tem.',
    sugestao: 'Publique a assistente de novo para o agente receber as ferramentas do propósito.',
    alvo: 'republicar',
    verificar: ({ conversa, agente }) => {
      if (!conversa || !agente || agente.ferramentasPorReferencia > 0) return null
      const conhecidas = new Set(agente.ferramentas)
      const estranhas = [...new Set(conversa.invocacoes.map((invocacao) => invocacao.nome))].filter(
        (nome) => !conhecidas.has(nome),
      )
      return estranhas.length === 0 ? null : `Chamadas sem ferramenta no agente: ${estranhas.join(', ')}.`
    },
  },
  {
    codigo: 'marcador_cru_na_primeira_fala',
    severidade: 'erro',
    titulo: 'A primeira fala tem um marcador que a assistente lê em voz alta.',
    sugestao: 'Tire o marcador da primeira fala em Identidade ou use um que a ligação preenche. Depois publique a assistente.',
    alvo: 'identidade.primeira_fala',
    verificar: ({ conversa, agente }) => {
      const achados: string[] = []
      const conhecidas = variaveisConhecidas(conversa, agente)
      for (const [onde, fala] of [
        ['primeira fala do agente', agente?.primeiraFala ?? null],
        ['primeira fala sobreposta no início da conversa', conversa?.primeiraFalaSobreposta ?? null],
      ] as const) {
        if (!fala) continue
        const crus = marcadoresCrus(fala, conhecidas)
        if (crus.length > 0) achados.push(`${onde}: "${citar(fala)}" (${crus.join(', ')})`)
      }
      return achados.length === 0 ? null : `Na ${achados.join('; na ')}.`
    },
  },
  {
    codigo: 'marcador_cru_na_fala',
    severidade: 'erro',
    titulo: 'A assistente falou um marcador em vez do valor dele.',
    sugestao: 'Confira o texto de onde a fala veio (primeira fala ou roteiro) e publique a assistente de novo.',
    alvo: null,
    verificar: ({ conversa }) => {
      const fala = conversa?.turnos.find((turno) => turno.quem === 'agent' && MARCADOR_CRU.test(turno.texto))
      return fala ? `Aos ${fala.segundo} s a assistente disse: "${citar(fala.texto)}".` : null
    },
  },
  {
    codigo: 'variavel_sem_valor',
    severidade: 'erro',
    titulo: 'O agente cita uma variável que a conversa não recebeu.',
    sugestao: 'Publique a assistente de novo. Se a variável vem do aviso de início, confira que ele está cadastrado.',
    alvo: 'republicar',
    verificar: ({ conversa, agente }) => {
      if (!agente) return null
      // Sem o bloco de início (C6) não se sabe o que a conversa recebeu; só se
      // conclui pelo que o agente declara como valor inicial.
      const conhecidas = variaveisConhecidas(conversa, agente)
      const faltam = new Set<string>()
      for (const texto of [agente.primeiraFala, agente.prompt]) {
        if (!texto) continue
        for (const casamento of texto.matchAll(VARIAVEL_DO_PROVEDOR)) {
          const nome = casamento[1]
          if (nome && !nome.startsWith(PREFIXO_DO_SISTEMA) && !conhecidas.has(nome)) faltam.add(nome)
        }
      }
      return faltam.size === 0 ? null : `Sem valor na conversa e sem valor inicial no agente: ${[...faltam].join(', ')}.`
    },
  },
  {
    codigo: 'idioma_diferente_de_pt',
    severidade: 'erro',
    titulo: 'O agente no ar não está em português.',
    sugestao: 'Publique a assistente de novo: a publicação põe o agente em português.',
    alvo: 'republicar',
    verificar: ({ agente }) =>
      agente?.idioma && !IDIOMA_ESPERADO.test(agente.idioma) ? `Idioma do agente: "${agente.idioma}".` : null,
  },
  {
    codigo: 'conversa_curta_encerrada_pela_sarah',
    severidade: 'aviso',
    titulo: 'A conversa acabou curta, e não foi o lead quem desligou.',
    sugestao: 'Leia a transcrição e o diagnóstico abaixo: o roteiro pode estar mandando encerrar cedo.',
    alvo: null,
    verificar: ({ conversa }) => {
      if (!conversa || conversa.turnos.length === 0) return null
      const falasDoLead = contarFalasDoLead(conversa)
      if (falasDoLead === 0 || falasDoLead > TURNOS_DE_CONVERSA_CURTA) return null
      if (sentidoDoMotivo(conversa.motivoDoFim) === 'desligado_pelo_lead') return null
      return `${falasDoLead} ${falasDoLead === 1 ? 'fala' : 'falas'} do lead em ${conversa.duracaoSeg ?? '?'} s${
        conversa.motivoDoFim ? `. Motivo do provedor: "${conversa.motivoDoFim}"` : ''
      }.`
    },
  },
  {
    codigo: 'tempo_de_turno_curto',
    severidade: 'aviso',
    titulo: 'O agente espera pouco pela resposta do lead.',
    sugestao: 'Aumente o tempo de espera do turno no agente para pelo menos 3 segundos.',
    alvo: null,
    verificar: ({ agente }) =>
      agente?.tempoDeTurnoSeg !== null && agente?.tempoDeTurnoSeg !== undefined && agente.tempoDeTurnoSeg > 0 && agente.tempoDeTurnoSeg < TEMPO_DE_TURNO_MINIMO_SEG
        ? `Tempo de espera do turno: ${agente.tempoDeTurnoSeg} s.`
        : null,
  },
  {
    codigo: 'silencio_encerra_cedo',
    severidade: 'aviso',
    titulo: 'O agente desliga depois de pouco silêncio.',
    sugestao: 'Aumente o silêncio antes de encerrar no agente para pelo menos 10 segundos, ou desligue a opção.',
    alvo: null,
    verificar: ({ agente }) => {
      const silencio = agente?.silencioParaEncerrarSeg
      return silencio !== null && silencio !== undefined && silencio >= 0 && silencio < SILENCIO_MINIMO_SEG
        ? `Silêncio antes de encerrar: ${silencio} s.`
        : null
    },
  },
  {
    codigo: 'configuracao_viva_divergente',
    severidade: 'aviso',
    titulo: 'O agente no ar está diferente do que está gravado aqui.',
    sugestao: 'Publique a assistente de novo para o agente voltar a ser o que está gravado.',
    alvo: 'republicar',
    verificar: ({ agente, esperado, chamada }) => {
      if (!agente) return null
      const diferencas: string[] = []
      if (esperado.vozId && agente.vozId && agente.vozId !== esperado.vozId) {
        diferencas.push(`voz no ar ${agente.vozId}, gravada ${esperado.vozId}`)
      }
      if (esperado.duracaoMaximaSeg !== null && agente.duracaoMaximaSeg !== null && agente.duracaoMaximaSeg !== esperado.duracaoMaximaSeg) {
        diferencas.push(`duração máxima no ar ${agente.duracaoMaximaSeg} s, gravada ${esperado.duracaoMaximaSeg} s`)
      }
      if (agente.ferramentasPorReferencia === 0 && agente.ferramentas.length > 0) {
        const faltam = ferramentasEsperadas(chamada.proposito).filter((nome) => !agente.ferramentas.includes(nome))
        if (faltam.length > 0) diferencas.push(`ferramentas que faltam no ar: ${faltam.join(', ')}`)
      }
      return diferencas.length === 0 ? null : `${primeiraMaiuscula(diferencas.join('; '))}.`
    },
  },
  {
    codigo: 'webhooks_ausentes',
    severidade: 'erro',
    titulo: 'Os avisos de início e de fim da conversa não estão cadastrados na ElevenLabs da conta.',
    sugestao: 'Publique a assistente de novo: a publicação cadastra os dois avisos.',
    alvo: 'republicar',
    verificar: ({ configuracaoDasConversas, agente }) => {
      if (!configuracaoDasConversas) return null
      const faltam: string[] = []
      const inicio = configuracaoDasConversas.inicioUrl
      if (agente?.webhookDeInicioLigado !== false && (!inicio || !inicio.includes(FUNCAO_DO_INICIO))) {
        faltam.push(inicio ? `o aviso de início aponta para outro endereço (${inicio})` : 'o aviso de início não está cadastrado')
      }
      if (!configuracaoDasConversas.posChamadaId) faltam.push('o aviso de fim não está cadastrado')
      return faltam.length === 0 ? null : `${primeiraMaiuscula(faltam.join('; '))}.`
    },
  },
] as const satisfies readonly Regra[]

export type CodigoDoAchado = (typeof REGRAS)[number]['codigo'] | 'proposta_recusada'

/** Roda a tabela inteira e devolve os achados, dos mais graves para os mais leves. */
export function verificar(fatos: FatosDoDiagnostico): Achado[] {
  const ordem: Record<Severidade, number> = { erro: 0, aviso: 1, info: 2 }
  const achados: Achado[] = []
  for (const regra of REGRAS as readonly Regra[]) {
    let evidencia: string | null
    try {
      evidencia = regra.verificar(fatos)
    } catch {
      // Uma regra que tropeça num campo torto não derruba o diagnóstico
      // inteiro: ela só não conclui nada.
      evidencia = null
    }
    if (evidencia === null) continue
    achados.push({
      codigo: regra.codigo as CodigoDoAchado,
      severidade: regra.severidade,
      titulo: regra.titulo,
      evidencia,
      sugestao: regra.sugestao,
      alvo: regra.alvo,
    })
  }
  return achados.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
}

/** As ferramentas que a publicação põe no agente daquele propósito. */
export function ferramentasEsperadas(proposito: Proposito): string[] {
  return [...ferramentasDoProposito(proposito), ...ferramentasDeSistemaDaFatia()]
}

// Miúdos ---------------------------------------------------------------------------

function contarFalasDoLead(conversa: ConversaLida): number {
  return conversa.turnos.filter((turno) => turno.quem === 'lead').length
}

/** As variáveis que têm valor: as da conversa e os valores iniciais do agente. */
function variaveisConhecidas(conversa: ConversaLida | null, agente: AgenteLido | null): Set<string> {
  return new Set([...Object.keys(conversa?.variaveis ?? {}), ...Object.keys(agente?.placeholders ?? {})])
}

/**
 * Os marcadores crus de um texto. Chave simples é sempre crua: é a forma nossa,
 * que o provedor não preenche. Chaves duplas só são cruas quando a variável
 * não tem valor.
 */
function marcadoresCrus(texto: string, conhecidas: ReadonlySet<string>): string[] {
  const crus = new Set<string>()
  for (const casamento of texto.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)) {
    const [inteiro, duplo, simples] = casamento
    if (simples) crus.add(inteiro)
    else if (duplo && !duplo.startsWith(PREFIXO_DO_SISTEMA) && !conhecidas.has(duplo)) crus.add(inteiro)
  }
  return [...crus]
}

function evidenciaDoMotivo(conversa: ConversaLida): string {
  const partes: string[] = []
  if (conversa.motivoDoFim) partes.push(`Motivo do provedor: "${conversa.motivoDoFim}"`)
  if (conversa.erro) partes.push(`Erro: ${descreverErro(conversa.erro)}`)
  if (conversa.duracaoSeg !== null) partes.push(`Duração: ${conversa.duracaoSeg} s`)
  return `${partes.join('. ')}.`
}

function descreverErro(erro: { codigo: string | null; razao: string | null }): string {
  return [erro.codigo ? `código ${erro.codigo}` : null, erro.razao ? `"${erro.razao}"` : null].filter(Boolean).join(', ')
}

function evidenciaDaFalha(de: 'conversa' | 'agente', falha: FalhaDaLeitura | null): string {
  const frases: Record<FalhaDaLeitura, string> = {
    sem_identificador:
      de === 'conversa'
        ? 'A chamada não guardou o identificador da conversa na ElevenLabs.'
        : 'Não há identificador do agente para consultar.',
    sem_chave: 'A conta não tem a chave da ElevenLabs cadastrada.',
    nao_encontrada: `A ElevenLabs respondeu que ${de === 'conversa' ? 'a conversa' : 'o agente'} não existe na conta.`,
    recusada: 'A ElevenLabs recusou a chave da conta.',
    indisponivel: 'A ElevenLabs não respondeu a tempo.',
  }
  return frases[falha ?? 'indisponivel']
}

function citar(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > TAMANHO_DA_CITACAO ? `${limpo.slice(0, TAMANHO_DA_CITACAO - 1)}…` : limpo
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
