import { NOME_DO_PRODUTO } from '@compartilhado/marca.ts'

export const comum = {
  /** A marca mora em `@compartilhado/marca.ts`, a mesma que as bordas usam. */
  nomeDoProduto: NOME_DO_PRODUTO,
  /** As iniciais do quadrado da marca, na barra lateral e nas telas de acesso. */
  promessa:
    'Uma SDR que liga, qualifica e marca a reunião na agenda do seu especialista',
  irParaOPainel: 'Ir para o painel',
  sair: 'Sair',
  /**
   * A negativa por papel. As duas frases são as mesmas em toda tela que tem o
   * que ler e não o que mudar; só o aviso de abertura é do assunto da tela, e
   * ele fica na copy dela.
   */
  negativaPorPapel: {
    pedirAcesso: 'Peça acesso a quem administra a conta:',
    semAdministrador:
      'Esta conta não tem administrador registrado. Fale com o suporte.',
  },
} as const
