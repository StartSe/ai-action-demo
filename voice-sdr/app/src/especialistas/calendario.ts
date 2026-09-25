// O estado do cartão do calendário do especialista (US-177, RF-507).
//
// Três regras seguram o arquivo:
//
// 1. **Quatro estados do servidor, e a tela acrescenta dois.** `conectado`,
//    `nao_configurado`, `erro` e `indisponivel` são os de
//    `@compartilhado/agenda/calendario.ts`; `testando` é da tela enquanto o
//    pedido viaja, e `aguardando_google` é a espera da verificação do
//    aplicativo (P-04), só para o calendário conectado pelo Google cuja
//    leitura voltou sem permissão. O caminho padrão é o endereço iCal, que não
//    espera ninguém: instalação sem o aplicativo do Google não vira espera,
//    vira só a ausência do botão do Google.
// 2. **A frase gravada em `sync_error` se lê de volta pelo motivo**, com o
//    mesmo dicionário que a rotina usou para escrevê-la. É o que separa
//    `indisponivel` (espere) de `erro` (reconecte) sem uma segunda tabela.
// 3. **Sincronização parada não é agenda vazia.** `sync_error` com `synced_at`
//    parado, ou `synced_at` velho sem erro nenhum (a rotina deixou de rodar),
//    viram "a sincronização parou", com desde quando.

import {
  MENSAGENS_DO_CALENDARIO,
  falhaDoCalendario,
  type EstadoDaConexaoDoCalendario,
  type MotivoDoCalendario,
} from '@compartilhado/agenda/calendario.ts'

import type { ConexaoDoCalendario } from '@/especialistas/tipos'

export type EstadoDoCartaoDoCalendario = EstadoDaConexaoDoCalendario | 'aguardando_google' | 'testando'

/**
 * Quanto tempo sem leitura faz uma conexão sem erro contar como parada. A
 * rotina passa de cinco em cinco minutos (seção 4.6): quatro passagens
 * perdidas não são atraso, são rotina parada.
 */
export const MINUTOS_ATE_A_SINCRONIA_PARADA = 20

export interface LeituraDoCartao {
  estado: EstadoDoCartaoDoCalendario
  /** A frase do servidor que explica o estado, quando há uma. */
  mensagem: string | null
  /** A sincronização parou. `desde` é a última leitura boa; nulo é nunca. */
  parada: { desde: string | null } | null
}

const MOTIVO_DA_FRASE = new Map<string, MotivoDoCalendario>(
  (Object.entries(MENSAGENS_DO_CALENDARIO) as [MotivoDoCalendario, string][]).map(
    ([motivo, frase]) => [frase, motivo],
  ),
)

/** O motivo que a rotina gravou, ou nulo quando a frase não é do dicionário. */
export function motivoDaFalhaGravada(frase: string): MotivoDoCalendario | null {
  return MOTIVO_DA_FRASE.get(frase.trim()) ?? null
}

/** O estado do servidor, lido da linha de `specialist_calendars`. */
export function estadoDoServidor(conexao: ConexaoDoCalendario): EstadoDaConexaoDoCalendario {
  if (conexao.estado === 'desconectado') return 'nao_configurado'
  if (conexao.estado === 'conectado') return 'conectado'
  // Frase fora do dicionário (gravação recusada, exceção da rotina) pede ação:
  // tratá-la como espera deixaria a conexão quebrada sem ninguém mexer.
  const motivo = motivoDaFalhaGravada(conexao.falha)
  return motivo ? falhaDoCalendario(motivo).estado : 'erro'
}

function parada(conexao: ConexaoDoCalendario, agora: number): LeituraDoCartao['parada'] {
  if (conexao.estado === 'com-falha') return { desde: conexao.sincronizadoEm }
  if (conexao.estado !== 'conectado' || !conexao.sincronizadoEm) return null
  const idade = agora - Date.parse(conexao.sincronizadoEm)
  return idade > MINUTOS_ATE_A_SINCRONIA_PARADA * 60_000 ? { desde: conexao.sincronizadoEm } : null
}

export function leituraDoCartao({
  conexao,
  testando,
  agora,
}: {
  conexao: ConexaoDoCalendario
  testando: boolean
  agora: number
}): LeituraDoCartao {
  const servidor = estadoDoServidor(conexao)
  const mensagem = conexao.estado === 'com-falha' ? conexao.falha : null
  const base: LeituraDoCartao = { estado: servidor, mensagem, parada: parada(conexao, agora) }

  // Testando cobre o estado anterior: afirmar "com erro" durante a consulta
  // mandaria agir sobre um resultado que já está sendo refeito.
  if (testando) return { ...base, estado: 'testando' }

  if (servidor === 'conectado') return base

  // A frase que a rotina gravou quando o Google recusou o escopo: é espera da
  // verificação do aplicativo, e não falha de quem administra.
  if (conexao.estado === 'com-falha' && motivoDaFalhaGravada(conexao.falha) === 'sem_permissao_de_calendario') {
    return { ...base, estado: 'aguardando_google' }
  }
  return base
}
