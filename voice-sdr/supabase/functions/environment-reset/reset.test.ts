// environment-reset com a camada de dados e o provedor dublados. O que se
// prova: as três travas, na ordem; quem permite, com a variável e sem ela
// (D-12); que os agentes saem antes do banco; e que agente recusado pelo
// provedor não impede o reset.

import { describe, expect, it } from 'vitest'

import { PALAVRA_DE_CONFIRMACAO } from './respostas.ts'
import { atenderReset, lerPermissao, type PortaDoReset } from './reset.ts'

interface Dublê extends PortaDoReset {
  passos: string[]
}

function criarPorta(
  opcoes: { papel?: string | null; recusaAgente?: string; contas?: number } = {},
): Dublê {
  const passos: string[] = []
  return {
    passos,
    async usuarioDaSessao() {
      passos.push('sessao')
      return { id: 'u-1' }
    },
    async papelNaConta() {
      passos.push('papel')
      return opcoes.papel === undefined ? 'owner' : opcoes.papel
    },
    async contasDaInstalacao() {
      passos.push('contas')
      return opcoes.contas ?? 1
    },
    async agentesPublicados() {
      passos.push('agentes')
      return [
        { contaId: 'c-1', agenteId: 'ag-1' },
        { contaId: 'c-1', agenteId: 'ag-2' },
      ]
    },
    async apagarAgente(_conta, agenteId) {
      passos.push(`apagar:${agenteId}`)
      return agenteId !== opcoes.recusaAgente
    },
    async zerar() {
      passos.push('zerar')
      return { contas: 1, usuarios: 2 }
    },
  }
}

const PEDIDO = {
  metodo: 'POST',
  autorizacao: 'Bearer jwt',
  contaId: 'c-1',
  confirmacao: PALAVRA_DE_CONFIRMACAO,
  permissao: 'sim' as const,
}

describe('as travas', () => {
  it('desligado na instalação recusa antes de ler a sessão', async () => {
    const porta = criarPorta()
    const resposta = await atenderReset({ ...PEDIDO, permissao: 'nao' }, porta)
    expect(resposta.status).toBe(403)
    expect(resposta.corpo).toMatchObject({ motivo: 'desligado' })
    expect(porta.passos).toEqual([])
  })

  it('confirmação diferente de ZERAR não apaga nada', async () => {
    for (const confirmacao of ['zerar', 'ZERAR ', '', null]) {
      const porta = criarPorta()
      const resposta = await atenderReset({ ...PEDIDO, confirmacao }, porta)
      expect(resposta.corpo).toMatchObject({ motivo: 'confirmacao_errada' })
      expect(porta.passos).not.toContain('zerar')
    }
  })

  it('admin não zera: só o dono', async () => {
    const porta = criarPorta({ papel: 'admin' })
    const resposta = await atenderReset(PEDIDO, porta)
    expect(resposta.status).toBe(403)
    expect(resposta.corpo).toMatchObject({ motivo: 'papel_insuficiente' })
    expect(porta.passos).not.toContain('zerar')
  })

  it('sem sessão é 401', async () => {
    const resposta = await atenderReset({ ...PEDIDO, autorizacao: null }, criarPorta())
    expect(resposta.status).toBe(401)
  })
})

describe('quem permite (D-12)', () => {
  it('a variável lida do ambiente: sim permite, outro valor desliga, em branco é ausente', () => {
    expect(lerPermissao('sim')).toBe('sim')
    expect(lerPermissao(' SIM ')).toBe('sim')
    expect(lerPermissao('nao')).toBe('nao')
    expect(lerPermissao('true')).toBe('nao')
    expect(lerPermissao(undefined)).toBe('sem_variavel')
    expect(lerPermissao('  ')).toBe('sem_variavel')
  })

  it('sem a variável e com uma conta só, o dono zera', async () => {
    const porta = criarPorta({ contas: 1 })
    const resposta = await atenderReset({ ...PEDIDO, permissao: 'sem_variavel' }, porta)
    expect(resposta.status).toBe(200)
    expect(porta.passos).toEqual(['sessao', 'papel', 'contas', 'agentes', 'apagar:ag-1', 'apagar:ag-2', 'zerar'])
  })

  it('sem a variável e com duas contas, recusa dizendo onde ligar, e nada sai', async () => {
    const porta = criarPorta({ contas: 2 })
    const resposta = await atenderReset({ ...PEDIDO, permissao: 'sem_variavel' }, porta)
    expect(resposta.status).toBe(403)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'varias_contas' })
    expect(JSON.stringify(resposta.corpo)).toContain('Edge Functions, Secrets')
    expect(porta.passos).toEqual(['sessao', 'papel', 'contas'])
  })

  it('sem a variável, o admin continua sem zerar, antes de contar as contas', async () => {
    const porta = criarPorta({ papel: 'admin' })
    const resposta = await atenderReset({ ...PEDIDO, permissao: 'sem_variavel' }, porta)
    expect(resposta.corpo).toMatchObject({ motivo: 'papel_insuficiente' })
    expect(porta.passos).toEqual(['sessao', 'papel'])
  })

  it('com a variável em sim, não conta as contas', async () => {
    const porta = criarPorta({ contas: 5 })
    const resposta = await atenderReset(PEDIDO, porta)
    expect(resposta.status).toBe(200)
    expect(porta.passos).not.toContain('contas')
  })
})

describe('o reset', () => {
  it('apaga os agentes no provedor antes de zerar o banco', async () => {
    const porta = criarPorta()
    const resposta = await atenderReset(PEDIDO, porta)

    expect(resposta.status).toBe(200)
    expect(porta.passos).toEqual(['sessao', 'papel', 'agentes', 'apagar:ag-1', 'apagar:ag-2', 'zerar'])
    expect(resposta.corpo).toEqual({
      ok: true,
      contas: 1,
      usuarios: 2,
      agentesApagados: 2,
      agentesQueFicaram: 0,
    })
  })

  it('agente que o provedor recusa apagar não impede o reset, e o corpo conta', async () => {
    const porta = criarPorta({ recusaAgente: 'ag-2' })
    const resposta = await atenderReset(PEDIDO, porta)
    expect(resposta.corpo).toMatchObject({ ok: true, agentesApagados: 1, agentesQueFicaram: 1 })
    expect(porta.passos.at(-1)).toBe('zerar')
  })
})

describe('falha interna', () => {
  it('diz em que passo falhou e entrega o erro a quem registra, sem a mensagem do banco no corpo', async () => {
    const porta = criarPorta()
    porta.zerar = async () => {
      throw new Error('permission denied for table secrets')
    }
    const registrados: string[] = []
    const resposta = await atenderReset(PEDIDO, porta, (passo, erro) =>
      registrados.push(`${passo}:${(erro as Error).message}`),
    )
    expect(resposta.status).toBe(500)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'falha_interna', passo: 'zerar' })
    expect(JSON.stringify(resposta.corpo)).not.toContain('permission denied')
    expect(registrados).toEqual(['zerar:permission denied for table secrets'])
  })
})
