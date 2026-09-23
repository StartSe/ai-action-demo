// Coleta de preço de concorrente por link público (/f/<código>).
//
// O dono raramente é quem anda pela rua vendo a vitrine do concorrente: quem vê é alguém do time,
// que não tem conta no app. Um link de uma pergunta resolve isso sem criar usuário nem permissão.
import { criar, registrarCallback, type CampoFormulario } from "./formularios";
import { atualizarItem, obterItem } from "./itens";

export const TIPO_COLETA = "preco-concorrente";

type Parametros = { marca: string; nome: string; titulo: string; descricao?: string; agradecimento?: string; itemId: string };

const CAMPOS: CampoFormulario[] = [
  // `CampoFormulario` (infraestrutura da suíte) não tem campo de ajuda: a instrução entra no rótulo.
  { chave: "concorrente", rotulo: "Onde você viu (nome da loja ou do site)", tipo: "texto", obrigatorio: true },
  { chave: "preco", rotulo: "Preço cobrado (só o número, com vírgula nos centavos)", tipo: "texto", obrigatorio: true },
];

/** Cria um link de coleta para um item. Cada link aceita uma resposta e vale quinze dias. */
export function criarColeta(itemId: string, nomeItem: string): string {
  const parametros: Parametros = {
    marca: "P",
    nome: "Precificador",
    titulo: `Quanto o concorrente cobra por "${nomeItem}"?`,
    descricao: "Duas perguntas. A resposta entra direto na faixa de mercado deste item.",
    agradecimento: "Pronto, o preço entrou na faixa de mercado.",
    itemId,
  };
  return criar({ tipo: TIPO_COLETA, campos: CAMPOS, parametros, expiraEmDias: 15, limite: 1 });
}

/** "12,90", "R$ 12,90" e "12.90" viram 12,9. Devolve null quando não dá para ler um número. */
export function lerPreco(bruto: string): number | null {
  const limpo = String(bruto || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

registrarCallback(TIPO_COLETA, async ({ dados, parametros }) => {
  const { itemId } = (parametros ?? {}) as Partial<Parametros>;
  if (!itemId) return {};
  const item = obterItem(itemId);
  if (!item) return {};
  const preco = lerPreco(dados.preco);
  if (preco === null) {
    console.error("Preço de concorrente não pôde ser lido:", dados.preco);
    return {};
  }
  atualizarItem(itemId, { precosConcorrentes: [...item.precosConcorrentes, preco] });
  return {};
});
