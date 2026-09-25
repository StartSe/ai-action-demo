import { describe, expect, test } from 'vitest'

import {
  avaliarChave,
  CHAVE_NO_NAVEGADOR,
  daConfiguracaoDoBuild,
  esquecer,
  guardar,
  lerDoFragmento,
  lerGuardada,
  limparFragmento,
  normalizarUrlDoProjeto,
  refDoProjeto,
  resolverConfiguracao,
} from '@/conexao/configuracao-do-projeto'

const REF = 'abcdefghijklmnopqrst'
const URL_DO_PROJETO = `https://${REF}.supabase.co`
const PUBLICAVEL = 'sb_publishable_AbCdEf123456'

function jwt(carga: Record<string, unknown>): string {
  const parte = (objeto: unknown) =>
    btoa(JSON.stringify(objeto)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${parte({ alg: 'HS256' })}.${parte(carga)}.assinatura`
}

function armazenamentoEmMemoria(): Storage {
  const dados = new Map<string, string>()
  return {
    get length() {
      return dados.size
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => {
      dados.delete(chave)
    },
    setItem: (chave, valor) => {
      dados.set(chave, valor)
    },
  }
}

describe('o endereço do projeto', () => {
  test('aceita o endereço, o endereço com caminho e o ref sozinho', () => {
    expect(normalizarUrlDoProjeto(` ${URL_DO_PROJETO}/ `)).toBe(URL_DO_PROJETO)
    expect(normalizarUrlDoProjeto(`${URL_DO_PROJETO}/rest/v1/`)).toBe(URL_DO_PROJETO)
    expect(normalizarUrlDoProjeto(REF)).toBe(URL_DO_PROJETO)
    expect(normalizarUrlDoProjeto('http://127.0.0.1:54421')).toBe('http://127.0.0.1:54421')
  })

  test('recusa o que não é endereço seguro de projeto', () => {
    expect(normalizarUrlDoProjeto('')).toBeNull()
    expect(normalizarUrlDoProjeto('projeto')).toBeNull()
    expect(normalizarUrlDoProjeto(`http://${REF}.supabase.co`)).toBeNull()
    expect(normalizarUrlDoProjeto('javascript:alert(1)')).toBeNull()
    expect(normalizarUrlDoProjeto(`https://usuario:senha@${REF}.supabase.co`)).toBeNull()
  })

  test('o ref sai só de projeto hospedado no Supabase', () => {
    expect(refDoProjeto(URL_DO_PROJETO)).toBe(REF)
    expect(refDoProjeto('http://127.0.0.1:54421')).toBeNull()
  })
})

describe('a chave', () => {
  test('publicável nova e anon legada servem', () => {
    expect(avaliarChave(PUBLICAVEL)).toBe('publicavel')
    expect(avaliarChave(jwt({ role: 'anon' }))).toBe('publicavel')
  })

  test('as duas formas da chave secreta são reconhecidas para a recusa', () => {
    expect(avaliarChave('sb_secret_AbCdEf123456')).toBe('secreta')
    expect(avaliarChave(jwt({ role: 'service_role' }))).toBe('secreta')
  })

  test('o resto não é chave', () => {
    expect(avaliarChave('')).toBe('invalida')
    expect(avaliarChave('chave-qualquer')).toBe('invalida')
    expect(avaliarChave(jwt({ role: 'authenticated' }))).toBe('invalida')
  })
})

describe('o link do instalador', () => {
  test('traz projeto e chave no fragmento', () => {
    const fragmento = `#projeto=${encodeURIComponent(URL_DO_PROJETO)}&chave=${PUBLICAVEL}`
    expect(lerDoFragmento(fragmento)).toEqual({ url: URL_DO_PROJETO, chave: PUBLICAVEL })
    expect(lerDoFragmento(`#chave=${PUBLICAVEL}&projeto=${URL_DO_PROJETO}`)).toEqual({
      url: URL_DO_PROJETO,
      chave: PUBLICAVEL,
    })
  })

  test('só esses dois: o fragmento do Auth e qualquer extra não são nossos', () => {
    expect(lerDoFragmento('#access_token=abc&type=recovery')).toBeNull()
    expect(lerDoFragmento(`#projeto=${URL_DO_PROJETO}&chave=${PUBLICAVEL}&outro=1`)).toBeNull()
    expect(lerDoFragmento(`#projeto=${URL_DO_PROJETO}`)).toBeNull()
    expect(lerDoFragmento('')).toBeNull()
  })

  test('link com a chave secreta não conecta', () => {
    expect(lerDoFragmento(`#projeto=${URL_DO_PROJETO}&chave=sb_secret_AbCdEf123456`)).toBeNull()
  })

  test('limpar o fragmento troca o endereço sem entrada nova no histórico', () => {
    const trocas: string[] = []
    limparFragmento({
      location: { pathname: '/entrar', search: '?x=1' } as Location,
      history: { state: null, replaceState: (_estado: unknown, _titulo: string, url?: string | URL | null) => trocas.push(String(url)) } as unknown as History,
    })
    expect(trocas).toEqual(['/entrar?x=1'])
  })
})

describe('o que fica no navegador', () => {
  test('grava, lê de volta e esquece', () => {
    const armazenamento = armazenamentoEmMemoria()
    expect(guardar({ url: URL_DO_PROJETO, chave: PUBLICAVEL }, armazenamento)).toBe(true)
    expect(lerGuardada(armazenamento)).toEqual({ url: URL_DO_PROJETO, chave: PUBLICAVEL })
    esquecer(armazenamento)
    expect(lerGuardada(armazenamento)).toBeNull()
  })

  test('lixo gravado vira nada, sem estourar', () => {
    const armazenamento = armazenamentoEmMemoria()
    for (const lixo of ['{', '"texto"', '{"url": 1}', JSON.stringify({ url: URL_DO_PROJETO, chave: 'sb_secret_x1234567' })]) {
      armazenamento.setItem(CHAVE_NO_NAVEGADOR, lixo)
      expect(lerGuardada(armazenamento)).toBeNull()
    }
  })

  test('navegador que recusa armazenamento não derruba a tela', () => {
    const recusa = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(lerGuardada(recusa)).toBeNull()
    expect(guardar({ url: URL_DO_PROJETO, chave: PUBLICAVEL }, recusa)).toBe(false)
    expect(() => esquecer(recusa)).not.toThrow()
    expect(guardar({ url: URL_DO_PROJETO, chave: PUBLICAVEL }, null)).toBe(false)
  })
})

describe('qual projeto vale', () => {
  const doLink = { url: URL_DO_PROJETO, chave: PUBLICAVEL }
  const guardada = { url: 'https://zyxwvutsrqponmlkjihg.supabase.co', chave: PUBLICAVEL }
  const doBuild = { url: 'http://127.0.0.1:54421', chave: jwt({ role: 'anon' }) }

  test('sem projeto nenhum, o link entra direto', () => {
    expect(resolverConfiguracao({ doFragmento: doLink, guardada: null, doBuild: null })).toEqual({
      ativa: doLink,
      pendente: null,
    })
  })

  test('link que troca o projeto espera confirmação', () => {
    expect(resolverConfiguracao({ doFragmento: doLink, guardada, doBuild: null })).toEqual({
      ativa: guardada,
      pendente: doLink,
    })
    expect(resolverConfiguracao({ doFragmento: doLink, guardada: null, doBuild })).toEqual({
      ativa: doBuild,
      pendente: doLink,
    })
  })

  test('link que repete o projeto atual não pergunta nada', () => {
    expect(resolverConfiguracao({ doFragmento: { ...guardada }, guardada, doBuild: null })).toEqual({
      ativa: guardada,
      pendente: null,
    })
  })

  test('o gravado vence o build, e o build é o padrão do desenvolvimento', () => {
    expect(resolverConfiguracao({ doFragmento: null, guardada, doBuild }).ativa).toBe(guardada)
    expect(resolverConfiguracao({ doFragmento: null, guardada: null, doBuild }).ativa).toBe(doBuild)
    expect(resolverConfiguracao({ doFragmento: null, guardada: null, doBuild: null }).ativa).toBeNull()
  })

  test('as variáveis do build valem só com as duas e com chave publicável', () => {
    expect(
      daConfiguracaoDoBuild({ VITE_SUPABASE_URL: doBuild.url, VITE_SUPABASE_ANON_KEY: doBuild.chave }),
    ).toEqual(doBuild)
    expect(daConfiguracaoDoBuild({ VITE_SUPABASE_URL: doBuild.url })).toBeNull()
    expect(
      daConfiguracaoDoBuild({ VITE_SUPABASE_URL: doBuild.url, VITE_SUPABASE_ANON_KEY: 'sb_secret_x1234567' }),
    ).toBeNull()
  })
})
