// A regra do assistente de abertura, sem React: a ordem das etapas, onde ele
// começa e como se lê a volta do OAuth do modelo.

import { LIMITES_DO_CONTEXTO, type ContextoDoNegocio } from '@sugestoes/sugestoes.ts'

import { passoResolvido } from '@/configuracao-inicial/progresso'
import type { ConfiguracaoInicial, PassoId } from '@/configuracao-inicial/tipos'
import type { CargaDosPlaybooks } from '@/sarah/tipos'

export const ETAPAS_DO_INICIO = [
  'boasVindas',
  // A primeira pergunta: o nome da assistente. Daí em diante o tutorial a
  // chama por ele.
  'nome',
  'plano',
  'modelo',
  'voz',
  'telefonia',
  // Opcional, e por isso não entra em `etapaInicial`: quem nunca configurou o
  // WhatsApp não para aqui ao reabrir o tutorial, e "Seguir" avança sem exigir
  // a chave (`podeSeguir` abaixo).
  'whatsapp',
  'negocio',
  'sugestoes',
  'resumo',
  'publicar',
  'numero',
  'ligacao',
  'pronto',
] as const

export type EtapaDoInicio = (typeof ETAPAS_DO_INICIO)[number]

/** O que já está feito nas três etapas de conexão, medido nos serviços. */
export interface ConexoesDoInicio {
  modelo: boolean
  voz: boolean
  telefonia: boolean
}

/**
 * O que já está feito, medido no dado. O nome sai da identidade gravada
 * (`agents.name`); o resto, de `onboarding_health`: a assistente com
 * identidade (nome e empresa), o roteiro no ar, o número ligado e a primeira
 * ligação de teste.
 */
export interface MedicaoDoInicio {
  nome: boolean
  agente: boolean
  roteiro: boolean
  numero: boolean
  ligacao: boolean
}

/**
 * A medição do banco, lida para o assistente. Passo ausente do catálogo conta
 * como feito. O nome vem à parte, da identidade gravada: o catálogo mede a
 * identidade inteira, e a assistente só com nome não a resolve.
 */
export function medicaoDaConfiguracao(
  configuracao: ConfiguracaoInicial | null,
  nomeGravado: string | null = null,
): MedicaoDoInicio {
  const nome = (nomeGravado?.trim() ?? '') !== ''
  if (!configuracao) return { ...NADA_MEDIDO, nome }
  const feito = (id: PassoId) => {
    const passo = configuracao.passos.find((item) => item.passo === id)
    return passo === undefined || passoResolvido(passo)
  }
  const agente = feito('agente')
  return {
    // Identidade feita tem nome: a linha de `agents` não nasce sem ele.
    nome: nome || agente,
    agente,
    roteiro: feito('roteiro'),
    numero: feito('numero'),
    ligacao: configuracao.ligacaoDeTeste !== null,
  }
}

/**
 * A assistente está no ar para a primeira ligação quando o agente de descoberta foi
 * montado no provedor com o que está gravado, e não só quando o roteiro foi
 * publicado no banco. Os outros três propósitos (lembrete, reativação,
 * retorno) não travam o tutorial: ele só escreve o de descoberta.
 */
export function sarahNoAr(carga: CargaDosPlaybooks | undefined): boolean {
  if (carga?.ok !== true) return false
  return (
    carga.playbooks.publicacao === 'publicado' ||
    (carga.playbooks.noAr ?? []).includes('discovery')
  )
}

/** A etapa do assistente que resolve cada passo que trava a primeira ligação. */
export const ETAPA_DO_PASSO: Partial<Record<PassoId, EtapaDoInicio>> = {
  credenciais: 'telefonia',
  agente: 'negocio',
  roteiro: 'publicar',
  numero: 'numero',
}

const NADA_MEDIDO: MedicaoDoInicio = {
  nome: false,
  agente: false,
  roteiro: false,
  numero: false,
  ligacao: false,
}

/**
 * Onde o assistente abre: na primeira coisa que falta, para quem volta
 * continuar de onde parou. Quem ainda não fez nada começa pelas boas-vindas, e
 * a pergunta seguinte é o nome; com tudo feito, abre no fecho. As sugestões e
 * o resumo nunca abrem sozinhos: eles só existem depois de pedidos.
 */
export function etapaInicial(
  conexoes: ConexoesDoInicio,
  medicao: MedicaoDoInicio = NADA_MEDIDO,
): EtapaDoInicio {
  const temNome = medicao.nome || medicao.agente
  if (!conexoes.modelo && !conexoes.voz && !conexoes.telefonia && !medicao.agente && !temNome) {
    return 'boasVindas'
  }
  if (!temNome) return 'nome'
  if (!conexoes.modelo) return 'modelo'
  if (!conexoes.voz) return 'voz'
  if (!conexoes.telefonia) return 'telefonia'
  if (!medicao.agente) return 'negocio'
  if (!medicao.roteiro) return 'publicar'
  if (!medicao.numero) return 'numero'
  if (!medicao.ligacao) return 'ligacao'
  return 'pronto'
}

/** A posição da etapa, contando de 1, como a barra mostra. */
export function posicaoDaEtapa(etapa: EtapaDoInicio): number {
  return ETAPAS_DO_INICIO.indexOf(etapa) + 1
}

export function etapaVizinha(etapa: EtapaDoInicio, passo: 1 | -1): EtapaDoInicio | null {
  return ETAPAS_DO_INICIO[ETAPAS_DO_INICIO.indexOf(etapa) + passo] ?? null
}

/**
 * Seguir só vale com a etapa feita. O modelo, a voz e a telefonia se medem
 * nos serviços, e o que vem depois do resumo no banco. O negócio segue pelo
 * botão de gerar, a menos que a assistente já tenha identidade: aí é revisão, e
 * seguir pula para a publicação.
 */
export function podeSeguir(
  etapa: EtapaDoInicio,
  conexoes: ConexoesDoInicio,
  vozEscolhida = false,
  medicao: MedicaoDoInicio = NADA_MEDIDO,
): boolean {
  // O WhatsApp é opcional (RF do canal): "Seguir" avança sem exigir a chave,
  // como as boas-vindas e o plano.
  if (etapa === 'boasVindas' || etapa === 'plano' || etapa === 'whatsapp') return true
  // O nome é obrigatório: é com ele que a assistente se apresenta.
  if (etapa === 'nome') return medicao.nome || medicao.agente
  // Na voz, a chave conectada e uma das vozes de exemplo escolhida.
  if (etapa === 'voz') return conexoes.voz && vozEscolhida
  if (etapa === 'modelo' || etapa === 'telefonia') return conexoes[etapa]
  if (etapa === 'negocio') return medicao.agente
  if (etapa === 'publicar') return medicao.roteiro
  if (etapa === 'numero') return medicao.numero
  if (etapa === 'ligacao') return medicao.ligacao
  return false
}

/**
 * A etapa vizinha que existe nesta visita. Sugestões e resumo só existem
 * depois de gerar: quem volta da publicação sem elas cai no negócio, e quem
 * segue do negócio já configurado pula para a publicação.
 */
export function vizinhaNestaVisita(
  etapa: EtapaDoInicio,
  passo: 1 | -1,
  temSugestoes: boolean,
): EtapaDoInicio | null {
  let vizinha = etapaVizinha(etapa, passo)
  while (!temSugestoes && (vizinha === 'sugestoes' || vizinha === 'resumo')) {
    vizinha = etapaVizinha(vizinha, passo)
  }
  return vizinha
}

/** O `code` e o `state` que o OpenRouter devolve na barra de endereço. */
export function lerVoltaDoOAuth(busca: string): { codigo: string; estado: string | null } | null {
  const parametros = new URLSearchParams(busca)
  const codigo = parametros.get('code')
  if (!codigo) return null
  return { codigo, estado: parametros.get('state') }
}

/** Quantos caracteres faltam na descrição para o pedido ser aceito. */
export function faltaNaDescricao(contexto: ContextoDoNegocio): number {
  return Math.max(0, LIMITES_DO_CONTEXTO.descricao.minimo - contexto.descricao.trim().length)
}

export function contextoPronto(contexto: ContextoDoNegocio): boolean {
  return (
    contexto.empresa.trim().length >= LIMITES_DO_CONTEXTO.empresa.minimo &&
    faltaNaDescricao(contexto) === 0
  )
}

/**
 * A chave antiga onde as sugestões revisadas ficavam no navegador. Ninguém a
 * lia de volta, e ela não levava a conta: o negócio de uma conta de teste
 * ficava ali para a próxima. Não se grava mais; `esquecerDadosDoNavegador`
 * (`src/utilidades/dados-do-navegador.ts`) a apaga ao trocar de sessão.
 */
export const CHAVE_DAS_SUGESTOES = 'sarah:sugestoes-iniciais'
