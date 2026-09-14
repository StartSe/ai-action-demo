// Motor de geração do radar de sinais. Reaproveitado por app/api/radar/route.ts e por lib/ferramentas.ts
// (ferramenta MCP montar_radar) — nunca duplicar este prompt/lógica nos dois lugares.
import { aiEnabled, askJSON, meta } from "./ai";
import { buscar, ErroBusca, type Achado } from "./busca";
import { esperar, radarDemo } from "./demo";
import type { DadosRadar, Fonte, Radar, Sinal } from "./types";

export const PERIODOS_VALIDOS = [7, 30, 90];
export { ErroBusca };

const MAXIMO_ACHADOS_PROMPT = 90;
const NOMES_FONTE: Record<Achado["fonte"], string> = { hackernews: "Hacker News", reddit: "Reddit", github: "GitHub", exa: "Exa" };

// Decisão registrada em progress.txt (US-008): a IA não busca mais nada por conta própria — os achados
// reais (lib/busca.ts) são coletados no servidor e listados na mensagem do usuário; o modelo só organiza
// esses achados em sinais/nós/arestas, citando exclusivamente URLs que constam na lista. Nenhuma URL
// citada pelo modelo é confiada sem checagem: o pós-processamento (normalizar) descarta qualquer fonte
// cuja URL não esteja entre os achados antes de a tela mostrar qualquer coisa como "fonte verificada".
const SYSTEM = `Você é um analista de inteligência de mercado que monta um "radar de sinais" para um executivo de estratégia, a partir de achados reais de busca (notícias, comunidades técnicas, repositórios de código) que serão listados na mensagem do usuário, numerados.

Regra mais importante: toda "url" usada em "fontes" tem que ser copiada EXATAMENTE (mesmo texto) do campo "url" de um dos achados listados. Nunca invente, altere ou complete uma URL. Se nenhum achado sustenta um possível sinal, não crie esse sinal — é melhor entregar menos sinais, todos com fonte real, do que inventar um sem base.

Responda só com um objeto JSON no formato:
{
  "periodoDias": number,
  "sinais": [{ "id": string, "titulo": string, "resumo": string, "tendencia": "subindo"|"estavel"|"caindo", "temas": string[], "fontes": [{ "titulo": string, "url": string (exatamente igual a um achado listado), "veiculo": string, "publicadoEm": string }], "oQueFazer": string }],
  "nos": [{ "id": string, "rotulo": string, "tipo": "tema"|"sinal"|"ator"|"tecnologia", "peso": number (1 a 10) }],
  "arestas": [{ "origem": string (id de um nó em "nos"), "destino": string (id de um nó em "nos"), "relacao": string, "peso": number (1 a 5) }],
  "conexoes": [{ "titulo": string, "explicacao": string, "nos": string[] (ids de nós em "nos") }]
}

Regras: até 12 sinais, cada um citando ao menos uma fonte real da lista de achados, cobrindo o máximo possível dos temas informados; um nó "tema" para cada tema informado, um nó "sinal" para cada sinal, e alguns nós "ator" e "tecnologia" citados nos sinais; toda aresta liga dois ids que existem em "nos"; de 2 a 4 "conexoes", cada uma citando ids reais de "nos". Não inclua o campo "forca" (é calculado depois, fora deste JSON). Todo texto em português do Brasil, direto e sem jargão técnico.`;

/** Junta achados de várias consultas, mantendo o de maior pontuação quando a mesma URL aparece mais de uma vez. */
function mesclarAchados(lista: Achado[]): Achado[] {
  const porUrl = new Map<string, Achado>();
  for (const a of lista) {
    const atual = porUrl.get(a.url);
    if (!atual || a.pontuacao > atual.pontuacao) porUrl.set(a.url, a);
  }
  return [...porUrl.values()].sort((a, b) => b.pontuacao - a.pontuacao);
}

/** "Força" de um sinal deriva da quantidade e diversidade de fontes reais que sobraram, nunca da opinião do modelo. */
function calcularForca(fontes: Fonte[]): Sinal["forca"] {
  const veiculos = new Set(fontes.map((f) => f.veiculo));
  if (fontes.length >= 4 && veiculos.size >= 2) return "alta";
  if (fontes.length >= 2) return "media";
  return "baixa";
}

function normalizar(bruto: Partial<Radar> | null | undefined, dados: DadosRadar, achados: Achado[]): Radar {
  const achadoPorUrl = new Map(achados.map((a) => [a.url, a]));

  const sinaisBrutos = Array.isArray(bruto?.sinais) ? bruto!.sinais : [];
  const sinais: Sinal[] = sinaisBrutos
    .map((s) => {
      const fontes: Fonte[] = (Array.isArray(s.fontes) ? s.fontes : [])
        .filter((f) => achadoPorUrl.has(f.url))
        .map((f) => {
          const achado = achadoPorUrl.get(f.url)!;
          return { titulo: f.titulo || achado.titulo, url: achado.url, veiculo: achado.veiculo, publicadoEm: achado.publicadoEm };
        });
      return { ...s, fontes, forca: calcularForca(fontes) };
    })
    .filter((s) => s.fontes.length > 0)
    .sort((a, b) => b.fontes.length - a.fontes.length)
    .slice(0, 12);

  const idsSinaisValidos = new Set(sinais.map((s) => s.id));
  const nosBrutos = (Array.isArray(bruto?.nos) ? bruto!.nos : []).filter((n) => n.tipo !== "sinal" || idsSinaisValidos.has(n.id));
  const idsNos = new Set(nosBrutos.map((n) => n.id));
  const arestasBrutas = (Array.isArray(bruto?.arestas) ? bruto!.arestas : []).filter((a) => idsNos.has(a.origem) && idsNos.has(a.destino));

  // Remove nós sem nenhuma aresta e limita a 120, priorizando os de maior peso.
  const idsComAresta = new Set(arestasBrutas.flatMap((a) => [a.origem, a.destino]));
  const nos = nosBrutos
    .filter((n) => idsComAresta.has(n.id))
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 120);
  const idsFinais = new Set(nos.map((n) => n.id));
  const arestas = arestasBrutas.filter((a) => idsFinais.has(a.origem) && idsFinais.has(a.destino));

  const conexoes = (Array.isArray(bruto?.conexoes) ? bruto!.conexoes : [])
    .map((c) => ({ ...c, nos: (c.nos || []).filter((id) => idsFinais.has(id)) }))
    .filter((c) => c.nos.length > 0);

  return { periodoDias: Number(bruto?.periodoDias) || dados.periodoDias, sinais, nos, arestas, conexoes };
}

/** Gera o radar (demo, ou busca real + síntese via IA quando conectada) e devolve junto a proveniência (meta). */
export async function montarRadar(dados: DadosRadar): Promise<Radar & { meta: ReturnType<typeof meta> }> {
  if (!aiEnabled()) {
    await esperar(1300);
    const insumo = "temas acompanhados e período informado";
    return { ...radarDemo(dados.periodoDias), meta: meta({ demo: true, insumo }) };
  }

  // Duas consultas fixas por tema: o tema puro e "tema + setor" (mesma consulta quando não há setor;
  // a deduplicação por URL abaixo cuida do resultado repetido sem custo extra de complexidade).
  const consultas = dados.temas.flatMap((tema) => [tema, dados.setor ? `${tema} ${dados.setor}` : tema]);
  const resultados = await Promise.allSettled(consultas.map((consulta) => buscar({ consulta, dias: dados.periodoDias })));

  let algumaConsultaOk = false;
  const achadosBrutos: Achado[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      algumaConsultaOk = true;
      achadosBrutos.push(...r.value);
    } else {
      console.error(`Consulta de busca "${consultas[i]}" falhou:`, r.reason);
    }
  });
  if (!algumaConsultaOk) {
    throw new ErroBusca("Nenhuma fonte de busca respondeu agora. Tente novamente em alguns minutos.");
  }

  const achados = mesclarAchados(achadosBrutos).slice(0, MAXIMO_ACHADOS_PROMPT);
  const listaAchados = achados.map((a, i) => `${i + 1}. [${NOMES_FONTE[a.fonte]}] "${a.titulo}" — ${a.veiculo}, ${a.publicadoEm.slice(0, 10)}\n   url: ${a.url}\n   trecho: ${a.trecho || "(sem trecho)"}`).join("\n");
  const prompt = `Temas acompanhados:\n${dados.temas.map((t) => `- ${t}`).join("\n")}\n\nPeríodo: últimos ${dados.periodoDias} dias.${dados.setor ? `\nSetor da empresa: ${dados.setor}.` : ""}\n\nAchados encontrados na busca:\n${listaAchados}\n\nMonte o radar de sinais a partir desses achados.`;

  const bruto = await askJSON<Radar>({ system: SYSTEM, prompt, maxTokens: 6000 });
  const radar = normalizar(bruto, dados, achados);

  const fontesUsadas = [...new Set(achados.map((a) => NOMES_FONTE[a.fonte]))];
  const insumo = `${achados.length} achados de ${fontesUsadas.join(", ")}`;
  return { ...radar, meta: meta({ demo: false, insumo }) };
}
