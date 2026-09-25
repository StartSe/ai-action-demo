// whatsapp-connect: cadastra os webhooks na Z-API da conta e testa o estado
// da instância.
//
// **Não grava nada no cofre.** As três chaves entram pela tela de integrações
// (`set_account_secret`); esta função as lê pela cascata de `secrets.ts` e as
// usa. A tela a chama ao salvar as chaves, e pode chamá-la de novo quando
// quiser: cadastrar o mesmo endereço duas vezes é o mesmo estado na Z-API
// (`PUT` com o mesmo `value`), e por isso ela é idempotente sem ler antes.
//
// **O endereço carrega a credencial** (`?conta=&chave=`, de
// `_shared/whatsapp/endereco.ts`) e nunca sai no corpo da resposta, nem as
// chaves da Z-API: `conferirQueNaoVazou` confere o corpo antes de responder.
//
// **Quem pode**: sessão e papel `admin` ou acima, a régua da configuração da
// conta. Os quatro estados são os de `integrations-status`, pela mesma sonda.
//
// Módulo portável: sem Deno. A rede entra por `buscar`.

import { eFalhaDoProvedor, traduzirErroDoProvedor } from '../_shared/provedor/erros.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import { enderecoDoWebhookDoWhatsapp } from '../_shared/whatsapp/endereco.ts'
import type { Buscar } from '../_shared/whatsapp/envio.ts'
import { pedidosDosWebhooks, type CredenciaisDaZapi } from '../_shared/whatsapp/zapi.ts'
import type { EstadoDaIntegracao } from '../integrations-status/estado.ts'
import { sondarProvedor } from '../integrations-status/sondas.ts'

export const PAPEIS_QUE_CONECTAM: ReadonlySet<string> = new Set(['owner', 'admin'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoDaConexao = 'metodo_invalido' | 'pedido_invalido' | 'sem_sessao' | 'sem_acesso' | 'falha_interna'

export const MENSAGENS_DA_CONEXAO: Record<MotivoDaConexao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  pedido_invalido: 'O pedido chegou sem a conta a conectar.',
  sem_sessao: 'Entre na sua conta para conectar o WhatsApp.',
  sem_acesso: 'Só quem administra a conta conecta o WhatsApp. Peça a um administrador.',
  falha_interna: 'Não foi possível conectar o WhatsApp agora. Tente de novo em alguns minutos.',
}

const STATUS_DA_CONEXAO: Record<MotivoDaConexao, number> = {
  metodo_invalido: 405,
  pedido_invalido: 400,
  sem_sessao: 401,
  sem_acesso: 403,
  falha_interna: 500,
}

export const FRASES_DO_ESTADO = {
  conectado: 'WhatsApp conectado. As mensagens que chegarem ao número vão para a assistente.',
  nao_configurado: 'Cadastre o ID da instância, o token da instância e o token de segurança da Z-API para conectar.',
  webhooksFalharam: 'A Z-API não aceitou o cadastro do endereço de mensagens. Confira as chaves e tente de novo.',
} as const

export interface PortaDaConexao {
  usuarioDaSessao(jwt: string): Promise<{ readonly id: string } | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  credenciais(contaId: string): Promise<CredenciaisDaZapi | null>
}

export interface AmbienteDaConexao {
  /** O endereço de `/functions/v1` desta instalação. */
  readonly base: string
  /** `SARAH_TOOL_SERVER_KEY`, resolvida por `segredo-da-instalacao.ts`. */
  readonly chaveDoServidor: string
  readonly buscar: Buscar
}

export interface PedidoDaConexao {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly corpo: unknown
}

export interface RespostaDaConexao {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
}

function recusa(motivo: MotivoDaConexao): RespostaDaConexao {
  return { status: STATUS_DA_CONEXAO[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS_DA_CONEXAO[motivo] } }
}

export async function atenderConexao(
  pedido: PedidoDaConexao,
  porta: PortaDaConexao,
  ambiente: AmbienteDaConexao,
): Promise<RespostaDaConexao> {
  if (pedido.metodo !== 'POST') return recusa('metodo_invalido')
  const jwt = /^Bearer\s+(.+)$/i.exec(pedido.autorizacao ?? '')?.[1]?.trim() ?? ''
  if (jwt === '') return recusa('sem_sessao')

  const corpo = pedido.corpo !== null && typeof pedido.corpo === 'object' ? (pedido.corpo as Record<string, unknown>) : {}
  const contaId = typeof corpo.account_id === 'string' ? corpo.account_id.trim().toLowerCase() : ''
  if (!UUID.test(contaId)) return recusa('pedido_invalido')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (usuario === null) return recusa('sem_sessao')
    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (papel === null || !PAPEIS_QUE_CONECTAM.has(papel)) return recusa('sem_acesso')

    const credenciais = await porta.credenciais(contaId)
    if (credenciais === null) {
      return { status: 200, corpo: { ok: true, estado: 'nao_configurado', webhooks: 'nao_registrados', mensagem: FRASES_DO_ESTADO.nao_configurado } }
    }
    // Instalação sem a chave do servidor não tem endereço que confira: é
    // configuração nossa que falta, e não da conta.
    if (ambiente.chaveDoServidor.trim() === '') return recusa('falha_interna')

    const endereco = await enderecoDoWebhookDoWhatsapp(ambiente.base, ambiente.chaveDoServidor, contaId)
    let registrados = true
    for (const cadastro of pedidosDosWebhooks(credenciais, endereco)) {
      try {
        const resposta = await ambiente.buscar(cadastro.url, cadastro.init)
        if (!resposta.ok) registrados = false
      } catch {
        registrados = false
      }
    }

    const sonda = await sondarProvedor('whatsapp', credenciais, ambiente.buscar).catch(() => ({ ok: false, codigo: 'timeout' }) as const)
    let estado: EstadoDaIntegracao = 'conectado'
    let mensagem: string = FRASES_DO_ESTADO.conectado
    if (!sonda.ok) {
      const traduzido = traduzirErroDoProvedor(sonda.codigo, 'status' in sonda ? sonda.status : null)
      estado = eFalhaDoProvedor(traduzido.motivo) ? 'indisponivel' : 'erro'
      mensagem = traduzido.mensagem
    } else if (!registrados) {
      mensagem = FRASES_DO_ESTADO.webhooksFalharam
    }

    const resposta = { ok: true, estado, webhooks: registrados ? 'registrados' : 'nao_registrados', mensagem }
    conferirQueNaoVazou(
      resposta,
      [credenciais.instance_id, credenciais.token, credenciais.client_token, new URL(endereco).searchParams.get('chave') ?? ''],
      'whatsapp-connect: credencial no corpo da resposta',
    )
    return { status: 200, corpo: resposta }
  } catch {
    return recusa('falha_interna')
  }
}
