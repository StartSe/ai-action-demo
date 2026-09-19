export type Tom = "acolhedor" | "objetivo";
export type Papel = "entrevistadora" | "candidato";
export type Recomendacao = "avançar" | "avaliar com o gestor" | "não avançar";

export interface Vaga {
  titulo: string;
  requisitos: string;
  candidato: string;
  tom: Tom;
  numero_perguntas: number;
}

export interface Troca {
  papel: Papel;
  texto: string;
}

export interface Criterio {
  criterio: string;
  nota: number;
  evidencia: string;
  /** Número (1-based) da pergunta da entrevistadora, na ordem da conversa, que originou esta evidência. Ausente quando não há uma correspondência clara. */
  pergunta?: number;
}

export interface Scorecard {
  nota_geral: number;
  resumo: string;
  criterios: Criterio[];
  pontos_fortes: string[];
  pontos_atencao: string[];
  recomendacao: Recomendacao;
  proximos_passos: string[];
}

export interface CandidatoRanking {
  id: string;
  candidato: string;
  nota_geral: number;
  recomendacao: Recomendacao;
  pontos_fortes: string[];
  pontos_atencao: string[];
}

export interface Ranking {
  vagaTitulo: string;
  candidatos: CandidatoRanking[];
}

// ---------------------------------------------------------------------------------------------
// O parecer (US-019 da PRD). O tipo mora aqui, e não em lib/avaliacao.ts, porque lib/demo.ts precisa
// dele para o `parecerDemo` e lib/avaliacao.ts vai precisar de lib/demo.ts: um arquivo só de tipos,
// no fundo do grafo de imports, é o que impede esse ciclo de nascer.
// ---------------------------------------------------------------------------------------------

/** Como o candidato está em relação a um requisito da vaga. */
export type SituacaoRequisito = "atende" | "parcial" | "nao_atende" | "nao_abordado";

/** O que foi dito na conversa bate com o currículo / com o perfil público? */
export type SituacaoConsistencia = "confirmado" | "divergente" | "nao_verificavel";

export interface AderenciaRequisito {
  requisito: string;
  situacao: SituacaoRequisito;
  evidencia: string;
  /** Número (1-based) da pergunta da entrevistadora que originou a evidência. */
  pergunta?: number;
}

export interface CriterioTecnico {
  criterio: string;
  nota: number;
  evidencia: string;
  pergunta?: number;
}

/** Uma competência cultural da vaga. `nota: null` é "não abordado" — sem evidência comportamental na
 * conversa não se atribui nota a ninguém, e a tela mostra isso em cinza. */
export interface CriterioCultural {
  competencia: string;
  nota: number | null;
  evidencia: string;
  pergunta?: number;
}

export interface ItemConsistencia {
  afirmacao: string;
  fonte: "cv" | "web";
  situacao: SituacaoConsistencia;
  detalhe: string;
}

export interface Parecer {
  notaGeral: number;
  recomendacao: Recomendacao;
  /** Três frases: o que decide, sem ler o resto. */
  resumo: string;
  aderencia: AderenciaRequisito[];
  tecnico: CriterioTecnico[];
  cultura: CriterioCultural[];
  consistencia: ItemConsistencia[];
  pontosFortes: string[];
  pontosAtencao: string[];
  proximaEtapa: { perguntas: string[]; foco: string };
  /** Só quando a pretensão foi dita na conversa. */
  pretensao: { valor?: number; dentroDaFaixa?: boolean };
  /** Entrevista encerrada antes do fim: o parecer cobre só o que foi conversado. */
  parcial: boolean;
}

// ---------------------------------------------------------------------------------------------
// A ficha do candidato (US-009). Como o Parecer, os tipos moram aqui — no fundo do grafo de imports
// — porque `lib/demo.ts` precisa deles para a ficha de exemplo e `lib/ficha.ts` precisa de
// `lib/demo.ts`. Um arquivo só de tipos é o que impede esse ciclo de nascer.
// ---------------------------------------------------------------------------------------------

/** De onde veio o que está escrito no campo. É a D5 inteira em três palavras: o currículo vence a
 * web, e o que o gestor digitou vence os dois e nunca é sobrescrito. */
export type OrigemCampo = "cv" | "web" | "gestor";

/**
 * Um campo da ficha e a procedência dele.
 *
 * `fonteId` aponta para a linha de `fontes_candidato` que sustenta o valor (o currículo, o perfil
 * público, a página trazida na pesquisa) — é o que permite à tela oferecer o link "fonte" ao lado da
 * informação, em vez de pedir confiança.
 */
export interface CampoFicha<T> {
  valor: T;
  origem: OrigemCampo;
  fonteId?: string;
  /** Quanto a consolidação da pesquisa na web confia neste campo, de 0 a 1 (US-012). Nunca vem do
   * currículo: o que está escrito no CV é o que o candidato afirma, e isso não tem grau. */
  confianca?: number;
}

export interface ExperienciaFicha {
  empresa: string;
  cargo: string;
  /** Do jeito que aparece no currículo ("2021", "mar/2021"): normalizar data de currículo é
   * inventar precisão que o texto não tem. */
  inicio?: string;
  fim?: string;
  descricao?: string;
}

export interface FormacaoFicha {
  curso: string;
  instituicao?: string;
  inicio?: string;
  fim?: string;
}

/** Currículo e web dizem coisas diferentes sobre o mesmo campo. Nenhum dos dois é apagado: fica o do
 * currículo (D5) e o gestor vê os dois lado a lado para decidir. */
export interface DivergenciaFicha {
  campo: string;
  cv: string;
  web: string;
  /** A fonte da web que originou o conflito, para a tela linkar de onde saiu a outra versão. */
  fonteId?: string;
}

/**
 * Uma pessoa que a busca trouxe e que PODE ser o candidato — ou pode ser um homônimo (D6).
 *
 * `bate` e `naoBate` são o que a pessoa de RH lê para decidir em cinco segundos: "mesma empresa do
 * currículo" de um lado, "trabalha em outra cidade" do outro. A decisão é dela, nunca do modelo.
 */
export interface IdentidadePossivel {
  nome: string;
  descricao: string;
  url?: string;
  bate: string[];
  naoBate: string[];
}

/**
 * O que a pesquisa na web consolidou e que ainda NÃO entrou na ficha (D6).
 *
 * Existe porque "achamos isto sobre alguém com este nome" e "isto é sobre o seu candidato" são
 * afirmações diferentes. Enquanto a segunda não estiver garantida — uma só pessoa plausível e
 * confiança média alta — o material fica aqui, visível para o gestor escolher, e a entrevistadora
 * não o usa.
 */
export interface PesquisaWeb {
  ficha: Ficha;
  identidades: IdentidadePossivel[];
  /** A média da confiança dos campos, de 0 a 1 — o número que a regra da D6 compara com 0,7. */
  confiancaMedia: number;
  /** A consolidação saiu do exemplo do modo demonstração, não de uma pessoa de verdade. */
  exemplo?: boolean;
  em: string;
}

/** A ficha do candidato: cada campo com a origem dele, mais os conflitos ainda não resolvidos. */
export interface Ficha {
  resumo?: CampoFicha<string>;
  cargoAtual?: CampoFicha<string>;
  empresaAtual?: CampoFicha<string>;
  cidade?: CampoFicha<string>;
  anosExperiencia?: CampoFicha<number>;
  experiencias?: CampoFicha<ExperienciaFicha>[];
  formacao?: CampoFicha<FormacaoFicha>[];
  competencias?: CampoFicha<string>[];
  idiomas?: CampoFicha<string>[];
  links?: CampoFicha<string>[];
  pretensaoSalarial?: CampoFicha<string>;
  disponibilidade?: CampoFicha<string>;
  observacoes?: CampoFicha<string>;
  divergencias?: DivergenciaFicha[];
  /** A pesquisa na web que aguarda a decisão do gestor (US-012). Não é um campo da ficha: é o que
   * ainda não virou ficha. */
  web?: PesquisaWeb;
}

/**
 * A ficha como a IA (e o exemplo do modo demonstração) a devolvem: valores crus, sem procedência.
 *
 * Quem sabe de onde aquilo veio é quem chamou o modelo, não o modelo — pedir a origem na resposta
 * seria pedir para ele inventar mais um campo. `normalizarFicha()` (lib/ficha.ts) carimba a origem.
 */
export interface FichaBruta {
  resumo?: string | null;
  cargoAtual?: string | null;
  empresaAtual?: string | null;
  cidade?: string | null;
  anosExperiencia?: number | null;
  experiencias?: ExperienciaFicha[] | null;
  formacao?: FormacaoFicha[] | null;
  competencias?: string[] | null;
  idiomas?: string[] | null;
  links?: string[] | null;
  pretensaoSalarial?: string | null;
  disponibilidade?: string | null;
  observacoes?: string | null;
}

/**
 * A consolidação da pesquisa na web, como a IA (e o exemplo do modo demonstração) a devolvem.
 *
 * `ficha` tem o formato de `FichaBruta`, com cada valor podendo chegar embrulhado em
 * `{ valor, confianca, fonteId }` — é `normalizarFicha()` (lib/ficha.ts) que desembrulha e carimba a
 * origem. `fontes` traz as duas frases de resumo de cada página trazida, e `identidadesPossiveis` só
 * vem preenchida quando há mais de uma pessoa plausível.
 */
export interface ConsolidacaoBruta {
  ficha?: Record<string, unknown> | null;
  fontes?: ({ fonteId?: string | null; resumo?: string | null } | null)[] | null;
  identidadesPossiveis?:
    | ({ nome?: string | null; descricao?: string | null; url?: string | null; bate?: unknown; naoBate?: unknown } | null)[]
    | null;
}

// ---------------------------------------------------------------------------------------------
// O roteiro da entrevista (US-015 da PRD). Como o Parecer e a Ficha, os tipos moram aqui — no fundo
// do grafo de imports — porque `lib/demo.ts` precisa deles para o `roteiroDemo` e `lib/roteiro.ts`
// precisa de `lib/demo.ts`. Um arquivo só de tipos é o que impede esse ciclo de nascer.
// ---------------------------------------------------------------------------------------------

/** Os blocos do roteiro, na ordem em que a entrevista os percorre. */
export type BlocoRoteiro = "abertura" | "curriculo" | "requisitos" | "desafios" | "cultura" | "pretensao" | "encerramento";

export interface PerguntaRoteiro {
  bloco: BlocoRoteiro;
  pergunta: string;
  /** O requisito, o desafio ou a competência que originou a pergunta. Vazio na abertura e no
   * encerramento. Não é dito ao candidato: é o que o parecer (US-019) usa para saber o que cada
   * resposta deveria sustentar. */
  foco?: string;
}

/** O plano da conversa, feito uma vez na abertura da sala e guardado em `entrevistas.roteiro`. */
export interface Roteiro {
  /** v2 separa aprofundamentos de perguntas principais na condução e no parecer. */
  versaoConducao?: 2;
  perguntas: PerguntaRoteiro[];
  /** A despedida, escrita junto com o plano: a conversa termina com as mesmas palavras, tenha ela
   * ido até o fim ou sido encerrada antes. */
  despedida: string;
  /** O plano saiu do modo demonstração, não de uma chamada ao modelo. */
  demo: boolean;
  em: string;
}

/** Um campo da ficha do candidato como a entrevistadora o recebe: já em texto, e de onde veio. */
export interface ItemFichaRoteiro {
  rotulo: string;
  valor: string;
  origem: OrigemCampo;
}

/**
 * Tudo que a entrevistadora sabe antes de abrir a boca: a vaga, a cultura e a ficha do candidato.
 *
 * O que NÃO está aqui é tão importante quanto o que está. A ficha só traz o que veio do currículo,
 * do gestor e — quando a identidade foi confirmada (D6) — da web. A faixa cadastrada serve para
 * responder dúvidas, mesmo se a vaga não perguntar pretensão. Nada além destes campos pode ser dito.
 */
export interface ContextoRoteiro {
  cargo: string;
  area?: string;
  senioridade?: string;
  modelo?: string;
  local?: string;
  /** Faixa cadastrada para responder dúvidas; não obriga a perguntar pretensão. */
  faixaSalarial?: string;
  desafios: string[];
  requisitos: string[];
  competencias: { nome: string; descricao: string }[];
  /** Da cultura da empresa (US-003): o que se espera no dia a dia. */
  comportamentos: string;
  /** E o que não funciona por lá. */
  naoCombina: string;
  tom: Tom;
  numeroPerguntas: number;
  duracaoMin: number;
  perguntaPretensao: boolean;
  candidato: {
    nome: string;
    primeiroNome: string;
    ficha: ItemFichaRoteiro[];
    /** As divergências da ficha (US-012), viradas em pontos a esclarecer na conversa. */
    aEsclarecer: string[];
  };
}
