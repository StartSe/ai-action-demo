import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { VERSAO_DA_INSTALACAO } from '@compartilhado/versao-da-instalacao.ts'

import { AvisoDeVersao } from '@/conexao/aviso-de-versao'
import type { ConfiguracaoDoProjeto } from '@/conexao/configuracao-do-projeto'
import type { ProjetoConectado } from '@/conexao/contexto'
import { EnderecosDoAuth } from '@/conexao/enderecos-do-auth'
import { ProjetoNaConta } from '@/conexao/projeto-na-conta'
import { ProvedorDoProjeto } from '@/conexao/provedor'
import type { ResultadoDaConferencia } from '@/conexao/saude-do-projeto'
import { ConfirmacaoDeProjeto, TelaDeConexao } from '@/conexao/tela-de-conexao'
import { conexao } from '@/copy/conexao'

afterEach(cleanup)

const REF = 'abcdefghijklmnopqrst'
const URL_DO_PROJETO = `https://${REF}.supabase.co`
const PUBLICAVEL = 'sb_publishable_AbCdEf123456'

const PRONTO: ResultadoDaConferencia = {
  estado: 'pronto',
  chave: PUBLICAVEL,
  versao: { banco: { ...VERSAO_DA_INSTALACAO }, funcoes: { ...VERSAO_DA_INSTALACAO } },
}

function montarTela(conferir: (url: string) => Promise<ResultadoDaConferencia>, guardar = vi.fn(() => true)) {
  const aoConectar = vi.fn<(configuracao: ConfiguracaoDoProjeto) => void>()
  render(
    <TelaDeConexao
      aoConectar={aoConectar}
      conferir={conferir}
      guardar={guardar}
      volta="https://minha-copia.onrender.com"
    />,
  )
  return { aoConectar, guardar }
}

function preencher(url: string, chave = '') {
  fireEvent.change(screen.getByLabelText(conexao.tela.url.rotulo), { target: { value: url } })
  fireEvent.change(screen.getByLabelText(conexao.tela.chave.rotulo), { target: { value: chave } })
  fireEvent.click(screen.getByRole('button', { name: conexao.tela.acao }))
}

describe('TelaDeConexao', () => {
  test('o caminho principal é o instalador do painel, com a volta para esta cópia', () => {
    montarTela(async () => PRONTO)
    const link = screen.getByRole('link', { name: conexao.tela.instalar })
    const destino = new URL(link.getAttribute('href') ?? '')
    expect(destino.origin).toBe('https://ai-action.startse.com')
    expect(destino.pathname).toBe('/toolkits/sarah-voice-sdr/instalador')
    expect(destino.searchParams.get('volta')).toBe('https://minha-copia.onrender.com')
  })

  test('só o endereço basta: a chave vem da função saude, e a configuração é gravada', async () => {
    const conferir = vi.fn(async () => PRONTO)
    const { aoConectar, guardar } = montarTela(conferir)

    preencher(REF)

    await waitFor(() => expect(aoConectar).toHaveBeenCalled())
    expect(conferir).toHaveBeenCalledWith(URL_DO_PROJETO)
    expect(guardar).toHaveBeenCalledWith({ url: URL_DO_PROJETO, chave: PUBLICAVEL })
    expect(aoConectar).toHaveBeenCalledWith({ url: URL_DO_PROJETO, chave: PUBLICAVEL })
  })

  test('chave digitada vence a do projeto', async () => {
    const { aoConectar } = montarTela(async () => ({ ...PRONTO, chave: null }))
    preencher(URL_DO_PROJETO, 'sb_publishable_Digitada9999')
    await waitFor(() =>
      expect(aoConectar).toHaveBeenCalledWith({ url: URL_DO_PROJETO, chave: 'sb_publishable_Digitada9999' }),
    )
  })

  test('endereço que não é de projeto não chega a ir à rede', () => {
    const conferir = vi.fn(async () => PRONTO)
    montarTela(conferir)
    preencher('meu projeto')
    expect(screen.getByText(conexao.tela.urlInvalida)).toBeTruthy()
    expect(conferir).not.toHaveBeenCalled()
  })

  test('a chave secreta é recusada com a razão, antes de qualquer chamada', () => {
    const conferir = vi.fn(async () => PRONTO)
    montarTela(conferir)
    preencher(URL_DO_PROJETO, 'sb_secret_AbCdEf123456')
    expect(screen.getByText(conexao.tela.chaveSecreta)).toBeTruthy()
    expect(conferir).not.toHaveBeenCalled()
  })

  test('projeto sem a instalação diz o que fazer, e nada é gravado', async () => {
    const { aoConectar, guardar } = montarTela(async () => ({ estado: 'sem_instalacao' }))
    preencher(URL_DO_PROJETO)
    expect(await screen.findByText(conexao.tela.falhas.sem_instalacao)).toBeTruthy()
    expect(guardar).not.toHaveBeenCalled()
    expect(aoConectar).not.toHaveBeenCalled()
  })

  test('navegador que não guarda avisa em vez de seguir sem projeto', async () => {
    const { aoConectar } = montarTela(async () => PRONTO, vi.fn(() => false))
    preencher(URL_DO_PROJETO)
    expect(await screen.findByText(conexao.tela.falhas.sem_armazenamento)).toBeTruthy()
    expect(aoConectar).not.toHaveBeenCalled()
  })
})

describe('ConfirmacaoDeProjeto', () => {
  test('mostra os dois endereços e deixa escolher', () => {
    const aoConfirmar = vi.fn()
    const aoManter = vi.fn()
    render(
      <ConfirmacaoDeProjeto
        atual={{ url: 'https://zyxwvutsrqponmlkjihg.supabase.co', chave: PUBLICAVEL }}
        novo={{ url: URL_DO_PROJETO, chave: PUBLICAVEL }}
        aoConfirmar={aoConfirmar}
        aoManter={aoManter}
      />,
    )
    expect(screen.getByText('https://zyxwvutsrqponmlkjihg.supabase.co')).toBeTruthy()
    expect(screen.getByText(URL_DO_PROJETO)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: conexao.confirmacao.manter }))
    expect(aoManter).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: conexao.confirmacao.acao }))
    expect(aoConfirmar).toHaveBeenCalled()
  })
})

function comProjeto(children: ReactNode, projeto: Partial<ProjetoConectado> = {}) {
  const valor: ProjetoConectado = {
    configuracao: { url: URL_DO_PROJETO, chave: PUBLICAVEL },
    trocarDeProjeto: vi.fn(async () => undefined),
    ...projeto,
  }
  return { valor, arvore: <ProvedorDoProjeto valor={valor}>{children}</ProvedorDoProjeto> }
}

describe('EnderecosDoAuth', () => {
  test('mostra o endereço exato desta cópia e o atalho do projeto', () => {
    render(comProjeto(<EnderecosDoAuth origem="https://minha-copia.onrender.com" />).arvore)
    expect(screen.getByText('https://minha-copia.onrender.com')).toBeTruthy()
    expect(screen.getByText('https://minha-copia.onrender.com/**')).toBeTruthy()
    expect(screen.getByRole('link', { name: conexao.enderecosDoAuth.abrir }).getAttribute('href')).toBe(
      `https://supabase.com/dashboard/project/${REF}/auth/url-configuration`,
    )
  })

  test('copia o endereço', async () => {
    const escrever = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true })
    render(<EnderecosDoAuth origem="https://minha-copia.onrender.com" />)
    fireEvent.click(
      screen.getByRole('button', { name: `${conexao.enderecosDoAuth.copiar} ${conexao.enderecosDoAuth.redirect}` }),
    )
    await waitFor(() => expect(escrever).toHaveBeenCalledWith('https://minha-copia.onrender.com/**'))
    expect(await screen.findByText(conexao.enderecosDoAuth.copiado)).toBeTruthy()
  })

  test('sem projeto conectado, as instruções aparecem sem o atalho', () => {
    render(<EnderecosDoAuth origem="https://minha-copia.onrender.com" />)
    expect(screen.queryByRole('link', { name: conexao.enderecosDoAuth.abrir })).toBeNull()
  })
})

describe('ProjetoNaConta', () => {
  test('mostra o projeto e troca depois da confirmação', async () => {
    const { valor, arvore } = comProjeto(<ProjetoNaConta />)
    render(arvore)
    expect(screen.getByText(URL_DO_PROJETO)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: conexao.projeto.trocar }))
    expect(valor.trocarDeProjeto).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: conexao.projeto.confirmar }))
    await waitFor(() => expect(valor.trocarDeProjeto).toHaveBeenCalled())
  })
})

describe('AvisoDeVersao', () => {
  function montarAviso(resultado: ResultadoDaConferencia) {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={cliente}>
        <AvisoDeVersao url={URL_DO_PROJETO} conferir={async () => resultado} />
      </QueryClientProvider>,
    )
  }

  test('banco mais antigo que a cópia pede atualizar a instalação', async () => {
    montarAviso({
      ...PRONTO,
      versao: { banco: { migracao: '20260101000000', funcoes: null }, funcoes: { ...VERSAO_DA_INSTALACAO } },
    })
    expect(await screen.findByText(`${conexao.versao.banco_atrasado.titulo}.`)).toBeTruthy()
  })

  test('banco mais novo que a cópia diz que a cópia é mais antiga', async () => {
    montarAviso({
      ...PRONTO,
      versao: { banco: { migracao: '29991231235959', funcoes: null }, funcoes: { ...VERSAO_DA_INSTALACAO } },
    })
    expect(await screen.findByText(`${conexao.versao.copia_atrasada.titulo}.`)).toBeTruthy()
  })

  test('em dia, nada aparece', async () => {
    montarAviso(PRONTO)
    await new Promise((resolver) => setTimeout(resolver, 20))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
