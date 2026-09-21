// Esquema e migração das tabelas de Vaga → Candidato → Entrevista (US-002).
//
// Por que um arquivo só, em vez de um `abrir()` privado em cada módulo (como lib/historico.ts e
// lib/formularios.ts, que são infraestrutura e não mudam):
//
//  1. **Uma conexão.** Dez candidatos no mesmo processo seletivo conversam ao mesmo tempo. Cada
//     `new DatabaseSync(...)` é mais uma conexão disputando o mesmo arquivo; uma conexão só (a de
//     lib/store.ts, via `abrirBanco()`) serializa as escritas dentro do processo e tira o
//     SQLITE_BUSY da mesa.
//  2. **Cinco tabelas que se referenciam.** Vaga ← Entrevista → Candidato, mais as fontes do
//     candidato e as falas da entrevista. Espalhar os `CREATE TABLE` por três arquivos faria a ordem
//     de criação depender de qual módulo foi importado primeiro.
//  3. **A migração toca todas elas de uma vez** (os scorecards antigos viram vaga + candidato +
//     entrevista) e precisa rodar depois do último `CREATE TABLE`, nunca no meio.
//
// O comportamento de cada entidade continua no módulo dela (lib/vagas.ts, lib/candidatos.ts,
// lib/entrevistas.ts): aqui só moram o formato e a migração.
import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { abrirBanco, getConfig, setConfig } from "./store";

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

/** Id de registro: mesmo gerador do resto do app (lib/historico.ts). */
export function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function agora(): string {
  return new Date().toISOString();
}

function tabelaExiste(d: DatabaseSync, nome: string): boolean {
  return Boolean(d.prepare("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));
}

function colunaExiste(d: DatabaseSync, tabela: string, coluna: string): boolean {
  const linhas = d.prepare(`SELECT name FROM pragma_table_info('${tabela}')`).all() as { name: string }[];
  return linhas.some((l) => l.name === coluna);
}

/** Acrescenta uma coluna que nasceu depois da tabela. Sem `ADD COLUMN IF NOT EXISTS` em SQLite, a
 * conferência vem antes — e rodar de novo não faz nada, como toda migração daqui. */
export function garantirColuna(d: DatabaseSync, tabela: string, coluna: string, definicao = "TEXT NULL"): void {
  if (colunaExiste(d, tabela, coluna)) return;
  d.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

function criarTabelas(d: DatabaseSync): void {
  // WAL: leitor não bloqueia escritor. Persistente no próprio arquivo, então basta pedir uma vez, de
  // qualquer conexão — vale também para lib/historico.ts e lib/formularios.ts, que têm conexões próprias.
  try {
    d.exec("PRAGMA journal_mode = WAL");
  } catch (err) {
    console.error("Não foi possível ligar o modo WAL do banco; seguindo no modo padrão.", err);
  }

  // `requisitos` é texto com um requisito por linha (o mesmo formato que o formulário já usava desde a
  // fundação), e não uma tabela filha: o gestor edita isso como um bloco de texto, nunca item a item.
  d.exec(`CREATE TABLE IF NOT EXISTS vagas (
    id TEXT PRIMARY KEY,
    cargo TEXT NOT NULL,
    area TEXT NULL,
    senioridade TEXT NULL,
    modelo TEXT NULL,
    local TEXT NULL,
    salarioMin INTEGER NULL,
    salarioMax INTEGER NULL,
    salarioACombinar INTEGER NOT NULL DEFAULT 0,
    desafios TEXT NULL,
    requisitos TEXT NOT NULL DEFAULT '',
    competenciasCulturais TEXT NOT NULL DEFAULT '[]',
    tom TEXT NOT NULL DEFAULT 'acolhedor',
    numeroPerguntas INTEGER NOT NULL DEFAULT 8,
    duracaoMin INTEGER NOT NULL DEFAULT 15,
    perguntaPretensao INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'aberta',
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas (status, criadoEm)");

  // `cvArquivo` é o único BLOB do app (o currículo original, até 5 MB, para o gestor reabrir) e por
  // isso nunca entra num `SELECT *` de lista — ver `COLUNAS_CANDIDATO` em lib/candidatos.ts.
  d.exec(`CREATE TABLE IF NOT EXISTS candidatos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NULL,
    telefone TEXT NULL,
    cidade TEXT NULL,
    linkedinUrl TEXT NULL,
    termoBusca TEXT NULL,
    ficha TEXT NULL,
    cvNome TEXT NULL,
    cvTipo TEXT NULL,
    cvTexto TEXT NULL,
    cvArquivo BLOB NULL,
    pesquisaStatus TEXT NOT NULL DEFAULT 'nao_pedida',
    pesquisaEm TEXT NULL,
    identidadeConfirmada INTEGER NOT NULL DEFAULT 0,
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_candidatos_nome ON candidatos (nome)");

  d.exec(`CREATE TABLE IF NOT EXISTS fontes_candidato (
    id TEXT PRIMARY KEY,
    candidatoId TEXT NOT NULL,
    tipo TEXT NOT NULL,
    url TEXT NULL,
    titulo TEXT NULL,
    resumo TEXT NULL,
    conteudo TEXT NOT NULL DEFAULT '',
    coletadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_fontes_candidato ON fontes_candidato (candidatoId, coletadoEm)");

  // `codigo` nasce nulo: ele é o token do link de lib/formularios.ts e só existe quando o convite é
  // enviado (US-013). UNIQUE com NULL convive em SQLite — vários nulos não colidem.
  d.exec(`CREATE TABLE IF NOT EXISTS entrevistas (
    id TEXT PRIMARY KEY,
    vagaId TEXT NOT NULL,
    candidatoId TEXT NOT NULL,
    codigo TEXT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'convidada',
    nivelVoz TEXT NULL,
    convidadaEm TEXT NULL,
    abertaEm TEXT NULL,
    iniciadaEm TEXT NULL,
    concluidaEm TEXT NULL,
    expiraEm TEXT NULL,
    resultadoId TEXT NULL,
    decisao TEXT NULL,
    decisaoEm TEXT NULL,
    roteiro TEXT NULL,
    parecerStatus TEXT NOT NULL DEFAULT 'nao_pedido',
    exemplo INTEGER NOT NULL DEFAULT 0,
    criadoEm TEXT NOT NULL
  )`);
  // `roteiro` nasceu depois da tabela (US-015): o plano da conversa em JSON, escrito na abertura da
  // sala. Um banco criado antes desta versão ganha a coluna aqui, sem perder nada do que já tem.
  garantirColuna(d, "entrevistas", "roteiro");
  garantirColuna(d, "entrevistas", "tentativa", "INTEGER NOT NULL DEFAULT 1");
  garantirColuna(d, "entrevistas", "iniciaEm");
  // `parecerStatus` nasceu na US-021: em que pé está o preparo do parecer de uma entrevista já
  // concluída. É o que separa "o parecer está sendo preparado" de "ele não saiu, peça de novo" e de
  // "a conversa foi curta demais para avaliar" — três esperas diferentes para quem acompanha.
  garantirColuna(d, "entrevistas", "parecerStatus", "TEXT NOT NULL DEFAULT 'nao_pedido'");
  d.exec("CREATE INDEX IF NOT EXISTS idx_entrevistas_vaga ON entrevistas (vagaId, criadoEm)");
  d.exec("CREATE INDEX IF NOT EXISTS idx_entrevistas_candidato ON entrevistas (candidatoId, criadoEm)");
  // "Uma entrevista por par enquanto ela vale": o índice parcial é quem garante isso no banco, e não
  // só a checagem de `criar()`. Uma entrevista cancelada ou expirada sai do índice, e é justamente
  // o que permite convidar a mesma pessoa de novo para a mesma vaga depois de um cancelamento.
  d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_entrevistas_par_viva
          ON entrevistas (vagaId, candidatoId) WHERE status NOT IN ('cancelada', 'expirada')`);

  d.exec(`CREATE TABLE IF NOT EXISTS mensagens_entrevista (
    id TEXT PRIMARY KEY,
    entrevistaId TEXT NOT NULL,
    papel TEXT NOT NULL,
    texto TEXT NOT NULL,
    segundo INTEGER NULL,
    criadoEm TEXT NOT NULL
  )`);
  d.exec("CREATE INDEX IF NOT EXISTS idx_mensagens_entrevista ON mensagens_entrevista (entrevistaId, criadoEm)");
  // `passo` nasceu na 0.8.0: o que a entrevistadora DECIDIU naquela fala ("pergunta:3", "followup",
  // "continuar"...), gravado por lib/roteiro.ts. Desde que o modelo passou a interpretar a resposta,
  // repassar a transcrição só pelas regras não devolveria o mesmo caminho; com o passo gravado, devolve.
  // Falas antigas (NULL) continuam sendo lidas pelas regras.
  garantirColuna(d, "mensagens_entrevista", "passo");
  // `memoria` (0.8.0): as anotações da entrevistadora por pergunta, em JSON — a memória de trabalho da
  // conversa (lib/roteiro.ts). Zerada quando o gestor reabre a entrevista.
  garantirColuna(d, "entrevistas", "memoria");
}

// ---------------------------------------------------------------------------------------------
// Migração dos scorecards antigos
// ---------------------------------------------------------------------------------------------

/** Marca em `config` de que a migração já rodou nesta instalação (Technical Considerations do PRD). */
const CHAVE_MIGRACAO = "MIGRACAO_ENTREVISTAS_V1";

/** Os tipos de registro em lib/historico.ts que são uma entrevista de um candidato. "ranking" fica de
 * fora: ele compara candidatos que já viraram entrevista, não é uma entrevista a mais. */
const TIPOS_ANTIGOS = ["entrevista", "scorecard"];

type VagaAntiga = { titulo?: string; requisitos?: string; candidato?: string; tom?: string; numero_perguntas?: number };
type TrocaAntiga = { papel?: string; texto?: string };

/** Chave estável de agrupamento: sem acento, sem pontuação, sem caixa e sem espaço repetido. É o que
 * faz "Analista de CS" digitado cinco vezes virar uma vaga só. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Id derivado (nunca sorteado) do texto que identifica a coisa: rodar a migração de novo cai na
 * mesma linha e o `INSERT OR IGNORE` a ignora, em qualquer processo. */
function idDerivado(prefixo: string, chave: string): string {
  return `${prefixo}-${crypto.createHash("sha256").update(chave).digest("base64url").slice(0, 12)}`;
}

/**
 * Migração dos scorecards já salvos, idempotente e sem nenhum DROP (regra da suíte: dado de banco
 * existente nunca é apagado nem alterado). Roda uma vez por instalação, na primeira vez que `banco()`
 * é chamado, e a marca em `config` evita varrer `resultados` a cada subida do servidor.
 *
 * Cada scorecard antigo (`entrada = { vaga, historico }`) vira:
 *  - uma **vaga** por título normalizado, `encerrada` (o processo antigo acabou), com os requisitos
 *    copiados e o resto vazio — os campos novos (salário, desafios, cultura) não existiam;
 *  - um **candidato** por nome normalizado, só com o nome;
 *  - uma **entrevista** `avaliada` apontando para o registro antigo em `resultadoId`, com a
 *    transcrição copiada para `mensagens_entrevista`.
 *
 * `/r/<id>` continua abrindo o registro antigo do mesmo jeito: nada em `resultados` é tocado.
 */
function migrar(d: DatabaseSync): void {
  if (getConfig(CHAVE_MIGRACAO)) return;
  // `resultados` (lib/historico.ts) mora no mesmo app.sqlite mas tem conexão própria, e numa
  // instalação nova ela pode ainda não existir. `prepare` sobre tabela inexistente lança na hora, por
  // isso a conferência vem antes — e a marca é gravada mesmo assim: não há o que migrar.
  if (!tabelaExiste(d, "resultados")) {
    setConfig(CHAVE_MIGRACAO, agora());
    return;
  }

  try {
    const marcadores = TIPOS_ANTIGOS.map(() => "?").join(", ");
    const linhas = d
      .prepare(`SELECT id, entrada, criadoEm FROM resultados WHERE tipo IN (${marcadores}) ORDER BY criadoEm ASC`)
      .all(...TIPOS_ANTIGOS) as { id: string; entrada: string; criadoEm: string }[];

    d.exec("BEGIN");
    try {
      for (const linha of linhas) migrarScorecard(d, linha);
      d.exec("COMMIT");
    } catch (err) {
      d.exec("ROLLBACK");
      throw err;
    }
    setConfig(CHAVE_MIGRACAO, agora());
  } catch (err) {
    // O app precisa subir mesmo se a migração falhar: sem ela as telas novas começam vazias, com ela
    // derrubando o app ninguém consegue nem entrar para investigar. Sem a marca, tenta de novo na
    // próxima subida.
    console.error("Falha ao migrar os scorecards antigos para o modelo de Vaga → Candidato → Entrevista.", err);
  }
}

function migrarScorecard(d: DatabaseSync, linha: { id: string; entrada: string; criadoEm: string }): void {
  let vaga: VagaAntiga;
  let historico: TrocaAntiga[] = [];
  try {
    const entrada = JSON.parse(linha.entrada) as { vaga?: VagaAntiga; historico?: TrocaAntiga[] };
    vaga = entrada.vaga ?? {};
    if (Array.isArray(entrada.historico)) historico = entrada.historico;
  } catch {
    return; // registro em outro formato: pular um scorecard é melhor que travar a migração inteira
  }

  const cargo = (vaga.titulo || "").trim();
  const nome = (vaga.candidato || "").trim();
  if (!cargo || !nome) return; // sem vaga ou sem pessoa não há o que montar

  const momento = linha.criadoEm || agora();
  const vagaId = idDerivado("vaga-migrada", normalizar(cargo));
  const candidatoId = idDerivado("candidato-migrado", normalizar(nome));
  const entrevistaId = idDerivado("entrevista-migrada", linha.id);

  d.prepare(
    `INSERT OR IGNORE INTO vagas (id, cargo, requisitos, tom, numeroPerguntas, status, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, 'encerrada', ?, ?)`,
  ).run(
    vagaId,
    cargo,
    (vaga.requisitos || "").trim(),
    vaga.tom === "objetivo" ? "objetivo" : "acolhedor",
    Math.min(12, Math.max(6, Number(vaga.numero_perguntas) || 8)),
    momento,
    momento,
  );

  d.prepare("INSERT OR IGNORE INTO candidatos (id, nome, criadoEm, atualizadoEm) VALUES (?, ?, ?, ?)").run(
    candidatoId,
    nome,
    momento,
    momento,
  );

  // Duas entrevistas do mesmo par (a mesma pessoa avaliada duas vezes na mesma vaga) existem no
  // histórico antigo e são legítimas. O índice parcial só admite uma viva por par, então a segunda em
  // diante fica sem linha — o `OR IGNORE` absorve isso em silêncio, e o scorecard dela continua
  // inteiro em `resultados`, abrível por /r/<id>.
  const { changes } = d
    .prepare(
      `INSERT OR IGNORE INTO entrevistas (id, vagaId, candidatoId, status, concluidaEm, resultadoId, criadoEm)
       VALUES (?, ?, ?, 'avaliada', ?, ?, ?)`,
    )
    .run(entrevistaId, vagaId, candidatoId, momento, linha.id, momento);
  if (Number(changes) === 0) return;

  const inserirMensagem = d.prepare(
    "INSERT OR IGNORE INTO mensagens_entrevista (id, entrevistaId, papel, texto, criadoEm) VALUES (?, ?, ?, ?, ?)",
  );
  historico.forEach((troca, i) => {
    if (!troca?.texto) return;
    const papel = troca.papel === "candidato" ? "candidato" : "entrevistadora";
    inserirMensagem.run(`${entrevistaId}-${i}`, entrevistaId, papel, troca.texto, momento);
  });
}
