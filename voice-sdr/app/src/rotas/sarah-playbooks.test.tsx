// O que esta tela precisa provar: os quatro estados da seção 13, as três
// camadas com só uma travada, salvar separado de publicar, a nota obrigatória,
// os quatro desfechos de `agent-publish`, os quatro estados do indicador, o
// aviso da variante sem agenda e a leitura para quem não administra a conta.
//
// Duas asserções justificam o arquivo. "Salvar não publica" conta as idas a
// `agent-publish` no dublê, e não só o texto da tela: uma tela que publicasse
// ao salvar e dissesse "rascunho salvo" passaria em qualquer asserção sobre
// frase. E o relatório de "três publicados e um em falha" sai de
// `atenderPublicacao`, o código da borda, com o provedor recusando um
// propósito: a frase da falha é a da borda, não uma escrita para o teste.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { VERSAO_DA_CAMADA_UM } from '@compartilhado/playbook/camada-um.ts'
import { MENSAGENS_DO_PROPOSITO, MENSAGENS_DOS_WEBHOOKS } from '@publicacao/respostas.ts'

import { comum } from '@/copy/comum'
import {
  playbooksDaSarah as copy,
  PROPOSITO_EM_PORTUGUES,
} from '@/copy/sarah'
import type { Equipe, Papel } from '@/equipe/tipos'
import type { EstadoDePublicacao, EstadoDosPlaybooks } from '@/sarah/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDaSarahDublado,
  playbooksDeExemplo,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const CAMINHO = '/sarah/playbooks'

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
function comPapel(papelDoUsuario: Papel): Equipe {
  return {
    ...equipeDeExemplo(),
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

async function abrir(
  respostas: RespostasDaSarah = {},
  papel: Papel = 'admin',
): Promise<ServicoDaSarahDublado> {
  const sarah = criarServicoDaSarahDublado(respostas)

  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    CAMINHO,
    criarServicoDeEquipeDublado({
      carregar: { ok: true, equipe: comPapel(papel) },
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    sarah,
  )

  return sarah
}

function campo(rotulo: string): HTMLTextAreaElement {
  return screen.getByLabelText(rotulo) as HTMLTextAreaElement
}

function botao(nome: string | RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name: nome }) as HTMLButtonElement
}

/** Descoberta sem nenhuma versão no ar: só o rascunho vazio que nasce com a conta. */
function semVersaoNoAr(): EstadoDosPlaybooks {
  const exemplo = playbooksDeExemplo()
  return {
    ...exemplo,
    publicacao: 'rascunho',
    playbooks: exemplo.playbooks.map((playbook) =>
      playbook.proposito === 'discovery'
        ? {
            ...playbook,
            versoes: [
              {
                id: 'discovery-v1',
                versao: 1,
                estado: 'draft',
                roteiro: '',
                jeitoDaCasa: '',
                nota: null,
                publicadaEm: null,
                criadaEm: '2026-09-01T11:00:00.000Z',
              },
            ],
          }
        : playbook,
    ),
  }
}

async function publicarComNota(nota: string) {
  fireEvent.click(botao(copy.publicar.acao(3)))
  const dialogo = await screen.findByRole('dialog')
  fireEvent.change(within(dialogo).getByLabelText(copy.publicar.nota), {
    target: { value: nota },
  })
  fireEvent.click(within(dialogo).getByRole('button', { name: copy.publicar.confirmar }))
}

afterEach(cleanup)

describe('/sarah/playbooks: os quatro estados da tela', () => {
  it('carregando: a tela diz o que está esperando', async () => {
    const sarah = await abrir({ segurar: true })

    const espera = await screen.findByRole('status')
    expect(espera.textContent).toContain(copy.carregando)
    expect(screen.queryByLabelText(copy.camadaDois.campo)).toBeNull()

    sarah.liberar()
    expect(await screen.findByLabelText(copy.camadaDois.campo)).toBeDefined()
  })

  it('erro: a falha do servidor vira frase, sem editor', async () => {
    await abrir({ carregarPlaybooks: { ok: false, motivo: 'falha-de-comunicacao' } })

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toBe(copy.falhas['falha-de-comunicacao'])
    expect(screen.queryByLabelText(copy.camadaDois.campo)).toBeNull()
  })

  it('vazia: nenhuma versão publicada, com o caminho para gerar um rascunho', async () => {
    const sarah = await abrir({ playbooks: semVersaoNoAr() })

    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    fireEvent.click(botao(copy.vazio.gerar))

    // O gerado entra no campo, e não no banco: quem salva é a pessoa.
    await waitFor(() =>
      expect(campo(copy.camadaDois.campo).value).toContain('Rascunho gerado para discovery.'),
    )
    expect(sarah.rascunhos).toHaveLength(0)
    expect(screen.getByText(copy.vazio.gerado)).toBeDefined()
  })

  it('preenchida: o roteiro do propósito chega com o rascunho salvo', async () => {
    await abrir()

    const roteiro = await screen.findByLabelText(copy.camadaDois.campo)
    expect((roteiro as HTMLTextAreaElement).value).toContain('Pergunte onde a rota trava hoje.')
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
  })
})

describe('/sarah/playbooks: propósito e camadas', () => {
  it('o seletor tem os quatro propósitos com rótulo em português e chave em inglês', async () => {
    await abrir()

    const seletor = (await screen.findByLabelText(copy.seletor)) as HTMLSelectElement
    const opcoes = [...seletor.options].map((opcao) => [opcao.value, opcao.textContent])
    expect(opcoes).toEqual(
      Object.entries(PROPOSITO_EM_PORTUGUES).map(([chave, rotulo]) => [chave, rotulo]),
    )

    fireEvent.change(seletor, { target: { value: 'reminder' } })
    await waitFor(() => expect(campo(copy.camadaDois.campo).value).toBe('Roteiro de reminder.'))
  })

  it('a camada 1 aparece travada, com a versão e a explicação; só 2 e 3 se editam', async () => {
    await abrir()

    const camadaUm = await screen.findByLabelText(copy.camadaUm.rotulo)
    expect(camadaUm.tagName).toBe('PRE')
    expect(camadaUm.textContent).toContain(
      `camada 1, versão ${VERSAO_DA_CAMADA_UM}, propósito discovery`,
    )
    expect(screen.getByText(copy.camadaUm.selo)).toBeDefined()
    expect(screen.getByText(copy.camadaUm.versao(VERSAO_DA_CAMADA_UM))).toBeDefined()
    expect(screen.getByText(copy.camadaUm.explicacao)).toBeDefined()

    // Os únicos campos de texto da tela são as camadas 2 e 3.
    const campos = screen.getAllByRole('textbox').map((item) => item.getAttribute('name'))
    expect(campos).toEqual(['roteiro', 'jeito-da-casa'])
    expect(campo(copy.camadaDois.campo).disabled).toBe(false)
    expect(campo(copy.camadaTres.campo).disabled).toBe(false)
  })

  it('a variante sem agenda é explicada na tela (O-06)', async () => {
    await abrir()

    expect(await screen.findByText(copy.semAgenda.titulo)).toBeDefined()
    expect(screen.getByText(copy.semAgenda.texto)).toBeDefined()
    // E é a mesma variante que está no texto da camada 1.
    expect(screen.getByLabelText(copy.camadaUm.rotulo).textContent).toContain(
      'fechamento_de_descoberta_sem_agenda',
    )
  })
})

describe('/sarah/playbooks: salvar e publicar são atos separados', () => {
  it('salvar grava o rascunho e não publica nada', async () => {
    const sarah = await abrir()

    await screen.findByLabelText(copy.camadaDois.campo)
    fireEvent.change(campo(copy.camadaDois.campo), {
      target: { value: 'Pergunte a dor.\nPergunte o melhor horário.' },
    })

    // Com texto por salvar, publicar fica apagado: o que vai ao ar é o salvo.
    expect(botao(copy.publicar.acao(3)).disabled).toBe(true)
    expect(screen.getByText(copy.salveAntes)).toBeDefined()

    fireEvent.click(botao(copy.salvar))
    expect(await screen.findByText(copy.salvo(3))).toBeDefined()

    expect(sarah.rascunhos).toEqual([
      {
        proposito: 'discovery',
        roteiro: 'Pergunte a dor.\nPergunte o melhor horário.',
        jeitoDaCasa: '',
      },
    ])
    expect(sarah.publicacoesDeVersao).toHaveLength(0)
    expect(sarah.chamadasAoAgentPublish()).toBe(0)
    expect(screen.queryByText(copy.relatorio.titulo)).toBeNull()
  })

  it('publicar exige a nota e mostra o desfecho dos quatro propósitos', async () => {
    const sarah = await abrir()

    await screen.findByLabelText(copy.camadaDois.campo)
    fireEvent.click(botao(copy.publicar.acao(3)))

    const dialogo = await screen.findByRole('dialog')
    const confirmar = within(dialogo).getByRole('button', {
      name: copy.publicar.confirmar,
    }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)

    fireEvent.change(within(dialogo).getByLabelText(copy.publicar.nota), {
      target: { value: '   ' },
    })
    expect(confirmar.disabled).toBe(true)

    fireEvent.change(within(dialogo).getByLabelText(copy.publicar.nota), {
      target: { value: 'Pergunta sobre a rota que trava.' },
    })
    expect(confirmar.disabled).toBe(false)
    fireEvent.click(confirmar)

    const lista = await screen.findByRole('list', { name: copy.relatorio.rotulo })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual(
      Object.values(PROPOSITO_EM_PORTUGUES).map(
        (rotulo) => `${rotulo}${copy.relatorio.estados.publicado}`,
      ),
    )
    expect(screen.getByText(copy.relatorio.versao(3))).toBeDefined()
    expect(sarah.publicacoesDeVersao).toEqual([
      { proposito: 'discovery', versaoId: 'discovery-v3', nota: 'Pergunta sobre a rota que trava.' },
    ])
    expect(sarah.chamadasAoAgentPublish()).toBe(1)

    // O histórico já mostra a versão 3 no ar e a 2 arquivada.
    const historico = screen.getByRole('table', { name: copy.historico.rotulo })
    await waitFor(() =>
      expect(within(historico).getAllByRole('row')[1]?.textContent).toContain(
        'Pergunta sobre a rota que trava.',
      ),
    )
  })

  it('três publicados e um em falha é o que a tela diz, com a razão da borda', async () => {
    await abrir({ provedorRecusa: ['rescue'] })

    await screen.findByLabelText(copy.camadaDois.campo)
    await publicarComNota('Roteiro revisado.')

    const lista = await screen.findByRole('list', { name: copy.relatorio.rotulo })
    const resgate = within(lista)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith(PROPOSITO_EM_PORTUGUES.rescue))
    expect(resgate?.textContent).toContain(copy.relatorio.estados.falha)
    expect(resgate?.textContent).toContain(MENSAGENS_DO_PROPOSITO.provedor_recusou)

    const publicados = within(lista)
      .getAllByRole('listitem')
      .filter((item) => item.textContent?.includes(copy.relatorio.estados.publicado))
    expect(publicados).toHaveLength(3)
    expect(screen.getByText(copy.relatorio.resumo(3, 4))).toBeDefined()

    // E o indicador não finge que está tudo no ar.
    const indicador = screen.getByRole('region', { name: copy.indicador.rotulo })
    await waitFor(() =>
      expect(indicador.textContent).toContain(copy.indicador.selos.alteracoes_pendentes),
    )
  })

  it('agentes no ar e avisos da ElevenLabs não cadastrados: a tela mostra a pendência da borda', async () => {
    await abrir({ webhooksFalham: true })

    await screen.findByLabelText(copy.camadaDois.campo)
    await publicarComNota('Roteiro revisado.')

    await screen.findByRole('list', { name: copy.relatorio.rotulo })
    const pendencia = screen
      .getAllByRole('alert')
      .find((caixa) => caixa.textContent === MENSAGENS_DOS_WEBHOOKS.aviso_de_fim_nao_criado)
    expect(pendencia).toBeDefined()
  })

  it('sem pendência dos webhooks, nenhuma frase deles aparece', async () => {
    await abrir()

    await screen.findByLabelText(copy.camadaDois.campo)
    await publicarComNota('Roteiro revisado.')

    await screen.findByRole('list', { name: copy.relatorio.rotulo })
    for (const frase of Object.values(MENSAGENS_DOS_WEBHOOKS)) {
      expect(screen.queryByText(frase)).toBeNull()
    }
  })
})

describe('/sarah/playbooks: o indicador de publicação', () => {
  it.each(['rascunho', 'publicado', 'alteracoes_pendentes'] as EstadoDePublicacao[])(
    'mostra o estado %s de RF-311',
    async (publicacao) => {
      await abrir({ playbooks: { ...playbooksDeExemplo(), publicacao } })

      const indicador = await screen.findByRole('region', { name: copy.indicador.rotulo })
      expect(indicador.textContent).toContain(copy.indicador.selos[publicacao])
      expect(indicador.textContent).toContain(copy.indicador[publicacao])
    },
  )

  it('alterado fora da plataforma aparece com o botão de republicar, que corrige', async () => {
    const sarah = await abrir({
      playbooks: { ...playbooksDeExemplo(), foraDaPlataforma: ['discovery'] },
    })

    const indicador = await screen.findByRole('region', { name: copy.indicador.rotulo })
    expect(indicador.textContent).toContain(copy.indicador.selos.alterado_fora_da_plataforma)
    expect(indicador.textContent).toContain(
      copy.indicador.propositosAlterados([PROPOSITO_EM_PORTUGUES.discovery]),
    )

    fireEvent.click(within(indicador).getByRole('button', { name: copy.indicador.republicar }))

    await screen.findByRole('list', { name: copy.relatorio.rotulo })
    expect(sarah.chamadasAoAgentPublish()).toBe(1)
    // Republicar não cria versão: é só `agent-publish`.
    expect(sarah.publicacoesDeVersao).toHaveLength(0)
    await waitFor(() =>
      expect(indicador.textContent).not.toContain(
        copy.indicador.selos.alterado_fora_da_plataforma,
      ),
    )
  })
})

describe('/sarah/playbooks: histórico e comparação', () => {
  it('lista as versões e compara duas, linha a linha', async () => {
    await abrir()

    const historico = await screen.findByRole('table', { name: copy.historico.rotulo })
    const linhas = within(historico).getAllByRole('row').slice(1)
    expect(linhas.map((linha) => linha.textContent?.slice(0, 2))).toEqual(['v3', 'v2', 'v1'])

    // De v2 para v3 entrou uma pergunta.
    const diferenca = screen.getByRole('group', { name: copy.comparacao.rotulo })
    expect(diferenca.textContent).toContain(
      `${copy.comparacao.acrescentada}: Pergunte onde a rota trava hoje.`,
    )

    // De v1 para v2, a pergunta de horário.
    fireEvent.change(screen.getByLabelText(copy.comparacao.de), {
      target: { value: 'discovery-v1' },
    })
    fireEvent.change(screen.getByLabelText(copy.comparacao.para), {
      target: { value: 'discovery-v2' },
    })
    const outra = screen.getByRole('group', { name: copy.comparacao.rotulo })
    expect(outra.textContent).toContain(
      `${copy.comparacao.acrescentada}: Pergunte o melhor horário para o especialista ligar.`,
    )
    expect(outra.textContent).not.toContain('Pergunte onde a rota trava hoje.')
  })
})

describe('/sarah/playbooks: papel', () => {
  it('operator lê tudo, inclusive o histórico, e recebe a negativa para editar e publicar', async () => {
    await abrir({ playbooks: { ...playbooksDeExemplo(), publicacao: 'alteracoes_pendentes' } }, 'operator')

    const negativa = await screen.findByText(copy.leitura.aviso)
    expect(negativa.closest('[role="alert"]')).not.toBeNull()
    expect(screen.getByText(comum.negativaPorPapel.pedirAcesso)).toBeDefined()

    expect(campo(copy.camadaDois.campo).disabled).toBe(true)
    expect(campo(copy.camadaTres.campo).disabled).toBe(true)
    expect(botao(copy.salvar).disabled).toBe(true)
    expect(botao(copy.publicar.acao(3)).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: copy.indicador.republicar })).toBeNull()

    expect(screen.getByRole('table', { name: copy.historico.rotulo })).toBeDefined()
    expect(screen.getByRole('group', { name: copy.comparacao.rotulo })).toBeDefined()
  })

  it('admin recebe o botão de republicar quando há alteração pendente', async () => {
    await abrir({ playbooks: { ...playbooksDeExemplo(), publicacao: 'alteracoes_pendentes' } })

    const indicador = await screen.findByRole('region', { name: copy.indicador.rotulo })
    expect(within(indicador).getByRole('button', { name: copy.indicador.republicar })).toBeDefined()
    expect(screen.queryByText(copy.leitura.aviso)).toBeNull()
  })
})
