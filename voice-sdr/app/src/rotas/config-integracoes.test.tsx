import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ESTADO_EM_PORTUGUES, integracoes as copy } from '@/copy/integracoes'
import { textoDaInstrucao } from '@/copy/instrucoes-das-chaves'
import type { Integracao } from '@/integracoes/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { hashDaChaveDeEntrada } from '@compartilhado/chave-de-entrada'
import {
  ENDERECO_DE_ENTRADA_DE_EXEMPLO,
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
  type RespostasDeIntegracoes,
} from '@/testes/servico-de-integracoes-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { criarServicoDeWhatsappDublado, type RespostasDoWhatsapp } from '@/testes/servico-de-whatsapp-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function abrirIntegracoes(respostas: RespostasDeIntegracoes = {}) {
  const servico = criarServicoDeIntegracoesDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/integracoes',
    undefined,
    undefined,
    servico,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return servico
}

/** O cartão de um provedor, pelo rótulo que a resposta trouxe. */
function cartao(rotulo: string) {
  return within(screen.getByRole('region', { name: rotulo }))
}

describe('tela de integrações', () => {
  it('desenha um cartão por provedor, com rótulo e fornecedor', async () => {
    await abrirIntegracoes()

    // Um por provedor de credencial, mais o cartão do provedor de modelo
    // (US-246), que não vem da carga de integrações: ele lê o estado próprio
    // e é onde o OAuth do OpenRouter acontece. E o formulário do site (D-02).
    await waitFor(() =>
      expect(screen.getAllByRole('region')).toHaveLength(
        integracoesDeExemplo().length + 2,
      ),
    )

    for (const integracao of integracoesDeExemplo()) {
      const cartaoDoProvedor = cartao(integracao.rotulo)
      expect(
        cartaoDoProvedor.getByRole('heading', { name: integracao.rotulo }),
      ).toBeDefined()
      expect(cartaoDoProvedor.getByText(integracao.fornecedor)).toBeDefined()
    }
  })

  it('o calendário pelo Google é avançado: sem chave nenhuma cadastrada, o cartão não aparece', async () => {
    const semCalendario = integracoesDeExemplo().map((item) =>
      item.provedor === 'calendario'
        ? { ...item, chaves: item.chaves.map((chave) => ({ ...chave, preenchida: false })) }
        : item,
    )
    await abrirIntegracoes({ integracoes: semCalendario })
    await screen.findByRole('region', { name: 'Voz conversacional' })

    expect(screen.queryByRole('region', { name: 'Calendário' })).toBeNull()
    expect(screen.getAllByRole('region')).toHaveLength(integracoesDeExemplo().length + 1)
  })

  it('o e-mail da conta pede a chave e o remetente, com onde verificar o domínio', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'E-mail transacional' })

    const email = cartao('E-mail transacional')
    const remetente = email.getByLabelText('remetente (nome e e-mail)')
    expect(remetente).toBeDefined()
    const instrucao = textoDaInstrucao('email', 'remetente') ?? ''
    expect(instrucao).toMatch(/Domains/)
    expect(instrucao).toMatch(/verificado/)
    expect(email.getByText(instrucao)).toBeDefined()
  })

  it('mostra os quatro estados que vêm do servidor, cada um no seu cartão', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Voz conversacional' })

    expect(
      cartao('Voz conversacional').getByText(ESTADO_EM_PORTUGUES.conectado),
    ).toBeDefined()
    expect(cartao('Telefonia').getByText(ESTADO_EM_PORTUGUES.erro)).toBeDefined()
    expect(
      cartao('Calendário').getByText(ESTADO_EM_PORTUGUES.nao_configurado),
    ).toBeDefined()
    // O provedor fora do ar não é chave recusada: o selo e a frase são outros.
    expect(
      cartao('E-mail transacional').getByText(ESTADO_EM_PORTUGUES.indisponivel),
    ).toBeDefined()
  })

  it('mostra a frase da falha que veio da borda, sem reescrevê-la', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Telefonia' })

    const telefonia = integracoesDeExemplo().find(
      (item) => item.provedor === 'telefonia',
    )
    expect(
      cartao('Telefonia').getByText(telefonia?.erro?.mensagem ?? ''),
    ).toBeDefined()
  })

  it('mostra saldo e capacidade como valor, e o que fica bloqueado quando não conecta', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Voz conversacional' })

    const saldo = cartao('Voz conversacional').getByText('12.000 de 100.000 créditos')
    expect(saldo.className).toContain('val')
    expect(cartao('Voz conversacional').getByText('3 de 10')).toBeDefined()

    // Conectado não avisa sobre bloqueio; quem não conecta, sim.
    expect(
      cartao('Voz conversacional').queryByText(copy.cartao.bloqueia, {
        exact: false,
      }),
    ).toBeNull()
    expect(
      cartao('Telefonia').getByText(copy.cartao.bloqueia, { exact: false }),
    ).toBeDefined()
  })

  it('desenha um campo por chave exigida, vazio, sem mostrar a chave salva', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Telefonia' })

    const telefonia = cartao('Telefonia')
    const sid = telefonia.getByLabelText('identificador da conta')
    const token = telefonia.getByLabelText('token de autenticação')

    for (const campo of [sid, token]) {
      expect((campo as HTMLInputElement).value).toBe('')
      expect(campo.getAttribute('type')).toBe('password')
    }

    // O marcador diz que há chave sem dizer qual; a linha explica o campo vazio.
    expect(telefonia.getAllByText(copy.cartao.marcador)).toHaveLength(2)
    expect(telefonia.getByText(copy.cartao.chaveCadastrada)).toBeDefined()
  })

  it('não oferece salvar enquanto nenhum campo foi preenchido', async () => {
    await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Voz conversacional' })

    const salvar = cartao('Voz conversacional').getByRole('button', {
      name: copy.cartao.salvar,
    })
    expect((salvar as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(cartao('Voz conversacional').getByLabelText('chave da API'), {
      target: { value: 'chave-nova' },
    })
    expect((salvar as HTMLButtonElement).disabled).toBe(false)
  })

  it('salva só o que foi digitado e não devolve o valor ao campo', async () => {
    const servico = await abrirIntegracoes()
    await screen.findByRole('region', { name: 'Calendário' })

    const calendario = cartao('Calendário')
    fireEvent.change(calendario.getByLabelText('autorização do calendário'), {
      target: { value: '  token-de-atualizacao  ' },
    })
    fireEvent.click(calendario.getByRole('button', { name: copy.cartao.salvar }))

    await waitFor(() => expect(servico.gravacoes).toHaveLength(1))
    // Campo em branco é "não mexi": as outras duas chaves não são regravadas.
    expect(servico.gravacoes[0]).toEqual({
      provedor: 'calendario',
      valores: { refresh_token: 'token-de-atualizacao' },
    })

    await waitFor(() =>
      expect(
        cartao('Calendário').getByText(ESTADO_EM_PORTUGUES.conectado),
      ).toBeDefined(),
    )
    expect(cartao('Calendário').getByText(copy.cartao.salva)).toBeDefined()
    expect(
      (
        cartao('Calendário').getByLabelText(
          'autorização do calendário',
        ) as HTMLInputElement
      ).value,
    ).toBe('')
  })

  it('testa a conexão de um provedor só e mostra o estado de espera', async () => {
    const servico = await abrirIntegracoes({ segurar: true })
    await screen.findByRole('region', { name: 'Telefonia' })

    fireEvent.click(
      cartao('Telefonia').getByRole('button', { name: copy.cartao.testar }),
    )

    // Enquanto o pedido viaja, o cartão não afirma mais o estado anterior.
    await waitFor(() =>
      expect(
        cartao('Telefonia').getByText(ESTADO_EM_PORTUGUES.testando),
      ).toBeDefined(),
    )
    expect(cartao('Telefonia').queryByText(ESTADO_EM_PORTUGUES.erro)).toBeNull()
    expect(servico.testes).toEqual(['telefonia'])
    // Nenhum outro cartão entra em espera junto.
    expect(
      cartao('Voz conversacional').getByText(ESTADO_EM_PORTUGUES.conectado),
    ).toBeDefined()

    servico.liberar()
    await waitFor(() =>
      expect(cartao('Telefonia').getByText(ESTADO_EM_PORTUGUES.erro)).toBeDefined(),
    )
  })

  it('explica a recusa da gravação e mantém o que foi digitado', async () => {
    const servico = await abrirIntegracoes({
      salvar: { ok: false, motivo: 'sem-permissao' },
    })
    await screen.findByRole('region', { name: 'Voz conversacional' })

    fireEvent.change(cartao('Voz conversacional').getByLabelText('chave da API'), {
      target: { value: 'chave-nova' },
    })
    fireEvent.click(
      cartao('Voz conversacional').getByRole('button', { name: copy.cartao.salvar }),
    )

    expect(
      await screen.findByText(copy.falhas['sem-permissao']),
    ).toBeDefined()
    // A chave recusada continua no campo: quem digitou não precisa digitar de novo.
    expect(
      (
        cartao('Voz conversacional').getByLabelText(
          'chave da API',
        ) as HTMLInputElement
      ).value,
    ).toBe('chave-nova')
    // Recusada a gravação, o provedor não é sondado.
    expect(servico.testes).toEqual([])
  })

  it('mostra o motivo da falha da carga em vez dos cartões', async () => {
    await abrirIntegracoes({ carregar: { ok: false, motivo: 'sem-conta' } })

    expect(await screen.findByText(copy.falhas['sem-conta'])).toBeDefined()
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })
})

const WHATSAPP_DE_EXEMPLO: Integracao = {
  provedor: 'whatsapp',
  rotulo: 'WhatsApp (Z-API)',
  fornecedor: 'Z-API',
  estado: 'nao_configurado',
  configurado: false,
  conectado: false,
  credito: null,
  cota: null,
  erro: null,
  chaves: [
    { nome: 'instance_id', rotulo: 'ID da instância', preenchida: false },
    { nome: 'token', rotulo: 'Token da instância', preenchida: false },
    { nome: 'client_token', rotulo: 'Token de segurança da conta', preenchida: false },
  ],
  bloqueia: 'A assistente não atende pelo WhatsApp.',
}

async function abrirIntegracoesComWhatsapp(
  respostasWhatsapp: RespostasDoWhatsapp = {},
  integracoes: Integracao[] = [WHATSAPP_DE_EXEMPLO],
) {
  const servico = criarServicoDeIntegracoesDublado({ integracoes })
  const whatsapp = criarServicoDeWhatsappDublado(respostasWhatsapp)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/integracoes',
    undefined,
    undefined,
    servico,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    whatsapp,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return { servico, whatsapp }
}

describe('o cartão do WhatsApp', () => {
  it('aparece como qualquer outro provedor, com os três campos do cofre', async () => {
    await abrirIntegracoesComWhatsapp()

    const cartaoDoWhatsapp = within(await screen.findByRole('region', { name: WHATSAPP_DE_EXEMPLO.rotulo }))
    expect(cartaoDoWhatsapp.getByText('Z-API')).toBeDefined()
    expect(cartaoDoWhatsapp.getByLabelText('ID da instância')).toBeDefined()
    expect(cartaoDoWhatsapp.getByLabelText('Token da instância')).toBeDefined()
    expect(cartaoDoWhatsapp.getByLabelText('Token de segurança da conta')).toBeDefined()
  })

  it('salvar a chave chama whatsapp-connect e mostra o resultado', async () => {
    const { servico, whatsapp } = await abrirIntegracoesComWhatsapp({
      conectar: { ok: true, estado: 'conectado', mensagem: 'Webhook registrado na Z-API.' },
    })

    const cartao = within(await screen.findByRole('region', { name: WHATSAPP_DE_EXEMPLO.rotulo }))
    fireEvent.change(cartao.getByLabelText('ID da instância'), { target: { value: 'inst-1' } })
    fireEvent.change(cartao.getByLabelText('Token da instância'), { target: { value: 'tok-1' } })
    fireEvent.change(cartao.getByLabelText('Token de segurança da conta'), { target: { value: 'ctok-1' } })
    fireEvent.click(cartao.getByRole('button', { name: copy.cartao.salvar }))

    expect(await cartao.findByText('Webhook registrado na Z-API.')).toBeDefined()
    expect(whatsapp.conexoes()).toBe(1)
    expect(servico.gravacoes).toEqual([
      { provedor: 'whatsapp', valores: { instance_id: 'inst-1', token: 'tok-1', client_token: 'ctok-1' } },
    ])
  })

  it('conexão recusada mostra a frase da borda, mesmo com a chave salva', async () => {
    const { whatsapp } = await abrirIntegracoesComWhatsapp({
      conectar: { ok: false, motivo: 'falha_interna', mensagem: 'Não foi possível registrar o webhook agora.' },
    })

    const cartao = within(await screen.findByRole('region', { name: WHATSAPP_DE_EXEMPLO.rotulo }))
    fireEvent.change(cartao.getByLabelText('ID da instância'), { target: { value: 'inst-1' } })
    fireEvent.change(cartao.getByLabelText('Token da instância'), { target: { value: 'tok-1' } })
    fireEvent.change(cartao.getByLabelText('Token de segurança da conta'), { target: { value: 'ctok-1' } })
    fireEvent.click(cartao.getByRole('button', { name: copy.cartao.salvar }))

    expect(await cartao.findByText('Não foi possível registrar o webhook agora.')).toBeDefined()
    expect(whatsapp.conexoes()).toBe(1)
  })

  it('salvar a chave de outro provedor não chama whatsapp-connect', async () => {
    const outroProvedor: Integracao = {
      ...WHATSAPP_DE_EXEMPLO,
      provedor: 'voz',
      rotulo: 'Voz conversacional',
      chaves: [{ nome: 'api_key', rotulo: 'chave da API', preenchida: false }],
    }
    const { whatsapp } = await abrirIntegracoesComWhatsapp({}, [WHATSAPP_DE_EXEMPLO, outroProvedor])

    const cartaoDaVoz = within(await screen.findByRole('region', { name: 'Voz conversacional' }))
    fireEvent.change(cartaoDaVoz.getByLabelText('chave da API'), { target: { value: 'sk_nova' } })
    fireEvent.click(cartaoDaVoz.getByRole('button', { name: copy.cartao.salvar }))

    await cartaoDaVoz.findByText(copy.cartao.salva)
    expect(whatsapp.conexoes()).toBe(0)
  })
})

describe('formulário do site (D-02)', () => {
  const formulario = copy.formularioDoSite

  it('mostra o endereço público, o cabeçalho, os campos aceitos e onde usar', async () => {
    await abrirIntegracoes()
    const regiao = within(await screen.findByRole('region', { name: formulario.rotulo }))

    expect((await regiao.findByLabelText(formulario.endereco)).textContent).toBe(ENDERECO_DE_ENTRADA_DE_EXEMPLO)
    expect(regiao.getByText(formulario.valorDoCabecalho)).toBeDefined()
    expect(regiao.getByText(formulario.chave.nenhuma)).toBeDefined()
    for (const item of formulario.campos.lista) expect(regiao.getByText(item.campo)).toBeDefined()
    for (const item of formulario.ondeColar.itens) expect(regiao.getByText(`${item.nome}.`)).toBeDefined()
    const exemplo = regiao.getByLabelText(formulario.exemplo.titulo).textContent ?? ''
    expect(exemplo).toContain(ENDERECO_DE_ENTRADA_DE_EXEMPLO)
    // O exemplo nunca traz uma chave de verdade.
    expect(exemplo).toContain(`'x-intake-key': 'sua chave'`)
  })

  it('gera a chave, mostra uma vez e só o hash vai para o banco', async () => {
    const servico = await abrirIntegracoes()
    const regiao = within(await screen.findByRole('region', { name: formulario.rotulo }))

    fireEvent.click(await regiao.findByRole('button', { name: formulario.chave.gerar }))

    const chave = (await regiao.findByLabelText(formulario.chave.nova)).textContent ?? ''
    expect(chave).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(regiao.getByText(formulario.chave.umaVez)).toBeDefined()
    expect(servico.hashesDaEntrada).toEqual([await hashDaChaveDeEntrada(chave)])
    expect(servico.hashesDaEntrada[0]).not.toContain(chave)
    // Depois de gerar, o botão passa a ser o de trocar.
    expect(await regiao.findByRole('button', { name: formulario.chave.gerarOutra })).toBeDefined()
  })

  it('trocar a chave pede confirmação, porque a anterior para de valer', async () => {
    const servico = await abrirIntegracoes({ entrada: { geradaEm: '2026-09-20T12:00:00Z' } })
    const regiao = within(await screen.findByRole('region', { name: formulario.rotulo }))

    fireEvent.click(await regiao.findByRole('button', { name: formulario.chave.gerarOutra }))
    expect(await screen.findByText(formulario.chave.confirmar.explicacao)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: formulario.chave.confirmar.cancelar }))
    expect(servico.hashesDaEntrada).toEqual([])

    fireEvent.click(regiao.getByRole('button', { name: formulario.chave.gerarOutra }))
    fireEvent.click(await screen.findByRole('button', { name: formulario.chave.confirmar.acao }))
    await waitFor(() => expect(servico.hashesDaEntrada).toHaveLength(1))
  })

  it('quem não administra recebe a frase de permissão, sem chave nenhuma na tela', async () => {
    await abrirIntegracoes({ girar: { ok: false, motivo: 'sem-permissao' } })
    const regiao = within(await screen.findByRole('region', { name: formulario.rotulo }))

    fireEvent.click(await regiao.findByRole('button', { name: formulario.chave.gerar }))

    expect(await regiao.findByText(formulario.falhas['sem-permissao'])).toBeDefined()
    expect(regiao.queryByLabelText(formulario.chave.nova)).toBeNull()
  })
})
