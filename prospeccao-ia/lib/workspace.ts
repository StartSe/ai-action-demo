// Workspace de prospecção: tabelas próprias para produto, ICP, prospecção, conta,
// lead e abordagem, no mesmo app.sqlite de lib/store.ts (ver abrirBanco()).
// Cada entidade expõe criar/listar/obter/atualizar/apagar; nenhuma rota monta SQL.
import crypto from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { abrirBanco } from "./store";
import type {
  Produto, NovoProduto,
  ICP, NovoICP,
  Prospeccao, NovaProspeccao,
  Conta, NovaConta,
  LeadProspeccao, NovoLeadProspeccao,
  AbordagemRegistro, NovaAbordagemRegistro,
  CriteriosICP, Evidencia, SinalProspeccao, EstrategiaAbordagem,
} from "./types";

let criado = false;

function banco(): DatabaseSync {
  const d = abrirBanco();
  if (criado) return d;
  d.exec(`CREATE TABLE IF NOT EXISTS produtos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    site TEXT,
    proposta_valor TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL
  )`);
  try { d.exec(`ALTER TABLE produtos ADD COLUMN apagado_em TEXT`); } catch { /* coluna já existe */ }
  try { d.exec(`ALTER TABLE produtos ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE TABLE IF NOT EXISTS icps (
    id TEXT PRIMARY KEY,
    produto_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    jornada TEXT NOT NULL,
    criterios TEXT NOT NULL DEFAULT '{}',
    personas TEXT NOT NULL DEFAULT '[]',
    dores TEXT NOT NULL DEFAULT '[]',
    sinais TEXT NOT NULL DEFAULT '[]',
    criado_em TEXT NOT NULL
  )`);
  try { d.exec(`ALTER TABLE icps ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_icps_produto ON icps (produto_id)`);
  d.exec(`CREATE TABLE IF NOT EXISTS prospeccoes (
    id TEXT PRIMARY KEY,
    produto_id TEXT NOT NULL,
    icp_id TEXT NOT NULL,
    modo TEXT NOT NULL,
    criterios TEXT NOT NULL DEFAULT '{}',
    estado TEXT NOT NULL,
    etapa TEXT,
    erro TEXT,
    criado_em TEXT NOT NULL,
    concluido_em TEXT
  )`);
  try { d.exec(`ALTER TABLE prospeccoes ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_prospeccoes_produto ON prospeccoes (produto_id)`);
  d.exec(`CREATE TABLE IF NOT EXISTS contas (
    id TEXT PRIMARY KEY,
    prospeccao_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    site TEXT,
    setor TEXT,
    porte TEXT,
    cidade TEXT,
    fit TEXT,
    evidencias TEXT NOT NULL DEFAULT '[]',
    sinais TEXT NOT NULL DEFAULT '[]',
    resumo TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  )`);
  try { d.exec(`ALTER TABLE contas ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_contas_prospeccao ON contas (prospeccao_id)`);
  d.exec(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    prospeccao_id TEXT NOT NULL,
    conta_id TEXT,
    nome TEXT NOT NULL,
    cargo TEXT,
    empresa TEXT,
    cidade TEXT,
    linkedin TEXT,
    fonte TEXT,
    papel TEXT NOT NULL DEFAULT 'desconhecido',
    fit TEXT,
    evidencias TEXT NOT NULL DEFAULT '[]',
    sinais TEXT NOT NULL DEFAULT '[]',
    hipotese TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    no_crm INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  )`);
  try { d.exec(`ALTER TABLE leads ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  try { d.exec(`ALTER TABLE leads ADD COLUMN papel_manual INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_prospeccao ON leads (prospeccao_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_conta ON leads (conta_id)`);
  d.exec(`CREATE TABLE IF NOT EXISTS abordagens (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    estrategia TEXT NOT NULL DEFAULT '{}',
    email TEXT NOT NULL DEFAULT '{}',
    linkedin TEXT NOT NULL DEFAULT '',
    whatsapp TEXT NOT NULL DEFAULT '',
    variacao TEXT,
    criado_em TEXT NOT NULL
  )`);
  try { d.exec(`ALTER TABLE abordagens ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_abordagens_lead ON abordagens (lead_id)`);
  criado = true;
  return d;
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Constrói "SET col = ?, col2 = ?" a partir de um objeto já em snake_case, ignorando chaves com valor undefined. */
function montarSet(campos: Record<string, SQLInputValue | undefined>): { set: string; valores: SQLInputValue[] } {
  const chaves = Object.keys(campos).filter((c) => campos[c] !== undefined);
  return { set: chaves.map((c) => `${c} = ?`).join(", "), valores: chaves.map((c) => campos[c] as SQLInputValue) };
}

// --- Produtos --------------------------------------------------------------

type LinhaProduto = { id: string; nome: string; descricao: string; site: string | null; proposta_valor: string; demo: number; criado_em: string };

function linhaParaProduto(l: LinhaProduto): Produto {
  return { id: l.id, nome: l.nome, descricao: l.descricao, site: l.site, propostaValor: l.proposta_valor, demo: l.demo === 1, criadoEm: l.criado_em };
}

export function criarProduto(dados: NovoProduto, em?: Date): Produto {
  const id = gerarId();
  const criadoEm = (em ?? new Date()).toISOString();
  const demo = dados.demo ?? false;
  banco().prepare("INSERT INTO produtos (id, nome, descricao, site, proposta_valor, demo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.nome, dados.descricao, dados.site, dados.propostaValor, demo ? 1 : 0, criadoEm);
  return { id, criadoEm, ...dados, demo };
}

/** Só produtos ativos (nunca os apagados) — quem precisa achar o nome de um produto apagado para uma prospecção antiga usa obterProduto, que não filtra. */
export function listarProdutos(): Produto[] {
  const linhas = banco().prepare("SELECT * FROM produtos WHERE apagado_em IS NULL ORDER BY criado_em DESC").all() as LinhaProduto[];
  return linhas.map(linhaParaProduto);
}

export function obterProduto(id: string): Produto | null {
  const linha = banco().prepare("SELECT * FROM produtos WHERE id = ?").get(id) as LinhaProduto | undefined;
  return linha ? linhaParaProduto(linha) : null;
}

export function atualizarProduto(id: string, dados: Partial<NovoProduto>): Produto | null {
  const { set, valores } = montarSet({ nome: dados.nome, descricao: dados.descricao, site: dados.site, proposta_valor: dados.propostaValor });
  if (set) banco().prepare(`UPDATE produtos SET ${set} WHERE id = ?`).run(...valores, id);
  return obterProduto(id);
}

/** Apaga só da lista ativa (nunca em cascata): prospecções e ICPs já criados continuam intactos e resolvem o nome do produto por obterProduto, que ignora apagado_em. */
export function apagarProduto(id: string, em?: Date): void {
  banco().prepare("UPDATE produtos SET apagado_em = ? WHERE id = ?").run((em ?? new Date()).toISOString(), id);
}

// --- ICPs --------------------------------------------------------------

type LinhaICP = { id: string; produto_id: string; nome: string; jornada: string; criterios: string; personas: string; dores: string; sinais: string; demo: number; criado_em: string };

function linhaParaICP(l: LinhaICP): ICP {
  return {
    id: l.id, produtoId: l.produto_id, nome: l.nome, jornada: l.jornada as ICP["jornada"],
    criterios: JSON.parse(l.criterios) as CriteriosICP, personas: JSON.parse(l.personas), dores: JSON.parse(l.dores), sinais: JSON.parse(l.sinais),
    demo: l.demo === 1, criadoEm: l.criado_em,
  };
}

export function criarICP(dados: NovoICP, em?: Date): ICP {
  const id = gerarId();
  const criadoEm = (em ?? new Date()).toISOString();
  const demo = dados.demo ?? false;
  banco().prepare("INSERT INTO icps (id, produto_id, nome, jornada, criterios, personas, dores, sinais, demo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.produtoId, dados.nome, dados.jornada, JSON.stringify(dados.criterios), JSON.stringify(dados.personas), JSON.stringify(dados.dores), JSON.stringify(dados.sinais), demo ? 1 : 0, criadoEm);
  return { id, criadoEm, ...dados, demo };
}

export function listarICPs(produtoId?: string): ICP[] {
  const linhas = (produtoId
    ? banco().prepare("SELECT * FROM icps WHERE produto_id = ? ORDER BY criado_em DESC").all(produtoId)
    : banco().prepare("SELECT * FROM icps ORDER BY criado_em DESC").all()) as LinhaICP[];
  return linhas.map(linhaParaICP);
}

export function obterICP(id: string): ICP | null {
  const linha = banco().prepare("SELECT * FROM icps WHERE id = ?").get(id) as LinhaICP | undefined;
  return linha ? linhaParaICP(linha) : null;
}

export function atualizarICP(id: string, dados: Partial<NovoICP>): ICP | null {
  const { set, valores } = montarSet({
    nome: dados.nome, jornada: dados.jornada,
    criterios: dados.criterios && JSON.stringify(dados.criterios),
    personas: dados.personas && JSON.stringify(dados.personas),
    dores: dados.dores && JSON.stringify(dados.dores),
    sinais: dados.sinais && JSON.stringify(dados.sinais),
  });
  if (set) banco().prepare(`UPDATE icps SET ${set} WHERE id = ?`).run(...valores, id);
  return obterICP(id);
}

export function apagarICP(id: string): void {
  banco().prepare("DELETE FROM icps WHERE id = ?").run(id);
}

// --- Prospecções --------------------------------------------------------------

type LinhaProspeccao = { id: string; produto_id: string; icp_id: string; modo: string; criterios: string; estado: string; etapa: string | null; erro: string | null; demo: number; criado_em: string; concluido_em: string | null };

function linhaParaProspeccao(l: LinhaProspeccao): Prospeccao {
  return {
    id: l.id, produtoId: l.produto_id, icpId: l.icp_id, modo: l.modo as Prospeccao["modo"],
    criterios: JSON.parse(l.criterios), estado: l.estado as Prospeccao["estado"], etapa: l.etapa, erro: l.erro,
    demo: l.demo === 1, criadoEm: l.criado_em, concluidoEm: l.concluido_em,
  };
}

export function criarProspeccao(dados: NovaProspeccao, em?: Date): Prospeccao {
  const id = gerarId();
  const criadoEm = (em ?? new Date()).toISOString();
  const concluidoEm = dados.concluidoEm ?? null;
  const demo = dados.demo ?? false;
  banco().prepare("INSERT INTO prospeccoes (id, produto_id, icp_id, modo, criterios, estado, etapa, erro, demo, criado_em, concluido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.produtoId, dados.icpId, dados.modo, JSON.stringify(dados.criterios), dados.estado, dados.etapa, dados.erro, demo ? 1 : 0, criadoEm, concluidoEm);
  return { id, criadoEm, ...dados, demo, concluidoEm };
}

export function listarProspeccoes(produtoId?: string): Prospeccao[] {
  const linhas = (produtoId
    ? banco().prepare("SELECT * FROM prospeccoes WHERE produto_id = ? ORDER BY criado_em DESC").all(produtoId)
    : banco().prepare("SELECT * FROM prospeccoes ORDER BY criado_em DESC").all()) as LinhaProspeccao[];
  return linhas.map(linhaParaProspeccao);
}

export function obterProspeccao(id: string): Prospeccao | null {
  const linha = banco().prepare("SELECT * FROM prospeccoes WHERE id = ?").get(id) as LinhaProspeccao | undefined;
  return linha ? linhaParaProspeccao(linha) : null;
}

export function atualizarProspeccao(id: string, dados: Partial<NovaProspeccao>): Prospeccao | null {
  const { set, valores } = montarSet({
    modo: dados.modo, criterios: dados.criterios && JSON.stringify(dados.criterios), estado: dados.estado,
    etapa: dados.etapa, erro: dados.erro, concluido_em: dados.concluidoEm,
  });
  if (set) banco().prepare(`UPDATE prospeccoes SET ${set} WHERE id = ?`).run(...valores, id);
  return obterProspeccao(id);
}

export function apagarProspeccao(id: string): void {
  banco().prepare("DELETE FROM abordagens WHERE lead_id IN (SELECT id FROM leads WHERE prospeccao_id = ?)").run(id);
  banco().prepare("DELETE FROM leads WHERE prospeccao_id = ?").run(id);
  banco().prepare("DELETE FROM contas WHERE prospeccao_id = ?").run(id);
  banco().prepare("DELETE FROM prospeccoes WHERE id = ?").run(id);
}

/** Mensagem gravada em prospeccoes.erro por recuperarProspeccoesTravadas (US-013); reaproveitada pelo teste. */
export const MENSAGEM_EXECUCAO_TRAVADA = "A execução não terminou a tempo (mais de 30 minutos). Tente repetir a busca.";

/**
 * Prospecções travadas em "executando" (processo reiniciado no meio do pipeline de lib/execucao-prospeccao.ts)
 * viram "falhou" na inicialização, com o erro pronto para a tela mostrar o botão "Repetir" (US-013). Corte
 * é o limite de BAIXO de uma janela (comparação exclusiva `<`, mesmo padrão de limparExpirados) — não é o
 * gotcha do limite de CIMA (fim de período nunca `new Date()` direto): aqui `new Date(Date.now() -
 * limiteMinutos*60000)` está correto.
 */
export function recuperarProspeccoesTravadas(limiteMinutos = 30): void {
  const corte = new Date(Date.now() - limiteMinutos * 60 * 1000).toISOString();
  banco()
    .prepare("UPDATE prospeccoes SET estado = 'falhou', erro = ? WHERE estado = 'executando' AND criado_em < ?")
    .run(MENSAGEM_EXECUCAO_TRAVADA, corte);
}

// --- Contas (empresas) --------------------------------------------------------------

type LinhaConta = { id: string; prospeccao_id: string; nome: string; site: string | null; setor: string | null; porte: string | null; cidade: string | null; fit: string | null; evidencias: string; sinais: string; resumo: string; demo: number; criado_em: string; atualizado_em: string };

function linhaParaConta(l: LinhaConta): Conta {
  return {
    id: l.id, prospeccaoId: l.prospeccao_id, nome: l.nome, site: l.site, setor: l.setor, porte: l.porte, cidade: l.cidade,
    fit: l.fit as Conta["fit"], evidencias: JSON.parse(l.evidencias) as Evidencia[], sinais: JSON.parse(l.sinais) as SinalProspeccao[],
    resumo: l.resumo, demo: l.demo === 1, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em,
  };
}

export function criarConta(dados: NovaConta, em?: Date): Conta {
  const id = gerarId();
  const agora = (em ?? new Date()).toISOString();
  const demo = dados.demo ?? false;
  banco().prepare("INSERT INTO contas (id, prospeccao_id, nome, site, setor, porte, cidade, fit, evidencias, sinais, resumo, demo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.prospeccaoId, dados.nome, dados.site, dados.setor, dados.porte, dados.cidade, dados.fit, JSON.stringify(dados.evidencias), JSON.stringify(dados.sinais), dados.resumo, demo ? 1 : 0, agora, agora);
  return { id, criadoEm: agora, atualizadoEm: agora, ...dados, demo };
}

export function listarContas(prospeccaoId?: string): Conta[] {
  // ORDER BY criado_em DESC, rowid DESC (não só criado_em): o pipeline (lib/execucao-prospeccao.ts)
  // cria as 3 contas de uma prospecção no mesmo tick, com timestamps que empatam no milissegundo —
  // sem o tiebreak por rowid (ordem real de inserção), o SQLite pode devolver ordens diferentes em
  // execuções diferentes para o mesmo empate, e etapaEncontrarPessoas usa essa ordem para associar
  // pessoa-índice a empresa; ordem instável quebrava a deduplicação de "Repetir prospecção" (US-014).
  const linhas = (prospeccaoId
    ? banco().prepare("SELECT * FROM contas WHERE prospeccao_id = ? ORDER BY criado_em DESC, rowid DESC").all(prospeccaoId)
    : banco().prepare("SELECT * FROM contas ORDER BY criado_em DESC, rowid DESC").all()) as LinhaConta[];
  return linhas.map(linhaParaConta);
}

export function obterConta(id: string): Conta | null {
  const linha = banco().prepare("SELECT * FROM contas WHERE id = ?").get(id) as LinhaConta | undefined;
  return linha ? linhaParaConta(linha) : null;
}

export function atualizarConta(id: string, dados: Partial<NovaConta>, em?: Date): Conta | null {
  const { set, valores } = montarSet({
    nome: dados.nome, site: dados.site, setor: dados.setor, porte: dados.porte, cidade: dados.cidade, fit: dados.fit,
    evidencias: dados.evidencias && JSON.stringify(dados.evidencias), sinais: dados.sinais && JSON.stringify(dados.sinais),
    resumo: dados.resumo, atualizado_em: (em ?? new Date()).toISOString(),
  });
  if (set) banco().prepare(`UPDATE contas SET ${set} WHERE id = ?`).run(...valores, id);
  return obterConta(id);
}

export function apagarConta(id: string): void {
  banco().prepare("DELETE FROM contas WHERE id = ?").run(id);
}

// --- Leads (pessoas) --------------------------------------------------------------

type LinhaLead = {
  id: string; prospeccao_id: string; conta_id: string | null; nome: string; cargo: string | null; empresa: string | null; cidade: string | null;
  linkedin: string | null; fonte: string | null; papel: string; fit: string | null; evidencias: string; sinais: string; hipotese: string | null;
  status: string; no_crm: number; demo: number; papel_manual: number; criado_em: string; atualizado_em: string;
};

function linhaParaLead(l: LinhaLead): LeadProspeccao {
  return {
    id: l.id, prospeccaoId: l.prospeccao_id, contaId: l.conta_id, nome: l.nome, cargo: l.cargo, empresa: l.empresa, cidade: l.cidade,
    linkedin: l.linkedin, fonte: l.fonte, papel: l.papel as LeadProspeccao["papel"], papelManual: l.papel_manual === 1, fit: l.fit as LeadProspeccao["fit"],
    evidencias: JSON.parse(l.evidencias) as Evidencia[], sinais: JSON.parse(l.sinais) as SinalProspeccao[], hipotese: l.hipotese,
    status: l.status as LeadProspeccao["status"], noCRM: l.no_crm === 1, demo: l.demo === 1, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em,
  };
}

export function criarLead(dados: NovoLeadProspeccao, em?: Date): LeadProspeccao {
  const id = gerarId();
  const agora = (em ?? new Date()).toISOString();
  const demo = dados.demo ?? false;
  const papelManual = dados.papelManual ?? false;
  banco().prepare(`INSERT INTO leads (id, prospeccao_id, conta_id, nome, cargo, empresa, cidade, linkedin, fonte, papel, fit, evidencias, sinais, hipotese, status, no_crm, demo, papel_manual, criado_em, atualizado_em)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, dados.prospeccaoId, dados.contaId, dados.nome, dados.cargo, dados.empresa, dados.cidade, dados.linkedin, dados.fonte, dados.papel, dados.fit,
      JSON.stringify(dados.evidencias), JSON.stringify(dados.sinais), dados.hipotese, dados.status, dados.noCRM ? 1 : 0, demo ? 1 : 0, papelManual ? 1 : 0, agora, agora);
  return { id, criadoEm: agora, atualizadoEm: agora, ...dados, demo, papelManual };
}

export function listarLeads(prospeccaoId?: string): LeadProspeccao[] {
  const linhas = (prospeccaoId
    ? banco().prepare("SELECT * FROM leads WHERE prospeccao_id = ? ORDER BY criado_em DESC").all(prospeccaoId)
    : banco().prepare("SELECT * FROM leads ORDER BY criado_em DESC").all()) as LinhaLead[];
  return linhas.map(linhaParaLead);
}

export function obterLead(id: string): LeadProspeccao | null {
  const linha = banco().prepare("SELECT * FROM leads WHERE id = ?").get(id) as LinhaLead | undefined;
  return linha ? linhaParaLead(linha) : null;
}

export function atualizarLead(id: string, dados: Partial<NovoLeadProspeccao>, em?: Date): LeadProspeccao | null {
  const { set, valores } = montarSet({
    conta_id: dados.contaId, nome: dados.nome, cargo: dados.cargo, empresa: dados.empresa, cidade: dados.cidade, linkedin: dados.linkedin,
    fonte: dados.fonte, papel: dados.papel, fit: dados.fit, evidencias: dados.evidencias && JSON.stringify(dados.evidencias),
    sinais: dados.sinais && JSON.stringify(dados.sinais), hipotese: dados.hipotese, status: dados.status,
    no_crm: dados.noCRM === undefined ? undefined : (dados.noCRM ? 1 : 0),
    papel_manual: dados.papelManual === undefined ? undefined : (dados.papelManual ? 1 : 0),
    atualizado_em: (em ?? new Date()).toISOString(),
  });
  if (set) banco().prepare(`UPDATE leads SET ${set} WHERE id = ?`).run(...valores, id);
  return obterLead(id);
}

export function apagarLead(id: string): void {
  banco().prepare("DELETE FROM abordagens WHERE lead_id = ?").run(id);
  banco().prepare("DELETE FROM leads WHERE id = ?").run(id);
}

/** Todo lead já encontrado para o produto (em qualquer prospecção dele), para o pipeline (US-014) reconhecer quem já foi visto ao repetir uma busca. */
export function leadsDoProduto(produtoId: string): LeadProspeccao[] {
  const linhas = banco()
    .prepare("SELECT leads.* FROM leads JOIN prospeccoes ON prospeccoes.id = leads.prospeccao_id WHERE prospeccoes.produto_id = ?")
    .all(produtoId) as LinhaLead[];
  return linhas.map(linhaParaLead);
}

// --- Abordagens --------------------------------------------------------------

type LinhaAbordagem = { id: string; lead_id: string; estrategia: string; email: string; linkedin: string; whatsapp: string; variacao: string | null; demo: number; criado_em: string };

function linhaParaAbordagem(l: LinhaAbordagem): AbordagemRegistro {
  return {
    id: l.id, leadId: l.lead_id, estrategia: JSON.parse(l.estrategia) as EstrategiaAbordagem, email: JSON.parse(l.email),
    linkedin: l.linkedin, whatsapp: l.whatsapp, variacao: l.variacao, demo: l.demo === 1, criadoEm: l.criado_em,
  };
}

export function criarAbordagem(dados: NovaAbordagemRegistro, em?: Date): AbordagemRegistro {
  const id = gerarId();
  const criadoEm = (em ?? new Date()).toISOString();
  const demo = dados.demo ?? false;
  banco().prepare("INSERT INTO abordagens (id, lead_id, estrategia, email, linkedin, whatsapp, variacao, demo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.leadId, JSON.stringify(dados.estrategia), JSON.stringify(dados.email), dados.linkedin, dados.whatsapp, dados.variacao, demo ? 1 : 0, criadoEm);
  return { id, criadoEm, ...dados, demo };
}

export function listarAbordagens(leadId?: string): AbordagemRegistro[] {
  const linhas = (leadId
    ? banco().prepare("SELECT * FROM abordagens WHERE lead_id = ? ORDER BY criado_em DESC").all(leadId)
    : banco().prepare("SELECT * FROM abordagens ORDER BY criado_em DESC").all()) as LinhaAbordagem[];
  return linhas.map(linhaParaAbordagem);
}

export function obterAbordagem(id: string): AbordagemRegistro | null {
  const linha = banco().prepare("SELECT * FROM abordagens WHERE id = ?").get(id) as LinhaAbordagem | undefined;
  return linha ? linhaParaAbordagem(linha) : null;
}

export function atualizarAbordagem(id: string, dados: Partial<NovaAbordagemRegistro>): AbordagemRegistro | null {
  const { set, valores } = montarSet({
    estrategia: dados.estrategia && JSON.stringify(dados.estrategia), email: dados.email && JSON.stringify(dados.email),
    linkedin: dados.linkedin, whatsapp: dados.whatsapp, variacao: dados.variacao,
  });
  if (set) banco().prepare(`UPDATE abordagens SET ${set} WHERE id = ?`).run(...valores, id);
  return obterAbordagem(id);
}

export function apagarAbordagem(id: string): void {
  banco().prepare("DELETE FROM abordagens WHERE id = ?").run(id);
}

// --- Retenção --------------------------------------------------------------

/** Dias sem atualização até uma conta ser apagada, e retenção de lead na jornada B2B (ver README, seção
 * "Retenção de dados"). Mantido com o nome antigo (sem sufixo) porque é o valor que já era o único até a
 * US-021 diferenciar B2C. */
export const DIAS_RETENCAO = 180;
export const DIAS_RETENCAO_B2B = DIAS_RETENCAO;
// Retenção mais curta na jornada B2C (US-021, prd.json > regras: "Retenção 180 dias B2B / 90 dias B2C").
export const DIAS_RETENCAO_B2C = 90;

/** Um lead expira pela retenção da JORNADA da sua prospecção (icps.jornada): 90 dias em B2C, 180 nos
 * demais — inclusive quando o ICP da prospecção já foi apagado (apagarICP é DELETE, não soft delete), já
 * que o LEFT JOIN cai no ramo "não é b2c" (180 dias) nesse caso: nunca apaga cedo demais um lead cuja
 * jornada não dá mais para confirmar. Contas não têm jornada própria (só existem em prospecções B2B —
 * ver deveCriarContas em lib/execucao-prospeccao.ts) e continuam na retenção única de sempre. */
const SUBQUERY_LEADS_EXPIRADOS = `
  SELECT leads.id FROM leads
  LEFT JOIN prospeccoes ON prospeccoes.id = leads.prospeccao_id
  LEFT JOIN icps ON icps.id = prospeccoes.icp_id
  WHERE (icps.jornada = 'b2c' AND leads.atualizado_em < ?)
     OR ((icps.jornada IS NULL OR icps.jornada != 'b2c') AND leads.atualizado_em < ?)
`;

/** Apaga leads (e as abordagens deles) e contas expirados; roda na inicialização (instrumentation.ts), como lib/historico.ts. */
export function limparExpirados(): void {
  const corteB2C = new Date(Date.now() - DIAS_RETENCAO_B2C * 24 * 60 * 60 * 1000).toISOString();
  const corteB2B = new Date(Date.now() - DIAS_RETENCAO_B2B * 24 * 60 * 60 * 1000).toISOString();
  const d = banco();
  d.prepare(`DELETE FROM abordagens WHERE lead_id IN (${SUBQUERY_LEADS_EXPIRADOS})`).run(corteB2C, corteB2B);
  d.prepare(`DELETE FROM leads WHERE id IN (${SUBQUERY_LEADS_EXPIRADOS})`).run(corteB2C, corteB2B);
  d.prepare("DELETE FROM contas WHERE atualizado_em < ?").run(corteB2B);
}
