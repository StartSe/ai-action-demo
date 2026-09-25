import { describe, expect, it } from 'vitest'

import {
  CADASTRO_EM_BRANCO,
  lerTelefone,
  localidadeAVista,
  localidadeVeioDoDdd,
  montarNovoLead,
  podeGravar,
  recusaAVista,
  type CamposDoCadastro,
} from '@/leads/cadastro'

/** O campo como fica depois de alguém digitar. */
function comCampos(mudanca: Partial<CamposDoCadastro>): CamposDoCadastro {
  return { ...CADASTRO_EM_BRANCO, ...mudanca }
}

describe('leitura do telefone', () => {
  it('normaliza as escritas do mesmo número para o mesmo E.164', () => {
    const escritas = [
      '(48) 99999-8888',
      '48 99999-8888',
      '048999998888',
      '+55 48 99999-8888',
      '0055 48 999998888',
    ]

    for (const escrita of escritas) {
      expect(lerTelefone(escrita).e164).toBe('+5548999998888')
    }
  })

  it('resolve cidade, estado e fuso pelo DDD do número aceito', () => {
    const leitura = lerTelefone('(48) 99999-8888')

    expect(leitura.ddd).toBe('48')
    expect(leitura.local).toEqual({
      cidade: 'Florianópolis',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
  })

  it('não resolve DDD nenhum enquanto o número não é um número', () => {
    // Os dois primeiros dígitos já formam um DDD que existe, e é justamente
    // isso que não pode virar cidade: o número ainda está sendo digitado.
    const leitura = lerTelefone('4899')

    expect(leitura.e164).toBeNull()
    expect(leitura.ddd).toBeNull()
    expect(leitura.local).toBeNull()
    expect(leitura.motivo).toBe('comprimento_invalido')
  })

  it('devolve o motivo da recusa em código, nunca em frase', () => {
    expect(lerTelefone('(21) 99999-8888 x').motivo).toBeNull()
    expect(lerTelefone('(20) 99999-8888').motivo).toBe('ddd_invalido')
    expect(lerTelefone('(48) 89999-8888').motivo).toBe('celular_sem_nono_digito')
    expect(lerTelefone('+351 912 345 678').motivo).toBe('pais_nao_suportado')
    expect(lerTelefone('abc').motivo).toBe('sem_digitos')
  })
})

describe('recusa à vista', () => {
  it('campo em branco não acusa nada', () => {
    expect(recusaAVista('', lerTelefone(''))).toBeNull()
  })

  it('campo escrito só com separador acusa vazio', () => {
    expect(recusaAVista('   ', lerTelefone('   '))).toBe('vazio')
  })

  it('campo com número malformado acusa o motivo do normalizador', () => {
    expect(recusaAVista('(20) 99999-8888', lerTelefone('(20) 99999-8888'))).toBe(
      'ddd_invalido',
    )
  })
})

describe('localidade', () => {
  const local = lerTelefone('(48) 99999-8888').local

  it('mostra o que o DDD resolveu enquanto ninguém tocou nos campos', () => {
    expect(localidadeAVista(CADASTRO_EM_BRANCO, local)).toEqual({
      cidade: 'Florianópolis',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
    expect(localidadeVeioDoDdd(CADASTRO_EM_BRANCO, local)).toBe(true)
  })

  it('o escrito à mão vence, e o resto continua vindo do DDD', () => {
    const campos = comCampos({ cidade: 'Palhoça' })

    expect(localidadeAVista(campos, local)).toEqual({
      cidade: 'Palhoça',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
  })

  it('trocar o telefone não apaga a cidade corrigida à mão', () => {
    const campos = comCampos({ cidade: 'Palhoça' })
    const outro = lerTelefone('(11) 99999-8888').local

    expect(localidadeAVista(campos, outro).cidade).toBe('Palhoça')
    // O que não foi tocado acompanha o DDD novo.
    expect(localidadeAVista(campos, outro).estado).toBe('SP')
  })

  it('campo esvaziado à mão continua vazio, e não volta ao palpite do DDD', () => {
    // `''` é escolha de quem digitou; só `null` é "ainda não tocado".
    const campos = comCampos({ cidade: '' })

    expect(localidadeAVista(campos, local).cidade).toBe('')
    expect(localidadeVeioDoDdd(campos, local)).toBe(true)
  })

  it('com os três escritos à mão, nada mais vem do DDD', () => {
    const campos = comCampos({ cidade: 'Palhoça', estado: 'SC', fuso: 'UTC' })

    expect(localidadeVeioDoDdd(campos, local)).toBe(false)
  })

  it('sem DDD resolvido, os campos ficam vazios e nada se anuncia', () => {
    expect(localidadeAVista(CADASTRO_EM_BRANCO, null)).toEqual({
      cidade: '',
      estado: '',
      fuso: '',
    })
    expect(localidadeVeioDoDdd(CADASTRO_EM_BRANCO, null)).toBe(false)
  })
})

describe('poder gravar', () => {
  const base = {
    e164: '+5548999998888',
    duplicado: false,
    gravando: false,
    podeEscrever: true,
  }

  it('grava quando há número aceito, papel e nenhum duplicado', () => {
    expect(podeGravar(base)).toBe(true)
  })

  it('não grava sem número aceito', () => {
    expect(podeGravar({ ...base, e164: null })).toBe(false)
  })

  it('não grava quando o telefone já está na conta', () => {
    expect(podeGravar({ ...base, duplicado: true })).toBe(false)
  })

  it('não grava duas vezes seguidas nem sem papel', () => {
    expect(podeGravar({ ...base, gravando: true })).toBe(false)
    expect(podeGravar({ ...base, podeEscrever: false })).toBe(false)
  })
})

describe('montagem do lead', () => {
  const leitura = lerTelefone('(48) 99999-8888')

  it('apara os campos e leva a localidade à vista', () => {
    const campos = comCampos({
      nome: '  Marina Castro ',
      email: ' marina@aurora.com.br ',
      empresa: ' Aurora ',
      origem: ' Indicação ',
      etapa: 'qualified',
    })

    expect(montarNovoLead(campos, '+5548999998888', leitura.local)).toEqual({
      telefone: '+5548999998888',
      nome: 'Marina Castro',
      email: 'marina@aurora.com.br',
      empresa: 'Aurora',
      origem: 'Indicação',
      etapa: 'qualified',
      cidade: 'Florianópolis',
      estado: 'SC',
      fuso: 'America/Sao_Paulo',
    })
  })

  it('etapa em branco vira lead sem etapa, e não cadeia vazia', () => {
    const lead = montarNovoLead(CADASTRO_EM_BRANCO, '+5548999998888', null)

    expect(lead.etapa).toBeNull()
    expect(lead.nome).toBe('')
  })
})
