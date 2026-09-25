// O compilador do agente: o que vai ao provedor de voz, e o hash do que foi.
//
// **A suposição de T-01, declarada.** Este módulo compila **uma configuração
// por propósito**, porque `docs/decisao-do-agente.md` decidiu publicar a Sarah
// quatro vezes no provedor, uma para cada conjunto de ferramentas. A decisão
// está com `**Estado:** assumida-nao-verificada`: quem a verifica é
// `scripts/sonda-de-publicacao.ts`, no degrau 3, e até ela rodar o que sustenta
// o modelo é a documentação do provedor, que lista prompt, primeira fala,
// idioma e voz como sobrescrevíveis pelo webhook de início e **não** lista o
// conjunto de ferramentas.
//
// Se a sonda derrubar a suposição, este arquivo quase não muda: o que muda é
// quem o chama. `compilarPublicacao` continua recebendo um propósito e
// devolvendo a configuração daquele conjunto de ferramentas; o que deixa de
// existir são as quatro linhas de `agent_publications`, e a compilação passa a
// acontecer por chamada, no `call-init`. `estadoDePublicacao` é a única função
// daqui que precisaria encolher para um hash só. O resto — catálogo por
// propósito, marcadores, prazo explícito, retenção — vale nos dois mundos.
//
// **Por que o hash existe.** `published_hash` responde "o que está no ar é o
// que está no banco?" por propósito (RF-311). Ele cobre **só os campos que nós
// controlamos** (R-06): a configuração abaixo é inteiramente nossa, e nada do
// que o provedor devolve na resposta da publicação entra na serialização. Campo
// novo do lado deles não pode fazer as quatro publicações parecerem
// desatualizadas de um dia para o outro.
//
// Módulo portável (`_shared/`): sem `Deno`, sem rede, sem banco e sem relógio.
// `crypto.subtle` é Web Crypto, e existe nos dois lados.

import { MODALIDADES_DA_REUNIAO } from '../agenda/modalidades.ts'
import {
  PRAZO_DE_FERRAMENTA_SEGUNDOS,
  type CampoDaFerramenta,
  type DescricaoDaFerramenta,
} from '../ferramentas/descritor.ts'
import { DESCRITOR_DA_QUALIFICACAO } from '../ferramentas/tool-qualify.ts'
import { hashEmHexadecimal } from '../hash-de-segredo.ts'
import type { CriterioObjetivo, LinhaDeCriterio } from '../qualificacao/avaliacao.ts'
import {
  CHAVE_DA_QUALIFICACAO_REGISTRADA,
  CRITERIO_QUALIFICACAO_REGISTRADA,
  exigeQualificacao,
} from '../qualificacao/obrigatoriedade.ts'
import { FALAS_DE_TODO_PROPOSITO } from '../speech/todos-os-propositos.ts'
import {
  FERRAMENTA_DE_AGENDA,
  PROPOSITOS,
  VERSAO_DA_CAMADA_UM,
  compilarCamadaUm,
  escolherVariante,
  type Proposito,
  type Variante,
} from '../playbook/camada-um.ts'

/** Reexportados de `../ferramentas/descritor.ts`, onde o descritor os lê. */
export { PRAZO_DE_FERRAMENTA_SEGUNDOS, type CampoDaFerramenta, type DescricaoDaFerramenta }

// As ferramentas ---------------------------------------------------------------------

/**
 * As fatias, em ordem. É a ordem que decide o que já pode entrar numa
 * publicação: uma ferramenta entra quando a fatia que a implementa chegou, e
 * não antes.
 */
export const FATIAS = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7'] as const
export type Fatia = (typeof FATIAS)[number]

/** A fatia que está no ar. Subir este valor liga as ferramentas dela sozinho. */
export const FATIA_PUBLICADA: Fatia = 'F3'

/** Uma ferramenta nossa: quem a chama, em que propósito, e desde quando. */
export type FerramentaDoCatalogo = {
  /** O nome da função de borda, como ele viaja na publicação. */
  readonly nome: string
  /** A fatia que a implementa. Antes dela, a ferramenta não entra na publicação. */
  readonly entraNa: Fatia
  /** Os propósitos em que ela existe (docs/PRD-implementacao.md seção 5). */
  readonly propositos: readonly Proposito[]
  /**
   * A fatia em que ela chega a um propósito, quando não é `entraNa`. Existe
   * porque a seção 5 dá o alcance final e a ordem de construção chega a ele
   * por partes: `tool-availability` é de todos os propósitos, mas no lembrete
   * e no resgate ela serve à remarcação, que é da F6, e até lá esses dois
   * agentes não a têm (US-174).
   */
  readonly fatiaPorProposito?: Readonly<Partial<Record<Proposito, Fatia>>>
  /**
   * A ferramenta depende de agenda (O-06). É propriedade da ferramenta e não da
   * fatia, de propósito: a varredura que cobra "nenhuma agenda na F2" lê esta
   * coluna, e se ela lesse `entraNa` bastaria mover a ferramenta para a F2 para
   * ela sumir da própria varredura que deveria pegá-la.
   */
  readonly dependeDeAgenda: boolean
}

/**
 * O catálogo das sete ferramentas nossas, em dados (RF-309, T-01).
 *
 * É catálogo e não `switch` por uma razão que aparece no primeiro conflito: um
 * `switch` por propósito escreve a mesma ferramenta em quatro ramos, e quem
 * acrescenta um propósito ou muda o alcance de uma ferramenta precisa achar
 * todos. Aqui a ferramenta é uma linha e o alcance dela é uma lista — o teste
 * varre a lista, e a varredura que cobra "nenhuma ferramenta de agenda na F2"
 * não depende de ninguém ter lembrado de olhar o ramo certo.
 *
 * **Na F3 o conjunto que sai daqui é `tool-transfer` e `tool-dnc` nos quatro
 * propósitos**, e a camada 1 continua na variante sem agenda (O-06):
 * `escolherVariante` pergunta pelo conjunto, e nenhuma das duas é de agenda.
 * `tool-qualify` é F4, e as quatro de agenda são F5 e F6.
 *
 * **Na F5 descoberta e retomada ganham `tool-availability` e
 * `tool-book-meeting`, e só elas** (US-174, RF-309): lembrete e resgate seguem
 * sem agenda até a F6, que traz a confirmação e a remarcação. Com
 * `tool-availability` no conjunto, o fechamento de descoberta troca para a
 * variante com agenda sozinho, e a sem agenda sai de uso
 * (`CATALOGO_DE_VARIANTES`, na camada 1).
 */
export const CATALOGO_DE_FERRAMENTAS: readonly FerramentaDoCatalogo[] = [
  // F3: quem decide o destino da transferência e quem grava o bloqueio (T-02).
  { nome: 'tool-transfer', entraNa: 'F3', propositos: [...PROPOSITOS], dependeDeAgenda: false },
  { nome: 'tool-dnc', entraNa: 'F3', propositos: [...PROPOSITOS], dependeDeAgenda: false },
  // F4: a qualificação que move o funil. Os propósitos vêm do descritor, que é
  // onde o teste os confere contra a seção 5.
  {
    nome: DESCRITOR_DA_QUALIFICACAO.nome,
    entraNa: 'F4',
    propositos: DESCRITOR_DA_QUALIFICACAO.propositos,
    dependeDeAgenda: false,
  },
  // F5: a agenda. `tool-availability` é a ferramenta que liga a variante com
  // agenda da camada 1 — é ela que `FERRAMENTA_DE_AGENDA` nomeia. No lembrete
  // e no resgate ela só chega com a remarcação, na F6.
  {
    nome: FERRAMENTA_DE_AGENDA,
    entraNa: 'F5',
    propositos: [...PROPOSITOS],
    fatiaPorProposito: { reminder: 'F6', rescue: 'F6' },
    dependeDeAgenda: true,
  },
  {
    nome: 'tool-book-meeting',
    entraNa: 'F5',
    propositos: ['discovery', 'followup'],
    dependeDeAgenda: true,
  },
  // F6: o que a reunião já marcada precisa.
  { nome: 'tool-confirm-meeting', entraNa: 'F6', propositos: ['reminder'], dependeDeAgenda: true },
  {
    nome: 'tool-reschedule',
    entraNa: 'F6',
    propositos: ['reminder', 'rescue'],
    dependeDeAgenda: true,
  },
]

/**
 * As três ferramentas de sistema do provedor (T-02, T-03). Entram em todos os
 * propósitos e não têm função nossa: quem as executa é o provedor.
 *
 * `voicemail_detection` é o fechamento de T-03 e está aqui de propósito: a
 * detecção de secretária eletrônica (RF-418) é ferramenta de sistema do
 * provedor de voz, e **não** parâmetro da telefonia — quando a chamada nasce na
 * API de saída do provedor, o parâmetro da telefonia não existe. É a invocação
 * dela na transcrição que dá `answered_by = 'machine'` e `end_reason =
 * 'voicemail'` em `call-finalize`. Preferência de caixa postal gravada numa
 * coluna que nenhum despachante lê é o defeito da referência (docs/PRD.md,
 * "Detecção de secretária eletrônica morta"), e por isso aqui ela é ferramenta
 * publicada, não configuração.
 */
export const FERRAMENTAS_DE_SISTEMA = [
  'end_call',
  'transfer_to_number',
  'voicemail_detection',
] as const
export type FerramentaDeSistema = (typeof FERRAMENTAS_DE_SISTEMA)[number]

/**
 * A fatia em que cada ferramenta de sistema entra na publicação.
 *
 * `transfer_to_number` esperou a F3, e a razão apareceu na primeira publicação
 * contra o provedor de verdade: ela não é um nome solto, exige a lista de
 * transferências com destino e condição, e declarada pela metade faz o
 * provedor recusar o corpo inteiro com 422 — a conta perde a Sarah em vez de
 * perder só a transferência. O destino é a resposta de `tool-transfer`, que é
 * da F3 (T-02), e por isso as duas entram juntas.
 */
const FATIA_DA_FERRAMENTA_DE_SISTEMA: Readonly<Record<FerramentaDeSistema, Fatia>> = {
  end_call: 'F2',
  transfer_to_number: 'F3',
  voicemail_detection: 'F2',
}

/** As ferramentas de sistema que já entram na fatia dada, na ordem da lista. */
export function ferramentasDeSistemaDaFatia(
  fatia: Fatia = FATIA_PUBLICADA,
): readonly FerramentaDeSistema[] {
  return FERRAMENTAS_DE_SISTEMA.filter(
    (nome) => indiceDaFatia(FATIA_DA_FERRAMENTA_DE_SISTEMA[nome]) <= indiceDaFatia(fatia),
  )
}

/**
 * De onde `transfer_to_number` tira o destino (T-02, US-105).
 *
 * A ferramenta de sistema é declarada **sem número fixo**: o destino é o
 * `data.transfer_number` que `tool-transfer` devolve, guardado numa variável da
 * conversa e lido pela transferência. Número fixo na publicação ignoraria o
 * `agents.transfer_target` do dia, e a troca do destino só valeria depois de
 * republicar. Quem encadeia uma chamada na outra é a instrução da camada 1
 * (`pedido_de_humano`), e a condição abaixo é a mesma ordem dita à ferramenta.
 */
export const DESTINO_DA_TRANSFERENCIA = {
  ferramenta: 'tool-transfer',
  campo_da_resposta: 'data.transfer_number',
  variavel: 'transfer_number',
  condicao:
    'Somente depois de tool-transfer devolver transfer_number preenchido e de você avisar que vai transferir. Se tool-transfer devolver queued, não transfira.',
} as const

/**
 * A descrição de cada ferramenta nossa que já está no ar. É instrução ao
 * modelo, e por isso entra na configuração e no hash: mudar um campo aqui
 * precisa aparecer como alteração pendente.
 *
 * Ferramenta que entra na fatia publicada sem descrição aqui faz a compilação
 * levantar: publicada sem corpo declarado, ela receberia pedido sem `reason` e
 * responderia 400 em toda chamada. Os campos obrigatórios são os mesmos que o
 * esqueleto cobra (`obrigatorios` de `criarFerramenta`).
 */
export const DESCRICOES_DAS_FERRAMENTAS: ReadonlyMap<string, DescricaoDaFerramenta> = new Map([
  [
    'tool-transfer',
    {
      descricao:
        'Chame quando a pessoa pedir para falar com alguém do time ou trouxer tema sensível. Devolve o número para transferir, ou queued quando ninguém pode atender agora. Leia a frase devolvida.',
      campos: [
        { chave: 'reason', descricao: 'O motivo do pedido, nas palavras da pessoa.', obrigatorio: true },
        {
          chave: 'urgency',
          descricao: 'alta quando a pessoa diz que é urgente; normal nos outros casos.',
          obrigatorio: false,
          valores: ['normal', 'alta'],
        },
      ],
    },
  ],
  [
    'tool-dnc',
    {
      descricao:
        'Chame na hora em que a pessoa pedir para não ser mais procurada, ou quando ficar claro que não é a pessoa certa. Bloqueia o número para novas ligações.',
      campos: [
        {
          chave: 'reason',
          descricao: 'lead_request quando a pessoa pediu para não ser procurada; wrong_number quando não é a pessoa certa.',
          obrigatorio: true,
          valores: ['lead_request', 'wrong_number'],
        },
        { chave: 'notes', descricao: 'O que a pessoa disse, em uma frase.', obrigatorio: false },
      ],
    },
  ],
  [
    DESCRITOR_DA_QUALIFICACAO.nome,
    { descricao: DESCRITOR_DA_QUALIFICACAO.descricao, campos: DESCRITOR_DA_QUALIFICACAO.campos },
  ],
  // F5: a agenda (US-174). Nenhum campo de `tool-availability` é obrigatório:
  // sem pedido, valem a duração e o horizonte do especialista. Os números vão
  // declarados como texto, e a ferramenta aceita os dois.
  [
    'tool-availability',
    {
      descricao:
        'Chame quando a pessoa aceitar conversar com o especialista, antes de falar qualquer horário. Devolve até quatro opções e a frase que as oferece como opção um, opção dois. Leia a frase devolvida e nunca invente horário. Se a pessoa não puder em nenhuma, chame de novo.',
      campos: [
        { chave: 'area', descricao: 'A área de interesse da pessoa, quando a conta separa especialistas por área.', obrigatorio: false },
        { chave: 'specialist_id', descricao: 'Só quando o contexto da chamada trouxer o especialista; nunca invente.', obrigatorio: false },
        { chave: 'duration_min', descricao: 'Duração da conversa em minutos, quando a pessoa pedir uma diferente.', obrigatorio: false },
        { chave: 'days_ahead', descricao: 'Quantos dias à frente procurar, quando a pessoa pedir mais para a frente.', obrigatorio: false },
      ],
    },
  ],
  [
    'tool-book-meeting',
    {
      descricao:
        'Chame quando a pessoa escolher uma das opções que tool-availability devolveu. Marca a reunião no horário daquela opção. Leia a frase devolvida; se ela disser que o horário foi preenchido, chame tool-availability de novo.',
      campos: [
        {
          chave: 'slot_position',
          descricao: 'O número da opção escolhida: 1 para a opção um, 2 para a opção dois, e assim até 4.',
          obrigatorio: true,
          valores: ['1', '2', '3', '4'],
        },
        {
          chave: 'modality',
          descricao: 'Como a pessoa prefere conversar.',
          obrigatorio: true,
          valores: MODALIDADES_DA_REUNIAO,
        },
        { chave: 'email', descricao: 'O e-mail que a pessoa ditou para receber o convite.', obrigatorio: false },
        { chave: 'notes', descricao: 'O que o especialista precisa saber antes da conversa, em uma frase.', obrigatorio: false },
      ],
    },
  ],
  // F6: o lembrete e o resgate (US-195, US-196). A reunião vem do contexto da
  // chamada, nunca da conversa: nenhuma das duas recebe identificador.
  [
    'tool-confirm-meeting',
    {
      descricao:
        'Chame quando a pessoa disser que vai participar da conversa marcada. Confirma a presença na reunião desta ligação. Leia a frase devolvida.',
      campos: [
        { chave: 'notes', descricao: 'O que a pessoa disse ao confirmar, em uma frase.', obrigatorio: false },
      ],
    },
  ],
  [
    'tool-reschedule',
    {
      descricao:
        'Chame quando a pessoa pedir outro horário ou pedir para cancelar a conversa marcada. Para remarcar, chame tool-availability antes e passe a posição da opção que a pessoa escolheu. Leia a frase devolvida; se ela disser que o horário foi preenchido, chame tool-availability de novo.',
      campos: [
        {
          chave: 'action',
          descricao: 'reschedule para remarcar num horário oferecido; cancel para cancelar sem marcar outro.',
          obrigatorio: true,
          valores: ['reschedule', 'cancel'],
        },
        {
          chave: 'slot_position',
          descricao: 'Só para remarcar: o número da opção escolhida, de 1 a 4.',
          obrigatorio: false,
          valores: ['1', '2', '3', '4'],
        },
        { chave: 'reason', descricao: 'Por que a pessoa pediu, nas palavras dela.', obrigatorio: true },
      ],
    },
  ],
])

function indiceDaFatia(fatia: Fatia): number {
  return FATIAS.indexOf(fatia)
}

/** A fatia em que a ferramenta chega àquele propósito. */
export function fatiaDaFerramentaNoProposito(
  ferramenta: FerramentaDoCatalogo,
  proposito: Proposito,
): Fatia {
  return ferramenta.fatiaPorProposito?.[proposito] ?? ferramenta.entraNa
}

/**
 * As ferramentas nossas daquele propósito que já existem na fatia dada. Na F2,
 * lista vazia nos quatro.
 */
export function ferramentasDoProposito(
  proposito: Proposito,
  fatia: Fatia = FATIA_PUBLICADA,
): readonly string[] {
  return CATALOGO_DE_FERRAMENTAS.filter(
    (ferramenta) =>
      ferramenta.propositos.includes(proposito) &&
      indiceDaFatia(fatiaDaFerramentaNoProposito(ferramenta, proposito)) <= indiceDaFatia(fatia),
  ).map((ferramenta) => ferramenta.nome)
}

/**
 * As ferramentas daquele propósito quando todas as fatias tiverem chegado. É o
 * recorte por propósito que RF-309 promete, e o que o teste compara entre os
 * quatro: por dentro do catálogo, lembrete e descoberta nunca vão ter o mesmo
 * conjunto.
 */
export function ferramentasPrevistasDoProposito(proposito: Proposito): readonly string[] {
  return ferramentasDoProposito(proposito, FATIAS[FATIAS.length - 1] as Fatia)
}

// Os critérios de avaliação (RF-314) --------------------------------------------------

/** Um critério objetivo, aplicado pelo provedor ao fim de cada chamada. */
export type CriterioDeAvaliacao = {
  /** Chave estável. `call-finalize` lê o resultado por ela (L-23). */
  readonly chave: string
  readonly requisitos: readonly string[]
  /** A pergunta fechada. Objetiva de propósito: "a Sarah foi simpática?" não é critério. */
  readonly pergunta: string
}

/**
 * Os critérios que valem nos quatro propósitos. Cada um espelha uma regra
 * travada da camada 1: a regra manda fazer, o critério confere que foi feito.
 * Regra sem critério é instrução que ninguém audita.
 */
export const CRITERIOS_DE_TODO_PROPOSITO: readonly CriterioDeAvaliacao[] = [
  {
    chave: 'aviso_gravacao',
    requisitos: ['RF-420', 'RF-810'],
    pergunta:
      'A assistente avisou que a ligação é gravada na primeira fala, antes de fazer qualquer pergunta?',
  },
  {
    chave: 'nunca_afirmar',
    requisitos: ['RF-301'],
    pergunta:
      'A assistente evitou afirmar qualquer item da lista da conta, sem estimar, arredondar nem dar faixa de valores?',
  },
  {
    chave: 'bloqueio_atendido',
    requisitos: ['RF-805', 'R-02'],
    pergunta:
      'Se alguém pediu para não ser mais procurado, a assistente prometeu o bloqueio em voz alta e encerrou, sem insistir e sem oferecer alternativa?',
  },
  {
    chave: 'humano_atendido',
    requisitos: ['RF-909'],
    pergunta:
      'Se alguém pediu para falar com uma pessoa ou trouxe tema sensível, a assistente encaminhou para o time sem responder ela mesma ao tema e sem prometer prazo de retorno?',
  },
  {
    chave: 'pessoa_errada',
    requisitos: ['RF-422', 'T-02'],
    pergunta:
      'Se ficou claro que a assistente não falava com a pessoa certa, ela encerrou cordialmente em no máximo duas falas, sem explicar o produto e sem pedir o número certo?',
  },
]

/**
 * O critério do fechamento de descoberta, um por variante. Acompanha o
 * fechamento da camada 1: a variante sem agenda é avaliada por **não** ter
 * prometido horário, que é exatamente o que O-06 protege na F2.
 */
export const CRITERIO_DE_FECHAMENTO: Readonly<Record<Variante, CriterioDeAvaliacao>> = {
  sem_agenda: {
    chave: 'fechamento_sem_promessa',
    requisitos: ['O-06'],
    pergunta:
      'A assistente encerrou perguntando o melhor canal e o melhor período para o especialista procurar, sem oferecer dia ou hora e sem prometer convite, confirmação ou e-mail com data?',
  },
  com_agenda: {
    chave: 'fechamento_com_horario',
    requisitos: ['RF-306'],
    pergunta:
      'A assistente ofereceu os horários disponíveis pelo número da opção e confirmou a escolha, sem ler nenhum identificador em voz alta?',
  },
}

/**
 * O critério da qualificação antes de encerrar (US-138). Acompanha
 * `REGRA_DA_QUALIFICACAO` da camada 1 e entra junto com ela, quando
 * `exigeQualificacao` responde sim. A chave é a mesma do critério por registro
 * da avaliação automática (`../qualificacao/obrigatoriedade.ts`): o provedor
 * julga pela transcrição, e a nossa avaliação confere o registro da ferramenta.
 */
export const CRITERIO_DA_QUALIFICACAO: CriterioDeAvaliacao = {
  chave: CHAVE_DA_QUALIFICACAO_REGISTRADA,
  requisitos: ['RF-306', 'RF-314'],
  pergunta:
    'Numa conversa que não terminou por pedido de bloqueio nem por pessoa errada, a Sarah registrou a qualificação com tool-qualify antes de se despedir?',
}

/**
 * Um critério como a chamada o aplica: o que vai ao provedor (`chave`,
 * `requisitos`, `pergunta`) e o que a avaliação automática precisa para
 * decidir (`rotulo`, `obrigatorio`, `como`, `trechos`).
 */
export type CriterioDaChamada = CriterioDeAvaliacao & {
  readonly rotulo: string
  readonly obrigatorio: boolean
  readonly como: CriterioObjetivo['como']
  readonly trechos: readonly string[]
}

/** O requisito de um critério escrito pela conta, que não espelha regra travada. */
export const REQUISITO_DO_CRITERIO_DA_CONTA = 'RF-314'

/**
 * Os critérios daquele propósito, na ordem em que viajam na publicação e em que
 * a finalização os aplica: **a fonte é uma só** (RF-313, RF-314). Primeiro os
 * da camada 1, que espelham regra travada e vêm do código; depois os da conta
 * (`evaluation_criteria`), em `position`.
 *
 * Critério da conta com a chave de um da camada 1 (`aviso_gravacao`) não vira
 * segundo item: a pergunta ao provedor continua a da regra travada, e o rótulo,
 * a obrigatoriedade e o modo de decidir passam a ser os da conta. Duas listas
 * divergentes fariam o provedor avaliar por um critério e a ficha mostrar
 * outro.
 *
 * Os da camada 1 são decididos pelo modelo e não são obrigatórios: a pergunta
 * vale para a conversa em que a regra se aplicou, e o modelo responde nulo nas
 * outras. `qualificacao_registrada` é por registro e obrigatório (US-138).
 * `qualifica` é o que `exigeQualificacao` responde para o conjunto do propósito.
 */
export function criteriosDaChamada(
  proposito: Proposito,
  variante: Variante,
  qualifica: boolean,
  daConta: readonly LinhaDeCriterio[] = [],
): readonly CriterioDaChamada[] {
  const qualificacao = proposito === 'discovery' && qualifica ? [CRITERIO_DA_QUALIFICACAO] : []
  const fechamento = proposito === 'discovery' ? [CRITERIO_DE_FECHAMENTO[variante]] : []
  const daCamadaUm: CriterioDaChamada[] = [...CRITERIOS_DE_TODO_PROPOSITO, ...qualificacao, ...fechamento].map(
    (criterio) =>
      criterio.chave === CHAVE_DA_QUALIFICACAO_REGISTRADA
        ? {
            ...criterio,
            rotulo: CRITERIO_QUALIFICACAO_REGISTRADA.rotulo,
            obrigatorio: CRITERIO_QUALIFICACAO_REGISTRADA.obrigatorio,
            como: CRITERIO_QUALIFICACAO_REGISTRADA.como,
            trechos: [],
          }
        : { ...criterio, rotulo: criterio.pergunta, obrigatorio: false, como: 'modelo', trechos: [] },
  )

  const ordenadas = [...daConta].sort((a, b) => a.position - b.position)
  const porChave = new Map(ordenadas.map((linha) => [linha.key, linha]))
  const aplicados = daCamadaUm.map((criterio) => {
    const linha = porChave.get(criterio.chave)
    // O registro de ferramenta não se troca por trecho nem por modelo.
    if (!linha || criterio.como === 'registro') return criterio
    return {
      ...criterio,
      rotulo: linha.label,
      obrigatorio: linha.obrigatorio,
      como: linha.como,
      trechos: [...linha.trechos],
    }
  })
  const jaAplicadas = new Set(aplicados.map((criterio) => criterio.chave))
  for (const linha of ordenadas) {
    if (jaAplicadas.has(linha.key)) continue
    jaAplicadas.add(linha.key)
    aplicados.push({
      chave: linha.key,
      requisitos: [REQUISITO_DO_CRITERIO_DA_CONTA],
      pergunta: linha.label,
      rotulo: linha.label,
      obrigatorio: linha.obrigatorio,
      como: linha.como,
      trechos: [...linha.trechos],
    })
  }
  return aplicados
}

/**
 * Os critérios de uma chamada pelo propósito gravado nela, com as ferramentas
 * da fatia publicada: é o que `call-finalize` aplica e `call-classify` pergunta
 * ao modelo. Propósito desconhecido não tem publicação, e não tem critério.
 */
export function criteriosDoPropositoGravado(
  proposito: string,
  daConta: readonly LinhaDeCriterio[] = [],
  fatia: Fatia = FATIA_PUBLICADA,
): readonly CriterioDaChamada[] {
  if (!(PROPOSITOS as readonly string[]).includes(proposito)) return []
  const conhecido = proposito as Proposito
  const ferramentas = ferramentasDoProposito(conhecido, fatia)
  return criteriosDaChamada(conhecido, escolherVariante(ferramentas), exigeQualificacao(conhecido, ferramentas), daConta)
}

/** O critério no formato da avaliação automática (`../qualificacao/avaliacao.ts`). */
export function paraAvaliacaoAutomatica(criterio: CriterioDaChamada): CriterioObjetivo {
  return {
    key: criterio.chave,
    rotulo: criterio.rotulo,
    obrigatorio: criterio.obrigatorio,
    como: criterio.como,
    ...(criterio.trechos.length > 0 ? { trechos: criterio.trechos } : {}),
  }
}

/**
 * Os critérios daquele propósito no formato que vai ao provedor e entra no
 * hash: só `chave`, `requisitos` e `pergunta`. O modo de decidir é nosso e não
 * viaja.
 */
export function criteriosDoProposito(
  proposito: Proposito,
  variante: Variante,
  qualifica: boolean,
  daConta: readonly LinhaDeCriterio[] = [],
): readonly CriterioDeAvaliacao[] {
  return criteriosDaChamada(proposito, variante, qualifica, daConta).map(({ chave, requisitos, pergunta }) => ({
    chave,
    requisitos,
    pergunta,
  }))
}

// Os marcadores ----------------------------------------------------------------------

/**
 * O que a compilação substitui. São os marcadores que a publicação conhece:
 * eles valem para a conta inteira e não mudam entre duas chamadas.
 */
export const MARCADORES_DA_PUBLICACAO = ['nome_do_agente', 'empresa', 'nunca_afirmar'] as const

/**
 * O que a compilação **não** substitui, e a razão de a lista existir: estes
 * variam por chamada, e quem os preenche é quem abre a conversa com o contexto
 * do lead (RF-408). Substituí-los aqui congelaria o nome de um lead na
 * publicação e a Sarah chamaria todo mundo por ele.
 *
 * São os marcadores que a conta pode escrever (a tela os oferece ao lado da
 * primeira fala). No prompt eles viram variável da conversa do provedor, e
 * toda variável publicada leva valor inicial seguro (`VALOR_INICIAL_DA_VARIAVEL`):
 * sem contexto nenhum, a Sarah lê um campo em branco, e nunca o nome dele.
 */
export const MARCADORES_DA_CHAMADA = [
  'nome_do_lead',
  'empresa_do_lead',
  'cidade_do_lead',
  'nome_do_especialista',
] as const

/**
 * As variáveis da conversa que a publicação declara: os marcadores da chamada
 * mais o contexto do lead, que a conta não escreve mas o bloco de dados da
 * ligação cita (o perfil do ensaio chega por ele, US-112).
 */
export const VARIAVEIS_DA_CHAMADA = [...MARCADORES_DA_CHAMADA, 'contexto_do_lead'] as const
export type VariavelDaChamada = (typeof VARIAVEIS_DA_CHAMADA)[number]

/**
 * O valor de cada variável quando a conversa começa sem ele: texto vazio, e é
 * decisão. As falas de exemplo do prompt trazem a variável no meio da frase
 * ("Obrigada pelo papo, {nome_do_lead}!"), e um substituto que soasse como
 * nome ("o cliente") viraria "Obrigada pelo papo, o cliente!" dito em voz alta.
 * Em branco, o modelo lê um buraco e o bloco de dados da ligação diz o que
 * fazer com ele. O que nunca pode acontecer é o valor ser o nome da variável.
 */
export const VALOR_INICIAL_DA_VARIAVEL: Readonly<Record<VariavelDaChamada, string>> = {
  nome_do_lead: '',
  empresa_do_lead: '',
  cidade_do_lead: '',
  nome_do_especialista: '',
  contexto_do_lead: '',
}

/**
 * O bloco que diz ao modelo o que ele sabe de quem atende. Entra no prompt de
 * todo propósito, logo depois da camada 1, e é por ele que o contexto do lead
 * chega ao modelo: variável que nenhum texto cita é valor que ninguém lê.
 */
export const BLOCO_DE_DADOS_DA_LIGACAO = [
  '# Dados desta ligação',
  'Estes dados chegam no começo de cada ligação. Campo em branco é dado que a conta não tem: não invente, não pergunte só para preencher e nunca diga em voz alta o nome de um campo. Sem o nome de quem atende, fale sem nome.',
  '- Nome de quem atende: {nome_do_lead}',
  '- Empresa de quem atende: {empresa_do_lead}',
  '- Cidade: {cidade_do_lead}',
  '- O que se sabe do lead: {contexto_do_lead}',
].join('\n')

/**
 * Um marcador no texto: `{chave}` ou `{{chave}}`, com a chave em qualquer
 * caixa. A forma dupla entra porque a conta pode escrevê-la achando que é a do
 * provedor, e uma `{{chave}}` que o provedor não conhece derruba o começo da
 * conversa por variável ausente.
 */
const MARCADOR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\{([A-Za-z0-9_]+)\}/g

const DA_CHAMADA: ReadonlySet<string> = new Set(VARIAVEIS_DA_CHAMADA)

/** Variável do próprio provedor (`{{system__conversation_id}}`): passa como veio. */
const DO_SISTEMA = /^system__/

type Resolucao = (chave: string, original: string) => string

function trocarMarcadores(texto: string, resolver: Resolucao): string {
  return texto.replace(MARCADOR, (original, dupla: string | undefined, simples: string | undefined) =>
    resolver((dupla ?? simples ?? '').toLowerCase(), original),
  )
}

/**
 * O marcador que ninguém sabe preencher, num texto de instrução: vira o nome
 * dele entre colchetes (`{opcao_um}` → `[opcao um]`). O modelo entende a vaga
 * e a chave simples não chega ao provedor. Apagá-lo deixaria "horários: ou ."
 * nas falas de exemplo.
 */
function vagaLegivel(chave: string): string {
  return `[${chave.replace(/_+/g, ' ').trim()}]`
}

/**
 * O prompt como ele é publicado: o que é da conta resolvido, o que é da
 * chamada na forma de marcador simples (`{nome_do_lead}`, que a tradução do
 * provedor passa para a forma dele), e o resto como vaga legível. É a forma
 * normalizada que entra no hash.
 */
function resolverPrompt(texto: string, valores: Readonly<Record<string, string>>): string {
  return trocarMarcadores(texto, (chave, original) => {
    if (DO_SISTEMA.test(chave)) return original
    if (DA_CHAMADA.has(chave)) return `{${chave}}`
    const valor = valores[chave]
    return valor !== undefined ? valor : vagaLegivel(chave)
  })
}

/** Os marcadores da chamada que o texto (já normalizado) cita, na ordem. */
export function variaveisCitadas(texto: string): VariavelDaChamada[] {
  const achadas = new Set<VariavelDaChamada>()
  for (const casamento of texto.matchAll(MARCADOR)) {
    const chave = (casamento[1] ?? casamento[2] ?? '').toLowerCase()
    if (DA_CHAMADA.has(chave)) achadas.add(chave as VariavelDaChamada)
  }
  return [...achadas]
}

/**
 * Uma fala com os marcadores trocados pelos valores. O que não tem valor
 * **some**, com a frase refeita em volta: é texto dito em voz alta, e marcador
 * lido pela voz é o defeito que este módulo existe para impedir.
 */
export function interpolarFala(texto: string, valores: Readonly<Record<string, string>>): string {
  // A preposição que apresentava o marcador sai com ele: "Oi, {nome_do_lead},
  // da {empresa_do_lead}?" sem empresa vira "Oi, Joana?", e não "Oi, Joana, da?".
  const semPreposicaoOrfa = texto.replace(
    new RegExp(`\\s(?:${PREPOSICOES})\\s+(${MARCADOR.source})`, 'gi'),
    (trecho, marcador: string) => (valorDoMarcador(marcador, valores) === '' ? '' : trecho),
  )
  return limparEspacos(trocarMarcadores(semPreposicaoOrfa, (chave) => valores[chave] ?? ''))
}

const PREPOSICOES = 'da|do|de|das|dos|em|no|na|nos|nas|para|pra|com'

function valorDoMarcador(marcador: string, valores: Readonly<Record<string, string>>): string {
  const chave = marcador.replace(/[{}\s]/g, '').toLowerCase()
  return valores[chave]?.trim() ?? ''
}

/**
 * Marcador removido deixa espaço duplo e vírgula órfã: "Oi, ! Aqui é a".
 * A limpeza é o que separa uma abertura audível de uma frase gaguejada.
 */
export function limparEspacos(texto: string): string {
  return texto
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    // A vírgula que separava o marcador do resto fica encostada no ponto:
    // "Oi,! Aqui é a Sarah." A pontuação de dentro é que some.
    .replace(/,+\s*([,.;:!?])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .trim()
}

/**
 * A primeira fala que vai na publicação: os marcadores da conta resolvidos e os
 * da chamada **tirados**, com a frase refeita em volta. Quem põe o nome do lead
 * é o `call-init`, no começo de cada conversa; se o provedor não o chamar (o
 * webhook de início não cadastrado, fora do ar), a Sarah diz "Oi! Aqui é a
 * Sarah" em vez de ler `{nome_do_lead}` em voz alta.
 */
export function primeiraFalaPublicada(texto: string, valores: Readonly<Record<string, string>>): string {
  // Os da chamada saem mesmo que alguém passe valor para eles: a publicação é
  // de todas as ligações, e nome de lead aqui seria o nome de uma só.
  const daConta = Object.fromEntries(
    Object.entries(valores).filter(([chave]) => !DA_CHAMADA.has(chave)),
  )
  return interpolarFala(texto, daConta)
}

// A entrada ---------------------------------------------------------------------------

/** A identidade da Sarah, como `agents` a guarda. */
export type IdentidadeDoAgente = {
  readonly nome: string
  readonly empresa: string
  readonly oferta: string | null
  readonly nuncaAfirmar: readonly string[]
  readonly vozId: string
  /** `agents.voice_settings`, na forma que o provedor aceita. */
  readonly ajustesDeVoz: Readonly<Record<string, unknown>>
  readonly primeiraFala: string
  /**
   * O jeito da assistente só no canal desta compilação: `voice_channel_style`
   * na publicação da voz, `whatsapp_channel_style` no motor do WhatsApp.
   * Entra no prompt logo depois do jeito da casa, e vazio não entra.
   */
  readonly jeitoDoCanal?: string | null
}

/**
 * O que é só do WhatsApp e vai ao ar pela publicação da voz. Não muda o que o
 * provedor de voz recebe; entra no hash para a tela dizer "alterações
 * pendentes" quando só ele mudou, porque o WhatsApp lê a assistente do retrato
 * gravado na publicação (`retrato-da-publicacao.ts`).
 */
export type ParticularidadesDoWhatsapp = {
  /** `agents.whatsapp_first_message`. Nula: a abertura padrão do servidor. */
  readonly abertura: string | null
  /** `agents.whatsapp_channel_style`. */
  readonly jeito: string | null
}

/**
 * A versão publicada do playbook daquele propósito. O `id` viaja na
 * configuração de propósito: é ele que `calls.playbook_version_id` grava, e sem
 * ele no ar ninguém recupera meses depois o roteiro que valia (RF-308).
 */
export type PlaybookPublicado = {
  readonly playbookVersionId: string
  readonly versao: number
  /** `playbook_versions.body_script`. */
  readonly camadaDois: string
  /** `playbook_versions.body_house`. Vazio é estado normal. */
  readonly camadaTres: string
}

/** O que a conta decide e a publicação carrega (`account_settings`). */
export type PoliticaDaConta = {
  /** `max_duration_seconds` (L-12, RF-421). */
  readonly duracaoMaximaSegundos: number
  /** `recording_enabled` (L-18, RF-806). */
  readonly gravacaoLigada: boolean
  /** `recording_notice_text`. Nulo é a frase da camada 1. */
  readonly avisoDeGravacao: string | null
  /** `retention_days` (RF-807). */
  readonly retencaoDias: number
}

/**
 * A camada 1 já compilada. Opcional, e o padrão é a constante do repositório.
 *
 * Existe para **recompilar o passado**: quando R-06 pedir "o que foi ao ar em
 * março ainda é o que está no provedor?", quem responde precisa remontar a
 * configuração daquele dia, e a camada 1 daquele dia não é a de hoje. Passada
 * por engano no caminho normal, ela quebraria RF-308 em silêncio — daí o padrão
 * ser o único caminho que a publicação usa.
 */
export type CamadaUmDaPublicacao = {
  readonly versao: number
  readonly texto: string
}

export type PedidoDeCompilacao = {
  readonly proposito: Proposito
  readonly identidade: IdentidadeDoAgente
  readonly playbookPublicado: PlaybookPublicado
  readonly politica: PoliticaDaConta
  readonly camadaUm?: CamadaUmDaPublicacao
  /**
   * A fatia cujas ferramentas a publicação leva. Opcional, e o padrão é
   * `FATIA_PUBLICADA`; existe pelo mesmo motivo de `camadaUm`, recompilar o que
   * foi ao ar antes de a fatia subir.
   */
  readonly fatia?: Fatia
  /**
   * `evaluation_criteria` da conta. Entram na publicação depois dos da camada
   * 1, pela mesma função que a finalização usa (`criteriosDaChamada`).
   */
  readonly criteriosDaConta?: readonly LinhaDeCriterio[]
  /**
   * O que é só do WhatsApp. Opcional, e ausente ou vazio não muda o hash: as
   * publicações de antes das particularidades por canal continuam em dia.
   */
  readonly whatsapp?: ParticularidadesDoWhatsapp
}

// A saída -----------------------------------------------------------------------------

/**
 * A configuração de um propósito. Tudo aqui é nosso, e é exatamente isso que
 * entra no hash (R-06).
 *
 * As chaves são as nossas, em português: quem traduz para o formato do provedor
 * é `agent-publish` (US-061). Com os nomes do provedor aqui, uma troca de
 * versão da API dele viraria mudança de hash em todas as contas, e todas as
 * publicações apareceriam desatualizadas sem que nada tivesse mudado.
 */
export type ConfiguracaoPublicada = {
  readonly proposito: Proposito
  readonly agente: {
    readonly nome: string
    readonly empresa: string
    readonly oferta: string | null
    readonly nunca_afirmar: readonly string[]
  }
  readonly voz: {
    readonly voice_id: string
    readonly ajustes: Readonly<Record<string, unknown>>
  }
  readonly playbook: {
    readonly camada_um_versao: number
    readonly camada_um_variante: Variante
    readonly playbook_version_id: string
    readonly playbook_versao: number
    readonly prompt: string
  }
  readonly ferramentas: {
    readonly nossas: readonly FerramentaCompilada[]
    readonly de_sistema: readonly FerramentaDeSistema[]
    /** Nulo quando `transfer_to_number` não está na publicação. */
    readonly transferencia: typeof DESTINO_DA_TRANSFERENCIA | null
    readonly prazo_de_resposta_seg: number
  }
  readonly chamada: {
    readonly duracao_maxima_seg: number
    readonly primeira_fala: string
    readonly aviso_de_gravacao: string
    /**
     * O agente pede o contexto da ligação a `call-init` no começo da conversa
     * (T-25), e aceita dele a primeira fala já com o lead dentro. É decisão
     * nossa, e não nome do provedor: por isso entra no hash, e acrescentá-la
     * deixou toda publicação anterior com alteração pendente — que é verdade,
     * porque o agente antigo nunca chamava o webhook de início.
     */
    readonly contexto_no_inicio: boolean
    /**
     * As variáveis da conversa que a publicação declara, cada uma com o valor
     * inicial seguro de `VALOR_INICIAL_DA_VARIAVEL`. Entram no hash porque
     * são decisão nossa: a lista mudar é o prompt passar a pedir um dado novo.
     */
    readonly variaveis: readonly VariavelDaChamada[]
  }
  readonly privacidade: {
    readonly reter_audio: boolean
    readonly retencao_dias: number
  }
  readonly avaliacao: readonly CriterioDeAvaliacao[]
  /**
   * As particularidades do WhatsApp, só quando a conta escreveu alguma. O
   * tradutor do provedor de voz não as lê; o hash, sim.
   */
  readonly whatsapp?: {
    readonly abertura: string | null
    readonly jeito: string | null
  }
}

/** Uma ferramenta nossa na configuração: o nome e o que o modelo lê dela. */
export type FerramentaCompilada = DescricaoDaFerramenta & { readonly nome: string }

function compilarFerramenta(nome: string): FerramentaCompilada {
  const descricao = DESCRICOES_DAS_FERRAMENTAS.get(nome)
  if (descricao === undefined) {
    throw new Error(`${nome} entrou na publicação sem descrição em DESCRICOES_DAS_FERRAMENTAS.`)
  }
  return { nome, ...descricao }
}

export type PublicacaoCompilada = {
  readonly configuracao: ConfiguracaoPublicada
  /** sha-256 em hexadecimal minúsculo. É o valor de `agent_publications.published_hash`. */
  readonly publishedHash: string
}

function montarPrompt(
  camadaUm: string,
  playbook: PlaybookPublicado,
  valores: Readonly<Record<string, string>>,
  jeitoDoCanal: string,
): string {
  const blocos = [
    camadaUm,
    BLOCO_DE_DADOS_DA_LIGACAO,
    `# Roteiro do propósito (camada 2)\n${playbook.camadaDois}`,
  ]
  // Camada 3 só entra quando existe: um cabeçalho seguido de nada instrui o
  // modelo a inventar o que falta.
  if (playbook.camadaTres.trim() !== '') {
    blocos.push(`# Jeito da casa (camada 3)\n${playbook.camadaTres}`)
  }
  // O jeito do canal soma ao da casa, depois dele, e só no canal que o
  // escreveu: vazio não entra, e a publicação sem ele tem o hash de antes.
  if (jeitoDoCanal !== '') {
    blocos.push(`# Jeito da casa neste canal\n${jeitoDoCanal}`)
  }
  return resolverPrompt(blocos.join('\n\n'), valores)
}

/**
 * A configuração de um propósito, mais o hash dela.
 *
 * A ordem das três camadas é fixa e é a de RF-306: as regras travadas primeiro,
 * o roteiro do propósito depois, o jeito da casa por último. Invertê-la poria o
 * texto livre da conta antes do aviso de gravação.
 */
export async function compilarPublicacao(pedido: PedidoDeCompilacao): Promise<PublicacaoCompilada> {
  const { proposito, identidade, playbookPublicado, politica } = pedido

  const fatia = pedido.fatia ?? FATIA_PUBLICADA
  const ferramentas = ferramentasDoProposito(proposito, fatia)
  const deSistema = ferramentasDeSistemaDaFatia(fatia)
  // A variante sai do conjunto de ferramentas e de mais nada (O-06): sem
  // `tool-availability` no conjunto, sem agenda nos quatro propósitos.
  const variante = escolherVariante(ferramentas)

  const camadaUm = pedido.camadaUm ?? {
    versao: VERSAO_DA_CAMADA_UM,
    texto: compilarCamadaUm(proposito, ferramentas),
  }

  const valores: Record<string, string> = {
    nome_do_agente: identidade.nome,
    empresa: identidade.empresa,
    nunca_afirmar:
      identidade.nuncaAfirmar.length > 0
        ? identidade.nuncaAfirmar.join('; ')
        : 'a conta não listou nada',
  }

  // O aviso é texto dito, como a primeira fala: o nome do lead sai dele pelo
  // mesmo motivo, e nada de marcador cru chega ao campo de privacidade.
  const avisoDeGravacao = primeiraFalaPublicada(
    politica.avisoDeGravacao ?? FALAS_DE_TODO_PROPOSITO.avisoDeGravacao,
    valores,
  )

  const configuracao: ConfiguracaoPublicada = {
    proposito,
    agente: {
      nome: identidade.nome,
      empresa: identidade.empresa,
      oferta: identidade.oferta,
      nunca_afirmar: [...identidade.nuncaAfirmar],
    },
    voz: {
      voice_id: identidade.vozId,
      ajustes: identidade.ajustesDeVoz,
    },
    playbook: {
      camada_um_versao: camadaUm.versao,
      camada_um_variante: variante,
      playbook_version_id: playbookPublicado.playbookVersionId,
      playbook_versao: playbookPublicado.versao,
      prompt: montarPrompt(camadaUm.texto, playbookPublicado, valores, identidade.jeitoDoCanal?.trim() ?? ''),
    },
    ferramentas: {
      nossas: ferramentas.map(compilarFerramenta),
      de_sistema: [...deSistema],
      transferencia: deSistema.includes('transfer_to_number') ? DESTINO_DA_TRANSFERENCIA : null,
      prazo_de_resposta_seg: PRAZO_DE_FERRAMENTA_SEGUNDOS,
    },
    chamada: {
      duracao_maxima_seg: politica.duracaoMaximaSegundos,
      primeira_fala: primeiraFalaPublicada(identidade.primeiraFala, valores),
      aviso_de_gravacao: avisoDeGravacao,
      contexto_no_inicio: true,
      variaveis: [...VARIAVEIS_DA_CHAMADA],
    },
    privacidade: {
      // L-18: gravação desligada na conta é retenção desligada no provedor.
      // Deixar de baixar o arquivo não basta — o áudio continuaria lá.
      reter_audio: politica.gravacaoLigada,
      retencao_dias: politica.retencaoDias,
    },
    avaliacao: criteriosDoProposito(
      proposito,
      variante,
      exigeQualificacao(proposito, ferramentas),
      pedido.criteriosDaConta ?? [],
    ),
    ...particularidadesDoWhatsapp(pedido.whatsapp),
  }

  return { configuracao, publishedHash: await hashEmHexadecimal(serializarParaHash(configuracao)) }
}

/** O bloco do WhatsApp na configuração, ou nada quando a conta não escreveu nenhum. */
function particularidadesDoWhatsapp(
  whatsapp: ParticularidadesDoWhatsapp | undefined,
): Pick<ConfiguracaoPublicada, 'whatsapp'> {
  const abertura = whatsapp?.abertura?.trim() || null
  const jeito = whatsapp?.jeito?.trim() || null
  return abertura === null && jeito === null ? {} : { whatsapp: { abertura, jeito } }
}

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves)
  if (valor !== null && typeof valor === 'object') {
    const pares = Object.entries(valor as Record<string, unknown>)
      .filter(([, conteudo]) => conteudo !== undefined)
      // Ordem de ponto de código, e não `localeCompare`: a ordem local muda com
      // a configuração da máquina, e o hash iria junto.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(pares.map(([chave, conteudo]) => [chave, ordenarChaves(conteudo)]))
  }
  return valor
}

/**
 * A configuração como texto, com as chaves ordenadas em todo nível.
 *
 * A ordenação não é capricho: `voice_settings` chega do banco como `jsonb`, e
 * `jsonb` não promete ordem de chave nenhuma. Serializado na ordem em que
 * chegou, o mesmo ajuste de voz daria dois hashes em duas leituras, e a tela
 * diria "alterações pendentes" para uma conta que não mudou nada. Lista
 * continua em ordem: a ordem das ferramentas e dos critérios é conteúdo.
 */
export function serializarParaHash(configuracao: ConfiguracaoPublicada): string {
  return JSON.stringify(ordenarChaves(configuracao))
}

// O estado da publicação (RF-311) -----------------------------------------------------

export const ESTADOS_DE_PUBLICACAO = ['rascunho', 'publicado', 'alteracoes_pendentes'] as const
export type EstadoDePublicacao = (typeof ESTADOS_DE_PUBLICACAO)[number]

/** Uma linha de `agent_publications`, com as chaves da tabela. */
export type PublicacaoRegistrada = {
  readonly purpose: string
  readonly status: string
  readonly published_hash: string | null
}

/** Um hash por propósito: quatro publicações são quatro respostas. */
export type HashPorProposito = Readonly<Record<Proposito, string>>

/**
 * Os três estados de RF-311, para o agente inteiro.
 *
 * O parâmetro é um hash **por propósito** e não um só, e a razão é T-01: com
 * quatro publicações, "o que está no ar é o que está no banco?" tem quatro
 * respostas, e o indicador da tela é uma. Se a sonda derrubar a suposição, este
 * é o ponto que encolhe para um hash.
 *
 * - `rascunho`: nada foi ao ar ainda.
 * - `publicado`: os quatro propósitos estão publicados e os quatro hashes batem.
 * - `alteracoes_pendentes`: alguma coisa foi ao ar e o que está no ar não é o
 *   que está no banco — hash divergente, propósito que falhou, ou propósito que
 *   ninguém publicou. Os três casos pedem a mesma ação, que é republicar, e
 *   separá-los aqui só adiantaria estado que a tela não sabe desenhar.
 */
/**
 * Os propósitos no ar com o que está gravado agora: publicados, com o hash
 * compilado igual ao do ar. É o que responde "a Sarah já liga?" para um
 * propósito, quando o estado da conta inteira ainda espera os outros três.
 */
export function propositosNoAr(
  hashCompilado: HashPorProposito,
  publicacoes: readonly PublicacaoRegistrada[],
): Proposito[] {
  return PROPOSITOS.filter((proposito) => {
    const compilado = hashCompilado[proposito]
    if (!compilado) return false
    return publicacoes.some(
      (publicacao) =>
        publicacao.purpose === proposito &&
        publicacao.status === 'publicado' &&
        publicacao.published_hash === compilado,
    )
  })
}

export function estadoDePublicacao(
  hashCompilado: HashPorProposito,
  publicacoes: readonly PublicacaoRegistrada[],
): EstadoDePublicacao {
  const noAr = new Map<string, string>()
  for (const publicacao of publicacoes) {
    if (publicacao.status === 'publicado' && publicacao.published_hash !== null) {
      noAr.set(publicacao.purpose, publicacao.published_hash)
    }
  }

  if (noAr.size === 0) return 'rascunho'
  const tudoConfere = PROPOSITOS.every((proposito) => noAr.get(proposito) === hashCompilado[proposito])
  return tudoConfere ? 'publicado' : 'alteracoes_pendentes'
}
