// Dois critérios moram aqui. O da F0: "Papel Operador recebe negativa explícita
// ao tentar abrir a política de discagem" — explícita quer dizer com motivo e
// com saída. E o da US-087: a política completa, em que cada limite diz o que
// acontece quando é atingido, a janela tem prévia no fuso do lead e a
// simultaneidade respeita o menor limite entre provedor de voz e telefonia.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { discagem as copy } from '@/copy/discagem'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { ligacaoAoLeadNovo } from '@/copy/ligacao-ao-lead-novo'
import { CAMPOS } from '@/discagem/politica'
import type {
  CargaDaPolitica,
  GravacaoDaPolitica, ServicoDeDiscagem } from '@/discagem/tipos'
import type { Equipe, Papel } from '@/equipe/tipos'
import type { Integracao } from '@/integracoes/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeDiscagemDublado,
  politicaDeExemplo,
  type RespostasDeDiscagem,
  type ServicoDeDiscagemDublado,
} from '@/testes/servico-de-discagem-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
  type RespostasDeEquipe,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
  type RespostasDeIntegracoes,
} from '@/testes/servico-de-integracoes-dublado'
import {
  criarServicoDaSarahDublado,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
function comPapel(papelDoUsuario: Papel): Partial<Equipe> {
  return {
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: null,
      },
      {
        usuarioId: 'u-9',
        nome: 'Selma Dias',
        email: 'selma@aurora.com.br',
        papel: 'owner',
        ultimoAcesso: null,
      },
    ],
  }
}

function comEquipe(alteracoes: Partial<Equipe>): RespostasDeEquipe {
  return {
    carregar: { ok: true, equipe: { ...equipeDeExemplo(), ...alteracoes } },
  }
}

async function abrirDiscagem(respostas: RespostasDeEquipe) {
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/discagem',
    criarServicoDeEquipeDublado(respostas),
  )
  await screen.findByRole('heading', { name: copy.titulo })
}

/** O cenário de exemplo com a cota de voz e de telefonia trocadas. */
function comLimites(voz: number | null, telefonia: number | null): Integracao[] {
  return integracoesDeExemplo().map((item) => {
    if (item.provedor === 'voz') {
      return { ...item, cota: voz === null ? null : { rotulo: 'Sessões simultâneas', emUso: 0, limite: voz, esgotada: false } }
    }
    if (item.provedor === 'telefonia') {
      return { ...item, cota: telefonia === null ? null : { rotulo: 'Canais', emUso: 0, limite: telefonia, esgotada: false } }
    }
    return item
  })
}

interface Cenario {
  discagem?: RespostasDeDiscagem | ServicoDeDiscagem
  integracoes?: RespostasDeIntegracoes
}

/** Abre a tela como admin, que é quem configura. */
async function abrirComoAdmin(cenario: Cenario = {}) {
  const discagem =
    cenario.discagem && 'salvar' in cenario.discagem && typeof cenario.discagem.salvar === 'function'
      ? (cenario.discagem as ServicoDeDiscagem)
      : criarServicoDeDiscagemDublado(cenario.discagem as RespostasDeDiscagem | undefined)
  const sarah = criarServicoDaSarahDublado()

  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/discagem',
    criarServicoDeEquipeDublado(comEquipe(comPapel('admin'))),
    undefined,
    criarServicoDeIntegracoesDublado(cenario.integracoes ?? { integracoes: comLimites(8, 6) }),
    undefined,
    undefined,
    sarah,
    undefined,
    undefined,
    discagem,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return { discagem: discagem as ServicoDeDiscagemDublado, sarah: sarah as ServicoDaSarahDublado }
}

function grupo(rotulo: string) {
  return within(screen.getByRole('group', { name: rotulo }))
}

function campo(rotulo: string): HTMLInputElement {
  return grupo(rotulo).getByLabelText(rotulo) as HTMLInputElement
}

function campoDoMotivo(): HTMLInputElement {
  return screen.getByLabelText(copy.motivo.rotulo) as HTMLInputElement
}

function digitar(elemento: HTMLElement, valor: string) {
  fireEvent.change(elemento, { target: { value: valor } })
}

async function esperarFormulario() {
  return screen.findByRole('button', { name: copy.salvar })
}

async function salvar() {
  const botao = screen.getByRole('button', { name: copy.salvar }) as HTMLButtonElement
  await waitFor(() => expect(botao.disabled).toBe(false))
  fireEvent.click(botao)
}

afterEach(cleanup)

describe('política de discagem: a negativa', () => {
  it('o operador recebe a negativa com o motivo, e não uma tela vazia', async () => {
    await abrirDiscagem(comEquipe(comPapel('operator')))

    const negativa = await screen.findByRole('alert')
    expect(within(negativa).getByText(copy.negativa.aviso)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.salvar })).toBeNull()
  })

  it('a negativa diz a quem pedir, e só a quem de fato concede', async () => {
    await abrirDiscagem(comEquipe(comPapel('operator')))

    await screen.findByRole('alert')
    const lista = within(
      screen.getByRole('list', { name: copy.negativa.pedirAcesso }),
    )
    expect(lista.getByText('selma@aurora.com.br')).toBeDefined()
    // Quem também é operador não concede acesso nenhum.
    expect(lista.queryByText('renata@aurora.com.br')).toBeNull()
  })

  it('o observador recebe a mesma negativa', async () => {
    await abrirDiscagem(comEquipe(comPapel('viewer')))

    const negativa = await screen.findByRole('alert')
    expect(within(negativa).getByText(copy.negativa.aviso)).toBeDefined()
  })

  it('sem administrador na conta, a negativa manda falar com o suporte', async () => {
    await abrirDiscagem(
      comEquipe({
        papelDoUsuario: 'operator',
        membros: [
          {
            usuarioId: 'u-1',
            nome: 'Renata Alves',
            email: 'renata@aurora.com.br',
            papel: 'operator',
            ultimoAcesso: null,
          },
        ],
      }),
    )

    const negativa = await screen.findByRole('alert')
    expect(
      within(negativa).getByText(copy.negativa.semAdministrador),
    ).toBeDefined()
    expect(screen.queryByRole('list', { name: copy.negativa.pedirAcesso })).toBeNull()
  })

  it.each<Papel>(['owner', 'admin'])(
    'quem administra a conta (%s) abre a política, sem negativa',
    async (papel) => {
      await abrirDiscagem(comEquipe(comPapel(papel)))

      expect(await esperarFormulario()).toBeDefined()
      expect(screen.queryByText(copy.negativa.aviso)).toBeNull()
    },
  )

  it('falha ao carregar o papel não vira negativa nem liberação', async () => {
    await abrirDiscagem({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(copyDaEquipe.falhas['falha-de-comunicacao'])
    expect(screen.queryByRole('button', { name: copy.salvar })).toBeNull()
  })

  it('sem sessão, a rota desvia para a entrada', async () => {
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: null }),
      '/config/discagem',
    )

    expect(roteador.state.location.pathname).toBe('/entrar')
  })
})

describe('política de discagem: os quatro estados', () => {
  it('carregando', async () => {
    await abrirComoAdmin({
      discagem: {
        carregar: () => new Promise<CargaDaPolitica>(() => {}),
        salvar: () => new Promise<GravacaoDaPolitica>(() => {}),
      },
    })
    expect(await screen.findByText(copy.carregando)).toBeDefined()
  })

  it('falha ao carregar a política', async () => {
    await abrirComoAdmin({ discagem: { carregar: { ok: false, motivo: 'falha-de-comunicacao' } } })
    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhas['falha-de-comunicacao'])
  })

  it('vazio: a conta sem linha de configuração', async () => {
    await abrirComoAdmin({
      discagem: { carregar: { ok: true, politica: null, fusoDaConta: 'America/Sao_Paulo' } },
    })
    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.salvar })).toBeNull()
  })

  it('a política gravada, com os valores nos campos', async () => {
    await abrirComoAdmin()
    await esperarFormulario()
    expect(campo(copy.campos.tetoDiarioDeLigacoes.rotulo).value).toBe('200')
    expect(campo(copy.campos.duracaoMaximaSegundos.rotulo).value).toBe('600')
    expect(campo(copy.campos.tetoDeGastoCentavos.rotulo).value).toBe('')
    expect((screen.getByLabelText(copy.inicioDe('1')) as HTMLInputElement).value).toBe('09:00')
    expect((screen.getByLabelText(copy.dia('0')) as HTMLInputElement).checked).toBe(false)
  })
})

describe('política de discagem: cada limite diz o que acontece', () => {
  // Varredura sobre a lista de campos da tela: campo novo entra na asserção
  // sozinho, e esconder a consequência de qualquer um reprova aqui.
  it.each([...CAMPOS])('%s traz a consequência dentro do próprio grupo', async (nome) => {
    await abrirComoAdmin()
    await esperarFormulario()
    const { rotulo, consequencia } = copy.campos[nome]
    expect(grupo(rotulo).getByText(consequencia)).toBeDefined()
  })

  it('as consequências dos tetos dizem bloquear, parar e encerrar', () => {
    expect(copy.campos.tetoDiarioDeLigacoes.consequencia).toMatch(/bloqueada/)
    expect(copy.campos.tetoDeGastoCentavos.consequencia).toMatch(/para de ligar/)
    expect(copy.campos.duracaoMaximaSegundos.consequencia).toMatch(/encerrada.*custo/)
  })
})

describe('política de discagem: prévia da janela', () => {
  it('mostra a faixa para um lead em São Paulo e para um em Manaus', async () => {
    await abrirComoAdmin()
    await esperarFormulario()
    const previa = within(screen.getByRole('region', { name: copy.previa.titulo }))

    expect(previa.getAllByText('das 9h às 18h')).toHaveLength(5)
    expect(
      previa.getAllByText('das 9h às 18h no horário de Manaus, que é 10h às 19h aqui'),
    ).toHaveLength(5)
  })

  it('acompanha a faixa escolhida', async () => {
    await abrirComoAdmin()
    await esperarFormulario()
    fireEvent.click(screen.getByLabelText(copy.dia('6')))
    digitar(screen.getByLabelText(copy.inicioDe('6')), '08:00')
    digitar(screen.getByLabelText(copy.fimDe('6')), '12:00')

    const previa = within(screen.getByRole('region', { name: copy.previa.titulo }))
    expect(previa.getByText(copy.dia('6'))).toBeDefined()
    expect(previa.getByText('das 8h às 12h')).toBeDefined()
    expect(
      previa.getByText('das 8h às 12h no horário de Manaus, que é 9h às 13h aqui'),
    ).toBeDefined()
  })

  it('faixa invertida é recusada nomeando o dia, e nada é gravado', async () => {
    const { discagem } = await abrirComoAdmin()
    await esperarFormulario()
    digitar(screen.getByLabelText(copy.inicioDe('2')), '19:00')
    digitar(campoDoMotivo(), 'ajuste')
    await salvar()

    expect(
      await screen.findByText(
        `${copy.errosDoCampo['faixa-sem-duracao']} ${copy.diasComErro(['2'])}`,
      ),
    ).toBeDefined()
    expect(discagem.gravacoes).toHaveLength(0)
  })
})

describe('política de discagem: simultaneidade e o limite do provedor', () => {
  it('a tela diz qual dos dois limites manda', async () => {
    await abrirComoAdmin({ integracoes: { integracoes: comLimites(8, 3) } })
    await esperarFormulario()
    expect(
      await grupo(copy.campos.simultaneidade.rotulo).findByText(
        copy.simultaneidade.manda('telefonia', 3),
      ),
    ).toBeDefined()
  })

  it('recusa valor acima do menor limite, e nada é gravado', async () => {
    const { discagem } = await abrirComoAdmin({ integracoes: { integracoes: comLimites(8, 3) } })
    await esperarFormulario()
    digitar(campo(copy.campos.simultaneidade.rotulo), '4')
    digitar(campoDoMotivo(), 'mais vazão')
    await salvar()

    expect(
      await grupo(copy.campos.simultaneidade.rotulo).findByText(
        copy.errosDoCampo['acima-do-provedor'],
      ),
    ).toBeDefined()
    expect(discagem.gravacoes).toHaveLength(0)
  })

  it('no limite exato, grava', async () => {
    const { discagem } = await abrirComoAdmin({ integracoes: { integracoes: comLimites(2, 6) } })
    await esperarFormulario()
    expect(
      await screen.findByText(copy.simultaneidade.manda('voz', 2)),
    ).toBeDefined()
    digitar(campo(copy.campos.simultaneidade.rotulo), '2')
    digitar(campoDoMotivo(), 'menos vazão')
    await salvar()

    await waitFor(() => expect(discagem.gravacoes).toHaveLength(1))
    expect(discagem.gravacoes[0]?.mudancas).toEqual({ simultaneidade: 2 })
  })

  it('sem os limites do provedor, aceita até o teto da coluna e avisa', async () => {
    const { discagem } = await abrirComoAdmin({
      integracoes: { carregar: { ok: false, motivo: 'falha-de-comunicacao' } },
    })
    await esperarFormulario()
    expect(
      await grupo(copy.campos.simultaneidade.rotulo).findByText(
        copy.simultaneidade.semConferencia,
      ),
    ).toBeDefined()

    digitar(campo(copy.campos.simultaneidade.rotulo), '10')
    digitar(campoDoMotivo(), 'contrato novo')
    await salvar()
    await waitFor(() => expect(discagem.gravacoes).toHaveLength(1))
    expect(discagem.gravacoes[0]?.mudancas).toEqual({ simultaneidade: 10 })
  })

  it('com um limite lido e o outro não, diz qual ficou de fora', async () => {
    await abrirComoAdmin({ integracoes: { integracoes: comLimites(4, null) } })
    await esperarFormulario()
    const simultaneidade = grupo(copy.campos.simultaneidade.rotulo)
    expect(await simultaneidade.findByText(copy.simultaneidade.manda('voz', 4))).toBeDefined()
    expect(simultaneidade.getByText(copy.simultaneidade.semLimiteDe('telefonia'))).toBeDefined()
  })
})

describe('política de discagem: salvar', () => {
  it('sem motivo não grava, e diz por quê', async () => {
    const { discagem } = await abrirComoAdmin()
    await esperarFormulario()
    digitar(campo(copy.campos.tetoDiarioDeLigacoes.rotulo), '500')
    await salvar()

    expect(await screen.findByText(copy.motivo.faltando)).toBeDefined()
    expect(discagem.gravacoes).toHaveLength(0)
  })

  it('grava só o que mudou com o motivo, e confirma o que mudou', async () => {
    const { discagem } = await abrirComoAdmin()
    await esperarFormulario()
    digitar(campo(copy.campos.tetoDiarioDeLigacoes.rotulo), '500')
    digitar(campo(copy.campos.tetoDeGastoCentavos.rotulo), '150,50')
    digitar(campoDoMotivo(), 'campanha de fim de mês')
    await salvar()

    await waitFor(() => expect(discagem.gravacoes).toHaveLength(1))
    expect(discagem.gravacoes[0]).toEqual({
      mudancas: { tetoDiarioDeLigacoes: 500, tetoDeGastoCentavos: 15050 },
      motivo: 'campanha de fim de mês',
    })

    const lista = within(await screen.findByRole('list', { name: copy.confirmacao.titulo }))
    const linhas = lista.getAllByRole('listitem').map((item) => item.textContent)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toBe(
      'Teto diário de ligações da conta: 200 ligações → 500 ligações',
    )
    expect(linhas[1]).toMatch(/^Teto de gasto do dia: sem teto → R\$\s150,50$/)
    // O motivo escrito vale para uma gravação só.
    expect(campoDoMotivo().value).toBe('')
  })

  it('sem mudança nenhuma, não grava e diz que nada mudou', async () => {
    const { discagem } = await abrirComoAdmin()
    await esperarFormulario()
    digitar(campoDoMotivo(), 'conferência')
    await salvar()

    expect(await screen.findByText(copy.nadaMudou)).toBeDefined()
    expect(discagem.gravacoes).toHaveLength(0)
  })

  it('recusa do servidor aparece com a frase dela', async () => {
    await abrirComoAdmin({ discagem: { salvar: { ok: false, motivo: 'sem-permissao' } } })
    await esperarFormulario()
    digitar(campo(copy.campos.tetoDiarioDeLigacoes.rotulo), '500')
    digitar(campoDoMotivo(), 'ajuste')
    await salvar()

    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeDefined()
    expect(screen.queryByRole('list', { name: copy.confirmacao.titulo })).toBeNull()
  })
})

describe('política de discagem: duração máxima e republicação', () => {
  it('avisa que precisa republicar, e o botão chama agent-publish', async () => {
    const { sarah } = await abrirComoAdmin()
    await esperarFormulario()
    const duracao = grupo(copy.campos.duracaoMaximaSegundos.rotulo)
    expect(duracao.getByText(copy.duracao.republicacao)).toBeDefined()

    fireEvent.click(duracao.getByRole('button', { name: copy.duracao.republicar }))
    expect(await duracao.findByText(copy.duracao.republicada)).toBeDefined()
    expect(sarah.chamadasAoAgentPublish()).toBe(1)
  })

  it('com alteração por salvar, republicar espera e diz para salvar antes', async () => {
    const { sarah } = await abrirComoAdmin({ discagem: { politica: politicaDeExemplo() } })
    await esperarFormulario()
    digitar(campo(copy.campos.intervaloMinimoMinutos.rotulo), '1')

    const duracao = grupo(copy.campos.duracaoMaximaSegundos.rotulo)
    const botao = duracao.getByRole('button', { name: copy.duracao.republicar }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(duracao.getByText(copy.duracao.salveAntes)).toBeDefined()
    fireEvent.click(botao)
    expect(sarah.chamadasAoAgentPublish()).toBe(0)
  })

  it('mudar a duração lembra de republicar na confirmação, e salvar não publica', async () => {
    const { discagem, sarah } = await abrirComoAdmin({ discagem: { politica: politicaDeExemplo() } })
    await esperarFormulario()
    digitar(campo(copy.campos.duracaoMaximaSegundos.rotulo), '300')
    digitar(campoDoMotivo(), 'ligações mais curtas')
    await salvar()

    expect(await screen.findByText(copy.confirmacao.lembreteDeRepublicar)).toBeDefined()
    expect(discagem.gravacoes[0]?.mudancas).toEqual({ duracaoMaximaSegundos: 300 })
    expect(sarah.chamadasAoAgentPublish()).toBe(0)
  })
})

// US-119: o estado do portão, as duas condições separadas e a lista de teste
// com leitura de membro e escrita de admin.

const NUMERO_DA_DONA = { id: 't-1', e164: '+5511999990001', rotulo: 'Celular da dona' }

async function abrirComPapel(papel: Papel, discagem: RespostasDeDiscagem = {}) {
  const servico = criarServicoDeDiscagemDublado(discagem)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/discagem',
    criarServicoDeEquipeDublado(comEquipe(comPapel(papel))),
    undefined,
    criarServicoDeIntegracoesDublado({ integracoes: comLimites(8, 6) }),
    undefined,
    undefined,
    criarServicoDaSarahDublado(),
    undefined,
    undefined,
    servico,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return servico
}

async function portao() {
  return within(await screen.findByRole('region', { name: copy.portao.titulo }))
}

function condicao(regiao: Awaited<ReturnType<typeof portao>>, rotulo: string) {
  return within(regiao.getByRole('listitem', { name: rotulo }))
}

describe('estado do portão', () => {
  const FASE = copy.portao.condicoes.liberacao_da_fase
  const TESTE = copy.portao.condicoes.primeira_chamada_de_teste

  it('restrito com as duas faltando: cada condição com o próprio caminho', async () => {
    await abrirComPapel('admin', {
      portao: {
        ok: true,
        portao: {
          falta: ['liberacao_da_fase', 'primeira_chamada_de_teste'],
          primeiraChamadaDeTesteEm: null,
        },
      },
    })
    const regiao = await portao()

    expect(regiao.getByText(copy.portao.restrito)).toBeDefined()
    expect(regiao.queryByText(copy.portao.liberado)).toBeNull()
    expect(condicao(regiao, FASE.rotulo).getByText(FASE.caminho)).toBeDefined()
    expect(condicao(regiao, TESTE.rotulo).getByText(TESTE.caminho)).toBeDefined()
    expect(
      condicao(regiao, TESTE.rotulo)
        .getByRole('link', { name: copy.portao.abrirDiscador })
        .getAttribute('href'),
    ).toBe('/')
  })

  it('só a ligação de teste faltando: a liberação aparece cumprida, sem caminho', async () => {
    await abrirComPapel('admin', {
      portao: {
        ok: true,
        portao: { falta: ['primeira_chamada_de_teste'], primeiraChamadaDeTesteEm: null },
      },
    })
    const regiao = await portao()

    const fase = condicao(regiao, FASE.rotulo)
    expect(fase.getByText(copy.portao.cumprida)).toBeDefined()
    expect(fase.getByText(copy.portao.faseLiberada)).toBeDefined()
    expect(fase.queryByText(FASE.caminho)).toBeNull()

    const teste = condicao(regiao, TESTE.rotulo)
    expect(teste.getByText(copy.portao.pendente)).toBeDefined()
    expect(teste.getByText(TESTE.pendente)).toBeDefined()
    expect(teste.getByText(TESTE.caminho)).toBeDefined()
  })

  it('só a liberação faltando: a ligação de teste aparece feita, com a data', async () => {
    await abrirComPapel('admin', {
      portao: {
        ok: true,
        portao: {
          falta: ['liberacao_da_fase'],
          primeiraChamadaDeTesteEm: '2026-09-22T15:00:00Z',
        },
      },
    })
    const regiao = await portao()

    expect(regiao.getByText(copy.portao.restrito)).toBeDefined()
    expect(condicao(regiao, FASE.rotulo).getByText(FASE.caminho)).toBeDefined()
    const teste = condicao(regiao, TESTE.rotulo)
    expect(teste.getByText(copy.portao.cumprida)).toBeDefined()
    expect(teste.getByText(/22\/09\/2026/)).toBeDefined()
    expect(teste.queryByRole('link', { name: copy.portao.abrirDiscador })).toBeNull()
  })

  it('liberado: nenhuma condição pendente', async () => {
    await abrirComPapel('admin', {
      portao: {
        ok: true,
        portao: { falta: [], primeiraChamadaDeTesteEm: '2026-09-22T15:00:00Z' },
      },
    })
    const regiao = await portao()

    expect(regiao.getByText(copy.portao.liberado)).toBeDefined()
    expect(regiao.queryByText(copy.portao.restrito)).toBeNull()
    expect(regiao.queryByText(copy.portao.pendente)).toBeNull()
    expect(regiao.getAllByText(copy.portao.cumprida)).toHaveLength(2)
  })

  it('desenha o que o servidor diz, sem recalcular pela data', async () => {
    // Sem data da ligação de teste e com a lista vazia: a tela que
    // recalculasse diria que a ligação falta. Quem decide é o servidor.
    await abrirComPapel('admin', {
      portao: { ok: true, portao: { falta: [], primeiraChamadaDeTesteEm: null } },
    })
    const regiao = await portao()

    expect(regiao.getByText(copy.portao.liberado)).toBeDefined()
    expect(regiao.queryByText(TESTE.pendente)).toBeNull()
  })

  it('falha ao ler o portão não vira liberado nem restrito', async () => {
    await abrirComPapel('admin', { portao: { ok: false, motivo: 'falha-de-comunicacao' } })

    expect(
      await screen.findByText(copy.portao.falhas['falha-de-comunicacao']),
    ).toBeDefined()
    expect(screen.queryByText(copy.portao.liberado)).toBeNull()
    expect(screen.queryByText(copy.portao.restrito)).toBeNull()
  })

  it('carregando', async () => {
    await abrirComPapel('admin', { portao: () => new Promise(() => {}) })

    expect(await screen.findByText(copy.portao.carregando)).toBeDefined()
  })
})

describe('números de teste: leitura de membro e escrita de admin', () => {
  it('o operador recebe a negativa e vê o portão e a lista em leitura', async () => {
    await abrirComPapel('operator', { numerosDeTeste: [NUMERO_DA_DONA] })

    const negativa = await screen.findByRole('alert')
    expect(within(negativa).getByText(copy.negativa.aviso)).toBeDefined()
    expect((await portao()).getByText(copy.portao.restrito)).toBeDefined()

    expect(await screen.findByText(NUMERO_DA_DONA.e164)).toBeDefined()
    expect(screen.getByText(copy.numerosDeTeste.somenteLeitura)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.numerosDeTeste.acao })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.numerosDeTeste.remover })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.salvar })).toBeNull()
  })

  it('o observador vê a mesma lista em leitura', async () => {
    await abrirComPapel('viewer', { numerosDeTeste: [NUMERO_DA_DONA] })

    expect(await screen.findByText(NUMERO_DA_DONA.e164)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.numerosDeTeste.acao })).toBeNull()
  })

  it('o admin cadastra um número e ele entra na lista', async () => {
    const servico = await abrirComPapel('admin')

    digitar(screen.getByLabelText(copy.numerosDeTeste.numero.rotulo), '+5511999990002')
    digitar(screen.getByLabelText(copy.numerosDeTeste.rotuloDoNumero.rotulo), 'Meu celular')
    fireEvent.click(screen.getByRole('button', { name: copy.numerosDeTeste.acao }))

    expect(await screen.findByText('+5511999990002')).toBeDefined()
    expect(servico.numerosCadastrados.map((n) => n.rotulo)).toEqual(['Meu celular'])
    expect(screen.queryByText(copy.numerosDeTeste.somenteLeitura)).toBeNull()
  })

  it('o admin tira um número da lista', async () => {
    const servico = await abrirComPapel('admin', { numerosDeTeste: [NUMERO_DA_DONA] })

    fireEvent.click(await screen.findByRole('button', { name: copy.numerosDeTeste.remover }))

    expect(await screen.findByText(copy.numerosDeTeste.vazio)).toBeDefined()
    expect(servico.numerosCadastrados).toEqual([])
  })
})

describe('/config/discagem: ligar para o lead novo em minutos (D-03)', () => {
  const lead = ligacaoAoLeadNovo

  it('nasce desligada e explica o que faz, a janela e o custo antes do botão', async () => {
    await abrirComoAdmin()
    const regiao = within(await screen.findByRole('region', { name: lead.titulo }))

    expect(await regiao.findByText(lead.desligada)).toBeDefined()
    expect(regiao.getByText(lead.comoFunciona)).toBeDefined()
    expect(regiao.getByText(lead.janela)).toBeDefined()
    expect(regiao.getByText(lead.custo)).toBeDefined()
    expect((regiao.getByLabelText(lead.interruptor) as HTMLInputElement).checked).toBe(false)
    // Antes da primeira ligação de teste, o lead do formulário espera.
    expect(await regiao.findByText(lead.portaoFechado)).toBeDefined()
  })

  it('liga com o prazo e o motivo, pelo RPC, e diz o que passa a acontecer', async () => {
    const { discagem } = await abrirComoAdmin()
    const regiao = within(await screen.findByRole('region', { name: lead.titulo }))

    fireEvent.click(await regiao.findByLabelText(lead.interruptor))
    fireEvent.change(regiao.getByRole('textbox', { name: lead.prazo.rotulo }), { target: { value: '10' } })
    const salvar = regiao.getByRole('button', { name: lead.salvar }) as HTMLButtonElement
    // Sem motivo, não grava.
    expect(salvar.disabled).toBe(true)
    fireEvent.change(regiao.getByRole('textbox', { name: lead.motivo.rotulo }), {
      target: { value: 'Formulário do site no ar' },
    })
    fireEvent.click(salvar)

    expect(await regiao.findByText(lead.salva(true))).toBeDefined()
    expect(discagem.gravacoesDaLigacaoAoLeadNovo).toEqual([
      { configuracao: { ligada: true, prazoMinutos: 10 }, motivo: 'Formulário do site no ar' },
    ])
    expect(await regiao.findByText(lead.ligada)).toBeDefined()
  })

  it('prazo fora de 1 a 1440 é recusado na tela, e a recusa do servidor tem frase', async () => {
    await abrirComoAdmin({ discagem: { salvarLigacaoAoLeadNovo: { ok: false, motivo: 'sem-permissao' } } })
    const regiao = within(await screen.findByRole('region', { name: lead.titulo }))

    const prazo = await regiao.findByRole('textbox', { name: lead.prazo.rotulo })
    fireEvent.change(prazo, { target: { value: '0' } })
    expect(regiao.getByText(lead.prazo.erro)).toBeDefined()
    fireEvent.change(prazo, { target: { value: '5' } })

    fireEvent.click(regiao.getByLabelText(lead.interruptor))
    fireEvent.change(regiao.getByRole('textbox', { name: lead.motivo.rotulo }), { target: { value: 'Teste' } })
    fireEvent.click(regiao.getByRole('button', { name: lead.salvar }))
    expect(await regiao.findByText(lead.falhas['sem-permissao'])).toBeDefined()
  })
})
