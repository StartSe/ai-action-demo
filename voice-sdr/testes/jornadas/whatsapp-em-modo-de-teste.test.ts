// Jornada da persona 3 (docs/personas.md): Juliana, coordenadora de pré-vendas
// de uma escola de cursos técnicos, com a Z-API ligada no número comercial que
// o time inteiro já usa. O medo dela é concreto: a assistente responder aluno
// antigo, fornecedor ou a mãe de alguém enquanto ela ainda está testando.
//
// O caminho, pela borda de `whatsapp-inbound` com o canal em memória e o modelo
// dublado (a mesma porta que `entrada.test.ts` usa): no modo de teste, só o
// celular dela conversa, com a assistente respondendo com o histórico da
// conversa; quem está fora da lista não vira lead nem recebe nada; "parar" do
// celular dela bloqueia e confirma uma vez; e só quando ela passa para "todos"
// o número de fora vira lead.
//
// Nada de rede nem de banco: o canal em memória imita as escritas, e o que o
// banco decide sobre o modo está em testes/banco/modo-de-teste-do-whatsapp.test.ts.

import { describe, expect, test } from 'vitest'

import type { PedidoDaRodada, RespostaDaRodada } from '../../supabase/functions/_shared/modelo/conversa-com-ferramentas.ts'
import { FALAS_DO_WHATSAPP } from '../../supabase/functions/_shared/speech/whatsapp.ts'
import { enderecoDoWebhookDoWhatsapp } from '../../supabase/functions/_shared/whatsapp/endereco.ts'
import { responderConversa, type AgenteDaConta } from '../../supabase/functions/_shared/whatsapp/resposta.ts'
import { RECEBIDA_DE_TEXTO } from '../../supabase/functions/_shared/whatsapp/zapi-exemplos.ts'
import { receberWebhook, type RespostaDoWebhook } from '../../supabase/functions/whatsapp-inbound/entrada.ts'
import { criarCanalEmMemoria, type CanalEmMemoria } from '../../supabase/functions/whatsapp-inbound/porta-em-memoria.ts'

const CHAVE = 'chave-do-servidor'
const CONTA = '11111111-2222-4333-8444-555555555555'
const BASE = 'https://escola.supabase.co/functions/v1'
const ENDERECO = await enderecoDoWebhookDoWhatsapp(BASE, CHAVE, CONTA)
const AMBIENTE = { chaves: { vigente: CHAVE }, log: () => {} }

const CELULAR_DA_JULIANA = '+5541999990001'
const ALUNO_ANTIGO = '+5541988887777'

const AGENTE: AgenteDaConta = {
  identidade: { nome: 'Bia', empresa: 'Escola Técnica Horizonte', oferta: 'cursos técnicos noturnos', nuncaAfirmar: ['bolsa garantida'] },
  playbook: {
    playbookVersionId: '11111111-1111-4111-8111-111111111111',
    versao: 1,
    camadaDois: 'Descubra o curso de interesse e o turno.',
    camadaTres: '',
  },
  politica: { duracaoMaximaSegundos: 600, gravacaoLigada: false, avisoDeGravacao: null, retencaoDias: 90 },
  criterios: [],
}

/** O canal do número comercial, no modo com que o banco o cria. */
function canalDaEscola(): CanalEmMemoria & { pedidos: PedidoDaRodada[] } {
  const pedidos: PedidoDaRodada[] = []
  const respostas = [
    'Oi, Juliana! Aqui é a Bia, da Escola Técnica Horizonte. Qual curso te interessa?',
    'Ótimo. O de Eletrotécnica tem turma à noite. Quer que eu marque uma conversa com a coordenação?',
  ]
  const canal = criarCanalEmMemoria({ agente: AGENTE }) as CanalEmMemoria & { pedidos: PedidoDaRodada[] }
  canal.pedidos = pedidos
  canal.modo = 'teste'
  canal.numerosDeTeste.add(CELULAR_DA_JULIANA)
  canal.motor = {
    ferramentas: new Map(),
    async rodada(pedido: PedidoDaRodada): Promise<RespostaDaRodada> {
      pedidos.push(pedido)
      return { ok: true, texto: respostas[Math.min(pedidos.length - 1, respostas.length - 1)] ?? null, chamadas: [] }
    },
  }
  return canal
}

let sequencia = 0
function mensagemDe(telefone: string, texto: string, nome = 'Juliana Prado') {
  sequencia += 1
  return {
    ...RECEBIDA_DE_TEXTO,
    messageId: `JORNADA-${sequencia}`,
    phone: telefone.replace('+', ''),
    senderName: nome,
    chatName: nome,
    text: { message: texto },
  }
}

async function receberEResponder(canal: CanalEmMemoria, corpo: unknown): Promise<RespostaDoWebhook> {
  const resposta = await receberWebhook({ metodo: 'POST', endereco: ENDERECO, corpo: JSON.stringify(corpo) }, canal.porta, AMBIENTE)
  if (resposta.depois) {
    await resposta.depois((conta, conversa) =>
      responderConversa({ contaId: conta, conversaId: conversa }, canal.porta, { esperar: async () => {} }),
    )
  }
  return resposta
}

describe('Juliana: o WhatsApp do número comercial, testado sem risco', () => {
  test('o celular de teste conversa, e a segunda resposta já leva a primeira troca no histórico', async () => {
    const canal = canalDaEscola()

    await receberEResponder(canal, mensagemDe(CELULAR_DA_JULIANA, 'Oi, vi o anúncio do curso técnico'))
    await receberEResponder(canal, mensagemDe(CELULAR_DA_JULIANA, 'Eletrotécnica, à noite'))

    expect(canal.envios).toEqual([
      { telefone: CELULAR_DA_JULIANA, texto: expect.stringContaining('Aqui é a Bia') },
      { telefone: CELULAR_DA_JULIANA, texto: expect.stringContaining('Eletrotécnica tem turma à noite') },
    ])
    // A segunda rodada viu a conversa inteira: as duas mensagens dela e a resposta.
    const historico = JSON.stringify(canal.pedidos.at(-1)?.mensagens ?? [])
    expect(historico).toContain('vi o anúncio do curso técnico')
    expect(historico).toContain('Aqui é a Bia')
    expect(historico).toContain('Eletrotécnica, à noite')
    // O lead nasce com a origem do canal.
    expect([...canal.leads.values()]).toMatchObject([{ phone_e164: CELULAR_DA_JULIANA, source: 'whatsapp' }])
  })

  test('o aluno antigo que escreve para o mesmo número não vira lead nem recebe resposta', async () => {
    const canal = canalDaEscola()

    const resposta = await receberEResponder(canal, mensagemDe(ALUNO_ANTIGO, 'Oi, preciso da segunda via do boleto', 'Rodrigo'))

    expect(resposta.corpo).toMatchObject({ ignorada: 'fora_do_modo_de_teste' })
    expect(canal.leads.size).toBe(0)
    expect(canal.conversas.size).toBe(0)
    expect(canal.envios).toEqual([])
    expect(canal.pedidos).toHaveLength(0)
  })

  test('"parar" do celular de teste bloqueia, encerra e confirma uma vez só', async () => {
    const canal = canalDaEscola()
    await receberEResponder(canal, mensagemDe(CELULAR_DA_JULIANA, 'Oi'))

    const parar = mensagemDe(CELULAR_DA_JULIANA, 'parar')
    await receberEResponder(canal, parar)
    await receberEResponder(canal, parar)

    expect(canal.bloqueados.has(CELULAR_DA_JULIANA)).toBe(true)
    expect(canal.envios.filter((envio) => envio.texto === FALAS_DO_WHATSAPP.descadastro)).toHaveLength(1)
    expect([...canal.conversas.values()][0]?.status).toBe('encerrada')
  })

  test('passar o canal para "todos" é o que faz o número de fora virar lead', async () => {
    const canal = canalDaEscola()
    canal.modo = 'todos'

    await receberEResponder(canal, mensagemDe(ALUNO_ANTIGO, 'Vocês têm curso de enfermagem?', 'Rodrigo'))

    expect([...canal.leads.values()].map((lead) => lead.phone_e164)).toEqual([ALUNO_ANTIGO])
    expect(canal.envios.map((envio) => envio.telefone)).toEqual([ALUNO_ANTIGO])
  })
})
