import type {
  AcaoRegistrada,
  MotivoDeFalhaDaAuditoria,
  Periodo,
  TipoDeAutor,
} from '@/auditoria/tipos'

/** O verbo que o gatilho grava, dito como a tela diz. */
export const ACAO_EM_PORTUGUES: Record<AcaoRegistrada, string> = {
  insert: 'Criou',
  update: 'Alterou',
  delete: 'Removeu',
}

/**
 * Nome da tabela tocada, em português. Tabela de fase futura que ainda não
 * esteja aqui aparece pelo próprio nome, que é melhor do que uma linha muda.
 */
export const ALVO_EM_PORTUGUES: Record<string, string> = {
  accounts: 'Conta',
  account_members: 'Membro da equipe',
  account_secrets: 'Credencial',
  invitations: 'Convite',
  onboarding_state: 'Configuração inicial',
  profiles: 'Perfil',
}

/** Autor sem nome de pessoa: a Sarah e as rotinas do servidor. */
export const AUTOR_SEM_PESSOA: Record<Exclude<TipoDeAutor, 'user'>, string> = {
  agent: 'Assistente',
  system: 'Sistema',
}

export const auditoria = {
  titulo: 'Auditoria',
  explicacao:
    'Toda mudança de configuração desta conta, com quem fez, o que mudou e quando.',

  carregando: 'Carregando o registro.',
  falhas: {
    'sem-permissao': 'Você não tem permissão para ver o registro desta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaAuditoria, string>,

  filtros: {
    titulo: 'Filtros',
    autor: 'Autor',
    todosOsAutores: 'Qualquer autor',
    acao: 'Tipo de ação',
    todasAsAcoes: 'Qualquer ação',
    periodo: 'Período',
    limpar: 'Limpar filtros',
  },

  periodos: {
    tudo: 'Todo o período',
    '24h': 'Últimas 24 horas',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
  } satisfies Record<Periodo, string>,

  tabela: {
    rotulo: 'Registro de auditoria',
    colunas: {
      quando: 'Quando',
      autor: 'Autor',
      acao: 'Ação',
      alvo: 'Alvo',
      detalhe: 'Detalhe',
    },
    autorDesconhecido: 'Pessoa que saiu da conta',
    campos: 'Campos:',
    semDetalhe: '—',
  },

  truncada:
    'Mostrando as mudanças mais recentes. Estreite o período para ver o resto.',

  vazio: {
    titulo: 'Nenhuma ação registrada',
    explicacao:
      'Ainda não houve mudança de configuração nesta conta. Cada alteração passa a aparecer aqui no instante em que acontece.',
  },
  vazioComFiltro: {
    titulo: 'Nenhuma ação com esses filtros',
    explicacao:
      'Nenhuma mudança casa com o autor, o tipo de ação ou o período escolhidos. Amplie os filtros para ver mais.',
  },
} as const
