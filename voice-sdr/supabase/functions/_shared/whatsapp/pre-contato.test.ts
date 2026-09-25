import { expect, test } from 'vitest'

import { enviarPreContato, textoDoPreContato, type PortaDoPreContato } from './pre-contato.ts'

const CONTA = 'conta-1'
const LEAD = 'lead-1'

function porta(ajustes: Partial<PortaDoPreContato> = {}) {
  const feito: string[] = []
  const valor: PortaDoPreContato = {
    configuracao: async () => ({ ligado: true, texto: null }),
    identidade: async () => ({ nome: 'Ana', empresa: 'Fluxo Cargo' }),
    lead: async () => ({ nome: 'Joana', telefone: '+5548999998888' }),
    numeroBloqueado: async () => false,
    atendeONumero: async () => true,
    credenciais: async () => ({ instance_id: 'i', token: 't', client_token: 'c' }),
    mensagemNossaDesde: async () => false,
    abrirConversa: async () => {
      feito.push('abrir')
      return { conversaId: 'conversa-1', criada: true }
    },
    enviar: async (_c, telefone, texto) => {
      feito.push(`enviar:${telefone}:${texto}`)
      return { ok: true, idDoProvedor: 'z1' }
    },
    registrarSaida: async (saida) => {
      feito.push(`gravar:${saida.envio.ok ? 'enviada' : 'falhou'}`)
      return 'm1'
    },
    narrar: async (_conta, lead, conversa) => void feito.push(`narrar:${lead}:${conversa}`),
    ...ajustes,
  }
  return { valor, feito }
}

test('manda a fala padrão com o lead e a assistente, grava e narra', async () => {
  const { valor, feito } = porta()
  expect(await enviarPreContato({ contaId: CONTA, leadId: LEAD }, valor)).toBe('enviado')
  expect(feito).toEqual([
    'abrir',
    'enviar:+5548999998888:Oi, Joana! Aqui é Ana, da Fluxo Cargo. Estou te ligando agora, tudo bem?',
    'gravar:enviada',
    'narrar:lead-1:conversa-1',
  ])
})

test('o texto da conta vence, e marcador sem valor some com a preposição', () => {
  expect(textoDoPreContato('Oi {nome_do_lead}, é a {nome_do_agente} da {empresa}!', { nome: 'Ana', empresa: '' }, null)).toBe(
    'Oi, é a Ana!',
  )
  expect(textoDoPreContato(null, null, 'Joana')).toBe('Oi, Joana! Estou te ligando agora, tudo bem?')
})

test('desligado, sem lead, bloqueado, sem chaves e mensagem recente não mandam nada', async () => {
  const casos: [Partial<PortaDoPreContato>, string][] = [
    [{ configuracao: async () => ({ ligado: false, texto: null }) }, 'desligado'],
    [{ lead: async () => null }, 'sem_lead'],
    [{ numeroBloqueado: async () => true }, 'numero_bloqueado'],
    [{ atendeONumero: async () => false }, 'fora_do_modo_de_teste'],
    [{ credenciais: async () => null }, 'whatsapp_nao_configurado'],
    [{ mensagemNossaDesde: async () => true }, 'ja_houve_mensagem'],
  ]
  for (const [ajuste, esperado] of casos) {
    const { valor, feito } = porta(ajuste)
    expect(await enviarPreContato({ contaId: CONTA, leadId: LEAD }, valor)).toBe(esperado)
    expect(feito).toEqual([])
  }
  expect(await enviarPreContato({ contaId: CONTA, leadId: null }, porta().valor)).toBe('sem_lead')
})

test('envio que falha fica gravado e não narra', async () => {
  const { valor, feito } = porta({ enviar: async () => ({ ok: false, codigo: '500' }) })
  expect(await enviarPreContato({ contaId: CONTA, leadId: LEAD }, valor)).toBe('envio_falhou')
  expect(feito).toEqual(['abrir', 'gravar:falhou'])
})
