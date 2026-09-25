import { describe, expect, it } from 'vitest'

import {
  bloqueiosPendentes,
  classeDoPasso,
  configuracaoConcluida,
  declararLigacaoDeTeste,
  definirDispensa,
  estadoDoPasso,
  faltaParaLigar,
  irParaPasso,
  marcarPasso,
  passoEmFoco,
  passoResolvido,
  passoVizinho,
  quantidadeResolvida,
  saiDoPasso,
  tutorialConcluido,
} from '@/configuracao-inicial/progresso'
import type {
  ConfiguracaoInicial,
  PassoId,
  PassoMedido,
} from '@/configuracao-inicial/tipos'
import { passosConcluidos, passosDeExemplo } from '@/testes/servico-de-configuracao-dublado'

function configuracao(
  passos: PassoMedido[] = passosDeExemplo(),
  passoAtual: PassoId | null = null,
  dispensada = false,
  ligacaoDeTeste: string | null = null,
): ConfiguracaoInicial {
  return { passos, passoAtual, dispensada, ligacaoDeTeste }
}

function passo(parcial: Partial<PassoMedido> = {}): PassoMedido {
  return {
    passo: 'numero',
    ordem: 4,
    pendente: true,
    marcado: false,
    disponivel: false,
    bloqueia: ['ligacao'],
    estado: 'pendente',
    ...parcial,
  }
}

describe('progresso da configuração inicial', () => {
  it('não deixa a marcação fechar passo que bloqueia alguma coisa', () => {
    // A regra inteira desta tela: quem marca "número" não faz aparecer número.
    expect(passoResolvido(passo({ marcado: true }))).toBe(false)
    expect(passoResolvido(passo({ pendente: false, marcado: false }))).toBe(true)
  })

  it('fecha o passo opcional pela marcação, porque ele não impede nada', () => {
    const opcional = passo({ passo: 'equipe', ordem: 8, bloqueia: [] })

    expect(passoResolvido(opcional)).toBe(false)
    expect(passoResolvido({ ...opcional, marcado: true })).toBe(true)
  })

  it('conta como concluída só quando nada que bloqueia continua pendente', () => {
    const cenario = configuracao()
    expect(configuracaoConcluida(cenario)).toBe(false)
    expect(quantidadeResolvida(cenario)).toBe(1)

    const tudoMedido = passosDeExemplo().map((item) => ({
      ...item,
      pendente: false,
    }))
    expect(configuracaoConcluida(configuracao(tudoMedido))).toBe(true)
  })

  it('reúne o que as pendências impedem, sem repetir e em ordem fixa', () => {
    expect(bloqueiosPendentes(configuracao())).toEqual([
      'ligacao',
      'agendamento',
      'campanha',
    ])

    const soEquipe = passosDeExemplo().map((item) => ({
      ...item,
      pendente: item.passo === 'equipe',
    }))
    // O passo opcional não bloqueia nada, então a lista fica vazia mesmo com
    // ele pendente.
    expect(bloqueiosPendentes(configuracao(soEquipe))).toEqual([])
  })

  it('mostra aguardando aprovação quando o servidor põe o passo em espera', () => {
    const esperando = passo({ marcado: true, estado: 'aguardando_aprovacao' })

    expect(estadoDoPasso(esperando)).toBe('aguardando')
    // Sem a espera declarada, o mesmo passo é só indisponível.
    expect(estadoDoPasso(passo())).toBe('indisponivel')
    // Quem decide se o passo espera alguém de fora é o catálogo do banco: a
    // marcação sozinha não muda o estado.
    expect(estadoDoPasso(passo({ marcado: true }))).toBe('indisponivel')
    expect(estadoDoPasso(passo({ disponivel: true }))).toBe('pendente')
    expect(
      estadoDoPasso(passo({ pendente: false, estado: 'concluido' })),
    ).toBe('concluido')
  })

  it('abre no passo guardado, e no primeiro que falta quando não há guardado', () => {
    expect(passoEmFoco(configuracao(passosDeExemplo(), 'leads'))?.passo).toBe(
      'leads',
    )
    expect(passoEmFoco(configuracao())?.passo).toBe('agente')
    expect(passoEmFoco(configuracao([]))).toBeNull()
  })

  it('anda para o vizinho na ordem do assistente, e para nas pontas', () => {
    const cenario = configuracao()

    expect(passoVizinho(cenario, 'roteiro', 1)).toBe('numero')
    expect(passoVizinho(cenario, 'roteiro', -1)).toBe('agente')
    expect(passoVizinho(cenario, 'credenciais', -1)).toBeNull()
    expect(passoVizinho(cenario, 'equipe', 1)).toBeNull()
  })

  it('marcar acrescenta a marcação e leva ao próximo que ainda falta', () => {
    const cenario = configuracao(passosDeExemplo(), 'agente')
    const progresso = marcarPasso(cenario, 'agente')

    expect(progresso.marcados).toEqual(['credenciais', 'numero', 'agente'])
    expect(progresso.passoAtual).toBe('roteiro')
    expect(progresso.dispensada).toBe(false)
  })

  it('pular e voltar movem o assistente sem marcar nada', () => {
    const cenario = configuracao(passosDeExemplo(), 'agente')
    const progresso = irParaPasso(cenario, 'leads')

    expect(progresso.passoAtual).toBe('leads')
    expect(progresso.marcados).toEqual(['credenciais', 'numero'])
  })

  it('dispensar e retomar mexem só na dispensa', () => {
    const cenario = configuracao(passosDeExemplo(), 'agente')

    expect(definirDispensa(cenario, true)).toEqual({
      passoAtual: 'agente',
      marcados: ['credenciais', 'numero'],
      dispensada: true,
      ligacaoDeTeste: null,
    })
    expect(definirDispensa(configuracao(passosDeExemplo(), 'agente', true), false).dispensada).toBe(
      false,
    )
  })

  it('separa o que trava a primeira ligação do que pode esperar', () => {
    const classes = Object.fromEntries(
      passosDeExemplo().map((item) => [item.passo, classeDoPasso(item)]),
    )
    expect(classes).toEqual({
      credenciais: 'primeira-ligacao',
      agente: 'primeira-ligacao',
      roteiro: 'primeira-ligacao',
      numero: 'primeira-ligacao',
      especialista: 'depois-da-ligacao',
      agenda: 'depois-da-ligacao',
      leads: 'depois-da-ligacao',
      equipe: 'opcional',
    })
  })

  it('sai do passo só quando o assistente muda de passo ou fecha', () => {
    const atual = configuracao(passosDeExemplo(), 'agente')

    expect(saiDoPasso(atual, irParaPasso(atual, 'agente'))).toBe(false)
    expect(saiDoPasso(atual, irParaPasso(atual, 'roteiro'))).toBe(true)
    expect(saiDoPasso(atual, marcarPasso(atual, 'agente'))).toBe(true)
    expect(saiDoPasso(atual, definirDispensa(atual, true))).toBe(true)
  })

  it('o que falta para ligar é só o que trava a primeira ligação e está pendente', () => {
    expect(faltaParaLigar(configuracao())).toEqual(['agente', 'roteiro', 'numero'])
    expect(faltaParaLigar(configuracao(passosConcluidos()))).toEqual([])
  })

  it('o tutorial só conclui com o catálogo resolvido e a ligação declarada', () => {
    expect(tutorialConcluido(configuracao(passosConcluidos()))).toBe(false)
    expect(tutorialConcluido(configuracao(passosConcluidos(), null, false, 'ch-1'))).toBe(true)
    expect(tutorialConcluido(configuracao(passosDeExemplo(), null, false, 'ch-1'))).toBe(false)
    // O checklist continua olhando só o catálogo.
    expect(configuracaoConcluida(configuracao(passosConcluidos()))).toBe(true)
  })

  it('declarar a ligação guarda a chamada e mantém o resto do progresso', () => {
    const cenario = configuracao(passosDeExemplo(), 'equipe')

    expect(declararLigacaoDeTeste(cenario, 'ch-1')).toEqual({
      passoAtual: null,
      marcados: ['credenciais', 'numero'],
      dispensada: false,
      ligacaoDeTeste: 'ch-1',
    })
    // Andar pelo assistente depois não apaga a ligação declarada.
    const depois = configuracao(passosDeExemplo(), null, false, 'ch-1')
    expect(irParaPasso(depois, 'agente').ligacaoDeTeste).toBe('ch-1')
  })
})
