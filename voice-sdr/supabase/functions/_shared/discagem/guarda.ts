// A borda da guarda de discagem: normaliza, chama e traduz (RF-407, seção 6).
//
// A seção 6 é explícita sobre o tamanho deste módulo: "o módulo `guard.ts`
// apenas normaliza e chama". Quem conta tentativa, compara teto e lê janela é
// `guard_dial`, na mesma transação em que grava — é o que T-05 exige, e
// recontar aqui produziria uma segunda verdade que passa a divergir do banco no
// dia em que uma das duas mudar. Este arquivo tem, por isso, três trabalhos:
//
// 1. **Normalizar o telefone** pelo módulo completo (`../telefone.ts`), que
//    conhece DDD e nono dígito. A guarda também normaliza, mas só a metade
//    portável: número que não é telefone brasileiro precisa ser recusado com
//    frase, e não levantar exceção lá dentro.
// 2. **Chamar `guard_dial` por uma porta**, que `call-place` implementa sobre o
//    cliente do Supabase com a chave de serviço. Aqui não há rede nem Deno, e
//    por isso o teste roda em `test:unit` com a porta dublada.
// 3. **Traduzir a decisão**: código do motivo e os números do limite entram,
//    frase em português e alternativa saem. É a DIVERGÊNCIA DECLARADA da
//    migração da guarda — a seção 6 previa `message` e `alternative` vindos do
//    SQL, e o projeto separa decisão do banco de texto da interface.
//
// Duas regras que o teste cobra e que não são de estilo:
//
// - **O código que gerou a frase não sai daqui.** `min_interval` não diz nada a
//    quem opera; "este número foi discado há pouco" diz. É a mesma regra que a
//    US-013 fixou para código de provedor, e vale para o motivo do SQL tanto
//    quanto para o do telefone.
// - **Guarda que libera quando quebra não é guarda.** Porta que levanta, motivo
//    que o mapa não conhece e liberação sem linha telefônica caem todos em
//    `guarda_indisponivel`, que é recusa. O contrário — tratar falha como
//    liberação — faria a queda do banco discar para a lista de bloqueio.
//
// Módulo portável (`_shared/`): sem Deno, sem rede, sem banco e sem relógio. O
// instante entra por parâmetro, como em toda regra de tempo desta base.

import { normalizarTelefone } from '../telefone.ts'
import type { FonteDeDiscagem } from '../chamada/idempotencia.ts'
import { fraseDaJanela, fraseDaProximaAbertura, horaNoFuso } from './janela.ts'
import { faltaParaAbrir, type FaltaNoPortao } from './portao.ts'

/**
 * Os passos que uma campanha pode pular (seção 6). A lista é fechada aqui
 * porque é fechada lá: `guard_dial` ignora nome que não conhece, e um terceiro
 * nome escrito por engano passaria a viagem inteira sem ninguém notar. Os
 * passos 0, 2, 3 e 4 não são puláveis por ninguém.
 */
export const PASSOS_PULAVEIS = ['min_interval', 'daily_per_number'] as const

export type PassoPulavel = (typeof PASSOS_PULAVEIS)[number]

/** Quem mandou discar (T-04). `user` é gente com sessão; `system` é rotina. */
export type AtorDaDiscagem = 'user' | 'system'

/** O pedido, em português, como `call-place` e `cron-dial` o montam. */
export interface PedidoDeDiscagem {
  readonly contaId: string
  /** O número como chegou: da tela, do webhook ou da fila. */
  readonly telefone: string
  readonly leadId?: string | null
  readonly ator: AtorDaDiscagem
  /** `auth.uid()` de quem clicou. Nulo quando o ator é `system`. */
  readonly atorId?: string | null
  readonly fonte: FonteDeDiscagem
  readonly campanhaId?: string | null
  readonly pular?: readonly PassoPulavel[]
  /** O relógio da decisão, em ISO-8601. Nunca lido aqui dentro. */
  readonly instante: string
  /** `accounts.timezone`: o fuso de quem vai ler a recusa. */
  readonly fusoDaConta: string
}

/**
 * Os argumentos de `guard_dial`, com os nomes dos parâmetros da função. Objeto
 * que vai para um RPC usa as chaves de lá, e não nomes em português: tradutor
 * no meio do caminho é onde parâmetro se perde.
 */
export interface ChamadaDaGuarda {
  readonly p_account_id: string
  readonly p_phone_e164: string
  readonly p_lead_id: string | null
  readonly p_actor: AtorDaDiscagem
  readonly p_actor_id: string | null
  readonly p_source: string
  readonly p_campaign_id: string | null
  readonly p_bypass: readonly PassoPulavel[]
  readonly p_instante: string
}

/** A linha que `guard_dial` devolve, com os nomes das colunas dela. */
export interface RespostaDaGuarda {
  readonly allowed: boolean
  readonly reason: string
  readonly dados: Readonly<Record<string, unknown>> | null
  readonly phone_line_id: string | null
}

/**
 * A camada de dados, em uma operação só. O teste a dubla; `call-place` a
 * implementa sobre o cliente do Supabase com a chave de serviço, porque
 * `guard_dial` só tem `execute` para `service_role`.
 */
export interface PortaDeGuarda {
  guardDial(chamada: ChamadaDaGuarda): Promise<RespostaDaGuarda>
}

/**
 * Por que a discagem não sai, em código estável para quem programa. A frase
 * fica em `FRASES_DA_RECUSA` e é montada por `recusar`; o código do SQL que a
 * gerou não aparece nem no motivo nem na frase.
 *
 * `telefone_invalido` e `guarda_indisponivel` são os dois motivos que nascem
 * aqui: o primeiro porque a guarda levanta exceção em número que não normaliza,
 * e não recusa; o segundo porque a falha da consulta precisa de um nome próprio
 * para não ser confundida com uma recusa de política.
 */
export type MotivoDaGuarda =
  | 'telefone_invalido'
  | 'freio_puxado'
  | 'portao_de_lead_real'
  | 'numero_bloqueado'
  | 'fora_da_janela'
  | 'intervalo_minimo'
  | 'teto_por_numero'
  | 'teto_da_conta'
  | 'teto_de_gasto'
  | 'sem_linha_disponivel'
  | 'guarda_indisponivel'

export interface DiscagemLiberada {
  readonly ok: true
  /** O número em E.164, como a guarda o gravou. */
  readonly telefone: string
  readonly linhaTelefonicaId: string
  /** O número de origem escolhido no rodízio, quando a guarda o informou. */
  readonly numeroDeOrigem: string | null
}

export interface DiscagemRecusada {
  readonly ok: false
  readonly motivo: MotivoDaGuarda
  /** O que aconteceu, em português. */
  readonly mensagem: string
  /** O que dá para fazer a respeito (RF-407). Nunca vazio. */
  readonly alternativa: string
  /** O número em E.164, ou nulo quando ele nem chegou a normalizar. */
  readonly telefone: string | null
}

export type DecisaoDaGuarda = DiscagemLiberada | DiscagemRecusada

/**
 * O motivo de cada código de `call_attempts.outcome`. O mapa é fechado dos dois
 * lados: código que não estiver aqui não vira recusa traduzida nem liberação,
 * vira `guarda_indisponivel`. Motivo novo no SQL sem entrada aqui aparece como
 * indisponibilidade na tela, que é ruído — e ruído é melhor do que uma ligação
 * que sai porque ninguém reconheceu a recusa.
 */
const MOTIVO_POR_CODIGO: Readonly<Record<string, MotivoDaGuarda>> = {
  dialing_paused: 'freio_puxado',
  real_dialing_gate: 'portao_de_lead_real',
  dnc_active: 'numero_bloqueado',
  outside_window: 'fora_da_janela',
  min_interval: 'intervalo_minimo',
  daily_per_number: 'teto_por_numero',
  daily_per_account: 'teto_da_conta',
  daily_spend_cap: 'teto_de_gasto',
  no_phone_line: 'sem_linha_disponivel',
}

/** O código que a guarda usa para a discagem que sai. */
const LIBERADO = 'placed'

/**
 * Resolve o pedido inteiro: normaliza, chama a guarda e traduz. Nunca levanta —
 * exceção da porta vira recusa por indisponibilidade, porque quem chama precisa
 * decidir se disca, e não tratar um erro de rede no meio do discador.
 */
export async function guardarDiscagem(
  pedido: PedidoDeDiscagem,
  porta: PortaDeGuarda,
): Promise<DecisaoDaGuarda> {
  const numero = normalizarTelefone(pedido.telefone)
  if (!numero.ok) return recusar('telefone_invalido', null, null, pedido)

  let resposta: RespostaDaGuarda
  try {
    resposta = await porta.guardDial({
      p_account_id: pedido.contaId,
      p_phone_e164: numero.e164,
      p_lead_id: pedido.leadId ?? null,
      p_actor: pedido.ator,
      p_actor_id: pedido.atorId ?? null,
      p_source: pedido.fonte,
      p_campaign_id: pedido.campanhaId ?? null,
      p_bypass: pedido.pular ?? [],
      p_instante: pedido.instante,
    })
  } catch {
    // A mensagem do erro morre aqui: ela traz nome de função, nome de coluna e
    // às vezes o próprio SQL, e nada disso vai para a tela de quem opera.
    return recusar('guarda_indisponivel', null, numero.e164, pedido)
  }

  const dados = lerDados(resposta.dados)

  if (resposta.allowed && resposta.reason === LIBERADO && resposta.phone_line_id) {
    return {
      ok: true,
      telefone: numero.e164,
      linhaTelefonicaId: resposta.phone_line_id,
      numeroDeOrigem: texto(dados, 'from_number'),
    }
  }

  // Liberação sem linha, motivo desconhecido e `allowed` que não combina com o
  // código caem todos aqui: só o que o mapa reconhece vira recusa de política.
  const motivo = MOTIVO_POR_CODIGO[resposta.reason] ?? 'guarda_indisponivel'
  return recusar(motivo, dados, numero.e164, pedido)
}

// As frases ----------------------------------------------------------------------
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4). Quem lê está com o discador
// aberto e quer saber o que fazer agora.
//
// A frase da janela NÃO é escrita aqui: ela vem de `janela.ts`, que é o módulo
// que já sabe dizer a faixa no fuso do lead e repetir o horário no fuso de quem
// lê (T-21). Escrevê-la de novo daria duas versões da mesma frase, e a segunda
// envelheceria calada.

interface Frases {
  readonly mensagem: string
  readonly alternativa: string
}

function recusar(
  motivo: MotivoDaGuarda,
  dados: Readonly<Record<string, unknown>> | null,
  telefone: string | null,
  pedido: PedidoDeDiscagem,
): DiscagemRecusada {
  const { mensagem, alternativa } = frasesDe(motivo, dados, pedido)
  return { ok: false, motivo, mensagem, alternativa, telefone }
}

function frasesDe(
  motivo: MotivoDaGuarda,
  dados: Readonly<Record<string, unknown>> | null,
  pedido: PedidoDeDiscagem,
): Frases {
  switch (motivo) {
    case 'portao_de_lead_real':
      return frasesDoPortao(dados)
    case 'fora_da_janela':
      return frasesDaJanela(dados, pedido)
    case 'intervalo_minimo':
      return frasesDoIntervalo(dados, pedido)
    case 'teto_por_numero':
      return {
        mensagem: comTeto(
          dados,
          'cap',
          (teto) => `Este número já recebeu as ${teto} ligações que a conta permite por dia.`,
          'Este número já recebeu todas as ligações que a conta permite por dia.',
        ),
        alternativa:
          'A contagem por número zera à meia-noite, no fuso da conta. Para falar ainda hoje, aumente o teto por número em Discagem, na administração da conta.',
      }
    case 'teto_da_conta':
      return {
        mensagem: comTeto(
          dados,
          'cap',
          (teto) => `A conta já fez as ${teto} ligações do teto diário.`,
          'A conta já fez todas as ligações do teto diário.',
        ),
        alternativa:
          'O teto zera à meia-noite, no fuso da conta. Para ligar ainda hoje, aumente o teto diário em Discagem, na administração da conta.',
      }
    case 'teto_de_gasto':
      return {
        mensagem: comTeto(
          dados,
          'cap_cents',
          (teto) => `A conta já chegou ao teto de gasto do dia, de ${emReais(teto)}.`,
          'A conta já chegou ao teto de gasto do dia.',
        ),
        alternativa:
          'O gasto do dia zera à meia-noite, no fuso da conta. Para continuar hoje, aumente o teto de gasto em Discagem, na administração da conta.',
      }
    default:
      return FRASES_DA_RECUSA[motivo]
  }
}

/**
 * As recusas que se explicam sozinhas, sem número nenhum do banco. As outras
 * cinco dependem do portão, da janela, do horário e do teto, e são montadas
 * acima.
 */
const FRASES_DA_RECUSA: Readonly<Record<MotivoDaGuarda, Frases>> = {
  telefone_invalido: {
    mensagem: 'O número informado não é um telefone válido no Brasil.',
    alternativa:
      'Confira o DDD e os dígitos do número. Celular tem nove dígitos e começa em 9; fixo tem oito e começa entre 2 e 5.',
  },
  freio_puxado: {
    mensagem: 'A discagem desta conta está parada pelo freio de emergência.',
    alternativa:
      'Nenhuma ligação sai enquanto o freio estiver puxado. Solte o freio em Discagem, na administração da conta, quando a operação puder voltar.',
  },
  // A frase que sobra quando `dados` não diz o estado do portão. Com ele, a
  // mensagem diz também o que falta (`frasesDoPortao`).
  portao_de_lead_real: {
    mensagem:
      'Por enquanto a assistente só liga para os números de teste da conta.',
    alternativa:
      'Cadastre este número na lista de teste em Discagem, na administração da conta, ou escolha um número que já esteja na lista.',
  },
  numero_bloqueado: {
    mensagem: 'Este número está na lista de não perturbe desta conta.',
    alternativa:
      'A ligação só volta a sair se o contato pedir. Nesse caso, tire o número da lista em Bloqueios, na administração da conta.',
  },
  sem_linha_disponivel: {
    mensagem: 'Nenhuma linha telefônica desta conta pode ligar agora.',
    alternativa:
      'Confira em Números se há linha habilitada, no rodízio e dentro do teto do dia.',
  },
  guarda_indisponivel: {
    mensagem: 'A guarda de discagem não respondeu, e nenhuma ligação sai sem a resposta dela.',
    alternativa:
      'Tente de novo em alguns instantes. Se continuar assim, avise quem cuida da operação.',
  },
  // Os quatro que dependem de número do banco nunca chegam ao mapa, e a frase
  // aqui é a que sobra quando `dados` vem vazio.
  fora_da_janela: {
    mensagem: 'Agora está fora da janela de discagem deste lead.',
    alternativa:
      'Espere a janela abrir, ou ajuste a janela em Discagem, na administração da conta.',
  },
  intervalo_minimo: {
    mensagem:
      'Este número foi discado há pouco, e ainda não passou o intervalo mínimo entre duas ligações para o mesmo número.',
    alternativa:
      'Espere o intervalo fechar, ou ajuste o intervalo mínimo em Discagem, na administração da conta.',
  },
  teto_por_numero: {
    mensagem: 'Este número já recebeu todas as ligações que a conta permite por dia.',
    alternativa:
      'A contagem por número zera à meia-noite, no fuso da conta. Para falar ainda hoje, aumente o teto por número em Discagem, na administração da conta.',
  },
  teto_da_conta: {
    mensagem: 'A conta já fez todas as ligações do teto diário.',
    alternativa:
      'O teto zera à meia-noite, no fuso da conta. Para ligar ainda hoje, aumente o teto diário em Discagem, na administração da conta.',
  },
  teto_de_gasto: {
    mensagem: 'A conta já chegou ao teto de gasto do dia.',
    alternativa:
      'O gasto do dia zera à meia-noite, no fuso da conta. Para continuar hoje, aumente o teto de gasto em Discagem, na administração da conta.',
  },
}

/**
 * O que falta para o portão abrir, dito a quem opera (US-074). A regra do que
 * falta é de `portao.ts`, a mesma que o discador lê para só oferecer número de
 * teste; aqui só se escolhe a frase de cada falta.
 */
const FRASE_DA_FALTA: Readonly<Record<FaltaNoPortao, string>> = {
  liberacao_da_fase: 'a liberação da discagem para lead real, que quem instalou o produto faz uma vez nesta instalação',
  primeira_chamada_de_teste: 'uma ligação de teste desta conta que termine com transcrição',
}

function frasesDoPortao(dados: Readonly<Record<string, unknown>> | null): Frases {
  const padrao = FRASES_DA_RECUSA.portao_de_lead_real
  const bandeira = dados?.['real_dialing']
  if (typeof bandeira !== 'boolean') return padrao

  const [primeira, segunda] = faltaParaAbrir({
    realDialing: bandeira,
    primeiraChamadaDeTesteEm: texto(dados, 'first_test_call_ok_at'),
  })
  // Recusa do portão com as duas condições cumpridas não acontece pela guarda;
  // se o dado chegar assim, a frase genérica é mais honesta do que "falta nada".
  if (!primeira) return padrao

  const falta = segunda
    ? `${FRASE_DA_FALTA[primeira]} e ${FRASE_DA_FALTA[segunda]}`
    : FRASE_DA_FALTA[primeira]
  // Quando só falta a ligação de teste (a fase já liberou), a conta tem dois
  // caminhos, e a alternativa diz os dois: cadastrar este número como número de
  // teste, ou fazer a ligação de teste que abre o portão para lead real. Com a
  // liberação da fase faltando, a ligação de teste sozinha não abre nada, e
  // oferecê-la seria mandar a pessoa fazer algo que não resolve.
  return {
    mensagem: `${padrao.mensagem} Para ligar para lead real falta ${falta}.`,
    alternativa:
      primeira === 'primeira_chamada_de_teste' && !segunda
        ? ALTERNATIVA_SEM_LIGACAO_DE_TESTE
        : padrao.alternativa,
  }
}

const ALTERNATIVA_SEM_LIGACAO_DE_TESTE =
  'Cadastre este número na lista de teste em Discagem, na administração da conta, ou faça uma ligação de teste para um número da lista que termine com transcrição. Depois dela, a conta liga para lead real.'

function frasesDaJanela(
  dados: Readonly<Record<string, unknown>> | null,
  pedido: PedidoDeDiscagem,
): Frases {
  const fusoDoLead = texto(dados, 'timezone')
  const janela = dados?.['window']
  if (!fusoDoLead || janela === undefined) return FRASES_DA_RECUSA.fora_da_janela

  const entrada = {
    janela,
    instante: pedido.instante,
    fusoDoLead,
    fusoDaConta: pedido.fusoDaConta,
  }
  const abertura = fraseDaProximaAbertura(entrada)
  return {
    mensagem: `Agora está fora da janela de discagem deste lead: ${fraseDaJanela(entrada)}.`,
    alternativa: abertura
      ? `A janela abre de novo ${abertura}.`
      : 'Nenhum dia da semana está aberto para discagem nesta conta. Ajuste a janela em Discagem, na administração da conta.',
  }
}

function frasesDoIntervalo(
  dados: Readonly<Record<string, unknown>> | null,
  pedido: PedidoDeDiscagem,
): Frases {
  const padrao = FRASES_DA_RECUSA.intervalo_minimo
  const minutos = numero(dados, 'min_interval_minutes')
  const libera = texto(dados, 'next_allowed_at')

  return {
    mensagem: minutos
      ? `Este número foi discado há pouco, e a conta espera ${minutos} minutos entre duas ligações para o mesmo número.`
      : padrao.mensagem,
    alternativa: libera
      ? `Este número libera às ${horaNoFuso(pedido.fusoDaConta, libera)}. Para encurtar a espera, ajuste o intervalo mínimo em Discagem, na administração da conta.`
      : padrao.alternativa,
  }
}

/** A frase com o número do teto, e a frase sem ele quando o banco não o mandou. */
function comTeto(
  dados: Readonly<Record<string, unknown>> | null,
  chave: string,
  comValor: (teto: number) => string,
  semValor: string,
): string {
  const teto = numero(dados, chave)
  return teto === null ? semValor : comValor(teto)
}

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Centavos como quem lê a fatura os lê. Formatação, e não conta de teto. */
function emReais(centavos: number): string {
  return REAIS.format(centavos / 100)
}

// Leitura do `dados` -------------------------------------------------------------
//
// `dados` é `jsonb`: o tipo dele é promessa da função que o montou, e não do
// compilador. Cada leitura confere, e o que não vier no formato esperado cai na
// frase sem número — recusa com frase genérica é melhor do que `undefined`
// impresso no meio de uma sentença.

function lerDados(dados: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return null
  return dados as Readonly<Record<string, unknown>>
}

function texto(dados: Readonly<Record<string, unknown>> | null, chave: string): string | null {
  const valor = dados?.[chave]
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function numero(dados: Readonly<Record<string, unknown>> | null, chave: string): number | null {
  const valor = dados?.[chave]
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}
