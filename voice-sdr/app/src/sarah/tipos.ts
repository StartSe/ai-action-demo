/**
 * O que as telas da Sarah conhecem: identidade, voz e playbooks (RF-301 a
 * RF-311). Espelha `agents` e `agent_publications`
 * (supabase/migrations/20260921210000_agente.sql), mas é declarado aqui porque
 * o contrato de tela não deve depender do formato de linha do banco.
 *
 * Duas escolhas atravessam o arquivo:
 *
 * 1. **Texto opcional é string vazia, nunca `null`.** No banco `offer_line`,
 *    `transfer_target` e `first_message` são nulos enquanto ninguém escreveu, e
 *    a conversão nos dois sentidos mora em `servico-supabase.ts`. Um formulário
 *    com campo que alterna entre `null` e `''` obriga toda tela a decidir de
 *    novo o que fazer com cada um.
 * 2. **O estado de publicação vem do vocabulário da US-060.** Os três estados
 *    de RF-311 são os de `@compartilhado/agente/compilador.ts`, e não uma
 *    segunda escala nossa: quem publica e quem mostra o aviso precisam chamar a
 *    mesma coisa pelo mesmo nome.
 */

import type { EstadoDePublicacao } from '@compartilhado/agente/compilador.ts'
import type { IdDoPerfil } from '@compartilhado/ensaio/perfis-de-lead.ts'
import type { Proposito } from '@compartilhado/playbook/camada-um.ts'
import type {
  ResultadoDaEntrada,
  ResultadoDaPublicacao,
} from '@conhecimento/sincronizacao.ts'
import type { ResultadoDoProposito } from '@publicacao/publicacao.ts'
import type { NomeDeAjuste } from '@voz/formato-do-provedor.ts'

export type { EstadoDePublicacao }

/** Quem a assistente diz que é (RF-301, RF-304, RF-308). */
export interface IdentidadeDaSarah {
  /** O nome que a pessoa escolheu na primeira pergunta do tutorial. */
  nome: string
  /**
   * Vazia enquanto o tutorial não chegou ao negócio: o nome é gravado antes
   * dela, e quem cobra a empresa é a publicação.
   */
  empresa: string
  /** O que a empresa oferece, numa frase. Vazio é rascunho normal. */
  oferta: string
  /** O que ela nunca afirma (RF-308). Vazia é o padrão, e é honesto. */
  nuncaAfirmar: string[]
  /** Para quem a ligação vai quando o lead pede uma pessoa. */
  destinoDeTransferencia: string
  /** A abertura, com marcadores de `@compartilhado/agente/primeira-fala.ts`. */
  primeiraFala: string
  /**
   * A abertura no WhatsApp, com os mesmos marcadores. Vazia vale a padrão do
   * servidor (`@compartilhado/speech/whatsapp.ts`).
   */
  aberturaDoWhatsapp: string
  /** O jeito só na ligação, somado ao jeito da casa. */
  jeitoNaVoz: string
  /** O jeito só no WhatsApp, somado ao jeito da casa. */
  jeitoNoWhatsapp: string
}

/**
 * O que a tela carrega. `identidade` nula é a conta que ainda não montou a
 * Sarah, e é o estado vazio da tela, não uma falha.
 */
export interface EstadoDaSarah {
  identidade: IdentidadeDaSarah | null
  publicacao: EstadoDePublicacao
}

export type MotivoDeFalhaDaSarah =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

export type CargaDaSarah =
  | { ok: true; sarah: EstadoDaSarah }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

/**
 * O resultado de gravar. Devolve o estado de publicação novo porque é a
 * pergunta que a pessoa tem logo depois de salvar: o que eu acabei de escrever
 * já vale na próxima ligação? A resposta quase sempre é não, e a tela precisa
 * dizê-la.
 */
export type GravacaoDaIdentidade =
  | { ok: true; publicacao: EstadoDePublicacao }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
// De qual modelo a Sarah fala (US-246) ------------------------------------------

/** As tarefas e as portas vêm do contrato do servidor, não de uma segunda lista. */
import type { Porta, Tarefa } from '@compartilhado/modelo/resolucao.ts'
import type { ModoDoEnsaio } from '@ensaio/sessao.ts'
import type { ModeloDoCatalogo } from '@compartilhado/modelo/openrouter.ts'

export type { Porta, Tarefa } from '@compartilhado/modelo/resolucao.ts'
export type { ModeloDoCatalogo } from '@compartilhado/modelo/openrouter.ts'

/** Como a conta está hoje: a porta, a conexão e o que ela escolheu por tarefa. */
export interface EstadoDoModelo {
  porta: Porta
  /** Nulo enquanto a conta nunca conectou nada. */
  conectadoEm: string | null
  /** O que dá para mostrar da credencial: os últimos caracteres. Nunca a chave. */
  finalDaChave: string | null
  /** O modelo escolhido por tarefa. Nulo é o padrão do código. */
  escolhas: Record<Tarefa, string | null>
}

export type MotivoDeFalhaDoModelo =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

export type CargaDoModelo =
  | { ok: true; estado: EstadoDoModelo }
  | { ok: false; motivo: MotivoDeFalhaDoModelo }

/** O que a borda devolve ao iniciar a conexão: para onde mandar quem autoriza. */
export type InicioDaConexao =
  | { ok: true; url: string }
  | { ok: false; mensagem: string }

export type ResultadoDaConexao =
  | { ok: true }
  | { ok: false; mensagem: string }

export type CargaDoCatalogo =
  | { ok: true; modelos: readonly ModeloDoCatalogo[] }
  | { ok: false; mensagem: string }

// O ensaio (US-247) --------------------------------------------------------------

/** O que a borda devolve ao abrir o ensaio. A recusa chega pronta dela. */
export type AberturaDoEnsaio =
  | {
      ok: true
      ensaioId: string
      chamadaId: string
      urlAssinada: string
      modo: ModoDoEnsaio
      /** As variáveis do prompt que a borda montou com o lead de ensaio. */
      variaveis?: Readonly<Record<string, string>>
      /** A primeira fala com o lead de ensaio dentro. Nula: vale a publicada. */
      primeiraFala?: string | null
    }
  | { ok: false; mensagem: string; caminho?: string }

export type EncerramentoDoEnsaio =
  | { ok: true; chamadaId: string; turnos: number }
  | { ok: false; mensagem: string }

export interface ServicoDaSarah {
  /** A identidade da conta e o estado das publicações dela. */
  carregarIdentidade(): Promise<CargaDaSarah>
  /**
   * Grava a identidade. Cria a Sarah da conta quando ainda não existe: esta
   * tela é por onde ela nasce, e é o passo `agente` do assistente de
   * configuração inicial.
   */
  salvarIdentidade(identidade: IdentidadeDaSarah): Promise<GravacaoDaIdentidade>
  /**
   * Grava só o nome da assistente: é a primeira pergunta do tutorial, antes de
   * haver empresa, voz ou roteiro. Cria a linha quando ela ainda não existe e,
   * quando existe, troca o nome sem tocar no resto da identidade.
   */
  salvarNome(nome: string): Promise<GravacaoDaIdentidade>
  /**
   * O catálogo em português do provedor, mais a voz que a conta já gravou. Sem
   * amostra: ouvir custa uma síntese, e abrir a tela não é pedir para ouvir.
   */
  carregarVoz(): Promise<CargaDaVozDaSarah>
  /**
   * A abertura da conta dita por esta voz, com estes ajustes. Operação à
   * parte da carga justamente porque ela se repete a cada mexida no controle.
   */
  ouvirAmostra(pedido: EscolhaDeVoz): Promise<RespostaDaAmostra>
  /** Grava `voice_id` e `voice_settings`, e devolve o estado da publicação. */
  salvarVoz(escolha: EscolhaDeVoz): Promise<GravacaoDaVoz>
  /** De qual modelo a Sarah fala hoje (US-246), e o que a conta escolheu. */
  carregarModelo(): Promise<CargaDoModelo>
  /**
   * Começa o OAuth do provedor: devolve o endereço para onde mandar quem
   * autoriza. O retorno é o endereço desta tela, e a borda o confere contra as
   * origens da instalação.
   */
  iniciarConexaoDoModelo(retorno: string): Promise<InicioDaConexao>
  /** Fecha o OAuth com o que voltou na barra de endereço. */
  concluirConexaoDoModelo(codigo: string, estado: string): Promise<ResultadoDaConexao>
  /** Deixa a conta sem modelo conectado e apaga a credencial do cofre. */
  desconectarModelo(): Promise<ResultadoDaConexao>
  /** Os modelos que o provedor oferece, para a escolha por tarefa. */
  carregarCatalogoDeModelos(): Promise<CargaDoCatalogo>
  /** Escolhe o modelo de uma tarefa. Nulo devolve a conta ao padrão do código. */
  escolherModelo(tarefa: Tarefa, modelo: string | null): Promise<ResultadoDaConexao>
  /**
   * Abre um ensaio contra o agente publicado daquele propósito (US-247, T-16).
   * Devolve a sessão assinada, que o condutor usa no navegador.
   */
  abrirEnsaio(pedido: {
    proposito: Proposito
    modo: ModoDoEnsaio
    /** O perfil de lead simulado. Só o id viaja: o contexto sai de `call-init`. */
    perfil: IdDoPerfil
  }): Promise<AberturaDoEnsaio>
  /** Encerra o ensaio e grava a transcrição que o provedor registrou. */
  encerrarEnsaio(ensaioId: string, conversaId: string | null): Promise<EncerramentoDoEnsaio>
  /** Os quatro roteiros com o histórico de versões, e o estado da publicação. */
  carregarPlaybooks(): Promise<CargaDosPlaybooks>
  /**
   * Grava o rascunho do propósito. Nunca publica: o rascunho em edição é
   * atualizado, ou nasce a versão seguinte quando a última já foi ao ar.
   */
  salvarRascunho(pedido: PedidoDeRascunho): Promise<GravacaoDoRascunho>
  /**
   * Publica o rascunho salvo com a nota obrigatória (RF-307) e, em seguida,
   * chama `agent-publish`, que devolve o desfecho de cada propósito.
   */
  publicarPlaybook(pedido: PedidoDePublicacao): Promise<PublicacaoDoPlaybook>
  /**
   * Só `agent-publish`, sem versão nova: é o botão de republicar quando o que
   * está no ar diverge do que está gravado, inclusive do lado do provedor.
   */
  republicar(): Promise<PublicacaoDoPlaybook>
  /** Um rascunho de roteiro a partir da descrição do negócio (US-063). */
  gerarRascunho(proposito: Proposito, descricao: string): Promise<RascunhoGerado>
  /**
   * As primeiras sugestões da configuração a partir do contexto do negócio
   * (`onboarding-suggest`). Não grava nada: a tela mostra para revisão.
   */
  sugerirConfiguracao(contexto: ContextoDoNegocio): Promise<SugestoesGeradas>
  /**
   * Abre a entrevista de configuração (`onboarding-interview`): um agente só
   * para ela na ElevenLabs da conta, e a URL assinada da conversa.
   */
  abrirEntrevista(voz?: { readonly id: string; readonly nome: string } | null): Promise<EntrevistaAberta>
  /**
   * Fecha a entrevista: lê a conversa, apaga o agente e devolve as sugestões.
   * `pendente` é a transcrição que o provedor ainda processa.
   */
  encerrarEntrevista(agenteId: string, conversaId: string): Promise<EntrevistaEncerrada>
  /** A base de conhecimento da conta, no recorte pedido (US-085, RF-310). */
  carregarConhecimento(recorte: RecorteDoConhecimento): Promise<CargaDoConhecimento>
  /** Cria ou corrige uma entrada. O envio ao provedor é passo separado. */
  salvarEntrada(pedido: PedidoDeEntrada): Promise<GravacaoDaEntrada>
  /**
   * Tira a entrada da base. A que nunca chegou ao provedor é apagada; a
   * indexada é marcada para sair, e quem a apaga é o servidor depois de o
   * provedor confirmar.
   */
  removerEntrada(id: string): Promise<RemocaoDaEntrada>
  /** Chama `knowledge-sync`: envia o que mudou e reanexa a lista às publicações. */
  sincronizarConhecimento(): Promise<SincronizacaoDoConhecimento>
}

// A voz (RF-302, RF-303, RF-304) -------------------------------------------

/**
 * Os quatro estados que `voice-catalog` observa, que são os mesmos quatro de
 * `integrations-status`. `esperando` não está aqui porque não é observação
 * nenhuma: é o intervalo em que o pedido viaja, e quem o conhece é a tela
 * (`EstadoDaTelaDeVoz`, em `voz.ts`).
 */
export type EstadoDoCatalogoDeVozes =
  | 'conectado'
  | 'nao_configurado'
  | 'erro'
  | 'indisponivel'

/** Velocidade, estabilidade e similaridade, pelos nomes que a tela usa. */
export type NomeDeAjusteDeVoz = NomeDeAjuste

/**
 * Um ajuste como a tela o desenha (RF-303). Faixa, passo e padrão vêm do
 * provedor, por voz: a tela não guarda catálogo próprio, senão ajuste novo do
 * provedor nasceria sem controle.
 */
export interface AjusteDeVozAceito {
  nome: NomeDeAjusteDeVoz
  rotulo: string
  explicacao: string
  minimo: number
  maximo: number
  padrao: number
  passo: number
}

/**
 * O que a conta escolheu, ou tem gravado. Parcial de propósito: ausente é "não
 * mexi", e é isso que sobrevive a uma mudança de padrão do provedor.
 */
export type AjustesDeVoz = Partial<Record<NomeDeAjusteDeVoz, number>>

export interface VozDoCatalogo {
  id: string
  nome: string
  genero: 'feminina' | 'masculina' | 'neutra' | null
  sotaque: string | null
  descricao: string | null
  /** A prévia genérica do provedor. Serve de atalho; quem decide é a amostra. */
  previa: string | null
  ajustesAceitos: readonly AjusteDeVozAceito[]
}

/**
 * A audição de RF-304: a **primeira fala da conta**, interpolada e sintetizada
 * com os ajustes em experimentação. Não é frase de catálogo, e a tela diz isso.
 */
export interface AmostraDaPrimeiraFala {
  vozId: string
  /** A abertura já interpolada. Fica à vista junto do áudio. */
  texto: string
  ajustes: AjustesDeVoz
  /** Tipo do áudio, como o provedor o devolveu. */
  formato: string
  audioBase64: string
}

/** Por que não deu para ouvir, com o catálogo tendo vindo inteiro. */
export interface PendenciaDaAmostra {
  motivo: string
  mensagem: string
}

/** A frase do servidor quando o catálogo não é `conectado`. */
export interface FalhaDoCatalogo {
  motivo: string
  mensagem: string
}

export interface CatalogoDeVozes {
  estado: EstadoDoCatalogoDeVozes
  vozes: readonly VozDoCatalogo[]
  /** Quantas o provedor mandou e o filtro de português deixou de fora. */
  vozesIgnoradas: number
  erro: FalhaDoCatalogo | null
}

/** Uma voz com os ajustes dela: o que se ouve e o que se grava. */
export interface EscolhaDeVoz {
  vozId: string
  ajustes: AjustesDeVoz
}

export interface EstadoDaVozDaSarah {
  /**
   * A Sarah desta conta existe. Sem ela não há voz a escolher — nem linha em
   * que gravar, nem primeira fala com que sintetizar a amostra.
   */
  temIdentidade: boolean
  /** A voz gravada em `agents.voice_id`, ou null enquanto ninguém escolheu. */
  vozEscolhida: string | null
  /** O que está em `agents.voice_settings`, com os nomes da tela. */
  ajustes: AjustesDeVoz
  catalogo: CatalogoDeVozes
  publicacao: EstadoDePublicacao
}

export type CargaDaVozDaSarah =
  | { ok: true; voz: EstadoDaVozDaSarah }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

/**
 * A amostra pedida. `pendencia` é o caso em que o catálogo veio e a síntese
 * não: sem primeira fala escrita, provedor recusando, voz fora da lista. Ela
 * viaja ao lado do sucesso porque não é falha do pedido.
 */
export type RespostaDaAmostra =
  | {
      ok: true
      amostra: AmostraDaPrimeiraFala | null
      pendencia: PendenciaDaAmostra | null
    }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

export type GravacaoDaVoz =
  | { ok: true; publicacao: EstadoDePublicacao }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

// Os playbooks (RF-306, RF-307, RF-311) ---------------------------------------

export type { Proposito, ResultadoDoProposito }

/** Os três estados de `playbook_versions.status`, com as chaves do banco. */
export type EstadoDaVersao = 'draft' | 'published' | 'archived'

/** Uma linha de `playbook_versions`, no recorte que a tela desenha. */
export interface VersaoDoPlaybook {
  id: string
  versao: number
  estado: EstadoDaVersao
  /** Camada 2, `body_script`: o roteiro do propósito. */
  roteiro: string
  /** Camada 3, `body_house`: o jeito da casa. */
  jeitoDaCasa: string
  /** A `change_note`. Nula no rascunho, que ainda não foi publicado. */
  nota: string | null
  publicadaEm: string | null
  criadaEm: string
}

export interface PlaybookDoProposito {
  proposito: Proposito
  /** Da mais nova para a mais velha. */
  versoes: readonly VersaoDoPlaybook[]
}

export interface EstadoDosPlaybooks {
  /** Os quatro, na ordem de `PROPOSITOS`. */
  playbooks: readonly PlaybookDoProposito[]
  /** RF-311, para o agente inteiro: o hash compilado contra o gravado. */
  publicacao: EstadoDePublicacao
  /**
   * Propósitos em que `integrations-status` achou a configuração do provedor
   * diferente da que publicamos (R-06). Vazia enquanto nada divergir.
   */
  foraDaPlataforma: readonly Proposito[]
  /**
   * Os propósitos no ar com o que está gravado. `publicacao` só diz
   * `publicado` com os quatro; a primeira ligação precisa só da descoberta.
   */
  noAr?: readonly Proposito[]
}

export type CargaDosPlaybooks =
  | { ok: true; playbooks: EstadoDosPlaybooks }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

export interface PedidoDeRascunho {
  proposito: Proposito
  roteiro: string
  jeitoDaCasa: string
}

export type GravacaoDoRascunho =
  | { ok: true; versao: VersaoDoPlaybook }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

export interface PedidoDePublicacao {
  proposito: Proposito
  /** O rascunho salvo que vai ao ar. */
  versaoId: string
  nota: string
}

/**
 * O que a publicação devolve. `recusa` é a frase de `agent-publish` quando ele
 * recusou o pedido inteiro (sem voz, sem chave): a versão pode ter sido
 * publicada no banco e o provedor não ter recebido nada, e a tela diz as duas
 * coisas.
 */
export interface RelatorioDaPublicacao {
  /** O número da versão que foi ao ar no banco, ou null no republicar. */
  versaoPublicada: number | null
  propositos: readonly ResultadoDoProposito[]
  recusa: string | null
  publicacao: EstadoDePublicacao
  /**
   * A frase de `agent-publish` quando os agentes foram ao ar e os avisos de
   * início e de fim de ligação não foram cadastrados na ElevenLabs. Nula quando
   * não há pendência.
   */
  pendenciaDosWebhooks: string | null
}

export type PublicacaoDoPlaybook =
  | { ok: true; relatorio: RelatorioDaPublicacao }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

/**
 * `mensagem` é a frase do gerador quando ele recusou (sem descrição do negócio,
 * por exemplo); nula é falha de comunicação, e a frase sai da copy.
 */
export type RascunhoGerado =
  | { ok: true; roteiro: string }
  | { ok: false; mensagem: string | null }

// A base de conhecimento (RF-310) ---------------------------------------------

export type { ResultadoDaEntrada, ResultadoDaPublicacao }

/** Uma linha de `knowledge_entries`, no recorte que a tela desenha. */
export interface EntradaDeConhecimento {
  id: string
  pergunta: string
  resposta: string
  etiquetas: readonly string[]
  /** `source`: de onde a entrada veio. `manual` é a escrita nesta tela. */
  origem: string
  /** `provider_doc_id`. Nulo enquanto a entrada nunca chegou ao provedor. */
  documento: string | null
  indexadaEm: string | null
  /** `sync_error`: o código da última falha, em inglês de máquina. */
  erro: string | null
  /** `removed_at`: marcada para sair, esperando o provedor confirmar. */
  removidaEm: string | null
  /**
   * O texto de agora difere do que foi indexado (`indexed_hash`). Calculado
   * pelo mesmo hash de `knowledge-sync`, nunca por comparação de datas.
   */
  alteradaDepoisDeIndexada: boolean
  atualizadaEm: string
}

/** A busca e o filtro da tela. Ausente é "sem recorte". */
export interface RecorteDoConhecimento {
  termo?: string
  etiqueta?: string
}

export interface EstadoDoConhecimento {
  /** As mais recentes do recorte, da mais nova para a mais velha. */
  entradas: readonly EntradaDeConhecimento[]
  /** Quantas a conta tem, sem recorte. Zero é a conta que ainda não começou. */
  totalDaConta: number
  /** O recorte passou do teto, e `entradas` é só a parte mais recente dele. */
  truncada: boolean
  /** As etiquetas em uso na conta, para o filtro. */
  etiquetas: readonly string[]
}

export type CargaDoConhecimento =
  | { ok: true; conhecimento: EstadoDoConhecimento }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

export interface PedidoDeEntrada {
  /** Nulo cria; preenchido corrige a entrada com este id. */
  id: string | null
  pergunta: string
  resposta: string
  etiquetas: readonly string[]
}

export type GravacaoDaEntrada =
  | { ok: true }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

export type RemocaoDaEntrada =
  | { ok: true; desfecho: 'apagada' | 'marcada' }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

/** O desfecho de uma entrada, com a pergunta: a removida já não está na lista. */
export interface ResultadoDaEntradaNaTela extends ResultadoDaEntrada {
  pergunta: string | null
}

/**
 * O que `knowledge-sync` devolveu. `recusa` é a frase dele quando recusou o
 * pedido inteiro (sem chave do provedor, por exemplo), e aí nenhuma entrada
 * foi tocada.
 */
export interface RelatorioDaSincronizacao {
  entradas: readonly ResultadoDaEntradaNaTela[]
  publicacoes: readonly ResultadoDaPublicacao[]
  recusa: string | null
}

export type SincronizacaoDoConhecimento =
  | { ok: true; relatorio: RelatorioDaSincronizacao }
  | { ok: false; motivo: MotivoDeFalhaDaSarah }

// Sugestões do assistente de abertura -------------------------------------------

import type {
  ContextoDoNegocio,
  SugestaoDaEtapa,
} from '@sugestoes/sugestoes.ts'

export type { ContextoDoNegocio, SugestaoDaEtapa } from '@sugestoes/sugestoes.ts'

export type SugestoesGeradas =
  | { ok: true; etapas: readonly SugestaoDaEtapa[] }
  | { ok: false; mensagem: string | null }

export type EntrevistaAberta =
  | { ok: true; agenteId: string; urlAssinada: string }
  | { ok: false; mensagem: string | null }

export type EntrevistaEncerrada =
  | { ok: true; etapas: readonly SugestaoDaEtapa[] }
  | { ok: false; mensagem: string | null; pendente: boolean }
