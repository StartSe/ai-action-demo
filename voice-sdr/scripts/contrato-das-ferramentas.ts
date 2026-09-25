// A suíte de contrato das ferramentas contra as funções publicadas, que é o
// portão de produção da seção 9.2 do PRD de implementação: nenhuma função de
// ferramenta entra em produção sem ela verde.
//
// POR QUE ELA NÃO RODA NO LAÇO: ela manda pedidos HTTP para as funções no ar, com
// o segredo derivado da chave do servidor e uma conversa semeada no ambiente de
// homologação. Isso exige rede, credencial e banco real, e o laço de execução é
// em processo, sem container, sem rede e sem permissão do macOS (`CLAUDE.md`,
// "Validação: em processo, sem container"). O contrato em processo já roda no
// laço, pelo esqueleto (`supabase/functions/_shared/tools/esqueleto.test.ts`) e,
// para as duas ferramentas de agenda, pelos oito casos da seção 9.2 em
// `supabase/functions/_shared/tools/contrato-da-agenda.test.ts`; esta é a mesma
// lista de casos contra o que foi implantado. Ela é passo próprio
// do degrau 3 (`npm run check:contrato`, dentro de `check:full`) e **sai com zero
// quando SARAH_TOOLS_BASE_URL está ausente**, que é o caso de toda máquina de
// desenvolvimento e de todo envio sem segredo. Vermelho por falta de credencial
// ensinaria o time a ignorar a esteira.
//
// O QUE ELA COBRA, de cada ferramenta que tem pasta em `supabase/functions/`:
//   - segredo inválido responde 401;
//   - conversa inexistente responde 404;
//   - campo faltante responde 400, quando a ferramenta tem campo obrigatório;
//   - carga válida responde 200;
//   - toda resposta é `{ ok, data, speech }`, com `speech` em texto, e chega
//     dentro dos 5 s de `response_timeout_secs` (P-01).
//
// A conversa de SARAH_CONTRATO_CONVERSA_ID precisa ser de uma chamada de
// **ensaio** (`direction = 'rehearsal'`): a carga válida executa a ferramenta, e
// no ensaio ela lê de verdade e pula os efeitos (T-16). Contra chamada real, a
// suíte bloquearia um número de verdade.
//
// Ferramenta nova entra em CARGAS com a carga válida e os campos obrigatórios.
// Ferramenta com pasta e sem entrada aqui reprova, para ninguém implantar uma
// sétima sem contrato.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CATALOGO_DE_FERRAMENTAS, PRAZO_DE_FERRAMENTA_SEGUNDOS } from '../supabase/functions/_shared/agente/compilador.ts'
import { derivarSegredo } from '../supabase/functions/_shared/tools/segredo.ts'

const VARIAVEL_DO_ENDERECO = 'SARAH_TOOLS_BASE_URL'

/** A carga válida de cada ferramenta e as chaves que ela exige. */
const CARGAS: ReadonlyMap<string, { carga: Record<string, unknown>; obrigatorios: readonly string[] }> =
  new Map([
    ['tool-dnc', { carga: { reason: 'lead_request', notes: 'pediu para não receber ligação' }, obrigatorios: ['reason'] }],
    ['tool-transfer', { carga: { reason: 'quer falar com uma pessoa', urgency: 'normal' }, obrigatorios: ['reason'] }],
    ['tool-availability', { carga: { duration_min: 30, days_ahead: 7 }, obrigatorios: [] }],
    // Na conversa de ensaio sem oferta gravada a resposta é a recusa por posição, com 200: é o contrato.
    ['tool-book-meeting', { carga: { slot_position: 1, modality: 'video' }, obrigatorios: ['slot_position', 'modality'] }],
    // Sem entrada: a reunião vem da chamada. Na conversa de ensaio sem reunião, a resposta é a frase de contorno com 200.
    ['tool-confirm-meeting', { carga: {}, obrigatorios: [] }],
    // Na conversa de ensaio sem reunião nem oferta, a resposta é a frase de contorno com 200.
    ['tool-reschedule', { carga: { action: 'reschedule', slot_position: 1, reason: 'não posso nesse horário' }, obrigatorios: ['action', 'reason'] }],
  ])

interface Configuracao {
  endereco: string
  chave: string
  conta: string
  conversa: string
}

function lerConfiguracao(): Configuracao | null {
  const endereco = process.env[VARIAVEL_DO_ENDERECO]?.trim() ?? ''
  if (endereco === '') return null
  const faltando = ['SARAH_TOOL_SERVER_KEY', 'SARAH_CONTRATO_CONTA_ID', 'SARAH_CONTRATO_CONVERSA_ID'].filter(
    (nome) => (process.env[nome]?.trim() ?? '') === '',
  )
  if (faltando.length > 0) {
    throw new Error(`${VARIAVEL_DO_ENDERECO} definida sem ${faltando.join(', ')}.`)
  }
  return {
    endereco: endereco.replace(/\/+$/, ''),
    chave: process.env.SARAH_TOOL_SERVER_KEY!.trim(),
    conta: process.env.SARAH_CONTRATO_CONTA_ID!.trim(),
    conversa: process.env.SARAH_CONTRATO_CONVERSA_ID!.trim(),
  }
}

function ferramentasImplantadas(): string[] {
  return CATALOGO_DE_FERRAMENTAS.map((f) => f.nome).filter((nome) =>
    existsSync(fileURLToPath(new URL(`../supabase/functions/${nome}/index.ts`, import.meta.url))),
  )
}

interface Caso {
  nome: string
  segredo: string
  conversa: string
  corpo: Record<string, unknown>
  status: number
}

async function executar(configuracao: Configuracao, ferramenta: string, caso: Caso): Promise<string | null> {
  const inicio = performance.now()
  const resposta = await fetch(`${configuracao.endereco}/${ferramenta}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tool-secret': caso.segredo,
      'x-conversation-id': caso.conversa,
    },
    body: JSON.stringify(caso.corpo),
    signal: AbortSignal.timeout(PRAZO_DE_FERRAMENTA_SEGUNDOS * 1000),
  })
  const duracao = performance.now() - inicio
  const corpo = (await resposta.json().catch(() => null)) as Record<string, unknown> | null

  if (resposta.status !== caso.status) return `status ${resposta.status}, esperado ${caso.status}`
  if (corpo === null || Object.keys(corpo).sort().join(',') !== 'data,ok,speech') {
    return 'corpo fora da forma { ok, data, speech }'
  }
  if (typeof corpo.ok !== 'boolean' || typeof corpo.speech !== 'string' || corpo.speech.trim() === '') {
    return 'ok ou speech com tipo errado'
  }
  if (duracao > PRAZO_DE_FERRAMENTA_SEGUNDOS * 1000) return `${duracao.toFixed(0)} ms, acima do prazo`
  return null
}

async function principal(): Promise<number> {
  const configuracao = lerConfiguracao()
  if (configuracao === null) {
    console.log(
      `contrato das ferramentas: ${VARIAVEL_DO_ENDERECO} ausente, nada a verificar. A suíte roda no degrau 3 com as funções implantadas.`,
    )
    return 0
  }

  const segredo = await derivarSegredo(configuracao.chave, configuracao.conta)
  const implantadas = ferramentasImplantadas()
  let falhas = 0
  for (const ferramenta of implantadas) {
    const declarada = CARGAS.get(ferramenta)
    if (declarada === undefined) {
      console.log(`✗ ${ferramenta}: implantada sem carga válida em CARGAS`)
      falhas += 1
      continue
    }
    const casos: Caso[] = [
      { nome: 'segredo inválido', segredo: 'f'.repeat(64), conversa: configuracao.conversa, corpo: declarada.carga, status: 401 },
      { nome: 'conversa inexistente', segredo, conversa: 'conversa_que_nao_existe', corpo: declarada.carga, status: 404 },
      { nome: 'carga válida', segredo, conversa: configuracao.conversa, corpo: declarada.carga, status: 200 },
    ]
    if (declarada.obrigatorios.length > 0) {
      casos.push({ nome: 'campo faltante', segredo, conversa: configuracao.conversa, corpo: {}, status: 400 })
    }
    for (const caso of casos) {
      const defeito = await executar(configuracao, ferramenta, caso).catch((erro: unknown) =>
        erro instanceof Error ? erro.message : String(erro),
      )
      console.log(`${defeito === null ? '✓' : '✗'} ${ferramenta}: ${caso.nome}${defeito ? ` (${defeito})` : ''}`)
      if (defeito !== null) falhas += 1
    }
  }
  console.log(`contrato das ferramentas: ${implantadas.length} implantadas, ${falhas} falhas.`)
  return falhas === 0 ? 0 : 1
}

principal().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(erro)
    process.exit(1)
  },
)
