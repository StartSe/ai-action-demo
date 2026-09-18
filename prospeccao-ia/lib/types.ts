export type Fonte = "apollo" | "demo";

export interface DadosBusca {
  segmento: string;
  cargo: string;
  localizacao: string;
  porte: string;
  proposta: string;
  quantidade: string;
  remetenteNome?: string;
  remetenteEmpresa?: string;
}

export interface Lead {
  id: string;
  nome: string;
  cargo: string;
  empresa: string;
  setor: string;
  porte: string;
  cidade: string;
  linkedin: string;
  site: string;
  sinal: string;
  /** true depois de "Enviar para o CRM" ter criado o contato (e, quando identificado, o negócio) com sucesso. */
  noCRM?: boolean;
}

export interface Abordagem {
  gancho: string;
  email: { assunto: string; corpo: string };
  linkedin: string;
  whatsapp: string;
  proximo_passo: string;
}

export interface ResultadoBusca {
  fonte: Fonte;
  leads: Lead[];
  /** Abordagens já escritas para esses leads (rotina "leads novos toda semana"); ausente numa busca manual comum. */
  abordagens?: Record<string, Abordagem>;
}

// --- Workspace de prospecção (lib/workspace.ts) ---------------------------
// Tipos das seis entidades persistidas do workspace (produto, ICP, prospecção,
// conta, lead e abordagem). Nomeados sem colisão com os tipos antigos acima
// (Lead, Abordagem), que continuam em uso pelas rotas de busca de hoje.

export type Jornada = "b2b" | "b2c";
export type Fit = "alta" | "media" | "baixa";
export type ModoProspeccao = "empresas" | "pessoas" | "empresa_unica" | "oportunidades";
export type EstadoProspeccao = "rascunho" | "executando" | "pronta" | "falhou" | "cancelada";
export type Papel = "decisor" | "influenciador" | "champion" | "desconhecido";
export type StatusLead = "novo" | "pesquisado" | "qualificado" | "selecionado" | "abordado" | "respondeu" | "descartado";

/** Um critério do ICP avaliado para um lead/conta específico: valor encontrado e o resultado da checagem. */
export interface Evidencia {
  criterio: string;
  valor: string;
  resultado: "atende" | "nao_atende" | "nao_verificavel";
}

/** Sinal de intenção com origem e data, nunca aceito sem as duas (ver lib/workspace.ts). */
export interface SinalProspeccao {
  descricao: string;
  data: string;
  tipo: string;
  origem: string;
}

/** Critérios do ICP: campos de B2B (setor..outros) e de B2C (faixaEtaria..contexto) convivem no mesmo tipo; a tela de cada jornada usa só o seu recorte (US-006). */
export interface CriteriosICP {
  setor?: string;
  porte?: string;
  localizacao?: string;
  outros?: string;
  faixaEtaria?: string;
  ocupacao?: string;
  interesses?: string[];
  contexto?: string;
}

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  site: string | null;
  propostaValor: string;
  /** true só nos dados semeados por "Ver uma prospecção de exemplo" (US-008); nunca marcado por quem cadastra um produto de verdade. */
  demo: boolean;
  criadoEm: string;
}
export type NovoProduto = Omit<Produto, "id" | "criadoEm" | "demo"> & { demo?: boolean };

export interface ICP {
  id: string;
  produtoId: string;
  nome: string;
  jornada: Jornada;
  criterios: CriteriosICP;
  personas: string[];
  dores: string[];
  sinais: string[];
  demo: boolean;
  criadoEm: string;
}
export type NovoICP = Omit<ICP, "id" | "criadoEm" | "demo"> & { demo?: boolean };

/** Sugestão de produto + ICP a partir do site (US-007): nunca salva direto, sempre editada em ProdutoComIA antes de virar Produto/ICP de verdade. */
export interface SugestaoProduto {
  nome: string;
  descricao: string;
  propostaValor: string;
  icp: {
    nome: string;
    criterios: CriteriosICP;
    personas: string[];
    dores: string[];
    sinais: string[];
  };
}

export interface Prospeccao {
  id: string;
  produtoId: string;
  icpId: string;
  modo: ModoProspeccao;
  criterios: Record<string, unknown>;
  estado: EstadoProspeccao;
  etapa: string | null;
  erro: string | null;
  demo: boolean;
  criadoEm: string;
  concluidoEm: string | null;
}
export type NovaProspeccao = Omit<Prospeccao, "id" | "criadoEm" | "concluidoEm" | "demo"> & { concluidoEm?: string | null; demo?: boolean };

/** Conta = empresa descoberta numa prospecção B2B (nome próprio para não colidir com a conta de administrador de lib/conta.ts). */
export interface Conta {
  id: string;
  prospeccaoId: string;
  nome: string;
  site: string | null;
  setor: string | null;
  porte: string | null;
  cidade: string | null;
  fit: Fit | null;
  evidencias: Evidencia[];
  sinais: SinalProspeccao[];
  resumo: string;
  demo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}
export type NovaConta = Omit<Conta, "id" | "criadoEm" | "atualizadoEm" | "demo"> & { demo?: boolean };

/** Pessoa descoberta numa prospecção (nome próprio para não colidir com o Lead de lib/types.ts usado pelas rotas antigas). */
export interface LeadProspeccao {
  id: string;
  prospeccaoId: string;
  contaId: string | null;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  cidade: string | null;
  linkedin: string | null;
  fonte: string | null;
  papel: Papel;
  fit: Fit | null;
  evidencias: Evidencia[];
  sinais: SinalProspeccao[];
  hipotese: string | null;
  status: StatusLead;
  noCRM: boolean;
  demo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}
export type NovoLeadProspeccao = Omit<LeadProspeccao, "id" | "criadoEm" | "atualizadoEm" | "demo"> & { demo?: boolean };

export interface EstrategiaAbordagem {
  objetivo: string;
  gancho: string;
  dorProvavel: string;
  tom: string;
  cta: string;
}

/** Abordagem salva do workspace (nome próprio para não colidir com a Abordagem gerada pelas rotas antigas). */
export interface AbordagemRegistro {
  id: string;
  leadId: string;
  estrategia: EstrategiaAbordagem;
  email: { assunto: string; corpo: string };
  linkedin: string;
  whatsapp: string;
  variacao: string | null;
  demo: boolean;
  criadoEm: string;
}
export type NovaAbordagemRegistro = Omit<AbordagemRegistro, "id" | "criadoEm" | "demo"> & { demo?: boolean };
