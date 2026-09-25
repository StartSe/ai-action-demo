// A aplicação das sugestões revisadas, sem React: o que vai para qual serviço,
// e o relatório de cada parte que o resumo mostra.
//
// Cada parte grava pelo serviço da tela dela, o mesmo que a pessoa usaria à
// mão, e nada é publicado: a identidade é gravada, o roteiro vira rascunho, e
// as respostas às perguntas entram na base de conhecimento, que é o que a
// assistente consulta na ligação. Especialista e leads ficam para a pessoa: eles
// pedem uma pessoa de verdade e uma planilha, que nenhuma sugestão inventa.
//
// Uma parte que falha não impede as outras: o relatório diz o que houve em
// cada uma.

import type { ContextoDoNegocio, SugestaoDaEtapa } from '@sugestoes/sugestoes.ts'
import { nomeCurto, type VozDeExemplo } from '@voz/vozes-de-exemplo.ts'

import type { PassoId } from '@/configuracao-inicial/tipos'
import type { IdentidadeDaSarah, ServicoDaSarah } from '@/sarah/tipos'

export const PARTES_DO_RESUMO = [
  'identidade',
  'voz',
  'roteiro',
  'conhecimento',
  'especialista',
  'leads',
] as const

export type ParteDoResumo = (typeof PARTES_DO_RESUMO)[number]

/**
 * `aplicado` gravou; `rascunho` gravou sem ir ao ar; `para_fazer` não é coisa
 * que a sugestão resolva sozinha; `nada` é parte sem sugestão; `falhou` tentou
 * e o serviço recusou.
 */
export type EstadoDaParte = 'aplicado' | 'rascunho' | 'para_fazer' | 'nada' | 'falhou'

export interface ItemDaParte {
  /** A chave do campo, ou a pergunta, conforme a parte. */
  readonly chave: string
  readonly valor: string
}

export interface ParteAplicada {
  readonly parte: ParteDoResumo
  readonly estado: EstadoDaParte
  readonly itens: readonly ItemDaParte[]
  /** Onde se altera, no assistente de configuração. Nula na base de conhecimento. */
  readonly passo: PassoId | null
}

export interface SugestoesRevisadas {
  readonly contexto: ContextoDoNegocio
  readonly sugestoes: readonly SugestaoDaEtapa[]
  /** `etapa.campo` → o valor como ficou depois da revisão. */
  readonly valores: Readonly<Record<string, string>>
  /** `etapa.indice` → a resposta à pergunta daquela posição. */
  readonly respostas: Readonly<Record<string, string>>
  /** A voz escolhida na etapa da voz, gravada logo depois da identidade. */
  readonly voz?: Pick<VozDeExemplo, 'id' | 'nome'> | null
}

/**
 * O que a publicação exige e a revisão cobra antes de aplicar: sem empresa e
 * nome a assistente não vai ao ar, sem primeira fala e roteiro também não.
 * Cobrar aqui é o que impede o fluxo sugerido de quebrar dois passos depois.
 */
export const CAMPOS_OBRIGATORIOS = [
  'identidade.empresa',
  'identidade.nome_do_agente',
  'identidade.primeira_fala',
  'roteiro.roteiro_de_descoberta',
] as const

const CAMPO_DO_NOME = 'identidade.nome_do_agente'

function temNome(nomeGravado: string | null): boolean {
  return (nomeGravado?.trim() ?? '') !== ''
}

/**
 * Os obrigatórios desta revisão. O nome é a primeira pergunta do tutorial:
 * gravado lá, ele não volta a ser campo da revisão, e cobrar um campo que a
 * tela não mostra travaria o botão sem razão à vista.
 */
export function camposObrigatorios(nomeGravado: string | null = null): readonly string[] {
  return temNome(nomeGravado)
    ? CAMPOS_OBRIGATORIOS.filter((chave) => chave !== CAMPO_DO_NOME)
    : CAMPOS_OBRIGATORIOS
}

/** Os obrigatórios ainda em branco, na ordem da revisão. */
export function faltaParaAplicar(
  valores: Readonly<Record<string, string>>,
  nomeGravado: string | null = null,
): string[] {
  return camposObrigatorios(nomeGravado).filter((chave) => !(valores[chave] ?? '').trim())
}

/**
 * As sugestões com os obrigatórios sempre à vista: etapa ou campo que o modelo
 * não devolveu entra em branco (a empresa, com o que já se sabe), para a
 * pessoa preencher ali mesmo. Com o nome gravado, o campo do nome sai: a
 * revisão mostraria o palpite do modelo por cima da escolha da pessoa.
 */
export function completarObrigatorios(
  sugestoes: readonly SugestaoDaEtapa[],
  contexto: ContextoDoNegocio,
  nomeGravado: string | null = null,
): SugestaoDaEtapa[] {
  const padrao: Record<string, string> = {
    'identidade.empresa': contexto.empresa.trim(),
  }
  const completas = sugestoes.map((etapa) => ({
    ...etapa,
    campos: etapa.campos.filter(
      (campo) => !(temNome(nomeGravado) && `${etapa.etapa}.${campo.campo}` === CAMPO_DO_NOME),
    ),
  }))
  for (const chave of camposObrigatorios(nomeGravado)) {
    const [nomeDaEtapa, campo] = chave.split('.') as [SugestaoDaEtapa['etapa'], string]
    let etapa = completas.find((item) => item.etapa === nomeDaEtapa)
    if (!etapa) {
      etapa = { etapa: nomeDaEtapa, campos: [], perguntas: [] }
      completas.push(etapa)
    }
    if (!etapa.campos.some((item) => item.campo === campo)) {
      const novo = { campo, valor: padrao[chave] ?? '', porque: '' }
      if (campo === 'empresa') etapa.campos.unshift(novo)
      else etapa.campos.push(novo)
    }
  }
  const ordem = ['identidade', 'roteiro', 'especialista', 'leads']
  return completas.sort((uma, outra) => ordem.indexOf(uma.etapa) - ordem.indexOf(outra.etapa))
}

/** A etiqueta com que as respostas entram na base, para achá-las depois. */
export const ETIQUETA_DA_CONFIGURACAO = 'configuração inicial'

const PASSO_DA_PARTE: Record<ParteDoResumo, PassoId | null> = {
  identidade: 'agente',
  voz: 'agente',
  roteiro: 'roteiro',
  conhecimento: null,
  especialista: 'especialista',
  leads: 'leads',
}

function valor(revisadas: SugestoesRevisadas, chave: string): string {
  return (revisadas.valores[chave] ?? '').trim()
}

/** `nunca_afirmar` chega em uma linha, separado por vírgula ou por linha. */
export function separarNuncaAfirmar(texto: string): string[] {
  return [...new Set(texto.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean))]
}

/**
 * A identidade que vai ser gravada: o que a revisão trouxe vence, e o que ela
 * não trouxe fica como estava. O nome é a exceção: o gravado na primeira
 * pergunta do tutorial vence a sugestão, que só vale para a conta que pulou a
 * pergunta. A transferência não tem sugestão e nunca muda aqui. Nula quando
 * não há nada da identidade para aplicar.
 */
export function identidadeSugerida(
  atual: IdentidadeDaSarah | null,
  revisadas: SugestoesRevisadas,
): IdentidadeDaSarah | null {
  const empresa = valor(revisadas, 'identidade.empresa')
  const nome = valor(revisadas, 'identidade.nome_do_agente')
  const oferta = valor(revisadas, 'identidade.oferta')
  const primeiraFala = valor(revisadas, 'identidade.primeira_fala')
  const nunca = valor(revisadas, 'identidade.nunca_afirmar')
  if (!empresa && !nome && !oferta && !primeiraFala && !nunca) return null

  return {
    nome: atual?.nome.trim() || nome,
    empresa: empresa || revisadas.contexto.empresa.trim() || atual?.empresa || '',
    oferta: oferta || atual?.oferta || '',
    nuncaAfirmar: nunca ? separarNuncaAfirmar(nunca) : (atual?.nuncaAfirmar ?? []),
    destinoDeTransferencia: atual?.destinoDeTransferencia ?? '',
    primeiraFala: primeiraFala || atual?.primeiraFala || '',
    // O que é por canal não tem sugestão: segue o que a conta já escreveu.
    aberturaDoWhatsapp: atual?.aberturaDoWhatsapp ?? '',
    jeitoNaVoz: atual?.jeitoNaVoz ?? '',
    jeitoNoWhatsapp: atual?.jeitoNoWhatsapp ?? '',
  }
}

/** As perguntas que a pessoa respondeu, com a etapa de cada uma. */
export function perguntasRespondidas(
  revisadas: SugestoesRevisadas,
): { etapa: string; pergunta: string; resposta: string }[] {
  return revisadas.sugestoes.flatMap((etapa) =>
    etapa.perguntas.flatMap((pergunta, indice) => {
      const resposta = (revisadas.respostas[`${etapa.etapa}.${indice}`] ?? '').trim()
      return resposta ? [{ etapa: etapa.etapa, pergunta: pergunta.pergunta, resposta }] : []
    }),
  )
}

/** Os campos sugeridos de uma etapa, como ficaram na revisão. */
function itensDaEtapa(revisadas: SugestoesRevisadas, etapa: string): ItemDaParte[] {
  const sugestao = revisadas.sugestoes.find((item) => item.etapa === etapa)
  return (sugestao?.campos ?? [])
    .map((campo) => ({ chave: campo.campo, valor: valor(revisadas, `${etapa}.${campo.campo}`) }))
    .filter((item) => item.valor !== '')
}

/**
 * Aplica tudo, uma parte por vez, e avisa a cada parte que termina. A ordem é
 * a do resumo: identidade, roteiro, conhecimento, e as duas que ficam para a
 * pessoa.
 */
export async function aplicarSugestoes(
  servico: ServicoDaSarah,
  revisadas: SugestoesRevisadas,
  aoTerminarParte: (parte: ParteAplicada) => void = () => {},
): Promise<ParteAplicada[]> {
  const partes: ParteAplicada[] = []
  const registrar = (parte: ParteAplicada) => {
    partes.push(parte)
    aoTerminarParte(parte)
  }

  registrar(await aplicarIdentidade(servico, revisadas))
  registrar(await aplicarVoz(servico, revisadas))
  registrar(await aplicarRoteiro(servico, revisadas))
  registrar(await aplicarConhecimento(servico, revisadas))

  for (const parte of ['especialista', 'leads'] as const) {
    const itens = itensDaEtapa(revisadas, parte)
    registrar({
      parte,
      estado: itens.length > 0 ? 'para_fazer' : 'nada',
      itens,
      passo: PASSO_DA_PARTE[parte],
    })
  }

  return partes
}

async function aplicarIdentidade(
  servico: ServicoDaSarah,
  revisadas: SugestoesRevisadas,
): Promise<ParteAplicada> {
  const base = { parte: 'identidade' as const, passo: PASSO_DA_PARTE.identidade }
  const carga = await servico.carregarIdentidade()
  const atual = carga.ok ? carga.sarah.identidade : null
  const identidade = identidadeSugerida(atual, revisadas)
  if (!identidade) return { ...base, estado: 'nada', itens: [] }

  const gravacao = await servico.salvarIdentidade(identidade)
  const itens: ItemDaParte[] = [
    { chave: 'nome_do_agente', valor: identidade.nome },
    { chave: 'empresa', valor: identidade.empresa },
    { chave: 'oferta', valor: identidade.oferta },
    { chave: 'primeira_fala', valor: identidade.primeiraFala },
    { chave: 'nunca_afirmar', valor: identidade.nuncaAfirmar.join(', ') },
  ].filter((item) => item.valor !== '')
  return { ...base, estado: gravacao.ok ? 'aplicado' : 'falhou', itens }
}

async function aplicarVoz(
  servico: ServicoDaSarah,
  revisadas: SugestoesRevisadas,
): Promise<ParteAplicada> {
  const base = { parte: 'voz' as const, passo: PASSO_DA_PARTE.voz }
  const voz = revisadas.voz
  if (!voz) return { ...base, estado: 'nada', itens: [] }

  // Os ajustes são os que a conta já tem; trocar de voz não mexe neles.
  const carga = await servico.carregarVoz()
  const ajustes = carga.ok ? carga.voz.ajustes : {}
  const gravacao = await servico.salvarVoz({ vozId: voz.id, ajustes })
  return {
    ...base,
    estado: gravacao.ok ? 'aplicado' : 'falhou',
    itens: [{ chave: 'voz', valor: nomeCurto(voz) }],
  }
}

async function aplicarRoteiro(
  servico: ServicoDaSarah,
  revisadas: SugestoesRevisadas,
): Promise<ParteAplicada> {
  const base = { parte: 'roteiro' as const, passo: PASSO_DA_PARTE.roteiro }
  const roteiro = valor(revisadas, 'roteiro.roteiro_de_descoberta')
  if (!roteiro) return { ...base, estado: 'nada', itens: [] }

  // O jeito da casa é da conta, e a versão nova o carrega sem mexer.
  const playbooks = await servico.carregarPlaybooks()
  const descoberta = playbooks.ok
    ? playbooks.playbooks.playbooks.find((item) => item.proposito === 'discovery')
    : undefined
  const jeitoDaCasa = descoberta?.versoes[0]?.jeitoDaCasa ?? ''

  const gravacao = await servico.salvarRascunho({ proposito: 'discovery', roteiro, jeitoDaCasa })
  return {
    ...base,
    estado: gravacao.ok ? 'rascunho' : 'falhou',
    itens: [{ chave: 'roteiro_de_descoberta', valor: roteiro }],
  }
}

async function aplicarConhecimento(
  servico: ServicoDaSarah,
  revisadas: SugestoesRevisadas,
): Promise<ParteAplicada> {
  const base = { parte: 'conhecimento' as const, passo: PASSO_DA_PARTE.conhecimento }
  const respondidas = perguntasRespondidas(revisadas)
  if (respondidas.length === 0) return { ...base, estado: 'nada', itens: [] }

  const gravadas: ItemDaParte[] = []
  let falhas = 0
  for (const item of respondidas) {
    const gravacao = await servico.salvarEntrada({
      id: null,
      pergunta: item.pergunta,
      resposta: item.resposta,
      etiquetas: [ETIQUETA_DA_CONFIGURACAO],
    })
    if (gravacao.ok) gravadas.push({ chave: item.pergunta, valor: item.resposta })
    else falhas += 1
  }
  return {
    ...base,
    estado: gravadas.length > 0 ? 'aplicado' : falhas > 0 ? 'falhou' : 'nada',
    itens: gravadas,
  }
}
