import { meta } from "./ai";
import { leadsDemo } from "./demo";
import { descobertaAtiva } from "./descoberta";
import { prospectHaloAtivo } from "./prospecthalo";
import { randomUUID } from "node:crypto";
import { pesquisarPessoas } from "./pesquisa-pessoas";
import { apagarConsultas, consultasDaProspeccao } from "./pesquisa-registro";
import type { DadosBusca, Lead, ResultadoBusca } from "./types";

export const QUANTIDADES_VALIDAS = [5, 10, 15];
export async function buscarLeads(dados: DadosBusca): Promise<ResultadoBusca & { meta: ReturnType<typeof meta> }> {
  const quantidade = Math.max(1, Math.min(30, Number(dados.quantidade) || 10));
  const insumo = "segmento, cargo-alvo e localização informados";
  if (prospectHaloAtivo() || descobertaAtiva()) {
    const consultaId = `busca:${randomUUID()}`;
    try {
      const busca = await pesquisarPessoas({ ...dados, quantidade }, consultaId);
      const leads: Lead[] = busca.itens.slice(0, quantidade).map(item => {
        const [nome = "", cargo = "", empresa = ""] = item.titulo.split("|")[0].split(/\s[-–]\s/);
        return { id: item.url, nome, cargo, empresa, setor: "", porte: "", cidade: "", linkedin: item.url, site: "", sinal: item.resumo, ...item.pessoa };
      });
      const avisos = [...new Set(consultasDaProspeccao(consultaId).filter(c => ["falhou", "limite", "pendente"].includes(c.estado)).map(c => c.mensagem).filter((m): m is string => Boolean(m)))];
      return { fonte: prospectHaloAtivo() ? "prospecthalo" : "pesquisa", leads, avisos, meta: meta({ demo: false, insumo }) };
    } finally { apagarConsultas(consultaId); }
  }
  return { fonte: "demo", leads: leadsDemo({ ...dados, quantidade }), meta: meta({ demo: true, insumo }) };
}
