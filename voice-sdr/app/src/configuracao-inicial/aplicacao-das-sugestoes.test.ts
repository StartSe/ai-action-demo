// A aplicação das sugestões, sem tela: o que se mescla com o que já existe, o
// que vai para a base de conhecimento, e que uma parte que falha não derruba as
// outras.

import { describe, expect, it } from 'vitest'

import {
  CAMPOS_OBRIGATORIOS,
  aplicarSugestoes,
  completarObrigatorios,
  faltaParaAplicar,
  identidadeSugerida,
  perguntasRespondidas,
  separarNuncaAfirmar,
  type SugestoesRevisadas,
} from '@/configuracao-inicial/aplicacao-das-sugestoes'
import { criarServicoDaSarahDublado } from '@/testes/servico-da-sarah-dublado'

const REVISADAS: SugestoesRevisadas = {
  contexto: { empresa: 'Aurora Energia', descricao: 'x'.repeat(50), bomCliente: '' },
  sugestoes: [
    {
      etapa: 'identidade',
      campos: [
        { campo: 'oferta', valor: 'Energia sem investimento.', porque: '' },
        { campo: 'nunca_afirmar', valor: 'preço fechado, prazo', porque: '' },
      ],
      perguntas: [
        { pergunta: 'Qual a economia média?', exemplo: '' },
        { pergunta: 'Tem fidelidade?', exemplo: '' },
      ],
    },
    { etapa: 'especialista', campos: [{ campo: 'duracao_em_minutos', valor: '30', porque: '' }], perguntas: [] },
  ],
  valores: {
    'identidade.oferta': 'Energia sem investimento.',
    'identidade.nunca_afirmar': 'preço fechado, prazo',
    'especialista.duracao_em_minutos': '30',
  },
  respostas: { 'identidade.0': 'Entre 15% e 20%', 'identidade.1': '  ' },
}

describe('identidadeSugerida', () => {
  it('o que a revisão trouxe vence, e o resto fica como estava', () => {
    const atual = {
      nome: 'Bia',
      empresa: 'Antiga',
      oferta: 'Oferta antiga',
      nuncaAfirmar: ['garantia'],
      destinoDeTransferencia: '+5548999998888',
      primeiraFala: 'Oi, aqui é a Bia.',
      aberturaDoWhatsapp: 'Oi pelo WhatsApp.',
      jeitoNaVoz: '',
      jeitoNoWhatsapp: 'Curto.',
    }
    expect(identidadeSugerida(atual, REVISADAS)).toEqual({
      nome: 'Bia',
      empresa: 'Aurora Energia',
      oferta: 'Energia sem investimento.',
      nuncaAfirmar: ['preço fechado', 'prazo'],
      destinoDeTransferencia: '+5548999998888',
      primeiraFala: 'Oi, aqui é a Bia.',
      aberturaDoWhatsapp: 'Oi pelo WhatsApp.',
      jeitoNaVoz: '',
      jeitoNoWhatsapp: 'Curto.',
    })
  })

  it('sem nada da identidade na revisão, não há o que gravar', () => {
    expect(identidadeSugerida(null, { ...REVISADAS, valores: {} })).toBeNull()
  })

  it('sem nome gravado nem sugerido, o nome fica em branco para a revisão cobrar', () => {
    // Nome de fábrica não existe: quem escolhe é a pessoa, na primeira pergunta.
    expect(identidadeSugerida(null, REVISADAS)?.nome).toBe('')
  })

  it('o nome gravado na primeira pergunta vence o que a IA sugeriu', () => {
    const atual = {
      nome: 'Ana',
      empresa: '',
      oferta: '',
      nuncaAfirmar: [],
      destinoDeTransferencia: '',
      primeiraFala: '',
      aberturaDoWhatsapp: '',
      jeitoNaVoz: '',
      jeitoNoWhatsapp: '',
    }
    const revisadas = {
      ...REVISADAS,
      valores: { ...REVISADAS.valores, 'identidade.nome_do_agente': 'Sarah' },
    }
    expect(identidadeSugerida(atual, revisadas)?.nome).toBe('Ana')
  })
})

it('nunca afirmar aceita vírgula, ponto e vírgula e linha, sem repetir', () => {
  expect(separarNuncaAfirmar('preço, prazo;\ngarantia, preço')).toEqual(['preço', 'prazo', 'garantia'])
})

it('só a pergunta respondida vai para a base', () => {
  expect(perguntasRespondidas(REVISADAS)).toEqual([
    { etapa: 'identidade', pergunta: 'Qual a economia média?', resposta: 'Entre 15% e 20%' },
  ])
})

it('uma parte que falha não derruba as outras, e o relatório diz qual', async () => {
  const servico = criarServicoDaSarahDublado({ salvar: { ok: false, motivo: 'sem-permissao' } })
  const partes = await aplicarSugestoes(servico, REVISADAS)

  expect(partes.map((parte) => [parte.parte, parte.estado])).toEqual([
    ['identidade', 'falhou'],
    ['voz', 'nada'],
    ['roteiro', 'nada'],
    ['conhecimento', 'aplicado'],
    ['especialista', 'para_fazer'],
    ['leads', 'nada'],
  ])
  expect(servico.entradasGravadas).toHaveLength(1)
})

it('avisa cada parte que termina, na ordem do resumo', async () => {
  const avisadas: string[] = []
  await aplicarSugestoes(criarServicoDaSarahDublado(), REVISADAS, (parte) => avisadas.push(parte.parte))
  expect(avisadas).toEqual(['identidade', 'voz', 'roteiro', 'conhecimento', 'especialista', 'leads'])
})

it('a voz escolhida é gravada com os ajustes que a conta já tem', async () => {
  const servico = criarServicoDaSarahDublado()
  const partes = await aplicarSugestoes(servico, {
    ...REVISADAS,
    voz: { id: 'czvzJwIVS2asEKnthV40', nome: 'Daniel - Brazilian Conversational Voice' },
  })

  expect(partes.find((parte) => parte.parte === 'voz')).toMatchObject({
    estado: 'aplicado',
    itens: [{ chave: 'voz', valor: 'Daniel' }],
  })
  expect(servico.escolhas).toEqual([{ vozId: 'czvzJwIVS2asEKnthV40', ajustes: {} }])
})

describe('o que a revisão cobra antes de aplicar', () => {
  const SEM_CONTEXTO = { empresa: '', descricao: '', bomCliente: '' }

  it('pela conversa, sem formulário, a empresa vem da sugestão da IA', () => {
    const identidade = identidadeSugerida(null, {
      contexto: SEM_CONTEXTO,
      sugestoes: [],
      valores: { 'identidade.empresa': 'Aurora Energia', 'identidade.nome_do_agente': 'Sarah' },
      respostas: {},
    })
    expect(identidade?.empresa).toBe('Aurora Energia')
  })

  it('os obrigatórios aparecem mesmo quando o modelo não os devolveu', () => {
    const etapas = completarObrigatorios(
      [{ etapa: 'identidade', campos: [{ campo: 'oferta', valor: 'Energia solar.', porque: '' }], perguntas: [] }],
      SEM_CONTEXTO,
    )
    const chaves = etapas.flatMap((etapa) => etapa.campos.map((campo) => `${etapa.etapa}.${campo.campo}`))
    for (const obrigatorio of CAMPOS_OBRIGATORIOS) expect(chaves).toContain(obrigatorio)
    expect(etapas[0]?.campos[0]?.campo).toBe('empresa')
    // Sem nome gravado, o campo do nome aparece em branco, sem nome de fábrica.
    expect(etapas[0]?.campos.find((campo) => campo.campo === 'nome_do_agente')?.valor).toBe('')
  })

  it('com o nome gravado, a revisão não mostra nem cobra o nome', () => {
    const etapas = completarObrigatorios(
      [
        {
          etapa: 'identidade',
          campos: [{ campo: 'nome_do_agente', valor: 'Sarah', porque: '' }],
          perguntas: [],
        },
      ],
      SEM_CONTEXTO,
      'Ana',
    )
    const chaves = etapas.flatMap((etapa) => etapa.campos.map((campo) => `${etapa.etapa}.${campo.campo}`))
    expect(chaves).not.toContain('identidade.nome_do_agente')
    expect(faltaParaAplicar({}, 'Ana')).not.toContain('identidade.nome_do_agente')
    expect(faltaParaAplicar({})).toContain('identidade.nome_do_agente')
  })

  it('falta o que está em branco, e nada quando tudo foi preenchido', () => {
    expect(faltaParaAplicar({ 'identidade.nome_do_agente': 'Sarah' })).toEqual([
      'identidade.empresa',
      'identidade.primeira_fala',
      'roteiro.roteiro_de_descoberta',
    ])
    expect(
      faltaParaAplicar({
        'identidade.empresa': 'Aurora',
        'identidade.nome_do_agente': 'Sarah',
        'identidade.primeira_fala': 'Oi!',
        'roteiro.roteiro_de_descoberta': 'Pergunte a conta de luz.',
      }),
    ).toEqual([])
  })
})
