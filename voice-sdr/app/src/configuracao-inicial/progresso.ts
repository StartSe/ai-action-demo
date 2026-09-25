/**
 * As decisões da configuração inicial, fora do componente: quando um passo
 * conta como resolvido, que estado o selo mostra, o que sobra bloqueado e que
 * progresso declarado cada botão grava. Função pura se testa sozinha, e é o
 * que permite provar "marcar não apaga pendência" sem montar tela.
 */

import type {
  CargaDaConfiguracao,
  Bloqueio,
  ConfiguracaoInicial,
  PassoId,
  PassoMedido,
  ProgressoDeclarado,
} from '@/configuracao-inicial/tipos'

/**
 * O estado que o passo mostra.
 *
 * `aguardando` é o número e a agenda: o pedido foi feito e a resposta vem de
 * fora — a operadora leva dias para liberar o pacote regulatório, o Google
 * leva semanas para verificar o aplicativo OAuth (docs/revisao-tecnica.md,
 * P-04). Quem pediu não tem mais nada a fazer, então mostrar "pendente" ali
 * manda agir sobre o que não depende de ninguém daqui. Quem decide é o
 * servidor, em `onboarding_health`; aqui só se acrescenta `indisponivel`, que
 * é da tela e não do dado.
 */
export type EstadoDoPasso =
  | 'concluido'
  | 'aguardando'
  | 'indisponivel'
  | 'pendente'

/**
 * Passo opcional é o que não bloqueia nada. Só ele pode ser fechado por
 * declaração: um passo que impede ligação continua aberto por mais que a
 * pessoa o marque, porque a ligação continua não saindo.
 */
export function passoOpcional(passo: PassoMedido): boolean {
  return passo.bloqueia.length === 0
}

/**
 * O peso do passo para a primeira ligação, que é o que a tela distingue com
 * selo. `opcional` não bloqueia nada (`passoOpcional`); `primeira-ligacao`
 * bloqueia a ligação; o resto bloqueia algo que vem depois dela (reunião,
 * campanha) e pode esperar sem impedir que a Sarah ligue.
 */
export type ClasseDoPasso = 'primeira-ligacao' | 'depois-da-ligacao' | 'opcional'

export function classeDoPasso(passo: PassoMedido): ClasseDoPasso {
  if (passoOpcional(passo)) return 'opcional'
  if (passo.bloqueia.includes('ligacao')) return 'primeira-ligacao'
  return 'depois-da-ligacao'
}

/** Resolvido com um conjunto de marcações que pode não ser o do servidor ainda. */
function resolvidoCom(passo: PassoMedido, marcados: readonly PassoId[]): boolean {
  if (!passo.pendente) return true
  return passoOpcional(passo) && marcados.includes(passo.passo)
}

export function passoResolvido(passo: PassoMedido): boolean {
  return resolvidoCom(passo, passo.marcado ? [passo.passo] : [])
}

export function configuracaoConcluida(
  configuracao: ConfiguracaoInicial,
): boolean {
  return configuracao.passos.every(passoResolvido)
}

/** O que falta, na ordem do assistente. É a lista do checklist. */
export function passosPendentes(
  configuracao: ConfiguracaoInicial,
): PassoMedido[] {
  return ordenados(configuracao.passos).filter(
    (passo) => !passoResolvido(passo),
  )
}

export function quantidadeResolvida(configuracao: ConfiguracaoInicial): number {
  return configuracao.passos.filter(passoResolvido).length
}

/** A ordem de exibição dos bloqueios, para a frase não mudar a cada leitura. */
const ORDEM_DOS_BLOQUEIOS: readonly Bloqueio[] = [
  'ligacao',
  'agendamento',
  'campanha',
]

/**
 * A união do que as pendências impedem. O servidor calcula o mesmo em
 * `onboarding_health_refresh`; aqui a conta se refaz sobre os passos que a
 * tela mostra, para não haver um resumo dizendo uma coisa e a lista outra.
 */
export function bloqueiosPendentes(
  configuracao: ConfiguracaoInicial,
): Bloqueio[] {
  const pendentes = new Set(
    passosPendentes(configuracao).flatMap((passo) => passo.bloqueia),
  )
  return ORDEM_DOS_BLOQUEIOS.filter((bloqueio) => pendentes.has(bloqueio))
}

export function estadoDoPasso(passo: PassoMedido): EstadoDoPasso {
  if (passoResolvido(passo)) return 'concluido'
  // Antes de `indisponivel` de propósito: a agenda é justamente um passo cuja
  // tela ainda não existe e cuja espera já começou.
  if (passo.estado === 'aguardando_aprovacao') return 'aguardando'
  if (!passo.disponivel) return 'indisponivel'
  return 'pendente'
}

function ordenados(passos: readonly PassoMedido[]): PassoMedido[] {
  return [...passos].sort((um, outro) => um.ordem - outro.ordem)
}

/**
 * O passo que o assistente abre. O que o servidor guardou, quando ele ainda
 * existe no catálogo; senão o primeiro que falta, e no fim o primeiro de
 * todos, para uma conta pronta ainda ter o que desenhar.
 */
export function passoEmFoco(
  configuracao: ConfiguracaoInicial,
): PassoMedido | null {
  const lista = ordenados(configuracao.passos)
  if (lista.length === 0) return null

  const atual = lista.find((passo) => passo.passo === configuracao.passoAtual)
  if (atual) return atual

  return lista.find((passo) => !passoResolvido(passo)) ?? lista[0] ?? null
}

/** Vizinho na ordem do assistente. É o que "pular" e "voltar" usam. */
export function passoVizinho(
  configuracao: ConfiguracaoInicial,
  passo: PassoId,
  direcao: 1 | -1,
): PassoId | null {
  const lista = ordenados(configuracao.passos)
  const posicao = lista.findIndex((item) => item.passo === passo)
  if (posicao < 0) return null
  return lista[posicao + direcao]?.passo ?? null
}

/** O que o servidor tem hoje, no formato que a escrita usa. */
export function progressoAtual(
  configuracao: ConfiguracaoInicial,
): ProgressoDeclarado {
  return {
    passoAtual: configuracao.passoAtual,
    marcados: ordenados(configuracao.passos)
      .filter((passo) => passo.marcado)
      .map((passo) => passo.passo),
    dispensada: configuracao.dispensada,
    ligacaoDeTeste: configuracao.ligacaoDeTeste,
  }
}

/**
 * Marca o passo e leva o assistente adiante, para o primeiro que ainda falta
 * depois dele. Sem nada faltando, o assistente fica sem passo em curso.
 */
export function marcarPasso(
  configuracao: ConfiguracaoInicial,
  passo: PassoId,
): ProgressoDeclarado {
  const base = progressoAtual(configuracao)
  const marcados = base.marcados.includes(passo)
    ? base.marcados
    : [...base.marcados, passo]

  const lista = ordenados(configuracao.passos)
  const posicao = lista.findIndex((item) => item.passo === passo)
  const seguintes = lista.slice(posicao + 1)
  const proximo =
    seguintes.find((item) => !resolvidoCom(item, marcados)) ??
    lista.find((item) => !resolvidoCom(item, marcados))

  return { ...base, marcados, passoAtual: proximo?.passo ?? null }
}

/** Move o assistente sem marcar nada. Pular e voltar passam por aqui. */
export function irParaPasso(
  configuracao: ConfiguracaoInicial,
  passo: PassoId | null,
): ProgressoDeclarado {
  return { ...progressoAtual(configuracao), passoAtual: passo }
}

/**
 * Se gravar este progresso tira a pessoa do passo aberto: outro passo em
 * curso, nenhum, ou o assistente fechado. É o que decide perguntar antes de
 * perder uma alteração não salva; clicar no próprio passo não sai dele.
 */
export function saiDoPasso(
  configuracao: ConfiguracaoInicial,
  progresso: ProgressoDeclarado,
): boolean {
  if (progresso.dispensada !== configuracao.dispensada) return true
  return progresso.passoAtual !== (passoEmFoco(configuracao)?.passo ?? null)
}

/** Fecha ou retoma o assistente. A pendência medida não se altera. */
export function definirDispensa(
  configuracao: ConfiguracaoInicial,
  dispensada: boolean,
): ProgressoDeclarado {
  return { ...progressoAtual(configuracao), dispensada }
}

/**
 * Os passos que travam a primeira ligação e ainda não foram resolvidos, na
 * ordem do assistente. Com algum aqui, o botão de ligar do passo final fica
 * desligado e diz quais são.
 */
export function faltaParaLigar(configuracao: ConfiguracaoInicial): PassoId[] {
  return passosPendentes(configuracao)
    .filter((passo) => classeDoPasso(passo) === 'primeira-ligacao')
    .map((passo) => passo.passo)
}

/**
 * O tutorial terminou: nada pendente no catálogo e a primeira ligação de
 * teste feita. É o que abre a tela de concluída; o checklist da barra lateral
 * continua olhando só o catálogo (`configuracaoConcluida`), porque a ligação
 * não é pendência de operação.
 */
export function tutorialConcluido(configuracao: ConfiguracaoInicial): boolean {
  return configuracaoConcluida(configuracao) && configuracao.ligacaoDeTeste !== null
}

/**
 * Declara a primeira ligação de teste feita, com a chamada que a fez. O
 * assistente fica sem passo em curso: o que vem depois é a concluída, ou o
 * primeiro que ainda falta.
 */
export function declararLigacaoDeTeste(
  configuracao: ConfiguracaoInicial,
  chamadaId: string,
): ProgressoDeclarado {
  return {
    ...progressoAtual(configuracao),
    passoAtual: null,
    ligacaoDeTeste: chamadaId,
  }
}

/** A primeira tela de quem ainda não configurou: o assistente. */
export const CAMINHO_DA_CONFIGURACAO = '/configuracao-inicial'

/**
 * A aplicação está configurada quando nada trava a primeira ligação:
 * credenciais, identidade, roteiro e número. O que não trava (a agenda que
 * espera a aprovação do Google por semanas, a equipe, os leads) fica no
 * checklist e não prende ninguém no tutorial.
 */
export function aplicacaoConfigurada(configuracao: ConfiguracaoInicial): boolean {
  return faltaParaLigar(configuracao).length === 0
}

/**
 * Para onde a entrada leva depois do login. Enquanto a aplicação não está
 * configurada, a pessoa volta sempre para o tutorial, mesmo que o tenha
 * fechado da última vez, e ele retoma no passo em que ela parou. Carga que
 * falhou não trava a entrada: vale o destino, como antes.
 */
export function destinoDepoisDaEntrada(
  carga: CargaDaConfiguracao | null,
  destino: string | undefined,
): string {
  const seguir = destino ?? '/'
  if (!carga?.ok) return seguir
  return aplicacaoConfigurada(carga.configuracao) ? seguir : CAMINHO_DA_CONFIGURACAO
}

/**
 * O progresso a gravar antes de abrir o tutorial pela entrada: quem o fechou
 * da última vez o encontra aberto de novo, no passo em que parou. Nulo quando
 * não há nada a mudar.
 */
export function reabrirNaEntrada(carga: CargaDaConfiguracao | null): ProgressoDeclarado | null {
  if (!carga?.ok) return null
  const { configuracao } = carga
  if (aplicacaoConfigurada(configuracao) || !configuracao.dispensada) return null
  return definirDispensa(configuracao, false)
}
