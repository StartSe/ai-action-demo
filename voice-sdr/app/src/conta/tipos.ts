// A conta e a instalação: zerar o ambiente de teste (`environment-reset`), os
// limiares da fila (`account_settings`, US-150) e o modo de roteamento do
// especialista (`account_settings`, US-178). O nome, o fuso e o disjuntor, que
// também moram em /config/conta, chegam depois.

import type { ModoDeRoteamento } from '@compartilhado/agenda/roteamento.ts'
import type { LimiaresDaFila } from '@/conta/limiares'

export type { ModoDeRoteamento }

export type MotivoDeFalhaDosLimiares =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  /** Um `check` de `account_settings` recusou: a fronteira é o banco. */
  | 'fora-do-dominio'

export type CargaDosLimiares =
  /** `limiares` nulo é a conta sem linha de configuração: o estado vazio. */
  | { ok: true; limiares: LimiaresDaFila | null }
  | { ok: false; motivo: MotivoDeFalhaDosLimiares }

export type GravacaoDosLimiares =
  | { ok: true; limiares: LimiaresDaFila }
  | { ok: false; motivo: MotivoDeFalhaDosLimiares }

export type ResultadoDoReset =
  | { ok: true; agentesApagados: number; agentesQueFicaram: number }
  | { ok: false; mensagem: string | null }

/** `account_settings.routing_mode` e o destino do modo fixo. */
export interface RoteamentoDaConta {
  modo: ModoDeRoteamento
  /** Preenchido só no modo `fixed`; o check da migração cobra os dois lados. */
  especialistaFixoId: string | null
}

/** O recorte de `specialists` que a escolha do modo fixo precisa. */
export interface EspecialistaDoRoteamento {
  id: string
  nome: string
  area: string | null
  ativo: boolean
}

export type MotivoDeFalhaDoRoteamento =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  /** O check `account_settings_destino_do_modo` recusou. */
  | 'fixo-sem-especialista'
  /** `guardar_destino_do_roteamento`: o destino está inativo. */
  | 'especialista-inativo'
  /** `guardar_destino_do_roteamento`: o destino é de outra conta. */
  | 'especialista-de-outra-conta'

export type CargaDoRoteamento =
  | {
      ok: true
      /** Nulo é a conta sem linha de configuração: o estado vazio da tela. */
      roteamento: RoteamentoDaConta | null
      /** Todos os especialistas da conta, ativos e inativos, por nome. */
      especialistas: EspecialistaDoRoteamento[]
    }
  | { ok: false; motivo: MotivoDeFalhaDoRoteamento }

export type GravacaoDoRoteamento =
  | { ok: true; roteamento: RoteamentoDaConta }
  | { ok: false; motivo: MotivoDeFalhaDoRoteamento }

export interface ServicoDaConta {
  /**
   * Apaga contas, usuários, credenciais e dado de negócio da instalação, e os
   * agentes publicados na ElevenLabs. Só o dono, só com a instalação
   * permitindo, e só com a confirmação escrita.
   */
  zerarAmbiente(confirmacao: string): Promise<ResultadoDoReset>
  /** Os quatro limiares da fila (RF-915). Leitura de membro. */
  carregarLimiares(): Promise<CargaDosLimiares>
  /**
   * Grava os quatro juntos. Só admin, pela política de `account_settings`; a
   * trilha vem do gatilho de auditoria da tabela. Vale para as chamadas
   * seguintes: a fila já formada não é reescrita.
   */
  definirLimiares(limiares: LimiaresDaFila): Promise<GravacaoDosLimiares>
  /** O modo de roteamento e os especialistas da conta. Leitura de membro. */
  carregarRoteamento(): Promise<CargaDoRoteamento>
  /**
   * Grava modo e destino juntos. Só admin; a trilha vem do gatilho de
   * auditoria de `account_settings`.
   */
  definirRoteamento(roteamento: RoteamentoDaConta): Promise<GravacaoDoRoteamento>
  /**
   * O nome da conta (`accounts.name`), dado na fundação. O tutorial o usa
   * como a empresa do negócio, para não pedir duas vezes (D-10). Nulo quando
   * não se lê: aí o campo nasce vazio, como antes.
   */
  carregarNomeDaConta(): Promise<string | null>
}
