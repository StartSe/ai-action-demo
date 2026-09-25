// Provas do compilador do agente. Ambiente node, sem rede e sem banco: o
// compilador é função pura das suas entradas, e é isso que se mede aqui.
//
// O que este arquivo segura, e por que prosa não seguraria nenhuma:
//
// 1. **O hash é estável e é sensível.** Estável porque `voice_settings` chega
//    como `jsonb` e `jsonb` não promete ordem de chave: sem ordenar, a mesma
//    conta daria dois hashes em duas leituras e a tela diria "alterações
//    pendentes" sem ninguém ter mudado nada. Sensível porque um hash que não
//    muda com a voz nem com o roteiro não responde a pergunta que ele existe
//    para responder.
// 2. **Nenhuma ferramenta de agenda na fatia publicada** (O-06, RF-309). A varredura é por
//    nome e vem do próprio catálogo: acrescentar `tool-availability` ao
//    conjunto de descoberta cai aqui, e é a regressão que a história manda
//    rodar.
// 3. **Gravação desligada desliga a retenção** (L-18). Sem isso o provedor
//    grava com o controle desligado e o cliente acredita o contrário.
// 4. **Os três estados de RF-311** saem certos, inclusive o caso que engana:
//    três propósitos publicados e um em falha não é "publicado".

import { describe, expect, test } from 'vitest'

import { pareceHashEmHexadecimal } from '../hash-de-segredo.ts'
import { ROTEIRO_DE_DESCOBERTA_PROVISORIO } from '../playbook/roteiro-de-descoberta.ts'
import {
  CATALOGO_DE_VARIANTES,
  FECHAMENTO_DE_DESCOBERTA,
  PROPOSITOS,
  REGRA_DA_QUALIFICACAO,
  REGRAS_DA_CASA,
  VARIANTES,
  VERSAO_DA_CAMADA_UM,
  escolherVariante,
  type Proposito,
} from '../playbook/camada-um.ts'
import {
  CATALOGO_DE_FERRAMENTAS,
  DESCRICOES_DAS_FERRAMENTAS,
  DESTINO_DA_TRANSFERENCIA,
  FATIA_PUBLICADA,
  FATIAS,
  FERRAMENTAS_DE_SISTEMA,
  PRAZO_DE_FERRAMENTA_SEGUNDOS,
  VARIAVEIS_DA_CHAMADA,
  compilarPublicacao,
  criteriosDoProposito,
  estadoDePublicacao,
  primeiraFalaPublicada,
  propositosNoAr,
  ferramentasDeSistemaDaFatia,
  ferramentasDoProposito,
  ferramentasPrevistasDoProposito,
  serializarParaHash,
  type Fatia,
  type HashPorProposito,
  type PedidoDeCompilacao,
  type PublicacaoRegistrada,
} from './compilador.ts'

/**
 * As ferramentas que dependem de agenda, tiradas do catálogo e não de uma lista
 * escrita à mão aqui: ferramenta de agenda nova entra na varredura sozinha, que
 * é o único jeito de a varredura continuar valendo depois da F5.
 *
 * O crivo é `dependeDeAgenda` e não `entraNa`, e a diferença é o que a
 * regressão da história encontra: com o crivo pela fatia, mover
 * `tool-availability` para a F2 a tiraria da lista de agenda no mesmo gesto em
 * que a põe na publicação, e a varredura ficaria verde exatamente no caso que
 * ela existe para pegar.
 */
const FERRAMENTAS_DE_AGENDA = CATALOGO_DE_FERRAMENTAS.filter(
  (ferramenta) => ferramenta.dependeDeAgenda,
).map((ferramenta) => ferramenta.nome)

function pedido(ajustes: Partial<PedidoDeCompilacao> = {}): PedidoDeCompilacao {
  return {
    proposito: 'discovery',
    identidade: {
      nome: 'Sarah',
      empresa: 'Fábrica de Parafusos',
      oferta: 'linha de parafusos sob medida',
      nuncaAfirmar: ['prazo de entrega', 'desconto'],
      vozId: 'voz-pt-br-1',
      ajustesDeVoz: { estabilidade: 0.6, velocidade: 1 },
      primeiraFala: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
    },
    playbookPublicado: {
      playbookVersionId: '11111111-1111-4111-8111-111111111111',
      versao: 3,
      camadaDois: 'Levante a dor de estoque parado.',
      camadaTres: 'A casa trata todo mundo por você.',
    },
    politica: {
      duracaoMaximaSegundos: 600,
      gravacaoLigada: true,
      avisoDeGravacao: null,
      retencaoDias: 90,
    },
    ...ajustes,
  }
}

describe('o conjunto de ferramentas por propósito', () => {
  test('na F3 é tool-transfer e tool-dnc nos quatro propósitos', () => {
    expect(FATIA_PUBLICADA).toBe('F3')
    for (const proposito of PROPOSITOS) {
      expect(ferramentasDoProposito(proposito)).toEqual(['tool-transfer', 'tool-dnc'])
      // O que a F2 publicou: nada nosso.
      expect(ferramentasDoProposito(proposito, 'F2')).toEqual([])
    }
  })

  test('toda ferramenta nossa que entra na fatia publicada tem descrição e campos', () => {
    const noAr = new Set(PROPOSITOS.flatMap((proposito) => ferramentasDoProposito(proposito)))
    for (const nome of noAr) {
      const descricao = DESCRICOES_DAS_FERRAMENTAS.get(nome)
      expect({ nome, descrita: descricao !== undefined }).toEqual({ nome, descrita: true })
      expect(descricao?.campos.some((campo) => campo.obrigatorio)).toBe(true)
    }
  })

  test('todas as fatias compilam, porque nenhuma ferramenta do catálogo está sem descrição', async () => {
    // Ferramenta sem descrição faria a compilação levantar: publicada sem corpo
    // declarado, receberia pedido sem os campos e responderia 400 sempre.
    for (const ferramenta of CATALOGO_DE_FERRAMENTAS) {
      expect({ nome: ferramenta.nome, descrita: DESCRICOES_DAS_FERRAMENTAS.has(ferramenta.nome) }).toEqual({
        nome: ferramenta.nome,
        descrita: true,
      })
    }
    // A F4 compila, porque tool-qualify traz a descrição no descritor, e a F5
    // também, com as descrições de tool-availability e tool-book-meeting.
    await expect(compilarPublicacao(pedido({ fatia: 'F4' }))).resolves.toBeDefined()
    await expect(compilarPublicacao(pedido({ fatia: 'F5' }))).resolves.toBeDefined()
    // A F6 também: tool-confirm-meeting e tool-reschedule chegaram com a
    // descrição (US-195, US-196).
    await expect(compilarPublicacao(pedido({ proposito: 'reminder', fatia: 'F6' }))).resolves.toBeDefined()
    await expect(compilarPublicacao(pedido({ proposito: 'rescue', fatia: 'F6' }))).resolves.toBeDefined()
  })

  test('cada propósito tem o seu conjunto previsto, e eles não são um só', () => {
    const previstos = new Map<Proposito, readonly string[]>(
      PROPOSITOS.map((proposito) => [proposito, ferramentasPrevistasDoProposito(proposito)]),
    )

    // Lembrete não qualifica e resgate não marca reunião nova: é o recorte de
    // RF-309, e é o que faz a restrição ser estrutural em vez de instrução.
    expect(previstos.get('reminder')).not.toEqual(previstos.get('discovery'))
    expect(previstos.get('rescue')).not.toEqual(previstos.get('discovery'))
    expect(previstos.get('reminder')).not.toEqual(previstos.get('rescue'))

    // Descoberta e retomada coincidem, e a igualdade é fixada de propósito: ela
    // vem da tabela da seção 5 de docs/PRD-implementacao.md, que dá as mesmas
    // ferramentas aos dois. Separá-los um dia derruba esta linha, que é onde a
    // decisão precisa ser consciente.
    expect(previstos.get('followup')).toEqual(previstos.get('discovery'))

    // Três conjuntos distintos dos quatro propósitos.
    const distintos = new Set([...previstos.values()].map((lista) => lista.join(',')))
    expect(distintos.size).toBe(3)
  })
})

describe('a configuração compilada', () => {
  test('leva as ferramentas de sistema da fatia, o prazo e a duração máxima da conta', async () => {
    const { configuracao } = await compilarPublicacao(pedido())

    expect(configuracao.ferramentas.de_sistema).toEqual([
      'end_call',
      'transfer_to_number',
      'voicemail_detection',
    ])
    expect(FERRAMENTAS_DE_SISTEMA).toEqual(['end_call', 'transfer_to_number', 'voicemail_detection'])
    expect(configuracao.ferramentas.prazo_de_resposta_seg).toBe(PRAZO_DE_FERRAMENTA_SEGUNDOS)
    expect(PRAZO_DE_FERRAMENTA_SEGUNDOS).toBe(5)
    expect(configuracao.chamada.duracao_maxima_seg).toBe(600)
  })

  test('o agente busca o contexto no webhook de início, e isso é nosso: entra no hash', async () => {
    const { configuracao } = await compilarPublicacao(pedido())
    expect(configuracao.chamada.contexto_no_inicio).toBe(true)
  })

  test('transfer_to_number esperou a F3, junto de tool-transfer, e as outras duas vêm da F2', () => {
    // Na F2 ela exigiria destino fixo, e declarada pela metade o provedor
    // recusa o corpo inteiro com 422.
    expect(ferramentasDeSistemaDaFatia('F2')).toEqual(['end_call', 'voicemail_detection'])
    for (const fatia of FATIAS.slice(1)) {
      expect(ferramentasDeSistemaDaFatia(fatia)).toEqual([...FERRAMENTAS_DE_SISTEMA])
    }
  })

  test.each([...PROPOSITOS])('em %s a transferência vai sem número fixo, lida da resposta de tool-transfer', async (proposito) => {
    const { configuracao } = await compilarPublicacao(pedido({ proposito }))

    expect(configuracao.ferramentas.transferencia).toEqual(DESTINO_DA_TRANSFERENCIA)
    expect(DESTINO_DA_TRANSFERENCIA.ferramenta).toBe('tool-transfer')
    expect(configuracao.ferramentas.nossas.map((f) => f.nome)).toContain(DESTINO_DA_TRANSFERENCIA.ferramenta)
    // Nenhum telefone em lugar nenhum da configuração.
    expect(serializarParaHash(configuracao)).not.toMatch(/\+\d{10,}/)

    const daF2 = await compilarPublicacao(pedido({ proposito, fatia: 'F2' }))
    expect(daF2.configuracao.ferramentas.transferencia).toBeNull()
  })

  test('leva a versão da camada 1 e o id da versão do playbook (RF-308)', async () => {
    const { configuracao } = await compilarPublicacao(pedido())

    expect(configuracao.playbook.camada_um_versao).toBe(VERSAO_DA_CAMADA_UM)
    expect(configuracao.playbook.camada_um_variante).toBe('sem_agenda')
    expect(configuracao.playbook.playbook_version_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(configuracao.playbook.playbook_versao).toBe(3)
  })

  test('monta as três camadas na ordem e substitui os marcadores da conta', async () => {
    const { configuracao } = await compilarPublicacao(pedido())
    const prompt = configuracao.playbook.prompt

    const camadaUm = prompt.indexOf('# Regras da casa')
    const camadaDois = prompt.indexOf('Levante a dor de estoque parado.')
    const camadaTres = prompt.indexOf('A casa trata todo mundo por você.')
    expect(camadaUm).toBeGreaterThanOrEqual(0)
    expect(camadaDois).toBeGreaterThan(camadaUm)
    expect(camadaTres).toBeGreaterThan(camadaDois)

    expect(prompt).toContain('prazo de entrega; desconto')
    expect(prompt).not.toContain('{nunca_afirmar}')
    expect(prompt).not.toContain('{empresa}')
    // O nome do lead fica como variável da chamada: quem o preenche é a
    // abertura da conversa. Congelado aqui, a Sarah chamaria todo mundo pelo
    // mesmo nome. A tradução do provedor o passa para `{{nome_do_lead}}`.
    expect(prompt).toContain('{nome_do_lead}')
    expect(prompt).toContain('# Dados desta ligação')
    expect(configuracao.chamada.variaveis).toEqual([...VARIAVEIS_DA_CHAMADA])
    // Na primeira fala publicada o marcador sai: é ela que o provedor diz se o
    // call-init não for chamado, e o marcador seria lido em voz alta. O nome
    // entra pelo call-init, que a substitui no começo da conversa.
    expect(configuracao.chamada.primeira_fala).not.toContain('{nome_do_lead}')
    expect(configuracao.chamada.primeira_fala).toContain('Fábrica de Parafusos')
  })

  test('usa o aviso de gravação da conta quando ela escreveu o seu', async () => {
    const semTexto = await compilarPublicacao(pedido())
    expect(semTexto.configuracao.chamada.aviso_de_gravacao).toContain('essa ligação é gravada')

    const comTexto = await compilarPublicacao(
      pedido({
        politica: {
          duracaoMaximaSegundos: 600,
          gravacaoLigada: true,
          avisoDeGravacao: 'Aqui é a {nome_do_agente}, e a ligação é gravada.',
          retencaoDias: 90,
        },
      }),
    )
    expect(comTexto.configuracao.chamada.aviso_de_gravacao).toBe(
      'Aqui é a Sarah, e a ligação é gravada.',
    )
  })

  test('deixa a camada 3 de fora quando a conta não escreveu nenhuma', async () => {
    const { configuracao } = await compilarPublicacao(
      pedido({
        playbookPublicado: {
          playbookVersionId: '11111111-1111-4111-8111-111111111111',
          versao: 3,
          camadaDois: 'Levante a dor de estoque parado.',
          camadaTres: '   ',
        },
      }),
    )
    expect(configuracao.playbook.prompt).not.toContain('Jeito da casa')
  })

  test('traz os critérios de avaliação, com o do fechamento sem promessa', async () => {
    const { configuracao } = await compilarPublicacao(pedido())
    const chaves = configuracao.avaliacao.map((criterio) => criterio.chave)

    expect(chaves).toContain('aviso_gravacao')
    expect(chaves).toContain('fechamento_sem_promessa')
    expect(chaves).not.toContain('fechamento_com_horario')

    // Lembrete não fecha descoberta: o critério do fechamento não entra nele.
    const lembrete = criteriosDoProposito('reminder', 'sem_agenda', false).map(
      (criterio) => criterio.chave,
    )
    expect(lembrete).not.toContain('fechamento_sem_promessa')
  })
})

describe('as três regras da F3 nas quatro publicações', () => {
  // Não perturbe, pedido de humano e pessoa errada valem em todo propósito
  // (docs/PRD.md seção 9). O que se cobra é o prompt compilado, que é o que vai
  // ao ar, e não a constante: um compilador que montasse a camada 1 de outro
  // jeito passaria pela prova da constante e publicaria sem os blocos.
  test.each([...PROPOSITOS])('o prompt de %s leva os três blocos e as falas deles', async (proposito) => {
    const { configuracao } = await compilarPublicacao(pedido({ proposito }))
    const prompt = configuracao.playbook.prompt

    for (const chave of ['nao_perturbe', 'pedido_de_humano', 'pessoa_errada']) {
      const regra = REGRAS_DA_CASA.find((candidata) => candidata.chave === chave)
      expect(regra, `regra ${chave} sumiu da camada 1`).toBeDefined()
      expect(prompt).toContain(`## ${chave} (`)
      expect(prompt).toContain(regra?.instrucao)
      for (const fala of regra?.falas ?? []) expect(prompt).toContain(fala)
    }
  })

  test('cada regra travada tem critério de avaliação que a confere', () => {
    // Regra sem critério é instrução que ninguém audita.
    const requisitosDosCriterios = new Set(
      criteriosDoProposito('reminder', 'sem_agenda', false).flatMap((criterio) => criterio.requisitos),
    )
    for (const regra of REGRAS_DA_CASA) {
      expect(
        regra.requisitos.some((requisito) => requisitosDosCriterios.has(requisito)),
        `${regra.chave} sem critério`,
      ).toBe(true)
    }
  })
})

describe('nenhuma publicação da fatia publicada conhece agenda (O-06)', () => {
  test('a varredura por nome não acha ferramenta de agenda em nenhum dos quatro', async () => {
    expect(FERRAMENTAS_DE_AGENDA.length).toBeGreaterThan(0)

    for (const proposito of PROPOSITOS) {
      const { configuracao } = await compilarPublicacao(pedido({ proposito }))
      const serializada = serializarParaHash(configuracao)

      expect(configuracao.ferramentas.nossas.map((f) => f.nome)).toEqual(['tool-transfer', 'tool-dnc'])
      for (const ferramenta of FERRAMENTAS_DE_AGENDA) {
        expect(serializada).not.toContain(ferramenta)
      }
      expect(configuracao.playbook.camada_um_variante).toBe('sem_agenda')
    }
  })
})

describe('a agenda na F5: descoberta e retomada, e só elas (US-174, RF-309)', () => {
  /**
   * O conjunto da F5 por propósito, em dado. Lembrete e resgate seguem sem
   * agenda: `tool-confirm-meeting` e `tool-reschedule` são da F6, e a
   * `tool-availability` deles chega junto com a remarcação.
   */
  const NA_F5: Readonly<Record<Proposito, readonly string[]>> = {
    discovery: ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting'],
    reminder: ['tool-transfer', 'tool-dnc'],
    rescue: ['tool-transfer', 'tool-dnc', 'tool-qualify'],
    followup: ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting'],
  }

  test.each([...PROPOSITOS])('%s na F5 leva exatamente o conjunto esperado', async (proposito) => {
    expect(ferramentasDoProposito(proposito, 'F5')).toEqual(NA_F5[proposito])
    const { configuracao } = await compilarPublicacao(pedido({ proposito, fatia: 'F5' }))
    expect(configuracao.ferramentas.nossas.map((f) => f.nome)).toEqual(NA_F5[proposito])
  })

  test.each(['reminder', 'rescue'] as const)('%s na F5 não conhece ferramenta de agenda nenhuma', async (proposito) => {
    const serializada = serializarParaHash((await compilarPublicacao(pedido({ proposito, fatia: 'F5' }))).configuracao)
    for (const ferramenta of FERRAMENTAS_DE_AGENDA) expect(serializada).not.toContain(ferramenta)
  })

  test('toda ferramenta nossa da F5 tem descrição, e a marcação cobra posição e modalidade', () => {
    for (const nome of new Set(Object.values(NA_F5).flat())) {
      expect({ nome, descrita: DESCRICOES_DAS_FERRAMENTAS.has(nome) }).toEqual({ nome, descrita: true })
    }
    const marcacao = DESCRICOES_DAS_FERRAMENTAS.get('tool-book-meeting')
    // Os mesmos obrigatórios de `criarToolBookMeeting`: publicada sem eles, a
    // ferramenta responderia campo faltante em toda marcação.
    expect(marcacao?.campos.filter((campo) => campo.obrigatorio).map((campo) => campo.chave)).toEqual([
      'slot_position',
      'modality',
    ])
    expect(marcacao?.campos.find((campo) => campo.chave === 'modality')?.valores).toEqual([
      'video',
      'telefone',
      'presencial',
    ])
  })

  test('o prazo das ferramentas novas é 5 s explícito, e não o padrão do provedor (P-01)', async () => {
    const { configuracao } = await compilarPublicacao(pedido({ fatia: 'F5' }))
    expect(configuracao.ferramentas.prazo_de_resposta_seg).toBe(5)
  })

  test('a descoberta na F5 fecha com horário, e o texto sem agenda não vai ao ar (O-06)', async () => {
    const { configuracao } = await compilarPublicacao(pedido({ fatia: 'F5' }))
    const prompt = configuracao.playbook.prompt

    expect(configuracao.playbook.camada_um_variante).toBe('com_agenda')
    // Marcador que não é variável da chamada vai ao ar como vaga legível
    // (`{opcao_um}` → `[opcao um]`), como no resto do prompt.
    const noAr = (fala: string) =>
      fala.replace(/\{([a-z0-9_]+)\}/g, (original, chave: string) =>
        (VARIAVEIS_DA_CHAMADA as readonly string[]).includes(chave) ? original : `[${chave.replace(/_+/g, ' ')}]`,
      )
    expect(prompt).toContain(FECHAMENTO_DE_DESCOBERTA.com_agenda.instrucao)
    for (const fala of FECHAMENTO_DE_DESCOBERTA.com_agenda.falas) expect(prompt).toContain(noAr(fala))
    expect(prompt).not.toContain(FECHAMENTO_DE_DESCOBERTA.sem_agenda.instrucao)
    for (const fala of FECHAMENTO_DE_DESCOBERTA.sem_agenda.falas) {
      // A primeira fala é comum às duas variantes.
      if (FECHAMENTO_DE_DESCOBERTA.com_agenda.falas.includes(fala)) continue
      expect(prompt).not.toContain(noAr(fala))
    }

    const chaves = configuracao.avaliacao.map((criterio) => criterio.chave)
    expect(chaves).toContain('fechamento_com_horario')
    expect(chaves).not.toContain('fechamento_sem_promessa')
  })

  test('o catálogo das variantes concorda com a escolha em toda fatia', () => {
    // Registro que não se confere envelhece: a variante aposentada tem que ser
    // exatamente a que a descoberta escolhia da F2 à F4, e nenhuma fatia depois
    // dela pode voltar a escolhê-la.
    const indice = (fatia: Fatia) => FATIAS.indexOf(fatia)
    for (const fatia of FATIAS) {
      const escolhida = escolherVariante(ferramentasDoProposito('discovery', fatia))
      const registro = CATALOGO_DE_VARIANTES[escolhida]
      expect({ fatia, dentro: indice(fatia) >= indice(registro.primeiraFatia) }).toEqual({ fatia, dentro: true })
      if (registro.ultimaFatia !== null) {
        expect({ fatia, dentro: indice(fatia) <= indice(registro.ultimaFatia) }).toEqual({ fatia, dentro: true })
      }
    }

    expect(CATALOGO_DE_VARIANTES.sem_agenda).toMatchObject({
      estado: 'aposentada',
      primeiraFatia: 'F2',
      ultimaFatia: 'F4',
    })
    expect(CATALOGO_DE_VARIANTES.sem_agenda.motivo).toContain('O-06')
    expect(CATALOGO_DE_VARIANTES.com_agenda).toMatchObject({ estado: 'em_uso', ultimaFatia: null })
    // Uma variante só em uso por vez.
    expect(VARIANTES.filter((variante) => CATALOGO_DE_VARIANTES[variante].estado === 'em_uso')).toEqual([
      'com_agenda',
    ])
  })

  test('acrescentar as ferramentas muda o hash das duas publicações que as recebem, e só delas (RF-313)', async () => {
    for (const proposito of PROPOSITOS) {
      const daF4 = await compilarPublicacao(pedido({ proposito, fatia: 'F4' }))
      const daF5 = await compilarPublicacao(pedido({ proposito, fatia: 'F5' }))
      const recebe = NA_F5[proposito].includes('tool-availability')
      expect({ proposito, mudou: daF5.publishedHash !== daF4.publishedHash }).toEqual({ proposito, mudou: recebe })
    }
  })
})

describe('o published_hash', () => {
  test('é sha-256 em hexadecimal', async () => {
    const { publishedHash } = await compilarPublicacao(pedido())
    expect(pareceHashEmHexadecimal(publishedHash)).toBe(true)
  })

  test('é o mesmo para o mesmo dado, ainda que o jsonb chegue em outra ordem', async () => {
    const primeira = await compilarPublicacao(
      pedido({
        identidade: {
          ...pedido().identidade,
          ajustesDeVoz: { estabilidade: 0.6, velocidade: 1, estilo: { a: 1, b: 2 } },
        },
      }),
    )
    const segunda = await compilarPublicacao(
      pedido({
        identidade: {
          ...pedido().identidade,
          ajustesDeVoz: { estilo: { b: 2, a: 1 }, velocidade: 1, estabilidade: 0.6 },
        },
      }),
    )

    expect(segunda.publishedHash).toBe(primeira.publishedHash)
  })

  test('muda quando a voz muda', async () => {
    const antes = await compilarPublicacao(pedido())
    const depois = await compilarPublicacao(
      pedido({ identidade: { ...pedido().identidade, vozId: 'voz-pt-br-2' } }),
    )
    expect(depois.publishedHash).not.toBe(antes.publishedHash)

    const outroAjuste = await compilarPublicacao(
      pedido({ identidade: { ...pedido().identidade, ajustesDeVoz: { estabilidade: 0.9 } } }),
    )
    expect(outroAjuste.publishedHash).not.toBe(antes.publishedHash)
  })

  test('muda quando a camada 2 muda', async () => {
    const antes = await compilarPublicacao(pedido())
    const depois = await compilarPublicacao(
      pedido({
        playbookPublicado: {
          ...pedido().playbookPublicado,
          camadaDois: 'Levante a dor de estoque parado e confirme o interesse.',
        },
      }),
    )
    expect(depois.publishedHash).not.toBe(antes.publishedHash)
  })

  test('muda quando a lista de ferramentas muda: o que foi ao ar na F2 fica com alterações pendentes (RF-311)', async () => {
    const hashes = async (fatia?: 'F2') => {
      const porProposito: Record<string, string> = {}
      for (const proposito of PROPOSITOS) {
        porProposito[proposito] = (await compilarPublicacao(pedido({ proposito, fatia }))).publishedHash
      }
      return porProposito as HashPorProposito
    }
    const daF2 = await hashes('F2')
    const daF3 = await hashes()

    for (const proposito of PROPOSITOS) expect(daF3[proposito]).not.toBe(daF2[proposito])

    const noArDaF2: PublicacaoRegistrada[] = PROPOSITOS.map((proposito) => ({
      purpose: proposito,
      status: 'publicado',
      published_hash: daF2[proposito],
    }))
    expect(estadoDePublicacao(daF2, noArDaF2)).toBe('publicado')
    expect(estadoDePublicacao(daF3, noArDaF2)).toBe('alteracoes_pendentes')
  })

  test('muda quando só a descrição de uma ferramenta muda', async () => {
    const { configuracao } = await compilarPublicacao(pedido())
    const outra = {
      ...configuracao,
      ferramentas: {
        ...configuracao.ferramentas,
        nossas: configuracao.ferramentas.nossas.map((f) =>
          f.nome === 'tool-dnc' ? { ...f, descricao: `${f.descricao} Sem pressa.` } : f,
        ),
      },
    }
    expect(serializarParaHash(outra)).not.toBe(serializarParaHash(configuracao))
  })

  test('difere entre os quatro propósitos', async () => {
    const hashes = new Set<string>()
    for (const proposito of PROPOSITOS) {
      hashes.add((await compilarPublicacao(pedido({ proposito }))).publishedHash)
    }
    expect(hashes.size).toBe(PROPOSITOS.length)
  })
})

describe('a gravação desligada (L-18)', () => {
  test('desliga a retenção de áudio na publicação', async () => {
    const ligada = await compilarPublicacao(pedido())
    expect(ligada.configuracao.privacidade.reter_audio).toBe(true)

    const desligada = await compilarPublicacao(
      pedido({
        politica: {
          duracaoMaximaSegundos: 600,
          gravacaoLigada: false,
          avisoDeGravacao: null,
          retencaoDias: 90,
        },
      }),
    )
    expect(desligada.configuracao.privacidade.reter_audio).toBe(false)
    expect(desligada.publishedHash).not.toBe(ligada.publishedHash)
  })
})

describe('o estado da publicação (RF-311)', () => {
  const hashes: HashPorProposito = {
    discovery: 'a'.repeat(64),
    reminder: 'b'.repeat(64),
    rescue: 'c'.repeat(64),
    followup: 'd'.repeat(64),
  }

  function noAr(sobrescreve: Partial<Record<Proposito, PublicacaoRegistrada>> = {}) {
    return PROPOSITOS.map(
      (proposito): PublicacaoRegistrada =>
        sobrescreve[proposito] ?? {
          purpose: proposito,
          status: 'publicado',
          published_hash: hashes[proposito],
        },
    )
  }

  test('rascunho quando nada foi ao ar', () => {
    expect(estadoDePublicacao(hashes, [])).toBe('rascunho')
    expect(
      estadoDePublicacao(
        hashes,
        PROPOSITOS.map((proposito) => ({
          purpose: proposito,
          status: 'pendente',
          published_hash: null,
        })),
      ),
    ).toBe('rascunho')
  })

  test('publicado quando os quatro estão no ar com o hash certo', () => {
    expect(estadoDePublicacao(hashes, noAr())).toBe('publicado')
  })

  test('alterações pendentes quando um hash diverge', () => {
    const divergente = noAr({
      rescue: { purpose: 'rescue', status: 'publicado', published_hash: 'e'.repeat(64) },
    })
    expect(estadoDePublicacao(hashes, divergente)).toBe('alteracoes_pendentes')
  })

  test('alterações pendentes quando um propósito falhou e os outros três foram', () => {
    const comFalha = noAr({
      followup: { purpose: 'followup', status: 'falha', published_hash: null },
    })
    expect(estadoDePublicacao(hashes, comFalha)).toBe('alteracoes_pendentes')
  })
})

describe('propositosNoAr', () => {
  const hashes = { discovery: 'a'.repeat(64), reminder: '', rescue: '', followup: '' }

  test('só a descoberta no ar, com o hash de agora, é a descoberta', () => {
    expect(
      propositosNoAr(hashes, [{ purpose: 'discovery', status: 'publicado', published_hash: 'a'.repeat(64) }]),
    ).toEqual(['discovery'])
  })

  test('hash antigo, falha e propósito sem roteiro não contam', () => {
    expect(
      propositosNoAr(hashes, [
        { purpose: 'discovery', status: 'publicado', published_hash: 'b'.repeat(64) },
        { purpose: 'reminder', status: 'falha', published_hash: null },
      ]),
    ).toEqual([])
  })
})

describe('primeiraFalaPublicada', () => {
  const valores = { nome_do_agente: 'Yasmin', empresa: 'iPhone pra Max' }

  test('tira o nome do lead e refaz a frase em volta, e resolve o que é da conta', () => {
    expect(
      primeiraFalaPublicada(
        'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, assistente virtual da {empresa}.',
        valores,
      ),
    ).toBe('Oi! Aqui é a Yasmin, assistente virtual da iPhone pra Max.')
  })

  test('nome do lead no meio da frase também sai sem deixar buraco', () => {
    expect(primeiraFalaPublicada('Tudo bem, {nome_do_lead}? Aqui é a {nome_do_agente}.', valores)).toBe(
      'Tudo bem? Aqui é a Yasmin.',
    )
  })
})

describe('os marcadores no prompt', () => {
  test('a forma dupla escrita pela conta vira a nossa, e marcador desconhecido vira vaga legível', async () => {
    const { configuracao } = await compilarPublicacao(
      pedido({
        playbookPublicado: {
          playbookVersionId: '11111111-1111-4111-8111-111111111111',
          versao: 3,
          camadaDois: 'Chame {{nome_do_lead}} pelo nome e pergunte o {cargo_do_lead}. {{inventada}}',
          camadaTres: '',
        },
      }),
    )
    const prompt = configuracao.playbook.prompt
    expect(prompt).toContain('Chame {nome_do_lead} pelo nome e pergunte o [cargo do lead]. [inventada]')
    expect(prompt).not.toContain('{{')
  })

  test('o aviso de gravação publicado não leva o marcador do lead', async () => {
    const { configuracao } = await compilarPublicacao(pedido())
    expect(configuracao.chamada.aviso_de_gravacao).not.toMatch(/[{}]/)
    expect(configuracao.chamada.aviso_de_gravacao).toMatch(/^Oi\? Aqui é a Sarah/)
  })

  test('a preposição que apresentava o marcador vazio sai com ele', () => {
    expect(
      primeiraFalaPublicada('Oi, {nome_do_lead}, da {empresa_do_lead}? Aqui é a {nome_do_agente}.', {
        nome_do_agente: 'Sarah',
      }),
    ).toBe('Oi? Aqui é a Sarah.')
  })
})

describe('a qualificação obrigatória em descoberta (US-138)', () => {
  // A compilação das três camadas é função pura: com a F4, a camada 1 de
  // descoberta leva a regra da qualificação, a camada 2 é o roteiro provisório
  // e a camada 3 é o jeito da casa, nessa ordem.
  const comRoteiroProvisorio = (ajustes: Partial<PedidoDeCompilacao> = {}) =>
    pedido({
      playbookPublicado: {
        playbookVersionId: '11111111-1111-4111-8111-111111111111',
        versao: 3,
        camadaDois: ROTEIRO_DE_DESCOBERTA_PROVISORIO,
        camadaTres: 'A casa trata todo mundo por você.',
      },
      ...ajustes,
    })

  test('na F4 o prompt de descoberta monta as três camadas em ordem, com a regra antes do roteiro', async () => {
    const { configuracao } = await compilarPublicacao(comRoteiroProvisorio({ fatia: 'F4' }))
    const prompt = configuracao.playbook.prompt

    const regra = prompt.indexOf(`## ${REGRA_DA_QUALIFICACAO.chave} (`)
    const roteiro = prompt.indexOf('# Roteiro do propósito (camada 2)')
    const jeito = prompt.indexOf('# Jeito da casa (camada 3)')
    expect(regra).toBeGreaterThan(0)
    expect(roteiro).toBeGreaterThan(regra)
    expect(jeito).toBeGreaterThan(roteiro)
    expect(prompt).toContain(ROTEIRO_DE_DESCOBERTA_PROVISORIO)

    expect(configuracao.ferramentas.nossas.map((f) => f.nome)).toContain('tool-qualify')
    expect(configuracao.avaliacao.map((c) => c.chave)).toContain('qualificacao_registrada')
  })

  test('na fatia publicada, sem tool-qualify, nem a regra nem o critério entram', async () => {
    const { configuracao } = await compilarPublicacao(comRoteiroProvisorio())
    expect(configuracao.playbook.prompt).not.toContain(REGRA_DA_QUALIFICACAO.chave)
    expect(configuracao.avaliacao.map((c) => c.chave)).not.toContain('qualificacao_registrada')
  })

  test.each(PROPOSITOS.filter((p) => p !== 'discovery'))(
    'na F4, %s não leva a regra nem o critério',
    async (proposito) => {
      const { configuracao } = await compilarPublicacao(pedido({ proposito, fatia: 'F4' }))
      expect(configuracao.playbook.prompt).not.toContain(REGRA_DA_QUALIFICACAO.chave)
      expect(configuracao.avaliacao.map((c) => c.chave)).not.toContain('qualificacao_registrada')
    },
  )

  test('a regra da qualificação tem critério que a confere', () => {
    const requisitos = new Set(
      criteriosDoProposito('discovery', 'sem_agenda', true).flatMap((c) => c.requisitos),
    )
    expect(REGRA_DA_QUALIFICACAO.requisitos.some((r) => requisitos.has(r))).toBe(true)
    expect(criteriosDoProposito('discovery', 'sem_agenda', true).map((c) => c.chave)).toContain(
      'qualificacao_registrada',
    )
  })
})
