// Interpretação da frase livre "O que você quer encontrar?" (US-038, components/BuscaLivre.tsx): o
// texto vira modo + critérios já preenchidos, usando o produto e o ICP escolhidos como contexto. Só é
// chamada com a IA conectada (a tela barra antes, ver BuscaLivre.tsx) — mesmo assim, uma resposta que
// não permite identificar um modo cai em `modo: null`, para a tela levar ao assistente com o que já se
// sabe (produto/ICP) em vez de um erro seco.
//
// `baseCriterios` duplica pouco de `components/CriteriosProspeccao.tsx:criteriosIniciais` de propósito:
// aquele arquivo é "use client" e este é server-only (importa lib/ai.ts → lib/store.ts → node:sqlite).
import { askJSON } from "./ai";
import type { CriteriosBusca } from "@/components/CriteriosProspeccao";
import type { ICP, Jornada, ModoProspeccao, Produto } from "./types";

const MODOS_POR_JORNADA: Record<Jornada, ModoProspeccao[]> = {
  b2b: ["empresas", "pessoas", "empresa_unica", "oportunidades"],
  b2c: ["pessoas", "oportunidades"],
};

function baseCriterios(icp: ICP, modo: ModoProspeccao, jornada: Jornada): CriteriosBusca {
  const c = icp.criterios;
  return {
    segmento: c.setor ?? "",
    localizacao: c.localizacao ?? "",
    porte: c.porte ?? "",
    cargo: icp.personas[0] ?? "",
    empresaNome: "",
    ocupacao: c.ocupacao ?? "",
    interesses: c.interesses ?? [],
    contexto: c.contexto ?? "",
    recorte: jornada === "b2b" ? (c.setor ?? "") : (c.localizacao ?? ""),
    sinais: [...icp.sinais],
    somenteRecentes: modo === "oportunidades",
    quantidade: "10",
  };
}

type CamposIA = Partial<Pick<CriteriosBusca, "segmento" | "localizacao" | "porte" | "cargo" | "empresaNome" | "ocupacao" | "contexto" | "recorte">>;
type RespostaIA = { modo: ModoProspeccao | "nenhum"; campos: CamposIA };

const SYSTEM = `Você lê o que um vendedor digitou no campo "O que você quer encontrar?" de uma ferramenta de prospecção e devolve o tipo de busca e os critérios que ele quis dizer.
Modos possíveis: "empresas" (achar empresas que combinam com o perfil ideal), "pessoas" (achar as pessoas certas), "empresa_unica" (explorar UMA empresa específica que o texto nomeia) e "oportunidades" (achar quem tem um sinal recente de que é hora de comprar).
Regras:
- Escolha "empresa_unica" só quando o texto citar o NOME de uma empresa específica a explorar (o nome vai no campo "empresaNome"); sem nome de empresa nenhum, nunca escolha "empresa_unica".
- Preencha só os campos que o texto realmente permite inferir; deixe os outros de fora do JSON (o app já tem valores padrão vindos do perfil ideal de cliente).
- Se o texto não permitir identificar nenhum modo de busca, devolva "modo": "nenhum".
- Nunca invente nome de empresa, cargo ou local que não esteja no texto.
Formato de saída (JSON): { "modo": "empresas" | "pessoas" | "empresa_unica" | "oportunidades" | "nenhum", "campos": { "segmento": "", "localizacao": "", "porte": "", "cargo": "", "empresaNome": "", "ocupacao": "", "contexto": "", "recorte": "" } } — omita do objeto "campos" o que não achou.`;

function fraseModo(modo: ModoProspeccao, criterios: CriteriosBusca, jornada: Jornada): string {
  switch (modo) {
    case "empresas":
      return `empresas${criterios.segmento ? ` de ${criterios.segmento}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`;
    case "pessoas":
      return jornada === "b2b"
        ? `pessoas${criterios.cargo ? ` no cargo de ${criterios.cargo}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`
        : `pessoas${criterios.ocupacao ? ` que atuam como ${criterios.ocupacao}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`;
    case "empresa_unica":
      return `a empresa ${criterios.empresaNome}`;
    case "oportunidades":
      return `oportunidades${criterios.recorte ? ` em ${criterios.recorte}` : ""}`;
  }
}

/** Sempre devolve critérios completos e válidos (nunca lança por falta de dado interpretável): `modo:
 * null` é a única forma de dizer "não entendi", e `resumo: null` com `modo` preenchido é "entendi o
 * tipo de busca, mas falta um dado que só a pessoa sabe" (hoje só ocorre no nome da empresa, em
 * "empresa_unica") — os dois casos levam a tela ao assistente em vez de mostrar um erro. */
export async function interpretarBusca(
  texto: string,
  produto: Produto,
  icp: ICP
): Promise<{ modo: ModoProspeccao | null; criterios: CriteriosBusca; resumo: string | null }> {
  const modosValidos = MODOS_POR_JORNADA[icp.jornada];
  const prompt = `Produto vendido: ${produto.nome} — ${produto.propostaValor}\nPerfil ideal de cliente: ${icp.nome} (${icp.jornada === "b2b" ? "empresas" : "pessoas físicas"})\nModos de busca disponíveis para este perfil: ${modosValidos.join(", ")}\n\nTexto do vendedor:\n"""\n${texto.trim()}\n"""`;

  const bruta = await askJSON<Partial<RespostaIA>>({ system: SYSTEM, prompt, maxTokens: 500 });
  const modoBruto = bruta.modo;
  const modo = modoBruto && modoBruto !== "nenhum" && modosValidos.includes(modoBruto as ModoProspeccao) ? (modoBruto as ModoProspeccao) : null;
  if (!modo) return { modo: null, criterios: baseCriterios(icp, modosValidos[0], icp.jornada), resumo: null };

  const campos = bruta.campos ?? {};
  const criterios: CriteriosBusca = { ...baseCriterios(icp, modo, icp.jornada), ...campos };
  if (modo === "empresa_unica" && !criterios.empresaNome.trim()) {
    return { modo, criterios, resumo: null };
  }
  return { modo, criterios, resumo: `Vou procurar ${fraseModo(modo, criterios, icp.jornada)}, usando o perfil ${icp.nome}.` };
}
