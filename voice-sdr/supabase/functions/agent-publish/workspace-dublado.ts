// O workspace da ElevenLabs e o cofre da conta, em memória, para os testes da
// publicação e o dublê da tela. Mora fora do `*.test.ts` porque os dois lados o
// usam (a regra de `supabase/CLAUDE.md` sobre cenário de teste compartilhado).
//
// Ele se comporta como o provedor no que o passo de webhooks depende: a
// configuração de conversa persiste entre publicações, a criação do webhook de
// fim sorteia um segredo novo a cada vez, e a listagem devolve o que foi
// criado. E **conta as idas**, que é o único jeito de "a segunda publicação não
// recria o webhook" ser verificável.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
  CAMINHO_DOS_WEBHOOKS,
} from './formato-do-provedor.ts'
import type { IdaAoProvedor, PortaDosWebhooks, VoltaDoProvedor, WebhookGuardado } from './webhooks.ts'

export interface WorkspaceDublado {
  /** O que `GET convai/settings` devolve, no formato do provedor. */
  configuracao: Record<string, unknown>
  readonly webhooks: { webhook_id: string; webhook_url: string }[]
  /** O cofre da conta: `voz` / `webhook_secret`. */
  readonly cofre: Map<string, { id: string; url: string; segredo: string }>
  readonly idas: IdaAoProvedor[]
  /** Falhas combinadas, por método e caminho (`'POST workspace/webhooks'`). */
  readonly falhas: Set<string>
  /** A gravação no cofre recusa (a leitura continua respondendo). */
  cofreFalha: boolean
}

export function criarWorkspaceDublado(): WorkspaceDublado {
  return {
    configuracao: {},
    webhooks: [],
    cofre: new Map(),
    idas: [],
    falhas: new Set(),
    cofreFalha: false,
  }
}

/** Quantas idas houve com este método e caminho. */
export function idasCom(workspace: WorkspaceDublado, metodo: string, caminho: string): number {
  return workspace.idas.filter((ida) => ida.metodo === metodo && ida.caminho === caminho).length
}

export function portaDoWorkspace(workspace: WorkspaceDublado): Omit<PortaDosWebhooks, 'registrarIdaDosWebhooks'> {
  return {
    async chamarApiDoProvedor(ida): Promise<VoltaDoProvedor> {
      workspace.idas.push(ida)
      if (workspace.falhas.has(`${ida.metodo} ${ida.caminho}`)) return { ok: false, status: 503 }

      if (ida.caminho === CAMINHO_DA_CONFIGURACAO_DE_CONVERSA && ida.metodo === 'GET') {
        return { ok: true, status: 200, corpo: structuredClone(workspace.configuracao) }
      }
      if (ida.caminho === CAMINHO_DA_CONFIGURACAO_DE_CONVERSA && ida.metodo === 'PATCH') {
        workspace.configuracao = { ...workspace.configuracao, ...(ida.corpo as Record<string, unknown>) }
        return { ok: true, status: 200, corpo: structuredClone(workspace.configuracao) }
      }
      if (ida.caminho === CAMINHO_DOS_WEBHOOKS && ida.metodo === 'GET') {
        return { ok: true, status: 200, corpo: { webhooks: structuredClone(workspace.webhooks) } }
      }
      if (ida.caminho === CAMINHO_DOS_WEBHOOKS && ida.metodo === 'POST') {
        // O sorteio é a posição da ida: dois cadastros nunca dão o mesmo segredo.
        const sorteio = workspace.idas.length
        const configuracao = (ida.corpo as { settings: { webhook_url: string } }).settings
        const id = `wh_${workspace.webhooks.length + 1}`
        workspace.webhooks.push({ webhook_id: id, webhook_url: configuracao.webhook_url })
        return {
          ok: true,
          status: 200,
          corpo: { webhook_id: id, webhook_secret: `wsec_sorteado_${id}_${sorteio}` },
        }
      }
      return { ok: false, status: 404 }
    },

    async webhookGuardado(contaId): Promise<WebhookGuardado | null> {
      const guardado = workspace.cofre.get(contaId)
      return guardado ? { id: guardado.id, url: guardado.url } : null
    },

    async guardarWebhook(contaId, webhook) {
      if (workspace.cofreFalha) throw new Error('cofre fora do ar')
      workspace.cofre.set(contaId, { ...webhook })
    },
  }
}
