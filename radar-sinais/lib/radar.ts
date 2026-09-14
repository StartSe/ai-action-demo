// Motor de geração do radar de sinais. Reaproveitado por app/api/radar/route.ts e por lib/ferramentas.ts
// (ferramenta MCP montar_radar) — nunca duplicar este prompt/lógica nos dois lugares.
import { aiEnabled, askJSON, meta } from "./ai";
import { esperar, radarDemo } from "./demo";
import type { DadosRadar, Radar } from "./types";

export const PERIODOS_VALIDOS = [7, 30, 90];

// Decisão registrada em progress.txt (US-005): o motor de busca real (Exa/Tavily/Hacker News/Reddit/
// GitHub) e o agente de pesquisa em várias rodadas chegam nas histórias seguintes (US-007/US-008 do
// prd.json). Até lá, com IA conectada, o radar é gerado em "melhor esforço" só com askJSON — o prompt
// deixa isso explícito para o modelo não fingir ter lido uma fonte real, evitando over-promising na tela.
const SYSTEM = `Você é um analista de inteligência de mercado que monta um "radar de sinais" para um executivo de estratégia.

Importante: esta é uma versão preliminar do produto. Você ainda NÃO tem acesso a uma busca real em fontes externas (notícias, comunidades técnicas etc.) — isso chega numa próxima versão. Monte o radar com o seu conhecimento geral sobre os temas informados, deixando claro que são hipóteses plausíveis de movimento de mercado, não fatos confirmados por uma fonte específica de hoje. Nunca invente uma URL real de notícia: em "fontes", use "url": "" (string vazia) e um "veiculo" plausível descrevendo o TIPO de fonte (ex.: "Imprensa de negócios", "Comunidade técnica", "Órgão regulador"), nunca o nome de um veículo real com uma matéria que você não pode garantir que existe.

Responda só com um objeto JSON no formato:
{
  "periodoDias": number,
  "sinais": [{ "id": string, "titulo": string, "resumo": string, "forca": "alta"|"media"|"baixa", "tendencia": "subindo"|"estavel"|"caindo", "temas": string[], "fontes": [{ "titulo": string, "url": "", "veiculo": string, "publicadoEm": string (data ISO dentro do período pedido) }], "oQueFazer": string }],
  "nos": [{ "id": string, "rotulo": string, "tipo": "tema"|"sinal"|"ator"|"tecnologia", "peso": number (1 a 10) }],
  "arestas": [{ "origem": string (id de um nó em "nos"), "destino": string (id de um nó em "nos"), "relacao": string, "peso": number (1 a 5) }],
  "conexoes": [{ "titulo": string, "explicacao": string, "nos": string[] (ids de nós em "nos") }]
}

Regras: entre 8 e 12 sinais no total, cobrindo todos os temas informados; um nó "tema" para cada tema informado, um nó "sinal" para cada sinal, e alguns nós "ator" e "tecnologia" citados nos sinais (total entre 20 e 40 nós); toda aresta liga dois ids que existem em "nos"; de 2 a 4 "conexoes", cada uma citando ids reais de "nos". Todo texto em português do Brasil, direto e sem jargão técnico.`;

function normalizar(bruto: Partial<Radar> | null | undefined, periodoDias: number): Radar {
  const sinais = Array.isArray(bruto?.sinais) ? bruto!.sinais : [];
  const nosBrutos = Array.isArray(bruto?.nos) ? bruto!.nos : [];
  const idsValidos = new Set(nosBrutos.map((n) => n.id));
  const arestas = (Array.isArray(bruto?.arestas) ? bruto!.arestas : []).filter((a) => idsValidos.has(a.origem) && idsValidos.has(a.destino));
  const conexoes = (Array.isArray(bruto?.conexoes) ? bruto!.conexoes : []).map((c) => ({ ...c, nos: (c.nos || []).filter((id) => idsValidos.has(id)) })).filter((c) => c.nos.length > 0);
  return { periodoDias: Number(bruto?.periodoDias) || periodoDias, sinais, nos: nosBrutos, arestas, conexoes };
}

/** Gera o radar (demo, ou "melhor esforço" via IA quando conectada) e devolve junto a proveniência (meta). */
export async function montarRadar(dados: DadosRadar): Promise<Radar & { meta: ReturnType<typeof meta> }> {
  const insumo = "temas acompanhados e período informado";

  if (!aiEnabled()) {
    await esperar(1300);
    return { ...radarDemo(dados.periodoDias), meta: meta({ demo: true, insumo }) };
  }

  const prompt = `Temas acompanhados:\n${dados.temas.map((t) => `- ${t}`).join("\n")}\n\nPeríodo: últimos ${dados.periodoDias} dias.${dados.setor ? `\nSetor da empresa: ${dados.setor}.` : ""}\n\nMonte o radar de sinais para esses temas.`;
  const bruto = await askJSON<Radar>({ system: SYSTEM, prompt, maxTokens: 6000 });
  const radar = normalizar(bruto, dados.periodoDias);
  return { ...radar, meta: meta({ demo: false, insumo }) };
}
