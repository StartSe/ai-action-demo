import type { MotivoTransferencia } from "./transferencia";

export type Tom = "profissional" | "amigavel" | "personalizado";
/** O que o atendente foi criado para fazer; vira uma frase do prompt em lib/atendente.ts. */
export type Objetivo = "atendimento" | "vendas" | "agendamentos" | "outro";
export type NaoSei = "humano" | "contato" | "site";
// Renomeado de "Origem" para não colidir com o componente Origem de components/ui.tsx (linha de proveniência do resultado).
export type CanalOrigem = "simulador" | "whatsapp" | "mcp" | "exemplo";

/** Em que ponto do atendimento a conversa está (lib/conversas.ts); os rótulos ficam em lib/rotulos.ts. */
export type StatusConversa = "ia" | "atencao" | "humano" | "resolvida";

/** Janela de tempo dos filtros de Conversas e Relatórios; os rótulos ficam em lib/rotulos.ts. */
export type Periodo = "hoje" | "7d" | "30d" | "tudo";

/**
 * Quem escreveu a mensagem: o cliente, o atendente virtual ou a pessoa que assumiu a conversa. Os dois
 * últimos não são mensagens de ninguém para o cliente: `nota` é uma anotação interna da equipe e
 * `evento` é uma linha do tempo ("Você assumiu a conversa"). Os dois ficam só na tela — nunca vão
 * para a IA (`historicoRecente`), não contam como não lidas e nunca saem pelo número da empresa.
 */
export type PapelMensagem = "cliente" | "atendente" | "humano" | "nota" | "evento";

/** As mensagens que são conversa de verdade (o que a IA lê e o que conta como pergunta e resposta). */
export const PAPEIS_DE_CONVERSA: PapelMensagem[] = ["cliente", "atendente", "humano"];

/**
 * Até onde uma mensagem que saiu pelo número da empresa chegou (lib/conversas.ts): `enviando` enquanto
 * o app ainda não recebeu a confirmação do provedor, `enviada` quando ele aceitou, `entregue` e `lida`
 * quando o aviso de status da z-api chegou, `falhou` quando o provedor recusou. Nulo para o que nunca
 * saiu por um número real (simulador, exemplo, assistente por MCP) e para mensagens anteriores à 0.3.0.
 */
export type StatusEntrega = "enviando" | "enviada" | "entregue" | "lida" | "falhou";

/**
 * Os períodos que os números de Início e Relatórios aceitam (lib/metricas.ts). "Tudo" fica de fora:
 * todo número desta tela vem com a comparação com o período anterior de mesmo tamanho, e "tudo" não
 * tem anterior.
 */
export type PeriodoMetricas = Exclude<Periodo, "tudo">;

/**
 * Quanto cada número cresceu ou caiu em relação ao período anterior de mesmo tamanho, em pontos
 * percentuais arredondados. `null` quando o período anterior não teve nada: sem base, não há
 * porcentagem para mostrar (e não é "0%").
 */
export interface VariacaoMetricas {
  conversas: number | null;
  resolvidasIA: number | null;
  passadasPessoa: number | null;
  tempoMedioMs: number | null;
}

/** Um dia do gráfico de Relatórios. `dia` é a data local em "AAAA-MM-DD". */
export interface DiaMetricas {
  dia: string;
  conversas: number;
  resolvidasIA: number;
}

/** Um assunto e quantas conversas do período trataram dele. */
export interface AssuntoMetricas {
  assunto: string;
  total: number;
}

/**
 * Os números do atendimento em um período, do jeito que Início e Relatórios desenham. Fonte única:
 * lib/metricas.ts, com as definições de cada número documentadas no topo daquele arquivo.
 */
export interface Metricas {
  conversas: number;
  resolvidasIA: number;
  passadasPessoa: number;
  /** Média de tempo até a resposta, em milissegundos; 0 quando ninguém respondeu no período. */
  tempoMedioMs: number;
  variacao: VariacaoMetricas;
  /** Todos os dias do período, inclusive os sem conversa nenhuma, para o gráfico não ter buracos. */
  porDia: DiaMetricas[];
  assuntos: AssuntoMetricas[];
  /** As conversas paradas esperando uma pessoa AGORA; não é filtrada pelo período (veja lib/metricas.ts). */
  atencao: Conversa[];
}

/**
 * Quais tipos de anexo o atendente tenta entender antes de responder (lib/midia.ts). Desligar um tipo
 * não esconde o anexo da conversa: ele continua na bolha, só não é lido pela IA — e o cliente recebe
 * `fraseSemMidia` quando não sobrou mais nada respondível na sequência.
 */
export interface ConfigMidia {
  audio: boolean;
  imagem: boolean;
  documento: boolean;
}

/** O que está ligado quando ninguém mexeu: o atendente entende tudo o que o cliente manda. Mora aqui
 * (e não em lib/midia.ts, que abre banco e fala com o OpenRouter) para o formulário do Assistente
 * conseguir importá-lo — mesma razão de PAPEIS_DE_CONVERSA estar neste arquivo. */
export const MIDIA_PADRAO: ConfigMidia = { audio: true, imagem: true, documento: true };

/** O que o cliente recebe quando o atendente não consegue entender o que ele mandou (lib/midia.ts). */
export const FRASE_SEM_MIDIA_PADRAO = "Ainda não consigo ouvir áudios nem abrir arquivos por aqui. Pode me escrever?";

/**
 * O que o atendente pode fazer além de escrever, ligado e desligado na seção Ferramentas do passo 1 do
 * Assistente. "Pedir ajuda de uma pessoa" não está aqui de propósito: transferir é o que impede o
 * atendente de inventar uma resposta, e desligar isso deixaria o cliente sem saída — é sempre ligado.
 * `agenda` e `sistemas` valem por cima da conexão: desligados, as ferramentas não são nem oferecidas ao
 * modelo, mesmo com a agenda ou o sistema da empresa conectados (lib/atendente.ts).
 */
export interface ConfigFerramentas {
  /** Pedir o nome no começo da conversa e um contato de retorno ao transferir (só prompt, sem ferramenta). */
  coletarContato: boolean;
  /** Oferecer as ferramentas da agenda conectada (lib/agenda.ts) ao atendente. */
  agenda: boolean;
  /** Oferecer as ferramentas dos sistemas da empresa (lib/empresa-mcp.ts) ao atendente. */
  sistemas: boolean;
}

/** O que está ligado quando ninguém mexeu: o atendente usa o que já estiver conectado, mas não pede
 * dados do cliente por conta própria (pedir nome e contato é escolha de quem atende, não padrão).
 * Mora aqui, e não em lib/atendente.ts, pela mesma razão de MIDIA_PADRAO: o formulário precisa dele. */
export const FERRAMENTAS_PADRAO: ConfigFerramentas = { coletarContato: false, agenda: true, sistemas: true };

/** Tetos da saudação e das perguntas de teste: o campo, o contador da tela e a validação da rota leem
 * daqui, para os três nunca discordarem sobre o que cabe. */
export const LIMITE_SAUDACAO = 240;
export const LIMITE_PERGUNTA = 120;
export const MAX_PERGUNTAS = 5;

export interface Config {
  negocio: string;
  atendente: string;
  objetivo: Objetivo;
  /** O que o atendente deve fazer, escrito pela pessoa; só existe quando `objetivo === "outro"`. */
  objetivoTexto?: string;
  tom: Tom;
  /** Estilo de resposta escrito pela pessoa; só existe quando `tom === "personalizado"`. */
  tomTexto?: string;
  /**
   * Como o atendente se apresenta na primeira mensagem de uma conversa (até LIMITE_SAUDACAO). Vazia,
   * vale a reserva de `saudacaoPadrao()` (components/Celular.tsx) na prévia e nenhuma instrução extra
   * no prompt — o modelo se apresenta como sempre fez.
   */
  saudacao?: string;
  /**
   * As perguntas que o passo "Testar" oferece em um clique (até MAX_PERGUNTAS, cada uma até
   * LIMITE_PERGUNTA). Ausente, o passo 2 usa as perguntas da empresa de exemplo.
   */
  perguntasSugeridas?: string[];
  horario: string;
  baseConhecimento: string;
  naoSei: NaoSei;
  /**
   * O que o cliente recebe quando a IA falha numa conversa real (lib/atendente.ts). Vazio = a frase
   * padrão de lib/transferencia.ts (`FRASE_FALHA_PADRAO`).
   */
  fraseFalha?: string;
  /** Tipos de anexo que o atendente tenta entender antes de responder; ausente vale MIDIA_PADRAO. */
  midia: ConfigMidia;
  /** O que o atendente pode fazer além de escrever; ausente vale FERRAMENTAS_PADRAO. */
  ferramentas: ConfigFerramentas;
  /**
   * O que o cliente recebe quando ele mandou só um anexo que o atendente não conseguiu entender
   * (tipo desligado, formato fora da lista, falha do modelo). Vazio = FRASE_SEM_MIDIA_PADRAO.
   */
  fraseSemMidia?: string;
}

/**
 * O atendente que a IA propôs a partir de duas frases sobre o negócio (lib/persona.ts). Não é uma
 * `Config`: é um rascunho para a pessoa revisar no passo 1 do Assistente, com o que foi decidido
 * escrito em linguagem de negócio. Nada disso é salvo até ela clicar em "Salvar e testar o atendente".
 */
export interface PersonaGerada {
  atendente: string;
  negocio: string;
  objetivo: Objetivo;
  /** O que ele faz, escrito em uma linha; só vem quando `objetivo === "outro"`. */
  objetivoTexto?: string;
  tom: Tom;
  /** Estilo de resposta em uma linha; só vem quando `tom === "personalizado"`. */
  tomTexto?: string;
  /** Como o atendente se apresenta, em uma frase; vira `Config.saudacao` quando a pessoa aplica. */
  saudacao: string;
  /** A base no formato de lib/base-modelo.ts, com [MARCADORES] só onde o brief não deu o dado. */
  baseConhecimento: string;
  /** Três perguntas que um cliente desse negócio faria de verdade. */
  perguntasSugeridas: string[];
  /** Três frases curtas dizendo o que foi decidido e por quê ("Tom amigável porque você atende famílias"). */
  decisoes: string[];
}

/** Uma conversa como as telas leem: os campos da tabela `conversas` mais o resumo das mensagens. */
export interface Conversa {
  numero: string;
  /** Nome do contato quando o canal informa um; string vazia quando só há o número. */
  nome: string;
  ultima_mensagem: string;
  /** Última resposta do atendente a essa conversa (para os botões Aprovar/Corrigir na lista de conversas). */
  ultima_resposta: string;
  hora: string;
  /** Atalho de `status === "atencao"`: a conversa parou esperando uma pessoa. */
  transferir: boolean;
  origem: CanalOrigem;
  status: StatusConversa;
  /** Assunto da conversa (lib/assuntos.ts); nulo até a primeira resposta do atendente classificá-la. */
  assunto: string | null;
  exemplo: boolean;
  nao_lidas: number;
  /** Momento da última mensagem ou mudança de status, em ISO, para as telas ordenarem e agruparem. */
  atualizado_em: string;
  /** Por que a IA passou a conversa para uma pessoa (lib/transferencia.ts); nulo enquanto ela não passou. */
  motivoTransferencia: MotivoTransferencia | null;
  /** Desde quando o cliente espera uma pessoa, em ISO; nulo quando ninguém está esperando. */
  esperandoDesde: string | null;
  /** A conversa tem pelo menos uma nota interna: a lista mostra a marca sem abrir a conversa. */
  temNotas: boolean;
}

export interface MensagemChat {
  papel: PapelMensagem;
  texto: string;
}

/**
 * O que o cliente mandou quando não foi texto (lib/anexos.ts). `outro` é a rede de segurança: um tipo
 * de mensagem que o WhatsApp tenha e este app ainda não desenhe aparece como um aviso honesto, nunca
 * como uma conversa com um buraco.
 */
export type TipoAnexo = "audio" | "imagem" | "video" | "documento" | "figurinha" | "localizacao" | "contato" | "outro";

/**
 * Um anexo de uma mensagem, do jeito que a bolha o desenha. O caminho da cópia no disco fica de fora
 * de propósito: quem quer o arquivo passa pela rota `/api/anexos/[id]`, que é privada.
 */
export interface Anexo {
  id: string;
  tipo: TipoAnexo;
  /**
   * Endereço que a bolha usa: a cópia servida pelo próprio app nos tipos que são arquivo, o link do
   * mapa na localização e vazio no contato (que não tem o que abrir).
   */
  url: string;
  mime: string;
  /** Nome do arquivo; nos cartões sem arquivo é o título (o endereço da localização, o nome do contato). */
  nomeArquivo: string;
  /** Tamanho do arquivo em bytes; 0 enquanto a cópia não foi feita (ou quando não há arquivo). */
  tamanho: number;
  /** Duração do áudio ou do vídeo, em segundos. */
  segundos?: number;
  /** Legenda escrita pelo cliente; nos cartões sem arquivo é a segunda linha (o telefone do contato). */
  legenda?: string;
  /** O que o atendente ouviu ou leu neste anexo, quando a IA conseguiu processá-lo. */
  transcricao?: string;
}

/**
 * De onde veio uma fonte usada para escrever a resposta: o texto livre da base do Assistente, as
 * respostas já aprovadas pela equipe, um documento importado, ou o que o atendente lembra do cliente
 * (memória e resumo da conversa, a partir da US-011/US-012).
 */
export type TipoFonte = "base" | "aprovada" | "documento" | "memoria" | "resumo";

/** Uma fonte consultada para escrever a resposta, do jeito que o bloco "Por que respondeu assim" a mostra. */
export interface FonteDaResposta {
  tipo: TipoFonte;
  /** Nome que aparece na linha: o nome do documento, "Base de conhecimento do Assistente"... */
  nome: string;
  /** O pedaço de texto que entrou na resposta, já cortado (nunca o documento inteiro). */
  trecho: string;
}

/** Uma ferramenta chamada para escrever a resposta (agenda ou sistemas da empresa). */
export interface FerramentaDaResposta {
  nome: string;
  /** A chamada deu certo? Uma ferramenta que falhou continua aparecendo — foi o que a IA tentou. */
  ok: boolean;
  /** Resumo curto do que foi consultado (o argumento da chamada), para quem confere a resposta. */
  resumo: string;
}

/**
 * Como esta resposta foi montada: as fontes lidas, as ferramentas chamadas, o motivo da transferência,
 * o que veio de áudio/foto/arquivo, quanto tempo levou e com que modelo. Gravado junto da mensagem
 * (coluna `detalhes` de lib/conversas.ts) e mostrado no bloco "Por que respondeu assim" — é o que faz
 * a pessoa corrigir a base no lugar certo em vez de adivinhar.
 */
export interface DetalhesResposta {
  /** O modelo que escreveu a resposta, ou "sem IA (busca local)" no modo demonstração. */
  modelo: string;
  tempoMs: number;
  fontes: FonteDaResposta[];
  ferramentas: FerramentaDaResposta[];
  /** Só quando a resposta passou a conversa para uma pessoa. */
  transferencia?: { motivo: MotivoTransferencia };
  /** Que tipos de anexo o atendente leu para responder. */
  midia?: ("transcricao" | "imagem" | "documento")[];
  /** Quantas mensagens do cliente esta resposta respondeu de uma vez (a rajada de lib/rajada.ts). */
  rajada: number;
}

/** Uma mensagem já gravada, como a conversa aberta e a IA a leem (datas sempre em ISO). */
export interface MensagemDaConversa extends MensagemChat {
  id: number;
  criadoEm: string;
  /** Nome da ferramenta dos sistemas da empresa consultada para escrever esta resposta, se alguma foi. */
  ferramentaUsada?: string;
  /** Quanto o atendente levou entre receber a pergunta e gravar esta resposta. */
  tempoRespostaMs?: number;
  /** Até onde a mensagem chegou ao cliente; só existe no que saiu por um número real. */
  statusEntrega?: StatusEntrega;
  /** A frase de negócio do provedor quando `statusEntrega === "falhou"`. */
  erroEnvio?: string;
  /** O que veio junto da mensagem quando o cliente mandou áudio, foto, arquivo, localização ou contato. */
  anexos?: Anexo[];
  /** Como esta resposta foi montada (só nas respostas do atendente virtual, e só desde a 0.3.0). */
  detalhes?: DetalhesResposta;
}

/**
 * A conversa inteira, com as mensagens: o que `GET /api/conversas/[numero]` devolve e o que a coluna
 * do meio de Conversas desenha. Os campos sem `mensagens` são o registro da tabela `conversas`
 * (lib/conversas.ts:ConversaRegistro), com o status JÁ calculado na leitura.
 */
export interface ConversaCompleta {
  numero: string;
  /** Nome do contato quando o canal informa um; string vazia quando só há o número. */
  nome: string;
  origem: CanalOrigem;
  status: StatusConversa;
  /** Assunto da conversa (lib/assuntos.ts); nulo até a primeira resposta do atendente classificá-la. */
  assunto: string | null;
  exemplo: boolean;
  naoLidas: number;
  criadoEm: string;
  atualizadoEm: string;
  /** Por que a IA passou a conversa para uma pessoa (lib/transferencia.ts); nulo enquanto ela não passou. */
  motivoTransferencia: MotivoTransferencia | null;
  /** Desde quando o cliente espera uma pessoa, em ISO; nulo quando ninguém está esperando. */
  esperandoDesde: string | null;
  /**
   * O resumo do começo de uma conversa longa (lib/memoria.ts), usado no prompt no lugar das mensagens
   * mais antigas e mostrado no painel do contato; nulo enquanto a conversa couber inteira no histórico.
   */
  resumo: string | null;
  /**
   * O que o atendente lembra DESTE CLIENTE, de todas as conversas dele (lib/memoria.ts). Diferente do
   * `resumo`, que é só desta conversa. Quem preenche é a rota (a tabela `contatos` tem outro dono),
   * então `lib/conversas.ts` sempre devolve `null` aqui — ver lib/memoria.ts:comContato.
   */
  contato: ContatoLembrado | null;
  mensagens: MensagemDaConversa[];
}

/** Quem escreveu por último o que o atendente lembra: a IA sozinha, ou alguém da equipe corrigindo. */
export type AutorDaMemoria = "ia" | "pessoa";

/**
 * O que o atendente guarda de um cliente entre uma conversa e outra: o nome como ele se apresentou,
 * um e-mail e um telefone de retorno quando ele os informou, e um parágrafo com o que for útil no
 * próximo atendimento. É visível e editável no painel do contato — nada aqui é escondido de quem
 * atende, e nada daqui é obrigatório.
 */
export interface ContatoLembrado {
  nomeInformado: string | null;
  email: string | null;
  telefoneRetorno: string | null;
  /** O parágrafo em si; string vazia quando ainda não há nada anotado. */
  memoria: string;
  /** Quando esta anotação mudou pela última vez, em ISO. */
  atualizadoEm: string;
  atualizadoPor: AutorDaMemoria;
}

/** Teto do que o atendente lembra de um cliente: um parágrafo, não um prontuário. */
export const LIMITE_MEMORIA = 1200;

/**
 * Teto de uma nota interna (`papel: "nota"`): cabe o combinado de um atendimento inteiro, e não um
 * documento. Quem escreve vê o contador no campo, e `POST /api/conversas/[numero]/notas` recusa acima
 * disso com frase de negócio.
 */
export const LIMITE_NOTA = 2000;

/**
 * Uma frase pronta que a equipe reaproveita no campo de resposta, chamada pelo atalho depois de uma
 * barra ("/horario"). O texto pode deixar em aberto `{nome}` (o contato) e `{atendente}` (o nome do
 * atendente da empresa), trocados na hora de inserir — ver lib/atalhos.ts.
 */
export interface RespostaRapida {
  id: number;
  atalho: string;
  texto: string;
  criadoEm: string;
  /** Nasceu junto das conversas de exemplo e some junto com elas. */
  exemplo: boolean;
}

/** Teto do texto de uma resposta rápida: uma mensagem de WhatsApp, não um documento. */
export const LIMITE_TEXTO_RAPIDO = 1000;

/** Tamanho do atalho (o que vem depois da barra): curto o bastante para valer a pena digitar. */
export const MIN_ATALHO = 2;
export const LIMITE_ATALHO = 30;

/** Entrada/saída de registros antigos do tipo "atendimento" em lib/historico.ts. Desde a US-003 as
 * conversas vivem no banco (lib/conversas.ts) e nada novo é salvo assim; o tipo continua porque
 * `/r/[id]` e `/imprimir/[id]` precisam abrir os registros já gerados. */
export interface AtendimentoEntrada {
  numero: string;
  texto: string;
}

export interface AtendimentoSaida {
  resposta: string;
  transferir: boolean;
  conversas: Conversa[];
}

/** Uma pergunta que merece atenção da equipe: sem resposta boa, repetida ou transferida para um humano. */
export interface PerguntaPendente {
  pergunta: string;
  /** Número da conversa mais recente com essa pergunta, para o link "abrir a conversa". */
  numero: string;
  frequencia: number;
  transferida: boolean;
  /** Última resposta que o atendente deu a essa pergunta, ponto de partida para a correção.
   * Opcional: relatórios salvos antes desta história não têm o campo e precisam continuar abrindo. */
  ultimaResposta?: string;
}

/** Uma pergunta pendente com a sugestão de resposta escrita pela IA, no relatório diário (lib/rotinas-do-app.ts). */
export interface ItemRelatorioAtendimento extends PerguntaPendente {
  respostaSugerida: string;
  /** Nome da ferramenta dos sistemas da empresa (MCP) consultada para montar a resposta sugerida, se alguma foi usada. */
  ferramentaUsada?: string;
}

/** Entrada/saída salvas em lib/historico.ts (tipo "relatorio-atendimento") pela rotina diária. */
export interface RelatorioAtendimentoSaida {
  itens: ItemRelatorioAtendimento[];
}
