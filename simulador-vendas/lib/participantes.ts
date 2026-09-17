// Participante: quem treina. Não é usuário do app — o vendedor nunca cria conta nem tem senha (P3 do
// PRD). Ele se identifica ao abrir o link (por Google/Microsoft ou digitando nome e e-mail, US-013) e
// é o e-mail, normalizado, que diz se já é alguém conhecido.
//
// Substitui lib/vendedores.ts, que virou uma casca fina por cima desta tabela para as telas e rotas
// antigas continuarem funcionando sem alteração (ver o cabeçalho de lá).
import { agora, banco, gerarId } from "./banco";

export type OrigemParticipante = "link" | "cadastro" | "google" | "microsoft";

export type Participante = {
  id: string;
  nome: string;
  email?: string;
  origem: OrigemParticipante;
  /** Herdado de `vendedores.equipe` na migração; nada escreve neste campo hoje. */
  equipe?: string;
  criadoEm: string;
};

type Linha = { id: string; nome: string; email: string | null; origem: string; equipe: string | null; criadoEm: string };

function linhaParaParticipante(l: Linha): Participante {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email ?? undefined,
    origem: (["link", "cadastro", "google", "microsoft"].includes(l.origem) ? l.origem : "link") as OrigemParticipante,
    equipe: l.equipe ?? undefined,
    criadoEm: l.criadoEm,
  };
}

/** Um e-mail é a mesma pessoa escrito de qualquer jeito: espaços fora, tudo em minúsculas. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Devolve o participante daquele e-mail, criando-o se for a primeira vez.
 *
 * O nome só é atualizado quando o que está salvo está vazio: quem foi cadastrado pelo gestor como
 * "Ana Souza" não vira "ana" porque digitou o nome com pressa ao abrir o link.
 */
export function garantir({ nome, email, origem = "link" }: { nome: string; email: string; origem?: OrigemParticipante }): Participante {
  const d = banco();
  const emailNormalizado = normalizarEmail(email);
  const nomeLimpo = nome.trim();

  const existente = d.prepare("SELECT * FROM participantes WHERE email = ?").get(emailNormalizado) as Linha | undefined;
  if (existente) {
    if (!existente.nome.trim() && nomeLimpo) {
      d.prepare("UPDATE participantes SET nome = ? WHERE id = ?").run(nomeLimpo, existente.id);
      return linhaParaParticipante({ ...existente, nome: nomeLimpo });
    }
    return linhaParaParticipante(existente);
  }

  const id = gerarId();
  const criadoEm = agora();
  d.prepare("INSERT INTO participantes (id, nome, email, origem, equipe, criadoEm) VALUES (?, ?, ?, ?, NULL, ?)").run(
    id,
    nomeLimpo,
    emailNormalizado,
    origem,
    criadoEm,
  );
  return { id, nome: nomeLimpo, email: emailNormalizado, origem, criadoEm };
}

/** Cadastro feito pelo gestor, onde o e-mail é opcional (a pessoa ainda não treinou). */
export function criar({ nome, email, origem = "cadastro", equipe }: { nome: string; email?: string; origem?: OrigemParticipante; equipe?: string }): Participante {
  if (email?.trim()) {
    const p = garantir({ nome, email, origem });
    if (equipe?.trim()) {
      banco().prepare("UPDATE participantes SET equipe = ? WHERE id = ?").run(equipe.trim(), p.id);
      return { ...p, equipe: equipe.trim() };
    }
    return p;
  }
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare("INSERT INTO participantes (id, nome, email, origem, equipe, criadoEm) VALUES (?, ?, NULL, ?, ?, ?)")
    .run(id, nome.trim(), origem, equipe?.trim() || null, criadoEm);
  return { id, nome: nome.trim(), origem, equipe: equipe?.trim() || undefined, criadoEm };
}

export function listar(limite = 500): Participante[] {
  const linhas = banco().prepare("SELECT * FROM participantes ORDER BY nome ASC LIMIT ?").all(limite) as Linha[];
  return linhas.map(linhaParaParticipante);
}

export function obter(id: string): Participante | null {
  const linha = banco().prepare("SELECT * FROM participantes WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaParticipante(linha) : null;
}

export function obterPorEmail(email: string): Participante | null {
  const linha = banco().prepare("SELECT * FROM participantes WHERE email = ?").get(normalizarEmail(email)) as Linha | undefined;
  return linha ? linhaParaParticipante(linha) : null;
}

/** As sessões da pessoa ficam (anônimas); quem cuida disso é a rota, que avisa o gestor antes (US-026). */
export function apagar(id: string): void {
  banco().prepare("DELETE FROM participantes WHERE id = ?").run(id);
}
