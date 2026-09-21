import { buscarPessoasAvancada } from "./busca-avancada-pessoas";
import { brightDataAtiva, listarAcoesBrightData, resultadosOrganicos } from "./brightdata";
import { buscarNaWeb, descobertaAtiva, executarAcaoPesquisa, type RespostaBusca, type ResultadoBuscaWeb } from "./descoberta";
import { fontesOpcionais, FONTES } from "./pesquisa-fontes";
import { buscarProspectHalo, prospectHaloAtivo, type CriteriosProspectHalo } from "./prospecthalo";
import { pesquisarEmRodadas, refinarPlano, type RotaPesquisa } from "./pesquisa-adaptativa";
import { completarPerfis } from "./pesquisa-perfis";
import { obterProspeccao } from "./workspace";
import { registrarCandidatosParciais } from "./pesquisa-parciais";

/** Agente de busca: descoberta em rodadas, replanejamento por lacunas e verificação limitada de perfis. */
export async function pesquisarPessoas(c: CriteriosProspectHalo, prospeccaoId: string): Promise<RespostaBusca> {
  const consulta = (alternativo?: string) => ["site:linkedin.com/in", alternativo ? `(${c.cargo || ""} OR ${alternativo})` : c.cargo, c.empresa && `"${c.empresa}"`, c.segmento, c.localizacao].filter(Boolean).join(" ");
  if (!descobertaAtiva() && !prospectHaloAtivo()) return buscarNaWeb(consulta(), 0, prospeccaoId);
  const vinculada = !!obterProspeccao(prospeccaoId);
  const cancelada = () => vinculada && obterProspeccao(prospeccaoId)?.estado !== "executando";
  const rotas: RotaPesquisa[] = [];
  let acoes: Awaited<ReturnType<typeof listarAcoesBrightData>> = [];
  if (brightDataAtiva()) {
    try { acoes = await listarAcoesBrightData(); } catch { /* As demais fontes continuam disponíveis. */ }
  }
  if (prospectHaloAtivo()) rotas.push({ id: "prospecthalo", nome: "ProspectHalo", executar: async () => (await buscarProspectHalo(c, prospeccaoId)).map(p => ({
    titulo: [p.nome, p.cargo, p.empresa].filter(Boolean).join(" - "), url: p.linkedin,
    resumo: [p.cargo, p.empresa, p.setor, p.porte, p.cidade, p.sinal].filter(Boolean).join(". "), fontes: ["prospecthalo"], pessoa: p,
  })) });
  if (acoes.some(a => a.nome === "search_dataset") && acoes.some(a => a.nome === "list_dataset_fields")) rotas.push({
    id: "brightdata_dataset", nome: "Bright Data · base de perfis", executar: async () => (await buscarPessoasAvancada(consulta(), { cargo: c.cargo, empresa: c.empresa, setor: c.segmento, localizacao: c.localizacao }, prospeccaoId, true)).itens,
  });
  for (const fonte of fontesOpcionais()) rotas.push({ id: fonte, nome: FONTES[fonte], executar: async alternativo => {
    const itens = await executarAcaoPesquisa(`${fonte}_search`, { consulta: consulta(alternativo), categoria: "people" }, prospeccaoId) as ResultadoBuscaWeb[];
    return itens.map(i => ({ ...i, fontes: [fonte] }));
  } });
  if (brightDataAtiva()) rotas.splice(Math.min(2, rotas.length), 0, { id: "brightdata_web", nome: "Bright Data · busca web", executar: async alternativo => resultadosOrganicos(await executarAcaoPesquisa("search_engine", { query: consulta(alternativo), engine: "google" }, prospeccaoId)).map(i => ({ ...i, fontes: ["brightdata"] })) });
  const alvo = Math.max(1, Math.min(25, c.quantidade ?? 10));
  const itens = await pesquisarEmRodadas({ rotas, alvo, cargo: c.cargo, empresa: c.empresa, prospeccaoId, interrompida: cancelada,
    aoEncontrar: encontrados => { if (vinculada) registrarCandidatosParciais(prospeccaoId, encontrados); },
    refinar: (restantes, encontrados) => refinarPlano({ ...c }, restantes, encontrados),
  });
  if (!cancelada()) await completarPerfis(itens.slice(0, alvo), prospeccaoId, acoes, cancelada,
    (item, fase) => { if (vinculada) registrarCandidatosParciais(prospeccaoId, [item], fase); });
  return { itens, origem: [...new Set(itens.flatMap(i => i.fontes ?? []))].join(" · "), consultadoEm: new Date().toISOString(), demo: false };
}
