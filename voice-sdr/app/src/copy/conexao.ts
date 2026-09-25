export const conexao = {
  tela: {
    titulo: 'Conectar ao seu Supabase',
    explicacao:
      'Esta cópia guarda os dados num projeto Supabase seu. Instale pelo painel da StartSe e volte por aqui, ou informe o projeto que já tem a instalação.',
    instalar: 'Instalar pelo painel da StartSe',
    instalarApoio:
      'O painel cria o banco e publica as funções no seu projeto. Ao terminar, abra esta cópia de novo.',
    manualTitulo: 'Já instalei',
    url: {
      rotulo: 'Endereço do projeto',
      exemplo: 'https://abcd…xyz.supabase.co',
      apoio:
        'No painel do Supabase: Project Settings, Data API, campo Project URL. O ref do projeto sozinho também serve.',
    },
    chave: {
      rotulo: 'Chave publicável',
      exemplo: 'sb_publishable_…',
      apoio:
        'Opcional. Em branco, a chave vem do próprio projeto. Fica em Project Settings, API Keys.',
    },
    acao: 'Conectar',
    acaoEmCurso: 'Conferindo o projeto',
    urlInvalida: 'Use o endereço https://<ref>.supabase.co ou o ref do projeto.',
    chaveInvalida: 'Esta não é uma chave publicável do Supabase.',
    chaveSecreta:
      'Esta é a chave secreta do projeto. Ela ignora as regras de acesso e não pode ficar numa página. Use a chave publicável.',
    semChave:
      'O projeto não informou a chave publicável. Cole a chave em Project Settings, API Keys.',
    falhas: {
      sem_instalacao:
        'O projeto respondeu, mas a instalação não está nele. Instale pelo painel da StartSe e tente de novo.',
      instalacao_incompleta:
        'A instalação neste projeto não terminou. Rode o instalador do painel de novo.',
      inalcancavel:
        'O projeto não respondeu. Confira o endereço e se o projeto não está pausado no Supabase.',
      sem_armazenamento:
        'O navegador não deixou guardar o projeto. Saia da navegação privada e tente de novo.',
    },
  },
  confirmacao: {
    titulo: 'Conectar a outro projeto',
    explicacao:
      'O link que você abriu aponta para um projeto diferente do que esta cópia usa. Conecte só se você mesmo fez a instalação.',
    atual: 'Projeto atual',
    novo: 'Projeto do link',
    acao: 'Conectar a este projeto',
    manter: 'Manter o projeto atual',
  },
  projeto: {
    titulo: 'Projeto Supabase',
    apoio:
      'Esta cópia fala com o projeto abaixo. Trocar de projeto encerra a sessão neste navegador.',
    endereco: 'Endereço',
    trocar: 'Trocar de projeto',
    trocarNaEntrada: 'Conectar a outro projeto Supabase',
    confirmarTroca:
      'Trocar de projeto encerra a sessão e volta para a tela de conexão. Os dados continuam no projeto atual.',
    confirmar: 'Trocar',
    cancelar: 'Cancelar',
  },
  versao: {
    banco_atrasado: {
      titulo: 'Atualize a sua instalação',
      texto:
        'Esta cópia espera uma versão mais nova do banco. Rode o instalador do painel da StartSe de novo no mesmo projeto.',
    },
    copia_atrasada: {
      titulo: 'Esta cópia é mais antiga que o seu banco',
      texto:
        'O banco já foi atualizado para uma versão que esta cópia não conhece. Atualize a cópia a partir do repositório.',
    },
    funcoes_diferentes: {
      titulo: 'As funções do projeto são de outra versão',
      texto:
        'O banco está na versão desta cópia, mas as funções publicadas não. Rode o instalador do painel de novo.',
    },
  },
  enderecosDoAuth: {
    titulo: 'Libere este endereço no Auth do Supabase',
    texto:
      'Os links de e-mail do Supabase, como o de recuperar senha, só voltam para endereços liberados no projeto. Em Authentication, URL Configuration, use este endereço como Site URL e acrescente a linha abaixo em Redirect URLs.',
    siteUrl: 'Site URL',
    redirect: 'Redirect URLs',
    copiar: 'Copiar',
    copiado: 'Copiado',
    abrir: 'Abrir a configuração no Supabase',
  },
} as const
