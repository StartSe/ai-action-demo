import type { SituacaoRecusada } from '@/equipe/tipos'

export const convite = {
  titulo: 'Convite para a equipe',
  carregando: 'Lendo o convite.',

  /** O que a tela mostra quando o link não vale mais. */
  situacoes: {
    expirado: 'Este convite expirou. Peça um novo link a quem administra a conta.',
    revogado: 'Este convite foi cancelado. Peça um novo link a quem administra a conta.',
    ja_aceito: 'Este convite já foi usado. Entre com seu e-mail e senha para acessar a conta.',
    nao_encontrado: 'Este link não é válido. Confira se ele foi copiado por inteiro.',
  } satisfies Record<SituacaoRecusada, string>,

  convidadoPor: 'Convite de',
  empresa: 'Empresa',
  papel: 'Papel',
  paraOEmail: 'Para o e-mail',
  validoAte: 'Válido até',

  semSessao:
    'Entre com o e-mail que recebeu o convite para aceitar. Se ainda não tem senha, use a recuperação para criar uma.',
  entrar: 'Entrar e aceitar',
  criarSenha: 'Criar minha senha',

  emailDiferente:
    'Você está na conta de acesso de outro e-mail. Saia e entre com o endereço do convite.',
  sair: 'Sair desta sessão',

  aceitar: 'Aceitar convite',
  aceitando: 'Aceitando o convite',
  irParaOPainel: 'Ir para o painel',
  falhaDeComunicacao:
    'Não foi possível aceitar o convite agora. Tente de novo em alguns minutos.',
} as const
