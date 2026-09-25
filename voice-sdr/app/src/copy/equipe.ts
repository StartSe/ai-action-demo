import type { MotivoDeFalhaDaEquipe, Papel } from '@/equipe/tipos'

export const PAPEL_EM_PORTUGUES: Record<Papel, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Observador',
}

export const equipe = {
  titulo: 'Equipe',
  explicacao:
    'Quem tem acesso a esta conta, com qual papel e quando entrou pela última vez.',

  carregando: 'Carregando a equipe.',
  falhas: {
    'sem-permissao': 'Você não tem permissão para esta ação nesta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'convite-repetido':
      'Já existe um convite pendente para este e-mail. Cancele o anterior antes de gerar outro.',
    'email-invalido': 'Informe um e-mail completo, com arroba e domínio.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaEquipe, string>,

  convite: {
    titulo: 'Convidar alguém',
    explicacao:
      'O link vale por sete dias e só funciona para o e-mail informado.',
    email: { rotulo: 'E-mail', exemplo: 'nome@empresa.com.br' },
    papel: 'Papel na conta',
    acao: 'Gerar link de convite',
    acaoEmCurso: 'Gerando o link',
    emailObrigatorio: 'Informe o e-mail de quem você quer convidar.',
    linkPronto: 'Link gerado e copiado.',
    linkNaoCopiado: 'Link gerado. Copie o endereço abaixo.',
    rotuloDoLink: 'Link do convite',
    copiar: 'Copiar de novo',
  },

  membros: {
    titulo: 'Membros',
    colunas: {
      pessoa: 'Pessoa',
      papel: 'Papel',
      ultimoAcesso: 'Último acesso',
      acoes: 'Ações',
    },
    voce: 'você',
    nuncaAcessou: 'Nunca acessou',
    remover: 'Remover',
  },

  pendentes: {
    titulo: 'Convites pendentes',
    vazio: {
      titulo: 'Nenhum convite pendente',
      explicacao:
        'Todo mundo que foi convidado já entrou, ou ainda não há convite gerado.',
    },
    expiraEm: 'Expira em',
    revogar: 'Cancelar convite',
  },

  leitura: {
    aviso: 'Seu papel nesta conta permite apenas consultar a equipe.',
    pedirAcesso: 'Peça acesso a quem administra a conta:',
    semAdministrador:
      'Esta conta não tem administrador registrado. Fale com o suporte.',
  },
} as const
