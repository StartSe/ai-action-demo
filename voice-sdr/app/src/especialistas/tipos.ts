// Quem atende a reunião que a Sarah marca (US-251, RF-501).
//
// O especialista é o destino de toda ligação de descoberta: a Sarah apura a
// dor, confirma o interesse e encaminha. Sem nenhum cadastrado, o objetivo da
// conversa não tem para onde ir.
//
// **A tela escreve direto na tabela.** `specialists` é classe Configuração:
// membro lê, administrador escreve, tudo pela RLS. Não há borda no caminho
// porque não há efeito externo — o convite da reunião é da F5, e quem o manda
// é o servidor no momento do agendamento.

/** Como a pessoa atende. Subconjunto não vazio, como o check da tabela cobra. */
export const MODALIDADES = ['video', 'telefone', 'presencial'] as const
export type Modalidade = (typeof MODALIDADES)[number]

export interface Especialista {
  id: string
  nome: string
  /** Nula é normal: conta que roteia por rodízio ou fixo nunca preenche área. */
  area: string | null
  fuso: string
  modalidades: readonly Modalidade[]
  duracaoPadraoMin: number
  tetoDiario: number
  antecedenciaMinimaMin: number
  antecedenciaMaximaDias: number
  /** Nulo aceito: quem só atende presencial não tem sala. */
  sala: string | null
  /** Obrigatório: é para onde o convite da reunião vai (RF-509). */
  email: string
  ativo: boolean
  /** Quando o rodízio o escolheu pela última vez. Nulo é quem nunca atendeu. */
  ultimoAtendimentoEm: string | null
  /** O calendário externo, lido de `specialist_calendars`. Só leitura aqui. */
  calendario: ConexaoDoCalendario
}

/**
 * O estado do calendário externo do especialista (US-175). Sem calendário a
 * Sarah ainda marca, pela disponibilidade semanal; o que se perde é a checagem
 * da ocupação real e o evento na agenda da pessoa.
 */
export type ConexaoDoCalendario =
  | { estado: 'desconectado' }
  | { estado: 'conectado'; provedor: string; sincronizadoEm: string | null }
  /**
   * A última sincronização falhou. `falha` é a frase que o servidor gravou, e
   * `sincronizadoEm` a última leitura que deu certo: é ela que diz desde quando
   * a sincronização parou (US-177), e não "agenda vazia".
   */
  | { estado: 'com-falha'; provedor: string; falha: string; sincronizadoEm: string | null }

/**
 * A resposta de `calendar-connect` (US-177). A borda não grava nada: devolve o
 * endereço do Google ou diz por que não há endereço.
 */
export type PreparoDaConexao =
  | { resultado: 'autorizar'; url: string }
  /**
   * O Google ainda não verificou o aplicativo (P-04). É o estado normal do
   * passo enquanto a verificação não sai, e a borda o responde com 200.
   */
  | { resultado: 'aguardando-google'; mensagem: string }
  /** A borda recusou por um motivo que pede ação (papel, especialista). */
  | { resultado: 'recusada'; mensagem: string }
  /** A borda não respondeu ou falhou por dentro: tentar de novo resolve. */
  | { resultado: 'indisponivel' }

export type MotivoDeFalhaDosEspecialistas =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'
  /**
   * A escrita voltou sem linha. A RLS não levanta erro em update fora da
   * política: ela filtra a linha e o Postgres responde sucesso com zero
   * linhas. Sem o `.select()` isso passaria por gravação feita.
   */
  | 'recusada'

export type CargaDosEspecialistas =
  | {
      ok: true
      especialistas: readonly Especialista[]
      /** O fuso da conta: é com ele que um cadastro novo nasce (T-21). */
      fusoDaConta: string
    }
  | { ok: false; motivo: MotivoDeFalhaDosEspecialistas }

/** O que a tela manda ao gravar. `id` nulo cria. */
export interface PedidoDeEspecialista {
  id: string | null
  nome: string
  area: string | null
  fuso: string
  modalidades: readonly Modalidade[]
  duracaoPadraoMin: number
  tetoDiario: number
  antecedenciaMinimaMin: number
  antecedenciaMaximaDias: number
  sala: string | null
  email: string
  ativo: boolean
}

export type GravacaoDoEspecialista =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDosEspecialistas }

/**
 * Uma faixa da disponibilidade semanal (US-176, RF-502), como
 * `specialist_availability` a guarda. As horas valem no fuso do especialista,
 * nunca no da conta (T-21).
 */
export interface FaixaSemanal {
  id: string
  /** 0 é domingo e 6 é sábado, como em `extract(dow from ...)`. */
  diaDaSemana: number
  /** Relógio de parede, `HH:MM`. */
  inicio: string
  fim: string
}

/** Um bloqueio pontual (RF-503). Início e fim são instantes ISO. */
export interface Bloqueio {
  id: string
  inicio: string
  fim: string
  /** Nulo é normal: quem bloqueia a agenda não deve satisfação ao banco. */
  motivo: string | null
}

export type CargaDaAgenda =
  | { ok: true; faixas: readonly FaixaSemanal[]; bloqueios: readonly Bloqueio[] }
  | { ok: false; motivo: MotivoDeFalhaDosEspecialistas }

export interface PedidoDeFaixa {
  especialistaId: string
  diaDaSemana: number
  inicio: string
  fim: string
}

export interface PedidoDeBloqueio {
  especialistaId: string
  inicio: string
  fim: string
  motivo: string | null
}

/**
 * Por que a escrita na agenda não aconteceu. Os três últimos são o banco
 * recusando pelo que a tabela garante: a tela confere a ordem antes de mandar,
 * e o check é a segunda linha.
 */
export type MotivoDeFalhaDaAgenda =
  | MotivoDeFalhaDosEspecialistas
  /** Já há faixa começando nessa hora nesse dia (o único da tabela). */
  | 'faixa-repetida'
  /** O check `end_time > start_time` recusou. */
  | 'ordem-invertida'

export type GravacaoDaAgenda =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDaAgenda }
  /**
   * A restrição de exclusão (23P01) recusou. `conflito` é o bloqueio que já
   * cobre o intervalo, para a frase dizer qual; nulo quando a releitura não o
   * achou (apagado entre a recusa e a leitura).
   */
  | { ok: false; motivo: 'bloqueio-sobreposto'; conflito: Bloqueio | null }

export interface ServicoDeEspecialistas {
  /** Todos os da conta, ativos e inativos, do mais novo para o mais velho. */
  carregar(): Promise<CargaDosEspecialistas>
  /** Cria ou corrige. A tela escreve direto na tabela, pela RLS de admin. */
  salvar(pedido: PedidoDeEspecialista): Promise<GravacaoDoEspecialista>
  /**
   * Liga e desliga. Não há exclusão nesta tela de propósito: o especialista
   * aparece em reuniões passadas, e apagá-lo deixaria o histórico sem quem
   * atendeu. Desligar tira do rodízio e mantém o registro.
   */
  alternarAtivo(id: string, ativo: boolean): Promise<GravacaoDoEspecialista>

  /** A disponibilidade semanal e os bloqueios de um especialista (US-176). */
  carregarAgenda(especialistaId: string): Promise<CargaDaAgenda>
  acrescentarFaixa(pedido: PedidoDeFaixa): Promise<GravacaoDaAgenda>
  removerFaixa(id: string): Promise<GravacaoDaAgenda>
  acrescentarBloqueio(pedido: PedidoDeBloqueio): Promise<GravacaoDaAgenda>
  removerBloqueio(id: string): Promise<GravacaoDaAgenda>

  /**
   * Pede a `calendar-connect` o endereço de autorização (US-177). Só lê: a
   * tela o chama ao abrir o cartão, para saber se o Google já verificou o
   * aplicativo, e de novo no clique, porque o `state` vence em dez minutos.
   */
  prepararConexaoDoCalendario(especialistaId: string): Promise<PreparoDaConexao>
  /**
   * Apaga o vínculo em `specialist_calendars`. A ocupação lida cai junto, por
   * cascata, e os horários passam a sair só da disponibilidade interna.
   */
  desconectarCalendario(especialistaId: string): Promise<GravacaoDoEspecialista>
  /**
   * Grava o endereço secreto iCal do calendário (`conectar_calendario_ical`):
   * o caminho sem OAuth. O endereço chega já normalizado por
   * `normalizarEnderecoIcal`, vai para o Vault e não volta para a tela.
   */
  conectarCalendarioIcal(especialistaId: string, endereco: string): Promise<GravacaoDoEspecialista>
}
