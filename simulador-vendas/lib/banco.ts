// Esquema e migração das tabelas de Produto → Simulação → Sessão (US-002).
//
// Por que um arquivo só, em vez do `abrir()` privado que lib/vendedores.ts, lib/cenarios.ts e
// lib/salas.ts cada um tem:
//
//  1. **Uma conexão.** Trinta vendedores no mesmo link significam trinta sessões simultâneas. Cada
//     `new DatabaseSync(...)` é uma conexão a mais disputando o mesmo arquivo; uma conexão só (a de
//     lib/store.ts, via `abrirBanco()`) serializa as escritas dentro do processo e tira o
//     SQLITE_BUSY da mesa. As tabelas antigas continuam com as conexões delas — não é preciso mexer.
//  2. **Cinco tabelas que se referenciam.** Produto ← Simulação ← Sessão → Participante, mais as
//     fontes e as mensagens. Espalhar os `CREATE TABLE` por cinco arquivos faria a ordem de criação
//     depender de qual módulo foi importado primeiro.
//  3. **A migração toca todas elas de uma vez** (salas → simulações, vendedores → participantes,
//     cenários → produto de exemplo) e precisa rodar depois do último `CREATE TABLE`, nunca no meio.
//
// O comportamento de cada entidade continua no módulo dela (lib/produtos.ts, lib/simulacoes.ts,
// lib/participantes.ts, lib/sessoes.ts): aqui só moram o formato e a migração.
import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { abrirBanco } from "./store";
import { PERSONAS_IDS } from "./personas";

let preparado = false;

/**
 * Conexão pronta (tabelas criadas e migração feita) para as tabelas da US-002.
 * Todo módulo novo entra por aqui; nenhum abre o SQLite por conta própria.
 */
export function banco(): DatabaseSync {
  const d = abrirBanco();
  if (preparado) return d;
  preparado = true;
  criarTabelas(d);
  migrar(d);
  return d;
}

/** Id de registro: mesmo gerador do resto do app (lib/historico.ts, lib/vendedores.ts). */
export function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Código de link: mesmo formato base64url de 12 bytes de lib/salas.ts e lib/formularios.ts. */
export function gerarCodigo(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function agora(): string {
  return new Date().toISOString();
}

function tabelaExiste(d: DatabaseSync, nome: string): boolean {
  const linha = d.prepare("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
  return Boolean(linha);
}

function colunaExiste(d: DatabaseSync, tabela: string, coluna: string): boolean {
  const linhas = d.prepare(`SELECT name FROM pragma_table_info('${tabela}')`).all() as { name: string }[];
  return linhas.some((l) => l.name === coluna);
}

/** Acrescenta uma coluna que nasceu depois da tabela. Sem `ADD COLUMN IF NOT EXISTS` em SQLite, a
 * conferência vem antes — e rodar de novo não faz nada, como toda migração daqui. O tipo é parâmetro
 * porque nem toda coluna nova é texto: `exemplo` é um sinalizador com valor padrão, e uma instalação
 * que já rodava precisa nascer com ele preenchido, não nulo. */
function garantirColuna(d: DatabaseSync, tabela: string, coluna: string, definicao = "TEXT NULL"): void {
  if (colunaExiste(d, tabela, coluna)) return;
  d.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

/**
 * Instalação que rodou a versão anterior deste ciclo **sem ninguém ter feito login** ficou com a
 * tabela de treino chamada `sessoes` — o nome que pertence ao login (lib/conta.ts). Renomear é
 * obrigatório antes de criar `sessoes_treino`, senão a instalação nasce com as duas e o treino já
 * gravado (participante, persona, transcrição) some da tela sem aviso.
 *
 * As três conferências são a mesma pergunta por três ângulos, e nenhuma pode sair: só renomeia se
 * `sessoes` existir, se `sessoes_treino` ainda não existir e se a `sessoes` encontrada for mesmo a
 * de treino (tem `simulacaoCodigo`) — a do login nunca pode ser tocada.
 */
function renomearSessoesDeTreino(d: DatabaseSync): void {
  if (!tabelaExiste(d, "sessoes")) return;
  if (tabelaExiste(d, "sessoes_treino")) return;
  if (!colunaExiste(d, "sessoes", "simulacaoCodigo")) return;
  d.exec("ALTER TABLE sessoes RENAME TO sessoes_treino");
}

function criarTabelas(d: DatabaseSync): void {
  // WAL: leitor não bloqueia escritor. Persistente no próprio arquivo, então basta pedir uma vez, de
  // qualquer conexão — vale também para as tabelas antigas, que têm conexões próprias.
  try {
    d.exec("PRAGMA journal_mode = WAL");
  } catch (err) {
    console.error("Não foi possível ligar o modo WAL do banco; seguindo no modo padrão.", err);
  }

  renomearSessoesDeTreino(d);

  d.exec(`CREATE TABLE IF NOT EXISTS produtos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT NULL,
    categoria TEXT NULL,
    conhecimento TEXT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho',
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS fontes_produto (
    id TEXT PRIMARY KEY,
    produtoId TEXT NOT NULL,
    tipo TEXT NOT NULL,
    origem TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    criadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_fontes_produto ON fontes_produto (produtoId)");

  d.exec(`CREATE TABLE IF NOT EXISTS simulacoes (
    codigo TEXT PRIMARY KEY,
    produtoId TEXT NOT NULL,
    nome TEXT NOT NULL,
    objetivo TEXT NULL,
    metodologia TEXT NOT NULL DEFAULT 'consultiva',
    criteriosPersonalizados TEXT NULL,
    dificuldade TEXT NOT NULL DEFAULT 'realista',
    modoPersona TEXT NOT NULL DEFAULT 'aleatoria',
    personas TEXT NOT NULL DEFAULT '[]',
    maxTentativas INTEGER NULL,
    mostrarFeedback INTEGER NOT NULL DEFAULT 1,
    permiteTexto INTEGER NOT NULL DEFAULT 1,
    permiteVoz INTEGER NOT NULL DEFAULT 1,
    duracaoMin INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'ativa',
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_simulacoes_produto ON simulacoes (produtoId)");

  // `email` é UNIQUE mas aceita NULL: em SQLite, vários NULL convivem numa coluna UNIQUE. É o que
  // permite trazer, sem inventar endereço, os vendedores que foram cadastrados só com o nome.
  d.exec(`CREATE TABLE IF NOT EXISTS participantes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NULL UNIQUE,
    origem TEXT NOT NULL DEFAULT 'link',
    equipe TEXT NULL,
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  )`);
  // As três pessoas da demonstração (US-030) são as únicas com `exemplo = 1`: é por esta coluna que
  // elas ganham o chip "Exemplo" na Equipe e saem de cena quando o primeiro dado real aparece.
  garantirColuna(d, "participantes", "exemplo", "INTEGER NOT NULL DEFAULT 0");

  // `sessoes` é da tabela de LOGIN (lib/conta.ts, infraestrutura byte a byte nos 17 apps). O treino
  // usa `sessoes_treino`: as duas moram no mesmo app.sqlite e, com o nome repetido, quem criasse
  // primeiro vencia o `IF NOT EXISTS` da outra — na prática o login sempre, e aí `banco()` inteiro
  // lançava "no such column: simulacaoCodigo" na primeira tela de produto.
  d.exec(`CREATE TABLE IF NOT EXISTS sessoes_treino (
    id TEXT PRIMARY KEY,
    simulacaoCodigo TEXT NOT NULL,
    participanteId TEXT NOT NULL,
    personaId TEXT NOT NULL,
    modo TEXT NOT NULL DEFAULT 'voz-navegador',
    status TEXT NOT NULL DEFAULT 'preparando',
    iniciadaEm TEXT NULL,
    encerradaEm TEXT NULL,
    duracaoSeg INTEGER NULL,
    resultadoId TEXT NULL,
    envioEmail TEXT NULL,
    envioEmailMotivo TEXT NULL,
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  )`);
  // Os índices mantêm o nome antigo de propósito: o ALTER TABLE acima leva os índices existentes
  // junto, e um nome novo aqui criaria um segundo índice igual ao que já veio.
  d.exec("CREATE INDEX IF NOT EXISTS idx_sessoes_simulacao ON sessoes_treino (simulacaoCodigo)");
  d.exec("CREATE INDEX IF NOT EXISTS idx_sessoes_participante ON sessoes_treino (participanteId)");
  // O envio do feedback por e-mail (US-020) nasceu depois da tabela: instalação que já rodava precisa
  // das duas colunas por ALTER TABLE, senão a primeira avaliação lança "no such column: envioEmail".
  garantirColuna(d, "sessoes_treino", "envioEmail");
  garantirColuna(d, "sessoes_treino", "envioEmailMotivo");
  // A conversa de exemplo (US-030) é marcada na sessão, e não deduzida da simulação: o link de
  // exemplo é feito para ser usado, e a conversa que alguém de verdade tem nele é real mesmo estando
  // dentro de um treino de exemplo. Sem esta coluna, a primeira conversa de verdade apagaria a si
  // mesma junto com as seis semeadas.
  garantirColuna(d, "sessoes_treino", "exemplo", "INTEGER NOT NULL DEFAULT 0");

  d.exec(`CREATE TABLE IF NOT EXISTS mensagens_sessao (
    id TEXT PRIMARY KEY,
    sessaoId TEXT NOT NULL,
    papel TEXT NOT NULL,
    texto TEXT NOT NULL,
    segundo INTEGER NULL,
    criadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens_sessao (sessaoId, criadoEm)");
}

// ---------------------------------------------------------------------------------------------
// Migração
// ---------------------------------------------------------------------------------------------

/** Id fixo do produto de exemplo: a migração e lib/demo.ts (US-030) precisam falar do mesmo produto. */
export const PRODUTO_EXEMPLO = "produto-exemplo";


/** Um cenário antigo (lib/cenarios.ts) tal como está gravado: o JSON da coluna `cenario` mais o id. */
type CenarioAntigo = {
  id: string;
  titulo: string;
  cliente?: { nome?: string; cargo?: string; empresa?: string; contexto?: string };
  objetivo?: string;
  objecoes?: string[];
  tom?: string;
};

/** Um cenário que pede mais do vendedor vira uma simulação difícil; o resto fica no meio da régua. */
function dificuldadeDoCenario(c: CenarioAntigo): "facil" | "realista" | "dificil" {
  return (c.objecoes?.length ?? 0) >= 3 ? "dificil" : "realista";
}

/**
 * Migração das tabelas antigas, idempotente e sem nenhum DROP TABLE (regra da suíte: dado de banco
 * existente nunca é apagado). Roda uma vez por processo, na primeira vez que `banco()` é chamado.
 *
 * O que ela faz:
 *  - garante o produto de exemplo, para as simulações migradas terem a que pertencer;
 *  - converte cada cenário antigo em uma simulação de exemplo (D3: "cenário" deixa de ser conceito);
 *  - converte cada vendedor em participante (origem "cadastro"), mantendo o mesmo id;
 *  - converte cada sala em simulação **preservando o código**, para os links já enviados continuarem
 *    abrindo; sala cujo `expiraEm` já passou nasce `encerrada`, as demais `ativas` (US-011: link de
 *    simulação não expira).
 *
 * Toda inserção é `INSERT OR IGNORE` com id/código já conhecido, então rodar de novo nunca duplica.
 */
function migrar(d: DatabaseSync): void {
  try {
    d.exec("BEGIN");
    garantirProdutoExemplo(d);
    migrarCenarios(d);
    migrarVendedores(d);
    migrarSalas(d);
    d.exec("COMMIT");
  } catch (err) {
    try {
      d.exec("ROLLBACK");
    } catch {
      // nada em curso para desfazer
    }
    // O app precisa subir mesmo se a migração falhar: sem ela as telas novas ficam vazias, com ela
    // quebrando o app inteiro ninguém consegue nem entrar para investigar.
    console.error("Falha ao migrar salas/vendedores/cenários para o modelo de Produto → Simulação → Sessão.", err);
  }
}

/** Quantas linhas uma tabela antiga ainda tem para migrar; tabela que não existe conta como zero. */
function linhasDe(d: DatabaseSync, tabela: string): number {
  if (!tabelaExiste(d, tabela)) return 0;
  return Number((d.prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get() as { total: number }).total);
}

/**
 * Garante o produto de exemplo, que é a casa das simulações migradas e da demonstração (US-030).
 *
 * Ele **não volta à vida** numa instalação que já tem produto de verdade e nada a migrar: desde a
 * US-030 o primeiro produto de verdade apaga o de exemplo (`lib/exemplos.ts`), e recriá-lo na subida
 * seguinte desfaria essa remoção a cada reinício do servidor.
 */
function garantirProdutoExemplo(d: DatabaseSync): void {
  const temReal = Number((d.prepare("SELECT COUNT(*) AS total FROM produtos WHERE exemplo = 0").get() as { total: number }).total) > 0;
  if (temReal && linhasDe(d, "cenarios") === 0 && linhasDe(d, "salas") === 0) return;

  const momento = agora();
  d.prepare(
    `INSERT OR IGNORE INTO produtos (id, nome, descricao, categoria, conhecimento, status, exemplo, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, NULL, 'rascunho', 1, ?, ?)`,
  ).run(
    PRODUTO_EXEMPLO,
    "Produto de demonstração",
    "Uma plataforma de gestão vendida para empresas de médio porte, usada aqui só para você ver o app funcionando.",
    "Software",
    momento,
    momento,
  );
}

function migrarCenarios(d: DatabaseSync): void {
  if (!tabelaExiste(d, "cenarios")) return;
  const linhas = d.prepare("SELECT id, titulo, cenario, criadoEm FROM cenarios").all() as {
    id: string;
    titulo: string;
    cenario: string;
    criadoEm: string;
  }[];

  const inserir = d.prepare(
    `INSERT OR IGNORE INTO simulacoes
       (codigo, produtoId, nome, objetivo, metodologia, criteriosPersonalizados, dificuldade, modoPersona,
        personas, maxTentativas, mostrarFeedback, permiteTexto, permiteVoz, duracaoMin, status, exemplo, criadoEm)
     VALUES (?, ?, ?, ?, 'consultiva', NULL, ?, 'aleatoria', ?, 3, 1, 1, 1, 10, 'ativa', 1, ?)`,
  );

  for (const linha of linhas) {
    let cenario: CenarioAntigo;
    try {
      cenario = { id: linha.id, ...(JSON.parse(linha.cenario) as Omit<CenarioAntigo, "id">) };
    } catch {
      continue; // linha corrompida: melhor pular uma simulação de exemplo do que travar a migração
    }
    // O código da simulação de exemplo é derivado do id do cenário, não sorteado: rodar a migração de
    // novo tem que cair na mesma linha e ser ignorada, nunca criar uma segunda simulação igual.
    inserir.run(
      `exemplo-${cenario.id}`,
      PRODUTO_EXEMPLO,
      cenario.titulo || "Treino de exemplo",
      cenario.objetivo ?? null,
      dificuldadeDoCenario(cenario),
      JSON.stringify(PERSONAS_IDS),
      linha.criadoEm || agora(),
    );
  }
}

function migrarVendedores(d: DatabaseSync): void {
  if (!tabelaExiste(d, "vendedores")) return;
  const linhas = d.prepare("SELECT id, nome, email, equipe, criadoEm FROM vendedores").all() as {
    id: string;
    nome: string;
    email: string | null;
    equipe: string | null;
    criadoEm: string;
  }[];

  const inserir = d.prepare(
    "INSERT OR IGNORE INTO participantes (id, nome, email, origem, equipe, criadoEm) VALUES (?, ?, ?, 'cadastro', ?, ?)",
  );
  for (const l of linhas) {
    // Mesmo id do vendedor: `Conversa.vendedorId` já gravado no histórico continua apontando para a
    // pessoa certa depois da migração.
    inserir.run(l.id, l.nome, l.email ? l.email.trim().toLowerCase() : null, l.equipe, l.criadoEm || agora());
  }
}

function migrarSalas(d: DatabaseSync): void {
  if (!tabelaExiste(d, "salas")) return;
  const linhas = d.prepare("SELECT codigo, cenarioId, expiraEm, criadoEm FROM salas").all() as {
    codigo: string;
    cenarioId: string | null;
    expiraEm: string | null;
    criadoEm: string;
  }[];

  if (!linhas.length) return;

  const inserir = d.prepare(
    `INSERT OR IGNORE INTO simulacoes
       (codigo, produtoId, nome, objetivo, metodologia, criteriosPersonalizados, dificuldade, modoPersona,
        personas, maxTentativas, mostrarFeedback, permiteTexto, permiteVoz, duracaoMin, status, exemplo, criadoEm)
     VALUES (?, ?, ?, NULL, 'consultiva', NULL, 'realista', 'aleatoria', ?, 3, 1, 1, 1, 10, ?, 0, ?)`,
  );
  // O `prepare` tem que ficar DEPOIS da checagem da tabela: em SQLite, preparar uma consulta sobre
  // tabela inexistente já lança. Numa instalação nova a tabela `salas` existe (instrumentation.ts a
  // cria ao limpar os links vencidos) mas `cenarios` só nasce na primeira leitura de lib/cenarios.ts —
  // preparar às cegas derrubava a migração inteira, inclusive o produto de exemplo.
  const nomeDoCenario = tabelaExiste(d, "cenarios") ? d.prepare("SELECT titulo FROM cenarios WHERE id = ?") : null;

  for (const l of linhas) {
    let nome = "Treino de vendas";
    if (l.cenarioId && nomeDoCenario) {
      const c = nomeDoCenario.get(l.cenarioId) as { titulo: string } | undefined;
      if (c?.titulo) nome = c.titulo;
    }
    // A sala expirava em 30 dias; a simulação não expira. Uma sala cujo prazo já passou não deve
    // voltar à vida: nasce encerrada, e o link mostra a tela amigável em vez de abrir o treino.
    const expirada = l.expiraEm ? new Date(l.expiraEm).getTime() < Date.now() : false;
    inserir.run(l.codigo, PRODUTO_EXEMPLO, nome, JSON.stringify(PERSONAS_IDS), expirada ? "encerrada" : "ativa", l.criadoEm || agora());
  }
}
