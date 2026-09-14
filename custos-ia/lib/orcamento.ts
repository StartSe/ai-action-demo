// Orçamento planejado (mensal), cadastrado uma vez no painel principal ("Orçamento planejado", em
// Mais detalhes) e usado para marcar, em cada leitura, o que estourou. Guardado como um único JSON
// em lib/store.ts (mesmo padrão de financas-ia/lib/orcamento.ts), não uma tabela: é uma lista curta,
// editada por completo a cada "Salvar orçamento".
import { getConfig, setConfig } from "./store";
import type { Orcamento } from "./types";

const CHAVE = "ORCAMENTO_PLANEJADO";

export function listar(): Orcamento[] {
  const bruto = getConfig(CHAVE);
  if (!bruto) return [];
  try {
    const salvo = JSON.parse(bruto) as Orcamento[];
    return Array.isArray(salvo) ? salvo : [];
  } catch (err) {
    console.error("Falha ao ler o orçamento planejado", err);
    return [];
  }
}

/** Substitui a lista inteira do orçamento planejado (a tela edita linha a linha e salva tudo de uma vez). */
export function definir(itens: Orcamento[]): Orcamento[] {
  const validos = itens.filter((i) => i.item.trim()).map((i) => ({ item: i.item.trim(), valorMensalBRL: Number(i.valorMensalBRL) || 0 }));
  setConfig(CHAVE, JSON.stringify(validos));
  return validos;
}

/** Define (ou substitui) o valor mensal de um único item, mantendo os demais — usado pela ferramenta MCP
 * definir_orcamento, que fala de um item por vez. Valor 0 remove o item. */
export function definirItem(item: string, valorMensalBRL: number): Orcamento[] {
  const nome = item.trim();
  const valor = Math.max(Number(valorMensalBRL) || 0, 0);
  const restantes = listar().filter((i) => i.item.trim().toLowerCase() !== nome.toLowerCase());
  return definir(valor > 0 ? [...restantes, { item: nome, valorMensalBRL: valor }] : restantes);
}

export function apagar(): void {
  setConfig(CHAVE, null);
}

/** Valor mensal planejado para um item (comparação sem diferenciar maiúsculas/espaços), ou undefined se não houver. */
export function orcamentoDoItem(itens: Orcamento[], nome: string): number | undefined {
  const alvo = nome.trim().toLowerCase();
  return itens.find((i) => i.item.trim().toLowerCase() === alvo)?.valorMensalBRL;
}

/** Soma de todos os itens planejados, em BRL/mês. */
export function totalMensal(itens: Orcamento[]): number {
  return itens.reduce((s, i) => s + i.valorMensalBRL, 0);
}
