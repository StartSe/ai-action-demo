// Normalização de telefone para E.164.
//
// O produto só fala por telefone, então o número é a chave natural do lead
// dentro da conta (`leads.phone_e164`, único por conta). Duas escritas do mesmo
// número precisam colapsar no mesmo texto, senão a duplicata passa e a discagem
// falha. Este módulo é o único lugar que decide isso.
//
// O retorno é união discriminada, nunca `null` e nunca cadeia vazia: quem chama
// é obrigado a olhar `ok` antes de usar o número, e a recusa sempre traz a
// razão. O `motivo` é código, não frase — a frase em português mora em
// `app/src/copy/` e na resposta de cada função de borda, porque o mesmo motivo
// se conta diferente na prévia da planilha e no formulário de cadastro.
//
// Duas regras merecem a explicação, porque parecem arbitrárias de fora:
//
// 1. **Nono dígito.** Celular brasileiro tem nove dígitos e começa em 9. Número
//    de nove dígitos que começa em outra coisa é celular digitado errado, não
//    número de outro tipo — daí `celular_sem_nono_digito`.
// 2. **Fixo de oito dígitos continua válido**, mas fixo nunca começa em 6, 7, 8
//    ou 9: a faixa 2000–5999 é de fixo e a de 6000–9999 é de móvel. Oito
//    dígitos começando em 6 a 9 é celular que perdeu o nono dígito na migração
//    de 2016, e recusar isso é o ponto: discar nele não completa.
//
// Módulo portável: sem `Deno`, sem import de rede. A interface o importa por
// `@compartilhado/telefone.ts`, como `token-de-convite.ts`.

import { dddEhValido } from './ddd.ts'

/** Código do país que este módulo sabe normalizar. */
const BRASIL = '55'

/** Razão da recusa. Código estável; a frase fica na camada que exibe. */
export type MotivoDeRecusa =
  | 'vazio'
  | 'sem_digitos'
  | 'comprimento_invalido'
  | 'ddd_invalido'
  | 'celular_sem_nono_digito'
  | 'pais_nao_suportado'

/** Número aceito: o E.164 que vai para o banco e o DDD já separado. */
export interface TelefoneAceito {
  readonly ok: true
  /** `+55` seguido de DDD e assinante, sem separador. */
  readonly e164: string
  /** Os dois dígitos do DDD, para resolver cidade, estado e fuso. */
  readonly ddd: string
}

/** Número recusado, com o código da razão. */
export interface TelefoneRecusado {
  readonly ok: false
  readonly motivo: MotivoDeRecusa
}

export type TelefoneNormalizado = TelefoneAceito | TelefoneRecusado

export interface OpcoesDeNormalizacao {
  /**
   * País assumido quando a entrada não traz o código (RF-102). Só `BR` existe
   * hoje; qualquer outro devolve `pais_nao_suportado` em vez de adivinhar.
   */
  readonly paisPadrao?: string
}

/** Tudo o que não é dígito e não é o `+` de abertura é separador e cai fora. */
const NAO_DIGITO = /\D/g

/**
 * Transforma qualquer escrita de um número brasileiro em E.164.
 *
 * Aceita `(48) 99999-8888`, `48 99999-8888`, `048999998888`,
 * `+55 48 99999-8888` e `0055 48 999998888` — todas dão `+5548999998888`.
 */
export function normalizarTelefone(
  entrada: string | null | undefined,
  opcoes: OpcoesDeNormalizacao = {},
): TelefoneNormalizado {
  const bruto = (entrada ?? '').trim()
  if (bruto === '') return { ok: false, motivo: 'vazio' }

  const digitos = bruto.replace(NAO_DIGITO, '')
  if (digitos === '') return { ok: false, motivo: 'sem_digitos' }

  const nacional = extrairNumeroNacional(bruto.startsWith('+'), digitos, opcoes)
  if (nacional === null) return { ok: false, motivo: 'pais_nao_suportado' }

  if (nacional.length !== 10 && nacional.length !== 11) {
    return { ok: false, motivo: 'comprimento_invalido' }
  }

  const ddd = nacional.slice(0, 2)
  if (!dddEhValido(ddd)) return { ok: false, motivo: 'ddd_invalido' }

  const assinante = nacional.slice(2)
  if (!assinanteTemONonoDigito(assinante)) {
    return { ok: false, motivo: 'celular_sem_nono_digito' }
  }

  return { ok: true, e164: `+${BRASIL}${nacional}`, ddd }
}

/**
 * Descasca prefixo internacional, código do país e o `0` da operadora, e devolve
 * o número nacional — DDD e assinante. `null` quando o país não é o Brasil.
 */
function extrairNumeroNacional(
  temMaisNaFrente: boolean,
  digitos: string,
  opcoes: OpcoesDeNormalizacao,
): string | null {
  // `+55...`: o país veio escrito, e o padrão da conta não opina.
  if (temMaisNaFrente) {
    return digitos.startsWith(BRASIL) ? digitos.slice(BRASIL.length) : null
  }

  // `0055...`: mesmo caso, com o prefixo internacional discado no lugar do `+`.
  if (digitos.startsWith('00')) {
    const semPrefixo = digitos.slice(2)
    return semPrefixo.startsWith(BRASIL) ? semPrefixo.slice(BRASIL.length) : null
  }

  // Daqui para baixo o país é o assumido, e só o Brasil está implementado.
  if ((opcoes.paisPadrao ?? 'BR') !== 'BR') return null

  // `0` de seleção de operadora na frente do DDD, como em `048999998888`.
  const semOperadora = digitos.startsWith('0') ? digitos.slice(1) : digitos

  // `5548999998888` sem `+`: só é código de país no comprimento em que cabe um.
  const cabeCodigoDePais = semOperadora.length === 12 || semOperadora.length === 13
  if (cabeCodigoDePais && semOperadora.startsWith(BRASIL)) {
    return semOperadora.slice(BRASIL.length)
  }

  return semOperadora
}

/**
 * Nove dígitos começam em 9; oito dígitos são fixo, e fixo fica na faixa
 * 2000–5999. Oito dígitos começando em 6 a 9 é celular que perdeu o nono.
 *
 * Oito dígitos começando em 0 ou 1 passa de propósito: é número estranho, mas
 * não é celular sem o nono, e a lista de motivos não tem código para ele. Errar
 * o motivo custa mais caro que aceitar, porque o motivo vira frase na prévia da
 * planilha e manda o operador corrigir a coisa errada.
 */
function assinanteTemONonoDigito(assinante: string): boolean {
  const primeiro = assinante[0]
  if (primeiro === undefined) return false
  return assinante.length === 9 ? primeiro === '9' : primeiro < '6'
}
