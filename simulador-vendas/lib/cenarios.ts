// Cenários de cliente simulado (lead frio, pedido de desconto, renovação em risco), escolhidos no
// painel antes de colar a conversa. Usa o mesmo arquivo SQLite de lib/store.ts, em uma tabela própria.
// Os 3 cenários prontos são semeados de forma idempotente (ids fixos + INSERT OR IGNORE) na primeira
// leitura do app: rodar a semeadura várias vezes nunca duplica os cenários.
import type { DatabaseSync } from "node:sqlite";
import { abrirBanco } from "./store";
import crypto from "node:crypto";
import type { Cenario } from "./types";

let db: DatabaseSync | null = null;
let semeado = false;

function abrir(): DatabaseSync {
  if (db) return db;
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS cenarios (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    cenario TEXT NOT NULL,
    criadoEm TEXT NOT NULL
  )`);
  return db = d;
}

type Linha = { id: string; titulo: string; cenario: string; criadoEm: string };

function linhaParaCenario(l: Linha): Cenario {
  return { id: l.id, ...JSON.parse(l.cenario) };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

const CENARIOS_MODELO: Cenario[] = [
  {
    id: "lead-frio",
    titulo: "Lead frio, primeiro contato",
    cliente: {
      nome: "Cláudia Nogueira",
      cargo: "Gerente de Operações",
      empresa: "Fortaleza Logística",
      contexto: "Nunca conversou com sua empresa antes. Recebeu a ligação/mensagem sem agendamento e está no meio de outras tarefas.",
    },
    objetivo: "Despertar interesse suficiente para marcar uma segunda conversa, sem tentar fechar na primeira ligação.",
    objecoes: ["Já uso outro fornecedor e não vejo motivo para trocar.", "Não tenho tempo para essa conversa agora.", "Me manda um material por e-mail que eu leio depois."],
    tom: "Educada mas apressada, cética com o discurso comercial, só relaxa se o vendedor mostrar que entende do problema dela antes de falar do produto.",
  },
  {
    id: "desconto",
    titulo: "Cliente pedindo desconto",
    cliente: {
      nome: "Rodrigo Ferraz",
      cargo: "Diretor Comercial",
      empresa: "Ferraz & Nunes Distribuidora",
      contexto: "Já viu a proposta e gostou da solução, mas comparou com um concorrente mais barato e quer negociar o preço antes de assinar.",
    },
    objetivo: "Conseguir o melhor desconto possível sem abrir mão do prazo de fechamento que já negociou internamente.",
    objecoes: ["O concorrente X cobra 20% menos pelo mesmo pacote.", "Só fecho se vocês baterem esse preço.", "Preciso levar isso para o financeiro aprovar de novo se o valor não mudar."],
    tom: "Direto e um pouco impaciente, testa o quanto o vendedor está disposto a ceder, mas responde bem a argumentos de valor concretos (não só a desconto).",
  },
  {
    id: "renovacao",
    titulo: "Renovação em risco",
    cliente: {
      nome: "Beatriz Salles",
      cargo: "Head de Sucesso do Cliente",
      empresa: "Salles & Martins Contabilidade",
      contexto: "Cliente há 2 anos, mas o uso do produto caiu nos últimos meses e ela está avaliando cancelar na renovação por não ver retorno claro.",
    },
    objetivo: "Entender por que o uso caiu, decidir se vale a pena renovar e, se decidir renovar, negociar um plano de acompanhamento mais próximo.",
    objecoes: ["Não sei se ainda faz sentido pagar por isso.", "Meu time parou de usar porque achou complicado.", "Preciso justificar esse gasto de novo para a diretoria."],
    tom: "Cansada e desconfiada, foi decepcionada antes por promessas que não se sustentaram, só recupera confiança com escuta genuína e um plano concreto.",
  },
];

function semear() {
  if (semeado) return;
  semeado = true;
  const stmt = abrir().prepare("INSERT OR IGNORE INTO cenarios (id, titulo, cenario, criadoEm) VALUES (?, ?, ?, ?)");
  const criadoEm = new Date().toISOString();
  for (const c of CENARIOS_MODELO) {
    const { id, ...resto } = c;
    stmt.run(id, resto.titulo, JSON.stringify(resto), criadoEm);
  }
}

export function criar({ titulo, cliente, objetivo, objecoes, tom }: Omit<Cenario, "id">): Cenario {
  semear();
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  const resto = { titulo, cliente, objetivo, objecoes, tom };
  abrir().prepare("INSERT INTO cenarios (id, titulo, cenario, criadoEm) VALUES (?, ?, ?, ?)").run(id, titulo, JSON.stringify(resto), criadoEm);
  return { id, ...resto };
}

export function listar(limite = 50): Cenario[] {
  semear();
  const linhas = abrir().prepare("SELECT * FROM cenarios ORDER BY criadoEm ASC LIMIT ?").all(limite) as Linha[];
  return linhas.map(linhaParaCenario);
}

export function obter(id: string): Cenario | null {
  semear();
  const linha = abrir().prepare("SELECT * FROM cenarios WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaCenario(linha) : null;
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM cenarios WHERE id = ?").run(id);
}
