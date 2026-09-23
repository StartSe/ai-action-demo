import { buscarPessoasAvancada } from "./busca-avancada-pessoas";
import { brightDataAtiva, listarAcoesBrightData, resultadosOrganicos } from "./brightdata";
import { buscarNaWeb, descobertaAtiva, executarAcaoPesquisa, type RespostaBusca, type ResultadoBuscaWeb } from "./descoberta";
import { fontesOpcionais, FONTES } from "./pesquisa-fontes";
import { buscarProspectHalo, prospectHaloAtivo, type CriteriosProspectHalo } from "./prospecthalo";
import { pesquisarEmRodadas, refinarPlano, type RotaPesquisa } from "./pesquisa-adaptativa";
import { completarPerfis } from "./pesquisa-perfis";
import { obterProspeccao } from "./workspace";
import { registrarCandidatosParciais, retirarCandidatoParcial } from "./pesquisa-parciais";
import { registrarDecisao } from "./pesquisa-registro";
import { consultaPessoas } from "./consulta-pessoas";
import { avaliarVinculoEmpresa, ordenarParaEmpresa, preencherCabecalhoConfirmado } from "./vinculo-empresa";

/** Agente de busca: descoberta em rodadas, replanejamento por lacunas e verificação limitada de perfis. */
export async function pesquisarPessoas(c: CriteriosProspectHalo, prospeccaoId: string): Promise<RespostaBusca> {
  const consulta = (alternativo?: string) => consultaPessoas(c, "web", alternativo);
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
    preferencial: true, id: "brightdata_dataset", nome: "Bright Data · base de perfis", executar: async () => (await buscarPessoasAvancada(consulta(), { cargo: c.cargo, empresa: c.empresa, setor: c.segmento, localizacao: c.localizacao }, prospeccaoId, true)).itens,
  });
  for (const fonte of fontesOpcionais()) rotas.push({ id: fonte, nome: FONTES[fonte], executar: async alternativo => {
    const itens = await executarAcaoPesquisa(`${fonte}_search`, { consulta: fonte === "exa" ? consultaPessoas(c, "semantica", alternativo) : consulta(alternativo), categoria: "people" }, prospeccaoId) as ResultadoBuscaWeb[];
    return itens.map(i => ({ ...i, fontes: [fonte] }));
  } });
  if (brightDataAtiva()) rotas.splice(Math.min(2, rotas.length), 0, { preferencial: true, id: "brightdata_web", nome: "Bright Data · busca web", executar: async alternativo => resultadosOrganicos(await executarAcaoPesquisa("search_engine", { query: consulta(alternativo), engine: "google" }, prospeccaoId)).map(i => ({ ...i, fontes: ["brightdata"] })) });
  // A busca geral indexada complementa o índice people, mantendo a empresa obrigatória.
  if (c.empresa && fontesOpcionais().includes("exa")) rotas.unshift({ id: "exa_web", nome: "Exa · perfis da empresa na web", executar: async () =>
    (await executarAcaoPesquisa("exa_search", { consulta: consulta() }, prospeccaoId) as ResultadoBuscaWeb[]).map(i => ({ ...i, fontes: ["exa"] })),
  });
  if (c.empresa) {
    const fonte = brightDataAtiva() ? "brightdata" : fontesOpcionais().find(f => f === "searchapi") || fontesOpcionais()[0];
    if (fonte) rotas.push({ preferencial: fonte === "brightdata", id: "empresa_sem_cargo", nome: "Pesquisa pelo vínculo com a empresa", executar: async () => {
      const query = consultaPessoas(c, "web", undefined, true);
      const itens = fonte === "brightdata" ? resultadosOrganicos(await executarAcaoPesquisa("search_engine", { query, engine: "google" }, prospeccaoId))
        : await executarAcaoPesquisa(`${fonte}_search`, { consulta: query }, prospeccaoId) as ResultadoBuscaWeb[];
      return itens.map(i => ({ ...i, fontes: [fonte] }));
    } });
  }
  const alvo = Math.max(1, Math.min(25, c.quantidade ?? 10));
  const publicar = (encontrados: ResultadoBuscaWeb[]) => {
    if (!vinculada || cancelada()) return;
    registrarCandidatosParciais(prospeccaoId, c.empresa ? ordenarParaEmpresa(encontrados, c.empresa) : encontrados);
  };
  const atualizar = (item: ResultadoBuscaWeb, fase: "verificando" | "analisando") => {
    if (!vinculada || cancelada()) return;
    if (c.empresa && avaliarVinculoEmpresa(item, c.empresa).estado === "divergente") retirarCandidatoParcial(prospeccaoId, item.url);
    else registrarCandidatosParciais(prospeccaoId, [item], fase);
  };
  let verificados = 0;
  const tentados = new Set<string>();
  const inicio = Date.now();
  const verificarEmpresa = async (encontrados: ResultadoBuscaWeb[]) => {
    const candidatos = ordenarParaEmpresa(encontrados, c.empresa!);
    for (const item of candidatos) preencherCabecalhoConfirmado(item, c.empresa!);
    const restantes = candidatos.filter(i => !i.perfilPesquisado && !tentados.has(i.url));
    while (restantes.length && verificados < Math.min(25, alvo * 3) && Date.now() - inicio < 300000 && !cancelada()) {
      const confirmados = candidatos.filter(i => (i.perfilPesquisado || tentados.has(i.url)) && avaliarVinculoEmpresa(i, c.empresa!).estado === "confirmado").length;
      if (confirmados >= alvo) break;
      const lote = restantes.splice(0, Math.min(2, alvo - confirmados));
      for (const item of lote) tentados.add(item.url);
      verificados += lote.length;
      await completarPerfis(lote, prospeccaoId, acoes, cancelada, atualizar);
    }
    const pertinentes = candidatos.filter(i => avaliarVinculoEmpresa(i, c.empresa!).estado !== "divergente");
    registrarDecisao(prospeccaoId, `${pertinentes.filter(i => avaliarVinculoEmpresa(i, c.empresa!).estado === "confirmado").length} perfis com vínculo confirmado com ${c.empresa}. Perfis de outras empresas não entram na lista.`);
    return pertinentes;
  };
  const itens = await pesquisarEmRodadas({ rotas, alvo, cargo: c.cargo, empresa: c.empresa, prospeccaoId, interrompida: cancelada,
    aoEncontrar: publicar,
    prepararCandidatos: c.empresa ? verificarEmpresa : async encontrados => {
      await completarPerfis(encontrados.slice(0, alvo), prospeccaoId, acoes, cancelada, atualizar);
      return encontrados;
    },
    refinar: (restantes, encontrados) => refinarPlano({ ...c }, restantes, encontrados),
  });
  const selecionados = c.empresa ? itens.filter(i => avaliarVinculoEmpresa(i, c.empresa!).estado === "confirmado").slice(0, alvo) : itens;
  for (const item of selecionados) {
    if (c.empresa) preencherCabecalhoConfirmado(item, c.empresa);
  }
  return { itens: selecionados, origem: [...new Set(selecionados.flatMap(i => i.fontes ?? []))].join(" · "), consultadoEm: new Date().toISOString(), demo: false };
}
