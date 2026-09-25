// O estado do cartão do calendário (US-177). A frase gravada em `sync_error`
// se lê de volta pelo mesmo dicionário que a rotina usou, e é isso que separa
// esperar de reconectar.

import { describe, expect, it } from 'vitest'

import { MENSAGENS_DO_CALENDARIO } from '@compartilhado/agenda/calendario.ts'

import {
  MINUTOS_ATE_A_SINCRONIA_PARADA,
  estadoDoServidor,
  leituraDoCartao,
} from '@/especialistas/calendario'
import type { ConexaoDoCalendario } from '@/especialistas/tipos'

const AGORA = Date.parse('2026-09-24T15:00:00Z')
const MINUTO = 60_000

function haMinutos(minutos: number): string {
  return new Date(AGORA - minutos * MINUTO).toISOString()
}

function comFalha(falha: string, sincronizadoEm: string | null = null): ConexaoDoCalendario {
  return { estado: 'com-falha', provedor: 'google', falha, sincronizadoEm }
}

describe('estadoDoServidor', () => {
  it.each([
    ['sem vínculo é não configurado', { estado: 'desconectado' } as const, 'nao_configurado'],
    [
      'com vínculo e sem falha é conectado',
      { estado: 'conectado', provedor: 'google', sincronizadoEm: null } as const,
      'conectado',
    ],
    ['conexão expirada pede ação', comFalha(MENSAGENS_DO_CALENDARIO.conexao_expirada), 'erro'],
    ['provedor fora do ar é só esperar', comFalha(MENSAGENS_DO_CALENDARIO.provedor_indisponivel), 'indisponivel'],
    ['limite de taxa é só esperar', comFalha(MENSAGENS_DO_CALENDARIO.limite_de_taxa), 'indisponivel'],
    // Frase fora do dicionário: tratá-la como espera deixaria a conexão
    // quebrada sem ninguém mexer.
    ['frase desconhecida pede ação', comFalha('A gravação da ocupação foi recusada.'), 'erro'],
  ])('%s', (_nome, conexao, esperado) => {
    expect(estadoDoServidor(conexao)).toBe(esperado)
  })
})

describe('leituraDoCartao', () => {
  it('sem vínculo é não configurado, e nunca espera do Google: o caminho padrão é o endereço iCal', () => {
    const leitura = leituraDoCartao({ conexao: { estado: 'desconectado' }, testando: false, agora: AGORA })
    expect(leitura).toEqual({ estado: 'nao_configurado', mensagem: null, parada: null })
  })

  it('a recusa de escopo gravada pela rotina no calendário do Google é espera, e não erro', () => {
    const leitura = leituraDoCartao({
      conexao: comFalha(MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario),
      testando: false,
      agora: AGORA,
    })
    expect(leitura.estado).toBe('aguardando_google')
  })

  it('o endereço iCal recusado pede ação', () => {
    const leitura = leituraDoCartao({
      conexao: { estado: 'com-falha', provedor: 'ical', falha: MENSAGENS_DO_CALENDARIO.endereco_ical_recusado, sincronizadoEm: null },
      testando: false,
      agora: AGORA,
    })
    expect(leitura).toMatchObject({ estado: 'erro', mensagem: MENSAGENS_DO_CALENDARIO.endereco_ical_recusado })
  })

  it('testando cobre o estado anterior e mantém a sincronização parada à vista', () => {
    const leitura = leituraDoCartao({
      conexao: comFalha(MENSAGENS_DO_CALENDARIO.conexao_expirada, haMinutos(90)),
      testando: true,
      agora: AGORA,
    })
    expect(leitura.estado).toBe('testando')
    expect(leitura.parada).toEqual({ desde: haMinutos(90) })
  })

  it('falha com a última leitura boa é sincronização parada, com desde quando', () => {
    const leitura = leituraDoCartao({
      conexao: comFalha(MENSAGENS_DO_CALENDARIO.provedor_indisponivel, haMinutos(180)),
      testando: false,
      agora: AGORA,
    })
    expect(leitura).toEqual({
      estado: 'indisponivel',
      mensagem: MENSAGENS_DO_CALENDARIO.provedor_indisponivel,
      parada: { desde: haMinutos(180) },
    })
  })

  it('sem erro e com a leitura velha, a rotina parou; dentro do limite, não', () => {
    const conectado = (minutos: number): ConexaoDoCalendario => ({
      estado: 'conectado',
      provedor: 'google',
      sincronizadoEm: haMinutos(minutos),
    })
    const ler = (minutos: number) =>
      leituraDoCartao({ conexao: conectado(minutos), testando: false, agora: AGORA }).parada

    expect(ler(MINUTOS_ATE_A_SINCRONIA_PARADA)).toBeNull()
    expect(ler(MINUTOS_ATE_A_SINCRONIA_PARADA + 1)).toEqual({
      desde: haMinutos(MINUTOS_ATE_A_SINCRONIA_PARADA + 1),
    })
  })
})
