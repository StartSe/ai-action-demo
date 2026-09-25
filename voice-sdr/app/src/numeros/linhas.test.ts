import { describe, expect, it } from 'vitest'

import {
  CADASTRO_EM_BRANCO,
  estadoDaLinha,
  leituraDaSaude,
  TENTATIVAS_PARA_MEDIR,
  validarCadastro,
} from '@/numeros/linhas'
import { linhaDeExemplo } from '@/testes/servico-de-numeros-dublado'

const CAMPOS = {
  ...CADASTRO_EM_BRANCO,
  numero: '(11) 4000-1234',
  rotulo: '  Linha comercial ',
}

describe('validarCadastro', () => {
  it('normaliza o número e apara o nome da linha', () => {
    expect(validarCadastro(CAMPOS)).toEqual({
      ok: true,
      dados: {
        e164: '+551140001234',
        rotulo: 'Linha comercial',
        comportamento: 'agent',
        encaminharPara: null,
      },
    })
  })

  it('recusa encaminhar sem destino, com o motivo no campo do destino', () => {
    expect(
      validarCadastro({ ...CAMPOS, comportamento: 'forward', destino: '  ' }),
    ).toEqual({ ok: false, recusas: { destino: 'destino_obrigatorio' } })
  })

  it('recusa destino que não é telefone pela mesma régua do número', () => {
    expect(
      validarCadastro({ ...CAMPOS, comportamento: 'forward', destino: '(00) 1234' }),
    ).toMatchObject({ ok: false, recusas: { destino: expect.any(String) } })
  })

  it('grava o destino normalizado quando encaminha', () => {
    const validado = validarCadastro({
      ...CAMPOS,
      comportamento: 'forward',
      destino: '11 99999-8888',
    })
    expect(validado).toMatchObject({
      ok: true,
      dados: { comportamento: 'forward', encaminharPara: '+5511999998888' },
    })
  })

  it('ignora o destino escrito quando o comportamento não encaminha', () => {
    const validado = validarCadastro({
      ...CAMPOS,
      comportamento: 'voicemail',
      destino: '11 99999-8888',
    })
    expect(validado).toMatchObject({ ok: true, dados: { encaminharPara: null } })
  })

  it('recusa número e nome em branco ao mesmo tempo', () => {
    expect(validarCadastro(CADASTRO_EM_BRANCO)).toEqual({
      ok: false,
      recusas: { numero: 'vazio', rotulo: 'vazio' },
    })
  })
})

describe('leituraDaSaude', () => {
  it.each([
    ['o retrato de nascença', {}],
    ['nulo', null],
    ['uma lista', []],
    ['taxa sem tentativas', { answer_rate: 0 }],
    ['taxa zero com poucas tentativas', { answer_rate: 0, attempts: 3 }],
    [
      'tentativas abaixo da janela',
      { answer_rate: 0.8, attempts: TENTATIVAS_PARA_MEDIR - 1 },
    ],
    ['taxa fora de 0 a 1', { answer_rate: 80, attempts: 60 }],
    ['taxa em texto', { answer_rate: '0.8', attempts: 60 }],
  ])('não mede %s', (_, saude) => {
    expect(leituraDaSaude(saude)).toEqual({ medida: false })
  })

  it('mede quando a janela está cheia, inclusive com taxa zero', () => {
    expect(
      leituraDaSaude({ answer_rate: 0, attempts: TENTATIVAS_PARA_MEDIR }),
    ).toEqual({ medida: true, taxaDeAtendimento: 0, tentativas: 50 })
  })
})

describe('estadoDaLinha', () => {
  it('linha registrada e ligada está ativa', () => {
    expect(estadoDaLinha(linhaDeExemplo())).toBe('ativa')
  })

  it('linha sem registro no provedor aguarda a operadora', () => {
    expect(estadoDaLinha(linhaDeExemplo({ registradaNoProvedor: false }))).toBe(
      'aguardando_operadora',
    )
  })

  it('desligada vence a espera', () => {
    expect(
      estadoDaLinha(
        linhaDeExemplo({ registradaNoProvedor: false, ligada: false }),
      ),
    ).toBe('desligada')
  })
})
