// As regras do cadastro de especialista, sem renderizar nada (US-251).
//
// Elas repetem os checks da tabela de propósito: a tela precisa saber dizer o
// que está errado **antes** de mandar, e a mensagem do Postgres
// (`specialists_teto_util`) não é frase para ninguém ler. O banco continua
// sendo quem recusa de verdade — isto aqui é o que evita a viagem.

import { MODALIDADES, type Modalidade, type PedidoDeEspecialista } from '@/especialistas/tipos'

/** Os intervalos que os checks da tabela cobram. */
export const LIMITES = {
  duracao: { minimo: 15, maximo: 240 },
  teto: { minimo: 1, maximo: 20 },
  // 10080 minutos são sete dias: a antecedência mínima não passa de uma semana.
  antecedenciaMinima: { minimo: 0, maximo: 10_080 },
  antecedenciaMaxima: { minimo: 1, maximo: 90 },
} as const

/**
 * O `default` de cada coluna numérica de `specialists`. É o que o cadastro
 * novo abre e o que o assistente chama de padrão; o teste
 * `padroes-da-configuracao.test.ts` compara com a migração.
 */
export const PADRAO_DO_ESPECIALISTA = {
  duracaoPadraoMin: 30,
  tetoDiario: 6,
  antecedenciaMinimaMin: 120,
  antecedenciaMaximaDias: 30,
} as const satisfies Partial<PedidoDeEspecialista>

/** Os padrões de um cadastro novo, os mesmos da tabela. */
export function especialistaVazio(fusoDaConta: string): PedidoDeEspecialista {
  return {
    id: null,
    nome: '',
    area: null,
    fuso: fusoDaConta,
    // Sem padrão de modalidade: adivinhar `video` para todo mundo agendaria
    // presencial como vídeo. Quem cadastra escolhe.
    modalidades: [],
    ...PADRAO_DO_ESPECIALISTA,
    sala: null,
    email: '',
    ativo: true,
  }
}

export type ProblemaDoCadastro =
  | 'nome'
  | 'email'
  | 'modalidades'
  | 'duracao'
  | 'teto'
  | 'antecedencia_minima'
  | 'antecedencia_maxima'

/**
 * O que impede a gravação, na ordem em que a tela mostra os campos. Lista, e
 * não o primeiro problema: quem preenche um formulário quer ver tudo o que
 * falta de uma vez, e não descobrir um erro por tentativa.
 */
export function problemasDoCadastro(
  pedido: PedidoDeEspecialista,
): readonly ProblemaDoCadastro[] {
  const problemas: ProblemaDoCadastro[] = []

  if (pedido.nome.trim() === '') problemas.push('nome')
  // A mesma régua do check da tabela: arroba que não seja o primeiro caractere.
  if (pedido.email.trim().indexOf('@') < 1) problemas.push('email')
  if (pedido.modalidades.length === 0) problemas.push('modalidades')

  if (foraDoIntervalo(pedido.duracaoPadraoMin, LIMITES.duracao)) problemas.push('duracao')
  if (foraDoIntervalo(pedido.tetoDiario, LIMITES.teto)) problemas.push('teto')
  if (foraDoIntervalo(pedido.antecedenciaMinimaMin, LIMITES.antecedenciaMinima)) {
    problemas.push('antecedencia_minima')
  }
  if (foraDoIntervalo(pedido.antecedenciaMaximaDias, LIMITES.antecedenciaMaxima)) {
    problemas.push('antecedencia_maxima')
  }

  return problemas
}

function foraDoIntervalo(valor: number, limite: { minimo: number; maximo: number }): boolean {
  return !Number.isInteger(valor) || valor < limite.minimo || valor > limite.maximo
}

/** A modalidade conhecida, ou nula. */
export function lerModalidade(valor: string): Modalidade | null {
  return (MODALIDADES as readonly string[]).includes(valor) ? (valor as Modalidade) : null
}

/** Liga ou desliga uma modalidade, mantendo a ordem de `MODALIDADES`. */
export function alternarModalidade(
  atuais: readonly Modalidade[],
  modalidade: Modalidade,
): Modalidade[] {
  const tem = atuais.includes(modalidade)
  return MODALIDADES.filter((item) =>
    item === modalidade ? !tem : atuais.includes(item),
  )
}

/**
 * Quantos podem receber reunião hoje. É o número que responde "a Sarah tem
 * para quem encaminhar?" — e é zero tanto na conta sem cadastro quanto na que
 * desligou todo mundo.
 */
export function quantosAtivos(especialistas: readonly { ativo: boolean }[]): number {
  return especialistas.filter((especialista) => especialista.ativo).length
}

/**
 * As áreas já cadastradas, uma por grafia, para o cadastro sugerir e o
 * roteamento listar (D-16). Duas grafias que só mudam em caixa ou espaço são a
 * mesma área, como na comparação de `_shared/agenda/roteamento.ts`, e fica a
 * primeira. Só os ativos: especialista desligado não recebe reunião, e a área
 * dele sugerida faria alguém cadastrar num time vazio. A ordem é alfabética
 * pelo texto normalizado, por comparação crua, sem depender do ICU da máquina.
 */
export function areasCadastradas(
  especialistas: readonly { area: string | null; ativo: boolean }[],
): string[] {
  const porChave = new Map<string, string>()
  for (const especialista of especialistas) {
    if (!especialista.ativo || especialista.area === null) continue
    const area = especialista.area.trim()
    const chave = area.toLowerCase()
    if (chave === '' || porChave.has(chave)) continue
    porChave.set(chave, area)
  }
  return [...porChave.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, area]) => area)
}
