import { buscarPessoasAvancada } from "./busca-avancada-pessoas";
import { buscarNaWeb, combinarResultados, descobertaAtiva, type RespostaBusca } from "./descoberta";
import { buscarProspectHalo, prospectHaloAtivo, type CriteriosProspectHalo } from "./prospecthalo";

/** Contatos estruturados complementados por dataset e todas as buscas web conectadas. */
export async function pesquisarPessoas(c: CriteriosProspectHalo, prospeccaoId: string): Promise<RespostaBusca> {
  const consulta = ["site:linkedin.com/in", c.cargo, c.empresa && `"${c.empresa}"`, c.segmento, c.localizacao].filter(Boolean).join(" ");
  const tarefas: Promise<RespostaBusca>[] = [];
  if (prospectHaloAtivo()) tarefas.push(buscarProspectHalo(c, prospeccaoId).then(leads => ({
    itens: leads.map(p => ({ titulo: [p.nome, p.cargo, p.empresa].filter(Boolean).join(" - "), url: p.linkedin,
      resumo: [p.cargo, p.empresa, p.setor, p.porte, p.cidade, p.sinal].filter(Boolean).join(". "), fontes: ["prospecthalo"], pessoa: p })),
    origem: "ProspectHalo", consultadoEm: new Date().toISOString(), demo: false,
  })));
  if (descobertaAtiva()) tarefas.push(buscarPessoasAvancada(consulta, { cargo: c.cargo, empresa: c.empresa, setor: c.segmento, localizacao: c.localizacao }, prospeccaoId));
  if (!tarefas.length) return buscarNaWeb(consulta, 0, prospeccaoId);
  const respostas = await Promise.allSettled(tarefas);
  const validas = respostas.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
  if (!validas.length) throw (respostas[0] as PromiseRejectedResult).reason;
  return { itens: combinarResultados(validas.map(r => r.itens)), origem: validas.map(r => r.origem).join(" · "), consultadoEm: new Date().toISOString(), demo: false };
}
