import type {
  MotivoDeFalhaDeEntrada,
  MotivoDeFalhaDeFundacao,
  MotivoDeFalhaDeRecuperacao,
} from '@/autenticacao/tipos'

/**
 * O GoTrue devolve `invalid_credentials` tanto para e-mail desconhecido quanto
 * para senha errada. Só nesse caso vale gastar uma ida ao servidor para
 * conferir o e-mail.
 */
export function precisaConferirOEmail(codigo: string | undefined): boolean {
  return codigo === 'invalid_credentials' || codigo === 'invalid_grant'
}

/**
 * Traduz o código do GoTrue para o motivo que a tela sabe explicar.
 *
 * `emailRegistrado` é `undefined` quando a conferência não respondeu. Aí a
 * escolha é "senha incorreta": é o caso comum, e mandar quem tem conta pedir
 * convite seria pior do que mandar quem não tem tentar a recuperação.
 */
export function classificarFalhaDeEntrada(
  codigo: string | undefined,
  emailRegistrado: boolean | undefined,
): MotivoDeFalhaDeEntrada {
  if (precisaConferirOEmail(codigo)) {
    return emailRegistrado === false ? 'conta-inexistente' : 'senha-incorreta'
  }

  switch (codigo) {
    case 'email_not_confirmed':
      return 'email-nao-confirmado'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'excesso-de-tentativas'
    default:
      return 'falha-de-comunicacao'
  }
}

/**
 * A fundação atravessa dois servidores e por isso dois vocabulários de erro: o
 * do GoTrue, no cadastro, e o do Postgres, no `fundar_instalacao`. Os códigos
 * não colidem, então uma função só classifica os dois.
 *
 * `42501` é a recusa que importa: o servidor conferiu sob trava e a instalação
 * já tinha dono. Quem perdeu a corrida precisa entrar ou pedir convite, e não
 * repetir o formulário.
 */
export function classificarFalhaDeFundacao(
  codigo: string | undefined,
): MotivoDeFalhaDeFundacao {
  switch (codigo) {
    case '42501':
      return 'ja-fundada'
    case 'user_already_exists':
    case 'email_exists':
      return 'email-em-uso'
    case 'weak_password':
      return 'senha-fraca'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'excesso-de-tentativas'
    default:
      return 'falha-de-comunicacao'
  }
}

export function classificarFalhaDeRecuperacao(
  codigo: string | undefined,
): MotivoDeFalhaDeRecuperacao {
  switch (codigo) {
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'excesso-de-tentativas'
    case 'otp_expired':
    case 'session_not_found':
    case 'reauthentication_needed':
      return 'link-expirado'
    case 'weak_password':
    case 'same_password':
      return 'senha-fraca'
    default:
      return 'falha-de-comunicacao'
  }
}
