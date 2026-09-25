// O ponto de checagem da F4, no molde das fases anteriores: os seis critérios
// de aceite da fase, lidos de docs/PRD.md, apontam cada um para as provas que o
// fecham em processo, e cada prova existe e é alcançada por `npm run check`.
//
// A F4 é o resultado da ligação: qualificação, retaguarda, funil, ficha, fila
// por limiar e correção humana. Em processo ficam provados os módulos puros
// (etapa, pontuação, avaliação, gatilhos), as bordas com o provedor e o modelo
// dublados, a escrita no banco em PGlite e as telas em jsdom. O que depende de
// rede, de runtime Deno, de modelo de verdade, do provedor de voz ou do
// navegador é do degrau 3, e há teste cobrando que cada dívida esteja nomeada
// na razão do critério que a deve.
//
// As migrações da F0 à F4 aplicadas em banco vazio são prova de
// `testes/banco/migracoes.test.ts`; as tabelas que a F4 criou e ampliou na
// travessia, de `testes/banco/travessia-entre-contas.test.ts`. Aqui só se
// confere que existem e que `npm run check` os alcança.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import {
  existeNoRepositorio,
  lerCriteriosDaFase,
  suiteQueAlcanca,
  verificarPontoDeChecagem,
  type Prova,
} from '../auxiliares/ponto-de-checagem.ts'

const ARQUIVO = 'testes/estatica/ponto-de-checagem-f4.test.ts'
const RAIZ = new URL('../../', import.meta.url)

const PROVAS: readonly Prova[] = [
  {
    // US-132, US-133, US-136, US-137, US-138, US-147
    criterio: 'o lead aparece na etapa correta, com pontuação, temperatura e resumo da dor',
    arquivos: [
      'supabase/functions/_shared/qualificacao/etapa.test.ts',
      'supabase/functions/_shared/qualificacao/pontuacao.test.ts',
      'supabase/functions/_shared/qualificacao/obrigatoriedade.test.ts',
      'supabase/functions/_shared/ferramentas/tool-qualify.test.ts',
      'supabase/functions/tool-qualify/qualificacao.test.ts',
      'supabase/functions/_shared/agente/compilador.test.ts',
      'supabase/functions/agent-publish/publicacao.test.ts',
      'testes/banco/mover-etapa.test.ts',
      'app/src/rotas/lead.test.tsx',
    ],
    faltaNoCi:
      'Em processo ficam provados o mapeamento por chave, a régua de pontuação e temperatura, a obrigatoriedade da qualificação antes de encerrar em descoberta e tool-qualify gravando etapa, pontuação, temperatura e resumo da dor com as portas dubladas, além de mover_lead_de_etapa em PGlite e a ficha em jsdom. A qualidade do julgamento do modelo, que não é determinística, só se vê com modelo de verdade: em processo a prova é do contrato e do caminho, com o modelo dublado. A publicação real das quatro ferramentas por propósito contra o provedor de voz é de check:sonda e check:contrato; o deno check de supabase/functions/tool-qualify/index.ts é de check:funcoes; e o trajeto único navegador-Deno-Postgres, da ligação à ficha, só o degrau 3 exercita.',
  },
  {
    // US-129, US-139, US-140
    criterio: 'Encerrando a ligação abruptamente antes da ferramenta de qualificação',
    arquivos: [
      'supabase/functions/call-classify/classificacao.test.ts',
      'supabase/functions/call-classify/mesmo-resultado.test.ts',
      'supabase/functions/call-finalize/finalizacao.test.ts',
      'supabase/functions/cron-call-recovery/recuperacao.test.ts',
      'testes/banco/classificacao-da-chamada.test.ts',
      'testes/banco/classificacao-pendente.test.ts',
      'testes/banco/acionamento-da-retaguarda.test.ts',
      'app/src/rotas/chamada.test.tsx',
    ],
    faltaNoCi:
      'call-classify produz o mesmo tipo de resultado que tool-qualify com classification_confidence abaixo do teto, o acionamento em via dupla (finalização e varredura) é idempotente pela reivindicação em PGlite e a ficha mostra a confiança, tudo com o modelo dublado. Os 2 min do critério exigem rede, runtime Deno, modelo de verdade e Postgres real, e só o degrau 3 os mede: test:retaguarda:postgres para a reivindicação concorrente e o deno check de supabase/functions/call-classify/index.ts em check:funcoes. A qualidade do julgamento do modelo na retaguarda também fica lá.',
  },
  {
    // US-127, US-128, US-132, US-146
    criterio: 'Renomear a coluna "Qualificado" para "Tem fit"',
    arquivos: [
      'supabase/functions/_shared/qualificacao/etapa.test.ts',
      'testes/banco/funil.test.ts',
      'testes/banco/mover-etapa.test.ts',
      'app/src/funil/etapas.test.ts',
      'app/src/rotas/funil-etapas.test.tsx',
      'app/src/rotas/funil.test.tsx',
    ],
    faltaNoCi: null,
  },
  {
    // US-147
    criterio: 'A ficha do lead mostra, em ordem única',
    arquivos: [
      'testes/banco/linha-do-tempo-do-lead.test.ts',
      'app/src/leads/linha-do-tempo.test.ts',
      'app/src/leads/servico-supabase.test.ts',
      'app/src/rotas/lead.test.tsx',
    ],
    faltaNoCi:
      'A linha do tempo sai do banco em ordem única, com ligações, mudanças de etapa com autor, reuniões e bloqueios, e a ficha a desenha em jsdom com o serviço dublado. O áudio servido pelo provedor e o trajeto único navegador-Deno-Postgres, da ficha aberta no navegador até a gravação tocando, só o degrau 3 exercita: test:navegador e o deno check de supabase/functions/call-audio/index.ts.',
  },
  {
    // US-126, US-135, US-141, US-149, US-150
    criterio: 'Baixar o limiar de sentimento faz a chamada seguinte',
    arquivos: [
      'supabase/functions/_shared/fila/gatilhos.test.ts',
      'supabase/functions/call-finalize/sentimento-e-fila.test.ts',
      'testes/banco/limiares-da-fila.test.ts',
      'testes/banco/fila-por-limiar.test.ts',
      'testes/banco/fila-de-excecoes.test.ts',
      'app/src/conta/limiares.test.ts',
      'app/src/rotas/config-conta-limiares.test.tsx',
      'app/src/rotas/fila.test.tsx',
    ],
    faltaNoCi:
      'O gatilho puro, a finalização lendo o piso da conta e registrando o item idempotente, e a tela dos limiares e a fila ficam provados em processo com o sentimento dado. O sentimento de verdade vem do julgamento do modelo sobre a transcrição real, e a qualidade do julgamento do modelo não é determinística: em processo a prova é do contrato e do caminho, com o modelo dublado, e o resto é do degrau 3.',
  },
  {
    // US-129, US-130, US-148
    criterio: 'Corrigir a classificação registra autor e hora',
    arquivos: [
      'testes/banco/classificacao-da-chamada.test.ts',
      'testes/banco/correcao-da-classificacao.test.ts',
      'supabase/functions/call-classify/classificacao.test.ts',
      'app/src/chamadas/classificacao.test.ts',
      'app/src/chamadas/servico-supabase.test.ts',
      'app/src/rotas/chamada.test.tsx',
    ],
    faltaNoCi: null,
  },
]

/**
 * O que o degrau 3 deve à F4, com o degrau que exercita cada dívida. Cada
 * padrão precisa aparecer escrito em alguma razão de PROVAS.
 */
const DIVIDAS: readonly [RegExp, string][] = [
  [/2 min do critério exigem rede, runtime Deno, modelo de verdade e Postgres real/, 'os 2 min da retaguarda'],
  [/qualidade do julgamento do modelo/, 'a qualidade do julgamento do modelo'],
  [/modelo dublado/, 'a prova em processo com o modelo dublado'],
  [/publicação real das quatro ferramentas por propósito contra o provedor de voz/, 'a publicação real das ferramentas'],
  [/trajeto único navegador-Deno-Postgres/, 'o trajeto único do primeiro e do quarto critérios'],
  [/deno check/, 'o deno check das funções'],
  [/check:sonda/, 'a sonda de publicação'],
  [/check:contrato/, 'a suíte de contrato das ferramentas'],
  [/test:retaguarda:postgres/, 'a reivindicação concorrente em Postgres real'],
  [/test:navegador/, 'a suíte de navegador'],
  [/degrau 3/, 'o degrau que exercita cada dívida'],
]

const criterios = await lerCriteriosDaFase('F4')

verificarPontoDeChecagem({ fase: 'F4', arquivo: ARQUIVO, criterios, provas: PROVAS })

const razoes = PROVAS.map((prova) => prova.faltaNoCi ?? '').join('\n')

function razaoDe(trecho: string): string {
  return PROVAS.find((prova) => prova.criterio.includes(trecho))?.faltaNoCi ?? ''
}

test('a F4 tem exatamente os seis critérios de aceite que o PRD promete', () => {
  expect(criterios.length, criterios.join(' / ')).toBe(6)
})

test('só o renomear e a correção humana fecham inteiros em processo', () => {
  expect(
    PROVAS.filter((prova) => prova.faltaNoCi === null).map((prova) => prova.criterio),
    'faltaNoCi null é afirmação de que nada fica para o degrau 3. Se outro ' +
      'critério passou a fechar em processo, mude o teste junto e diga por quê.',
  ).toEqual([
    'Renomear a coluna "Qualificado" para "Tem fit"',
    'Corrigir a classificação registra autor e hora',
  ])
})

test('o que o degrau 3 deve à F4 está nomeado, e não só aludido', () => {
  for (const [padrao, oQue] of DIVIDAS) {
    expect(razoes, `${oQue} não está escrito em nenhuma razão`).toMatch(padrao)
  }
})

test('o trajeto único do navegador ao Postgres é dívida do primeiro e do quarto critérios', () => {
  for (const trecho of ['etapa correta', 'ordem única']) {
    expect(razaoDe(trecho), trecho).toMatch(/trajeto único navegador-Deno-Postgres/)
  }
})

test('os 2 min da retaguarda são dívida do segundo critério', () => {
  expect(razaoDe('abruptamente')).toMatch(/2 min/)
})

test('os adaptadores das bordas da F4 estão nomeados no que falta', () => {
  for (const funcao of ['tool-qualify', 'call-classify']) {
    const adaptador = `supabase/functions/${funcao}/index.ts`
    expect(existeNoRepositorio(adaptador), adaptador).toBe(true)
    expect(
      razoes.includes(adaptador),
      `${adaptador} não aparece em nenhum faltaNoCi: o deno check dele ficaria ` +
        'como dívida não declarada',
    ).toBe(true)
  }
})

test('os passos do degrau 3 citados nas razões ficam em check:full, fora de check', async () => {
  const pacote = JSON.parse(
    await readFile(fileURLToPath(new URL('package.json', RAIZ)), 'utf8'),
  ) as { scripts?: Record<string, string> }
  const completo = pacote.scripts?.['check:full'] ?? ''
  const laco = pacote.scripts?.['check'] ?? ''

  for (const passo of [
    'check:funcoes',
    'check:sonda',
    'check:contrato',
    'test:retaguarda:postgres',
    'test:navegador',
  ]) {
    expect(completo, `${passo} saiu de check:full`).toContain(passo)
    expect(laco, `${passo} entrou no laço`).not.toContain(passo)
  }
})

test.each([
  ['as migrações da F0 à F4 em banco vazio', 'testes/banco/migracoes.test.ts'],
  ['as tabelas da F4 na travessia', 'testes/banco/travessia-entre-contas.test.ts'],
])('%s: %s existe e npm run check o alcança', (_garantia, caminho) => {
  expect(existeNoRepositorio(caminho), caminho).toBe(true)
  expect(suiteQueAlcanca(caminho)?.script).toBe('test:db')
})
