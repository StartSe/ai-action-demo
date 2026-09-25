// Provas do registro do número. Ambiente node, sem rede e sem banco: os dois
// provedores e a camada de dados são dublados, e os dublês **contam as
// chamadas** — sem a contagem, uma versão que reconfigurasse tudo a cada clique
// passaria verde em qualquer asserção sobre o resultado final.
//
// O que este arquivo segura:
//
// 1. **Os três comportamentos de entrada.** `agent` importa no provedor de voz;
//    `forward` e `voicemail` apontam o webhook da telefonia para
//    `inbound-twiml`, e apontam para o **mesmo** endereço — quem decide entre
//    encaminhar e dar o recado é a linha, lida a cada ligação.
// 2. **A idempotência, por destino e não por comportamento.** Registrar duas
//    vezes seguidas faz as idas da primeira e nenhuma da segunda, e não grava
//    de novo. Trocar `forward` por `voicemail` também não vai ao provedor;
//    trocar `agent` por `forward` vai, e reconfigura em vez de criar um segundo
//    registro.
// 3. **`aguardando aprovação da operadora` é sucesso** (P-04), e a linha é
//    gravada do mesmo jeito.
// 4. **Nenhuma credencial no corpo serializado.** O identificador, o token e a
//    chave do provedor de voz são procurados no JSON da resposta — e o
//    identificador é o caso perigoso, porque ele viaja dentro do caminho que o
//    registro de integração guarda.

import { describe, expect, test } from 'vitest'

import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'
import { provedorPorId } from '../integrations-status/provedores.ts'

import {
  CHAVE_DO_IDENTIFICADOR,
  CHAVE_DO_PROVEDOR_DE_VOZ,
  CHAVE_DO_TOKEN,
  PROVEDOR_DE_TELEFONIA,
  PROVEDOR_DE_VOZ,
  destinoVigente,
  registrarNumero,
  type CorpoDeRecusa,
  type CorpoDoRegistro,
  type EventoDeIntegracao,
  type LinhaDeRegistro,
  type LinhaTelefonica,
  type PedidoDeApontamento,
  type PedidoDeImportacao,
  type PortaDoRegistro,
  type RespostaDoRegistro,
} from './registro.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const LINHA = '22222222-2222-4222-8222-222222222222'
const USUARIO = '33333333-3333-4333-8333-333333333333'
const AUTORIZACAO = 'Bearer jwt-de-quem-registra'
const ATENDIMENTO = 'https://projeto.supabase.co/functions/v1/inbound-twiml'

const IDENTIFICADOR = 'AC00000000000000000000000000000001'
const TOKEN = 'token-da-telefonia-que-nao-pode-sair'
const CHAVE_DA_VOZ = 'chave-do-provedor-de-voz-que-nao-pode-sair'
const NUMERO_NA_TELEFONIA = 'PN00000000000000000000000000000009'
const NUMERO_NA_VOZ = 'phnum_0001'
const AGENTE_NO_PROVEDOR = 'agent_0001'

function linha(ajustes: Partial<LinhaTelefonica> = {}): LinhaTelefonica {
  return {
    id: LINHA,
    account_id: CONTA,
    e164: '+5548999990000',
    label: 'linha comercial',
    inbound_behavior: 'agent',
    forward_to: null,
    provider_number_id: null,
    provider_voice_id: null,
    ...ajustes,
  }
}

interface AjustesDaPorta {
  readonly papel?: string | null
  readonly usuario?: { readonly id: string } | null
  readonly linha?: LinhaTelefonica | null
  readonly publicacao?: { readonly provider_agent_id: string } | null
  readonly credencialDeVoz?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  readonly credencialDeTelefonia?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  /** O número que a telefonia diz ter. `null` é "a conta não tem esse número". */
  readonly numeroNaTelefonia?: string | null
  readonly telefoniaFalha?: { readonly codigo: string | null; readonly status: number | null }
  readonly importacaoFalha?: { readonly codigo: string | null; readonly status: number | null }
  readonly importacaoPendente?: boolean
  readonly remocaoFalha?: boolean
  readonly gravacaoFalha?: boolean
  readonly eventoFalha?: boolean
}

interface Bancada {
  readonly porta: PortaDoRegistro
  readonly buscas: number
  readonly importacoes: PedidoDeImportacao[]
  readonly apontamentos: PedidoDeApontamento[]
  readonly remocoes: number
  readonly gravadas: LinhaDeRegistro[]
  readonly eventos: EventoDeIntegracao[]
}

function bancada(ajustes: AjustesDaPorta = {}): Bancada {
  const importacoes: PedidoDeImportacao[] = []
  const apontamentos: PedidoDeApontamento[] = []
  const gravadas: LinhaDeRegistro[] = []
  const eventos: EventoDeIntegracao[] = []
  const contagem = { buscas: 0, remocoes: 0 }

  function resolver(escolha: AjustesDaPorta['credencialDeVoz'], valor: string): ResolucaoDeSegredo {
    if (escolha === 'ausente') return { ok: false, motivo: 'ausente' }
    if (escolha === 'plataforma_bloqueada') return { ok: false, motivo: 'plataforma_bloqueada' }
    return { ok: true, valor, origem: 'conta' }
  }

  const porta: PortaDoRegistro = {
    async usuarioDaSessao() {
      return ajustes.usuario === undefined ? { id: USUARIO } : ajustes.usuario
    },
    async papelNaConta() {
      return ajustes.papel === undefined ? 'admin' : ajustes.papel
    },
    async linhaDaConta() {
      return ajustes.linha === undefined ? linha() : ajustes.linha
    },
    async publicacaoDeEntrada() {
      return ajustes.publicacao === undefined
        ? { provider_agent_id: AGENTE_NO_PROVEDOR }
        : ajustes.publicacao
    },
    async credencial(_contaId, provedor, chave) {
      if (provedor === PROVEDOR_DE_VOZ) return resolver(ajustes.credencialDeVoz, CHAVE_DA_VOZ)
      return resolver(
        ajustes.credencialDeTelefonia,
        chave === CHAVE_DO_IDENTIFICADOR ? IDENTIFICADOR : TOKEN,
      )
    },
    async numeroNaTelefonia() {
      contagem.buscas += 1
      if (ajustes.telefoniaFalha) return { ok: false, ...ajustes.telefoniaFalha }
      return {
        ok: true,
        providerNumberId:
          ajustes.numeroNaTelefonia === undefined ? NUMERO_NA_TELEFONIA : ajustes.numeroNaTelefonia,
        status: 200,
      }
    },
    async importarNoProvedorDeVoz(pedido) {
      importacoes.push(pedido)
      if (ajustes.importacaoFalha) return { ok: false, ...ajustes.importacaoFalha }
      return {
        ok: true,
        providerVoiceId: NUMERO_NA_VOZ,
        pendente: ajustes.importacaoPendente ?? false,
        status: 200,
      }
    },
    async apontarWebhookDeVoz(pedido) {
      apontamentos.push(pedido)
      return { ok: true, status: 200 }
    },
    async removerDoProvedorDeVoz() {
      contagem.remocoes += 1
      return ajustes.remocaoFalha ? { ok: false, codigo: 'not_found', status: 404 } : { ok: true }
    },
    async gravarRegistro(registro) {
      if (ajustes.gravacaoFalha) throw new Error('escrita recusada')
      gravadas.push(registro)
    },
    async registrarEventoDeIntegracao(evento) {
      if (ajustes.eventoFalha) throw new Error('trilha indisponível')
      eventos.push(evento)
    },
  }

  return {
    porta,
    importacoes,
    apontamentos,
    gravadas,
    eventos,
    get buscas() {
      return contagem.buscas
    },
    get remocoes() {
      return contagem.remocoes
    },
  }
}

function registrar(
  teste: Bancada,
  ajustes: { readonly metodo?: string; readonly contaId?: unknown; readonly linhaId?: unknown } = {},
): Promise<RespostaDoRegistro> {
  return registrarNumero(
    {
      metodo: ajustes.metodo ?? 'POST',
      contaId: ajustes.contaId === undefined ? CONTA : ajustes.contaId,
      linhaId: ajustes.linhaId === undefined ? LINHA : ajustes.linhaId,
      autorizacao: AUTORIZACAO,
    },
    teste.porta,
    { enderecoDoAtendimento: ATENDIMENTO },
  )
}

function corpoDoRegistro(resposta: RespostaDoRegistro): CorpoDoRegistro {
  expect(resposta.corpo.ok).toBe(true)
  return resposta.corpo as CorpoDoRegistro
}

function corpoDaRecusa(resposta: RespostaDoRegistro): CorpoDeRecusa {
  expect(resposta.corpo.ok).toBe(false)
  return resposta.corpo as CorpoDeRecusa
}

describe('os três comportamentos de entrada', () => {
  test('agent importa o número no provedor de voz, apontado para a publicação', async () => {
    const teste = bancada({ linha: linha({ inbound_behavior: 'agent' }) })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.destino).toBe('voz')
    expect(corpo.estado).toBe('registrado')
    expect(corpo.providerNumberId).toBe(NUMERO_NA_TELEFONIA)
    expect(corpo.providerVoiceId).toBe(NUMERO_NA_VOZ)
    expect(teste.importacoes).toHaveLength(1)
    expect(teste.importacoes[0]?.providerAgentId).toBe(AGENTE_NO_PROVEDOR)
    expect(teste.apontamentos).toEqual([])
    // As duas colunas da linha, gravadas juntas.
    expect(teste.gravadas).toEqual([
      { linhaId: LINHA, contaId: CONTA, providerNumberId: NUMERO_NA_TELEFONIA, providerVoiceId: NUMERO_NA_VOZ },
    ])
  })

  test('o par da telefonia sai para o provedor de voz, por necessidade', async () => {
    const teste = bancada({ linha: linha({ inbound_behavior: 'agent' }) })

    await registrar(teste)

    // É a integração nativa: sem o identificador e o token, o provedor de voz
    // não assume os webhooks do número. Está declarado no cabeçalho do módulo,
    // e este teste é o que impede a declaração de virar prosa.
    expect(teste.importacoes[0]?.identificador).toBe(IDENTIFICADOR)
    expect(teste.importacoes[0]?.token).toBe(TOKEN)
  })

  test('forward aponta o webhook de voz para inbound-twiml', async () => {
    const teste = bancada({
      linha: linha({ inbound_behavior: 'forward', forward_to: '+5548988881111' }),
    })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.destino).toBe('webhook')
    expect(corpo.providerVoiceId).toBeNull()
    expect(teste.importacoes).toEqual([])
    expect(teste.apontamentos).toHaveLength(1)
    // A conta viaja no endereço: é por ela que inbound-twiml escolhe o token
    // do cofre que confere a assinatura.
    expect(teste.apontamentos[0]?.webhookDeVoz).toBe(`${ATENDIMENTO}?conta=${CONTA}`)
    expect(teste.apontamentos[0]?.providerNumberId).toBe(NUMERO_NA_TELEFONIA)
  })

  test('voicemail aponta para o mesmo endereço que forward', async () => {
    const paraForward = bancada({
      linha: linha({ inbound_behavior: 'forward', forward_to: '+5548988881111' }),
    })
    const paraVoicemail = bancada({ linha: linha({ inbound_behavior: 'voicemail' }) })

    await registrar(paraForward)
    await registrar(paraVoicemail)

    // Os dois comportamentos produzem a mesma configuração no provedor. Quem
    // decide entre encaminhar e dar o recado é `inbound-twiml`, lendo a linha.
    expect(paraVoicemail.apontamentos[0]?.webhookDeVoz).toBe(
      paraForward.apontamentos[0]?.webhookDeVoz,
    )
  })
})

describe('a idempotência', () => {
  test('registrar de novo o mesmo destino não vai ao provedor e não grava', async () => {
    const jaRegistrada = linha({
      inbound_behavior: 'agent',
      provider_number_id: NUMERO_NA_TELEFONIA,
      provider_voice_id: NUMERO_NA_VOZ,
    })
    const teste = bancada({ linha: jaRegistrada })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.estado).toBe('inalterado')
    expect(corpo.providerNumberId).toBe(NUMERO_NA_TELEFONIA)
    expect(teste.buscas).toBe(0)
    expect(teste.importacoes).toEqual([])
    expect(teste.apontamentos).toEqual([])
    // A ausência da escrita é o que mantém a linha descrevendo a última
    // mudança, e não o último clique.
    expect(teste.gravadas).toEqual([])
  })

  test('trocar forward por voicemail é inalterado, porque o registro é o mesmo', async () => {
    const teste = bancada({
      linha: linha({
        inbound_behavior: 'voicemail',
        provider_number_id: NUMERO_NA_TELEFONIA,
        provider_voice_id: null,
      }),
    })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.estado).toBe('inalterado')
    expect(teste.apontamentos).toEqual([])
  })

  test('trocar agent por forward reconfigura, sem criar um segundo registro', async () => {
    const teste = bancada({
      linha: linha({
        inbound_behavior: 'forward',
        forward_to: '+5548988881111',
        provider_number_id: NUMERO_NA_TELEFONIA,
        provider_voice_id: NUMERO_NA_VOZ,
      }),
    })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.estado).toBe('registrado')
    expect(corpo.destino).toBe('webhook')
    expect(teste.apontamentos).toHaveLength(1)
    // A importação anterior sai de lá, e a coluna volta a ser nula: é o mesmo
    // número, reconfigurado, e não um registro novo ao lado do antigo.
    expect(teste.remocoes).toBe(1)
    expect(corpo.providerVoiceId).toBeNull()
    expect(teste.gravadas[0]?.providerVoiceId).toBeNull()
    expect(corpo.sobrouNoProvedorDeVoz).toBe(false)
  })

  test('trocar forward por agent importa no provedor de voz', async () => {
    const teste = bancada({
      linha: linha({
        inbound_behavior: 'agent',
        provider_number_id: NUMERO_NA_TELEFONIA,
        provider_voice_id: null,
      }),
    })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.estado).toBe('registrado')
    expect(teste.importacoes).toHaveLength(1)
    expect(teste.remocoes).toBe(0)
  })

  test('o destino vigente se lê da linha, e não de uma coluna a mais', () => {
    expect(destinoVigente(linha())).toBeNull()
    expect(destinoVigente(linha({ provider_number_id: NUMERO_NA_TELEFONIA }))).toBe('webhook')
    expect(
      destinoVigente(
        linha({ provider_number_id: NUMERO_NA_TELEFONIA, provider_voice_id: NUMERO_NA_VOZ }),
      ),
    ).toBe('voz')
    // Vazio não vale por preenchido, como o check da coluna já diz.
    expect(destinoVigente(linha({ provider_number_id: '  ' }))).toBeNull()
  })
})

describe('a espera da operadora', () => {
  test('aguardando aprovação é sucesso, e a linha é gravada', async () => {
    const teste = bancada({
      linha: linha({ inbound_behavior: 'agent' }),
      importacaoPendente: true,
    })

    const resposta = await registrar(teste)
    const corpo = corpoDoRegistro(resposta)

    // P-04: a espera é estado normal do passo, e não erro. Status 200, e a tela
    // de números mostra a frase em vez de mandar tentar de novo.
    expect(resposta.status).toBe(200)
    expect(corpo.estado).toBe('aguardando_aprovacao')
    expect(corpo.mensagem).toContain('aprovação da operadora')
    expect(teste.gravadas).toHaveLength(1)
  })
})

describe('quem pode registrar', () => {
  test('operador recebe a frase de quem pedir, e nada é chamado', async () => {
    const teste = bancada({ papel: 'operator' })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(403)
    expect(corpoDaRecusa(resposta).motivo).toBe('papel_insuficiente')
    expect(teste.buscas).toBe(0)
  })

  test('quem não é membro não descobre se a conta existe', async () => {
    const resposta = await registrar(bancada({ papel: null }))

    expect(resposta.status).toBe(403)
    expect(corpoDaRecusa(resposta).motivo).toBe('sem_acesso')
  })

  test('sessão expirada recusa antes de qualquer leitura de linha', async () => {
    const teste = bancada({ usuario: null })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(401)
    expect(teste.buscas).toBe(0)
  })

  test('só POST', async () => {
    const resposta = await registrar(bancada(), { metodo: 'GET' })

    expect(resposta.status).toBe(405)
    expect(corpoDaRecusa(resposta).mensagem).toBe(MENSAGENS.metodo_invalido)
  })
})

describe('o que falta antes de registrar', () => {
  test('sem chaves da telefonia, a frase manda para Integrações', async () => {
    const teste = bancada({ credencialDeTelefonia: 'ausente' })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(409)
    expect(corpoDaRecusa(resposta).motivo).toBe('sem_credencial_de_telefonia')
    expect(teste.buscas).toBe(0)
  })

  test('chave da plataforma bloqueada é outra frase, e outro próximo passo', async () => {
    const resposta = await registrar(bancada({ credencialDeTelefonia: 'plataforma_bloqueada' }))

    expect(corpoDaRecusa(resposta).motivo).toBe('telefonia_bloqueada')
  })

  test('sem publicação, o número não aponta para uma Sarah que não existe', async () => {
    const teste = bancada({ linha: linha({ inbound_behavior: 'agent' }), publicacao: null })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(409)
    expect(corpoDaRecusa(resposta).motivo).toBe('sem_publicacao')
    expect(teste.importacoes).toEqual([])
    expect(teste.gravadas).toEqual([])
  })

  test('forward não exige publicação nenhuma', async () => {
    const teste = bancada({
      linha: linha({ inbound_behavior: 'forward', forward_to: '+5548988881111' }),
      publicacao: null,
    })

    expect(corpoDoRegistro(await registrar(teste)).estado).toBe('registrado')
  })

  test('número que a conta de telefonia não tem recusa com a frase das duas causas', async () => {
    const teste = bancada({ numeroNaTelefonia: null })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(404)
    expect(corpoDaRecusa(resposta).motivo).toBe('numero_nao_encontrado')
    expect(teste.gravadas).toEqual([])
  })

  test('linha que não é da conta não é registrada', async () => {
    const resposta = await registrar(bancada({ linha: null }))

    expect(resposta.status).toBe(404)
    expect(corpoDaRecusa(resposta).motivo).toBe('linha_desconhecida')
  })
})

describe('quando o provedor não colabora', () => {
  test('chave recusada pela telefonia vira 502 e frase de provedor', async () => {
    const teste = bancada({ telefoniaFalha: { codigo: 'invalid_api_key', status: 401 } })

    const resposta = await registrar(teste)
    const corpo = corpoDaRecusa(resposta)

    expect(resposta.status).toBe(502)
    expect(corpo.motivo).toBe('chave_invalida')
    // O código bruto morre na borda: nada do que o provedor disse sai no corpo.
    expect(JSON.stringify(corpo)).not.toContain('invalid_api_key')
    expect(teste.gravadas).toEqual([])
  })

  test('provedor fora do ar vira 503, que pede espera e não conferência', async () => {
    const teste = bancada({ importacaoFalha: { codigo: 'timeout', status: null } })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(503)
    expect(corpoDaRecusa(resposta).motivo).toBe('sem_resposta')
  })

  test('a remoção que falha não derruba o registro, e o que sobrou é dito', async () => {
    const teste = bancada({
      linha: linha({
        inbound_behavior: 'voicemail',
        provider_number_id: NUMERO_NA_TELEFONIA,
        provider_voice_id: NUMERO_NA_VOZ,
      }),
      remocaoFalha: true,
    })

    const corpo = corpoDoRegistro(await registrar(teste))

    // Quem atende agora é o webhook; a importação que sobrou é limpeza, e por
    // isso ela é dita em vez de virar recusa.
    expect(corpo.estado).toBe('registrado')
    expect(corpo.sobrouNoProvedorDeVoz).toBe(true)
    expect(teste.apontamentos).toHaveLength(1)
  })

  test('escrita que falha depois do provedor diz que o número já atende', async () => {
    const teste = bancada({ gravacaoFalha: true })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(500)
    expect(corpoDaRecusa(resposta).motivo).toBe('falha_ao_gravar')
  })

  test('trilha de integração que não entra não muda o registro', async () => {
    const teste = bancada({ eventoFalha: true })

    const corpo = corpoDoRegistro(await registrar(teste))

    expect(corpo.estado).toBe('registrado')
    expect(corpo.semRegistro).toBe(true)
    expect(teste.gravadas).toHaveLength(1)
  })
})

describe('o que não pode sair no corpo', () => {
  test('nenhuma credencial aparece no corpo serializado, em nenhum desfecho', async () => {
    const respostas = [
      await registrar(bancada({ linha: linha({ inbound_behavior: 'agent' }) })),
      await registrar(bancada({ linha: linha({ inbound_behavior: 'voicemail' }) })),
      await registrar(bancada({ importacaoPendente: true })),
      await registrar(bancada({ telefoniaFalha: { codigo: 'forbidden', status: 403 } })),
      await registrar(bancada({ eventoFalha: true })),
    ]

    for (const resposta of respostas) {
      const serializado = JSON.stringify(resposta.corpo)
      expect(serializado).not.toContain(IDENTIFICADOR)
      expect(serializado).not.toContain(TOKEN)
      expect(serializado).not.toContain(CHAVE_DA_VOZ)
    }
  })

  test('o identificador escapando pelo corpo vira falha interna, e não resposta', async () => {
    // A rede de segurança de `conferirQueNaoVazou`: uma porta que devolvesse o
    // identificador como se fosse o número do provedor faria a chave da conta
    // chegar ao navegador sem ninguém ter escrito "chave" em lugar nenhum.
    const teste = bancada({ numeroNaTelefonia: IDENTIFICADOR })

    const resposta = await registrar(teste)

    expect(resposta.status).toBe(500)
    expect(corpoDaRecusa(resposta).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain(IDENTIFICADOR)
  })
})

test('os nomes de provedor e de chave saem do catálogo de integrações', () => {
  // Cobrados contra o catálogo, e não contra literais repetidos aqui: nome
  // divergente resolveria a credencial de um provedor que a tela de integrações
  // não cadastra, e o sintoma seria "cadastrei e continua faltando". Com os
  // literais dos dois lados, renomear a chave no catálogo deixaria este teste
  // verde e a função quebrada.
  const telefonia = provedorPorId(PROVEDOR_DE_TELEFONIA)
  const voz = provedorPorId(PROVEDOR_DE_VOZ)

  expect(telefonia?.chaves).toContain(CHAVE_DO_IDENTIFICADOR)
  expect(telefonia?.chaves).toContain(CHAVE_DO_TOKEN)
  expect(voz?.chaves).toContain(CHAVE_DO_PROVEDOR_DE_VOZ)
})
