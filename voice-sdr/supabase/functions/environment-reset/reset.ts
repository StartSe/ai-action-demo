// environment-reset: zerar o ambiente pelo painel.
//
// Apaga todas as contas, os usuários de login, as credenciais e todo dado de
// negócio, pela função do banco `zerar_ambiente()`, e antes disso apaga na
// ElevenLabs os agentes que a Sarah publicou, para não sobrarem órfãos lá.
//
// **TRÊS TRAVAS, NA ORDEM.** A instalação precisa permitir; quem pede precisa
// ser dono da conta; e a confirmação escrita precisa ser exatamente `ZERAR`.
//
// **QUEM PERMITE (D-12).** `SARAH_PERMITE_ZERAR_AMBIENTE` nos segredos das
// funções manda quando está definida: `sim` permite, qualquer outro valor
// desliga, e aí a recusa vem antes de ler a sessão, para uma produção que
// desligou nem chegar a consultar quem é quem. Sem a variável, que é o caso de
// toda instalação feita pelo painel (o instalador não tem o escopo de
// Secrets), zerar vale enquanto a instalação tem uma conta só: quem é dono
// dela é dono de tudo o que o reset apaga. Com duas contas ou mais, zerar
// apagaria a conta de outra pessoa, e só a variável libera.
//
// **OS AGENTES SAEM ANTES DO BANCO.** A chave da ElevenLabs mora no cofre, que
// o reset apaga: depois dele não há como apagar agente nenhum. Agente que o
// provedor recusou apagar não impede o reset; o corpo diz quantos ficaram.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { MENSAGENS, PALAVRA_DE_CONFIRMACAO, STATUS, type MotivoDoReset } from './respostas.ts'

/** Só o dono zera: é a instalação inteira, e não só a conta dele. */
export const PAPEL_QUE_ZERA = 'owner'

export interface PortaDoReset {
  usuarioDaSessao(jwt: string): Promise<{ readonly id: string } | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** Quantas contas a instalação tem. Só perguntado sem a variável. */
  contasDaInstalacao(): Promise<number>
  /** Os agentes publicados no provedor, de todas as contas da instalação. */
  agentesPublicados(): Promise<readonly { readonly contaId: string; readonly agenteId: string }[]>
  /** Nunca levanta: falha do provedor volta `false`. */
  apagarAgente(contaId: string, agenteId: string): Promise<boolean>
  zerar(): Promise<{ readonly contas: number; readonly usuarios: number }>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly confirmacao: unknown
  /** O que `SARAH_PERMITE_ZERAR_AMBIENTE` diz, lido por `lerPermissao`. */
  readonly permissao: PermissaoDaInstalacao
}

/**
 * `sim` e `nao` são a variável definida; `sem_variavel` deixa a decisão para
 * o número de contas da instalação.
 */
export type PermissaoDaInstalacao = 'sim' | 'nao' | 'sem_variavel'

/** O valor da variável como chega do ambiente. Em branco é ausente. */
export function lerPermissao(valor: string | undefined | null): PermissaoDaInstalacao {
  const limpo = (valor ?? '').trim().toLowerCase()
  if (limpo === '') return 'sem_variavel'
  return limpo === 'sim' ? 'sim' : 'nao'
}

export type RespostaDoReset = {
  readonly status: number
  readonly corpo:
    | {
        readonly ok: true
        readonly contas: number
        readonly usuarios: number
        readonly agentesApagados: number
        readonly agentesQueFicaram: number
      }
    | {
        readonly ok: false
        readonly motivo: MotivoDoReset
        readonly mensagem: string
        readonly passo?: PassoDoReset
      }
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Onde a falha interna aconteceu: vai no corpo e no registro, sem a mensagem do banco. */
export type PassoDoReset = 'sessao' | 'papel' | 'contas' | 'agentes' | 'zerar'

export async function atenderReset(
  pedido: PedidoDaBorda,
  porta: PortaDoReset,
  aoFalhar: (passo: PassoDoReset, erro: unknown) => void = () => {},
): Promise<RespostaDoReset> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')
  if (pedido.permissao === 'nao') return recusa('desligado')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  if (pedido.confirmacao !== PALAVRA_DE_CONFIRMACAO) return recusa('confirmacao_errada')

  let passo: PassoDoReset = 'sessao'
  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    passo = 'papel'
    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (papel !== PAPEL_QUE_ZERA) return recusa('papel_insuficiente')

    if (pedido.permissao === 'sem_variavel') {
      passo = 'contas'
      if ((await porta.contasDaInstalacao()) !== 1) return recusa('varias_contas')
    }

    passo = 'agentes'
    let apagados = 0
    let ficaram = 0
    for (const agente of await porta.agentesPublicados()) {
      if (await porta.apagarAgente(agente.contaId, agente.agenteId)) apagados += 1
      else ficaram += 1
    }

    passo = 'zerar'
    const resumo = await porta.zerar()
    return {
      status: 200,
      corpo: {
        ok: true,
        contas: resumo.contas,
        usuarios: resumo.usuarios,
        agentesApagados: apagados,
        agentesQueFicaram: ficaram,
      },
    }
  } catch (erro) {
    aoFalhar(passo, erro)
    const resposta = recusa('falha_interna')
    return {
      status: resposta.status,
      corpo: { ok: false, motivo: 'falha_interna', mensagem: `${MENSAGENS.falha_interna} ${ONDE_FALHOU[passo]}`, passo },
    }
  }
}

/** A frase de onde parou, para quem vê a recusa saber o que olhar. */
const ONDE_FALHOU: Record<PassoDoReset, string> = {
  sessao: 'A falha foi ao ler a sua sessão.',
  papel: 'A falha foi ao conferir o seu papel na conta.',
  contas: 'A falha foi ao contar as contas da instalação.',
  agentes: 'A falha foi ao apagar os agentes na ElevenLabs.',
  zerar: 'A falha foi ao apagar os dados do banco, e a operação foi desfeita.',
}

function recusa(motivo: MotivoDoReset): RespostaDoReset {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
