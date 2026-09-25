export const autenticacao = {
  entrar: {
    titulo: 'Entrar',
    email: { rotulo: 'E-mail', exemplo: 'ana@transportes.com.br' },
    senha: { rotulo: 'Senha' },
    acao: 'Entrar',
    acaoEmCurso: 'Entrando',
    esqueciASenha: 'Esqueci minha senha',
    sessaoExpirada:
      'Sua sessão expirou. Entre de novo para voltar à página que você abriu.',
    emailObrigatorio: 'Informe o e-mail.',
    senhaObrigatoria: 'Informe a senha.',
    falhas: {
      'conta-inexistente':
        'Não existe conta com esse e-mail. Confira o endereço ou peça um convite a quem administra a conta.',
      'senha-incorreta': 'Senha incorreta. Use a recuperação se não lembrar.',
      'email-nao-confirmado':
        'Confirme o e-mail antes de entrar. O link foi enviado quando a conta foi criada.',
      'excesso-de-tentativas':
        'Tentativas demais em pouco tempo. Espere um minuto e tente de novo.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor. Tente de novo.',
    },
  },

  fundacao: {
    titulo: 'Crie sua conta',
    explicacao: 'Você será o administrador, com acesso total e quem convida a equipe.',
    aviso: 'Depois desta conta, novos acessos entram só por convite.',
    nomeDaConta: { rotulo: 'Nome da empresa', exemplo: 'Transportes Aurora' },
    nomeDoDono: { rotulo: 'Seu nome', exemplo: 'Ana Ribeiro' },
    email: { rotulo: 'E-mail', exemplo: 'ana@transportes.com.br' },
    senha: { rotulo: 'Senha' },
    confirmacao: { rotulo: 'Repita a senha' },
    acao: 'Criar conta',
    acaoEmCurso: 'Criando',
    nomeDaContaObrigatorio: 'Informe o nome da empresa.',
    nomeDoDonoObrigatorio: 'Informe seu nome.',
    emailObrigatorio: 'Informe o e-mail.',
    senhaObrigatoria: 'Informe a senha.',
    senhaCurta: 'A senha precisa ter pelo menos 8 caracteres.',
    senhasDiferentes: 'As duas senhas não são iguais.',
    falhas: {
      'ja-fundada':
        'Esta instalação acabou de ganhar um administrador. Entre com sua conta ou peça um convite a quem administra.',
      'email-em-uso':
        'Já existe usuário com esse e-mail. Entre com ele ou use a recuperação de senha.',
      'senha-fraca':
        'O servidor recusou essa senha. Escolha uma senha mais longa.',
      'excesso-de-tentativas':
        'Tentativas demais em pouco tempo. Espere um minuto e tente de novo.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor. Tente de novo.',
    },
  },

  recuperarSenha: {
    pedido: {
      titulo: 'Recuperar senha',
      explicacao:
        'Informe o e-mail da sua conta. Você recebe um link para definir uma senha nova.',
      email: { rotulo: 'E-mail', exemplo: 'ana@transportes.com.br' },
      acao: 'Enviar o link',
      acaoEmCurso: 'Enviando',
      voltar: 'Voltar para entrar',
      emailObrigatorio: 'Informe o e-mail.',
      enviado:
        'Se houver conta com esse e-mail, o link chega em alguns minutos. Confira também a caixa de spam.',
    },
    novaSenha: {
      titulo: 'Definir senha nova',
      explicacao: 'Escolha uma senha com 8 caracteres ou mais.',
      senha: { rotulo: 'Senha nova' },
      confirmacao: { rotulo: 'Repita a senha nova' },
      acao: 'Salvar a senha',
      acaoEmCurso: 'Salvando',
      senhaObrigatoria: 'Informe a senha nova.',
      senhaCurta: 'A senha precisa ter pelo menos 8 caracteres.',
      senhasDiferentes: 'As duas senhas não são iguais.',
      salva: 'Senha alterada. Você já está dentro da sua conta.',
    },
    falhas: {
      'excesso-de-tentativas':
        'Tentativas demais em pouco tempo. Espere um minuto e tente de novo.',
      'link-expirado':
        'Este link de recuperação expirou. Peça um novo na tela de recuperação.',
      'senha-fraca':
        'O servidor recusou essa senha. Escolha uma senha mais longa.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor. Tente de novo.',
    },
  },
} as const

export const TAMANHO_MINIMO_DE_SENHA = 8
