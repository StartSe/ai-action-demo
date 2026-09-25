/**
 * Textos da seção de automação em /config/discagem (US-190): lembrete de
 * reunião, nova tentativa por resultado da ligação e resgate de falta atestada.
 */

import type { CampoDaAutomacao, MotivoDoCampoDaAutomacao } from '@/automacao/regras'
import type { MotivoDeFalhaDaAutomacao } from '@/automacao/tipos'

export const automacao = {
  titulo: 'Automação',
  explicacao:
    'O que a assistente faz sozinha depois da ligação: lembrar a reunião, tentar de novo quem não atendeu e retomar quem faltou.',
  carregando: 'Carregando a automação da conta',
  vazio: {
    titulo: 'A conta ainda não tem configuração de automação',
    explicacao: 'A configuração nasce com a conta. Recarregue a página ou fale com o suporte se ela não aparecer.',
  },
  grupos: {
    lembrete: 'Lembrete de reunião',
    retentativa: 'Nova tentativa quando a ligação não vira conversa',
    resgate: 'Resgate de quem faltou',
  },
  campos: {
    lembreteInicioMinutos: {
      rotulo: 'Antecedência mínima do lembrete',
      unidade: 'minutos',
      consequencia: 'Reunião que começa em menos tempo que isso não recebe lembrete.',
    },
    lembreteFimMinutos: {
      rotulo: 'Antecedência do lembrete',
      unidade: 'minutos',
      consequencia: 'É quanto antes do horário a ligação de lembrete sai.',
    },
    retentativaTeto: {
      rotulo: 'Tentativas por discagem',
      unidade: 'tentativas',
      consequencia: 'Na última, a ligação sem conversa não volta à fila e fica registrada na ficha do lead.',
    },
    retentativaRecuosMinutos: {
      rotulo: 'Espera depois de não atender',
      unidade: 'minutos, separados por vírgula',
      consequencia: 'Um valor por tentativa. O último vale para as seguintes.',
    },
    retentativaOcupadoMinutos: {
      rotulo: 'Espera depois de ocupado',
      unidade: 'minutos',
      consequencia: 'Linha ocupada tenta de novo depois deste intervalo.',
    },
    turnos: {
      rotulo: 'Turnos do dia',
      unidade: 'um por linha, nome 09:00-12:00',
      consequencia: 'Caixa postal tenta de novo no turno seguinte, no horário do lead.',
    },
    resgateTeto: {
      rotulo: 'Ligações de resgate por falta',
      unidade: 'ligações',
      consequencia: 'Só falta marcada por alguém gera resgate. Esgotadas, o lead vai para Perdido. Zero desliga o resgate.',
    },
    resgateRecuoMinutos: {
      rotulo: 'Espera entre resgates',
      unidade: 'minutos',
      consequencia: 'O resgate seguinte espera este intervalo depois do anterior.',
    },
  } satisfies Record<CampoDaAutomacao, { rotulo: string; unidade: string; consequencia: string }>,
  errosDoCampo: {
    obrigatorio: 'Preencha este campo.',
    'fora-da-faixa': 'Valor fora da faixa aceita.',
    formato: 'Use um turno por linha, como manha 09:00-12:00, em ordem e sem sobreposição.',
    'janela-invertida': 'A antecedência do lembrete precisa ser maior que a mínima.',
  } satisfies Record<MotivoDoCampoDaAutomacao, string>,
  faixa: (minimo: number, maximo: number) => `Aceita de ${minimo} a ${maximo}.`,
  motivo: {
    rotulo: 'Motivo da mudança na automação',
    exemplo: 'o time prefere lembrar com meia hora',
    faltando: 'Escreva o motivo. Ele vai para a trilha de auditoria.',
  },
  camposComErro: 'Revise os campos marcados.',
  nadaMudou: 'Nada mudou na automação.',
  salvar: 'Salvar automação',
  salvando: 'Salvando…',
  salva: 'Automação salva.',
  falhas: {
    'sem-permissao': 'Só quem administra a conta muda a automação.',
    'sem-conta': 'Não encontramos a conta desta sessão.',
    'falha-de-comunicacao': 'Não foi possível falar com o servidor. Tente de novo.',
    'valor-recusado': 'O servidor recusou um dos valores. Revise as faixas.',
  } satisfies Record<MotivoDeFalhaDaAutomacao, string>,
}
