// Provas do começo do OAuth do calendário (US-170). Sem rede e sem banco: a
// camada de dados é dublada.
//
// O que este arquivo segura:
//
// 1. **Só administrador recebe o endereço**, e o especialista tem de ser da conta.
// 2. **O endereço pede o escopo mínimo**, o token de renovação e o consentimento
//    de novo, e volta para o endereço do ambiente, nunca do pedido.
// 3. **O `state` carrega conta, especialista e quem clicou**, e confere com a
//    chave do servidor.
// 4. **Instalação sem o par OAuth é espera**, com a frase do estado normal.

import { describe, expect, test } from 'vitest'

import { ESCOPOS_DO_CALENDARIO } from '../_shared/agenda/calendario-google.ts'
import { lerEstadoDaConexao } from '../_shared/agenda/estado-da-conexao.ts'

import {
  atenderConexaoDoCalendario,
  MENSAGENS_DA_CONEXAO,
  type ConfiguracaoDaConexao,
  type PedidoDaConexao,
  type PortaDaConexao,
} from './conexao.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const ESPECIALISTA = '22222222-2222-4222-8222-222222222222'
const USUARIO = '33333333-3333-4333-8333-333333333333'
const CHAVE = 'chave-do-servidor-para-teste'
const AGORA = 1_790_000_000_000
const VOLTA = 'https://projeto.supabase.co/functions/v1/calendar-callback'

const CONFIGURACAO: ConfiguracaoDaConexao = {
  clienteId: 'cliente-oauth.apps.googleusercontent.com',
  redirecionamento: VOLTA,
  chaveDoServidor: CHAVE,
  agora: () => AGORA,
}

function porta(cenario: { papel?: string | null; daConta?: boolean; sessao?: boolean } = {}): PortaDaConexao {
  return {
    async usuarioDaSessao() {
      return cenario.sessao === false ? null : { id: USUARIO }
    },
    async papelNaConta() {
      return cenario.papel === undefined ? 'admin' : cenario.papel
    },
    async especialistaDaConta() {
      return cenario.daConta ?? true
    },
  }
}

function pedido(parcial: Partial<PedidoDaConexao> = {}): PedidoDaConexao {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer jwt-de-quem-administra',
    contaId: CONTA,
    especialistaId: ESPECIALISTA,
    ...parcial,
  }
}

describe('calendar-connect', () => {
  test.each(['admin', 'owner'])('%s recebe o endereço de autorização com o state assinado', async (papel) => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta({ papel }), CONFIGURACAO)

    expect(resposta.status).toBe(200)
    if (!resposta.corpo.ok) throw new Error('esperava o endereço')
    const url = new URL(resposta.corpo.url)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe(CONFIGURACAO.clienteId)
    expect(url.searchParams.get('redirect_uri')).toBe(VOLTA)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...ESCOPOS_DO_CALENDARIO])

    await expect(lerEstadoDaConexao(url.searchParams.get('state'), CHAVE, AGORA)).resolves.toEqual({
      ok: true,
      estado: { contaId: CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO, emitidoEm: AGORA },
    })
  })

  test('o escopo é só de evento e de ocupação, nunca o calendário inteiro', () => {
    expect(ESCOPOS_DO_CALENDARIO).not.toContain('https://www.googleapis.com/auth/calendar')
    for (const escopo of ESCOPOS_DO_CALENDARIO) expect(escopo).toMatch(/\/auth\/calendar\.(events|freebusy)$/)
  })

  test('operador não conecta calendário', async () => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta({ papel: 'operator' }), CONFIGURACAO)

    expect(resposta).toEqual({
      status: 403,
      corpo: { ok: false, motivo: 'sem_permissao', mensagem: MENSAGENS_DA_CONEXAO.sem_permissao },
    })
  })

  test('quem não é membro da conta não conecta', async () => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta({ papel: null }), CONFIGURACAO)

    expect(resposta.status).toBe(403)
  })

  test('especialista de outra conta não vira endereço', async () => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta({ daConta: false }), CONFIGURACAO)

    expect(resposta.status).toBe(404)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'especialista_nao_encontrado' })
  })

  test.each([
    [{ autorizacao: null }, 401, 'sem_sessao'],
    [{ autorizacao: 'Basic abc' }, 401, 'sem_sessao'],
    [{ especialistaId: '' }, 400, 'pedido_incompleto'],
    [{ contaId: 42 }, 400, 'pedido_incompleto'],
    [{ metodo: 'GET' }, 405, 'metodo_nao_suportado'],
  ] as const)('%j responde %i', async (parcial, status, motivo) => {
    const resposta = await atenderConexaoDoCalendario(pedido(parcial), porta(), CONFIGURACAO)

    expect(resposta.status).toBe(status)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo })
  })

  test('sessão que não vale é 401', async () => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta({ sessao: false }), CONFIGURACAO)

    expect(resposta.status).toBe(401)
  })

  test.each([
    [{ clienteId: '' }],
    [{ redirecionamento: '' }],
    [{ chaveDoServidor: '  ' }],
  ])('instalação sem %j espera o Google, com a frase do estado normal', async (faltando) => {
    const resposta = await atenderConexaoDoCalendario(pedido(), porta(), { ...CONFIGURACAO, ...faltando })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: false,
      motivo: 'aguardando_google',
      mensagem: MENSAGENS_DA_CONEXAO.aguardando_google,
    })
    expect(MENSAGENS_DA_CONEXAO.aguardando_google).toMatch(/estado normal/)
  })

  test('porta que levanta vira frase, não exceção', async () => {
    const quebrada: PortaDaConexao = {
      ...porta(),
      async papelNaConta() {
        throw new Error('conexão com o banco caiu')
      },
    }

    const resposta = await atenderConexaoDoCalendario(pedido(), quebrada, CONFIGURACAO)

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(resposta)).not.toContain('conexão com o banco caiu')
  })
})
