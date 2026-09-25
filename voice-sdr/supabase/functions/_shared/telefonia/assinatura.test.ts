// Provas da assinatura da telefonia.
//
// O que este arquivo segura:
//
// 1. **A receita é a da operadora, e não a nossa.** O valor esperado do
//    primeiro teste foi calculado fora deste repositório, com HMAC-SHA1 sobre a
//    URL mais os pares ordenados por nome. Um teste que comparasse a função com
//    ela mesma passaria verde com a ordem trocada, com o separador errado e com
//    SHA-256 no lugar de SHA-1 — que são exatamente os três jeitos de errar
//    isto.
// 2. **A ordem é do nome, nunca a da chegada.** Corpo de formulário não promete
//    ordem, e a mesma ligação assinada duas vezes chega com os pares em ordens
//    diferentes.
// 3. **Ausente, malformada e inválida são todas falso.** Quem chama devolve o
//    mesmo 401 para as três, e é aqui que as três viram o mesmo valor.

import { expect, test } from 'vitest'

import {
  assinaturaDaTelefonia,
  conferirAssinaturaDaTelefonia,
  pareceAssinaturaDaTelefonia,
  type ParDoCorpo,
} from './assinatura.ts'

const TOKEN = '12345'
const URL_CHAMADA = 'https://mycompany.com/myapp.php?foo=1&bar=2'

const PARES: readonly ParDoCorpo[] = [
  ['Digits', '1234'],
  ['To', '+18005551212'],
  ['From', '+14158675310'],
  ['Caller', '+14158675310'],
  ['CallSid', 'CA1234567890ABCDE'],
]

/**
 * Calculada fora daqui, por uma implementação independente:
 * `base64(hmac_sha1(token, url + "CallSid" + valor + "Caller" + valor + ...))`,
 * com os nomes em ordem alfabética. É o que torna este arquivo uma prova da
 * receita e não da nossa leitura dela.
 */
const ASSINATURA_ESPERADA = 'GvWf1cFY/Q7PnoempGyD5oXAezc='

test('a assinatura é a que a telefonia calcularia', async () => {
  await expect(assinaturaDaTelefonia(TOKEN, URL_CHAMADA, PARES)).resolves.toBe(ASSINATURA_ESPERADA)
})

test('a ordem dos pares na chegada não muda a assinatura', async () => {
  const embaralhados = [...PARES].reverse()

  await expect(assinaturaDaTelefonia(TOKEN, URL_CHAMADA, embaralhados)).resolves.toBe(
    ASSINATURA_ESPERADA,
  )
})

test('corpo vazio assina só a URL', async () => {
  const semPares = await assinaturaDaTelefonia(TOKEN, URL_CHAMADA, [])

  expect(semPares).not.toBe(ASSINATURA_ESPERADA)
  expect(pareceAssinaturaDaTelefonia(semPares)).toBe(true)
})

test('token vazio levanta em vez de produzir assinatura', async () => {
  // Assinar com token vazio dá um valor perfeitamente válido, e ele casaria com
  // o que qualquer um calcularia. Falta de configuração é recusa em quem chama.
  await expect(assinaturaDaTelefonia('', URL_CHAMADA, PARES)).rejects.toThrow()
})

test('o formato aceito é o de HMAC-SHA1 em base64', () => {
  expect(pareceAssinaturaDaTelefonia(ASSINATURA_ESPERADA)).toBe(true)
  expect(pareceAssinaturaDaTelefonia('')).toBe(false)
  expect(pareceAssinaturaDaTelefonia('nao-e-base64')).toBe(false)
  // Um caractere a mais ou a menos não é assinatura de SHA-1 nenhuma.
  expect(pareceAssinaturaDaTelefonia(`${ASSINATURA_ESPERADA}A`)).toBe(false)
  expect(pareceAssinaturaDaTelefonia(ASSINATURA_ESPERADA.slice(0, -1))).toBe(false)
})

test('a conferência aceita a assinatura certa e recusa todo o resto', async () => {
  const pedido = { token: TOKEN, url: URL_CHAMADA, pares: PARES }

  await expect(
    conferirAssinaturaDaTelefonia({ ...pedido, assinatura: ASSINATURA_ESPERADA }),
  ).resolves.toBe(true)

  // Os três casos que saem pelo mesmo 401 em `inbound-twiml`.
  await expect(conferirAssinaturaDaTelefonia({ ...pedido, assinatura: null })).resolves.toBe(false)
  await expect(conferirAssinaturaDaTelefonia({ ...pedido, assinatura: 'xxx' })).resolves.toBe(false)
  await expect(
    conferirAssinaturaDaTelefonia({ ...pedido, assinatura: 'GvWf1cFY/Q7PnoempGyD5oXAeza=' }),
  ).resolves.toBe(false)

  // Sem token não há o que conferir, e o desfecho é o mesmo.
  await expect(
    conferirAssinaturaDaTelefonia({ ...pedido, token: null, assinatura: ASSINATURA_ESPERADA }),
  ).resolves.toBe(false)
})

test('URL diferente e corpo diferente dão assinaturas diferentes', async () => {
  const outraUrl = await assinaturaDaTelefonia(TOKEN, `${URL_CHAMADA}&baz=3`, PARES)
  const outroCorpo = await assinaturaDaTelefonia(TOKEN, URL_CHAMADA, [
    ...PARES,
    ['To', '+18005551213'],
  ])

  expect(outraUrl).not.toBe(ASSINATURA_ESPERADA)
  expect(outroCorpo).not.toBe(ASSINATURA_ESPERADA)
})
