// Provas do webhook de início. Ambiente node, sem rede e sem banco: a camada de
// dados é dublada por um armazenamento em memória que **se comporta como o
// banco** — o insert da ligação recebida respeita o índice único de
// `provider_conversation_id`, e `registrar_lead` com `ignorar` devolve o lead
// que já existe. Dublê que sempre insere provaria idempotência que o produto não
// tem.
//
// O que este arquivo segura:
//
// 1. **Nada é consultado antes da assinatura.** O dublê é um `Proxy` que
//    registra todo membro tocado, e a recusa de assinatura sai com o registro
//    vazio. É o que impede o endereço de virar sonda de quais números a
//    instalação atende.
// 2. **A saída resolve tudo pelo `call_id`** (T-25) e só preenche
//    `provider_conversation_id` — não cria segunda linha, e o webhook reenviado
//    não escreve de novo.
// 3. **A entrada grava `calls`** com `direction='inbound'`,
//    `provider_conversation_id` e a linha achada por `called_number` (T-14).
// 4. **O lead de quem ligou nasce com `source='inbound'`** (RF-108), e o lead
//    que já existia é reaproveitado, com o nome dele aparecendo na fala.
// 5. **A mesma conversa duas vezes não cria duas chamadas**, nos dois sentidos.
// 6. **O aviso de gravação nos dois estados da conta**: ligado, a abertura
//    avisa; desligado, ela não promete gravação nenhuma.
// 7. **Os dois 404**: `call_id` que não é desta instalação e número chamado que
//    esta instalação não atende.
//
// As frases são comparadas com as constantes de `_shared/speech/`, e não com
// literais repetidos aqui: com o texto copiado, o teste passaria verde com a
// fala escrita dentro da função, que é o que a convenção proíbe.

import { beforeEach, describe, expect, test } from 'vitest'

import { VARIAVEIS_DA_CHAMADA } from '../_shared/agente/compilador.ts'
import type { ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { montarFalaDeLembrete } from '../_shared/speech/lembrete.ts'
import { montarFalaDeResgate } from '../_shared/speech/resgate.ts'
import { PERFIS_DE_LEAD, perfilPeloId } from '../_shared/ensaio/perfis-de-lead.ts'
import { cabecalhoAssinado } from '../_shared/provedor/assinatura-de-webhook.ts'
import { derivarSegredoDoInicio } from '../_shared/provedor/webhooks-da-conta.ts'
import { FALAS_DE_TODO_PROPOSITO } from '../_shared/speech/todos-os-propositos.ts'

import {
  iniciarChamada,
  interpolar,
  ORIGEM_DA_ENTRADA,
  PREFIXO_DA_ENTRADA,
  type ChamadaEmCurso,
  type ContextoDaChamada,
  type LeadDaChamada,
  type LeadDaEntrada,
  type LinhaDeChamadaRecebida,
  type PortaDoContexto,
  type RecusaDoInicio,
  type RespostaDoInicio,
} from './contexto.ts'
import { corpoParaOProvedor, TIPO_DO_INICIO } from './formato-do-provedor.ts'

const SEGREDO = 'segredo-de-webhook-desta-instalacao'
const AGORA = 1_774_000_000

const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA_DE_SAIDA = '22222222-2222-4222-8222-222222222222'
const LINHA = '33333333-3333-4333-8333-333333333333'
const PUBLICACAO = '44444444-4444-4444-8444-444444444444'
const VERSAO = '55555555-5555-4555-8555-555555555555'
const LEAD_DA_SAIDA = '66666666-6666-4666-8666-666666666666'

const NUMERO_DA_LINHA = '+5548999990000'
const NUMERO_DE_QUEM_LIGOU = '+5511988887777'

const CONVERSA = 'conv_de_teste_0001'
const AGENTE_NO_PROVEDOR = 'agent_discovery_0001'

/** O armazenamento do dublê, que se comporta como as restrições do banco. */
interface Armazem {
  readonly saidas: Map<string, ChamadaEmCurso>
  readonly linhas: Map<string, { id: string; account_id: string; e164: string }>
  readonly leads: Map<string, LeadDaChamada>
  readonly recebidas: Map<string, LinhaDeChamadaRecebida & { id: string }>
  readonly leadsGravados: LeadDaEntrada[]
  gravacaoLigada: boolean
  avisoDaConta: string | null
  primeiraFalaDaConta: string | null
  temAgente: boolean
  /** `rehearsals.persona_profile.perfil`, pelo id da chamada. */
  readonly perfis: Map<string, string>
  /** `reuniao_em_jogo`, pelo id da chamada (US-194). */
  readonly reunioes: Map<string, ReuniaoEmJogo>
}

interface Bancada {
  readonly porta: PortaDoContexto
  readonly tocados: string[]
  readonly armazem: Armazem
}

let proximoId = 0

function novoId(): string {
  proximoId += 1
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(proximoId).padStart(12, '0')}`
}

function bancada(): Bancada {
  const armazem: Armazem = {
    saidas: new Map(),
    linhas: new Map(),
    leads: new Map(),
    recebidas: new Map(),
    leadsGravados: [],
    gravacaoLigada: true,
    avisoDaConta: null,
    primeiraFalaDaConta: null,
    temAgente: true,
    perfis: new Map(),
    reunioes: new Map(),
  }

  armazem.saidas.set(CHAMADA_DE_SAIDA, {
    id: CHAMADA_DE_SAIDA,
    account_id: CONTA,
    direction: 'outbound',
    lead_id: LEAD_DA_SAIDA,
    purpose: 'discovery',
    provider_conversation_id: null,
  })
  armazem.linhas.set(NUMERO_DA_LINHA, { id: LINHA, account_id: CONTA, e164: NUMERO_DA_LINHA })
  armazem.leads.set(LEAD_DA_SAIDA, {
    id: LEAD_DA_SAIDA,
    name: 'Joana',
    company: 'Fábrica de Parafusos',
    city: 'Florianópolis',
    state: 'SC',
  })

  const tocados: string[] = []

  const real: PortaDoContexto = {
    async chamadaDeSaida(chamadaId) {
      return armazem.saidas.get(chamadaId) ?? null
    },

    async marcarConversa(chamadaId, conversaId) {
      const atual = armazem.saidas.get(chamadaId)
      if (!atual) throw new Error('chamada inexistente')
      armazem.saidas.set(chamadaId, { ...atual, provider_conversation_id: conversaId })
    },

    async linhaPeloNumero(e164) {
      return armazem.linhas.get(e164) ?? null
    },

    async publicacaoPeloAgenteDoProvedor(_contaId, agenteDoProvedorId) {
      if (agenteDoProvedorId !== AGENTE_NO_PROVEDOR) return null
      return { id: PUBLICACAO, purpose: 'discovery' }
    },

    async publicacaoDoProposito(_contaId, proposito) {
      return { id: PUBLICACAO, purpose: proposito }
    },

    async versaoPublicadaDoPlaybook() {
      return { id: VERSAO }
    },

    async registrarLead(_contaId, lead) {
      armazem.leadsGravados.push(lead)
      // `ignorar`: o lead que já existe volta como estava, sem o que chegou.
      const id = chaveDoTelefone(lead.phone_e164)
      const jaGravado = armazem.leads.get(id)
      if (jaGravado) return { leadId: jaGravado.id, resultado: 'ignorado' }

      armazem.leads.set(id, {
        id,
        name: lead.name,
        company: null,
        city: lead.city,
        state: lead.state,
      })
      return { leadId: id, resultado: 'criado' }
    },

    async leadDaChamada(_contaId, leadId) {
      return armazem.leads.get(leadId) ?? null
    },

    async gravarChamadaRecebida(linha) {
      // O índice único global de `calls.provider_conversation_id`: o insert em
      // conflito devolve a linha que já está lá, sem criar uma segunda.
      const existente = armazem.recebidas.get(linha.provider_conversation_id)
      if (existente) {
        return { criada: false, chamada: comoChamada(existente) }
      }
      const gravada = { ...linha, id: novoId() }
      armazem.recebidas.set(linha.provider_conversation_id, gravada)
      return { criada: true, chamada: comoChamada(gravada) }
    },

    async identidadeDaConta() {
      if (!armazem.temAgente) return null
      return {
        nome: 'Sarah',
        empresa: 'Fábrica de Parafusos',
        primeiraFala: armazem.primeiraFalaDaConta,
      }
    },

    async politicaDaConta() {
      return { gravacaoLigada: armazem.gravacaoLigada, avisoDeGravacao: armazem.avisoDaConta }
    },

    async perfilDoEnsaio(chamadaId) {
      return armazem.perfis.get(chamadaId) ?? null
    },

    async reuniaoDaChamada(chamadaId) {
      return armazem.reunioes.get(chamadaId) ?? null
    },
  }

  const porta = new Proxy(real, {
    get(alvo, chave, receptor) {
      if (typeof chave === 'string') tocados.push(chave)
      return Reflect.get(alvo, chave, receptor) as unknown
    },
  })

  return { porta, tocados, armazem }
}

function chaveDoTelefone(e164: string): string {
  return `lead-de-${e164}`
}

function comoChamada(linha: LinhaDeChamadaRecebida & { id: string }): ChamadaEmCurso {
  return {
    id: linha.id,
    account_id: linha.account_id,
    direction: linha.direction,
    lead_id: linha.lead_id,
    purpose: linha.purpose,
    provider_conversation_id: linha.provider_conversation_id,
  }
}

/** O corpo que o provedor manda no começo da conversa. */
function corpoDoProvedor(campos: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(campos)
}

async function chamar(
  banca: Bancada,
  corpo: string,
  ajustes: { assinatura?: string | null; metodo?: string; agora?: number } = {},
): Promise<RespostaDoInicio> {
  return await iniciarChamada(
    {
      metodo: ajustes.metodo ?? 'POST',
      corpo,
      assinatura:
        ajustes.assinatura === undefined
          ? await cabecalhoAssinado(SEGREDO, AGORA, corpo)
          : ajustes.assinatura,
    },
    banca.porta,
    { segredoDoWebhook: SEGREDO, agoraEmSegundos: ajustes.agora ?? AGORA },
  )
}

function contexto(resposta: RespostaDoInicio): ContextoDaChamada {
  if (!resposta.corpo.ok) throw new Error(`esperava contexto, veio ${resposta.corpo.motivo}`)
  return resposta.corpo
}

function recusa(resposta: RespostaDoInicio): RecusaDoInicio {
  if (resposta.corpo.ok) throw new Error('esperava recusa, veio contexto')
  return resposta.corpo
}

const CORPO_DA_SAIDA = corpoDoProvedor({
  conversation_id: CONVERSA,
  agent_id: AGENTE_NO_PROVEDOR,
  call_sid: 'CA00000000000000000000000000000001',
  dynamic_variables: { call_id: CHAMADA_DE_SAIDA },
})

const CORPO_DA_ENTRADA = corpoDoProvedor({
  conversation_id: CONVERSA,
  agent_id: AGENTE_NO_PROVEDOR,
  called_number: NUMERO_DA_LINHA,
  caller_id: NUMERO_DE_QUEM_LIGOU,
  call_sid: 'CA00000000000000000000000000000002',
})

beforeEach(() => {
  proximoId = 0
})

describe('a assinatura vem antes de tudo', () => {
  test('ausente, malformada e inválida saem pela mesma porta, sem tocar no banco', async () => {
    const respostas: RespostaDoInicio[] = []
    for (const assinatura of [null, 'nem parece assinatura', `t=${AGORA},v0=${'d'.repeat(64)}`]) {
      const banca = bancada()
      const resposta = await chamar(banca, CORPO_DA_SAIDA, { assinatura })
      expect(banca.tocados).toEqual([])
      respostas.push(resposta)
    }
    expect(respostas[0]?.status).toBe(401)
    expect(respostas[1]).toEqual(respostas[0])
    expect(respostas[2]).toEqual(respostas[0])
  })

  test('pedido velho demais é recusado como assinatura inválida', async () => {
    const banca = bancada()
    const resposta = await chamar(banca, CORPO_DA_SAIDA, { agora: AGORA + 4 * 60 * 60 })
    expect(recusa(resposta).motivo).toBe('assinatura_invalida')
    expect(banca.tocados).toEqual([])
  })

  test('método diferente de POST nem chega na assinatura', async () => {
    const banca = bancada()
    const resposta = await chamar(banca, CORPO_DA_SAIDA, { metodo: 'GET' })
    expect(resposta.status).toBe(405)
    expect(banca.tocados).toEqual([])
  })

  test('corpo ilegível, já assinado, vira 400 sem consulta nenhuma', async () => {
    const banca = bancada()
    const resposta = await chamar(banca, 'isto não é json')
    expect(recusa(resposta).motivo).toBe('corpo_invalido')
    expect(banca.tocados).toEqual([])
  })
})

describe('chamada de saída', () => {
  test('resolve tudo pelo call_id e devolve o contexto do lead', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))

    expect(corpo.chamadaId).toBe(CHAMADA_DE_SAIDA)
    expect(corpo.contaId).toBe(CONTA)
    expect(corpo.sentido).toBe('outbound')
    expect(corpo.proposito).toBe('discovery')
    expect(corpo.lead).toEqual({
      id: LEAD_DA_SAIDA,
      nome: 'Joana',
      empresa: 'Fábrica de Parafusos',
      cidade: 'Florianópolis',
      estado: 'SC',
    })
    // Toda variável que o prompt publicado cita vai, com o valor do lead ou
    // o valor inicial seguro: nenhuma fica para o provedor ler crua.
    expect(corpo.variaveis).toEqual({
      nome_do_lead: 'Joana',
      empresa_do_lead: 'Fábrica de Parafusos',
      cidade_do_lead: 'Florianópolis',
      nome_do_especialista: '',
      nome_do_agente: 'Sarah',
      empresa: 'Fábrica de Parafusos',
      contexto_do_lead: '',
    })
    for (const variavel of VARIAVEIS_DA_CHAMADA) expect(Object.keys(corpo.variaveis)).toContain(variavel)
    // Chamada real não tem ensaio: o perfil nem é procurado.
    expect(banca.tocados).not.toContain('perfilDoEnsaio')
  })

  test('a reunião em jogo vai vazia, porque meetings é da F5', async () => {
    const banca = bancada()
    expect(contexto(await chamar(banca, CORPO_DA_SAIDA)).reuniao).toBeNull()
  })

  test('preenche provider_conversation_id e não cria segunda linha', async () => {
    const banca = bancada()
    await chamar(banca, CORPO_DA_SAIDA)

    expect(banca.armazem.saidas.get(CHAMADA_DE_SAIDA)?.provider_conversation_id).toBe(CONVERSA)
    expect(banca.armazem.recebidas.size).toBe(0)
  })

  test('a mesma conversa chegando duas vezes não escreve de novo nem cria chamada', async () => {
    const banca = bancada()
    const primeira = contexto(await chamar(banca, CORPO_DA_SAIDA))
    const segunda = contexto(await chamar(banca, CORPO_DA_SAIDA))

    expect(segunda.chamadaId).toBe(primeira.chamadaId)
    expect(banca.armazem.saidas.size).toBe(1)
    expect(banca.armazem.recebidas.size).toBe(0)
    // A segunda passagem já achou o identificador preenchido e não escreveu.
    expect(banca.tocados.filter((nome) => nome === 'marcarConversa')).toHaveLength(1)
  })

  test('call_id que não é desta instalação devolve 404 com frase de contorno', async () => {
    const banca = bancada()
    const corpo = corpoDoProvedor({
      conversation_id: CONVERSA,
      dynamic_variables: { call_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    })
    const resposta = await chamar(banca, corpo)

    expect(resposta.status).toBe(404)
    expect(recusa(resposta).motivo).toBe('chamada_desconhecida')
    expect(recusa(resposta).mensagem).toMatch(/\S/)
    expect(banca.armazem.recebidas.size).toBe(0)
  })
})

describe('chamada de entrada', () => {
  test('grava calls com direction inbound, a conversa e a linha do número chamado', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_ENTRADA))

    const gravada = banca.armazem.recebidas.get(CONVERSA)
    expect(gravada).toBeDefined()
    expect(gravada?.direction).toBe('inbound')
    expect(gravada?.status).toBe('in_progress')
    expect(gravada?.account_id).toBe(CONTA)
    expect(gravada?.phone_line_id).toBe(LINHA)
    expect(gravada?.provider_conversation_id).toBe(CONVERSA)
    expect(gravada?.from_number).toBe(NUMERO_DE_QUEM_LIGOU)
    expect(gravada?.to_number).toBe(NUMERO_DA_LINHA)
    expect(gravada?.agent_publication_id).toBe(PUBLICACAO)
    expect(gravada?.playbook_version_id).toBe(VERSAO)
    expect(gravada?.idempotency_key).toBe(`${PREFIXO_DA_ENTRADA}:${CONVERSA}`)

    expect(corpo.sentido).toBe('inbound')
    expect(corpo.chamadaCriada).toBe(true)
    expect(corpo.chamadaId).toBe(gravada?.id)
  })

  test('cria o lead de quem ligou com source inbound e o fuso do DDD', async () => {
    const banca = bancada()
    await chamar(banca, CORPO_DA_ENTRADA)

    expect(banca.armazem.leadsGravados).toHaveLength(1)
    const lead = banca.armazem.leadsGravados[0]
    expect(lead?.source).toBe(ORIGEM_DA_ENTRADA)
    expect(lead?.phone_e164).toBe(NUMERO_DE_QUEM_LIGOU)
    expect(lead?.state).toBe('SP')
    expect(lead?.timezone).toBe('America/Sao_Paulo')
  })

  test('lead que já existe é reaproveitado, e o nome dele entra na fala', async () => {
    const banca = bancada()
    banca.armazem.leads.set(chaveDoTelefone(NUMERO_DE_QUEM_LIGOU), {
      id: chaveDoTelefone(NUMERO_DE_QUEM_LIGOU),
      name: 'Rui',
      company: null,
      city: 'São Paulo',
      state: 'SP',
    })

    const corpo = contexto(await chamar(banca, CORPO_DA_ENTRADA))

    expect(corpo.lead?.nome).toBe('Rui')
    expect(corpo.variaveis.nome_do_lead).toBe('Rui')
    expect(corpo.primeiraFala).toContain('Rui')
    expect(banca.armazem.leads.size).toBe(2)
  })

  test('a mesma conversa chegando duas vezes não cria duas chamadas', async () => {
    const banca = bancada()
    const primeira = contexto(await chamar(banca, CORPO_DA_ENTRADA))
    const segunda = contexto(await chamar(banca, CORPO_DA_ENTRADA))

    expect(banca.armazem.recebidas.size).toBe(1)
    expect(segunda.chamadaId).toBe(primeira.chamadaId)
    expect(primeira.chamadaCriada).toBe(true)
    expect(segunda.chamadaCriada).toBe(false)
  })

  test('número que esta instalação não atende devolve 404 e não grava nada', async () => {
    const banca = bancada()
    const corpo = corpoDoProvedor({
      conversation_id: CONVERSA,
      called_number: '+5511000000000',
      caller_id: NUMERO_DE_QUEM_LIGOU,
    })
    const resposta = await chamar(banca, corpo)

    expect(resposta.status).toBe(404)
    expect(recusa(resposta).motivo).toBe('linha_desconhecida')
    expect(banca.armazem.recebidas.size).toBe(0)
    expect(banca.armazem.leadsGravados).toHaveLength(0)
  })

  test('entrada sem o identificador da conversa é recusada antes de qualquer escrita', async () => {
    const banca = bancada()
    const resposta = await chamar(
      banca,
      corpoDoProvedor({ called_number: NUMERO_DA_LINHA, caller_id: NUMERO_DE_QUEM_LIGOU }),
    )

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('conversa_ausente')
    expect(banca.armazem.recebidas.size).toBe(0)
    expect(banca.armazem.leadsGravados).toHaveLength(0)
  })
})

describe('a abertura e o aviso de gravação', () => {
  const valores = {
    nome_do_lead: 'Joana',
    nome_do_agente: 'Sarah',
    empresa: 'Fábrica de Parafusos',
  }

  test('com a gravação ligada, a abertura avisa e o aviso sai na resposta', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))

    const esperada = interpolar(FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, valores)
    expect(corpo.primeiraFala).toBe(esperada)
    expect(corpo.avisoDeGravacao).toBe(esperada)
  })

  test('com a gravação desligada, a abertura não promete gravação nenhuma', async () => {
    const banca = bancada()
    banca.armazem.gravacaoLigada = false
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))

    expect(corpo.avisoDeGravacao).toBeNull()
    expect(corpo.primeiraFala).toBe(
      interpolar(FALAS_DE_TODO_PROPOSITO.aberturaSemGravacao, valores),
    )
    expect(corpo.primeiraFala).not.toContain('gravada')
  })

  test('sem nome do lead, a abertura é a frase inteira sem marcador de nome', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_ENTRADA))

    expect(corpo.lead?.nome).toBeNull()
    expect(corpo.primeiraFala).toBe(
      interpolar(FALAS_DE_TODO_PROPOSITO.avisoDeGravacaoSemNome, {
        nome_do_agente: 'Sarah',
        empresa: 'Fábrica de Parafusos',
      }),
    )
    expect(corpo.primeiraFala).not.toContain('Oi, ?')
  })

  test('a conta que escreveu o próprio aviso vence a frase da camada 1', async () => {
    const banca = bancada()
    banca.armazem.avisoDaConta = 'Oi, {nome_do_lead}. A gente grava as ligações, tudo bem?'
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))

    expect(corpo.avisoDeGravacao).toBe('Oi, Joana. A gente grava as ligações, tudo bem?')
  })

  test('a primeira fala da conta vence o padrão, já com o lead dentro', async () => {
    const banca = bancada()
    banca.armazem.primeiraFalaDaConta = 'Oi {nome_do_lead}, é a {nome_do_agente} de novo!'
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))

    expect(corpo.primeiraFala).toBe('Oi Joana, é a Sarah de novo!')
  })

  test('conta sem agente montado é recusada com frase, e não com erro técnico', async () => {
    const banca = bancada()
    banca.armazem.temAgente = false
    const resposta = await chamar(banca, CORPO_DA_SAIDA)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('conta_sem_agente')
  })
})

describe('chamada de ensaio', () => {
  const CHAMADA_DE_ENSAIO = '77777777-7777-4777-8777-777777777777'
  const LEAD_DE_ENSAIO = '88888888-8888-4888-8888-888888888888'
  const CORPO_DO_ENSAIO = corpoDoProvedor({
    conversation_id: 'conv_de_ensaio_0001',
    agent_id: AGENTE_NO_PROVEDOR,
    dynamic_variables: { call_id: CHAMADA_DE_ENSAIO },
  })

  function comEnsaio(perfil: string | null): Bancada {
    const banca = bancada()
    banca.armazem.saidas.set(CHAMADA_DE_ENSAIO, {
      id: CHAMADA_DE_ENSAIO,
      account_id: CONTA,
      direction: 'rehearsal',
      lead_id: LEAD_DE_ENSAIO,
      purpose: 'discovery',
      provider_conversation_id: null,
    })
    banca.armazem.leads.set(LEAD_DE_ENSAIO, {
      id: LEAD_DE_ENSAIO,
      name: 'Paula Siqueira',
      company: 'Transportes Itajaí',
      city: null,
      state: null,
    })
    if (perfil) banca.armazem.perfis.set(CHAMADA_DE_ENSAIO, perfil)
    return banca
  }

  test.each(PERFIS_DE_LEAD.map((perfil) => perfil.id))(
    'o perfil %s chega pelo call_id, com o lead de ensaio e o contexto do catálogo',
    async (id) => {
      const banca = comEnsaio(id)
      const corpo = contexto(await chamar(banca, CORPO_DO_ENSAIO))

      expect(corpo.sentido).toBe('rehearsal')
      expect(corpo.lead?.nome).toBe('Paula Siqueira')
      expect(corpo.variaveis.nome_do_lead).toBe('Paula Siqueira')
      expect(corpo.variaveis.contexto_do_lead).toBe(perfilPeloId(id)?.contexto)
      // O mesmo caminho da ligação real: só call_id viajou, e o resto saiu daqui.
      expect(corpoParaOProvedor(corpo).dynamic_variables.call_id).toBe(CHAMADA_DE_ENSAIO)
    },
  )

  test('perfil fora do catálogo não inventa contexto', async () => {
    const banca = comEnsaio('inventado')
    const corpo = contexto(await chamar(banca, CORPO_DO_ENSAIO))
    expect(corpo.variaveis.contexto_do_lead).toBe('')
  })

  test('o contexto que o navegador mandasse não entra', async () => {
    const banca = comEnsaio('apressado')
    const corpo = contexto(
      await chamar(
        banca,
        corpoDoProvedor({
          conversation_id: 'conv_de_ensaio_0002',
          dynamic_variables: {
            call_id: CHAMADA_DE_ENSAIO,
            nome_do_lead: 'Outro Nome',
            contexto_do_lead: 'contexto de fora',
          },
        }),
      ),
    )
    expect(corpo.variaveis.nome_do_lead).toBe('Paula Siqueira')
    expect(corpo.variaveis.contexto_do_lead).toBe(perfilPeloId('apressado')?.contexto)
  })
})

describe('o corpo que volta para o provedor', () => {
  test('leva as variáveis do contexto e o call_id, com a primeira fala sobreposta', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_SAIDA))
    const paraOProvedor = corpoParaOProvedor(corpo)

    expect(paraOProvedor.type).toBe(TIPO_DO_INICIO)
    expect(paraOProvedor.dynamic_variables).toEqual({
      ...corpo.variaveis,
      call_id: CHAMADA_DE_SAIDA,
    })
    expect(paraOProvedor.conversation_config_override.agent.first_message).toBe(corpo.primeiraFala)
  })

  test('na entrada, o call_id que volta é o da chamada que acabou de nascer', async () => {
    const banca = bancada()
    const corpo = contexto(await chamar(banca, CORPO_DA_ENTRADA))

    expect(corpoParaOProvedor(corpo).dynamic_variables.call_id).toBe(corpo.chamadaId)
  })
})

describe('falha da camada de dados', () => {
  test('vira 500 com frase, e nunca deixa a exceção escapar', async () => {
    const banca = bancada()
    const porta: PortaDoContexto = {
      ...banca.porta,
      async chamadaDeSaida() {
        throw new Error('o banco caiu')
      },
    }

    const resposta = await iniciarChamada(
      {
        metodo: 'POST',
        corpo: CORPO_DA_SAIDA,
        assinatura: await cabecalhoAssinado(SEGREDO, AGORA, CORPO_DA_SAIDA),
      },
      porta,
      { segredoDoWebhook: SEGREDO, agoraEmSegundos: AGORA },
    )

    expect(resposta.status).toBe(500)
    expect(recusa(resposta).motivo).toBe('falha_interna')
  })
})

describe('segredo do início por conta (?conta=)', () => {
  const CHAVE_DO_SERVIDOR = 'chave-do-servidor-desta-instalacao'
  const OUTRA_CONTA = '99999999-9999-4999-8999-999999999999'

  async function chamarComSegredo(
    banca: Bancada,
    corpo: string,
    ajustes: { conta?: string | null; segredo?: string | null; chave?: string | null } = {},
  ): Promise<RespostaDoInicio> {
    const conta = ajustes.conta === undefined ? CONTA : ajustes.conta
    const segredo =
      ajustes.segredo === undefined ? await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, CONTA) : ajustes.segredo
    return await iniciarChamada(
      { metodo: 'POST', corpo, assinatura: null, contaDoEndereco: conta, segredoDoInicio: segredo },
      banca.porta,
      {
        segredoDoWebhook: SEGREDO,
        agoraEmSegundos: AGORA,
        chavesDoServidor: ajustes.chave === null ? null : { vigente: ajustes.chave ?? CHAVE_DO_SERVIDOR },
      },
    )
  }

  test('o cabeçalho da conta, sem assinatura nenhuma, abre o contexto da saída', async () => {
    const banca = bancada()
    const corpo = contexto(await chamarComSegredo(banca, CORPO_DA_SAIDA))
    expect(corpo.chamadaId).toBe(CHAMADA_DE_SAIDA)
    expect(corpo.contaId).toBe(CONTA)
  })

  test('e cria a chamada recebida na conta que ele provou', async () => {
    const banca = bancada()
    const corpo = contexto(await chamarComSegredo(banca, CORPO_DA_ENTRADA))
    expect(corpo.sentido).toBe('inbound')
    expect(corpo.contaId).toBe(CONTA)
  })

  test('errado, ausente, de outra conta, sem conta ou sem chave do servidor: o mesmo 401, sem tocar no banco', async () => {
    const casos: NonNullable<Parameters<typeof chamarComSegredo>[2]>[] = [
      { segredo: 'e'.repeat(64) },
      { segredo: null },
      { segredo: 'curto' },
      { conta: OUTRA_CONTA },
      { conta: null },
      { chave: null },
      { chave: 'outra-chave-do-servidor' },
    ]
    const respostas: RespostaDoInicio[] = []
    for (const caso of casos) {
      const banca = bancada()
      respostas.push(await chamarComSegredo(banca, CORPO_DA_SAIDA, caso))
      expect(banca.tocados).toEqual([])
    }
    expect(respostas[0]?.status).toBe(401)
    for (const resposta of respostas) expect(resposta).toEqual(respostas[0])
  })

  test('o segredo de uma conta não alcança a chamada de outra: é o 404 da inexistente', async () => {
    const banca = bancada()
    const segredoDaOutra = await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, OUTRA_CONTA)
    const resposta = await chamarComSegredo(banca, CORPO_DA_SAIDA, {
      conta: OUTRA_CONTA,
      segredo: segredoDaOutra,
    })
    const inexistente = await chamarComSegredo(
      bancada(),
      corpoDoProvedor({ conversation_id: CONVERSA, dynamic_variables: { call_id: novoId() } }),
      { conta: OUTRA_CONTA, segredo: segredoDaOutra },
    )
    expect(resposta.status).toBe(404)
    expect(resposta).toEqual(inexistente)
    expect(banca.tocados).not.toContain('marcarConversa')
  })

  test('nem o número de outra conta, que não vira chamada nela', async () => {
    const banca = bancada()
    const resposta = await chamarComSegredo(banca, CORPO_DA_ENTRADA, {
      conta: OUTRA_CONTA,
      segredo: await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, OUTRA_CONTA),
    })
    expect(recusa(resposta).motivo).toBe('linha_desconhecida')
    expect(banca.armazem.recebidas.size).toBe(0)
  })

  test('a assinatura da instalação continua valendo, com ou sem conta no endereço', async () => {
    const banca = bancada()
    const resposta = await iniciarChamada(
      {
        metodo: 'POST',
        corpo: CORPO_DA_SAIDA,
        assinatura: await cabecalhoAssinado(SEGREDO, AGORA, CORPO_DA_SAIDA),
        contaDoEndereco: CONTA,
        segredoDoInicio: 'f'.repeat(64),
      },
      banca.porta,
      { segredoDoWebhook: SEGREDO, agoraEmSegundos: AGORA, chavesDoServidor: { vigente: CHAVE_DO_SERVIDOR } },
    )
    expect(contexto(resposta).chamadaId).toBe(CHAMADA_DE_SAIDA)
  })
})

describe('a reunião em jogo no lembrete e no resgate (US-194)', () => {
  const INICIO = new Date((AGORA + 20 * 60) * 1000).toISOString()
  const reuniao: ReuniaoEmJogo = {
    id: '77777777-7777-4777-8777-777777777777',
    contaId: CONTA,
    leadId: LEAD_DA_SAIDA,
    status: 'scheduled',
    inicio: INICIO,
    fim: new Date((AGORA + 50 * 60) * 1000).toISOString(),
    modalidade: 'video',
    especialistaId: '88888888-8888-4888-8888-888888888888',
    nomeDoEspecialista: 'Ana',
    fusoDoLead: 'America/Manaus',
    fusoDoEspecialista: 'America/Sao_Paulo',
  }

  function comProposito(proposito: string): Bancada {
    const banca = bancada()
    const saida = banca.armazem.saidas.get(CHAMADA_DE_SAIDA)!
    banca.armazem.saidas.set(CHAMADA_DE_SAIDA, { ...saida, purpose: proposito as ChamadaEmCurso['purpose'] })
    banca.armazem.reunioes.set(CHAMADA_DE_SAIDA, reuniao)
    return banca
  }

  test('no lembrete, o motivo da ligação vai no contexto do lead, com o horário no fuso do lead', async () => {
    const corpo = contexto(await chamar(comProposito('reminder'), CORPO_DA_SAIDA))
    const agora = new Date(AGORA * 1000).toISOString()
    expect(corpo.variaveis.contexto_do_lead).toBe(
      `Motivo da ligação, para dizer logo depois da abertura: ${montarFalaDeLembrete(reuniao, agora)}`,
    )
    expect(corpo.variaveis.contexto_do_lead).toContain('no seu horário')
    expect(corpo.variaveis.contexto_do_lead).not.toContain(reuniao.id)
  })

  test('no resgate, o motivo é a pergunta do resgate', async () => {
    const corpo = contexto(await chamar(comProposito('rescue'), CORPO_DA_SAIDA))
    const agora = new Date(AGORA * 1000).toISOString()
    expect(corpo.variaveis.contexto_do_lead).toContain(montarFalaDeResgate(reuniao, agora))
  })

  test('lembrete sem reunião em jogo segue com o contexto vazio', async () => {
    const banca = comProposito('reminder')
    banca.armazem.reunioes.clear()
    expect(contexto(await chamar(banca, CORPO_DA_SAIDA)).variaveis.contexto_do_lead).toBe('')
  })

  test('descoberta nem procura reunião', async () => {
    const banca = bancada()
    banca.armazem.reunioes.set(CHAMADA_DE_SAIDA, reuniao)
    expect(contexto(await chamar(banca, CORPO_DA_SAIDA)).variaveis.contexto_do_lead).toBe('')
    expect(banca.tocados).not.toContain('reuniaoDaChamada')
  })
})
