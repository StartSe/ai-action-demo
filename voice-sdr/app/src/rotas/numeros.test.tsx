// O que esta tela precisa provar: os quatro estados, o cadastro chamando o
// registro, o encaminhamento que exige destino, a espera da operadora como
// estado normal, a saúde que não vira zero, os dois interruptores com o efeito
// escrito e a leitura para quem não administra a conta.
//
// Duas asserções justificam o arquivo. Encaminhar sem destino é a configuração
// morta que o PRD proíbe: o teste cobra a recusa no campo e que nada chegou ao
// serviço. E saúde vazia não é zero: "0% de atendimento" numa linha que nunca
// discou diz que ela está queimada.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { comum } from '@/copy/comum'
import { COMPORTAMENTO_DE_ENTRADA, numeros as copy } from '@/copy/numeros'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeNumerosDublado,
  linhaDeExemplo,
  type RespostasDeNumeros,
  type ServicoDeNumerosDublado,
} from '@/testes/servico-de-numeros-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const CAMINHO = '/numeros'

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
  respostas: RespostasDeNumeros = {},
  papel: Papel = 'admin',
): Promise<ServicoDeNumerosDublado> {
  const numeros = criarServicoDeNumerosDublado(respostas)

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
    undefined,
    numeros,
  )

  return numeros
}

async function cartao(rotulo: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: rotulo })
}

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

afterEach(cleanup)

describe('/numeros', () => {
  describe('os quatro estados', () => {
    it('espera com a frase do que está carregando', async () => {
      const numeros = criarServicoDeNumerosDublado()
      numeros.carregar = () => new Promise(() => {})

      await montarAplicacao(
        criarServicoDublado({ sessao: SESSAO }),
        CAMINHO,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        numeros,
      )

      expect(await screen.findByText(copy.carregando)).toBeTruthy()
    })

    it('falha com a frase do motivo', async () => {
      await abrir({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })

      const alerta = await screen.findByRole('alert')
      expect(alerta.textContent).toBe(copy.falhas['falha-de-comunicacao'])
    })

    it('vazio explica que sem número não há ligação e aponta para a configuração inicial', async () => {
      await abrir()

      expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
      expect(screen.getByText(copy.vazio.explicacao)).toBeTruthy()
      const link = screen.getByRole('link', { name: copy.vazio.irParaConfiguracao })
      expect(link.getAttribute('href')).toBe('/configuracao-inicial')
    })

    it('com linha, desenha um cartão com tudo que a linha é', async () => {
      await abrir({
        linhas: [
          linhaDeExemplo({
            comportamento: 'forward',
            encaminharPara: '+5511999998888',
            tetoDiario: 80,
          }),
        ],
      })

      const regiao = await cartao('Linha comercial')
      const dentro = within(regiao)

      const numero = dentro.getByText('+551140001234')
      expect(numero.classList.contains('val')).toBe(true)
      expect(dentro.getByText('twilio')).toBeTruthy()
      expect(dentro.getByText(COMPORTAMENTO_DE_ENTRADA.forward.rotulo)).toBeTruthy()
      expect(
        dentro.getByText(COMPORTAMENTO_DE_ENTRADA.forward.consequencia),
      ).toBeTruthy()
      expect(dentro.getByText('+5511999998888').classList.contains('val')).toBe(
        true,
      )
      expect(dentro.getByText(copy.cartao.tetoValor(80))).toBeTruthy()
      expect(dentro.getByText(copy.estados.ativa)).toBeTruthy()
      expect(
        (dentro.getByLabelText(copy.cartao.rodizio) as HTMLInputElement).checked,
      ).toBe(true)
      expect(
        (dentro.getByLabelText(copy.cartao.saida) as HTMLInputElement).checked,
      ).toBe(true)
    })
  })

  describe('saúde', () => {
    it('vazia diz que ainda não há histórico, e nunca zero', async () => {
      await abrir({ linhas: [linhaDeExemplo({ saude: {} })] })

      const dentro = within(await cartao('Linha comercial'))
      expect(dentro.getByText(copy.cartao.semHistorico)).toBeTruthy()
      expect(dentro.getByText(copy.cartao.saudeExplicacao)).toBeTruthy()
      expect(dentro.queryByText(/0\s*%/)).toBeNull()
    })

    it('medida mostra a taxa e não oferece campo para editá-la', async () => {
      await abrir({
        linhas: [linhaDeExemplo({ saude: { answer_rate: 0.42, attempts: 60 } })],
      })

      const regiao = await cartao('Linha comercial')
      expect(
        within(regiao).getByText(copy.cartao.saudeValor(0.42, 60)),
      ).toBeTruthy()
      // Os únicos controles do cartão são os dois interruptores.
      expect(within(regiao).queryAllByRole('textbox')).toHaveLength(0)
      expect(within(regiao).getAllByRole('checkbox')).toHaveLength(2)
    })
  })

  describe('cadastro', () => {
    it('grava o número normalizado e mostra a espera da operadora como estado normal', async () => {
      const numeros = await abrir()

      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )
      preencher(copy.cadastrar.numero, '(11) 4000-1234')
      preencher(copy.cadastrar.rotulo, 'Linha comercial')
      fireEvent.click(
        screen.getByRole('button', { name: copy.cadastrar.gravar }),
      )

      const regiao = await cartao('Linha comercial')
      expect(numeros.cadastros).toEqual([
        {
          e164: '+551140001234',
          rotulo: 'Linha comercial',
          comportamento: 'agent',
          encaminharPara: null,
        },
      ])
      expect(numeros.registros).toEqual(['l-1'])

      const dentro = within(regiao)
      expect(dentro.getByText(copy.estados.aguardando_operadora)).toBeTruthy()
      expect(dentro.getByText(copy.aguardandoExplicacao)).toBeTruthy()
      expect(dentro.getByRole('status').textContent).toBe(copy.registro.aguardando)
      // Espera não é erro: nenhuma caixa de alerta na tela.
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('mostra a consequência de cada comportamento ao lado da escolha', async () => {
      await abrir()
      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )

      for (const texto of Object.values(COMPORTAMENTO_DE_ENTRADA)) {
        const opcao = screen.getByRole('radio', { name: texto.rotulo })
        const descricao = document.getElementById(
          opcao.getAttribute('aria-describedby') ?? '',
        )
        expect(descricao?.textContent).toBe(texto.consequencia)
      }
    })

    it('encaminhar sem destino é recusado no campo e nada vai ao servidor', async () => {
      const numeros = await abrir()

      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )
      preencher(copy.cadastrar.numero, '(11) 4000-1234')
      preencher(copy.cadastrar.rotulo, 'Recepção')
      fireEvent.click(
        screen.getByRole('radio', {
          name: COMPORTAMENTO_DE_ENTRADA.forward.rotulo,
        }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: copy.cadastrar.gravar }),
      )

      expect(
        await screen.findByText(
          copy.cadastrar.recusas.destino.destino_obrigatorio,
        ),
      ).toBeTruthy()
      expect(numeros.cadastros).toEqual([])
    })

    it('encaminhar com destino grava o destino junto', async () => {
      const numeros = await abrir()

      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )
      preencher(copy.cadastrar.numero, '(11) 4000-1234')
      preencher(copy.cadastrar.rotulo, 'Recepção')
      fireEvent.click(
        screen.getByRole('radio', {
          name: COMPORTAMENTO_DE_ENTRADA.forward.rotulo,
        }),
      )
      preencher(copy.cadastrar.destino, '(11) 99999-8888')
      fireEvent.click(
        screen.getByRole('button', { name: copy.cadastrar.gravar }),
      )

      await cartao('Recepção')
      expect(numeros.cadastros).toMatchObject([
        { comportamento: 'forward', encaminharPara: '+5511999998888' },
      ])
    })

    it('número repetido fica no formulário com a frase do motivo', async () => {
      await abrir({ cadastrar: { ok: false, motivo: 'numero-repetido' } })

      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )
      preencher(copy.cadastrar.numero, '(11) 4000-1234')
      preencher(copy.cadastrar.rotulo, 'Linha comercial')
      fireEvent.click(
        screen.getByRole('button', { name: copy.cadastrar.gravar }),
      )

      const alerta = await screen.findByRole('alert')
      expect(alerta.textContent).toBe(copy.falhas['numero-repetido'])
      expect(
        (screen.getByLabelText(copy.cadastrar.numero) as HTMLInputElement).value,
      ).toBe('(11) 4000-1234')
    })

    it('registro recusado pelo provedor deixa a linha e oferece registrar de novo', async () => {
      const numeros = await abrir({
        registro: { estado: 'nao_registrada', mensagem: 'A telefonia recusou a chave.' },
      })

      fireEvent.click(
        await screen.findByRole('button', { name: copy.cadastrar.abrir }),
      )
      preencher(copy.cadastrar.numero, '(11) 4000-1234')
      preencher(copy.cadastrar.rotulo, 'Linha comercial')
      fireEvent.click(
        screen.getByRole('button', { name: copy.cadastrar.gravar }),
      )

      const dentro = within(await cartao('Linha comercial'))
      expect(dentro.getByText(copy.registro.naoRegistrada)).toBeTruthy()
      expect(dentro.getByText('A telefonia recusou a chave.')).toBeTruthy()

      fireEvent.click(
        dentro.getByRole('button', { name: copy.registro.registrarDeNovo }),
      )
      await waitFor(() => expect(numeros.registros).toEqual(['l-1', 'l-1']))
    })
  })

  describe('saída e rodízio', () => {
    it('tirar do rodízio grava e escreve o efeito na guarda', async () => {
      const numeros = await abrir({ linhas: [linhaDeExemplo()] })

      const dentro = within(await cartao('Linha comercial'))
      expect(dentro.getByText(copy.cartao.rodizioLigado)).toBeTruthy()

      fireEvent.click(dentro.getByLabelText(copy.cartao.rodizio))

      expect(
        await dentro.findByText(copy.cartao.rodizioDesligado),
      ).toBeTruthy()
      expect(numeros.mudancas).toEqual([
        { linhaId: 'l-1', mudanca: { noRodizio: false } },
      ])
    })

    it('desligar a saída grava e diz que a linha só recebe', async () => {
      const numeros = await abrir({ linhas: [linhaDeExemplo()] })

      const dentro = within(await cartao('Linha comercial'))
      fireEvent.click(dentro.getByLabelText(copy.cartao.saida))

      expect(await dentro.findByText(copy.cartao.saidaDesligada)).toBeTruthy()
      expect(numeros.mudancas).toEqual([
        { linhaId: 'l-1', mudanca: { saidaLigada: false } },
      ])
    })

    it('mudança recusada mostra a frase no cartão e mantém o estado', async () => {
      await abrir({
        linhas: [linhaDeExemplo()],
        alterar: { ok: false, motivo: 'sem-permissao' },
      })

      const dentro = within(await cartao('Linha comercial'))
      fireEvent.click(dentro.getByLabelText(copy.cartao.rodizio))

      const alerta = await dentro.findByRole('alert')
      expect(alerta.textContent).toBe(copy.falhas['sem-permissao'])
      expect(dentro.getByText(copy.cartao.rodizioLigado)).toBeTruthy()
    })
  })

  describe('papel', () => {
    it('operator vê em leitura, com a negativa e a quem pedir', async () => {
      const numeros = await abrir({ linhas: [linhaDeExemplo()] }, 'operator')

      const dentro = within(await cartao('Linha comercial'))
      expect(await screen.findByText(copy.leitura.aviso)).toBeTruthy()
      expect(
        screen.getByRole('list', { name: comum.negativaPorPapel.pedirAcesso })
          .textContent,
      ).toContain('selma@aurora.com.br')

      expect(
        screen.queryByRole('button', { name: copy.cadastrar.abrir }),
      ).toBeNull()
      for (const interruptor of dentro.getAllByRole('checkbox')) {
        expect((interruptor as HTMLInputElement).disabled).toBe(true)
      }
      expect(numeros.mudancas).toEqual([])
    })

    it('admin não recebe negativa', async () => {
      await abrir({ linhas: [linhaDeExemplo()] })

      await cartao('Linha comercial')
      expect(screen.queryByText(copy.leitura.aviso)).toBeNull()
    })
  })
})
