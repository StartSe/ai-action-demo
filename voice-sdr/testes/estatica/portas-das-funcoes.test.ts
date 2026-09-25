// Quem chega a cada função de borda sem sessão, e por quê.
//
// O padrão do gateway do Supabase é conferir o JWT antes de a função rodar, e é
// o que se quer na quase totalidade dos casos. `verify_jwt = false` desliga
// isso, e a partir dali a função é responsável pela própria autenticação — no
// `invite-accept`, o token do link; no `lead-intake`, a chave da conta. Errar
// nesse bloco não aparece em teste de unidade nenhum: sobrando, a função fica
// aberta a quem passar; faltando, ela recusa todo pedido legítimo com um 401
// cru que não diz nada a quem integra, e só se descobre em produção.
//
// Daí este arquivo. O conjunto das funções públicas é **fechado**: função nova
// que precise chegar sem sessão tem que passar por aqui, e a passagem obriga a
// escrever no `config.toml` por que ela precisa. O que o teste cobra é o
// conjunto e a existência do motivo, não a prosa dele.

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))

/**
 * As funções que o gateway deixa passar sem JWT, com o resumo do que autentica
 * cada uma. Entrada nova aqui é decisão de segurança, não ajuste de
 * configuração — é para isso que a lista é escrita à mão.
 */
const PUBLICAS: Readonly<Record<string, string>> = {
  'invite-accept':
    'quem clica no link de convite pode chegar sem sessão; o token do link é a credencial',
  'lead-intake':
    'o formulário do site do cliente não tem usuário do Supabase; a chave da conta em x-intake-key é a credencial (L-02, RF-107)',
  'inbound-twiml':
    'quem chama é a telefonia, no meio de uma ligação: a assinatura do pedido é a credencial, conferida antes de qualquer leitura (T-14, RF-409)',
  'call-init':
    'quem chama é o provedor de voz no começo da conversa: a assinatura sobre o corpo cru é a credencial, conferida antes de ler o corpo e antes de tocar no banco (T-14, T-25, RF-408)',
  'call-events':
    'quem chama é o provedor de voz no fim da conversa: a assinatura sobre o corpo cru é a credencial, com o segredo anterior aceito por 24 h na rotação (T-15, R-07)',
  'cron-dial':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-04, T-26)',
  'cron-call-recovery':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-speed-to-lead':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-cost-sync':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-credit-watch':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-retention':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-calendar-sync':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-meeting-invite':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-meeting-reminder':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'cron-meeting-rescue':
    'quem chama é o pg_cron por disparar_rotina, sem Authorization: o segredo interno em x-internal-secret é a credencial, conferido antes de qualquer porta (T-26)',
  'tool-dnc':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-transfer':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-qualify':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-availability':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-book-meeting':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-confirm-meeting':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'tool-reschedule':
    'quem chama é o provedor de voz no meio da ligação: o x-tool-secret derivado da conta é a credencial, conferido pelo esqueleto antes de qualquer leitura por conversa (T-18, seção 5)',
  'whatsapp-inbound':
    'quem chama é a Z-API da conta, sem Authorization, sem assinatura e sem cabeçalho nosso: o endereço com a conta e o HMAC derivado dela é a credencial, conferido antes de ler o corpo e de tocar no banco',
  'calendar-callback':
    'quem chega é o navegador voltando do Google, sem Authorization nosso: o state assinado com a chave do servidor é a credencial, conferido antes de qualquer porta (L-06, RF-507)',
  'telephony-connect':
    'GET /retorno é o navegador voltando do provedor sem cabeçalho nosso, autenticado pelo state assinado; POST /revogacao é o provedor avisando a desconexão, autenticado pelo identificador da subconta; POST / continua exigindo sessão, conferida por conta própria neste arquivo',
  saude:
    'quem chama é a conferência do instalador, sem credencial, e a tela de conexão, antes da sessão: devolve só a chave publicável e dois rótulos de versão, e o único efeito é gravar o endereço das funções quando ele falta (docs/instalacao.md)',
}

interface BlocoDeFuncao {
  readonly nome: string
  readonly verificaJwt: boolean
  /** As linhas de comentário imediatamente acima do bloco. */
  readonly motivo: readonly string[]
}

const CABECALHO_DE_FUNCAO = /^\[functions\.([a-z0-9-]+)\]$/

/**
 * Os blocos `[functions.*]` do config.toml, com o comentário que os precede.
 *
 * Leitura por linha, e não um parser de TOML: a dependência nova não se paga, e
 * o comentário — que é o que este teste quer — é justamente o que um parser de
 * TOML descarta.
 */
async function lerBlocos(): Promise<BlocoDeFuncao[]> {
  const conteudo = await readFile(new URL('supabase/config.toml', `file://${RAIZ}`), 'utf8')
  const linhas = conteudo.split('\n')
  const blocos: BlocoDeFuncao[] = []

  for (const [indice, linha] of linhas.entries()) {
    const nome = CABECALHO_DE_FUNCAO.exec(linha.trim())?.[1]
    if (nome === undefined) continue

    const motivo: string[] = []
    for (let acima = indice - 1; acima >= 0; acima -= 1) {
      const anterior = (linhas[acima] ?? '').trim()
      if (!anterior.startsWith('#')) break
      motivo.unshift(anterior.slice(1).trim())
    }

    let verificaJwt = true
    for (let abaixo = indice + 1; abaixo < linhas.length; abaixo += 1) {
      const dentro = (linhas[abaixo] ?? '').trim()
      if (dentro.startsWith('[')) break
      if (/^verify_jwt\s*=\s*false$/.test(dentro)) verificaJwt = false
    }

    blocos.push({ nome, verificaJwt, motivo })
  }

  return blocos
}

test('só as funções declaradas aqui chegam sem JWT', async () => {
  const semJwt = (await lerBlocos())
    .filter((bloco) => !bloco.verificaJwt)
    .map((bloco) => bloco.nome)

  expect(semJwt.toSorted()).toEqual(Object.keys(PUBLICAS).toSorted())
})

test('cada função pública tem o motivo escrito no config.toml', async () => {
  const blocos = await lerBlocos()

  for (const nome of Object.keys(PUBLICAS)) {
    const bloco = blocos.find((candidato) => candidato.nome === nome)
    expect(bloco, `${nome} precisa de bloco em config.toml`).toBeDefined()
    // Uma linha de comentário não é motivo; o bloco diz quem autentica no lugar
    // do gateway, e isso não cabe numa linha.
    expect(bloco?.motivo.join(' ').length, `${nome} sem motivo escrito`).toBeGreaterThan(80)
  }
})

test('toda função pública existe como diretório em supabase/functions', async () => {
  const entradas = await readdir(new URL('supabase/functions', `file://${RAIZ}`), {
    withFileTypes: true,
  })
  const diretorios = entradas.filter((entrada) => entrada.isDirectory()).map((e) => e.name)

  for (const nome of Object.keys(PUBLICAS)) {
    expect(diretorios).toContain(nome)
  }
})

test('função sem bloco no config.toml continua atrás do gateway', async () => {
  // O outro lado da regra: `leads-import`, `lead-export` e
  // `integrations-status` gravam e leem em nome de quem chamou, e é o gateway
  // que recusa quem não entrou. Elas não têm bloco, e não ter bloco é a decisão
  // certa — este teste existe para que acrescentar um bloco a elas não passe
  // calado. Em `lead-export` o custo de errar é o maior dos três: sem gateway,
  // o endereço que devolve a base de contatos ficaria aberto a quem tivesse a
  // URL.
  const blocos = await lerBlocos()
  const declaradas = blocos.map((bloco) => bloco.nome)

  expect(declaradas).not.toContain('leads-import')
  expect(declaradas).not.toContain('lead-export')
  expect(declaradas).not.toContain('integrations-status')
})
