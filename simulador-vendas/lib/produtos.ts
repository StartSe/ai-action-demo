// Produto: a biblioteca reutilizável do que a empresa vende (US-002/US-003). O gestor cadastra uma
// vez e cria quantas simulações quiser em cima do mesmo material — é o que evita recarregar
// apresentação comercial a cada treino.
//
// `conhecimento` é a ficha estruturada gerada pela IA a partir das fontes (US-006) e é a **única**
// coisa sobre o produto que entra no prompt do cliente simulado e do avaliador (D12 do PRD: sem RAG
// no MVP). As fontes brutas (`fontes_produto`) ficam guardadas só para gerar a ficha de novo.
import { agora, banco, gerarId } from "./banco";

export type StatusProduto = "rascunho" | "pronto";
export type TipoFonte = "landing" | "documento" | "texto";

/** A ficha do produto (US-006). Listas vazias são a resposta correta para o que não está no material. */
export type ConhecimentoProduto = {
  resumo: string;
  publico: string;
  beneficios: string[];
  diferenciais: string[];
  objecoes: string[];
  precoFaixa?: string;
  concorrentes: string[];
};

export type Produto = {
  id: string;
  nome: string;
  descricao?: string;
  categoria?: string;
  conhecimento?: ConhecimentoProduto;
  status: StatusProduto;
  exemplo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type FonteProduto = {
  id: string;
  produtoId: string;
  tipo: TipoFonte;
  /** O endereço da página, o nome do arquivo enviado ou "Texto colado". */
  origem: string;
  conteudo: string;
  criadoEm: string;
};

type LinhaProduto = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  conhecimento: string | null;
  status: string;
  exemplo: number;
  criadoEm: string;
  atualizadoEm: string;
};

type LinhaFonte = { id: string; produtoId: string; tipo: string; origem: string; conteudo: string; criadoEm: string };

/** Uma ficha gravada com um formato antigo nunca derruba a tela: vira "sem ficha" e é gerada de novo. */
function lerConhecimento(valor: string | null): ConhecimentoProduto | undefined {
  if (!valor) return undefined;
  try {
    return JSON.parse(valor) as ConhecimentoProduto;
  } catch (err) {
    console.error("Ficha de produto ilegível no banco; tratando como ausente.", err);
    return undefined;
  }
}

function linhaParaProduto(l: LinhaProduto): Produto {
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao ?? undefined,
    categoria: l.categoria ?? undefined,
    conhecimento: lerConhecimento(l.conhecimento),
    status: l.status === "pronto" ? "pronto" : "rascunho",
    exemplo: l.exemplo === 1,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
  };
}

function linhaParaFonte(l: LinhaFonte): FonteProduto {
  return { ...l, tipo: l.tipo as TipoFonte };
}

export function criar({
  nome,
  descricao,
  categoria,
  exemplo = false,
}: {
  nome: string;
  descricao?: string;
  categoria?: string;
  exemplo?: boolean;
}): Produto {
  const id = gerarId();
  const momento = agora();
  banco()
    .prepare(
      `INSERT INTO produtos (id, nome, descricao, categoria, conhecimento, status, exemplo, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, NULL, 'rascunho', ?, ?, ?)`,
    )
    .run(id, nome.trim(), descricao?.trim() || null, categoria?.trim() || null, exemplo ? 1 : 0, momento, momento);
  return { id, nome: nome.trim(), descricao, categoria, status: "rascunho", exemplo, criadoEm: momento, atualizadoEm: momento };
}

/**
 * A biblioteca do gestor: produtos reais primeiro, exemplo por último.
 *
 * O produto de exemplo **some da lista assim que existe um produto real** (P2 do PRD: dado de exemplo
 * sai de cena quando o primeiro dado real do mesmo tipo aparece). Ele é escondido, não apagado: as
 * simulações migradas das salas antigas apontam para ele, e apagá-lo deixaria um link que o gestor já
 * mandou para o time sem produto nenhum. `todos: true` devolve a lista inteira para quem precisa
 * resolver o nome de um produto a partir de uma simulação.
 */
export function listar(limite = 100): Produto[] {
  const todos = listarTodos(limite);
  const temReal = todos.some((p) => !p.exemplo);
  return temReal ? todos.filter((p) => !p.exemplo) : todos;
}

/** Inclui os de exemplo mesmo quando já existe produto real. */
export function listarTodos(limite = 100): Produto[] {
  const linhas = banco()
    .prepare("SELECT * FROM produtos ORDER BY exemplo ASC, criadoEm DESC LIMIT ?")
    .all(limite) as LinhaProduto[];
  return linhas.map(linhaParaProduto);
}

export function obter(id: string): Produto | null {
  const linha = banco().prepare("SELECT * FROM produtos WHERE id = ?").get(id) as LinhaProduto | undefined;
  return linha ? linhaParaProduto(linha) : null;
}

/** Atualiza só os campos passados; `conhecimento: null` limpa a ficha (ex.: ao remover um material). */
export function atualizar(
  id: string,
  campos: Partial<Pick<Produto, "nome" | "descricao" | "categoria" | "status">> & { conhecimento?: ConhecimentoProduto | null },
): Produto | null {
  const atual = obter(id);
  if (!atual) return null;

  const partes: string[] = [];
  const valores: (string | number | null)[] = [];
  const definir = (coluna: string, valor: string | number | null) => {
    partes.push(`${coluna} = ?`);
    valores.push(valor);
  };

  if (campos.nome !== undefined) definir("nome", campos.nome.trim());
  if (campos.descricao !== undefined) definir("descricao", campos.descricao?.trim() || null);
  if (campos.categoria !== undefined) definir("categoria", campos.categoria?.trim() || null);
  if (campos.status !== undefined) definir("status", campos.status);
  if (campos.conhecimento !== undefined) definir("conhecimento", campos.conhecimento ? JSON.stringify(campos.conhecimento) : null);
  if (!partes.length) return atual;

  definir("atualizadoEm", agora());
  valores.push(id);
  banco().prepare(`UPDATE produtos SET ${partes.join(", ")} WHERE id = ?`).run(...valores);
  return obter(id);
}

/** Apaga o produto e os materiais dele. Quem decide se pode apagar (simulação dependente) é a rota. */
export function apagar(id: string): void {
  const d = banco();
  d.prepare("DELETE FROM fontes_produto WHERE produtoId = ?").run(id);
  d.prepare("DELETE FROM produtos WHERE id = ?").run(id);
}

export function adicionarFonte({
  produtoId,
  tipo,
  origem,
  conteudo,
}: {
  produtoId: string;
  tipo: TipoFonte;
  origem: string;
  conteudo: string;
}): FonteProduto {
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare("INSERT INTO fontes_produto (id, produtoId, tipo, origem, conteudo, criadoEm) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, produtoId, tipo, origem, conteudo, criadoEm);
  banco().prepare("UPDATE produtos SET atualizadoEm = ? WHERE id = ?").run(criadoEm, produtoId);
  return { id, produtoId, tipo, origem, conteudo, criadoEm };
}

export function listarFontes(produtoId: string): FonteProduto[] {
  const linhas = banco()
    .prepare("SELECT * FROM fontes_produto WHERE produtoId = ? ORDER BY criadoEm DESC")
    .all(produtoId) as LinhaFonte[];
  return linhas.map(linhaParaFonte);
}

export function removerFonte(id: string): void {
  banco().prepare("DELETE FROM fontes_produto WHERE id = ?").run(id);
}

/** Quantos materiais cada produto tem, para a lista de produtos não fazer uma consulta por cartão. */
export function contarFontes(): Record<string, number> {
  const linhas = banco()
    .prepare("SELECT produtoId, COUNT(*) AS total FROM fontes_produto GROUP BY produtoId")
    .all() as { produtoId: string; total: number }[];
  return Object.fromEntries(linhas.map((l) => [l.produtoId, l.total]));
}
