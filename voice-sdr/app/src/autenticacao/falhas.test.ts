import { describe, expect, it } from 'vitest'

import {
  classificarFalhaDeEntrada,
  classificarFalhaDeRecuperacao,
  precisaConferirOEmail,
} from '@/autenticacao/falhas'

describe('classificarFalhaDeEntrada', () => {
  it('separa conta inexistente de senha errada pelo resultado da conferência', () => {
    expect(classificarFalhaDeEntrada('invalid_credentials', false)).toBe(
      'conta-inexistente',
    )
    expect(classificarFalhaDeEntrada('invalid_credentials', true)).toBe(
      'senha-incorreta',
    )
  })

  it('sem resposta da conferência, fica em senha incorreta', () => {
    expect(classificarFalhaDeEntrada('invalid_credentials', undefined)).toBe(
      'senha-incorreta',
    )
  })

  it('traduz os demais códigos do GoTrue', () => {
    expect(classificarFalhaDeEntrada('email_not_confirmed', undefined)).toBe(
      'email-nao-confirmado',
    )
    expect(classificarFalhaDeEntrada('over_request_rate_limit', undefined)).toBe(
      'excesso-de-tentativas',
    )
    expect(classificarFalhaDeEntrada('bad_json', undefined)).toBe(
      'falha-de-comunicacao',
    )
    expect(classificarFalhaDeEntrada(undefined, undefined)).toBe(
      'falha-de-comunicacao',
    )
  })
})

describe('precisaConferirOEmail', () => {
  it('só gasta a ida ao servidor no código ambíguo', () => {
    expect(precisaConferirOEmail('invalid_credentials')).toBe(true)
    expect(precisaConferirOEmail('invalid_grant')).toBe(true)
    expect(precisaConferirOEmail('email_not_confirmed')).toBe(false)
    expect(precisaConferirOEmail(undefined)).toBe(false)
  })
})

describe('classificarFalhaDeRecuperacao', () => {
  it('traduz os códigos que a recuperação encontra', () => {
    expect(classificarFalhaDeRecuperacao('otp_expired')).toBe('link-expirado')
    expect(classificarFalhaDeRecuperacao('session_not_found')).toBe(
      'link-expirado',
    )
    expect(classificarFalhaDeRecuperacao('weak_password')).toBe('senha-fraca')
    expect(classificarFalhaDeRecuperacao('over_email_send_rate_limit')).toBe(
      'excesso-de-tentativas',
    )
    expect(classificarFalhaDeRecuperacao('surpresa')).toBe(
      'falha-de-comunicacao',
    )
  })
})
