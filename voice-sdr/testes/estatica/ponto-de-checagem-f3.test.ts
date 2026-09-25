// O ponto de checagem da F3, no molde da F0, da F1 e da F2: os cinco critérios
// de aceite da fase, lidos de docs/PRD.md, apontam cada um para as provas que o
// fecham em processo, e cada prova existe e é alcançada por `npm run check`.
//
// A F3 é o portão para lead real, e os seus critérios falam de uma conversa: o
// lead pede humano, pede bloqueio, diz que é número errado. Em processo fica
// provada a decisão de cada borda com o provedor dublado, a escrita no banco em
// PGlite e a tela em jsdom. O que o modelo de fato faz na conversa, a
// transferência na telefonia e o microfone no navegador são do degrau 3. Quatro
// dos cinco critérios devem algo lá, e há teste cobrando que cada dívida esteja
// nomeada ao lado do degrau que a exercita, e não só aludida.
//
// O portão em si (a migração que liga `real_dialing`) já tem arquivo próprio,
// `portao-da-fatia.test.ts` e `portao-de-lead-real.test.ts`; aqui só se confere
// que existem e que `npm run check` os alcança.

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

const ARQUIVO = 'testes/estatica/ponto-de-checagem-f3.test.ts'
const RAIZ = new URL('../../', import.meta.url)

const PROVAS: readonly Prova[] = [
  {
    // US-113, US-114, US-107
    criterio: 'uma conversa completa acontece sem telefone',
    arquivos: [
      'supabase/functions/rehearsal-session/sessao.test.ts',
      'supabase/functions/_shared/ensaio/perfis-de-lead.test.ts',
      'supabase/functions/_shared/tools/esqueleto.test.ts',
      'supabase/functions/call-finalize/finalizacao.test.ts',
      'supabase/functions/call-finalize/leitura-da-transcricao.test.ts',
      'testes/banco/ensaio.test.ts',
      'testes/banco/ensaio-fora-das-metricas.test.ts',
      'testes/banco/finalizacao-das-ferramentas-de-sistema.test.ts',
      'app/src/ensaio/ferramentas.test.ts',
      'app/src/ensaio/voz.test.ts',
      'app/src/rotas/sarah-ensaio.test.tsx',
    ],
    faltaNoCi:
      'Em processo ficam provados a sessão assinada contra a publicação do propósito, o modo ensaio do esqueleto (lê de verdade, pula o efeito), a captura das ferramentas na finalização e a tela que as lista em ordem pelo instante, com o condutor dublado. A conversa real com o provedor de voz, com o modelo decidindo quando chamar cada ferramenta, e o áudio e microfone no navegador, só o degrau 3 exercita: test:navegador para o microfone, check:contrato para as ferramentas implantadas, e o deno check de supabase/functions/rehearsal-session/index.ts.',
  },
  {
    // US-105, US-117
    criterio: 'quero falar com uma pessoa',
    arquivos: [
      'supabase/functions/tool-transfer/transferencia.test.ts',
      'supabase/functions/call-audio/audio.test.ts',
      'testes/banco/fila-de-excecoes.test.ts',
      'app/src/fila/leitura.test.ts',
      'app/src/rotas/fila.test.tsx',
    ],
    faltaNoCi:
      'tool-transfer devolve o destino configurado ou abre o item human_requested com o recorte e o call_id, e a fila mostra o recorte e pede o áudio no clique, tudo com o provedor dublado. A transferência de verdade, com transfer_to_number desviando a ligação na telefonia, e a gravação servida pelo provedor, são do degrau 3: check:contrato contra a função implantada e o deno check de supabase/functions/tool-transfer/index.ts e de supabase/functions/call-audio/index.ts.',
  },
  {
    // US-104, US-111
    criterio: 'não me liga mais',
    arquivos: [
      'supabase/functions/tool-dnc/bloqueio.test.ts',
      'supabase/functions/call-finalize/reaplicacao-do-bloqueio.test.ts',
      'testes/banco/bloqueio-pela-ferramenta.test.ts',
      'testes/banco/rediscagem-recusada.test.ts',
    ],
    faltaNoCi:
      'tool-dnc grava o bloqueio durante a chamada e devolve blocked_at, a finalização reaplica o que falhou, e guard_dial recusa a rediscagem em PGlite. Que o modelo chame tool-dnc antes do fim quando o lead pede, dentro do prazo da publicação, só se vê numa conversa real com o provedor de voz: degrau 3, por check:contrato e pelo deno check de supabase/functions/tool-dnc/index.ts e de supabase/functions/call-finalize/index.ts.',
  },
  {
    // US-103, US-109, US-104, US-111
    criterio: 'não é comigo, número errado',
    arquivos: [
      'supabase/functions/_shared/playbook/camada-um.test.ts',
      'supabase/functions/_shared/speech/regras-travadas.test.ts',
      'supabase/functions/_shared/agente/compilador.test.ts',
      'supabase/functions/agent-publish/publicacao.test.ts',
      'supabase/functions/call-finalize/encerramento-da-pessoa-errada.test.ts',
      'supabase/functions/tool-dnc/bloqueio.test.ts',
      'testes/banco/rediscagem-recusada.test.ts',
    ],
    faltaNoCi:
      'A regra travada da camada 1 entra no prompt compilado, end_call é declarado nas quatro publicações, tool-dnc grava com source wrong_number, a finalização conta as falas e registra a divergência, e a rediscagem é recusada. O encerramento em duas falas obedecido pelo modelo é comportamento do provedor de voz numa conversa real, e só o degrau 3 o observa, com a conferência de call-finalize medindo a transcrição que chega dele.',
  },
  {
    // US-116, US-117
    criterio: 'Resolver um item da fila registra autor e hora',
    arquivos: [
      'testes/banco/fila-de-excecoes.test.ts',
      'testes/banco/fila-em-tempo-real.test.ts',
      'app/src/rotas/fila.test.tsx',
    ],
    faltaNoCi: null,
  },
]

/**
 * O que o degrau 3 deve à F3, com o degrau que exercita cada dívida. Cada
 * padrão precisa aparecer escrito em alguma razão de PROVAS.
 */
const DIVIDAS: readonly [RegExp, string][] = [
  [/conversa real com o provedor de voz/, 'a conversa real com o provedor'],
  [/transferência de verdade/, 'a transferência de verdade'],
  [/encerramento em duas falas obedecido pelo modelo/, 'o encerramento obedecido pelo modelo'],
  [/áudio e microfone no navegador/, 'o áudio e o microfone no navegador'],
  [/deno check/, 'o deno check das funções'],
  [/check:contrato/, 'a suíte de contrato das ferramentas'],
  [/test:navegador/, 'a suíte de navegador'],
  [/degrau 3/, 'o degrau que exercita cada dívida'],
]

const criterios = await lerCriteriosDaFase('F3')

verificarPontoDeChecagem({ fase: 'F3', arquivo: ARQUIVO, criterios, provas: PROVAS })

const razoes = PROVAS.map((prova) => prova.faltaNoCi ?? '').join('\n')

test('a F3 tem exatamente os cinco critérios de aceite que o PRD promete', () => {
  expect(criterios.length, criterios.join(' / ')).toBe(5)
})

test('só a resolução da fila fecha inteira em processo', () => {
  expect(
    PROVAS.filter((prova) => prova.faltaNoCi === null).map((prova) => prova.criterio),
    'faltaNoCi null é afirmação de que nada fica para o degrau 3. Se outro ' +
      'critério passou a fechar em processo, mude o teste junto e diga por quê.',
  ).toEqual(['Resolver um item da fila registra autor e hora'])
})

test('o que o degrau 3 deve à F3 está nomeado, e não só aludido', () => {
  for (const [padrao, oQue] of DIVIDAS) {
    expect(razoes, `${oQue} não está escrito em nenhuma razão`).toMatch(padrao)
  }
})

test('os adaptadores das bordas da F3 estão nomeados no que falta', () => {
  for (const funcao of ['rehearsal-session', 'tool-transfer', 'tool-dnc', 'call-finalize', 'call-audio']) {
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

  for (const passo of ['check:contrato', 'test:navegador', 'check:funcoes']) {
    expect(completo, `${passo} saiu de check:full`).toContain(passo)
    expect(laco, `${passo} entrou no laço`).not.toContain(passo)
  }
})

test.each([
  ['o portão que só a F3 abre', 'testes/estatica/portao-da-fatia.test.ts'],
  ['a prontidão conferida pela migração do portão', 'testes/banco/portao-de-lead-real.test.ts'],
  ['a suíte de contrato das ferramentas', 'testes/estatica/contrato-das-ferramentas.test.ts'],
  ['as tabelas da F3 na travessia', 'testes/banco/travessia-entre-contas.test.ts'],
])('%s: %s existe e npm run check o alcança', (_garantia, caminho) => {
  expect(existeNoRepositorio(caminho), caminho).toBe(true)
  expect(suiteQueAlcanca(caminho)?.script).toBe('test:db')
})
