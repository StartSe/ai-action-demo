// As sondas: uma ida à API de cada provedor, com as credenciais já resolvidas.
//
// Saíram do `index.ts` de integrations-status quando a rotina de crédito
// (`cron-credit-watch`) passou a precisar delas: com uma cópia em cada
// adaptador, a tela e o aviso leriam o saldo de jeitos diferentes e a contagem
// divergiria. Aqui há uma leitura só, e os dois adaptadores a importam.
//
// Não há regra aqui: o que decide estado, saldo baixo e cota esgotada é
// `estado.ts`. Este arquivo só traduz a resposta de cada API para
// `RespostaDaSonda`. O `fetch` entra por parâmetro, e o formato de cada
// resposta é o que a documentação pública do provedor descreve; a conferência
// contra a API real é do degrau 3.

import type { RespostaDaSonda } from './estado.ts'
import {
  CODIGO_DA_INSTANCIA_DESCONECTADA,
  lerEstadoDaInstancia,
  pedidoDoEstado,
} from '../_shared/whatsapp/zapi.ts'

import type { ProvedorId } from './provedores.ts'

/** O `fetch` que as sondas usam. Levanta no prazo esgotado. */
export type Buscar = (endereco: string, init: RequestInit) => Promise<Response>

/** O provedor tem estes segundos para responder: a tela espera por ele. */
export const LIMITE_DA_SONDA_MS = 8_000

/** `fetch` com prazo. Estourar o prazo levanta, e `estado.ts` traduz em sem resposta. */
export const buscarComPrazo: Buscar = (endereco, init) =>
  fetch(endereco, { ...init, signal: AbortSignal.timeout(LIMITE_DA_SONDA_MS) })

type Sonda = (credenciais: Readonly<Record<string, string>>, buscar: Buscar) => Promise<RespostaDaSonda>

/**
 * Uma sonda por provedor do catálogo. `Record` sobre `ProvedorId`, e não
 * `switch`: provedor novo em `provedores.ts` não compila sem a sonda dele.
 */
const SONDAS: Readonly<Record<ProvedorId, Sonda>> = {
  voz: (credenciais, buscar) => sondarVoz(credenciais.api_key ?? '', buscar),
  telefonia: (credenciais, buscar) =>
    sondarTelefonia(credenciais.account_sid ?? '', credenciais.auth_token ?? '', buscar),
  calendario: (credenciais, buscar) => sondarCalendario(credenciais, buscar),
  email: (credenciais, buscar) => sondarEmail(credenciais.api_key ?? '', buscar),
  whatsapp: (credenciais, buscar) => sondarWhatsapp(credenciais, buscar),
}

/** Bate na API do provedor. Nenhuma sonda levanta por recusa: vira `ok: false`. */
export function sondarProvedor(
  provedor: ProvedorId,
  credenciais: Readonly<Record<string, string>>,
  buscar: Buscar = buscarComPrazo,
): Promise<RespostaDaSonda> {
  return SONDAS[provedor](credenciais, buscar)
}

async function sondarVoz(chave: string, buscar: Buscar): Promise<RespostaDaSonda> {
  const resposta = await buscar('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': chave },
  })
  if (!resposta.ok) return await recusaDoProvedor(resposta)

  const corpo = (await resposta.json()) as {
    character_count?: number
    character_limit?: number
    max_concurrency?: number
    current_concurrency?: number
  }
  const usados = corpo.character_count ?? 0
  const limite = corpo.character_limit ?? null

  return {
    ok: true,
    credito:
      limite === null
        ? null
        : { restante: Math.max(limite - usados, 0), total: limite, unidade: 'caracteres' },
    cota:
      typeof corpo.max_concurrency === 'number'
        ? {
            rotulo: 'sessões simultâneas',
            emUso: corpo.current_concurrency ?? 0,
            limite: corpo.max_concurrency,
          }
        : null,
  }
}

async function sondarTelefonia(sid: string, token: string, buscar: Buscar): Promise<RespostaDaSonda> {
  const resposta = await buscar(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`,
    { headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}` } },
  )
  if (!resposta.ok) return await recusaDoProvedor(resposta)

  const corpo = (await resposta.json()) as { balance?: string; currency?: string }
  const saldo = Number.parseFloat(corpo.balance ?? '')

  return {
    ok: true,
    credito: Number.isFinite(saldo)
      ? { restante: saldo, total: null, unidade: corpo.currency?.toUpperCase() || 'USD' }
      : null,
    cota: null,
  }
}

async function sondarCalendario(
  credenciais: Readonly<Record<string, string>>,
  buscar: Buscar,
): Promise<RespostaDaSonda> {
  // Trocar o token de atualização é a única verificação honesta: o par do
  // aplicativo sozinho não prova que alguém autorizou a agenda.
  const resposta = await buscar('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credenciais.client_id ?? '',
      client_secret: credenciais.client_secret ?? '',
      refresh_token: credenciais.refresh_token ?? '',
      grant_type: 'refresh_token',
    }),
  })
  if (!resposta.ok) return await recusaDoProvedor(resposta)

  return { ok: true, credito: null, cota: null }
}

async function sondarEmail(chave: string, buscar: Buscar): Promise<RespostaDaSonda> {
  const resposta = await buscar('https://api.resend.com/domains', {
    headers: { authorization: `Bearer ${chave}` },
  })
  if (!resposta.ok) return await recusaDoProvedor(resposta)

  return { ok: true, credito: null, cota: null }
}

async function sondarWhatsapp(
  credenciais: Readonly<Record<string, string>>,
  buscar: Buscar,
): Promise<RespostaDaSonda> {
  const pedido = pedidoDoEstado({
    instance_id: credenciais.instance_id ?? '',
    token: credenciais.token ?? '',
    client_token: credenciais.client_token ?? '',
  })
  const resposta = await buscar(pedido.url, pedido.init)
  if (!resposta.ok) return await recusaDoProvedor(resposta)

  let corpo: unknown = null
  try {
    corpo = await resposta.json()
  } catch {
    // Corpo ilegível com 200 cai na leitura nula abaixo.
  }
  const estado = lerEstadoDaInstancia(corpo)
  if (estado === null) return { ok: false, codigo: null, status: resposta.status }
  // Instância sem sessão responde 200 com `connected: false`: a chave vale,
  // e quem administra precisa ler o QR code no painel (suposição Z7).
  if (!estado.conectada) return { ok: false, codigo: CODIGO_DA_INSTANCIA_DESCONECTADA, status: resposta.status }
  return { ok: true, credito: null, cota: null }
}

/**
 * O código do provedor sai daqui e morre em `erros.ts`. Ele é lido do corpo
 * quando houver, e do status quando não houver: `estado.ts` nunca o devolve.
 */
async function recusaDoProvedor(resposta: Response): Promise<RespostaDaSonda> {
  let codigo: string | null = null
  try {
    const corpo = (await resposta.json()) as Record<string, unknown>
    const detalhe = (corpo.error ?? corpo.detail ?? corpo) as Record<string, unknown> | string
    codigo =
      typeof detalhe === 'string'
        ? detalhe
        : ((detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null) as
            | string
            | null)
  } catch {
    // Corpo ilegível não impede a tradução: o status basta.
  }
  return { ok: false, codigo: codigo === null ? null : String(codigo), status: resposta.status }
}
